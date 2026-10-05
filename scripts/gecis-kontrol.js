// CANLIYA ALMADAN ÖNCE çalıştırılan SALT-OKUNUR ön kontrol.
// Mevcut (eski sürümün kullandığı) veritabanını bu sürümün beklediği şemayla karşılaştırır; isimleri,
// yetkileri ve kayıt durumlarını raporlar. HİÇBİR ŞEY YAZMAZ: bağlantı "READ ONLY" işlem içinde açılır,
// yanlışlıkla bir yazma komutu gönderilse bile veritabanı reddeder; sonunda işlem geri alınır.
//
// Kullanım (sunucuda, uygulama klasöründe):
//   npm run gecis-kontrol                    → rapor ekrana (Markdown)
//   npm run gecis-kontrol > on_kontrol.md    → rapor dosyaya
// Bağlantı: uygulamanın kendisiyle aynı (YALIN_DB_* ortam değişkenleri veya data/db-config.json).
// Kopya veritabanında denemek için: YALIN_DB_DATABASE=yalin_test npm run gecis-kontrol
const mysql = require("mysql2/promise");
const S = require("../src/sabitler");
const I = require("../src/isim");
const Y = require("../src/yetkiler");
const { baglantiAyarlari, semaKomutlari, EK_KOLONLAR, j } = require("../src/db");
const { checkPassword } = require("../src/servis/guvenlik");

const satirlar = [];
const yaz = (s = "") => satirlar.push(s);
const uyarilar = [];   // canlıya almayı ENGELLEYEN durumlar
const notlar = [];     // bilgi / yapılacak iş

// CREATE TABLE metninden kolon adlarını çıkarır (anahtar/indeks satırları hariç)
function semaKolonlari(ddl) {
  const tablo = ddl.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i)[1];
  const govde = ddl.slice(ddl.indexOf("(") + 1, ddl.lastIndexOf(")"));
  const parcalar = [];
  let derinlik = 0, bas = 0;
  for (let i = 0; i < govde.length; i++) {
    if (govde[i] === "(") derinlik++;
    else if (govde[i] === ")") derinlik--;
    else if (govde[i] === "," && derinlik === 0) { parcalar.push(govde.slice(bas, i)); bas = i + 1; }
  }
  parcalar.push(govde.slice(bas));
  const kolonlar = parcalar.map((p) => p.trim()).filter(Boolean)
    .filter((p) => !/^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|FOREIGN)\b/i.test(p))
    .map((p) => p.split(/\s+/)[0].replace(/`/g, ""));
  return { tablo, kolonlar };
}

async function main() {
  const ayar = baglantiAyarlari();
  const c = await mysql.createConnection({ ...ayar, charset: "utf8mb4" });
  await c.query("SET SESSION TRANSACTION READ ONLY");
  await c.query("START TRANSACTION READ ONLY");
  const q = async (sql, p = []) => (await c.query(sql, p))[0];

  const [{ surum }] = await q("SELECT VERSION() AS surum");
  yaz(`# Geçiş ön kontrol raporu`);
  yaz();
  yaz(`- Tarih: ${S.zamanTr()} · Veritabanı: \`${ayar.database}\` @ ${ayar.host}:${ayar.port} · Sunucu: ${surum}`);
  yaz(`- Bu rapor salt-okunur bağlantıyla üretildi; veritabanında hiçbir değişiklik yapılmadı.`);
  yaz();

  // ---------------------------------------------------------------- 1. Şema
  const canli = {};
  for (const r of await q(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()")) {
    (canli[r.t] = canli[r.t] || new Set()).add(r.k);
  }
  // Beklenen kolonlar = CREATE TABLE tanımı + sonradan eklenen kolonlar (EK_KOLONLAR)
  const beklenen = semaKomutlari().map(semaKolonlari);
  for (const b of beklenen) {
    for (const [t, k] of EK_KOLONLAR) if (t === b.tablo && !b.kolonlar.includes(k)) b.kolonlar.push(k);
  }
  const ekKolon = new Set(EK_KOLONLAR.map(([t, k]) => `${t}.${k}`));
  const olusacak = [], eklenecek = [], eksik = [], fazla = [];
  for (const { tablo, kolonlar } of beklenen) {
    if (!canli[tablo]) { olusacak.push(tablo); continue; }
    for (const k of kolonlar) {
      if (canli[tablo].has(k)) continue;
      if (ekKolon.has(`${tablo}.${k}`)) eklenecek.push(`${tablo}.${k}`);
      else eksik.push(`${tablo}.${k}`);
    }
    for (const k of canli[tablo]) if (!kolonlar.includes(k)) fazla.push(`${tablo}.${k}`);
  }
  const kullanilmayan = Object.keys(canli).filter((t) => !beklenen.some((b) => b.tablo === t));

  yaz(`## 1. Şema farkı (uygulama ilk açılışta otomatik yapar — yalnızca EKLEME)`);
  yaz();
  yaz(`| Durum | Adet | Ayrıntı |`);
  yaz(`|---|---|---|`);
  yaz(`| Oluşturulacak yeni tablo | ${olusacak.length} | ${olusacak.join(", ") || "—"} |`);
  yaz(`| Eklenecek yeni kolon | ${eklenecek.length} | ${eklenecek.join(", ") || "—"} |`);
  yaz(`| Var olan, bu sürümün kullanmadığı kolon (dokunulmaz) | ${fazla.length} | ${fazla.join(", ") || "—"} |`);
  yaz(`| Var olan, bu sürümün kullanmadığı tablo (dokunulmaz) | ${kullanilmayan.length} | ${kullanilmayan.join(", ") || "—"} |`);
  yaz(`| ⚠ Eksik ve otomatik EKLENMEYECEK kolon | ${eksik.length} | ${eksik.join(", ") || "—"} |`);
  yaz();
  if (eksik.length) {
    uyarilar.push(`Şemada otomatik eklenmeyecek eksik kolon var (${eksik.join(", ")}). Geliştiriciye bildirin; ` +
      `bu kolonlar src/db.js içindeki EK_KOLONLAR listesine eklenmeden canlıya almayın.`);
  }
  if (!/mariadb/i.test(surum) && !/^8\./.test(surum)) {
    notlar.push(`Sunucu sürümü ${surum}: MySQL 8 / MariaDB 10.6+ önerilir.`);
  }

  // ---------------------------------------------------------------- 2. Kayıt sayıları
  yaz(`## 2. Kayıt sayıları (geçişte değişmez)`);
  yaz();
  yaz(`| Tablo | Satır |`);
  yaz(`|---|---|`);
  for (const { tablo } of beklenen) {
    if (!canli[tablo]) continue;
    const [{ n }] = await q(`SELECT COUNT(*) AS n FROM \`${tablo}\``);
    yaz(`| ${tablo} | ${n} |`);
  }
  yaz();

  // ---------------------------------------------------------------- 3. Öneri / kaizen durumları
  yaz(`## 3. Öneri ve kaizen kayıtları`);
  yaz();
  yaz(`| Tür | Durum | Adet | Yeni sürümde |`);
  yaz(`|---|---|---|---|`);
  for (const [tablo, tur] of [["oneriler", "Öneri"], ["kaizenler", "Kaizen"]]) {
    if (!canli[tablo]) continue;
    for (const r of await q(`SELECT COALESCE(NULLIF(durum, ''), '(boş)') AS d, COUNT(*) AS n FROM ${tablo} GROUP BY d ORDER BY d`)) {
      const etki = r.d === "Reddedildi" ? "Ana listeden çıkar, **Reddedilen & Silinen** arşivinde görünür (red gerekçesi boş: \"—\")"
        : r.d === "Onaylandı" ? "Listede kalır; puanı ve puan listesi aynı" : "Listede kalır";
      yaz(`| ${tur} | ${r.d} | ${r.n} | ${etki} |`);
    }
    if (canli[tablo].has("form_no")) {
      const [{ n }] = await q(`SELECT COUNT(*) AS n FROM ${tablo} WHERE form_no IS NOT NULL AND form_no <> ''`);
      if (n) notlar.push(`${tur}: ${n} kayıtta eski form numarası var — veritabanında korunur, arayüzde/Excel'de gösterilmez.`);
    }
  }
  if (canli.silinen_kayitlar) {
    const [{ n }] = await q("SELECT COUNT(*) AS n FROM silinen_kayitlar");
    yaz(`| — | Silinen (arşivde) | ${n} | **Reddedilen & Silinen** sayfasında, geri yüklenebilir |`);
  }
  yaz();

  // ---------------------------------------------------------------- 4. İsimler
  const kaynaklar = [];
  const ekle = (ad, kaynak) => { if (String(ad || "").trim()) kaynaklar.push({ ad: String(ad), kaynak }); };
  if (canli.oneriler) for (const r of await q("SELECT sahibi FROM oneriler")) ekle(r.sahibi, "Öneri");
  if (canli.kaizenler) {
    for (const r of await q("SELECT lider, uyeler FROM kaizenler")) {
      ekle(r.lider, "Kaizen");
      for (const u of j(r.uyeler, [])) ekle(u, "Kaizen");
    }
  }
  if (canli.odul_kayitlari) for (const r of await q("SELECT kisiler FROM odul_kayitlari")) for (const a of j(r.kisiler, [])) ekle(a, "5S ödülü");
  if (canli.odul_arsiv) for (const r of await q("SELECT ad FROM odul_arsiv")) ekle(r.ad, "Verilen ödül");
  if (canli.bolumler) {
    for (const r of await q("SELECT sorumlu, kisiler FROM bolumler")) {
      for (const a of I.isimListesi(r.sorumlu)) ekle(a, "Bölüm lideri");
      for (const a of j(r.kisiler, [])) ekle(a, "Bölüm üyesi");
    }
  }
  if (canli.denetmenler) for (const r of await q("SELECT ad FROM denetmenler")) ekle(r.ad, "Denetmen");

  const gruplar = new Map();
  for (const { ad, kaynak } of kaynaklar) {
    const k = I.isimAnahtar(ad);
    if (!gruplar.has(k)) gruplar.set(k, { yazimlar: new Map(), kaynak: new Set() });
    const g = gruplar.get(k);
    g.yazimlar.set(ad, (g.yazimlar.get(ad) || 0) + 1);
    g.kaynak.add(kaynak);
  }
  const birlesen = [...gruplar.entries()].filter(([, g]) => g.yazimlar.size > 1);
  const duzeltilecek = new Set(kaynaklar.map((x) => x.ad).filter((a) => I.adDuzelt(a) !== a));
  const tekKelime = [...new Set(kaynaklar.map((x) => x.ad))].filter((a) => I.adDuzelt(a).split(" ").length === 1);
  const cokKelime = [...new Set(kaynaklar.map((x) => I.adDuzelt(x.ad)))].filter((a) => a.split(" ").length >= 3);
  const anahtarlar = [...gruplar.keys()];
  const benzer = [];
  for (let i = 0; i < anahtarlar.length; i++) {
    for (let k = i + 1; k < anahtarlar.length; k++) {
      const a = anahtarlar[i], b = anahtarlar[k];
      const sinir = Math.min(a.length, b.length) >= 10 ? 2 : 1; // isim birleştirme ekranıyla aynı kural
      if (Math.abs(a.length - b.length) <= sinir && I.uzaklik(a, b) <= sinir) benzer.push([a, b]);
    }
  }
  const ornek = (g) => [...g.yazimlar.keys()].map((y) => `"${y}"`).join(" · ");

  yaz(`## 4. İsimler (eski sürümde ad ve soyad TEK kutudan yazılıyordu)`);
  yaz();
  yaz(`Kayıtlardaki isimler **değiştirilmez**. Yeni sürüm isimleri yalnızca puan hesabında ve listelerde bir`);
  yaz(`"anahtar"la karşılaştırır (büyük/küçük harf, fazla boşluk ve ı/i, ş/s, ç/c, ğ/g, ö/o, ü/u farkı yok sayılır).`);
  yaz();
  yaz(`| Konu | Adet |`);
  yaz(`|---|---|`);
  yaz(`| Toplam isim geçişi (tüm kayıtlarda) | ${kaynaklar.length} |`);
  yaz(`| Farklı yazılış | ${new Set(kaynaklar.map((x) => x.ad)).size} |`);
  yaz(`| Kişi (anahtara göre) | ${gruplar.size} |`);
  yaz(`| Otomatik birleşecek kişi (birden çok yazılışı olan) | ${birlesen.length} |`);
  yaz(`| Yazım hatası olabilecek benzer çift (elle karar) | ${benzer.length} |`);
  yaz(`| Büyük/küçük harf veya boşluğu düzensiz yazılış (kayıt düzenlenince düzeltilir) | ${duzeltilecek.size} |`);
  yaz(`| Tek kelimelik isim (soyadı yok) | ${tekKelime.length} |`);
  yaz(`| Üç ve daha çok kelimeli isim (düzenleme formunda son kelime soyad sayılır) | ${cokKelime.length} |`);
  yaz();
  if (birlesen.length) {
    yaz(`**Otomatik birleşecekler** (puan listesinde tek kişi görünür):`);
    yaz();
    for (const [, g] of birlesen.slice(0, 60)) yaz(`- ${ornek(g)} — ${[...g.kaynak].join(", ")}`);
    if (birlesen.length > 60) yaz(`- … ve ${birlesen.length - 60} kişi daha`);
    yaz();
  }
  if (benzer.length) {
    yaz(`**Benzer yazılışlar** — aynı kişiyse Yönetim › 🔗 İsim Birleştirme'den birleştirin, değilse dokunmayın:`);
    yaz();
    for (const [a, b] of benzer.slice(0, 60)) yaz(`- ${ornek(gruplar.get(a))}  ↔  ${ornek(gruplar.get(b))}`);
    yaz();
    notlar.push(`${benzer.length} benzer isim çifti var — canlıya aldıktan sonra İsim Birleştirme sayfasından kontrol edin.`);
  }
  if (tekKelime.length) {
    yaz(`**Tek kelimelik isimler** (soyad kutusu boş gelir; aynı kişinin tam adıyla otomatik birleşmez): ` +
      tekKelime.slice(0, 40).map((a) => `"${a}"`).join(", "));
    yaz();
  }
  if (cokKelime.length) {
    yaz(`**Çok kelimeli isimler** — düzenleme formunda bölünüşü: ` +
      cokKelime.slice(0, 20).map((a) => { const b = I.adBol(a); return `${b.ad} | ${b.soyad}`; }).join(" · "));
    yaz();
  }

  // ---------------------------------------------------------------- 5. Hesaplar ve yetkiler
  yaz(`## 5. Hesaplar ve yetkiler`);
  yaz();
  if (canli.config) {
    const r = (await q("SELECT deger FROM config WHERE anahtar = 'admin_password'"))[0];
    const varsayilan = !r || checkPassword(r.deger, S.ADMIN_PASSWORD);
    yaz(`- Ana yönetici şifresi: ${varsayilan ? "⚠ **VARSAYILAN ŞİFRE** (admin123) — hemen değiştirin" : "değiştirilmiş ✓"}`);
    if (varsayilan) uyarilar.push("Ana yönetici şifresi hâlâ varsayılan (admin123). Kod herkese açık depoda olduğu için bu şifre bilinir.");
  }
  if (canli.yoneticiler) {
    const ad = Object.fromEntries(Y.YETKILER.map((y) => [y.k, y.ad]));
    const liste = await q("SELECT ad, yetkiler FROM yoneticiler ORDER BY ad");
    yaz(`- Ek yöneticiler: ${liste.length}`);
    for (const y of liste) {
      const kayitli = j(y.yetkiler, []);
      const acilan = Y.yetkiGenislet(kayitli).yetkiler.map((k) => ad[k]);
      yaz(`  - **${y.ad}** — kayıtlı: \`${kayitli.join(", ") || "—"}\` → yeni sürümde: ${acilan.join(", ") || "yetki yok"}`);
    }
    if (liste.length) notlar.push("Ek yöneticilerin yetkilerini Yönetim › Yöneticiler'de gözden geçirip bir kez kaydedin.");
  }
  if (canli.bolumler && canli.denetmenler) {
    const denetmen = (await q("SELECT ad FROM denetmenler")).map((r) => r.ad);
    const liderler = [...new Set((await q("SELECT sorumlu FROM bolumler")).flatMap((r) => I.isimListesi(r.sorumlu)))];
    const hesapsiz = liderler.filter((l) => !denetmen.some((d) => I.isimEsit(d, l)));
    yaz(`- Denetmen hesabı: ${denetmen.length} · Bölüm ekip lideri: ${liderler.length} · Hesabı olmayan lider: ${hesapsiz.length}`);
    if (hesapsiz.length) {
      yaz(`  - Hesabı olmayanlar (periyodik kontrol formunu dolduramaz, aksiyon kapatamaz): ${hesapsiz.join(", ")}`);
      notlar.push(`${hesapsiz.length} bölüm liderinin denetmen hesabı yok — Yönetim › Denetmenler'den hesap açın.`);
    }
  }
  yaz();

  // ---------------------------------------------------------------- Sonuç
  yaz(`## Sonuç`);
  yaz();
  if (uyarilar.length) {
    yaz(`**⚠ Canlıya almadan önce çözülmesi gerekenler:**`);
    for (const u of uyarilar) yaz(`- ${u}`);
  } else {
    yaz(`**✓ Şema açısından engel yok.** Uygulama ilk açılışta yalnızca eksik tablo/kolonları ekleyecek; mevcut veri değişmeyecek.`);
  }
  if (notlar.length) {
    yaz();
    yaz(`**Yapılacaklar / bilgi:**`);
    for (const n of notlar) yaz(`- ${n}`);
  }

  await c.query("ROLLBACK");
  await c.end();
  console.log(satirlar.join("\n"));
  process.exit(uyarilar.length ? 2 : 0);
}

main().catch((e) => {
  console.error("Ön kontrol çalıştırılamadı:", e.message);
  process.exit(1);
});
