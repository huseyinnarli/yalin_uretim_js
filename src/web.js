// Web yardımcıları: flash mesajları, CSRF, hız limiti, dosya yükleme, yetki middleware'leri.
const crypto = require("crypto");
const multer = require("multer");
const S = require("./sabitler");
const C = require("./cekirdek");
const I = require("./isim");
const Y = require("./yetkiler");

// Async rota sarıcı: reddedilen promise'i Express hata zincirine iletir
// (Express 4 async hataları kendiliğinden yakalamaz).
function sar(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Yetki alanları src/yetkiler.js'te tanımlıdır (ayrıntılı alanlar; tam yetki yalnız ana yönetici).
const YETKILER = Y.YETKILER;
const TUM_YETKILER = Y.TUM_YETKILER;

// --- Flash (oturumda taşınır, bir kez gösterilir) ---
// Yan etki: yönetici/denetmen bağlamındaki BAŞARILI işlemler işlem günlüğüne yazılır
// (mesajlar zaten okunabilir Türkçe olduğundan denetim izi için birebir kullanılır).
const _GUNLUK_HARIC = new Set(["/yonetici/giris", "/yonetici/cikis"]);
function flash(req, kategori, mesaj) {
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push([kategori, mesaj]);

  if (kategori === "success" && req.session
      && (req.session.admin || req.session.denetmen_id)
      && !_GUNLUK_HARIC.has(req.path)) {
    let kim, rol;
    if (req.session.super) { kim = "Ana Yönetici"; rol = "super"; }
    else if (req.session.yonetici_id) { kim = req.session.yonetici_ad || "Yönetici"; rol = "yonetici"; }
    else { kim = req.session.denetmen_ad || "Denetmen"; rol = "denetmen"; }
    // Ateşle-unut: günlük yazımı istek akışını yavaşlatmasın/bloklamasın
    C.gunlukEkle({ kim, rol, mesaj, yol: (req.originalUrl || "").split("?")[0], ip: req.ip })
      .catch(() => {});
  }
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

// Ad + soyad ayrı kutulardan okunur ve düzeltilir ("aLi" "yılmaz" -> "Ali Yılmaz").
// Eski tek kutulu form (adAlani dolu, soyad alanı hiç gönderilmemiş) da kabul edilir.
// Dönüş: { tam, ad, soyad, eksik } — eksik: ayrı kutularda ad veya soyaddan biri boş.
function adSoyadOku(req, adAlani, soyadAlani) {
  const b = req.body || {};
  if (!(soyadAlani in b)) {
    const tam = I.adDuzelt(alan(req, adAlani));
    return { tam, ad: tam, soyad: "", eksik: !tam };
  }
  const ad = I.adDuzelt(alan(req, adAlani));
  const soyad = I.adDuzelt(alan(req, soyadAlani));
  return { tam: I.adSoyad(ad, soyad), ad, soyad, eksik: !ad || !soyad };
}

// Formdaki bir kişi: "<onek>_ad" + "<onek>_soyad" ayrı kutuları; yoksa eski tek "<onek>" kutusu
function kisiOku(req, onek) {
  const b = req.body || {};
  if ((onek + "_ad") in b) return adSoyadOku(req, onek + "_ad", onek + "_soyad");
  return adSoyadOku(req, onek, "\u0000yok");
}

// Site içi dönüş adresi: yalnızca "/" ile başlayan ve "//" ile başlamayan yollar
// (javascript:, başka site vb. reddedilir). Geçersizse varsayılan döner.
function guvenliYol(hedef, varsayilan = "/") {
  const h = String(hedef || "");
  return (h.startsWith("/") && !h.startsWith("//") && !h.includes("\\")) ? h : varsayilan;
}

// --- Ortak locals + flash tüketimi + CSRF üretimi + yetki hesaplama ---
const ortakLocals = sar(async (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(16).toString("hex");
  const d = await C.aktifDenetmen(req.session);

  // Yetki durumu: ana yönetici tüm yetkilere sahiptir (yönetici hesapları ve işlem günlüğü yalnız onda);
  // ek yönetici kendi listesine. Yetkiler her istekte veritabanından TAZE okunur → değişiklik anında etkilidir.
  const y = await C.oturumYetkileri(req.session);
  req.yetkiBilgi = y;
  req.anaYonetici = y.ana;         // yalnızca ana yönetici
  req.yetkiler = y.yetkiler;
  req.denetmen = d;
  req.girisli = y.yonetici || Boolean(d);

  res.locals.session = req.session;
  res.locals.admin = y.yonetici;
  res.locals.ana_yonetici = y.ana;
  res.locals.yetkiler = y.yetkiler;
  res.locals.yetki = (alan) => y.yetkiler.includes(alan);
  res.locals.yonetici_adi = y.yonetici && !y.ana ? y.ad : null;
  res.locals.denetmen = d;
  res.locals.denetmen_adi = d ? d.ad : null;
  res.locals.girisli = req.girisli;
  res.locals.gorev_sayisi = d ? await C.gorevSayisi(d.id) : 0;
  res.locals.csrf_token = req.session.csrf;
  res.locals.demo = process.env.YALIN_DEMO === "1"; // tasarım önizleme kabı (Dockerfile)
  res.locals.marka_adi = S.MARKA_ADI;
  res.locals.marka_logo = C.logoBul();
  res.locals.trdate = C.trdate;
  res.locals.puanfmt = C.puanfmt;
  res.locals.adBol = I.adBol;
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
  /^\/5s\/denetim\/[^/]+\/revize$/,
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
  if (!req.yetkiBilgi || !req.yetkiBilgi.yonetici) return _giriseYonlendir(req, res);
  next();
}
// Girişli herkes (yönetici veya denetmen) — öneri/kaizen listesi, panel, arşiv
function girisRequired(req, res, next) {
  if (!req.girisli) return _giriseYonlendir(req, res);
  next();
}
// Yalnızca ana yönetici: ek yönetici hesapları, işlem günlüğü, ana yönetici şifresi
function anaYoneticiRequired(req, res, next) {
  if (!req.yetkiBilgi || !req.yetkiBilgi.yonetici) return _giriseYonlendir(req, res);
  if (!req.anaYonetici) return _yetkisiz(req, res);
  next();
}
// Belirli bir yetki alanı gerektirir (ana yönetici her zaman geçer)
function yetkiGerek(alan) {
  return (req, res, next) => {
    if (!req.yetkiBilgi || !req.yetkiBilgi.yonetici) return _giriseYonlendir(req, res);
    if ((req.yetkiler || []).includes(alan)) return next();
    return _yetkisiz(req, res);
  };
}
// Denetim yapma: "denetim yapma" yetkili yönetici VEYA girişli denetmen
function denetciRequired(req, res, next) {
  if ((req.yetkiler || []).includes("bes_denetim")) return next();
  if (req.denetmen) return next();
  return _giriseYonlendir(req, res);
}

module.exports = {
  sar, flash, hizLimitAsildi, alan, adSoyadOku, kisiOku, guvenliYol, ortakLocals, csrfDogrula, dosyaYukleyici,
  guvenlikBasliklari, adminRequired, girisRequired, anaYoneticiRequired,
  yetkiGerek, denetciRequired, YETKILER, TUM_YETKILER,
};
