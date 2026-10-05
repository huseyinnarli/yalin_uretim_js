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

// 5S denetim formu — şirket 5S Denetim Raporu şablonundan (toplam 100 puan):
// S1 Ayıklama 25 · S2 Düzenleme 35 · S3 Temizlik 20 · S4 Standartlaştırma 4 · S5 Eğitim-Disiplin 16.
// Denetmen PUAN girmez; soruya göre BULGU SAYISI veya Evet/Hayır girer, puan KURALDAN hesaplanır:
//   kural.tip = "bulgu":      puan = bulgu >= sifir ? 0 : max(0, kr.puan - dusus * bulgu)
//   kural.tip = "evet_hayir": puan = bulgu > 0 ? 0 : kr.puan   (ya tam puan ya 0)
const BESS_KRITER_PUAN = 5; // eski kayıtların 'checked' formatını çevirmek için (geriye dönük)
const BESS = [
  { kod: "s1", ad: "S1 · AYIKLAMA", puan: 25,
    aciklama: "Gerekli malzemelerin, gereksiz olan malzemelerden ayrıştırılması", kriterler: [
    { k: "s1_1", puan: 25, kural: { tip: "bulgu", dusus: 3, sifir: 5 },
      m: "Alandaki tüm unsurlar yapılan işle ilgili mi? (hammadde, yarı mamul, malzeme, alet, ekipman, güncel olmayan bilgi/doküman)" },
  ]},
  { kod: "s2", ad: "S2 · DÜZENLEME", puan: 35,
    aciklama: "İstenilen malzemelerin kolayca bulunabilecek şekilde düzenli olması", kriterler: [
    { k: "s2_1_1", puan: 10, kural: { tip: "bulgu", dusus: 3, sifir: 5 },
      m: "1.1) Sahadaki her şeyin yeri tanımlı mı ve doğru yerinde mi? (dolap/çekmece içleri dahil; ekipmanlarda etiket ve gölgelendirme; kasa ve paletler)" },
    { k: "s2_1_2", puan: 5, kural: { tip: "evet_hayir" },
      m: "1.2) Zeminde yer işaretlemeleri yapılmış mı? (eksik yer varsa puanın tamamı gider)" },
    { k: "s2_2_1", puan: 3, kural: { tip: "evet_hayir" },
      m: "2.1) Tüm aparatlar etiketli mi?" },
    { k: "s2_2_2", puan: 3, kural: { tip: "evet_hayir" },
      m: "2.2) Bölümün aparatları tanımlanmış aparat rafında mı?" },
    { k: "s2_2_3", puan: 4, kural: { tip: "evet_hayir" },
      m: "2.3) Aparat rafları düzenli mi?" },
    { k: "s2_3_1", puan: 6, kural: { tip: "bulgu", dusus: 2, sifir: 3 },
      m: "3.1) Düzenlemeler iş güvenliği ve ergonomi dikkate alınarak yapılmış mı? (zor açılan çekmece, yüksekte ağır malzeme, tonaj aşımı olmamalı)" },
    { k: "s2_3_2", puan: 4, kural: { tip: "evet_hayir" },
      m: "3.2) Personellerde İSG ekipmanları var mı? (en temel: eldiven ve iş güvenliği ayakkabısı)" },
  ]},
  { kod: "s3", ad: "S3 · TEMİZLİK", puan: 20,
    aciklama: "Her yerin / her şeyin temizlenmesi ve daima temiz tutulması", kriterler: [
    { k: "s3_1_1", puan: 3, kural: { tip: "bulgu", dusus: 1, sifir: 3 },
      m: "1.1) Makine, ekipman, taşıma arabası, dolap, masa, cam ve zemin temiz, boyalı, hasarsız mı?" },
    { k: "s3_1_2", puan: 2, kural: { tip: "evet_hayir" },
      m: "1.2) Etiket ve tabelalar temiz mi? (yıpranmış olmamalı)" },
    { k: "s3_1_3", puan: 2, kural: { tip: "evet_hayir" },
      m: "1.3) Atıklar doğru yerlere atılmış mı?" },
    { k: "s3_1_4", puan: 3, kural: { tip: "evet_hayir" },
      m: "1.4) Zemin temiz mi? (yağ, pas, kir yok)" },
    { k: "s3_2_1", puan: 2, kural: { tip: "evet_hayir" },
      m: "2.1) Kirlilik kaynakları tespit edilmiş mi? (kirlilik haritası var mı?)" },
    { k: "s3_2_2", puan: 3, kural: { tip: "evet_hayir" },
      m: "2.2) Kirlilik kaynakları için aksiyon alınmış mı?" },
    { k: "s3_3_1", puan: 2, kural: { tip: "evet_hayir" },
      m: "3.1) Temizlik planına uyularak temizlik düzenli yapılıyor mu?" },
    { k: "s3_3_2", puan: 3, kural: { tip: "evet_hayir" },
      m: "3.2) Temizlik planı güncel mi?" },
  ]},
  { kod: "s4", ad: "S4 · STANDARTLAŞTIRMA", puan: 4,
    aciklama: "Görsel kontrol ile tüm anormalliklerin standartlaştırılması", kriterler: [
    // Form kuralı: "birden fazla uygunsuzlukta puanın tamamı gider" → 0-1 bulgu tam puan, 2+ bulgu 0
    { k: "s4_1", puan: 4, kural: { tip: "bulgu", dusus: 0, sifir: 2 },
      m: "Tanımlamalarda kullanılan bant, boya, etiket ve tabelalar standartlara uygun mu? (mevcut tek standart: zemin tanımlamaları — boya/bant rengi ve kalınlığı)" },
  ]},
  { kod: "s5", ad: "S5 · EĞİTİM-DİSİPLİN", puan: 16,
    aciklama: "Kurallara %100 uyum sağlanması ve bunun alışkanlık haline getirilmesi", kriterler: [
    { k: "s5_1_1", puan: 1, kural: { tip: "evet_hayir" },
      m: "1.1) Önceki denetim sonuçları takım üyeleriyle paylaşılıyor mu?" },
    { k: "s5_1_2", puan: 1, kural: { tip: "evet_hayir" },
      m: "1.2) Takım panosunda önceki 5S denetim sonucu yazıyor mu?" },
    { k: "s5_2", puan: 5, kural: { tip: "evet_hayir" },
      m: "2) Denetim sonuçları aksiyon planına aktarılmış mı? (önceki denetimin TÜM uygunsuzlukları aktarılmış olmalı, yoksa tamamı gider)" },
    { k: "s5_3", puan: 5, kural: { tip: "evet_hayir" },
      m: "3) Önceki denetimden itibaren aksiyon alınmış mı? (son 2 hafta içinde en az 1 aksiyon olmalı; oran açıklamaya yazılır, örn. 7/10)" },
    { k: "s5_4", puan: 2, kural: { tip: "evet_hayir" },
      m: "4) Son 1 ay içinde 5S önerisi verilmiş mi? (metot bölümü kontrol eder)" },
    { k: "s5_5", puan: 2, kural: { tip: "evet_hayir" },
      m: "5) Takım panoları güncel ve düzenli gözden geçiriliyor mu? (denetim tarihinde doldurulmuş mu?)" },
  ]},
];
const BESS_TUM_KRITERLER = BESS.flatMap((s) => s.kriterler.map((k) => k.k));
// k -> maksimum puan haritası (form işleme ve doğrulama için)
const BESS_KRITER_MAX = Object.fromEntries(
  BESS.flatMap((s) => s.kriterler.map((kr) => [kr.k, kr.puan])));
const _BESS_KRITERLER = Object.fromEntries(
  BESS.flatMap((s) => s.kriterler.map((kr) => [kr.k, kr])));

// Bulgu sayısından kriter puanını hesaplar (form kuralları).
function bessKriterPuanla(k, bulgu) {
  const kr = _BESS_KRITERLER[k];
  if (!kr) return 0;
  bulgu = Math.max(0, parseInt(bulgu, 10) || 0);
  const ku = kr.kural;
  if (ku.tip === "evet_hayir") return bulgu > 0 ? 0 : kr.puan;
  if (bulgu >= ku.sifir) return 0;
  return Math.max(0, kr.puan - ku.dusus * bulgu);
}

// Bulgu sayısı kaydı olmayan eski denetimlerde puandan geri tahmin (revize formunu ön-doldurmak için)
function bessBulguTahmin(k, puan) {
  const kr = _BESS_KRITERLER[k];
  if (!kr) return 0;
  puan = parseInt(puan, 10);
  if (Number.isNaN(puan) || puan >= kr.puan) return 0;
  const ku = kr.kural;
  if (ku.tip === "evet_hayir") return 1;
  if (puan <= 0 || !ku.dusus) return ku.sifir;
  return Math.min(ku.sifir, Math.round((kr.puan - puan) / ku.dusus));
}

// Kriter puanlarından S bölümü toplamları: { s1: 22, s2: 35, s3: 20, s4: 4, s5: 16 }
function bessBolumToplamlari(kriterPuanlari) {
  const out = {};
  for (const s of BESS) {
    out[s.kod] = s.kriterler.reduce((t, kr) => t + (parseInt((kriterPuanlari || {})[kr.k], 10) || 0), 0);
  }
  return out;
}

// Kuralın kullanıcıya gösterilecek kısa açıklaması.
function bessKuralMetni(kr) {
  const ku = kr.kural;
  if (ku.tip === "evet_hayir") return "Evet / Hayır — ya tam puan ya 0";
  if (!ku.dusus) return `${ku.sifir}+ bulguda puanın tamamı gider`;
  return `Her bulgu −${ku.dusus} puan; ${ku.sifir}+ bulguda tamamı gider`;
}

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
  BESS, BESS_KRITER_PUAN, BESS_TUM_KRITERLER, BESS_KRITER_MAX,
  bessKriterPuanla, bessKuralMetni, bessBulguTahmin, bessBolumToplamlari,
  hesaplaPuanlama, puanlamaOzet,
};
