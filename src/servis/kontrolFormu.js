// 5S periyodik kontrol formu: bölüm × ay × gün × madde işaretleri + haftalık/aylık imzalar.
// Form tanımı ve takvim yardımcıları saf modülde: src/kontrol.js.
const S = require("../sabitler");
const I = require("../isim");
const K = require("../kontrol");
const { sorgu, tek, calistir } = require("../db");
const { loadBolumler } = require("./bes");

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

// Günün işaretlerini kaydeder (boş bırakılan madde dokunulmaz). Uygunsuzluklar formun
// "Uygunsuzluklar" listesinde ve Excel'de görünür; formdan 5S aksiyonu açılmaz. Dönüş: kaydedilen madde sayısı
async function kontrolKaydet(b, ay, gun, isaretler, kim) {
  const now = S.zamanTr();
  let kaydedilen = 0;
  for (const x of isaretler) {
    await calistir(
      `INSERT INTO kontrol_kayitlari(bolum_id, ay, gun, madde, durum, aciklama, isaretleyen, zaman)
       VALUES(?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE durum = VALUES(durum), aciklama = VALUES(aciklama),
         isaretleyen = VALUES(isaretleyen), zaman = VALUES(zaman)`,
      [b.id, ay, gun, x.madde, x.durum, x.aciklama || "", kim, now]);
    kaydedilen += 1;
  }
  return kaydedilen;
}

// Bir bölümün kontrol formu kaydı (işaret veya imza) olan ayları, eskiden yeniye: ["2026-08", "2026-09", ...]
async function kontrolAylari(bid) {
  const satirlar = await sorgu(
    `SELECT DISTINCT ay FROM kontrol_kayitlari WHERE bolum_id = ?
     UNION SELECT DISTINCT ay FROM kontrol_onaylari WHERE bolum_id = ?`, [bid, bid]);
  return [...new Set(satirlar.map((r) => r.ay).filter((a) => K.ayCoz(a)))].sort();
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

module.exports = {
  kontrolDoldurabilir, kontrolImzalayabilir, kontrolAy, kontrolKaydet, kontrolAylari, kontrolImzala,
  kontrolOzet, bugunkuKontroller,
};
