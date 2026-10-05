// Çekirdek iş mantığı: numara üretimi, puan durumu, 5S denetim/aksiyon/ödül,
// kimlik doğrulama yardımcıları ve güvenli dosya işlemleri. (MySQL — tüm veri
// erişimi asenkrondur; saf yardımcılar senkron kalır.)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const S = require("./sabitler");
const P = require("./puanlama");
const I = require("./isim");
const Y = require("./yetkiler");
const K = require("./kontrol");
const {
  sorgu, tek, calistir, transaction, js, configGet, configSet,
  oneriRow, kaizenRow, bolumRow, denetimRow, aksiyonRow, odulKayitRow, yoneticiRow,
} = require("./db");

// ---------------------------------------------------------------------------
// Şifre (werkzeug uyumlu: eski verideki pbkdf2/scrypt hash'leri de doğrular)
// ---------------------------------------------------------------------------
function hashPassword(sifre) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iter = 600000;
  const h = crypto.pbkdf2Sync(sifre, salt, iter, 32, "sha256").toString("hex");
  return `pbkdf2:sha256:${iter}$${salt}$${h}`;
}

function hashMi(v) {
  return typeof v === "string" && (v.startsWith("pbkdf2:") || v.startsWith("scrypt:"));
}

function checkPassword(kayitli, sifre) {
  if (!kayitli) return false;
  if (!hashMi(kayitli)) return kayitli === sifre; // eski düz metin
  const [method, salt, hash] = kayitli.split("$");
  if (!method || !salt || !hash) return false;
  try {
    let hesap;
    if (method.startsWith("pbkdf2:")) {
      const [, algo, iterStr] = method.split(":");
      const iter = parseInt(iterStr, 10) || 260000;
      hesap = crypto.pbkdf2Sync(sifre, salt, iter, hash.length / 2, algo || "sha256").toString("hex");
    } else if (method.startsWith("scrypt:")) {
      const [, nStr, rStr, pStr] = method.split(":");
      const N = parseInt(nStr, 10) || 32768, r = parseInt(rStr, 10) || 8, p = parseInt(pStr, 10) || 1;
      hesap = crypto.scryptSync(sifre, salt, hash.length / 2,
        { N, r, p, maxmem: 256 * 1024 * 1024 }).toString("hex");
    } else return false;
    return crypto.timingSafeEqual(Buffer.from(hesap, "hex"), Buffer.from(hash, "hex"));
  } catch { return false; }
}

async function getAdminPassword() {
  return (await configGet("admin_password")) || S.ADMIN_PASSWORD;
}
async function adminSifreDogru(sifre) {
  return checkPassword(await getAdminPassword(), sifre);
}
async function setAdminPassword(yeni) {
  await configSet("admin_password", hashPassword(yeni));
}
// Açılışta düz metin şifreleri hash'e çevir (ilk kurulum / eski aktarım)
async function sifreleriHashle() {
  const kayitli = await getAdminPassword();
  if (!hashMi(kayitli)) await setAdminPassword(kayitli);
  for (const d of await sorgu("SELECT * FROM denetmenler")) {
    if (d.sifre && !hashMi(d.sifre)) {
      await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [hashPassword(d.sifre), d.id]);
    }
  }
}
// Oturum imza anahtarı config'de tutulur (koda gömülü değil)
async function getSecretKey() {
  let k = await configGet("secret_key");
  if (!k) { k = crypto.randomBytes(32).toString("hex"); await configSet("secret_key", k); }
  return k;
}

// ---------------------------------------------------------------------------
// Genel yardımcılar
// ---------------------------------------------------------------------------
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

// Onaylanan kayda verilen form numarası — yıllık sıralı (FR-2026-0001).
// `sayaclar` tablosunda atomik sayaç (öneri+kaizen ortak, her yıl sıfırlanır).
async function nextFormNo() {
  const yil = S.nowTr().getFullYear();
  const onek = `FORM-${yil}`;
  await calistir("INSERT IGNORE INTO sayaclar(onek, sayac) VALUES(?, 0)", [onek]);
  const r = await calistir(
    "UPDATE sayaclar SET sayac = LAST_INSERT_ID(sayac + 1) WHERE onek = ?", [onek]);
  return `FR-${yil}-${String(r.insertId).padStart(4, "0")}`;
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

// ---------------------------------------------------------------------------
// Öneri / Kaizen
// ---------------------------------------------------------------------------
async function getRecord(tip, no) {
  if (tip === "oneri") {
    return oneriRow(await tek("SELECT * FROM oneriler WHERE `no` = ?", [no]));
  }
  return kaizenRow(await tek("SELECT * FROM kaizenler WHERE `no` = ?", [no]));
}

async function updateRecord(tip, no, fields) {
  const tablo = tip === "oneri" ? "oneriler" : "kaizenler";
  const f = { ...fields, guncelleme_zamani: S.zamanTr() };
  if ("puanlama" in f) f.puanlama = js(f.puanlama);
  const keys = Object.keys(f); // alan adları koddan gelir, kullanıcı girdisi değil
  const set = keys.map((k) => `${k} = ?`).join(", ");
  const r = await calistir(`UPDATE ${tablo} SET ${set} WHERE \`no\` = ?`,
    [...keys.map((k) => f[k]), no]);
  return r.affectedRows > 0;
}

// Öneri + kaizen birleşik, tarihe göre yeni->eski
async function combinedRecords() {
  const out = [];
  for (const r of (await sorgu("SELECT * FROM oneriler")).map(oneriRow)) {
    out.push({ ...r, sort_date: r.tarih || "", baslik: r.konu || "", kisi: r.sahibi || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  for (const r of (await sorgu("SELECT * FROM kaizenler")).map(kaizenRow)) {
    out.push({ ...r, sort_date: r.baslangic || "", baslik: r.konu || "", kisi: r.sorumlular || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  out.sort((a, b) => (b.sort_date + (b.kayit_zamani || "")).localeCompare(a.sort_date + (a.kayit_zamani || "")));
  return out;
}

// Liste filtresi. Reddedilen kayıtlar ana listede yer almaz ("Reddedilen & Silinen"
// sayfasında toplanır). durum: "" (tümü) | "bekle" | "revize" | "onay"
function filtrele(records, tip, ay, q, durum = "") {
  q = (q || "").trim().toLocaleLowerCase("tr");
  return records.filter((r) => {
    if (r.durum === "Reddedildi") return false;
    if ((tip === "oneri" || tip === "kaizen") && r.tip !== tip) return false;
    if (ay && !r.sort_date.startsWith(ay)) return false;
    if (durum === "bekle" && r.durum !== S.VARSAYILAN_DURUM) return false;
    if (durum === "revize" && r.durum !== "Düzeltme İsteniyor") return false;
    if (durum === "onay" && r.durum !== "Onaylandı") return false;
    if (q) {
      const hay = `${r.baslik || ""} ${r.kisi || ""} ${r.no || ""} ${r.form_no || ""}`.toLocaleLowerCase("tr");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Sayfalama: { kayitlar, sayfa, sayfaSayisi, toplam, bas, son }
function sayfala(liste, sayfa, boyut = S.SAYFA_BOYUTU) {
  const toplam = liste.length;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / boyut));
  const s = Math.min(Math.max(1, parseInt(sayfa, 10) || 1), sayfaSayisi);
  const bas = (s - 1) * boyut;
  return { kayitlar: liste.slice(bas, bas + boyut), sayfa: s, sayfaSayisi, toplam,
    bas: toplam ? bas + 1 : 0, son: Math.min(bas + boyut, toplam) };
}

function mevcutAylar(records) {
  const set = new Set(records.filter((r) => r.sort_date).map((r) => r.sort_date.slice(0, 7)));
  return [...set].sort().reverse().map((a) => [a, ayEtiketi(a)]);
}

// ---------------------------------------------------------------------------
// İsim birleştirme: aynı kişinin farklı yazılışları puan listesinde TEK kişi sayılır.
//  - Otomatik: isimAnahtar() büyük/küçük harf, boşluk ve Türkçe karakter farkını yok sayar.
//  - Elle: isim_eslestirme tablosu (kaynak anahtar -> hedef anahtar), yazım hataları için.
// Öneri/kaizen/ödül kayıtlarındaki isimler DEĞİŞMEZ; birleştirme yalnızca hesaplamadadır.
// ---------------------------------------------------------------------------
async function isimEslestirmeleri() {
  const m = new Map();
  for (const r of await sorgu("SELECT kaynak, hedef FROM isim_eslestirme")) m.set(r.kaynak, r.hedef);
  return m;
}
function kokAnahtar(anahtar, esles) {
  let k = anahtar;
  const gorulen = new Set();
  while (esles.has(k) && !gorulen.has(k)) { gorulen.add(k); k = esles.get(k); }
  return k;
}
// ad -> kök anahtar çözücüsü (eşleştirmeler bir kez okunur)
async function isimCozucu() {
  const esles = await isimEslestirmeleri();
  return (ad) => kokAnahtar(I.isimAnahtar(ad), esles);
}
// Grubun görünen adı: kök anahtarın kendi yazılışı > Türkçe karakterli yazılış > en sık kullanılan
function gorunenAd(kok, yazimlar) {
  const adaylar = [...yazimlar.entries()];
  adaylar.sort((a, b) => {
    const ka = I.isimAnahtar(a[0]) === kok ? 1 : 0, kb = I.isimAnahtar(b[0]) === kok ? 1 : 0;
    if (ka !== kb) return kb - ka;
    const ta = I.turkceKarakterSayisi(a[0]), tb = I.turkceKarakterSayisi(b[0]);
    if (ta !== tb) return tb - ta;
    return b[1] - a[1];
  });
  return I.adDuzelt(adaylar.length ? adaylar[0][0] : kok);
}

// ---------------------------------------------------------------------------
// Puan durumu (öneri %10, kaizen lider %50 / üye %25, 5S ödül defteri)
// ---------------------------------------------------------------------------
async function puanDurumu() {
  const kokBul = await isimCozucu();
  const tablo = new Map(); // kök anahtar -> satır

  function satir(ad) {
    ad = (ad || "").trim();
    const kok = ad ? kokBul(ad) : "";
    if (!kok) return null;
    if (!tablo.has(kok)) {
      tablo.set(kok, { anahtar: kok, _yazim: new Map(), oneri: 0, kaizen: 0, bes_s: 0, detay: [] });
    }
    const s = tablo.get(kok);
    s._yazim.set(ad, (s._yazim.get(ad) || 0) + 1);
    return s;
  }
  function puanEkle(ad, alan, tip, etiket, puan, no = "") {
    if (!(puan > 0)) return;
    const s = satir(ad);
    if (!s) return;
    s[alan] += puan;
    s.detay.push({ tip, etiket, no, puan: Math.round(puan * 100) / 100 });
  }

  for (const r of (await sorgu("SELECT * FROM oneriler WHERE puan IS NOT NULL")).map(oneriRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    puanEkle(r.sahibi, "oneri", "oneri", r.konu || "Öneri", Math.round(p * 10) / 100, r.no);
  }
  for (const r of (await sorgu("SELECT * FROM kaizenler WHERE puan IS NOT NULL")).map(kaizenRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    puanEkle(r.lider, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Lider)", Math.round(p * 50) / 100, r.no);
    for (const u of (r.uyeler || []).slice(0, 2)) {
      puanEkle(u, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Üye)", Math.round(p * 25) / 100, r.no);
    }
  }
  for (const k of (await sorgu("SELECT * FROM odul_kayitlari")).map(odulKayitRow)) {
    const etiket = `${k.tur_adi || "5S Denetim"} — ${k.bolum_ad || ""} (${k.sira ?? "?"}.)`;
    for (const ad of k.kisiler || []) puanEkle(ad, "bes_s", "5s", etiket, k.puan || 0, k.tarih || "");
  }

  const harcanan = new Map();
  for (const r of await sorgu("SELECT * FROM odul_arsiv")) {
    const kok = kokBul(r.ad);
    harcanan.set(kok, (harcanan.get(kok) || 0) + (r.puan || S.ODUL_ESIK));
  }
  const silinen = new Set((await sorgu("SELECT ad FROM silinen_kisiler")).map((r) => kokBul(r.ad)));

  const sonuc = [];
  for (const k of tablo.values()) {
    if (silinen.has(k.anahtar)) continue;
    k.ad = gorunenAd(k.anahtar, k._yazim);
    k.yazimlar = [...k._yazim.keys()];
    delete k._yazim;
    k.kazanilan = Math.round((k.oneri + k.kaizen + k.bes_s) * 100) / 100;
    k.harcanan = harcanan.get(k.anahtar) || 0;
    k.odul_sayisi = Math.floor(k.harcanan / S.ODUL_ESIK);
    k.net = Math.round((k.kazanilan - k.harcanan) * 100) / 100;
    if (k.net > 0) sonuc.push(k); // net 0 ise listeden çıkar
  }
  sonuc.sort((a, b) => b.net - a.net);
  return sonuc;
}

// İsim birleştirme ekranı: tüm kaynaklardaki isimler (otomatik + elle birleşmiş gruplar),
// yazım hatası olabilecek benzer grup önerileri ve mevcut elle eşleştirmeler.
async function isimGruplari() {
  const esles = await isimEslestirmeleri();
  const gruplar = new Map();
  const anahtarYazim = new Map(); // anahtar -> örnek yazılış (elle eşleştirme listesinde göstermek için)
  function ekle(ad, kaynak) {
    ad = (ad || "").trim();
    const anahtar = I.isimAnahtar(ad);
    if (!anahtar) return;
    if (!anahtarYazim.has(anahtar)) anahtarYazim.set(anahtar, ad);
    const kok = kokAnahtar(anahtar, esles);
    if (!gruplar.has(kok)) {
      gruplar.set(kok, { anahtar: kok, _yazim: new Map(), anahtarlar: new Set(), kaynaklar: {}, toplam: 0 });
    }
    const g = gruplar.get(kok);
    g._yazim.set(ad, (g._yazim.get(ad) || 0) + 1);
    g.anahtarlar.add(anahtar);
    g.kaynaklar[kaynak] = (g.kaynaklar[kaynak] || 0) + 1;
    g.toplam += 1;
  }
  for (const r of await sorgu("SELECT sahibi FROM oneriler")) ekle(r.sahibi, "Öneri");
  for (const r of (await sorgu("SELECT lider, uyeler FROM kaizenler")).map(kaizenRow)) {
    ekle(r.lider, "Kaizen");
    for (const u of r.uyeler || []) ekle(u, "Kaizen");
  }
  for (const k of (await sorgu("SELECT kisiler FROM odul_kayitlari")).map(odulKayitRow)) {
    for (const ad of k.kisiler || []) ekle(ad, "5S ödülü");
  }
  for (const r of await sorgu("SELECT ad FROM odul_arsiv")) ekle(r.ad, "Verilen ödül");
  for (const b of await loadBolumler()) {
    for (const ad of I.isimListesi(b.sorumlu)) ekle(ad, "Bölüm");
    for (const ad of b.kisiler || []) ekle(ad, "Bölüm");
  }
  for (const d of await loadDenetmenler()) ekle(d.ad, "Denetmen");

  const liste = [...gruplar.values()].map((g) => ({
    anahtar: g.anahtar,
    ad: gorunenAd(g.anahtar, g._yazim),
    yazimlar: [...g._yazim.entries()].map(([yazim, adet]) => ({ yazim, adet })),
    birlesen: g.anahtarlar.size > 1 || g._yazim.size > 1,
    kaynaklar: g.kaynaklar,
    toplam: g.toplam,
  }));
  liste.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));

  // Benzer anahtarlı gruplar (yazım hatası adayları); hedef = daha çok kullanılan
  const oneriler = [];
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const a = liste[i].anahtar, b = liste[j].anahtar;
      const sinir = Math.min(a.length, b.length) >= 10 ? 2 : 1;
      if (Math.abs(a.length - b.length) > sinir) continue;
      if (I.uzaklik(a, b) <= sinir) {
        const [kaynak, hedef] = liste[i].toplam <= liste[j].toplam ? [liste[i], liste[j]] : [liste[j], liste[i]];
        oneriler.push({ kaynak, hedef });
      }
    }
  }

  const adMap = new Map(liste.map((g) => [g.anahtar, g.ad]));
  const elle = (await sorgu("SELECT * FROM isim_eslestirme ORDER BY zaman DESC")).map((r) => ({
    kaynak: r.kaynak, hedef: r.hedef,
    kaynak_ad: anahtarYazim.get(r.kaynak) || r.kaynak,
    hedef_ad: adMap.get(kokAnahtar(r.hedef, esles)) || anahtarYazim.get(r.hedef) || r.hedef,
    olusturan: r.olusturan, zaman: r.zaman,
  }));
  return { gruplar: liste, oneriler, elle };
}

// Elle birleştirme: kaynak grubun kökü hedef grubun köküne bağlanır (döngü engellenir)
async function isimBirlestir(kaynakAnahtar, hedefAnahtar, olusturan) {
  const esles = await isimEslestirmeleri();
  const kaynak = kokAnahtar(kaynakAnahtar, esles);
  const hedef = kokAnahtar(hedefAnahtar, esles);
  if (!kaynak || !hedef) return [false, "İsim bulunamadı."];
  if (kaynak === hedef) return [false, "Bu iki isim zaten aynı kişi olarak sayılıyor."];
  await calistir(
    "INSERT INTO isim_eslestirme(kaynak, hedef, olusturan, zaman) VALUES(?,?,?,?) " +
    "ON DUPLICATE KEY UPDATE hedef = VALUES(hedef), olusturan = VALUES(olusturan), zaman = VALUES(zaman)",
    [kaynak, hedef, olusturan || "", S.zamanTr()]);
  return [true, ""];
}

async function isimAyir(kaynakAnahtar) {
  const r = await calistir("DELETE FROM isim_eslestirme WHERE kaynak = ?", [kaynakAnahtar]);
  return r.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Panel istatistikleri: dönem tablosu (öneri/kaizen ayrı) + son 12 ay trendi
// ---------------------------------------------------------------------------
function puanVar(r) {
  return r.puan !== null && r.puan !== undefined && r.puan !== "";
}

function sayDurum(records) {
  const d = { toplam: 0, onay: 0, puanli: 0, red: 0, bekle: 0, revize: 0 };
  for (const r of records) {
    d.toplam += 1;
    const du = r.durum || S.VARSAYILAN_DURUM;
    if (du === "Onaylandı") {
      d.onay += 1;
      if (puanVar(r)) d.puanli += 1;
    } else if (du === "Reddedildi") d.red += 1;
    else if (du === "Düzeltme İsteniyor") d.revize += 1;
    else d.bekle += 1;
  }
  return d;
}

const _KISA_AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

async function dashboardIstatistik() {
  const recs = await combinedRecords();
  const now = S.nowTr();
  const p = (n) => String(n).padStart(2, "0");
  const buAy = `${now.getFullYear()}-${p(now.getMonth() + 1)}`;
  const buYil = String(now.getFullYear());
  const c6 = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  const cutoff6 = `${c6.getFullYear()}-${p(c6.getMonth() + 1)}-${p(c6.getDate())}`;

  const donem = (k, ad, f) => {
    const rs = recs.filter(f);
    return { k, ad, oneri: sayDurum(rs.filter((r) => r.tip === "oneri")),
      kaizen: sayDurum(rs.filter((r) => r.tip === "kaizen")), toplam: sayDurum(rs) };
  };
  const donemler = [
    donem("ay", "Bu Ay", (r) => r.sort_date.startsWith(buAy)),
    donem("6ay", "Son 6 Ay", (r) => r.sort_date && r.sort_date >= cutoff6),
    donem("yil", "Bu Yıl", (r) => r.sort_date.startsWith(buYil)),
    donem("tum", "Tüm Zamanlar", () => true),
  ];

  // Son 12 ay (bu ay dahil): o ay gelenler ve bunlardan onaylanıp puan alanlar
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ay = `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
    const rs = recs.filter((r) => r.sort_date.startsWith(ay));
    const puanli = (tip) => rs.filter((r) => r.tip === tip && r.durum === "Onaylandı" && puanVar(r)).length;
    trend.push({
      ay, etiket: `${_KISA_AY[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      gelen_oneri: rs.filter((r) => r.tip === "oneri").length,
      gelen_kaizen: rs.filter((r) => r.tip === "kaizen").length,
      puanli_oneri: puanli("oneri"), puanli_kaizen: puanli("kaizen"),
    });
  }
  return { donemler, tum: donemler[3], trend };
}

// ---------------------------------------------------------------------------
// 5S — bölümler, denetimler, ödüller
// ---------------------------------------------------------------------------
async function loadBolumler() {
  return (await sorgu("SELECT * FROM bolumler ORDER BY ad")).map(bolumRow);
}
async function bolumById(bid) {
  return bolumRow(await tek("SELECT * FROM bolumler WHERE id = ?", [bid]));
}
// id -> bölüm haritası (döngülerde N+1 sorguyu önler)
async function bolumMap() {
  const m = {};
  for (const b of await loadBolumler()) m[b.id] = b;
  return m;
}
async function loadDenetimler() {
  return (await sorgu("SELECT * FROM denetimler")).map(denetimRow);
}
async function denetimById(did) {
  return denetimRow(await tek("SELECT * FROM denetimler WHERE id = ?", [did]));
}
async function loadAksiyonlar() {
  return (await sorgu("SELECT * FROM aksiyonlar")).map(aksiyonRow);
}
async function aksiyonById(aid) {
  return aksiyonRow(await tek("SELECT * FROM aksiyonlar WHERE id = ?", [aid]));
}
async function loadDenetmenler() {
  return sorgu("SELECT * FROM denetmenler ORDER BY ad");
}
async function loadMisafirler() {
  return sorgu("SELECT * FROM misafirler ORDER BY ad");
}
async function odulIslenenler() {
  return (await sorgu("SELECT tarih FROM odul_islenen")).map((r) => r.tarih);
}
async function odulKayitlari() {
  return (await sorgu("SELECT * FROM odul_kayitlari")).map(odulKayitRow);
}

async function bolumDenetimleri(bid) {
  const ds = (await sorgu("SELECT * FROM denetimler WHERE bolum_id = ?", [bid])).map(denetimRow);
  ds.sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || ""))
    .localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
  return ds;
}
async function sonDenetim(bid) {
  return (await bolumDenetimleri(bid))[0] || null;
}

// Bir denetimin kriter bazlı puanları (0-5). Eski 'checked' formatıyla uyumlu.
function denetimKriterPuanlari(d) {
  if (d.puanlar) {
    const out = {};
    for (const k of P.BESS_TUM_KRITERLER) out[k] = parseInt(d.puanlar[k], 10) || 0;
    return out;
  }
  const ch = new Set(d.checked || []);
  const out = {};
  for (const k of P.BESS_TUM_KRITERLER) out[k] = ch.has(k) ? P.BESS_KRITER_PUAN : 0;
  return out;
}

function denetimTarihi(d) {
  return d.denetim_tarihi || d.plan_gun || d.tarih || "";
}

function denetimFotolari(d) {
  const out = [];
  for (const fl of Object.values(d.fotolar || {})) out.push(...fl);
  return out;
}

function turAdiUret(tarih) {
  const [y, m] = String(tarih || "").split("-");
  const ay = S.TR_AYLAR[parseInt(m, 10) - 1];
  return ay ? `${ay} ${y} Denetimi` : "Denetim";
}

async function besSTurAdi(tarih) {
  const r = await tek(
    "SELECT tur_adi FROM denetimler WHERE tarih = ? AND tur_adi IS NOT NULL AND TRIM(tur_adi) != '' LIMIT 1",
    [tarih]);
  return r ? r.tur_adi.trim() : "";
}

async function besSTurlar() {
  return (await sorgu(
    "SELECT DISTINCT tarih FROM denetimler WHERE tarih IS NOT NULL AND tarih != '' ORDER BY tarih DESC"
  )).map((r) => r.tarih);
}

async function besSPlanTur() {
  const r = await tek(
    "SELECT tarih FROM denetimler WHERE puan IS NULL AND tarih != '' ORDER BY tarih DESC LIMIT 1");
  return r ? r.tarih : null;
}

async function besSSonSonucTur() {
  const r = await tek(
    "SELECT tarih FROM denetimler WHERE puan IS NOT NULL AND tarih != '' ORDER BY tarih DESC LIMIT 1");
  return r ? r.tarih : null;
}

async function aksiyonSayilari() {
  const say = {};
  for (const a of await sorgu("SELECT denetim_id, durum FROM aksiyonlar")) {
    const s = (say[a.denetim_id] = say[a.denetim_id] || { toplam: 0, acik: 0 });
    s.toplam += 1;
    if (a.durum === "acik") s.acik += 1;
  }
  return say;
}

// Bir turdaki bölümlerin skor sıralaması + alacakları ödül (önizleme).
// ctx verilirse (denetimler/bolumlar/aksiyonSay) tekrar sorgu atılmaz.
async function besSTurSiralama(tarih, ctx = null) {
  const denetimler = ctx ? ctx.denetimler : await loadDenetimler();
  const bolumlar = ctx ? ctx.bolumlar : await bolumMap();
  const aks = ctx ? ctx.aksiyonSay : await aksiyonSayilari();
  const ds = denetimler.filter((d) => d.tarih === tarih && d.puan !== null);
  ds.sort((a, b) => b.puan - a.puan);
  return ds.map((d, i) => {
    const b = bolumlar[d.bolum_id];
    const ak = aks[d.id] || { toplam: 0, acik: 0 };
    return { sira: i + 1, ad: b ? b.ad : "?", skor: d.puan, odul: S.ODUL_MAP[i] || 0,
      denetim_id: d.id, bolum_id: d.bolum_id, tarih: denetimTarihi(d),
      aksiyon: ak.toplam, aksiyon_acik: ak.acik };
  });
}

async function besSTurTamam(tarih, denetimler = null) {
  const ds = (denetimler || await loadDenetimler()).filter((d) => d.tarih === tarih);
  return ds.length > 0 && ds.every((d) => d.puan !== null);
}

async function besSTurEksikler(tarih, ctx = null) {
  const denetimler = ctx ? ctx.denetimler : await loadDenetimler();
  const bolumlar = ctx ? ctx.bolumlar : await bolumMap();
  const eksik = [];
  for (const d of denetimler) {
    if (d.tarih === tarih && d.puan === null) {
      const b = bolumlar[d.bolum_id];
      if (b) eksik.push(b.ad);
    }
  }
  return eksik;
}

// Bir turun ödüllerini kalıcı deftere işler (ilk 3 bölüm ekibine 100/75/50).
// Tamamı tek transaction'dadır.
async function besSIsle(tarih) {
  if ((await odulIslenenler()).includes(tarih)) return [false, "Bu tur zaten işlenmiş."];
  const denetimler = await loadDenetimler();
  if (!(await besSTurTamam(tarih, denetimler))) {
    const eksik = await besSTurEksikler(tarih, { denetimler, bolumlar: await bolumMap() });
    return [false, `Tüm bölümler denetlenmeden ödül dağıtılamaz. Eksik: ${eksik.join(", ")}`];
  }
  const turdaki = denetimler.filter((d) => d.tarih === tarih && d.puan !== null);
  if (!turdaki.length) return [false, "Bu turda puanlanmış denetim yok."];
  turdaki.sort((a, b) => b.puan - a.puan);
  const turAdi = await besSTurAdi(tarih);
  const bolumlar = await bolumMap();
  const now = S.zamanTr();
  await transaction(async (conn) => {
    for (let sira = 0; sira < Math.min(3, turdaki.length); sira++) {
      const b = bolumlar[turdaki[sira].bolum_id];
      if (!b) continue;
      const kisiler = [b.sorumlu || "", ...(b.kisiler || [])].map((x) => (x || "").trim()).filter(Boolean);
      await calistir(
        `INSERT INTO odul_kayitlari(tarih, tur_adi, bolum_id, bolum_ad, sira, puan, kisiler, islenme_zamani)
         VALUES(?,?,?,?,?,?,?,?)`,
        [tarih, turAdi, b.id, b.ad, sira + 1, S.ODUL_MAP[sira], js(kisiler), now], conn);
    }
    await calistir("INSERT INTO odul_islenen(tarih) VALUES(?)", [tarih], conn);
  });
  return [true, `${tarih} turu işlendi.`];
}

async function besSTurKazananlar(tarih) {
  const ks = (await sorgu("SELECT * FROM odul_kayitlari WHERE tarih = ?", [tarih])).map(odulKayitRow);
  return ks.sort((a, b) => (a.sira || 9) - (b.sira || 9));
}

// İşlenmiş ödül turları (en yenisi hariç) — geçmiş aylar
async function besSArsivAylar() {
  const islenen = (await odulIslenenler()).sort().reverse();
  const guncel = islenen[0] || null;
  const gecmis = [];
  for (const tarih of islenen) {
    if (tarih === guncel) continue;
    gecmis.push({ tarih, kazananlar: await besSTurKazananlar(tarih) });
  }
  return [guncel, gecmis];
}

async function besSGecmisTurlar() {
  const ctx = {
    denetimler: await loadDenetimler(),
    bolumlar: await bolumMap(),
    aksiyonSay: await aksiyonSayilari(),
  };
  const out = [];
  for (const t of await besSTurlar()) {
    out.push({
      tarih: t,
      ad: await besSTurAdi(t),
      siralama: await besSTurSiralama(t, ctx),
      tamam: await besSTurTamam(t, ctx.denetimler),
    });
  }
  return out;
}

// Plan tablosu satırları; aktifDenetmenAd verilirse `benim` işaretlenir.
async function besSPlanSatirlari(tarih, aktifDenetmenAd) {
  const bolumlar = await bolumMap();
  const out = [];
  for (const d of await loadDenetimler()) {
    if (d.tarih !== tarih) continue;
    const b = bolumlar[d.bolum_id];
    const planlanan = d.planlanan_denetmen || "";
    out.push({
      denetim_id: d.id, bolum_id: d.bolum_id, bolum_ad: b ? b.ad : "?",
      lider: b ? b.sorumlu || "" : "",
      planlanan_denetmen: planlanan,
      benim: Boolean(aktifDenetmenAd && I.isimIcerir(planlanan, aktifDenetmenAd)),
      misafir_denetmen: d.misafir_denetmen || "", denetmen: d.denetmen || "",
      plan_gun: d.plan_gun || "", plan_saat: d.plan_saat || "",
      denetim_tarihi: denetimTarihi(d),
      baslangic: d.baslangic || d.tarih || "", bitis: d.bitis || d.tarih || "",
      yapildi: d.puan !== null, puan: d.puan,
    });
  }
  out.sort((a, b) => a.bolum_ad.localeCompare(b.bolum_ad, "tr"));
  return out;
}

// Trend tablosu: satır=bölüm, sütun=denetim turu (eski->yeni), fark renklendirilir.
async function besSTrendTablo() {
  const denetimler = await loadDenetimler();
  const turlar = [...new Set(denetimler.filter((d) => d.tarih && d.puan !== null).map((d) => d.tarih))].sort();
  const basliklar = [];
  for (const t of turlar) basliklar.push({ tarih: t, ad: (await besSTurAdi(t)) || turAdiUret(t) });
  const satirlar = [];
  for (const b of await loadBolumler()) {
    const hucreler = [];
    let onceki = null;
    for (const t of turlar) {
      const d = denetimler.find((x) => x.bolum_id === b.id && x.tarih === t && x.puan !== null);
      if (d) {
        hucreler.push({ puan: d.puan, fark: onceki !== null ? d.puan - onceki : null });
        onceki = d.puan;
      } else hucreler.push(null);
    }
    satirlar.push({ ad: b.ad, hucreler });
  }
  satirlar.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return [basliklar, satirlar];
}

// ---------------------------------------------------------------------------
// Çoklu lider / denetmen
// ---------------------------------------------------------------------------
// 'Ali / Veli' → ['Ali', 'Veli'] — ayraç: / , ;
const isimListesi = I.isimListesi;
function bolumLiderleri(b) {
  return isimListesi((b || {}).sorumlu);
}
// Denetmen adayları = tüm bölümlerin ekip liderleri (benzersiz, sıralı)
async function denetmenAdaylari() {
  const adlar = [];
  for (const b of await loadBolumler()) {
    for (const ad of bolumLiderleri(b)) if (!adlar.includes(ad)) adlar.push(ad);
  }
  return adlar.sort((a, b) => a.localeCompare(b, "tr"));
}
// Şifreden denetmeni bulur (giriş) — hash karşılaştırmalı
async function denetmenBySifre(sifre) {
  if (!sifre) return null;
  for (const d of await loadDenetmenler()) {
    if (checkPassword(d.sifre, sifre)) return d;
  }
  return null;
}
// Oturumdaki denetmen kaydı (silinmiş hesabı düşürür)
async function aktifDenetmen(session) {
  const did = session && session.denetmen_id;
  if (!did) return null;
  const d = await tek("SELECT * FROM denetmenler WHERE id = ?", [did]);
  if (!d) { delete session.denetmen_id; delete session.denetmen_ad; }
  return d || null;
}

// ---------------------------------------------------------------------------
// Ek yöneticiler (ana yönetici dışında, kısıtlı yetkili hesaplar)
// ---------------------------------------------------------------------------
async function loadYoneticiler() {
  return (await sorgu("SELECT * FROM yoneticiler ORDER BY ad")).map(yoneticiRow);
}
async function yoneticiById(id) {
  return yoneticiRow(await tek("SELECT * FROM yoneticiler WHERE id = ?", [id]));
}
// Şifreden ek yöneticiyi bulur (giriş) — hash karşılaştırmalı
async function yoneticiBySifre(sifre) {
  if (!sifre) return null;
  for (const y of await loadYoneticiler()) {
    if (checkPassword(y.sifre, sifre)) return y;
  }
  return null;
}
// Oturumdaki ek yönetici kaydı (silinmiş/yetkisi güncellenmiş hesabı taze okur)
async function aktifYonetici(session) {
  const yid = session && session.yonetici_id;
  if (!yid) return null;
  const y = await yoneticiById(yid);
  if (!y) { delete session.yonetici_id; delete session.yonetici_ad; delete session.admin; }
  return y;
}

// Oturumun yetki durumu (Express'ten bağımsız): ana yönetici / tam yetkili ek yönetici /
// ayrıntılı yetki listesi. Ek yönetici yetkileri her çağrıda veritabanından TAZE okunur.
async function oturumYetkileri(session) {
  const bos = { yonetici: false, ana: false, tam: false, yetkiler: [], ad: null };
  if (!session || !session.admin) return bos;
  if (session.super) {
    return { yonetici: true, ana: true, tam: true, yetkiler: [...Y.TUM_YETKILER], ad: "Ana Yönetici" };
  }
  const y = await aktifYonetici(session);
  if (!y) return bos;
  const g = Y.yetkiGenislet(y.yetkiler);
  return { yonetici: true, ana: false, tam: g.tam, yetkiler: g.yetkiler, ad: y.ad };
}

async function denetmenById(id) {
  return id ? tek("SELECT * FROM denetmenler WHERE id = ?", [id]) : null;
}

// ---------------------------------------------------------------------------
// Düzeltme (revize) ve görev atamaları
// ---------------------------------------------------------------------------
// Kaydı düzenleyebilir mi: 'kayit' yetkisi VEYA düzeltmesi bu denetmene atanmış
function kayitDuzenleyebilir(rec, yetkiler, denetmen) {
  if (!rec) return false;
  if ((yetkiler || []).includes("kayit")) return true;
  return Boolean(denetmen && rec.durum === "Düzeltme İsteniyor" && rec.revize_atanan_id === denetmen.id);
}

// Onaylanan öneri kaizene dönüştürülebilir mi (henüz dönüştürülmemiş + yetkili ya da atanan kişi)
function kaizeneDonusturebilir(oneri, yetkiler, denetmen) {
  if (!oneri || oneri.durum !== "Onaylandı" || oneri.kaizen_no) return false;
  if ((yetkiler || []).some((k) => k === "degerlendir" || k === "kayit")) return true;
  return Boolean(denetmen && oneri.gorev_atanan_id === denetmen.id);
}

async function _revizeKayitlari(sart, params) {
  const out = [];
  for (const [tablo, row] of [["oneriler", oneriRow], ["kaizenler", kaizenRow]]) {
    for (const r of (await sorgu(`SELECT * FROM ${tablo} WHERE durum = 'Düzeltme İsteniyor'${sart}`, params)).map(row)) {
      out.push(r);
    }
  }
  return out.sort((a, b) => String(b.revize_zamani || "").localeCompare(String(a.revize_zamani || "")));
}

// Denetmenin "Görevlerim" sayfası
async function gorevlerim(denetmen) {
  const id = denetmen.id;
  const revizeler = await _revizeKayitlari(" AND revize_atanan_id = ?", [id]);
  const gorevler = (await sorgu(
    "SELECT * FROM oneriler WHERE gorev_atanan_id = ? ORDER BY gorev_zamani DESC", [id])).map(oneriRow);
  const bolumlar = await bolumMap();
  const denetimler = [];
  for (const d of await sorgu("SELECT * FROM denetimler WHERE puan IS NULL ORDER BY tarih DESC")) {
    if (I.isimIcerir(d.planlanan_denetmen, denetmen.ad)) {
      const b = bolumlar[d.bolum_id];
      denetimler.push({ ...d, bolum_ad: b ? b.ad : "?" });
    }
  }
  const aksiyonlar = [];
  for (const a of (await sorgu("SELECT * FROM aksiyonlar WHERE durum = 'acik'")).map(aksiyonRow)) {
    if (I.isimIcerir(await aksiyonAtanan(a, bolumlar), denetmen.ad)) aksiyonlar.push(a);
  }
  return {
    revizeler,
    kontroller: await bugunkuKontroller(denetmen),
    acikGorevler: gorevler.filter((g) => !g.kaizen_no),
    biten: gorevler.filter((g) => g.kaizen_no).slice(0, 10),
    denetimler, aksiyonlar,
  };
}

// Yönetici takip listesi: açık düzeltme ve görev atamaları (kimde ne var)
async function acikAtamalar() {
  const revizeler = await _revizeKayitlari("", []);
  const gorevler = (await sorgu(
    "SELECT * FROM oneriler WHERE gorev_atanan_id IS NOT NULL AND gorev_atanan_id != '' " +
    "AND (kaizen_no IS NULL OR kaizen_no = '') ORDER BY gorev_zamani DESC")).map(oneriRow);
  return { revizeler, gorevler };
}

// Üst menü rozeti: denetmene atanmış bekleyen düzeltme + kaizene dönüştürme görevi sayısı
async function gorevSayisi(denetmenId) {
  const r = await tek(
    "SELECT (SELECT COUNT(*) FROM oneriler WHERE durum = 'Düzeltme İsteniyor' AND revize_atanan_id = ?)" +
    " + (SELECT COUNT(*) FROM kaizenler WHERE durum = 'Düzeltme İsteniyor' AND revize_atanan_id = ?)" +
    " + (SELECT COUNT(*) FROM oneriler WHERE gorev_atanan_id = ? AND (kaizen_no IS NULL OR kaizen_no = ''))" +
    " AS n", [denetmenId, denetmenId, denetmenId]);
  return r ? Number(r.n) : 0;
}

// Bir 5S turunun ödülleri işlendi mi (işlendiyse o turdaki denetimler revize edilemez)
async function turIslendi(tarih) {
  return Boolean(await tek("SELECT 1 FROM odul_islenen WHERE tarih = ?", [tarih || ""]));
}
// ---------------------------------------------------------------------------
// İşlem günlüğü (denetim izi) — yönetici/denetmen eylemleri kaydedilir
// ---------------------------------------------------------------------------
async function gunlukEkle({ kim, rol, mesaj, yol, ip }) {
  try {
    await calistir(
      "INSERT INTO islem_gunlugu(zaman, kim, rol, mesaj, yol, ip) VALUES(?,?,?,?,?,?)",
      [S.zamanTr(), (kim || "").slice(0, 191), (rol || "").slice(0, 16),
        String(mesaj || "").slice(0, 1000), (yol || "").slice(0, 255), (ip || "").slice(0, 64)]);
  } catch (e) { console.error("Günlük yazılamadı:", e.message); }
}
async function loadGunluk(limit = 500) {
  return sorgu("SELECT * FROM islem_gunlugu ORDER BY id DESC LIMIT ?", [limit]);
}
async function gunlukTemizle() {
  await calistir("DELETE FROM islem_gunlugu");
}

// Şifre başka bir hesapta (ana yönetici / denetmen / başka ek yönetici) kullanılıyor mu?
// haricYoneticiId verilirse o ek yönetici kendi şifresini korurken çakışma sayılmaz.
async function sifreCakismasi(sifre, haricYoneticiId = null) {
  if (await adminSifreDogru(sifre)) return true;
  if (await denetmenBySifre(sifre)) return true;
  const y = await yoneticiBySifre(sifre);
  if (y && y.id !== haricYoneticiId) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Aksiyonlar
// ---------------------------------------------------------------------------
// Aksiyonu kapatabilecek kişi = açıldığı bölümün GÜNCEL ekip lideri
async function aksiyonAtanan(a, bolumlar = null) {
  const b = bolumlar ? bolumlar[a.bolum_id] : await bolumById(a.bolum_id);
  if (b && (b.sorumlu || "").trim()) return b.sorumlu.trim();
  return (a.atanan_lider || "").trim();
}
// Yönetici her zaman; denetmen yalnızca kendi bölümünün lideri olarak atanmışsa
// Aksiyon yetkili yönetici her zaman; denetmen yalnızca bölümün ekip lideriyse
async function aksiyonKapatabilir(a, session, bolumlar = null, yetki = null) {
  if (a.durum === "kapali") return false;
  const y = yetki || await oturumYetkileri(session);
  if (y.yetkiler.includes("bes_aksiyon")) return true;
  const d = await aktifDenetmen(session);                  // atanan bölüm lideri
  if (!d) return false;
  return I.isimIcerir(await aksiyonAtanan(a, bolumlar), d.ad);
}

// Aksiyonları iki seviyede gruplar: denetim TURU → BÖLÜM → aksiyonlar
async function aksiyonGruplari(durum, session) {
  const bolumlar = await bolumMap();
  const yetki = await oturumYetkileri(session);
  const turlar = new Map();
  for (const a of await loadAksiyonlar()) {
    if (durum && a.durum !== durum) continue;
    a._atanan = await aksiyonAtanan(a, bolumlar);
    a._kapatabilir = await aksiyonKapatabilir(a, session, bolumlar, yetki);
    const turAdi = a.tur_adi || turAdiUret(a.tarih || "");
    const anahtar = `${a.tarih || ""}|${turAdi}`;
    if (!turlar.has(anahtar)) {
      turlar.set(anahtar, { tarih: a.tarih || "", tur_adi: turAdi, bolumler: new Map(), toplam: 0 });
    }
    const t = turlar.get(anahtar);
    const ad = a.bolum_ad || "?";
    if (!t.bolumler.has(ad)) t.bolumler.set(ad, []);
    t.bolumler.get(ad).push(a);
    t.toplam += 1;
  }
  const out = [...turlar.values()].map((t) => ({
    ...t,
    bolumler: [...t.bolumler.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([ad, aksiyonlar]) => ({ ad, aksiyonlar })),
  }));
  out.sort((a, b) => (b.tarih + b.tur_adi).localeCompare(a.tarih + a.tur_adi));
  return out;
}

function aksiyonFotolari(a) {
  return [...(((a || {}).kapatma || {}).fotolar || [])];
}

// Denetim formundaki 'Aksiyon Ata' alanlarından açık aksiyon kayıtları oluşturur.
// Her kriter için EN FAZLA 2 açık aksiyon; aynı metinli mükerrer eklenmez.
async function syncDenetimAksiyonlari(did, meta, form) {
  const atananLider = (((await bolumById(meta.bolum_id)) || {}).sorumlu || "").trim();
  const mevcutlar = (await sorgu(
    "SELECT * FROM aksiyonlar WHERE denetim_id = ? AND durum = 'acik'", [did])).map(aksiyonRow);
  const mevcutMetinler = new Set(mevcutlar.map((a) => `${a.kriter_k}|${(a.aksiyon || "").trim()}`));
  const acikSayisi = {};
  for (const a of mevcutlar) acikSayisi[a.kriter_k] = (acikSayisi[a.kriter_k] || 0) + 1;

  const now = S.zamanTr();
  let eklendi = 0;
  for (const s of P.BESS) {
    for (const kr of s.kriterler) {
      const k = kr.k;
      for (const slot of [1, 2]) {
        const metin = String(form[`aksiyon_${k}_${slot}`] || "").trim();
        if (!metin || mevcutMetinler.has(`${k}|${metin}`)) continue;
        if ((acikSayisi[k] || 0) >= 2) continue;
        let termin = String(form[`aksiyon_termin_${k}_${slot}`] || "").trim();
        if (termin && meta.tarih && termin <= meta.tarih) termin = ""; // termin denetimden sonra olmalı
        await calistir(
          `INSERT INTO aksiyonlar(id, denetim_id, tarih, tur_adi, bolum_id, bolum_ad,
             kriter_k, kriter_m, aksiyon, sorumlu, atanan_lider, termin, durum, olusturma_zamani, kapatma)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
          [uid(), did, meta.tarih, meta.tur_adi, meta.bolum_id, meta.bolum_ad,
            k, kr.m, metin, String(form[`aksiyon_sorumlu_${k}_${slot}`] || "").trim(),
            atananLider, termin, "acik", now]);
        mevcutMetinler.add(`${k}|${metin}`);
        acikSayisi[k] = (acikSayisi[k] || 0) + 1;
        eklendi += 1;
      }
    }
  }
  return eklendi;
}

// Her kriter için en fazla 3 foto kaydeder (mevcutları korur). files: multer dizisi.
async function saveDenetimFotolar(did, mevcut, files) {
  const fotolar = { ...(mevcut || {}) };
  const grup = {};
  for (const f of files || []) {
    (grup[f.fieldname] = grup[f.fieldname] || []).push(f);
  }
  for (const k of P.BESS_TUM_KRITERLER) {
    const varolan = [...(fotolar[k] || [])];
    for (const f of grup[`foto_${k}`] || []) {
      if (varolan.length >= 3) break;
      if (f && f.originalname && allowedFile(f.originalname)) {
        const ext = path.extname(f.originalname).toLowerCase();
        const fname = `${did}_${k}_${uid().slice(0, 6)}${ext}`;
        if (await gorselKaydet(f, path.join(S.BESS_FOTO_DIR, fname))) varolan.push(fname);
      }
    }
    if (varolan.length) fotolar[k] = varolan;
  }
  return fotolar;
}

// Aksiyon kapatma fotoğrafları (en fazla 5)
async function saveAksiyonFotolar(aid, files) {
  S.ensureDirs();
  const fotolar = [];
  for (const f of files || []) {
    if (fotolar.length >= 5) break;
    if (f && f.originalname && allowedFile(f.originalname)) {
      const ext = path.extname(f.originalname).toLowerCase();
      const fname = `aksiyon_${aid}_${uid().slice(0, 6)}${ext}`;
      if (await gorselKaydet(f, path.join(S.BESS_AKSIYON_FOTO_DIR, fname))) fotolar.push(fname);
    }
  }
  return fotolar;
}

// Kaizen önce/sonra görseli kaydet (file: multer dosyası)
async function kaizenKaydetGorsel(file, etiket, sn) {
  if (file && file.originalname && allowedFile(file.originalname)) {
    const ext = path.extname(file.originalname).toLowerCase();
    const fname = `${sn}_${etiket}${ext}`;
    if (await gorselKaydet(file, path.join(S.KAIZEN_IMG_DIR, fname))) return fname;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5S Periyodik Kontrol Formu (T-FR016): bölüm × ay × gün × madde işaretleri + imzalar
// ---------------------------------------------------------------------------
// Formu doldurabilir: o bölümün ekip lideri (denetmen girişli) veya "denetim yapma" yetkili yönetici
function kontrolDoldurabilir(b, yetkiler, denetmen) {
  if (!b) return false;
  if ((yetkiler || []).includes("bes_denetim")) return true;
  return Boolean(denetmen && I.isimIcerir(b.sorumlu, denetmen.ad));
}
// Haftalık (grup lideri) / aylık (bölüm sorumlusu) kontrol imzası: denetim yetkili yönetici veya
// bölümün kendi ekip lideri OLMAYAN bir denetmen (takım liderini denetleyen kişi)
function kontrolImzalayabilir(b, yetkiler, denetmen) {
  if (!b) return false;
  if ((yetkiler || []).includes("bes_denetim")) return true;
  return Boolean(denetmen && !I.isimIcerir(b.sorumlu, denetmen.ad));
}

// Bir bölümün bir aylık formu: { isaret: {madde: {gun: kayıt}}, onaylar: {"hafta-2": kayıt, "ay-0": kayıt} }
async function kontrolAy(bid, ay) {
  const isaret = {};
  for (const r of await sorgu("SELECT * FROM kontrol_kayitlari WHERE bolum_id = ? AND ay = ?", [bid, ay])) {
    (isaret[r.madde] = isaret[r.madde] || {})[r.gun] = r;
  }
  const onaylar = {};
  for (const r of await sorgu("SELECT * FROM kontrol_onaylari WHERE bolum_id = ? AND ay = ?", [bid, ay])) {
    onaylar[`${r.tip}-${r.sira}`] = r;
  }
  return { isaret, onaylar };
}

// Günün işaretlerini kaydeder (boş bırakılan madde dokunulmaz). Uygunsuz + "aksiyon aç" seçilen
// maddeler için 5S aksiyonu açılır (önlem planı). Dönüş: { kaydedilen, aksiyon }
async function kontrolKaydet(b, ay, gun, isaretler, kim) {
  const now = S.zamanTr();
  let kaydedilen = 0, aksiyon = 0;
  const c = K.ayCoz(ay);
  const turAdi = `Periyodik Kontrol — ${S.TR_AYLAR[c.a - 1]} ${c.y}`;
  for (const x of isaretler) {
    let aksiyonId = null;
    if (x.durum === "uygunsuz" && x.aksiyon && x.aciklama) {
      aksiyonId = uid();
      await calistir(
        `INSERT INTO aksiyonlar(id, denetim_id, tarih, tur_adi, bolum_id, bolum_ad, kriter_k, kriter_m,
           aksiyon, sorumlu, atanan_lider, termin, durum, olusturma_zamani, kapatma)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
        [aksiyonId, "", `${ay}-01`, turAdi, b.id, b.ad, "pk_" + x.madde, K.MADDELER[x.madde].m,
          x.aciklama, (b.sorumlu || "").trim(), (b.sorumlu || "").trim(), x.termin || "", "acik", now]);
      aksiyon += 1;
    }
    await calistir(
      `INSERT INTO kontrol_kayitlari(bolum_id, ay, gun, madde, durum, aciklama, aksiyon_id, isaretleyen, zaman)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE durum = VALUES(durum), aciklama = VALUES(aciklama),
         aksiyon_id = COALESCE(VALUES(aksiyon_id), aksiyon_id), isaretleyen = VALUES(isaretleyen), zaman = VALUES(zaman)`,
      [b.id, ay, gun, x.madde, x.durum, x.aciklama || "", aksiyonId, kim, now]);
    kaydedilen += 1;
  }
  return { kaydedilen, aksiyon };
}

async function kontrolImzala(bid, ay, tip, sira, kim, notu) {
  await calistir(
    `INSERT INTO kontrol_onaylari(bolum_id, ay, tip, sira, onaylayan, notu, zaman) VALUES(?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE onaylayan = VALUES(onaylayan), notu = VALUES(notu), zaman = VALUES(zaman)`,
    [bid, ay, tip, sira, kim, notu || "", S.zamanTr()]);
}

// Tüm bölümlerin bir aylık özeti (Bölümler listesi için): günlük maddeleri tam işaretlenen gün
// sayısı / geçen gün sayısı, uygunsuzluk sayısı, imzalı hafta sayısı, aylık imza
async function kontrolOzet(ay) {
  const bugun = S.bugunIso();
  const gecen = bugun.slice(0, 7) === ay ? parseInt(bugun.slice(8, 10), 10)
    : (ay < bugun.slice(0, 7) ? K.ayGunSayisi(ay) : 0);
  const ozet = {};
  const gunluk = new Set(K.GUNLUK);
  const gunSay = {};
  for (const r of await sorgu("SELECT bolum_id, gun, madde, durum FROM kontrol_kayitlari WHERE ay = ?", [ay])) {
    const o = (ozet[r.bolum_id] = ozet[r.bolum_id] || { tam_gun: 0, uygunsuz: 0, hafta_imza: 0, ay_imza: false });
    if (r.durum === "uygunsuz") o.uygunsuz += 1;
    if (gunluk.has(r.madde)) {
      const key = r.bolum_id + "|" + r.gun;
      gunSay[key] = (gunSay[key] || 0) + 1;
      if (gunSay[key] === gunluk.size) o.tam_gun += 1;
    }
  }
  for (const r of await sorgu("SELECT bolum_id, tip FROM kontrol_onaylari WHERE ay = ?", [ay])) {
    const o = (ozet[r.bolum_id] = ozet[r.bolum_id] || { tam_gun: 0, uygunsuz: 0, hafta_imza: 0, ay_imza: false });
    if (r.tip === "hafta") o.hafta_imza += 1;
    else o.ay_imza = true;
  }
  return { ozet, gecen };
}

// Denetmenin bugün doldurması gereken kontrol formları (ekip lideri olduğu bölümler)
async function bugunkuKontroller(denetmen) {
  const bugun = S.bugunIso();
  const ay = bugun.slice(0, 7), gun = parseInt(bugun.slice(8, 10), 10);
  const out = [];
  for (const b of await loadBolumler()) {
    if (!I.isimIcerir(b.sorumlu, denetmen.ad)) continue;
    const r = await tek(
      `SELECT COUNT(*) AS n FROM kontrol_kayitlari WHERE bolum_id = ? AND ay = ? AND gun = ? AND madde IN (${K.GUNLUK.map(() => "?").join(",")})`,
      [b.id, ay, gun, ...K.GUNLUK]);
    out.push({ id: b.id, ad: b.ad, isaretli: Number(r.n), toplam: K.GUNLUK.length });
  }
  return out;
}

// Marka + logo (static/ içinde adında 'logo' geçen ilk görsel)
const _LOGO_EXT = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
function logoBul() {
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
  hashPassword, hashMi, checkPassword, getAdminPassword, adminSifreDogru,
  setAdminPassword, sifreleriHashle, getSecretKey,
  uid, nextNumber, nextFormNo, safeName, allowedFile, guvenliYol, trdate, ayEtiketi, puanfmt,
  gorselKaydet, getRecord, updateRecord, combinedRecords, filtrele, sayfala, mevcutAylar,
  puanDurumu, dashboardIstatistik, puanVar,
  isimCozucu, isimGruplari, isimBirlestir, isimAyir,
  oturumYetkileri, denetmenById, kayitDuzenleyebilir, kaizeneDonusturebilir,
  gorevlerim, acikAtamalar, gorevSayisi, turIslendi,
  kontrolDoldurabilir, kontrolImzalayabilir, kontrolAy, kontrolKaydet, kontrolImzala, kontrolOzet,
  loadBolumler, bolumById, bolumMap, loadDenetimler, denetimById, loadAksiyonlar, aksiyonById,
  loadDenetmenler, loadMisafirler, odulIslenenler, odulKayitlari,
  bolumDenetimleri, sonDenetim, denetimKriterPuanlari, denetimTarihi, denetimFotolari,
  turAdiUret, besSTurAdi, besSTurlar, besSPlanTur, besSSonSonucTur, aksiyonSayilari,
  besSTurSiralama, besSTurTamam, besSTurEksikler, besSIsle, besSTurKazananlar,
  besSArsivAylar, besSGecmisTurlar, besSPlanSatirlari, besSTrendTablo,
  isimListesi, bolumLiderleri, denetmenAdaylari, denetmenBySifre, aktifDenetmen,
  loadYoneticiler, yoneticiById, yoneticiBySifre, aktifYonetici, sifreCakismasi,
  gunlukEkle, loadGunluk, gunlukTemizle,
  aksiyonAtanan, aksiyonKapatabilir, aksiyonGruplari, aksiyonFotolari,
  syncDenetimAksiyonlari, saveDenetimFotolar, saveAksiyonFotolar, kaizenKaydetGorsel,
  logoBul,
};
