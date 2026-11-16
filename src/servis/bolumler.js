// Bölüm listesi — öneri/kaizen formlarındaki açılır liste ile 5S'in ORTAK ana verisi (tek tablo: bolumler).
//
// - Liste Yönetim › Bölümler sayfasında tutulur (yetki: bes_plan; ana yönetici her zaman).
// - bes_dahil: bölüm 5S'te (denetim planı, periyodik kontrol formu, 5S listeleri) yer alır mı. Varsayılan evet;
//   eski kurulumdaki bölümler 5S'e dahil kalır. 5S dışı bölüm yalnız öneri/kaizen formlarında seçilir.
// - Öneri/kaizen kayıtları bölümü ADIYLA saklar (eski serbest metin kayıtlar ve Excel ile uyumlu). Bölümün adı
//   sonradan değişirse eski kayıtlardaki ad değişmez.
const I = require("../isim");
const L = require("../liste");
const { sorgu, tek, calistir, transaction, js, bolumRow } = require("../db");
const { uid } = require("./yardimci");

const BOLUM_AD_UZUNLUK = L.AD_UZUNLUK;
const bolumAdTemizle = L.adTemizle;
const bolumAnahtar = L.anahtar;

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
  const { deger, hata } = L.secimDogrula(girilen, adlar, mevcut,
    { bosHata: "Bölüm seçin.", disariHata: "Bölümü listeden seçin." });
  return { bolum: deger, hata };
}

// Toplu ekleme (her öğe bir ad). Listede zaten olanlar ve tekrarlar atlanır.
async function bolumEkle(adlar, { besDahil = true, sorumlu = "" } = {}) {
  const { eklenecek, atlanan } = L.yeniAdlar(adlar, (await loadBolumler()).map((b) => b.ad));
  for (const ad of eklenecek) {
    await calistir("INSERT INTO bolumler(id, ad, sorumlu, kisiler, bes_dahil) VALUES(?,?,?,'[]',?)",
      [uid(), ad, sorumlu || "", besDahil ? 1 : 0]);
  }
  return { eklenen: eklenecek, atlanan };
}

// --- Bölüm personeli ve ekip liderleri (5S ödül dağıtımı ve isim birleştirme bu listeyi kullanır) ---

// Toplu personel ekleme: her öğe "Ad Soyad" (son kelime soyad). Tek kelimelik satır hatalı sayılır;
// bu bölümde zaten olan atlanır; başka bölümde de kayıtlı olan eklenir ama bildirilir.
// Döner: { eklenen, atlanan, hatali, baskaBolumde: [{ ad, bolum }] }
async function bolumKisiEkle(bid, satirlar) {
  const b = await bolumById(bid);
  if (!b) return null;
  const digerleri = (await loadBolumler()).filter((x) => x.id !== bid);
  const eklenen = [], atlanan = [], hatali = [], baskaBolumde = [];
  for (const ham of satirlar) {
    const satir = String(ham || "").trim();
    if (!satir) continue;
    const { ad, soyad } = I.adBol(satir);
    if (!ad || !soyad) { hatali.push(satir); continue; }
    const tam = I.adSoyad(ad, soyad);
    if (b.kisiler.some((x) => I.isimEsit(x, tam))) { atlanan.push(tam); continue; }
    b.kisiler.push(tam);
    eklenen.push(tam);
    const diger = digerleri.find((x) => (x.kisiler || []).some((k) => I.isimEsit(k, tam)));
    if (diger) baskaBolumde.push({ ad: tam, bolum: diger.ad });
  }
  if (eklenen.length) await calistir("UPDATE bolumler SET kisiler = ? WHERE id = ?", [js(b.kisiler), b.id]);
  return { eklenen, atlanan, hatali, baskaBolumde };
}

async function bolumKisiSil(bid, ad) {
  const b = await bolumById(bid);
  if (!b) return false;
  const kalan = b.kisiler.filter((k) => k !== ad);
  if (kalan.length === b.kisiler.length) return false;
  await calistir("UPDATE bolumler SET kisiler = ? WHERE id = ?", [js(kalan), b.id]);
  return true;
}

// Ekip liderleri "Ali Yılmaz / Veli Demir" biçiminde saklanır (en fazla 2)
async function bolumLiderKaydet(bid, liderler) {
  const sorumlu = liderler.filter(Boolean).slice(0, 2).join(" / ");
  await calistir("UPDATE bolumler SET sorumlu = ? WHERE id = ?", [sorumlu, bid]);
  return sorumlu;
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
  bolumKisiEkle, bolumKisiSil, bolumLiderKaydet,
};
