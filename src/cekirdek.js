// Çekirdek iş mantığının TEK giriş noktası (cephe). İş kuralları alan modüllerindedir (src/servis/*);
// rotalar, Excel üretimi ve scriptler `const C = require("./cekirdek")` ile hepsine buradan ulaşır.
// Express'ten bağımsızdır: oturum/yetki bilgisi parametre olarak alınır. Tüm veri erişimi asenkrondur.
//
// Modüller ve bağımlılık katmanları (bir modül yalnızca ALTTAKİ katmanlara dayanır — döngüsel bağımlılık yok):
//   0  guvenlik      şifre hash/doğrulama, ana yönetici şifresi, oturum imza anahtarı
//      yardimci      numara/kimlik üretimi, tarih-puan biçimi, güvenli dosya yolu, görsel işleme, logo
//      gunluk        işlem günlüğü
//   1  kayitlar      öneri/kaizen okuma-yazma, liste filtresi + sayfalama, düzenleme izni, kaizen görseli
//      bes           5S bölüm/denetim/tur/ödül defteri/trend, denetim fotoğrafları
//   2  hesaplar      denetmen + misafir + ek yönetici hesapları, oturum yetkileri, şifre çakışması
//      kontrolFormu  5S periyodik kontrol formu (işaret + imza + aylık özet)
//   3  isimler       isim birleştirme (otomatik anahtar + elle eşleştirme)
//      aksiyon       5S aksiyonları (kapatma izni, gruplu liste, denetimden senkron, fotoğraf)
//   4  puan          kişi puan durumu
//      gorevler      düzeltme/görev atamaları, Görevlerim, menü rozeti
//      panel         panel istatistikleri + 12 ay trendi
const MODULLER = [
  "guvenlik", "yardimci", "gunluk",
  "kayitlar", "bes",
  "hesaplar", "kontrolFormu",
  "isimler", "aksiyon",
  "puan", "gorevler", "panel",
];

const cephe = {};
for (const ad of MODULLER) {
  for (const [isim, deger] of Object.entries(require(`./servis/${ad}`))) {
    // Aynı adın iki modülde tanımlanması sessizce ezilmesin
    if (isim in cephe) throw new Error(`cekirdek: '${isim}' birden fazla modülde tanımlı (${ad})`);
    cephe[isim] = deger;
  }
}

module.exports = cephe;
