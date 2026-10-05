// Genel yardımcılar: kimlik/numara üretimi (atomik sayaç), tarih/puan biçimleri, güvenli dosya yolu,
// görsel doğrulama + işleme (sharp), logo bulma. Diğer servislerin hepsi buna dayanabilir; bu modül hiçbirine dayanmaz.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const S = require("../sabitler");
const { calistir } = require("../db");

function uid() { return crypto.randomBytes(4).toString("hex"); }

// ÖNFR2607-01 benzeri numara — sıra her ay sıfırlanır. `sayaclar` tablosunda
// atomik sayaç (LAST_INSERT_ID hilesi) kullanılır: eşzamanlı isteklerde mükerrer
// numara oluşmaz. Sayaç yoksa mevcut kayıtların en büyüğünden tohumlanır.
async function nextNumber(tablo, prefix) {
  const d = S.nowTr();
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0");
  const fullPrefix = `${prefix}${yymm}-`;
  await calistir(
    `INSERT IGNORE INTO sayaclar(onek, sayac)
     SELECT ?, COALESCE(MAX(CAST(SUBSTRING_INDEX(\`no\`, '-', -1) AS UNSIGNED)), 0)
     FROM ${tablo} WHERE \`no\` LIKE ?`,
    [fullPrefix, fullPrefix + "%"]);
  const r = await calistir(
    "UPDATE sayaclar SET sayac = LAST_INSERT_ID(sayac + 1) WHERE onek = ?", [fullPrefix]);
  return `${fullPrefix}${String(r.insertId).padStart(2, "0")}`;
}

function safeName(no) {
  return String(no).replace(/Ö/g, "O").replace(/ö/g, "o").replace(/-/g, "_");
}

function allowedFile(filename) {
  return S.ALLOWED_EXT.has(path.extname(filename || "").toLowerCase());
}

// Path-traversal güvenli dosya yolu; base dışına çıkarsa null.
function guvenliYol(baseDir, filename) {
  const tam = path.resolve(baseDir, filename);
  const kok = path.resolve(baseDir);
  if (tam === kok || tam.startsWith(kok + path.sep)) return tam;
  return null;
}

// YYYY-MM-DD -> DD.MM.YYYY
function trdate(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

// 2026-06 -> Haziran 2026
function ayEtiketi(yyyymm) {
  const [y, m] = String(yyyymm).split("-");
  const ay = S.TR_AYLAR[parseInt(m, 10) - 1];
  return ay ? `${ay} ${y}` : yyyymm;
}

// 7.5 -> '7,5' ; 50.0 -> '50'
function puanfmt(v) {
  const f = parseFloat(v);
  if (Number.isNaN(f)) return v;
  const s = f === Math.trunc(f) ? String(Math.trunc(f))
    : f.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

// Görsel doğrulama + işleme: dosya imzası (magic bytes) kontrolünden sonra sharp ile
// yeniden kodlanır — EXIF yönü düzeltilir, metadata (GPS/konum dahil) TEMİZLENİR,
// büyük görseller 1600px'e küçültülür, JPEG'ler kalite 85 kaydedilir.
const sharp = require("sharp");

const _IMZALAR = [
  [0xFF, 0xD8, 0xFF],                    // JPEG
  [0x89, 0x50, 0x4E, 0x47],              // PNG
  [0x47, 0x49, 0x46, 0x38],              // GIF
  [0x42, 0x4D],                          // BMP
  [0x52, 0x49, 0x46, 0x46],              // WEBP (RIFF)
];

async function gorselKaydet(file, hedefYol) {
  if (!file || !file.buffer || !file.buffer.length) return false;
  if (file.buffer.length > S.GORSEL_MAX_BAYT) return false;
  const b = file.buffer;
  const gecerli = _IMZALAR.some((sig) => sig.every((v, i) => b[i] === v));
  if (!gecerli) return false;
  const ext = path.extname(hedefYol).toLowerCase();
  // BMP'yi sharp desteklemez — imzası doğrulanmış hâliyle yazılır (BMP'de EXIF yoktur)
  if (ext === ".bmp") {
    try { fs.writeFileSync(hedefYol, b); return true; } catch { return false; }
  }
  try {
    let img = sharp(b).rotate(); // EXIF yönüne göre döndür (metadata kopyalanmaz)
    img = img.resize(S.GORSEL_MAX_KENAR, S.GORSEL_MAX_KENAR,
      { fit: "inside", withoutEnlargement: true });
    if (ext === ".jpg" || ext === ".jpeg") img = img.jpeg({ quality: 85 });
    else if (ext === ".png") img = img.png();
    else if (ext === ".webp") img = img.webp({ quality: 85 });
    else if (ext === ".gif") img = img.gif();
    await img.toFile(hedefYol);
    return true;
  } catch { return false; } // bozuk/sahte görüntü reddedilir
}

// Marka + logo (static/ içinde adında 'logo' geçen ilk görsel)
const _LOGO_EXT = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
// Her istekte çağrılır (üst menü) → klasör taraması 5 dakika önbelleklenir; logo değiştirilince en geç 5 dk'da görünür
let _logoOnbellek = { zaman: 0, dosya: null };

function logoBul() {
  const simdi = Date.now();
  if (simdi - _logoOnbellek.zaman < 5 * 60 * 1000) return _logoOnbellek.dosya;
  _logoOnbellek = { zaman: simdi, dosya: _logoAra() };
  return _logoOnbellek.dosya;
}
function _logoAra() {
  let dosyalar;
  try { dosyalar = fs.readdirSync(S.STATIC_DIR); } catch { return null; }
  for (const f of dosyalar) {
    const ext = path.extname(f).toLowerCase();
    if (path.basename(f, path.extname(f)).toLowerCase() === "logo" && _LOGO_EXT.includes(ext)) return f;
  }
  for (const f of [...dosyalar].sort()) {
    const ext = path.extname(f).toLowerCase();
    if (path.basename(f, path.extname(f)).toLowerCase().includes("logo") && _LOGO_EXT.includes(ext)) return f;
  }
  return null;
}

module.exports = {
  uid, nextNumber, safeName, allowedFile, guvenliYol, trdate, ayEtiketi, puanfmt, gorselKaydet, logoBul,
};
