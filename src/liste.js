// Yönetilen açılır listeler (bölüm, görev tanımı) için saf yardımcılar — IO yok.
// Kayıtlar seçilen değeri METİN olarak saklar; liste sonradan değişse de eski kayıtlar değişmez.

const AD_UZUNLUK = 80;

// Fazla boşluk temizlenir, uzunluk sınırlanır (yazım biçimi korunur)
function adTemizle(ad) {
  return String(ad == null ? "" : ad).replace(/\s+/g, " ").trim().slice(0, AD_UZUNLUK);
}

// Karşılaştırma anahtarı: büyük/küçük harf (Türkçe kurallarıyla) ve fazla boşluk farkı yok sayılır
function anahtar(ad) {
  return adTemizle(ad).toLocaleLowerCase("tr");
}

// Formdan gelen seçimi doğrular.
// - Liste boşsa (henüz tanımlanmadıysa) serbest metin kabul edilir.
// - Düzenlemede kaydın mevcut değeri listeden kalkmış olsa da korunabilir.
// - zorunlu=false ise boş seçim kabul edilir.
// Döner: { deger, hata } — deger listedeki yazılışıyla
function secimDogrula(girilen, liste, mevcut = "", { zorunlu = true, bosHata = "Seçin.", disariHata = "Listeden seçin." } = {}) {
  const ad = adTemizle(girilen);
  if (!liste.length) return { deger: ad, hata: null };
  if (!ad) return { deger: "", hata: zorunlu ? bosHata : null };
  const bulunan = liste.find((x) => anahtar(x) === anahtar(ad));
  if (bulunan) return { deger: bulunan, hata: null };
  if (mevcut && anahtar(mevcut) === anahtar(ad)) return { deger: adTemizle(mevcut), hata: null };
  return { deger: "", hata: disariHata };
}

// Toplu ekleme için: yeni adları mevcut listeye karşı ayıklar (tekrar ve mevcut olanlar atlanır)
function yeniAdlar(adlar, mevcutListe) {
  const var_ = new Set(mevcutListe.map(anahtar));
  const eklenecek = [], atlanan = [];
  for (const ham of adlar) {
    const ad = adTemizle(ham);
    if (!ad) continue;
    if (var_.has(anahtar(ad))) { atlanan.push(ad); continue; }
    var_.add(anahtar(ad));
    eklenecek.push(ad);
  }
  return { eklenecek, atlanan };
}

module.exports = { AD_UZUNLUK, adTemizle, anahtar, secimDogrula, yeniAdlar };
