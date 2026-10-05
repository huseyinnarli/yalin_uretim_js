// 5S aksiyonları: kimin kapatacağı (bölümün güncel ekip lideri), kapatma izni, gruplu liste,
// denetim formundan aksiyon senkronu ve aksiyon fotoğrafları.
const path = require("path");

const S = require("../sabitler");
const P = require("../puanlama");
const I = require("../isim");
const { sorgu, calistir, aksiyonRow } = require("../db");
const { uid, allowedFile, gorselKaydet } = require("./yardimci");
const { bolumById, bolumMap, loadAksiyonlar, turAdiUret } = require("./bes");
const { aktifDenetmen, oturumYetkileri } = require("./hesaplar");

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

module.exports = {
  aksiyonAtanan, aksiyonKapatabilir, aksiyonGruplari, aksiyonFotolari, syncDenetimAksiyonlari,
  saveAksiyonFotolar,
};
