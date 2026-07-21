// Web yardımcıları: flash mesajları, CSRF, hız limiti, dosya yükleme, yetki middleware'leri.
const crypto = require("crypto");
const multer = require("multer");
const S = require("./sabitler");
const C = require("./cekirdek");

// Async rota sarıcı: reddedilen promise'i Express hata zincirine iletir
// (Express 4 async hataları kendiliğinden yakalamaz).
function sar(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// --- Yetki alanları: ek yöneticilere ayrı ayrı verilebilen yetkiler ---
// Ana yönetici (config şifresiyle giren) her zaman tüm yetkilere sahiptir.
const YETKILER = [
  { k: "degerlendirme", ad: "Değerlendirme & Puanlama",
    aciklama: "Öneri/kaizen onay · red · revize ve ★ puanlama" },
  { k: "bes_s", ad: "5S Yönetimi",
    aciklama: "Bölüm/plan oluşturma, denetmen-misafir yönetimi, ödülleri işleme, denetim silme, 5S raporları" },
  { k: "odul", ad: "Ödül Verme",
    aciklama: "Puan listesinden ödül verme, kişi gizleme, ödül kaydı silme, puan raporları" },
  { k: "kayit", ad: "Kayıt Düzenle-Sil & Raporlar",
    aciklama: "Öneri/kaizen düzenleme-silme ve Excel indirme" },
];
const TUM_YETKILER = YETKILER.map((y) => y.k);

// --- Flash (oturumda taşınır, bir kez gösterilir) ---
function flash(req, kategori, mesaj) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push([kategori, mesaj]);
}

// --- IP hız limiti (bellek içi kayan pencere) ---
const _hizGecmisi = new Map(); // "kova|ip" -> [zaman...]
function hizLimitAsildi(req, kova, limit, pencereSn) {
  const anahtar = `${kova}|${req.ip || "?"}`;
  const simdi = Date.now() / 1000;
  const eski = (_hizGecmisi.get(anahtar) || []).filter((t) => simdi - t < pencereSn);
  if (eski.length >= limit) { _hizGecmisi.set(anahtar, eski); return true; }
  eski.push(simdi);
  _hizGecmisi.set(anahtar, eski);
  return false;
}
// Saatte bir süresi dolmuş hız-limit girdilerini süpür (bellek büyümesini önler)
setInterval(() => {
  const simdi = Date.now() / 1000;
  for (const [k, zamanlar] of _hizGecmisi) {
    const kalan = zamanlar.filter((t) => simdi - t < 600);
    if (kalan.length) _hizGecmisi.set(k, kalan);
    else _hizGecmisi.delete(k);
  }
}, 3600 * 1000).unref();

// --- Form alanı oku + kırp + uzunluk sınırı ---
function alan(req, ad) {
  return String((req.body || {})[ad] || "").trim().slice(0, S.ALAN_MAX);
}

// --- Ortak locals + flash tüketimi + CSRF üretimi + yetki hesaplama ---
const ortakLocals = sar(async (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(16).toString("hex");
  const d = await C.aktifDenetmen(req.session);

  // Yetki durumu: ana yönetici (super) tüm yetkilere sahiptir; ek yönetici kendi
  // yetki listesine. Yetkiler her istekte veritabanından TAZE okunur → silme/güncelleme
  // anında etkilidir. Silinmiş ek yönetici hesabı aktifYonetici içinde düşürülür.
  let superAdmin = false;
  let yetkiler = [];
  let yoneticiAdi = null;
  if (req.session.admin) {
    if (req.session.super) {
      superAdmin = true;
      yetkiler = TUM_YETKILER;
    } else {
      const y = await C.aktifYonetici(req.session);
      if (y) { yetkiler = y.yetkiler || []; yoneticiAdi = y.ad; }
    }
  }
  req.superAdmin = superAdmin;
  req.yetkiler = yetkiler;

  res.locals.session = req.session;
  res.locals.admin = Boolean(req.session.admin);
  res.locals.super_admin = superAdmin;
  res.locals.yetkiler = yetkiler;
  res.locals.yetki = (alan) => superAdmin || yetkiler.includes(alan);
  res.locals.yonetici_adi = yoneticiAdi;
  res.locals.denetmen_adi = d ? d.ad : null;
  res.locals.csrf_token = req.session.csrf;
  res.locals.marka_adi = S.MARKA_ADI;
  res.locals.marka_logo = C.logoBul();
  res.locals.trdate = C.trdate;
  res.locals.puanfmt = C.puanfmt;
  res.locals.mesajlar = req.session.flash || [];
  delete req.session.flash;
  next();
});

// --- CSRF doğrulama ---
function csrfKontrol(req, res, next) {
  const token = (req.body || {}).csrf_token;
  if (!token || token !== req.session.csrf) {
    return res.status(400).send("CSRF doğrulaması başarısız — sayfayı yenileyip tekrar deneyin.");
  }
  next();
}

// Dosya (multipart) kabul eden uçlar — yalnızca bunlara multer bağlanır.
const DOSYA_YOLLARI = [
  /^\/kaizen\/yeni$/,
  /^\/kaizen\/duzenle$/,
  /^\/5s\/bolum\/[^/]+\/denetim$/,
  /^\/5s\/aksiyon\/[^/]+\/kapat$/,
];

// Genel CSRF kapısı (tüm POST'larda):
// - multipart istekler yalnızca dosya uçlarına geçer (token kontrolü multer'dan SONRA
//   dosyaYukleyici içinde yapılır — gövde ancak o zaman çözülür);
// - diğer uçlara multipart gönderimi reddedilir (CSRF atlatma kapısı olmasın);
// - normal form gönderimlerinde token burada doğrulanır.
function csrfDogrula(req, res, next) {
  if (req.method !== "POST") return next();
  const tip = String(req.headers["content-type"] || "");
  if (tip.startsWith("multipart/form-data")) {
    if (DOSYA_YOLLARI.some((r) => r.test(req.path))) return next();
    return res.status(400).send("Bu uç dosya yüklemesi kabul etmiyor.");
  }
  csrfKontrol(req, res, next);
}

// Rota-bazlı dosya yükleme: bellek depolama + uca özel adet sınırı + multer sonrası
// CSRF kontrolü. Kullanım: app.post(yol, ...dosyaYukleyici(maxDosya), handler)
function dosyaYukleyici(maxDosya) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: S.GORSEL_MAX_BAYT, files: maxDosya, fieldSize: 1024 * 1024 },
  }).any();
  const yukle = (req, res, next) => upload(req, res, (err) => {
    if (err) {
      return res.status(400).send(
        `Dosya yükleme reddedildi: en fazla ${maxDosya} dosya, dosya başına ` +
        `${Math.round(S.GORSEL_MAX_BAYT / 1024 / 1024)} MB.`);
    }
    next();
  });
  return [yukle, csrfKontrol];
}

// --- Güvenlik başlıkları (https açıksa HSTS de eklenir) ---
const _site = S.siteKonfig();
function guvenlikBasliklari(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "same-origin");
  res.set("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  if (_site.https) {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// --- Yetki middleware'leri ---
function _giriseYonlendir(req, res) {
  return res.redirect("/yonetici/giris?next=" + encodeURIComponent(req.originalUrl));
}
function _yetkisiz(req, res) {
  flash(req, "error", "Bu işlem için yetkiniz yok.");
  return res.redirect("/");
}

// Herhangi bir yönetici (ana veya ek) — panele genel erişim için
function adminRequired(req, res, next) {
  if (!req.session.admin) return _giriseYonlendir(req, res);
  next();
}
// Yalnızca ana yönetici (ek yönetici yönetimi, ana şifre değişimi)
function superRequired(req, res, next) {
  if (!req.session.admin) return _giriseYonlendir(req, res);
  if (!req.superAdmin) return _yetkisiz(req, res);
  next();
}
// Belirli bir yetki alanı gerektirir (ana yönetici her zaman geçer)
function yetkiGerek(alan) {
  return (req, res, next) => {
    if (!req.session.admin) return _giriseYonlendir(req, res);
    if (req.superAdmin || (req.yetkiler || []).includes(alan)) return next();
    return _yetkisiz(req, res);
  };
}
// Denetim yapma: 5S yetkili yönetici VEYA girişli denetmen
const denetciRequired = sar(async (req, res, next) => {
  if (req.superAdmin || (req.yetkiler || []).includes("bes_s")) return next();
  if (await C.aktifDenetmen(req.session)) return next();
  return _giriseYonlendir(req, res);
});

module.exports = {
  sar, flash, hizLimitAsildi, alan, ortakLocals, csrfDogrula, dosyaYukleyici,
  guvenlikBasliklari, adminRequired, superRequired, yetkiGerek, denetciRequired,
  YETKILER, TUM_YETKILER,
};
