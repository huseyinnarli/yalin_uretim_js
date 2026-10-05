// İsim birleştirme: aynı kişinin farklı yazılışları puan listesinde TEK kişi sayılır.
//  - Otomatik: isimAnahtar() büyük/küçük harf, boşluk ve Türkçe karakter farkını yok sayar.
//  - Elle: isim_eslestirme tablosu (kaynak anahtar -> hedef anahtar), yazım hataları için.
// Öneri/kaizen/ödül kayıtlarındaki isimler DEĞİŞMEZ; birleştirme yalnızca hesaplamadadır.
const S = require("../sabitler");
const I = require("../isim");
const { sorgu, calistir, kaizenRow, odulKayitRow } = require("../db");
const { loadBolumler } = require("./bes");
const { loadDenetmenler } = require("./hesaplar");

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

module.exports = {
  isimCozucu, gorunenAd, isimGruplari, isimBirlestir, isimAyir,
};
