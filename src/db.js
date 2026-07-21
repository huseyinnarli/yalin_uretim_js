// Veri katmanı: MySQL (mysql2/promise havuzu). Şema + satır<->nesne dönüşümleri + yedek.
// JSON kolonlar (uyeler, kazanclar, puanlar, fotolar...) TEXT olarak saklanır.
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const mysql = require("mysql2/promise");
const S = require("./sabitler");

// Bağlantı ayarları: önce ortam değişkenleri, sonra data/db-config.json, sonra varsayılan.
function baglantiAyarlari() {
  let dosya = {};
  try {
    dosya = JSON.parse(fs.readFileSync(path.join(S.DATA_DIR, "db-config.json"), "utf-8"));
  } catch { /* dosya yoksa varsayılanlar */ }
  return {
    host: process.env.YALIN_DB_HOST || dosya.host || "127.0.0.1",
    port: parseInt(process.env.YALIN_DB_PORT || dosya.port || 3306, 10),
    user: process.env.YALIN_DB_USER || dosya.user || "yalin",
    password: process.env.YALIN_DB_PASSWORD ?? dosya.password ?? "",
    database: process.env.YALIN_DB_DATABASE || dosya.database || "yalin_uretim",
  };
}

const pool = mysql.createPool({
  ...baglantiAyarlari(),
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  namedPlaceholders: false,
});

// --- Sorgu yardımcıları (isteğe bağlı conn: transaction içinden aynı bağlantı) ---
async function sorgu(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}
async function tek(sql, params = [], conn = pool) {
  const rows = await sorgu(sql, params, conn);
  return rows[0] || null;
}
async function calistir(sql, params = [], conn = pool) {
  const [r] = await conn.query(sql, params);
  return r; // { affectedRows, insertId, ... }
}
// fn(conn) tek transaction içinde çalışır; hata olursa tamamı geri alınır.
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sonuc = await fn(conn);
    await conn.commit();
    return sonuc;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

const SEMA = `
CREATE TABLE IF NOT EXISTS config (
  anahtar VARCHAR(64) PRIMARY KEY,
  deger   TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS oneriler (
  no VARCHAR(32) PRIMARY KEY,
  tarih VARCHAR(10), sahibi TEXT, gorevi TEXT, konu TEXT, detay TEXT, cozum TEXT,
  kalite TEXT, verimlilik TEXT, isg TEXT, maliyet TEXT, ek TEXT,
  durum VARCHAR(40), puan DOUBLE NULL, puanlama TEXT, degerlendirme_notu TEXT,
  kayit_zamani VARCHAR(20), guncelleme_zamani VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS kaizenler (
  no VARCHAR(32) PRIMARY KEY,
  baslangic VARCHAR(10), bitis VARCHAR(10), konu TEXT, bolum TEXT,
  lider TEXT, uyeler TEXT, sorumlular TEXT, kazanclar TEXT,
  onceki TEXT, sonraki TEXT, onceki_gorsel VARCHAR(255), sonraki_gorsel VARCHAR(255),
  durum VARCHAR(40), puan DOUBLE NULL, puanlama TEXT, degerlendirme_notu TEXT,
  kayit_zamani VARCHAR(20), guncelleme_zamani VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS bolumler (
  id VARCHAR(16) PRIMARY KEY,
  ad TEXT NOT NULL,
  sorumlu TEXT,
  kisiler TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS denetimler (
  id VARCHAR(16) PRIMARY KEY,
  bolum_id VARCHAR(16), tarih VARCHAR(10), tur_adi TEXT,
  baslangic VARCHAR(10), bitis VARCHAR(10), plan_gun VARCHAR(10), plan_saat VARCHAR(8),
  planlanan_denetmen TEXT, misafir_denetmen TEXT, denetmen TEXT,
  puan INT NULL, puanlar TEXT, bulgular TEXT, checked TEXT, uygunsuz TEXT,
  notu TEXT, aciklamalar TEXT, fotolar TEXT,
  durum VARCHAR(16), denetim_tarihi VARCHAR(10), kayit_zamani VARCHAR(20),
  INDEX ix_denetim_bolum (bolum_id),
  INDEX ix_denetim_tarih (tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS aksiyonlar (
  id VARCHAR(16) PRIMARY KEY,
  denetim_id VARCHAR(16), tarih VARCHAR(10), tur_adi TEXT,
  bolum_id VARCHAR(16), bolum_ad TEXT, kriter_k VARCHAR(8), kriter_m TEXT,
  aksiyon TEXT, sorumlu TEXT, atanan_lider TEXT, termin VARCHAR(10),
  durum VARCHAR(10), olusturma_zamani VARCHAR(20), kapatma TEXT,
  INDEX ix_aksiyon_denetim (denetim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS odul_islenen (
  tarih VARCHAR(10) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS odul_kayitlari (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tarih VARCHAR(10), tur_adi TEXT, bolum_id VARCHAR(16), bolum_ad TEXT,
  sira INT, puan DOUBLE, kisiler TEXT, islenme_zamani VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS odul_arsiv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad VARCHAR(191), puan DOUBLE, tarih VARCHAR(10), zaman VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS silinen_kisiler (
  ad VARCHAR(191) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS denetmenler (
  id VARCHAR(16) PRIMARY KEY,
  ad TEXT, sifre TEXT, olusturma VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS misafirler (
  id VARCHAR(16) PRIMARY KEY,
  ad TEXT, olusturma VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS yoneticiler (
  id VARCHAR(16) PRIMARY KEY,
  ad TEXT, sifre TEXT, yetkiler TEXT, olusturma VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS sayaclar (
  onek VARCHAR(32) PRIMARY KEY,
  sayac INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
`;

// Şemayı kurar — uygulama açılışında bir kez çağrılır.
async function init() {
  for (const ddl of SEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(ddl);
  }
  // Mevcut kurulumlar için küçük migrasyonlar (CREATE IF NOT EXISTS kolon eklemez)
  const [kolon] = await pool.query("SHOW COLUMNS FROM denetimler LIKE 'bulgular'");
  if (!kolon.length) {
    await pool.query("ALTER TABLE denetimler ADD COLUMN bulgular TEXT AFTER puanlar");
  }
}

// --- JSON kolon yardımcıları ---
function j(v, varsayilan) {
  if (v === null || v === undefined || v === "") return varsayilan;
  try { return JSON.parse(v); } catch { return varsayilan; }
}
function js(v) { return v === null || v === undefined ? null : JSON.stringify(v); }

// --- config ---
async function configGet(anahtar) {
  const r = await tek("SELECT deger FROM config WHERE anahtar = ?", [anahtar]);
  return r ? r.deger : null;
}
async function configSet(anahtar, deger) {
  await calistir(
    "INSERT INTO config(anahtar, deger) VALUES(?, ?) ON DUPLICATE KEY UPDATE deger = VALUES(deger)",
    [anahtar, deger]);
}

// --- satır -> nesne dönüşümleri ---
function oneriRow(r) {
  if (!r) return null;
  return { ...r, tip: "oneri", puanlama: j(r.puanlama, null) };
}
function kaizenRow(r) {
  if (!r) return null;
  return { ...r, tip: "kaizen", uyeler: j(r.uyeler, []), kazanclar: j(r.kazanclar, []),
    puanlama: j(r.puanlama, null) };
}
function bolumRow(r) {
  if (!r) return null;
  return { ...r, kisiler: j(r.kisiler, []) };
}
function denetimRow(r) {
  if (!r) return null;
  return { ...r, puanlar: j(r.puanlar, null), bulgular: j(r.bulgular, {}),
    checked: j(r.checked, []), uygunsuz: j(r.uygunsuz, []),
    aciklamalar: j(r.aciklamalar, {}), fotolar: j(r.fotolar, {}), not: r.notu };
}
function aksiyonRow(r) {
  if (!r) return null;
  return { ...r, kapatma: j(r.kapatma, null) };
}
function odulKayitRow(r) {
  if (!r) return null;
  return { ...r, kisiler: j(r.kisiler, []) };
}
function yoneticiRow(r) {
  if (!r) return null;
  return { ...r, yetkiler: j(r.yetkiler, []) };
}

// Otomatik yedek: tüm tabloları (JSON) + görsel klasörlerini tek ZIP'e döker (son 15).
// Klasör YALIN_YEDEK_DIR / config "yedek_dir" ile farklı bir diske yönlendirilebilir;
// görseller "yedek_gorseller": false ile kapsam dışı bırakılabilir.
// Not: tam sunucu yedeği için mysqldump tercih edilir; bu, uygulama içi güvence katmanıdır.
const _YEDEK_TABLOLAR = ["config", "oneriler", "kaizenler", "bolumler", "denetimler",
  "aksiyonlar", "odul_islenen", "odul_kayitlari", "odul_arsiv", "silinen_kisiler",
  "denetmenler", "misafirler", "yoneticiler", "sayaclar"];
const _YEDEK_GORSEL_DIRLER = [
  ["kaizen_gorseller", S.KAIZEN_IMG_DIR],
  ["bes_s_gorseller", S.BESS_FOTO_DIR],
  ["aksiyon_gorseller", S.BESS_AKSIYON_FOTO_DIR],
];

async function yedekle(tut = 15) {
  try {
    const site = S.siteKonfig();
    fs.mkdirSync(site.yedekDir, { recursive: true });
    const dump = {};
    for (const t of _YEDEK_TABLOLAR) dump[t] = await sorgu(`SELECT * FROM ${t}`);
    const d = S.nowTr();
    const p = (n) => String(n).padStart(2, "0");
    const ad = `yedek_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`;
    const tamYol = path.join(site.yedekDir, ad);

    await new Promise((resolve, reject) => {
      const cikti = fs.createWriteStream(tamYol);
      const arch = archiver("zip", { zlib: { level: 6 } });
      cikti.on("close", resolve);
      arch.on("error", reject);
      arch.pipe(cikti);
      arch.append(JSON.stringify(dump), { name: "veritabani.json" });
      if (site.yedekGorseller) {
        for (const [klasorAdi, dir] of _YEDEK_GORSEL_DIRLER) {
          if (fs.existsSync(dir)) arch.directory(dir, `gorseller/${klasorAdi}`);
        }
      }
      arch.finalize();
    });

    const eskiler = fs.readdirSync(site.yedekDir)
      .filter((f) => f.startsWith("yedek_") && (f.endsWith(".zip") || f.endsWith(".json.gz"))).sort();
    for (const e of eskiler.slice(0, Math.max(0, eskiler.length - tut))) {
      try { fs.unlinkSync(path.join(site.yedekDir, e)); } catch {}
    }
    return ad;
  } catch (e) {
    console.error("Yedekleme hatası:", e.message);
    return null;
  }
}

function baslatYedekleme(saat = 6) {
  yedekle();
  setInterval(yedekle, saat * 3600 * 1000).unref();
}

module.exports = {
  pool, sorgu, tek, calistir, transaction, init, j, js, configGet, configSet,
  oneriRow, kaizenRow, bolumRow, denetimRow, aksiyonRow, odulKayitRow, yoneticiRow,
  yedekle, baslatYedekleme, baglantiAyarlari,
};
