// Bölüm listesi — öneri/kaizen formlarındaki açılır liste ile 5S'in ORTAK ana verisi (tek tablo: bolumler).
//
// - Liste Yönetim › Bölümler sayfasında tutulur (yetki: bes_plan; ana yönetici her zaman).
// - bes_dahil: bölüm 5S'te (denetim planı, periyodik kontrol formu, 5S listeleri) yer alır mı. Varsayılan evet;
//   eski kurulumdaki bölümler 5S'e dahil kalır. 5S dışı bölüm yalnız öneri/kaizen formlarında seçilir.
// - Öneri/kaizen kayıtları bölümü ADIYLA saklar (eski serbest metin kayıtlar ve Excel ile uyumlu). Bölümün adı
//   sonradan değişirse eski kayıtlardaki ad değişmez.
const { sorgu, tek, calistir, transaction, bolumRow } = require("../db");
const { uid } = require("./yardimci");

const BOLUM_AD_UZUNLUK = 80;

function bolumAdTemizle(ad) {
  return String(ad == null ? "" : ad).replace(/\s+/g, " ").trim().slice(0, BOLUM_AD_UZUNLUK);
}

// Karşılaştırma anahtarı: büyük/küçük harf (Türkçe kurallarıyla) ve fazla boşluk farkı yok sayılır
function bolumAnahtar(ad) {
  return bolumAdTemizle(ad).toLocaleLowerCase("tr");
}

async function loadBolumler() {
  return (await sorgu("SELECT * FROM bolumler ORDER BY ad")).map(bolumRow);
}

async function bolumById(bid) {
  return bolumRow(await tek("SELECT * FROM bolumler WHERE id = ?", [bid]));
}

// id -> bölüm haritası (döngülerde N+1 sorguyu önler). 5S'ten çıkarılmış bölümler de dahildir:
// geçmiş denetimler ve aksiyonlar adlarını buradan çözer.
async function bolumMap() {
  const m = {};
  for (const b of await loadBolumler()) m[b.id] = b;
  return m;
}

// 5S'e dahil bölümler (denetim planı, kontrol formu, 5S bölüm tablosu)
async function besBolumleri() {
  return (await loadBolumler()).filter((b) => b.bes_dahil);
}

// Öneri/kaizen formundaki açılır listenin seçenekleri (alfabetik, tüm bölümler)
async function bolumAdlari() {
  return (await loadBolumler()).map((b) => b.ad);
}

// Formdan gelen bölüm seçimini doğrular (saf). adlar = bolumAdlari().
// - Liste henüz tanımlanmamışsa serbest metin kabul edilir (yeni kurulum).
// - Düzenlemede kaydın mevcut bölümü listeden kalkmış olsa da korunabilir.
// Döner: { bolum, hata } — bolum listedeki yazılışıyla
function bolumSecimi(girilen, adlar, mevcut = "") {
  const ad = bolumAdTemizle(girilen);
  if (!adlar.length) return { bolum: ad, hata: null };
  if (!ad) return { bolum: "", hata: "Bölüm seçin." };
  const bulunan = adlar.find((a) => bolumAnahtar(a) === bolumAnahtar(ad));
  if (bulunan) return { bolum: bulunan, hata: null };
  if (mevcut && bolumAnahtar(mevcut) === bolumAnahtar(ad)) return { bolum: mevcut, hata: null };
  return { bolum: "", hata: "Bölümü listeden seçin." };
}

// Toplu ekleme (her öğe bir ad). Listede zaten olanlar ve tekrarlar atlanır.
async function bolumEkle(adlar, { besDahil = true, sorumlu = "" } = {}) {
  const var_ = new Set((await loadBolumler()).map((b) => bolumAnahtar(b.ad)));
  const eklenen = [], atlanan = [];
  for (const ham of adlar) {
    const ad = bolumAdTemizle(ham);
    if (!ad) continue;
    if (var_.has(bolumAnahtar(ad))) { atlanan.push(ad); continue; }
    var_.add(bolumAnahtar(ad));
    await calistir("INSERT INTO bolumler(id, ad, sorumlu, kisiler, bes_dahil) VALUES(?,?,?,'[]',?)",
      [uid(), ad, sorumlu || "", besDahil ? 1 : 0]);
    eklenen.push(ad);
  }
  return { eklenen, atlanan };
}

// Bölümler sayfasının tek "Kaydet"i: satirlar = [{ id, ad, bes_dahil }]. Yalnız gönderilen id'ler güncellenir.
// İki bölüm aynı ada düşerse hiçbir şey kaydedilmez.
// Döner: { degisiklikler, hata, planliCikan } — degisiklikler: okunur özet satırları (işlem günlüğüne de düşer);
// planliCikan: 5S'ten çıkarılan ve bekleyen (yapılmamış) denetim planı olan bölümler
async function bolumleriGuncelle(satirlar) {
  const liste = await loadBolumler();
  const gelen = new Map(satirlar.map((s) => [s.id, s]));
  const sonAd = new Map(); // anahtar -> ad (çakışma denetimi, değişmeyen bölümler dahil)
  const degisecek = [];
  for (const b of liste) {
    const s = gelen.get(b.id);
    const ad = s ? (bolumAdTemizle(s.ad) || b.ad) : b.ad;
    const dahil = s ? Boolean(s.bes_dahil) : b.bes_dahil;
    const anahtar = bolumAnahtar(ad);
    if (sonAd.has(anahtar)) {
      return { degisiklikler: [], hata: `Aynı adla iki bölüm olamaz: “${ad}”. Hiçbir değişiklik kaydedilmedi.`, planliCikan: [] };
    }
    sonAd.set(anahtar, ad);
    if (ad !== b.ad || dahil !== b.bes_dahil) degisecek.push({ b, ad, dahil });
  }
  const planliCikan = [], degisiklikler = [];
  await transaction(async (conn) => {
    for (const { b, ad, dahil } of degisecek) {
      await calistir("UPDATE bolumler SET ad = ?, bes_dahil = ? WHERE id = ?", [ad, dahil ? 1 : 0, b.id], conn);
    }
  });
  for (const { b, ad, dahil } of degisecek) {
    if (ad !== b.ad) degisiklikler.push(`${b.ad} → ${ad}`);
    if (dahil !== b.bes_dahil) degisiklikler.push(`${ad} ${dahil ? "5S'e dahil edildi" : "5S dışına alındı"}`);
    if (b.bes_dahil && !dahil) {
      const r = await tek("SELECT COUNT(*) AS n FROM denetimler WHERE bolum_id = ? AND puan IS NULL", [b.id]);
      if (Number(r.n)) planliCikan.push(ad);
    }
  }
  return { degisiklikler, hata: null, planliCikan };
}

// Her bölümün kullanımı: { [id]: { oneri, kaizen, denetim } } — öneri/kaizen ADLA eşleşir, denetim id ile
async function bolumKullanim() {
  const liste = await loadBolumler();
  const sayAd = async (tablo) => {
    const m = new Map();
    for (const r of await sorgu(`SELECT bolum, COUNT(*) AS n FROM ${tablo} GROUP BY bolum`)) {
      const k = bolumAnahtar(r.bolum);
      if (k) m.set(k, (m.get(k) || 0) + Number(r.n));
    }
    return m;
  };
  const oneri = await sayAd("oneriler"), kaizen = await sayAd("kaizenler");
  const denetim = new Map();
  for (const r of await sorgu("SELECT bolum_id, COUNT(*) AS n FROM denetimler WHERE puan IS NOT NULL GROUP BY bolum_id")) {
    denetim.set(r.bolum_id, Number(r.n));
  }
  const out = {};
  for (const b of liste) {
    const k = bolumAnahtar(b.ad);
    out[b.id] = { oneri: oneri.get(k) || 0, kaizen: kaizen.get(k) || 0, denetim: denetim.get(b.id) || 0 };
  }
  return out;
}

module.exports = {
  BOLUM_AD_UZUNLUK, bolumAdTemizle, bolumAnahtar,
  loadBolumler, bolumById, bolumMap, besBolumleri, bolumAdlari, bolumSecimi,
  bolumEkle, bolumleriGuncelle, bolumKullanim,
};
