// Puanlama motoru: öneri/kaizen puan rubrikleri + hesaplama + özet,
// ve 5S denetim kriter tanımları (saf, IO/Express bağımsız).

// 1) Temel Şartlar (max 10)
const PUAN_TEMEL = [
  { key: "form", ad: "Form Disiplini",
    aciklama: "Sorun ve çözümün formda okunaklı, net bir şekilde ifade edilmesi.", puan: 5 },
  { key: "komite", ad: "Komite Onayı",
    aciklama: "Fikrin İSG'ye aykırı olmaması, uygulanabilir ve mantıklı bulunması.", puan: 5 },
];

// 2) Etki Odağı (max 40) — yalnızca EN GÜÇLÜ etkinin olduğu tek satır seçilir
const PUAN_ETKI = [
  { odak: "Odak A: Çevrim/Setup (Verimlilik)", seviyeler: [
    { ad: "Mikro", aciklama: "1-5 sn iyileşme veya kalıp değişiminde (setup) %5 hızlanma.", puan: 10 },
    { ad: "Minör", aciklama: "6-15 sn iyileşme veya setup süresinde %15 hızlanma.", puan: 20 },
    { ad: "Majör", aciklama: "16-30 sn iyileşme veya setup süresinde %30 hızlanma.", puan: 30 },
    { ad: "Kritik (SMED)", aciklama: "30+ sn iyileşme, darboğazın aşılması.", puan: 40 },
  ]},
  { odak: "Odak B: Hurda ve Kalite", seviyeler: [
    { ad: "Mikro", aciklama: "Ölçüm yapmayı kolaylaştıran görsel limit şablonları/mastarlar.", puan: 10 },
    { ad: "Minör", aciklama: "Hurda veya tamir oranını %1-%3 arası düşürme.", puan: 20 },
    { ad: "Majör", aciklama: "Hurda oranını %3'ten fazla düşüren parametre/aparat çözümü.", puan: 30 },
    { ad: "Kritik (Poka-Yoke)", aciklama: "Parçanın ters/hatalı takılmasını %100 engelleyen fiziksel tasarım.", puan: 40 },
  ]},
  { odak: "Odak C: Maliyet Düşürme", seviyeler: [
    { ad: "Mikro", aciklama: "Maliyet artışı yaratmaksızın fason işlemin iç prosese çekilmesi (etiket/kablo/profil hatta kesme vb.).", puan: 10 },
    { ad: "Minör", aciklama: "Fason işlemin iç prosese çekilmesiyle komponent maliyetinde %3-%10 iyileşme.", puan: 20 },
    { ad: "Majör", aciklama: "Komponent maliyetinde %10-%30 iyileşme veya reçete bileşeninin yatırımsız kaldırılması.", puan: 30 },
    { ad: "Kritik", aciklama: "Stratejik/yüksek hacimli parçanın tamamen içeride üretilmesi (%30+ düşüş, majör tasarruf).", puan: 40 },
  ]},
  { odak: "Odak D: İSG ve Ergonomi", seviyeler: [
    { ad: "Mikro", aciklama: "Ergonomik iyileştirme (eğilme/uzanma mesafesini ve süresini kısaltma).", puan: 10 },
    { ad: "Minör", aciklama: "Ramak kala tespiti ve basit önlem çözümü (kaygan zemine bant vb.).", puan: 20 },
    { ad: "Kritik", aciklama: "Uzuv kaybı/ağır yaralanmayı %100 önleyecek mekanik bariyer/sviç çözümü.", puan: 40 },
  ]},
  { odak: "Odak E: Süreç ve Dijitalleşme", seviyeler: [
    { ad: "Mikro", aciklama: "Manuel takip edilen bir formun/kaydın dijital ortama taşınması.", puan: 10 },
    { ad: "Minör", aciklama: "Manuel veri toplama işleminin otomatikleştirilmesi/hızlandırılması.", puan: 20 },
    { ad: "Kritik", aciklama: "Hattı/fabrikayı etkileyen sıfır hata-izlenebilirlik; sistem entegrasyonu, kararın algoritmaya bırakılması.", puan: 40 },
  ]},
  { odak: "Odak F: Çevre ve Sürdürülebilirlik", seviyeler: [
    { ad: "Mikro", aciklama: "Basit enerji/atık kazanımı sağlayan saha çözümleri (aydınlatma otomatı, su sensörü vb.).", puan: 10 },
    { ad: "Minör", aciklama: "Endüstriyel sarfiyatların bölgesel düşürülmesi (hava kaçağı, gaz sarfiyatı azaltma).", puan: 20 },
    { ad: "Kritik", aciklama: "Atık geri kazanımı, yüksek tüketimli sistemin verimli hale getirilmesi, karbon ayak izini %5+ düşüren proje.", puan: 40 },
  ]},
];

// 3) Maliyet ve Yatırım (max 20)
const PUAN_MALIYET = [
  { ad: "Sıfır Maliyet", aciklama: "Hurda sac/profilden, sadece atölye imkanlarıyla bedavaya yapılması.", puan: 20 },
  { ad: "Çok Düşük Maliyet", aciklama: "Basit hırdavat, cıvata, standart yay vb. (örn. 2000 TL altı).", puan: 15 },
  { ad: "Orta Maliyet", aciklama: "Dışarıda talaşlı imalat/özel sipariş yedek parça (ROI < 3 ay).", puan: 10 },
  { ad: "Yüksek / Yatırım Bütçesi", aciklama: "Yeni kalıp revizyonu, pahalı sensör/yazılım (3 ay < ROI < 9 ay).", puan: 5 },
];

// 4) Yaygınlaştırma (max 15)
const PUAN_YAYGIN = [
  { ad: "Lokal Çözüm", aciklama: "Sadece tek bir proses/ürün/montaj istasyonu için geçerli.", puan: 5 },
  { ad: "Bölgesel Yayılım", aciklama: "Aynı hattaki/bölümdeki 2-5 makineye, bazı ürün gruplarına uyarlanabilir.", puan: 10 },
  { ad: "Global (Fabrika) Yayılım", aciklama: "Tüm benzer tezgahlara kopyalanıp standart hale getirilebilir, TÜM ürün gruplarına uygulanabilir.", puan: 15 },
];

// 5) Efor ve Sahiplenme (max 15)
const PUAN_EFOR = [
  { ad: "Pasif Katılım", aciklama: "Sadece formu doldurdu, uygulamayı Metot/Bakım'dan bekledi.", puan: 0 },
  { ad: "Ortak Efor", aciklama: "Taslağını çizdi, bakımcıyla tezgâh başında beraber çalıştı.", puan: 10 },
  { ad: "Anahtar Teslim (Otonom)", aciklama: "Malzemeyi buldu, kendisi yaptı, çalışır halde teslim etti.", puan: 15 },
];

// 5S denetim formu — 5 kategori × 4 kriter × 5 puan = 100
const BESS_KRITER_PUAN = 5;
const BESS = [
  { kod: "1s", ad: "1S · Seiri (Ayıklama)", kriterler: [
    { k: "1s1", m: "Çalışma alanında gereksiz malzeme/alet bulunmuyor" },
    { k: "1s2", m: "Kullanılmayan ekipman ortamdan uzaklaştırılmış" },
    { k: "1s3", m: "Sadece o işe ait malzemeler bulunuyor" },
    { k: "1s4", m: "Kırmızı etiket (red-tag) uygulaması yapılmış" },
  ]},
  { kod: "2s", ad: "2S · Seiton (Düzenleme)", kriterler: [
    { k: "2s1", m: "Her alet/malzemenin belirli bir yeri var" },
    { k: "2s2", m: "Yerler etiketlenmiş/işaretlenmiş (gölge pano vb.)" },
    { k: "2s3", m: "Sık kullanılanlar kolay erişilebilir konumda" },
    { k: "2s4", m: "Yer işaretlemeleri (çizgiler) net ve sağlam" },
  ]},
  { kod: "3s", ad: "3S · Seiso (Temizlik)", kriterler: [
    { k: "3s1", m: "Zemin ve yüzeyler temiz" },
    { k: "3s2", m: "Makine/ekipman temiz ve bakımlı" },
    { k: "3s3", m: "Temizlik ekipmanları mevcut ve yerinde" },
    { k: "3s4", m: "Kir/sızıntı kaynakları giderilmiş" },
  ]},
  { kod: "4s", ad: "4S · Seiketsu (Standartlaştırma)", kriterler: [
    { k: "4s1", m: "5S standartları görünür şekilde asılı" },
    { k: "4s2", m: "Görsel yönetim (renk/etiket) uygulanıyor" },
    { k: "4s3", m: "Sorumluluklar belirlenmiş (5S panosu)" },
    { k: "4s4", m: "Standartlara uyum düzenli kontrol ediliyor" },
  ]},
  { kod: "5s", ad: "5S · Shitsuke (Disiplin)", kriterler: [
    { k: "5s1", m: "Personel 5S kurallarını biliyor" },
    { k: "5s2", m: "Önceki denetim bulguları kapatılmış" },
    { k: "5s3", m: "Düzenli 5S faaliyeti (rutin) var" },
    { k: "5s4", m: "5S kültürü/katılım gözlemleniyor" },
  ]},
];
const BESS_TUM_KRITERLER = BESS.flatMap((s) => s.kriterler.map((k) => k.k));

// Her bölümün maksimum puanı (toplam 100)
const PUAN_MAX = { temel: 10, etki: 40, maliyet: 20, yaygin: 15, efor: 15 };

// Form alanlarından bölüm bazlı puan hesaplar; { puanlama, toplam } döner.
// Temel: ÇOKLU (toplanır) · Etki/Maliyet/Yaygın/Efor: TEK (en yüksek madde sayılır).
function hesaplaPuanlama(form) {
  const p = {};
  const items = {};

  function clamp(name, maxv) {
    const v = parseInt(form[name], 10);
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(maxv, v));
  }

  let temel = 0;
  for (const it of PUAN_TEMEL) {
    const nm = "p_" + it.key;
    const v = clamp(nm, it.puan);
    if (v) items[nm] = v;
    temel += v;
  }
  p.temel = Math.min(temel, PUAN_MAX.temel);

  let best = [0, "", null];
  PUAN_ETKI.forEach((odak, oi) => {
    odak.seviyeler.forEach((s, si) => {
      const nm = `p_etki_${oi}_${si}`;
      const v = clamp(nm, s.puan);
      if (v > best[0]) best = [v, odak.odak, nm];
    });
  });
  p.etki = Math.min(best[0], PUAN_MAX.etki);
  p.etki_odak = best[1];
  if (best[2]) items[best[2]] = best[0];

  for (const [key, tablo] of [["maliyet", PUAN_MALIYET], ["yaygin", PUAN_YAYGIN], ["efor", PUAN_EFOR]]) {
    let b = [0, null];
    tablo.forEach((it, i) => {
      const nm = `p_${key}_${i}`;
      const v = clamp(nm, it.puan);
      if (v > b[0]) b = [v, nm];
    });
    p[key] = Math.min(b[0], PUAN_MAX[key]);
    if (b[1]) items[b[1]] = b[0];
  }

  p.puan_items = items;
  const toplam = p.temel + p.etki + p.maliyet + p.yaygin + p.efor;
  p.toplam = toplam;
  return { puanlama: p, toplam };
}

// Kırılım özetini metin olarak döner (detay & Excel için).
function puanlamaOzet(p) {
  if (!p) return "";
  if ("temel" in p) {
    let etki = `Etki: ${p.etki || 0}`;
    if (p.etki_odak) etki += ` (${p.etki_odak})`;
    const parts = [`Temel: ${p.temel || 0}`, etki, `Maliyet: ${p.maliyet || 0}`,
      `Yaygın: ${p.yaygin || 0}`, `Efor: ${p.efor || 0}`];
    return parts.join(" | ") + `  =  ${p.toplam || 0}/100`;
  }
  // Eski yapı (geriye dönük — JSON'dan aktarılan kayıtlar)
  const parts = [`Temel: ${(p.form || 0) + (p.komite || 0)}`];
  if (p.etki_label) parts.push(`Etki: ${p.etki_label} (${p.etki || 0})`);
  if (p.maliyet_label) parts.push(`Maliyet: ${p.maliyet_label} (${p.maliyet || 0})`);
  if (p.yaygin_label) parts.push(`Yaygın: ${p.yaygin_label} (${p.yaygin || 0})`);
  if (p.efor_label) parts.push(`Efor: ${p.efor_label} (${p.efor || 0})`);
  return parts.join(" | ") + `  =  ${p.toplam || 0}/100`;
}

module.exports = {
  PUAN_TEMEL, PUAN_ETKI, PUAN_MALIYET, PUAN_YAYGIN, PUAN_EFOR, PUAN_MAX,
  BESS, BESS_KRITER_PUAN, BESS_TUM_KRITERLER,
  hesaplaPuanlama, puanlamaOzet,
};
