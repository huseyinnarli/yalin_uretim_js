// T-FR016 Günlük / Haftalık / Aylık 5S ve Güvenlik Kontrol Formu (REV00) — saf tanım.
// Maddeler şirket formundan birebir alınmıştır. Periyot: G = günlük, H = haftalık, A = aylık.
// Takım lideri (bölümün ekip lideri) maddeleri periyoduna göre işaretler; grup lideri her hafta,
// yetkili bölüm sorumlusu her ay sonunda kontrol edip imzalar. Uygunsuzluklar önlem planına
// (uygulamada: 5S aksiyonları) kaydedilir.

const KONTROL_FORMU = {
  kod: "T-FR016",
  rev: "00",
  baslik: "Günlük / Haftalık / Aylık 5S ve Güvenlik Kontrol Formu",
  maddeler: [
    { k: "g1", p: "G", m: "Çalışanların yaptıkları işe uygun kişisel koruyucu malzemeleri tanımlı, sağlam ve kullanılıyor olmalı." },
    { k: "g2", p: "G", m: "Makina-ekipmanın güvenlik donanımı ve acil durdurma butonları var ve çalışıyor durumda olmalı. Üzerlerinde güvenlik talimatları olmalı. Makina/ekipmanı yetkili ve eğitimli kişi kullanıyor olmalı." },
    { k: "g3", p: "G", m: "Tüm acil çıkış kapıları tanımlı, önleri açık olmalı (kapıların önlerinde çıkışı önleyecek araç, malzeme vb. olmamalı)." },
    { k: "g4", p: "G", m: "Elektrik panolarının önleri açık, pano kapakları kapalı olmalı. Elektrik kabloları hasarsız ve korunuyor olmalı." },
    { k: "g5", p: "G", m: "Forklift ve yaya yolları üzerinde araç, malzeme, ekipman, kasa, kalıp, takım vb. olmamalı. Yollar açık ve emniyetli olmalı, düşme/kayma tehlikesi olmamalı." },
    { k: "g6", p: "G", m: "Atık konteynırları, süpürge, faraş kullanılabilir durumda ve yerleri tanımlı olmalı. Atıklar doğru konteynıra atılmış olmalı; yerlerde sac atığı, metal talaşı, yağlı bez, çöp vb. olmamalı." },
    { k: "g7", p: "G", m: "Arızalı/uygunsuz ekipman, makina, hatalı malzeme ve mamullerde uyarıcı tanım olmalı." },
    { k: "g8", p: "G", m: "Hatta ve tezgâhlarda gereksiz takım, malzeme, sehpa, masa, kasa, parça, yağlı bez, takoz, palet, paket kâğıdı vb. olmamalı." },
    { k: "g9", p: "G", m: "Tezgâhlarda kullanılan takım, cihaz ve ekipmanlar tanımlı yerlerinde ve hasarsız olmalı (tezgâh üzerinde/yerde olmamalı)." },
    { k: "g10", p: "G", m: "Gaz tüpleri devrilmeye karşı sabitlenmiş, dik tutuluyor olmalı; kullanım esnasında alev geri tepme valfleri olmalı." },
    { k: "h1", p: "H", m: "Yer çizgileri, etiketler, tanım ve uyarı tabelalarında yıpranma, düşme, yırtılma olmamalı." },
    { k: "h2", p: "H", m: "Hattın duvarlarındaki ve tezgâhlardaki tüm şartlandırıcıların yağları tam, suları boşaltılmış, hava hortumları sağlam, düzenli ve sibopları yerinde olmalı. Hava kaçağı olmamalı, göstergelerde min./max. işaretli olmalı." },
    { k: "h3", p: "H", m: "Duvarlar, yerler ve camların üzerinde kırılma, yıpranma olmamalı." },
    { k: "a1", p: "A", m: "Çalışma alanında kullanılan/bulunan tüm malzeme ve ekipmanların yerleri belirlenmiş, çizilmiş ve yazılı olarak tanımlanmış olmalı." },
    { k: "a2", p: "A", m: "Hatta bulunan dokümanlar tanımlı yerlerinde, hasarsız, temiz ve ulaşılabilir olmalı." },
  ],
  not: "Takım lideri tabloyu kontrol periyoduna göre takip eder. Grup lideri her haftanın Cuma günü kontrolleri " +
    "yaparak takım liderini ve istasyonu denetler. Yetkili bölüm sorumlusu her ayın son Cuma günü kontrolleri " +
    "yaparak grup liderini ve tüm bölümü denetler. Tespit edilen uygunsuzluklar uygunsuzluk önlem planına " +
    "kaydedilerek gerekli aksiyonlar alınır.",
};

const PERIYOTLAR = { G: "Günlük", H: "Haftalık", A: "Aylık" };
const MADDE_KODLARI = KONTROL_FORMU.maddeler.map((m) => m.k);
const MADDELER = Object.fromEntries(KONTROL_FORMU.maddeler.map((m) => [m.k, m]));
const GUNLUK = KONTROL_FORMU.maddeler.filter((m) => m.p === "G").map((m) => m.k);

// "2026-10" doğrulama + parçalar
function ayCoz(ay) {
  const m = String(ay || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10), a = parseInt(m[2], 10);
  if (a < 1 || a > 12 || y < 2000 || y > 2100) return null;
  return { y, a };
}
function ayGunSayisi(ay) {
  const c = ayCoz(ay);
  return c ? new Date(c.y, c.a, 0).getDate() : 0;
}
// Ayın takvim haftası (Pazartesi başlangıçlı): 1..6
function haftaNo(ay, gun) {
  const c = ayCoz(ay);
  const ilkGun = (new Date(c.y, c.a - 1, 1).getDay() + 6) % 7; // 0 = Pazartesi
  return Math.floor((gun - 1 + ilkGun) / 7) + 1;
}
function haftalar(ay) {
  const out = [];
  for (let g = 1; g <= ayGunSayisi(ay); g++) {
    const h = haftaNo(ay, g);
    if (!out[h - 1]) out[h - 1] = { no: h, bas: g, son: g };
    out[h - 1].son = g;
  }
  return out;
}
function haftaGunu(ay, gun) {
  const c = ayCoz(ay);
  return new Date(c.y, c.a - 1, gun).getDay(); // 0 = Pazar
}
function ayKaydir(ay, fark) {
  const c = ayCoz(ay);
  const d = new Date(c.y, c.a - 1 + fark, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

module.exports = {
  KONTROL_FORMU, PERIYOTLAR, MADDE_KODLARI, MADDELER, GUNLUK,
  ayCoz, ayGunSayisi, haftaNo, haftalar, haftaGunu, ayKaydir,
};
