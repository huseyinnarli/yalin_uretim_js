// İsim yardımcıları (saf, bağımlılıksız): ad/soyad birleştirme, Türkçe büyük-küçük harf
// düzeltme ve puan listesinde aynı kişiyi tanımak için karşılaştırma anahtarı.

// "aYşE nUR" -> "Ayşe Nur" (Türkçe kurallarla: i→İ, ı→I). Tire ile ayrılan adlar da düzeltilir.
function kelimeDuzelt(w) {
  return w.split("-").map((p) => (p
    ? p.charAt(0).toLocaleUpperCase("tr") + p.slice(1).toLocaleLowerCase("tr")
    : p)).join("-");
}

// Boşlukları sadeleştirir ve her kelimeyi baş harfi büyük yazar.
function adDuzelt(s) {
  return String(s || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
    .map(kelimeDuzelt).join(" ");
}

// Ayrı kutulardan gelen ad + soyad -> "Ad Soyad"
function adSoyad(ad, soyad) {
  return [adDuzelt(ad), adDuzelt(soyad)].filter(Boolean).join(" ");
}

// Tek parça kayıtlı ismi düzenleme formu için böler: son kelime soyad, kalanı ad.
function adBol(tam) {
  const k = adDuzelt(tam).split(" ").filter(Boolean);
  if (k.length < 2) return { ad: k.join(" "), soyad: "" };
  return { ad: k.slice(0, -1).join(" "), soyad: k[k.length - 1] };
}

// Karşılaştırma anahtarı: büyük/küçük harf, fazla boşluk, noktalama ve Türkçe karakter
// farklarını yok sayar ("ALİ  YILMAZ", "ali yilmaz", "Ali Yılmaz." -> "ali yilmaz").
// Kayıtlardaki isimler DEĞİŞMEZ; anahtar yalnızca gruplama/eşleştirme içindir.
const _KATLA = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u" };
function isimAnahtar(s) {
  return String(s || "").toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => _KATLA[c])
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function isimEsit(a, b) {
  const ka = isimAnahtar(a);
  return Boolean(ka) && ka === isimAnahtar(b);
}

// 'Ali / Veli' -> ['Ali', 'Veli'] — ayraç: / , ;
function isimListesi(s) {
  return String(s || "").replace(/[,;]/g, "/").split("/").map((x) => x.trim()).filter(Boolean);
}

// "Ali Yılmaz / Veli Kaya" listesinde ad var mı (anahtarla karşılaştırır)
function isimIcerir(liste, ad) {
  return isimListesi(liste).some((x) => isimEsit(x, ad));
}

// Türkçe karakter içeren yazımı tercih etmek için (görünen ad seçiminde)
function turkceKarakterSayisi(s) {
  return (String(s || "").match(/[çğıöşüÇĞİÖŞÜ]/g) || []).length;
}

// İki anahtar arasındaki düzenleme uzaklığı (yazım hatası önerileri için). Yan yana iki harfin
// yer değiştirmesi ("Tset" / "Test") tek hata sayılır (Damerau-Levenshtein, OSA).
function uzaklik(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const maliyet = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + maliyet);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

module.exports = {
  adDuzelt, adSoyad, adBol, isimAnahtar, isimEsit, isimListesi, isimIcerir,
  turkceKarakterSayisi, uzaklik,
};
