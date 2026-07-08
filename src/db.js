// Veri katmanı: SQLite (node:sqlite, WAL). Şema + satır<->nesne dönüşümleri.
// JSON kolonlar (uyeler, kazanclar, puanlar, fotolar...) metin olarak saklanır.
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
const { DB_PATH, DATA_DIR, ensureDirs } = require("./sabitler");

ensureDirs();
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS config (
  anahtar TEXT PRIMARY KEY,
  deger   TEXT
);
CREATE TABLE IF NOT EXISTS oneriler (
  no TEXT PRIMARY KEY,
  tarih TEXT, sahibi TEXT, gorevi TEXT, konu TEXT, detay TEXT, cozum TEXT,
  kalite TEXT, verimlilik TEXT, isg TEXT, maliyet TEXT, ek TEXT,
  durum TEXT, puan REAL, puanlama TEXT, degerlendirme_notu TEXT,
  kayit_zamani TEXT, guncelleme_zamani TEXT
);
CREATE TABLE IF NOT EXISTS kaizenler (
  no TEXT PRIMARY KEY,
  baslangic TEXT, bitis TEXT, konu TEXT, bolum TEXT,
  lider TEXT, uyeler TEXT, sorumlular TEXT, kazanclar TEXT,
  onceki TEXT, sonraki TEXT, onceki_gorsel TEXT, sonraki_gorsel TEXT,
  durum TEXT, puan REAL, puanlama TEXT, degerlendirme_notu TEXT,
  kayit_zamani TEXT, guncelleme_zamani TEXT
);
CREATE TABLE IF NOT EXISTS bolumler (
  id TEXT PRIMARY KEY,
  ad TEXT NOT NULL,
  sorumlu TEXT DEFAULT '',
  kisiler TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS denetimler (
  id TEXT PRIMARY KEY,
  bolum_id TEXT, tarih TEXT, tur_adi TEXT,
  baslangic TEXT, bitis TEXT, plan_gun TEXT, plan_saat TEXT,
  planlanan_denetmen TEXT, misafir_denetmen TEXT, denetmen TEXT,
  puan INTEGER, puanlar TEXT, checked TEXT, uygunsuz TEXT,
  notu TEXT, aciklamalar TEXT, fotolar TEXT,
  durum TEXT, denetim_tarihi TEXT, kayit_zamani TEXT
);
CREATE TABLE IF NOT EXISTS aksiyonlar (
  id TEXT PRIMARY KEY,
  denetim_id TEXT, tarih TEXT, tur_adi TEXT,
  bolum_id TEXT, bolum_ad TEXT, kriter_k TEXT, kriter_m TEXT,
  aksiyon TEXT, sorumlu TEXT, atanan_lider TEXT, termin TEXT,
  durum TEXT, olusturma_zamani TEXT, kapatma TEXT
);
CREATE TABLE IF NOT EXISTS odul_islenen (
  tarih TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS odul_kayitlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tarih TEXT, tur_adi TEXT, bolum_id TEXT, bolum_ad TEXT,
  sira INTEGER, puan REAL, kisiler TEXT, islenme_zamani TEXT
);
CREATE TABLE IF NOT EXISTS odul_arsiv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT, puan REAL, tarih TEXT, zaman TEXT
);
CREATE TABLE IF NOT EXISTS silinen_kisiler (
  ad TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS denetmenler (
  id TEXT PRIMARY KEY,
  ad TEXT, sifre TEXT, olusturma TEXT
);
CREATE TABLE IF NOT EXISTS misafirler (
  id TEXT PRIMARY KEY,
  ad TEXT, olusturma TEXT
);
CREATE INDEX IF NOT EXISTS ix_denetim_bolum ON denetimler(bolum_id);
CREATE INDEX IF NOT EXISTS ix_denetim_tarih ON denetimler(tarih);
CREATE INDEX IF NOT EXISTS ix_aksiyon_denetim ON aksiyonlar(denetim_id);
`);

// --- JSON kolon yardımcıları ---
function j(v, varsayilan) {
  if (v === null || v === undefined || v === "") return varsayilan;
  try { return JSON.parse(v); } catch { return varsayilan; }
}
function js(v) { return v === null || v === undefined ? null : JSON.stringify(v); }

// --- config ---
function configGet(anahtar) {
  const r = db.prepare("SELECT deger FROM config WHERE anahtar = ?").get(anahtar);
  return r ? r.deger : null;
}
function configSet(anahtar, deger) {
  db.prepare(`INSERT INTO config(anahtar, deger) VALUES(?, ?)
              ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger`).run(anahtar, deger);
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
  return { ...r, puanlar: j(r.puanlar, null), checked: j(r.checked, []),
    uygunsuz: j(r.uygunsuz, []), aciklamalar: j(r.aciklamalar, {}),
    fotolar: j(r.fotolar, {}), not: r.notu };
}
function aksiyonRow(r) {
  if (!r) return null;
  return { ...r, kapatma: j(r.kapatma, null) };
}
function odulKayitRow(r) {
  if (!r) return null;
  return { ...r, kisiler: j(r.kisiler, []) };
}

// Otomatik yedek: veritabanı dosyasını zaman damgalı kopyalar (son 15 tutulur).
function yedekle(tut = 15) {
  try {
    const { YEDEK_DIR, nowTr } = require("./sabitler");
    fs.mkdirSync(YEDEK_DIR, { recursive: true });
    const d = nowTr();
    const p = (n) => String(n).padStart(2, "0");
    const ad = `yedek_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
    db.exec(`VACUUM INTO '${path.join(YEDEK_DIR, ad).replace(/'/g, "''")}'`);
    const eskiler = fs.readdirSync(YEDEK_DIR).filter((f) => f.startsWith("yedek_") && f.endsWith(".db")).sort();
    for (const e of eskiler.slice(0, Math.max(0, eskiler.length - tut))) {
      try { fs.unlinkSync(path.join(YEDEK_DIR, e)); } catch {}
    }
    return ad;
  } catch { return null; }
}

function baslatYedekleme(saat = 6) {
  yedekle();
  setInterval(yedekle, saat * 3600 * 1000).unref();
}

module.exports = {
  db, j, js, configGet, configSet,
  oneriRow, kaizenRow, bolumRow, denetimRow, aksiyonRow, odulKayitRow,
  yedekle, baslatYedekleme,
};
