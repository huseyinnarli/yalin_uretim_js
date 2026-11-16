// Görev tanımları — öneri formundaki "Görevi" ve kaizen ekibindeki her kişinin görevi için ORTAK açılır liste.
// - Saklama: config.gorev_tanimlari (JSON dizi, alfabetik). Yönetim › Bölümler ve Görevler sayfası (yetki bes_plan).
// - Kayıtlar görevi METİN olarak saklar (oneriler.gorevi, kaizenler.lider_gorevi, kaizenler.uye_gorevleri JSON);
//   listede ad değişince ya da görev silinince eski kayıtlar değişmez.
// - Liste boşken formlar eski davranışı sürdürür (öneride serbest metin görev, kaizende görev alanı yok).
const L = require("../liste");
const { sorgu, configGet, configSet, j } = require("../db");

const CONFIG_ANAHTARI = "gorev_tanimlari";

function sirala(liste) {
  return [...liste].sort((a, b) => a.localeCompare(b, "tr"));
}

async function gorevTanimlari() {
  const v = j(await configGet(CONFIG_ANAHTARI), []);
  return sirala((Array.isArray(v) ? v : []).map(L.adTemizle).filter(Boolean));
}

async function listeyiKaydet(liste) {
  await configSet(CONFIG_ANAHTARI, JSON.stringify(sirala(liste)));
}

// Toplu ekleme (her öğe bir ad). Listede olanlar (büyük/küçük harf farkıyla) ve tekrarlar atlanır.
async function gorevEkle(adlar) {
  const liste = await gorevTanimlari();
  const { eklenecek, atlanan } = L.yeniAdlar(adlar, liste);
  if (eklenecek.length) await listeyiKaydet([...liste, ...eklenecek]);
  return { eklenen: eklenecek, atlanan };
}

// Ad değişikliği: satirlar = [{ eski, yeni }]. İki görev aynı ada düşerse hiçbiri kaydedilmez.
async function gorevleriGuncelle(satirlar) {
  const liste = await gorevTanimlari();
  const yeniAd = new Map();
  for (const s of satirlar) {
    const yeni = L.adTemizle(s.yeni);
    if (yeni) yeniAd.set(L.anahtar(s.eski), yeni);
  }
  const son = [], gorulen = new Set(), degisiklikler = [];
  for (const ad of liste) {
    const yeni = yeniAd.get(L.anahtar(ad)) || ad;
    if (gorulen.has(L.anahtar(yeni))) {
      return { degisiklikler: [], hata: `Aynı adla iki görev olamaz: “${yeni}”. Hiçbir değişiklik kaydedilmedi.` };
    }
    gorulen.add(L.anahtar(yeni));
    son.push(yeni);
    if (yeni !== ad) degisiklikler.push(`${ad} → ${yeni}`);
  }
  if (degisiklikler.length) await listeyiKaydet(son);
  return { degisiklikler, hata: null };
}

async function gorevSil(ad) {
  const liste = await gorevTanimlari();
  const kalan = liste.filter((x) => L.anahtar(x) !== L.anahtar(ad));
  if (kalan.length === liste.length) return false;
  await listeyiKaydet(kalan);
  return true;
}

// Formdan gelen görev seçimini doğrular (saf). liste = gorevTanimlari(); bosHata: boş seçimde mesaj.
function gorevSecimi(girilen, liste, mevcut = "", { zorunlu = true, bosHata = "Görev seçin." } = {}) {
  const { deger, hata } = L.secimDogrula(girilen, liste, mevcut, {
    zorunlu, bosHata, disariHata: "Görevi listeden seçin.",
  });
  return { gorev: deger, hata };
}

// Kayıtlarda geçen görevler (öneri sahibi + kaizen lideri/üyeleri): anahtar -> { ad (en sık yazılış), n }
async function kayitGorevleri() {
  const sayac = new Map();
  const ekle = (ham, n = 1) => {
    const ad = L.adTemizle(ham);
    if (!ad) return;
    const v = sayac.get(L.anahtar(ad)) || { yazilis: new Map(), n: 0 };
    v.n += n;
    v.yazilis.set(ad, (v.yazilis.get(ad) || 0) + n);
    sayac.set(L.anahtar(ad), v);
  };
  for (const r of await sorgu("SELECT gorevi, COUNT(*) AS n FROM oneriler GROUP BY gorevi")) ekle(r.gorevi, Number(r.n));
  for (const r of await sorgu("SELECT lider_gorevi, uye_gorevleri FROM kaizenler")) {
    ekle(r.lider_gorevi);
    for (const g of j(r.uye_gorevleri, [])) ekle(g);
  }
  const out = new Map();
  for (const [k, v] of sayac) {
    out.set(k, { ad: [...v.yazilis.entries()].sort((a, b) => b[1] - a[1])[0][0], n: v.n });
  }
  return out;
}

// Sayfa özeti: liste + kullanım sayısı; kayıtlarda geçip listede olmayan görevler (en sıktan) — listeyi
// eski kayıtlardan kurmak için öneri olarak gösterilir
async function gorevOzeti() {
  const liste = await gorevTanimlari();
  const kayit = await kayitGorevleri();
  const listede = new Set(liste.map(L.anahtar));
  return {
    liste: liste.map((ad) => ({ ad, n: (kayit.get(L.anahtar(ad)) || { n: 0 }).n })),
    disarida: [...kayit.entries()].filter(([k]) => !listede.has(k)).map(([, v]) => v).sort((a, b) => b.n - a.n),
  };
}

module.exports = { gorevTanimlari, gorevEkle, gorevleriGuncelle, gorevSil, gorevSecimi, gorevOzeti };
