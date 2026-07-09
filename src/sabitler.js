// Sabitler: dosya yolları, sabit değerler ve nowTr (saf, bağımlılıksız).
const path = require("path");
const fs = require("fs");

const BASE_DIR = path.dirname(__dirname);

// Veri klasörü ortam değişkeniyle taşınabilir (prod/test).
const DATA_DIR = process.env.YALIN_DATA_DIR || path.join(BASE_DIR, "data");

const DB_PATH = path.join(DATA_DIR, "yalin.db");
const KAIZEN_IMG_DIR = path.join(DATA_DIR, "kaizen_gorseller");
const BESS_FOTO_DIR = path.join(DATA_DIR, "bes_s_gorseller");
const BESS_AKSIYON_FOTO_DIR = path.join(DATA_DIR, "aksiyon_gorseller");
const YEDEK_DIR = path.join(DATA_DIR, "_yedek_otomatik");
const STATIC_DIR = path.join(BASE_DIR, "static");

function ensureDirs() {
  for (const d of [DATA_DIR, KAIZEN_IMG_DIR, BESS_FOTO_DIR, BESS_AKSIYON_FOTO_DIR, YEDEK_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

const ODUL_ESIK = 300; // her bu kadar net puanda bir ödül
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);

const KAZANC_BASLIKLARI = [
  "Makine", "İşçilik Süre", "Kalite", "İSG", "Ergonomi", "Setup",
  "Stok", "Hammadde/Yarı Mamul", "5S", "Nakliye", "Enerji", "Alan", "Diğer",
];

const TR_AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const DURUMLAR = ["Değerlendiriliyor", "Onaylandı", "Reddedildi", "Düzeltme İsteniyor"];
const VARSAYILAN_DURUM = "Değerlendiriliyor";

const ADMIN_PASSWORD = "admin123"; // ilk kurulum varsayılanı — panelden değiştirilir
const MARKA_ADI = "Öztaş Global Soğutma";
const ODUL_MAP = { 0: 100, 1: 75, 2: 50 }; // 1./2./3. bölüm
const ALAN_MAX = 5000;   // tek metin alanı üst sınırı
const GORSEL_MAX_BAYT = 8 * 1024 * 1024; // tek görsel üst sınırı (multer + gorselKaydet)

// Dağıtım bayrakları: HTTPS arkasında mı (secure cookie + HSTS), reverse proxy var mı
// (trust proxy → gerçek istemci IP'si). Öncelik: ortam değişkeni > data/config.json.
// Örnek data/config.json: { "https": true, "proxy": true }
function siteKonfig() {
  let dosya = {};
  try {
    dosya = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "config.json"), "utf-8"));
  } catch { /* dosya yoksa varsayılanlar (kapalı) */ }
  const bayrak = (env, anahtar) => env !== undefined
    ? ["1", "true", "evet"].includes(String(env).toLowerCase())
    : Boolean(dosya[anahtar]);
  return {
    https: bayrak(process.env.YALIN_HTTPS, "https"),
    proxy: bayrak(process.env.YALIN_PROXY, "proxy"),
  };
}

// Türkiye saatine göre şu an (tüm tarih/saat varsayılanları).
function nowTr() {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" });
  return new Date(s.replace(" ", "T")); // yerel bileşenleri TR olan Date
}

function pad(n) { return String(n).padStart(2, "0"); }

// "YYYY-MM-DD"
function bugunIso() {
  const d = nowTr();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "DD.MM.YYYY HH:MM" — kayıt zaman damgası (eski uygulamayla aynı biçim)
function zamanTr() {
  const d = nowTr();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  BASE_DIR, DATA_DIR, DB_PATH, KAIZEN_IMG_DIR, BESS_FOTO_DIR,
  BESS_AKSIYON_FOTO_DIR, YEDEK_DIR, STATIC_DIR, ensureDirs,
  ODUL_ESIK, ALLOWED_EXT, KAZANC_BASLIKLARI, TR_AYLAR, DURUMLAR,
  VARSAYILAN_DURUM, ADMIN_PASSWORD, MARKA_ADI, ODUL_MAP, ALAN_MAX,
  GORSEL_MAX_BAYT, siteKonfig, nowTr, bugunIso, zamanTr,
};
