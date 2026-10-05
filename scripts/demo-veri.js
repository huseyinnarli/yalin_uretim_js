// Demo (tasarım önizleme) için örnek veri. YALNIZCA boş veritabanına yazar — içinde bölüm
// kaydı olan bir veritabanına dokunmaz. Render demo kabında demo-baslat.sh tarafından çağrılır.
// Elle: YALIN_DB_DATABASE=yalin_demo node scripts/demo-veri.js
const db = require("../src/db");
const C = require("../src/cekirdek");
const P = require("../src/puanlama");
const K = require("../src/kontrol");
const S = require("../src/sabitler");
const { calistir, tek, js } = db;

// Tekrarlanabilir "rastgele" (her açılışta aynı demo)
let tohum = 20261005;
function rnd() { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; }
const sec = (dizi) => dizi[Math.floor(rnd() * dizi.length)];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function gunOnce(n) { const d = S.nowTr(); d.setDate(d.getDate() - n); return d; }
function ayBasi(ayOnce) { const d = S.nowTr(); return new Date(d.getFullYear(), d.getMonth() - ayOnce, 1); }
const zaman = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(8 + Math.floor(rnd() * 9))}:${pad(Math.floor(rnd() * 60))}`;

const BOLUMLER = [
  ["Lazer Kesim", "Mehmet Kaya", ["Serkan Aksoy", "Burak Yıldız", "Oğuz Tekin"]],
  ["Abkant Pres", "Ali Yılmaz / Hasan Demir", ["Kemal Uçar", "Tolga Erdem", "Sinan Polat", "Cem Aydın"]],
  ["Toz Boya", "Ayşe Çelik", ["Gökhan Kurt", "Selin Koç", "Volkan Taş"]],
  ["Montaj Hattı 1", "Murat Şahin", ["Deniz Acar", "Eren Bulut", "Yusuf Kılıç", "Onur Çakır"]],
  ["Köpük Enjeksiyon", "Emre Arslan", ["Barış Güneş", "Tuncay Er"]],
  ["Kapı Üretim", "Fatma Öztürk", ["Esra Doğan", "Hakan Yurt", "Kaan Uysal"]],
];
const DENETMENLER = [["Ali Yılmaz", "ali1234"], ["Mehmet Kaya", "mehmet1234"], ["Ayşe Çelik", "ayse1234"], ["Murat Şahin", "murat1234"]];

const ONERILER = [
  ["Abkant kalıp değişiminde hızlı bağlama aparatı", "Kalıp sökme-takma 25 dk sürüyor, cıvatalı bağlantı yavaş.", "Hidrolik hızlı bağlama aparatı ile setup 8 dk'ya iner."],
  ["Lazer fire saclarından küçük braket kesimi", "Fire saclar hurdaya gidiyor.", "Fire sac üzerinde küçük braketler nest edilip kesilebilir."],
  ["Toz boya askı tellerinin yeniden kullanımı", "Her vardiya yeni askı teli kullanılıyor.", "Fırında temizlenen teller yeniden kullanılabilir."],
  ["Montajda tork tabancası askı tutucusu", "Tabanca tezgâhta düşüp hasar görüyor.", "Balanslı askı tutucu takılması."],
  ["Köpük kalıbı ön ısıtma süresinin kısaltılması", "Vardiya başı ön ısıtma 40 dk.", "Isıtıcı zamanlayıcıyla vardiya öncesi otomatik başlasın."],
  ["Forklift yolu kör köşeye konveks ayna", "Depo çıkışında forklift-yaya ramak kala yaşandı.", "Kör köşeye konveks ayna ve yer işareti."],
  ["Kapı contası kesim şablonu", "Conta boyları göz kararı kesiliyor, fire fazla.", "Ölçü işaretli kesim şablonu."],
  ["Kablo demeti hazırlık rafı", "Kablolar hat kenarında dağınık duruyor.", "Model bazlı etiketli kablo rafı."],
  ["Boyahane ön işlem banyosu iletkenlik takibi", "Banyo kimyasalı kontrol edilmiyor, yapışma hatası oluyor.", "Günlük iletkenlik ölçüm formu ve limit etiketi."],
  ["Paketleme bandı makinesi için ayak pedalı", "Operatör iki elini kullanamıyor.", "Ayak pedalı ile bant kesimi."],
  ["Punch makinesi talaş toplama kabı", "Talaş zemine dökülüyor, kayma riski.", "Makine altına eğimli toplama kabı."],
  ["Montaj hattı malzeme besleme kanban kartı", "Hat sık sık malzeme bekliyor.", "İki kutulu kanban sistemi."],
  ["Kompresör hava kaçağı etiketleme", "Hatta hava kaçakları uzun süre giderilmiyor.", "Kaçak tespit etiketi ve haftalık tur."],
  ["Kapı menteşe deliği delme mastarı", "Menteşe delikleri kaçık çıkıyor.", "Sabit pimli delme mastarı (poka-yoke)."],
  ["Lazer nozul değişim süresinin kısaltılması", "Nozul değişimi için anahtar aranıyor.", "Makine yanına gölgelendirilmiş takım panosu."],
  ["Toz boya tabancası temizlik istasyonu", "Renk geçişinde temizlik uzun sürüyor.", "Hazır temizlik istasyonu ve standart sıra."],
  ["Köpük kimyasal varil kapakları", "Açık variller nem alıyor.", "Kilitli kapak ve kullanım etiketi."],
  ["Montaj hattı vida sayma terazisi", "Eksik vida montajı müşteriye gidiyor.", "Kit terazisi ile vida sayısı kontrolü."],
  ["Forklift şarj alanı düzenlemesi", "Şarj alanında kablo dağınıklığı.", "Kablo makarası ve zemin işaretlemesi."],
  ["Abkant arka dayama ölçü tablosu", "Her işte arka dayama deneme ile ayarlanıyor.", "Parça bazlı ölçü tablosu makineye asılsın."],
  ["Kapı üretim yapıştırıcı dozaj pompası", "Yapıştırıcı elle sürülüyor, fazla tüketim.", "Dozaj pompası ile sabit miktar."],
  ["Lazer sac yükleme vakum kaldırıcı", "İki kişi sac taşıyor, ergonomi riski.", "Vakumlu kaldırıcı."],
];
const RED_NEDENLERI = [
  "Benzer çözüm 2025'te denendi, kalite sorunu çıktı.",
  "Yatırım maliyeti kazancın çok üzerinde.",
  "İSG açısından uygun değil — elle müdahale riskini artırıyor.",
];
const KAIZENLER = [
  ["Abkant setup süresinin SMED ile kısaltılması", "Abkant Pres", "Setup 25 dk, kalıplar dağınık.", "Hızlı bağlama + kalıp arabası: setup 9 dk."],
  ["Montaj hattı vida kitleme", "Montaj Hattı 1", "Vidalar kutudan sayılmadan alınıyor.", "Model bazlı vida kitleri: eksik vida sıfırlandı."],
  ["Toz boya fırın askı düzeni", "Toz Boya", "Askılar rastgele diziliyor, fırın boş kalıyor.", "Askı şablonu ile fırın doluluğu %70 → %88."],
  ["Lazer fire nest optimizasyonu", "Lazer Kesim", "Fire oranı %14.", "Nest kuralları ile fire %9."],
  ["Kapı conta kesim aparatı", "Kapı Üretim", "Conta fire %8.", "Şablonlu kesim, fire %2."],
];

async function main() {
  await db.init();
  await C.sifreleriHashle();
  if (await tek("SELECT 1 FROM bolumler LIMIT 1")) {
    console.log("Demo verisi atlandı — veritabanı boş değil.");
    return;
  }
  console.log("Demo verisi yükleniyor…");

  // --- Bölümler, denetmenler, ek yönetici ---
  const bolumler = [];
  for (const [ad, sorumlu, kisiler] of BOLUMLER) {
    const id = C.uid();
    await calistir("INSERT INTO bolumler(id, ad, sorumlu, kisiler) VALUES(?,?,?,?)", [id, ad, sorumlu, js(kisiler)]);
    bolumler.push({ id, ad, sorumlu, kisiler });
  }
  const denetmenId = {};
  for (const [ad, sifre] of DENETMENLER) {
    denetmenId[ad] = C.uid();
    await calistir("INSERT INTO denetmenler(id, ad, sifre, olusturma) VALUES(?,?,?,?)",
      [denetmenId[ad], ad, C.hashPassword(sifre), S.zamanTr()]);
  }
  await calistir("INSERT INTO misafirler(id, ad, olusturma) VALUES(?,?,?)", [C.uid(), "Selim Ekinci", S.zamanTr()]);
  await calistir("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma) VALUES(?,?,?,?,?)",
    [C.uid(), "Zeynep Aydın", C.hashPassword("zeynep1234"), js(["degerlendir", "puanla", "odul", "bes_plan"]), S.zamanTr()]);

  // --- 5S: iki tamamlanmış (ödülleri işlenmiş) tur + bu ayın planı ---
  const turlar = [ayBasi(2), ayBasi(1), ayBasi(0)];
  for (const [ti, bas] of turlar.entries()) {
    const tarih = iso(bas);
    const turAdi = C.turAdiUret(tarih);
    for (const [bi, b] of bolumler.entries()) {
      const id = C.uid();
      const planlanan = bolumler[(bi + 1) % bolumler.length].sorumlu.split(" / ")[0];
      const yapildi = ti < 2 || bi % 2 === 0; // bu ayın turunda yarısı yapılmış
      if (!yapildi) {
        await calistir(
          `INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis, plan_gun, plan_saat,
             planlanan_denetmen, misafir_denetmen, denetmen, puan, checked, uygunsuz, notu, aciklamalar, durum, kayit_zamani)
           VALUES(?,?,?,?,?,?,?,?,?,?,'',NULL,'[]','[]','','{}','bekliyor',?)`,
          [id, b.id, tarih, turAdi, tarih, iso(new Date(bas.getFullYear(), bas.getMonth(), 20)),
            iso(new Date(bas.getFullYear(), bas.getMonth(), 12 + bi)), "10:00", planlanan, bi === 1 ? "Selim Ekinci" : "", zaman(bas)]);
        continue;
      }
      const bulgular = {}, puanlar = {}, aciklamalar = {};
      let skor = 0;
      for (const s of P.BESS) {
        for (const kr of s.kriterler) {
          const sans = rnd();
          const bulgu = kr.kural.tip === "evet_hayir" ? (sans < 0.12 ? 1 : 0) : (sans < 0.55 ? 0 : sans < 0.85 ? 1 : 2);
          bulgular[kr.k] = bulgu;
          puanlar[kr.k] = P.bessKriterPuanla(kr.k, bulgu);
          skor += puanlar[kr.k];
          if (bulgu) aciklamalar[kr.k] = sec(["Etiketsiz kasa", "Zeminde yağ lekesi", "Takım yerinde değil", "Gereksiz palet", "Tabela yıpranmış"]);
        }
      }
      const gun = new Date(bas.getFullYear(), bas.getMonth(), 8 + bi);
      await calistir(
        `INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis, plan_gun, plan_saat,
           planlanan_denetmen, misafir_denetmen, denetmen, puan, puanlar, bulgular, checked, uygunsuz, notu,
           aciklamalar, fotolar, durum, denetim_tarihi, kayit_zamani)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'{}','yapildi',?,?)`,
        [id, b.id, tarih, turAdi, tarih, iso(new Date(bas.getFullYear(), bas.getMonth(), 20)), iso(gun), "10:00",
          planlanan, "", planlanan, skor, js(puanlar), js(bulgular),
          js(P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] === P.BESS_KRITER_MAX[k])),
          js(P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] < P.BESS_KRITER_MAX[k])),
          "Demo denetimi", js(aciklamalar), iso(gun), zaman(gun)]);
      // Uygunsuz bir kritere aksiyon (eski turlarda kapatılmış)
      const uygunsuz = P.BESS_TUM_KRITERLER.find((k) => bulgular[k] > 0);
      if (uygunsuz) {
        const kr = P.BESS.flatMap((s) => s.kriterler).find((x) => x.k === uygunsuz);
        const kapali = ti === 0 || (ti === 1 && bi % 3 !== 0);
        await calistir(
          `INSERT INTO aksiyonlar(id, denetim_id, tarih, tur_adi, bolum_id, bolum_ad, kriter_k, kriter_m,
             aksiyon, sorumlu, atanan_lider, termin, durum, olusturma_zamani, kapatma)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [C.uid(), id, iso(gun), turAdi, b.id, b.ad, uygunsuz, kr.m, aciklamalar[uygunsuz] + " — giderilecek",
            b.sorumlu.split(" / ")[0], b.sorumlu, iso(new Date(gun.getTime() + 14 * 864e5)), kapali ? "kapali" : "acik",
            zaman(gun), kapali ? js({ aciklama: "Giderildi, alan düzenlendi.", kapatan: b.sorumlu.split(" / ")[0],
              fotolar: [], kapatma_zamani: zaman(new Date(gun.getTime() + 7 * 864e5)) }) : null]);
      }
    }
    if (ti < 2) await C.besSIsle(tarih);
  }

  // --- Öneriler ---
  const kisiler = bolumler.flatMap((b) => b.kisiler);
  const ayNo = {};
  const oneriNo = (d) => {
    const yymm = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1);
    ayNo[yymm] = (ayNo[yymm] || 0) + 1;
    return `ÖNFR${yymm}-${pad(ayNo[yymm])}`;
  };
  const puanFormu = () => {
    const f = { p_form: "5", p_komite: String(3 + Math.floor(rnd() * 3)) };
    f[`p_etki_${Math.floor(rnd() * 6)}_${Math.floor(rnd() * 3)}`] = String(10 + 10 * Math.floor(rnd() * 3));
    f[`p_maliyet_${Math.floor(rnd() * 4)}`] = String(5 + 5 * Math.floor(rnd() * 3));
    f[`p_yaygin_${Math.floor(rnd() * 3)}`] = String(5 + 5 * Math.floor(rnd() * 2));
    f[`p_efor_${1 + Math.floor(rnd() * 2)}`] = "10";
    return P.hesaplaPuanlama(f);
  };
  const oneriler = [];
  for (const [i, [konu, detay, cozum]] of ONERILER.entries()) {
    // Listenin sonundakiler en yeni: son kayıtlar değerlendirme bekliyor, eskiler onaylı/puanlı
    const d = gunOnce(Math.floor((ONERILER.length - 1 - i) * 175 / ONERILER.length) + 1);
    let sahibi = sec(kisiler);
    if (i === 3) sahibi = "MEHMET KAYA";   // isim birleştirme örneği (otomatik)
    if (i === 7) sahibi = "Mehmet Kya";    // yazım hatası örneği (İsim Birleştirme önerisi)
    const no = oneriNo(d);
    // Durum dağılımı: eski kayıtlar çoğunlukla onaylı/puanlı, yeniler değerlendirmede
    const durum = i % 7 === 2 ? "Reddedildi" : (i >= 18 ? (i === 19 ? "Düzeltme İsteniyor" : "Değerlendiriliyor") : "Onaylandı");
    const r = { no, tarih: iso(d), sahibi, konu, durum };
    const alan = {
      red_nedeni: durum === "Reddedildi" ? RED_NEDENLERI[i % 3] : null,
      revize_notu: null, revize_atanan_id: null, revize_atanan_ad: null, revize_isteyen: null, revize_zamani: null,
      gorev_atanan_id: null, gorev_atanan_ad: null, gorev_termin: null, gorev_notu: null, gorev_atayan: null, gorev_zamani: null,
      form_no: durum === "Onaylandı" ? await C.nextFormNo() : null, puan: null, puanlama: null,
    };
    if (durum === "Düzeltme İsteniyor") {
      Object.assign(alan, { revize_notu: "Maliyet ve kazanç hesabını ekleyin.", revize_atanan_id: denetmenId["Ali Yılmaz"],
        revize_atanan_ad: "Ali Yılmaz", revize_isteyen: "Zeynep Aydın", revize_zamani: zaman(d) });
    }
    if (durum === "Onaylandı" && i % 4 !== 1) {
      const { puanlama, toplam } = puanFormu();
      alan.puanlama = js(puanlama);
      alan.puan = toplam;
    }
    if (durum === "Onaylandı" && i % 4 === 1) {
      Object.assign(alan, { gorev_atanan_id: denetmenId["Ali Yılmaz"], gorev_atanan_ad: "Ali Yılmaz",
        gorev_termin: iso(gunOnce(-20)), gorev_notu: "Uygulayıp kaizen formunu doldurun.", gorev_atayan: "Ana Yönetici",
        gorev_zamani: zaman(d) });
    }
    await calistir(
      `INSERT INTO oneriler(\`no\`, form_no, tarih, sahibi, gorevi, konu, detay, cozum, kalite, verimlilik, isg, maliyet, ek,
         durum, puan, puanlama, degerlendirme_notu, kayit_zamani, red_nedeni, revize_notu, revize_atanan_id,
         revize_atanan_ad, revize_isteyen, revize_zamani, gorev_atanan_id, gorev_atanan_ad, gorev_termin, gorev_notu,
         gorev_atayan, gorev_zamani)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [no, alan.form_no, iso(d), sahibi, "Operatör", konu, detay, cozum, "Hata azalır", "Süre kısalır", "", "", "",
        durum, alan.puan, alan.puanlama, alan.puan ? "Komite değerlendirmesi" : "", zaman(d), alan.red_nedeni,
        alan.revize_notu, alan.revize_atanan_id, alan.revize_atanan_ad, alan.revize_isteyen, alan.revize_zamani,
        alan.gorev_atanan_id, alan.gorev_atanan_ad, alan.gorev_termin, alan.gorev_notu, alan.gorev_atayan, alan.gorev_zamani]);
    oneriler.push(r);
  }

  // --- Kaizenler (biri öneriden dönüştürülmüş) ---
  const kaynak = oneriler[0];
  for (const [i, [konu, bolum, onceki, sonraki]] of KAIZENLER.entries()) {
    const d = gunOnce(150 - i * 30);
    const yymm = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1);
    ayNo["K" + yymm] = (ayNo["K" + yymm] || 0) + 1;
    const no = `ÖSKFR${yymm}-${pad(ayNo["K" + yymm])}`;
    const b = bolumler.find((x) => x.ad === bolum);
    const lider = b.sorumlu.split(" / ")[0];
    const uyeler = b.kisiler.slice(0, 2);
    const puanli = i < 4;
    const { puanlama, toplam } = puanFormu();
    await calistir(
      `INSERT INTO kaizenler(\`no\`, form_no, baslangic, bitis, konu, bolum, lider, uyeler, sorumlular, kazanclar,
         onceki, sonraki, onceki_gorsel, sonraki_gorsel, durum, puan, puanlama, degerlendirme_notu, kayit_zamani, kaynak_oneri_no)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'','',?,?,?,?,?,?)`,
      [no, puanli ? await C.nextFormNo() : null, iso(d), iso(new Date(d.getTime() + 10 * 864e5)), konu, bolum, lider,
        js(uyeler), [lider, ...uyeler].join(", "), js(["Setup", "Kalite", "5S"].slice(0, 1 + (i % 3))), onceki, sonraki,
        puanli ? "Onaylandı" : "Değerlendiriliyor", puanli ? toplam : null, puanli ? js(puanlama) : null,
        puanli ? "Komite değerlendirmesi" : "", zaman(d), i === 0 ? kaynak.no : null]);
    if (i === 0) await calistir("UPDATE oneriler SET kaizen_no = ? WHERE `no` = ?", [no, kaynak.no]);
  }

  // --- T-FR016 kontrol formu: bu ay, iki bölüm ---
  const bugun = S.bugunIso();
  const ay = bugun.slice(0, 7), sonGun = parseInt(bugun.slice(8, 10), 10);
  for (const b of bolumler.slice(0, 2)) {
    const lider = b.sorumlu.split(" / ")[0];
    for (let g = 1; g <= sonGun; g++) {
      if (K.haftaGunu(ay, g) === 0) continue; // pazar
      for (const m of K.KONTROL_FORMU.maddeler) {
        if (m.p === "H" && K.haftaGunu(ay, g) !== 5) continue; // haftalıklar cuma
        if (m.p === "A" && g !== Math.min(sonGun, 1)) continue;
        const uygunsuz = rnd() < 0.05;
        await calistir(
          `INSERT INTO kontrol_kayitlari(bolum_id, ay, gun, madde, durum, aciklama, isaretleyen, zaman)
           VALUES(?,?,?,?,?,?,?,?)`,
          [b.id, ay, g, m.k, uygunsuz ? "uygunsuz" : "uygun", uygunsuz ? "Tespit edildi, düzeltildi" : "", lider,
            `${pad(g)}.${ay.slice(5)}.${ay.slice(0, 4)} 08:30`]);
      }
    }
    await C.kontrolImzala(b.id, ay, "hafta", 1, "Zeynep Aydın", "");
  }

  console.log("Demo verisi yüklendi.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("Demo verisi hatası:", e); process.exit(1); });
