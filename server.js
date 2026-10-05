// Uygulama kurulumu: Express + oturum + CSRF + statik + rota modülleri.
// MySQL bağlantısı asenkron olduğundan kurulum async main() içinde yapılır.
const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");

const S = require("./src/sabitler");
const C = require("./src/cekirdek");
const db = require("./src/db");
const web = require("./src/web");

async function main() {
  S.ensureDirs();
  await db.init();            // tablolar yoksa oluştur
  await C.sifreleriHashle();  // eski düz metin şifreleri açılışta hash'le
  const secretKey = await C.getSecretKey();

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Dağıtım bayrakları (data/config.json veya YALIN_HTTPS / YALIN_PROXY):
  // proxy → gerçek istemci IP'si (hız limiti / giriş kilidi doğru çalışsın),
  // https → çerez yalnızca şifreli bağlantıda taşınır + HSTS başlığı.
  const site = S.siteKonfig();
  app.set("trust proxy", site.proxy ? 1 : false);

  app.use(web.guvenlikBasliklari);
  app.use("/static", express.static(path.join(__dirname, "static"), { maxAge: "365d" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  // Dosya yüklemeleri global DEĞİL — yalnızca dosya kabul eden rotalarda,
  // uca özel sınırlarla (web.js:dosyaYukleyici). Diğer uçlara multipart reddedilir.

  // Oturum: imzalı çerez (12 saat), anahtar veritabanında tutulur
  app.use(cookieSession({
    name: "yalin_oturum",
    keys: [secretKey],
    maxAge: 12 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: site.https,
  }));

  app.use(web.ortakLocals);
  app.use(web.csrfDogrula);

  // Rota modülleri
  require("./src/rotalar/genel")(app);
  require("./src/rotalar/oneri")(app);
  require("./src/rotalar/kaizen")(app);
  require("./src/rotalar/bes_s")(app);
  require("./src/rotalar/kontrol")(app);
  require("./src/rotalar/admin")(app);

  // 404 + hata yakalayıcı
  app.use((req, res) => res.status(404).send("Sayfa bulunamadı."));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Sunucu hatası oluştu.");
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    db.baslatYedekleme(6); // açılışta + 6 saatte bir otomatik yedek
    console.log(`Yalın Üretim Uygulamaları çalışıyor: http://127.0.0.1:${PORT} (MySQL)`);
  });
}

main().catch((e) => {
  console.error("Başlatma hatası — MySQL bağlantı ayarlarını kontrol edin " +
    "(YALIN_DB_* ortam değişkenleri veya data/db-config.json):");
  console.error(e.message);
  process.exit(1);
});
