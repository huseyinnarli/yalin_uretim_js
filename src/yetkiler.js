// Yetki tanımları (saf): ek yöneticilere ayrı ayrı verilebilen yetki alanları.
// Ana yönetici (config şifresiyle giren) her zaman tüm yetkilere sahiptir ve silinemez; yönetici hesaplarını
// yönetmek ve işlem günlüğü YALNIZCA ana yöneticidedir — ek yöneticiye "tam yetki" verilemez.

const YETKI_GRUPLARI = [
  { grup: "Öneri & Kaizen", yetkiler: [
    { k: "degerlendir", ad: "Değerlendirme",
      aciklama: "Onay, gerekçeli red, düzeltme isteyip denetmene atama, onaylanan öneriye görev atama" },
    { k: "puanla", ad: "Puanlama",
      aciklama: "Onaylanan öneri ve kaizenlere ★ puan verme" },
    { k: "kayit", ad: "Kayıt düzenle-sil & raporlar",
      aciklama: "Öneri/kaizen düzenleme, silme, silinenleri geri yükleme, Excel indirme" },
  ]},
  { grup: "5S", yetkiler: [
    { k: "bes_plan", ad: "Bölüm & denetim planı",
      aciklama: "Bölüm ve ekip yönetimi, denetim tarihi planlama, denetmen/misafir dağıtımı" },
    { k: "bes_denetim", ad: "Denetim yapma",
      aciklama: "Kendisine planlanmamış olsa da her bölümün denetimini yapabilir" },
    { k: "bes_revize", ad: "Denetim revize & silme",
      aciklama: "Yapılmış denetimi düzeltme (ödülü işlenmemiş turda) ve denetim silme" },
    { k: "bes_aksiyon", ad: "Aksiyon yönetimi",
      aciklama: "Her aksiyonu kapatma ve silme, aksiyon Excel ve fotoğraf ZIP" },
    { k: "bes_odul", ad: "5S ödül & raporlar",
      aciklama: "Tur ödüllerini işleme, denetim Excel/ZIP, 5S trend Excel" },
  ]},
  { grup: "Puan & Ödül", yetkiler: [
    { k: "odul", ad: "Ödül verme & isim birleştirme",
      aciklama: "Puan listesinden ödül verme, kişi gizleme, ödül kaydı silme, isim birleştirme, puan raporları" },
  ]},
  { grup: "Hesaplar", yetkiler: [
    { k: "kullanici", ad: "Denetmen hesapları",
      aciklama: "Denetmen ekleme, şifre belirleme ve silme" },
  ]},
];

const YETKILER = YETKI_GRUPLARI.flatMap((g) => g.yetkiler.map((y) => ({ ...y, grup: g.grup })));
const TUM_YETKILER = YETKILER.map((y) => y.k);
// Önceki sürümlerde kaydedilmiş yetkiler bugünkü ayrıntılı karşılıklarına açılır
// (veritabanındaki kayıt değişmez; yönetici kaydedildiğinde yeni anahtarlarla yazılır).
// "tam": kısa süre sunulan tam yetki seçeneği — artık yalnızca 10 alanın tamamı demektir;
// yönetici hesapları ve işlem günlüğü vermez.
const ESKI_YETKILER = {
  degerlendirme: ["degerlendir", "puanla"],
  bes_s: ["bes_plan", "bes_denetim", "bes_revize", "bes_aksiyon", "bes_odul", "kullanici"],
  tam: TUM_YETKILER,
};

// Kayıtlı listeyi çözer -> { yetkiler }
function yetkiGenislet(liste) {
  const set = new Set();
  for (const k of liste || []) {
    if (ESKI_YETKILER[k]) ESKI_YETKILER[k].forEach((x) => set.add(x));
    else if (TUM_YETKILER.includes(k)) set.add(k);
  }
  return { yetkiler: TUM_YETKILER.filter((k) => set.has(k)) };
}

// Formdan gelen kutucuklar -> kaydedilecek liste (yalnızca tanımlı alanlar)
function yetkiFormdan(v) {
  if (!Array.isArray(v)) v = v ? [v] : [];
  return TUM_YETKILER.filter((k) => v.includes(k));
}

module.exports = { YETKI_GRUPLARI, YETKILER, TUM_YETKILER, ESKI_YETKILER, yetkiGenislet, yetkiFormdan };
