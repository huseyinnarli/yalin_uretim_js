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

// --- Ortak locals + flash tüketimi + CSRF üretimi ---
const ortakLocals = sar(async (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(16).toString("hex");
  const d = await C.aktifDenetmen(req.session);
  res.locals.session = req.session;
  res.locals.admin = Boolean(req.session.admin);
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

// --- Yetki ---
function adminRequired(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/yonetici/giris?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
}
const denetciRequired = sar(async (req, res, next) => {
  if (!req.session.admin && !(await C.aktifDenetmen(req.session))) {
    return res.redirect("/yonetici/giris?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
});

module.exports = {
  sar, flash, hizLimitAsildi, alan, ortakLocals, csrfDogrula, dosyaYukleyici,
  guvenlikBasliklari, adminRequired, denetciRequired,
};
