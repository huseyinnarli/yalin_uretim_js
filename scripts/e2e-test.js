// Uçtan uca test: ayrı MySQL veritabanı (yalin_e2e) + geçici veri klasörü + ayrı port.
// Canlı veritabanına ve görsellere dokunmaz. Çalıştırma: npm test
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PROJE = path.dirname(__dirname);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "yalin-e2e-"));
const PORT = 5001;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DB = process.env.YALIN_E2E_DB || "yalin_e2e";

// Bağlantı bilgisi: canlı data/db-config.json'dan okunur, yalnızca veritabanı adı değişir
let anaCfg = {};
try {
  anaCfg = JSON.parse(fs.readFileSync(path.join(PROJE, "data", "db-config.json"), "utf-8"));
} catch { /* env ile de verilebilir */ }
const dbEnv = {
  YALIN_DB_HOST: process.env.YALIN_DB_HOST || anaCfg.host || "127.0.0.1",
  YALIN_DB_PORT: String(process.env.YALIN_DB_PORT || anaCfg.port || 3306),
  YALIN_DB_USER: process.env.YALIN_DB_USER || anaCfg.user || "yalin",
  YALIN_DB_PASSWORD: process.env.YALIN_DB_PASSWORD ?? anaCfg.password ?? "",
  YALIN_DB_DATABASE: TEST_DB,
};

let cookies = {};
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
async function get(url) {
  const res = await fetch(BASE + url, { headers: { cookie: cookieHeader() }, redirect: "manual" });
  storeCookies(res);
  return res;
}
async function getText(url) {
  return (await get(url)).text();
}
function csrfFrom(html) {
  const m = html.match(/name="csrf_token" value="([^"]+)"/);
  return m ? m[1] : null;
}
async function post(url, form) {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(BASE + url, {
    method: "POST", redirect: "manual",
    headers: { cookie: cookieHeader(), "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  storeCookies(res);
  return res;
}
// multipart/form-data gönderimi (dosya alanları: {ad: [dosyaAdi, Buffer]})
async function postMultipart(url, form, dosyalar = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.append(k, v);
  for (const [k, [ad, buf]] of Object.entries(dosyalar)) {
    fd.append(k, new Blob([buf], { type: "image/png" }), ad);
  }
  const res = await fetch(BASE + url, {
    method: "POST", redirect: "manual",
    headers: { cookie: cookieHeader() },
    body: fd,
  });
  storeCookies(res);
  return res;
}
// 1x1 geçerli PNG (magic bytes doğrulamasından geçer)
const MINI_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

async function dbBaglan() {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: dbEnv.YALIN_DB_HOST, port: parseInt(dbEnv.YALIN_DB_PORT, 10),
    user: dbEnv.YALIN_DB_USER, password: dbEnv.YALIN_DB_PASSWORD, database: TEST_DB,
  });
}
async function girisYap(sifre) {
  await get("/yonetici/cikis");
  const c = csrfFrom(await getText("/yonetici/giris"));
  await post("/yonetici/giris", { csrf_token: c, sifre });
  return csrfFrom(await getText("/oneri/yeni"));
}
function konum(r) { return r.headers.get("location") || ""; }

let basarili = 0, hatali = 0;
function ok(ad, kosul, detay = "") {
  if (kosul) { basarili++; console.log("  ✔", ad); }
  else { hatali++; console.log("  ✗", ad, detay); }
}

async function testDbTemizle() {
  // Test veritabanındaki tabloları sıfırla (şema server açılışında kurulur)
  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({
    host: dbEnv.YALIN_DB_HOST, port: parseInt(dbEnv.YALIN_DB_PORT, 10),
    user: dbEnv.YALIN_DB_USER, password: dbEnv.YALIN_DB_PASSWORD,
    database: TEST_DB,
  });
  const [tablolar] = await conn.query("SHOW TABLES");
  for (const r of tablolar) {
    await conn.query(`DROP TABLE IF EXISTS ${Object.values(r)[0]}`);
  }
  await conn.end();
}

async function main() {
  await testDbTemizle();
  const srv = spawn(process.execPath, [path.join(PROJE, "server.js")], {
    env: { ...process.env, ...dbEnv, YALIN_DATA_DIR: DATA, PORT: String(PORT) },
    stdio: "inherit",
  });
  // Sunucunun açılmasını bekle
  let hazir = false;
  for (let i = 0; i < 30 && !hazir; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { await fetch(BASE + "/"); hazir = true; } catch {}
  }
  if (!hazir) { console.error("Sunucu açılamadı."); srv.kill(); process.exit(1); }

  try {
    // --- Giriş ---
    let html = await getText("/yonetici/giris");
    let csrf = csrfFrom(html);
    ok("giriş sayfası + csrf", Boolean(csrf));
    // Güncellemeden sonra tarayıcı eski CSS/JS'i 1 yıllık önbellekten kullanmasın: adresler içerik özetiyle sürümlü
    const sv = (html.match(/\/static\/style\.css\?v=([0-9a-f]{10})"/) || [])[1];
    ok("statik dosya adresleri sürümlü (?v=)", Boolean(sv) && html.includes(`/static/takvim.js?v=${sv}"`));
    ok("sürümlü statik dosya sunuluyor", (await fetch(`${BASE}/static/style.css?v=${sv}`)).status === 200);

    await post("/yonetici/giris", { csrf_token: csrf, sifre: "yanlis-sifre" });
    html = await getText("/yonetici/giris");
    ok("yanlış şifre reddedildi", html.includes("Hatalı şifre"));

    csrf = csrfFrom(html);
    await post("/yonetici/giris", { csrf_token: csrf, sifre: "admin123" });
    html = await getText("/");
    ok("admin girişi", html.includes("🛠 Yönetim"));

    // Open redirect koruması: //host hedefi ana sayfaya düşmeli
    await get("/yonetici/cikis");
    html = await getText("/yonetici/giris");
    csrf = csrfFrom(html);
    const r0 = await post("/yonetici/giris?next=" + encodeURIComponent("//kotu.example"), {
      csrf_token: csrf, sifre: "admin123" });
    ok("open redirect engellendi", (r0.headers.get("location") || "") === "/");
    await get("/yonetici/cikis");
    csrf = csrfFrom(await getText("/yonetici/giris"));
    const r0b = await post("/yonetici/giris?next=" + encodeURIComponent("/\\kotu.example"), { csrf_token: csrf, sifre: "admin123" });
    ok("open redirect (/\\host) engellendi", (r0b.headers.get("location") || "") === "/");
    await get("/yonetici/cikis");
    csrf = csrfFrom(await getText("/yonetici/giris"));
    const r0c = await post("/yonetici/giris?next=/a&next=/b", { csrf_token: csrf, sifre: "admin123" });
    ok("dizi next parametresi hata vermiyor", r0c.status === 302 && (r0c.headers.get("location") || "") === "/");

    // CSRF koruması
    const rc = await post("/5s/bolum/ekle", { ad: "X" });
    ok("csrf'siz POST 400", rc.status === 400);

    // --- 5S bölümler ---
    csrf = csrfFrom(await getText("/5s"));
    await post("/5s/bolum/ekle", { csrf_token: csrf, ad: "Montaj", sorumlu: "Ali Test" });
    await post("/5s/bolum/ekle", { csrf_token: csrf, ad: "Kaynak", sorumlu: "Veli Test" });
    html = await getText("/5s");
    ok("2 bölüm eklendi", html.includes("Montaj") && html.includes("Kaynak"));

    const bidler = [...new Set([...html.matchAll(/\/5s\/bolum\/([a-f0-9]{8})"/g)].map((m) => m[1]))];
    await post(`/5s/bolum/${bidler[0]}/kisi/ekle`, { csrf_token: csrf, kisi_ad: "uye", kisi_soyad: "BİR" });
    html = await getText(`/5s/bolum/${bidler[0]}`);
    ok("bölüme üye eklendi", html.includes("Uye Bir"));

    // --- Denetim turu + çapraz dağıtım ---
    const bugun = new Date().toISOString().slice(0, 10);
    await post("/5s/denetim-turu", { csrf_token: csrf, baslangic: bugun, bitis: bugun });
    await post("/5s/plan/dagit", { csrf_token: csrf, mod: "capraz", tarih: bugun });
    html = await getText("/5s");
    ok("plan oluşturuldu + çapraz dağıtım", html.includes("Denetimi Yap"));

    await post("/5s/denetim-turu", { csrf_token: csrf, baslangic: bugun, bitis: bugun });
    html = await getText("/5s");
    ok("aynı tarihli 2. tur engellendi", html.includes("zaten bir denetim turu var"));

    // --- Denetimleri yap (bulgu sayısı girilir, puan kuraldan hesaplanır) ---
    const { BESS_TUM_KRITERLER, bessKriterPuanla } = require("../src/puanlama");
    // İlk bölüm: s1_1'de 1 bulgu (−3 → 22) → toplam 97; ikinci bölüm: 0 bulgu → 100
    ok("kural hesabı: s1_1 1 bulgu = 22", bessKriterPuanla("s1_1", 1) === 22);
    ok("kural hesabı: s1_1 5 bulgu = 0 (eşik)", bessKriterPuanla("s1_1", 5) === 0);
    ok("kural hesabı: evet_hayir s2_2_1 hayır = 0", bessKriterPuanla("s2_2_1", 1) === 0);
    for (const [i, bid] of bidler.entries()) {
      const form = { csrf_token: csrf, not: "e2e test", denetmen: "Test Denetmen" };
      for (const k of BESS_TUM_KRITERLER) {
        form["bulgu_" + k] = (i === 0 && k === "s1_1") ? "1" : "0";
      }
      if (i === 0) {
        form["aksiyon_s1_1_1"] = "Gereksiz malzemeleri kaldır";
        form["aksiyon_sorumlu_s1_1_1"] = "Ali Test";
        // Tarayıcı simülasyonu (regresyon): dosya seçilmese bile tarayıcı formdaki
        // TÜM dosya kutularını (soru × 3) boş multipart parçası olarak gönderir —
        // dosya sayısı sınırı bunları da saydığından kayıt reddedilmemeli.
        const fd = new FormData();
        for (const [ad, deger] of Object.entries(form)) fd.append(ad, deger);
        for (const k of BESS_TUM_KRITERLER) {
          for (let s = 0; s < 3; s++) fd.append("foto_" + k, new Blob([]), "");
        }
        const r = await fetch(BASE + `/5s/bolum/${bid}/denetim`, {
          method: "POST", redirect: "manual", headers: { cookie: cookieHeader() }, body: fd,
        });
        storeCookies(r);
        ok("boş dosya kutularıyla denetim kaydedildi", r.status === 302, "durum: " + r.status);
      } else {
        await post(`/5s/bolum/${bid}/denetim`, form);
      }
    }
    html = await getText("/5s");
    ok("denetimler kaydedildi (97 + 100)", html.includes("97/100") && html.includes("100/100"));

    html = await getText("/5s/aksiyonlar");
    ok("aksiyon oluştu", html.includes("Gereksiz malzemeleri kaldır"));

    // --- Ödülleri işle ---
    await post("/5s/odul-isle", { csrf_token: csrf, tarih: bugun });
    html = await getText("/puan-durumu");
    ok("1. bölüm ekibi 100 puan aldı", html.includes("Veli Test") && html.includes("100"));
    ok("2. bölüm ekibi 75 puan aldı", html.includes("Ali Test") && html.includes("75"));
    ok("üye de puan aldı", html.includes("Uye Bir"));

    // --- Öneri numarası + onay + puanlama ---
    csrf = csrfFrom(await getText("/oneri/yeni"));
    await post("/oneri/yeni", { csrf_token: csrf, bolum: "Montaj", tarih: bugun, sahibi_ad: "Puan", sahibi_soyad: "Test",
      gorevi: "Operatör", konu: "Test konusu", detay: "Detay açıklama", cozum: "Çözüm" });
    await post("/oneri/yeni", { csrf_token: csrf, bolum: "Montaj", tarih: bugun, sahibi: "Puan Test 2",
      gorevi: "Operatör", konu: "İkinci konu", detay: "Detay", cozum: "" });
    html = await getText("/liste");
    const nolar = [...new Set([...html.matchAll(/ÖNFR\d{4}-\d{2}/g)].map((m) => m[0]))].sort();
    ok("numaralar sıralı üretildi (-01, -02)", nolar.length === 2 &&
      nolar[0].endsWith("-01") && nolar[1].endsWith("-02"), nolar.join(","));
    const no = nolar[0];

    await post("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Onaylandı" });
    html = await getText("/liste");
    const detayHtml = await getText(`/detay?tip=oneri&no=${encodeURIComponent(no)}`);
    ok("onaylandı, form no gösterilmiyor", html.includes("Onaylandı") && !/FR-\d{4}-\d{4}/.test(html + detayHtml) &&
      !detayHtml.includes("Form No"));
    await post(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(no)}`, {
      csrf_token: csrf, tip: "oneri", no,
      p_form: "5", p_komite: "5", p_etki_0_3: "40", p_maliyet_0: "20",
      p_yaygin_2: "15", p_efor_2: "15", degerlendirme_notu: "tam puan",
    });
    html = await getText("/puan-durumu");
    ok("öneri sahibi %10 aldı", html.includes("Puan Test"));

    await post("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Reddedildi", red_nedeni: "x" });
    html = await getText("/liste");
    ok("onaylı kayıt reddedilemedi", html.includes("reddedilemez"));

    // --- Dosya yükleme (multipart) sınırları ---
    // Dosya kabul etmeyen uca multipart → 400 (CSRF atlatma kapısı yok)
    const rm = await postMultipart("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Onaylandı" });
    ok("dosya kabul etmeyen uca multipart reddedildi", rm.status === 400);
    // Kaizen maliyet hesabı (€): önceki + sonraki maliyet zorunlu, sayı ve eksi olmayan
    const kzTemel = { csrf_token: csrf, baslangic: bugun, konu: "Maliyet kaizeni", bolum: "Kaynak",
      lider: "Foto Test", onceki: "Önce", sonraki: "Sonra" };
    html = await getText("/kaizen/yeni");
    ok("kaizen formunda önceki/sonraki maliyet (€) kutuları zorunlu",
      /name="onceki_maliyet"[^>]*required/.test(html) && /name="sonraki_maliyet"[^>]*required/.test(html) && html.includes("Önceki Durum Maliyeti (€)"));
    // (veritabanı bağlantısı testin ilerisinde açılır — burada liste üzerinden sayılır)
    const mkSay = async () => ((await getText("/liste?q=" + encodeURIComponent("Maliyet kaizeni"))).match(/>Maliyet kaizeni</g) || []).length;
    html = await (await postMultipart("/kaizen/yeni", kzTemel)).text();
    ok("maliyet girilmeden kaizen kaydedilmez", html.includes("maliyetini (€) girin") && (await mkSay()) === 0);
    html = await (await postMultipart("/kaizen/yeni", { ...kzTemel, onceki_maliyet: "1000", sonraki_maliyet: "abc" })).text();
    ok("sayı olmayan maliyet reddedildi", html.includes("Maliyet € cinsinden sayı olmalı") && (await mkSay()) === 0);
    html = await (await postMultipart("/kaizen/yeni", { ...kzTemel, onceki_maliyet: "-5", sonraki_maliyet: "0" })).text();
    ok("eksi maliyet reddedildi", html.includes("eksi değer girilemez") && (await mkSay()) === 0);
    // Kaizen: görselli kayıt (2 dosya sınırının içinde) + Türkçe yazımlı maliyet
    await postMultipart("/kaizen/yeni", {
      csrf_token: csrf, baslangic: bugun, konu: "Görselli kaizen", bolum: "Kaynak",
      lider: "Foto Test", onceki: "Önce", sonraki: "Sonra", onceki_maliyet: "1.250,50", sonraki_maliyet: "900",
    }, { onceki_gorsel: ["once.png", MINI_PNG], sonraki_gorsel: ["sonra.png", MINI_PNG] });
    const gkmNo = ((await getText("/liste?q=" + encodeURIComponent("Görselli kaizen"))).match(/ÖSKFR\d{4}-\d{2}/) || [""])[0];
    html = await getText(`/detay?tip=kaizen&no=${encodeURIComponent(gkmNo)}`);
    ok("Türkçe yazımlı maliyet kaydedildi; detayda maliyetler ve kazanç", html.includes("1.250,50 €") && html.includes("900,00 €")
      && html.includes("maliyet-sonuc kazanc") && html.includes("Kazanç: 350,50 €"));
    html = await getText("/liste");
    const kno = (html.match(/ÖSKFR\d{4}-\d{2}/) || [])[0];
    ok("görselli kaizen kaydedildi", Boolean(kno));
    if (kno) {
      const det = await getText(`/detay?tip=kaizen&no=${encodeURIComponent(kno)}`);
      const gorsel = (det.match(/\/kaizen\/gorsel\/([^"]+)/) || [])[1];
      ok("kaizen görseli kaydedildi", Boolean(gorsel));
      if (gorsel) {
        const rg = await get("/kaizen/gorsel/" + gorsel);
        ok("kaizen görseli servis edildi", rg.status === 200);
      }
    }

    // --- Excel uçları ---
    for (const u of ["/oneri/excel", "/5s/denetim-excel", "/puan-durumu/excel",
      "/5s/aksiyonlar/excel", "/yonetici/5s-trend/excel"]) {
      const r = await get(u);
      ok("excel " + u, r.status === 200 && (r.headers.get("content-type") || "").includes("spreadsheet"));
    }

    // --- Denetmen şifresi + denetmen girişi ---
    csrf = csrfFrom(await getText("/yonetici"));
    await post("/yonetici/denetmen/ekle", { csrf_token: csrf, ad: "Ali Test", sifre: "alitest99" });
    await get("/yonetici/cikis");
    html = await getText("/yonetici/giris");
    csrf = csrfFrom(html);
    await post("/yonetici/giris", { csrf_token: csrf, sifre: "alitest99" });
    html = await getText("/");
    ok("denetmen girişi (şifreden tanıma)", html.includes("Ali Test") && html.includes("denetmen"));

    const r2 = await get("/yonetici");
    ok("denetmen yönetici paneline giremedi", r2.status === 302);

    // --- Ek yönetici: yetki tabanlı erişim ---
    // Ana yönetici olarak tekrar giriş
    await get("/yonetici/cikis");
    csrf = csrfFrom(await getText("/yonetici/giris"));
    await post("/yonetici/giris", { csrf_token: csrf, sifre: "admin123" });
    // Yalnızca 'degerlendirme' yetkili bir ek yönetici ekle
    csrf = csrfFrom(await getText("/yonetici"));
    await post("/yonetici/yonetici/ekle", {
      csrf_token: csrf, ad: "Kısıtlı", soyad: "Yönetici", sifre: "kisitli123", yetkiler: "degerlendir" });
    html = await getText("/yonetici");
    ok("ek yönetici panelde listelendi", html.includes("Kısıtlı Yönetici"));

    // Ek yönetici olarak giriş
    await get("/yonetici/cikis");
    csrf = csrfFrom(await getText("/yonetici/giris"));
    await post("/yonetici/giris", { csrf_token: csrf, sifre: "kisitli123" });
    html = await getText("/");
    ok("ek yönetici girişi (şifreden tanıma)", html.includes("Kısıtlı Yönetici") && html.includes("yönetici"));

    // Panele girebilir ama Yöneticiler/Denetmen bölümlerini görmez
    const dash = await getText("/yonetici");
    ok("ek yönetici yönetim sayfasına girebildi", dash.includes("🛠 Yönetim"));
    ok("ek yönetici Yöneticiler bölümünü görmüyor", !dash.includes('id="yoneticiler"'));
    ok("ek yönetici Denetmenler bölümünü görmüyor", !dash.includes('id="denetmenler"'));

    csrf = csrfFrom(await getText("/liste"));
    // Sahip olduğu yetki (degerlendirme): kaizen'i onaylayabilmeli
    let rr = await post("/durum", { csrf_token: csrf, tip: "kaizen", no: kno, durum: "Onaylandı", don: "/liste" });
    ok("degerlendirme yetkisi çalışıyor (onay)", (rr.headers.get("location") || "") === "/liste");
    // Sahip olmadığı yetkiler → '/' adresine (yetkisiz) yönlendirilir
    const rb = await post("/5s/bolum/ekle", { csrf_token: csrf, ad: "Yetkisiz Bölüm" });
    ok("bes_s yetkisi yok → reddedildi", (rb.headers.get("location") || "") === "/");
    const rk = await get("/oneri/excel");
    ok("kayit yetkisi yok → reddedildi", rk.status === 302 && (rk.headers.get("location") || "") === "/");
    const ro = await post("/odul-ver", { csrf_token: csrf, ad: "X" });
    ok("odul yetkisi yok → reddedildi", (ro.headers.get("location") || "") === "/");
    const rs = await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "X", sifre: "xxxxxx", yetkiler: "odul" });
    ok("ek yönetici, yönetici ekleyemez (süper değil)", (rs.headers.get("location") || "") === "/");
    // Yetkisiz eklemenin gerçekten yazılmadığını doğrula (ana yönetici olarak)
    await get("/yonetici/cikis");
    csrf = csrfFrom(await getText("/yonetici/giris"));
    await post("/yonetici/giris", { csrf_token: csrf, sifre: "admin123" });
    const bolumSayfa = await getText("/5s");
    ok("yetkisiz bölüm gerçekten eklenmedi", !bolumSayfa.includes("Yetkisiz Bölüm"));
    const dash2 = await getText("/yonetici");
    ok("ana yönetici Yöneticiler bölümünü görüyor", dash2.includes('id="yoneticiler"'));

    // --- İşlem günlüğü ---
    const gunluk = await getText("/yonetici/gunluk");
    ok("ek yöneticinin işlemi günlükte (kim)", gunluk.includes("Kısıtlı Yönetici"));
    ok("ek yöneticinin onayı günlükte (mesaj)", gunluk.includes(kno) && gunluk.includes("Onaylandı"));
    ok("ana yöneticinin işlemi günlükte", gunluk.includes("Ana Yönetici"));

    // --- Silinen kayıtlar + geri yükleme ---
    csrf = csrfFrom(await getText("/liste"));
    await post("/sil", { csrf_token: csrf, tip: "kaizen", no: kno });
    let sil = await getText("/arsiv");
    ok("silinen kayıt arşivde", sil.includes(kno));
    html = await getText("/liste");
    ok("silinen kayıt ana listede yok", !html.includes(kno));
    const sid = (sil.match(/name="id" value="(\d+)"/) || [])[1];
    await post("/silinenler/geri", { csrf_token: csrf, id: sid });
    html = await getText("/liste");
    ok("geri yüklenen kayıt listede", html.includes(kno));
    sil = await getText("/arsiv");
    ok("geri yüklenen kayıt arşivden çıktı", !sil.includes(kno));

    // =====================================================================
    // Ekim 2026 özellikleri
    // =====================================================================
    const I = require("../src/isim");
    const db = await dbBaglan();
    csrf = await girisYap("admin123");

    // --- Girişsiz erişim: liste/detay/panel kapalı, form açık ---
    await get("/yonetici/cikis");
    let r = await get("/liste");
    ok("girişsiz liste → giriş sayfası", r.status === 302 && konum(r).startsWith("/yonetici/giris"));
    r = await get(`/detay?tip=oneri&no=${encodeURIComponent(no)}`);
    ok("girişsiz detay → giriş sayfası", r.status === 302);
    r = await get("/panel");
    ok("girişsiz panel → giriş sayfası", r.status === 302);
    let anon = csrfFrom(await getText("/oneri/yeni"));
    r = await post("/oneri/yeni", { csrf_token: anon, bolum: "Montaj", tarih: bugun, sahibi_ad: "aHMET", sahibi_soyad: "YILMAZ",
      gorevi: "Operatör", konu: "Girişsiz öneri", detay: "Detay" });
    ok("girişsiz öneri gönderildi → anasayfa", r.status === 302 && konum(r) === "/");
    html = await getText("/");
    ok("girişsiz gönderim teşekkür mesajı", html.includes("teşekkürler"));
    r = await post("/oneri/yeni", { csrf_token: anon, bolum: "Montaj", tarih: bugun, sahibi_ad: "Sadece", sahibi_soyad: "",
      gorevi: "X", konu: "Soyadsız", detay: "Detay" });
    html = await r.text();
    ok("soyad eksik → form verisi korunarak hata", r.status === 200 && html.includes("ayrı kutulara") && html.includes("Soyadsız"));
    const [ahmet] = await db.query("SELECT sahibi FROM oneriler WHERE konu = 'Girişsiz öneri'");
    ok("ad/soyad düzeltildi (Ahmet Yılmaz)", ahmet.length && ahmet[0].sahibi === "Ahmet Yılmaz", ahmet[0] && ahmet[0].sahibi);
    r = await postMultipart(`/5s/denetim/xxxx/revize`, { csrf_token: anon }, { foto_s1_1: ["a.png", MINI_PNG] });
    ok("girişsiz revize yüklemesi yetkiden önce reddedildi", r.status === 302 && konum(r).startsWith("/yonetici/giris"));

    // --- Sayfalama: 25 ek kayıt → 2. sayfa ---
    csrf = await girisYap("admin123");
    for (let i = 1; i <= 25; i++) {
      await db.query("INSERT INTO oneriler(`no`, tarih, sahibi, konu, detay, durum) VALUES(?,?,?,?,?,?)",
        [`ÖNFR9901-${String(i).padStart(2, "0")}`, "2025-01-15", "Toplu Test", `Toplu ${i}`, "d", "Değerlendiriliyor"]);
    }
    html = await getText("/liste");
    ok("liste 20 kayıtla sınırlı", (html.match(/class="title-link"/g) || []).length === 20);
    ok("sayfalama bağlantıları var", html.includes('class="sayfalama"') && html.includes("s=2"));
    html = await getText("/liste?s=2");
    ok("2. sayfa açılıyor", html.includes("21–"));

    // --- Gerekçeli red + arşiv ---
    const redNo = "ÖNFR9901-01";
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: redNo, durum: "Reddedildi" });
    let [[rd]] = await db.query("SELECT durum FROM oneriler WHERE `no` = ?", [redNo]);
    ok("gerekçesiz red engellendi", rd.durum === "Değerlendiriliyor");
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: redNo, durum: "Reddedildi", red_nedeni: "Uygulanabilir değil" });
    [[rd]] = await db.query("SELECT durum, red_nedeni FROM oneriler WHERE `no` = ?", [redNo]);
    ok("gerekçeli red kaydedildi", rd.durum === "Reddedildi" && rd.red_nedeni === "Uygulanabilir değil");
    html = await getText("/liste?q=" + encodeURIComponent(redNo));
    ok("reddedilen ana listede yok", !html.includes("Toplu 1<"));
    html = await getText("/arsiv");
    ok("reddedilen arşivde gerekçesiyle", html.includes(redNo) && html.includes("Uygulanabilir değil"));

    // --- Denetmen hesabı (bölüm lideri olmayan) + düzeltme ataması ---
    csrf = csrfFrom(await getText("/yonetici"));
    await post("/yonetici/denetmen/ekle", { csrf_token: csrf, ad: "deniz", soyad: "DENETMEN", sifre: "deniz123" });
    const [[dz]] = await db.query("SELECT id, ad FROM denetmenler WHERE ad = 'Deniz Denetmen'");
    ok("bölüm lideri olmayan denetmen eklendi", Boolean(dz));
    const revNo = "ÖNFR9901-02", digerNo = "ÖNFR9901-03";
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: revNo, durum: "Düzeltme İsteniyor", revize_notu: "Maliyet yaz" });
    [[rd]] = await db.query("SELECT durum FROM oneriler WHERE `no` = ?", [revNo]);
    ok("denetmen seçilmeden düzeltme istenemedi", rd.durum === "Değerlendiriliyor");
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: revNo, durum: "Düzeltme İsteniyor",
      revize_notu: "Maliyet etkisini yazın", revize_denetmen: dz.id });
    [[rd]] = await db.query("SELECT durum, revize_atanan_ad FROM oneriler WHERE `no` = ?", [revNo]);
    ok("düzeltme denetmene atandı", rd.durum === "Düzeltme İsteniyor" && rd.revize_atanan_ad === "Deniz Denetmen");
    // Onaylanacak öneri + görev ataması (kaizene dönüştürme): görev atanırsa termin + açıklama zorunlu, termin geçmiş olamaz
    const gorNo = "ÖNFR9901-04";
    const gunEkle = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const ileriTermin = gunEkle(30), dunTermin = gunEkle(-2);
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: gorNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: "", gorev_notu: "Hatta uygula" });
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(gorNo)}`);
    [[rd]] = await db.query("SELECT durum, gorev_atanan_ad FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("görev atanırken termin boşsa onay da yapılmaz", rd.durum !== "Onaylandı" && !rd.gorev_atanan_ad
      && html.includes("termin ve açıklama zorunludur") && html.includes("data-gorev-alan"));
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: gorNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: ileriTermin, gorev_notu: "  " });
    [[rd]] = await db.query("SELECT durum FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("görev atanırken açıklama boşsa onay yapılmaz", rd.durum !== "Onaylandı");
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: gorNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: dunTermin, gorev_notu: "Hatta uygula" });
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(gorNo)}`);
    [[rd]] = await db.query("SELECT durum FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("geçmiş tarihli termin reddedildi", rd.durum !== "Onaylandı" && html.includes("Termin bugünden önce olamaz"));
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: gorNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: ileriTermin, gorev_notu: "Hatta uygula" });
    [[rd]] = await db.query("SELECT durum, gorev_atanan_ad, gorev_termin, gorev_notu, form_no FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("onayla birlikte görev atandı (form no atanmadı)", rd.durum === "Onaylandı" && rd.gorev_atanan_ad === "Deniz Denetmen"
      && rd.gorev_termin === ileriTermin && rd.gorev_notu === "Hatta uygula" && !rd.form_no);
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(gorNo)}`);
    ok("görev değiştirme formunda termin ve açıklama zorunlu", /name="gorev_termin"[^>]*required/.test(html) && /name="gorev_notu" rows="2" required/.test(html));
    // Görev değiştirme (/gorev): açıklamasız kaydedilmez; değişmeyen eski (geçmiş) termin kabul, yeni geçmiş tarih değil
    await post("/gorev", { csrf_token: csrf, no: gorNo, gorev_denetmen: dz.id, gorev_termin: ileriTermin, gorev_notu: "" });
    [[rd]] = await db.query("SELECT gorev_notu FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("görev değiştirirken açıklama zorunlu", rd.gorev_notu === "Hatta uygula");
    await db.query("UPDATE oneriler SET gorev_termin = ? WHERE `no` = ?", [dunTermin, gorNo]);
    await post("/gorev", { csrf_token: csrf, no: gorNo, gorev_denetmen: dz.id, gorev_termin: dunTermin, gorev_notu: "Not güncellendi" });
    [[rd]] = await db.query("SELECT gorev_notu FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("değişmeyen eski termin ile görev güncellenebilir", rd.gorev_notu === "Not güncellendi");
    await post("/gorev", { csrf_token: csrf, no: gorNo, gorev_denetmen: dz.id, gorev_termin: gunEkle(-5), gorev_notu: "Geçmiş" });
    [[rd]] = await db.query("SELECT gorev_notu FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("görev değiştirirken yeni termin geçmiş olamaz", rd.gorev_notu === "Not güncellendi");
    await post("/gorev", { csrf_token: csrf, no: gorNo, gorev_denetmen: dz.id, gorev_termin: ileriTermin, gorev_notu: "Hatta uygula" });

    // Denetmen olarak
    csrf = await girisYap("deniz123");
    html = await getText("/gorevlerim");
    ok("görevlerim: düzeltme ve görev görünüyor", html.includes(revNo) && html.includes(gorNo) && html.includes("Kaizene Dönüştür"));
    html = await getText("/");
    ok("menüde görev rozeti (2)", /nav-rozet">2</.test(html));
    r = await get("/liste");
    ok("denetmen listeyi görüyor", r.status === 200);
    html = await getText("/arsiv");
    ok("denetmen arşivi görüyor ama işlem butonu yok", html.includes(redNo) && !html.includes("Kalıcı Sil"));
    r = await get(`/oneri/duzenle?no=${encodeURIComponent(digerNo)}`);
    ok("denetmen atanmamış kaydı düzenleyemez", r.status === 302 && konum(r).startsWith("/detay"));
    r = await post("/durum", { csrf_token: csrf, tip: "oneri", no: digerNo, durum: "Onaylandı" });
    ok("denetmen durum değiştiremez", r.status === 302 && konum(r).startsWith("/yonetici/giris"));
    r = await get(`/oneri/duzenle?no=${encodeURIComponent(revNo)}`);
    ok("denetmen atanan kaydı düzenleme formu", r.status === 200);
    r = await post(`/oneri/duzenle?no=${encodeURIComponent(revNo)}`, { csrf_token: csrf, bolum: "Montaj", tarih: "2025-01-15",
      sahibi_ad: "Toplu", sahibi_soyad: "Test", gorevi: "Op", konu: "Toplu 2 (düzeltildi)", detay: "Maliyet: 5.000 TL" });
    ok("düzeltme kaydı → görevlerim", konum(r) === "/gorevlerim");
    [[rd]] = await db.query("SELECT durum, konu, revize_tamamlandi FROM oneriler WHERE `no` = ?", [revNo]);
    ok("düzeltme sonrası yeniden değerlendirmede", rd.durum === "Değerlendiriliyor" && rd.revize_tamamlandi && rd.konu.includes("düzeltildi"));
    html = await getText(`/kaizen/yeni?oneri=${encodeURIComponent(gorNo)}`);
    ok("kaizene dönüştürme formu öneriyle dolu", html.includes(gorNo) && html.includes('name="kaynak_oneri"'));
    r = await postMultipart("/kaizen/yeni", { csrf_token: csrf, bolum: "Montaj", kaynak_oneri: gorNo, baslangic: bugun,
      konu: "Dönüşen kaizen", lider_ad: "Deniz", lider_soyad: "Denetmen", uye1_ad: "Ali", uye1_soyad: "Test",
      onceki: "Önce", sonraki: "Sonra", onceki_maliyet: "400", sonraki_maliyet: "650" });
    const [[dk]] = await db.query("SELECT kaizen_no FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("öneri kaizene dönüştü (bağlandı)", Boolean(dk.kaizen_no) && konum(r) === "/gorevlerim");
    const [[kk]] = await db.query("SELECT kaynak_oneri_no, uyeler FROM kaizenler WHERE `no` = ?", [dk.kaizen_no || ""]);
    ok("kaizende kaynak öneri kayıtlı", kk && kk.kaynak_oneri_no === gorNo);
    html = await getText(`/detay?tip=kaizen&no=${encodeURIComponent(dk.kaizen_no || "")}`);
    ok("maliyet artınca detayda zarar (kırmızı)", html.includes("maliyet-sonuc zarar") && html.includes("Zarar: 250,00 €"));
    r = await get(`/kaizen/yeni?oneri=${encodeURIComponent(gorNo)}`);
    ok("ikinci dönüştürme engellendi", r.status === 302);
    html = await getText("/panel");
    ok("denetmen paneli görüyor (trend + tablo)", html.includes("Son 12 Ay") && html.includes("Tüm zamanlar"));
    r = await get("/yonetici");
    ok("denetmen yönetim sayfasına giremez", r.status === 302);

    // --- Puanlama sonrası kayda dönüş + geri adresi güvenliği ---
    csrf = await girisYap("admin123");
    html = await getText(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(gorNo)}&geri=${encodeURIComponent("/liste?s=2")}`);
    ok("puanlama sayfasında kayda ve listeye dönüş", html.includes("Öneriye Dön") && html.includes('href="/liste?s=2"'));
    r = await post(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(gorNo)}`, { csrf_token: csrf, tip: "oneri",
      no: gorNo, geri: "/liste?s=2", p_form: "5", p_komite: "5", p_etki_0_0: "10" });
    ok("puanlama sonrası kaydın detayına dönüldü", konum(r).startsWith("/detay?tip=oneri") && konum(r).includes(encodeURIComponent("/liste?s=2")));
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(gorNo)}&geri=${encodeURIComponent("javascript:alert(1)")}`);
    ok("geri adresi javascript: kabul etmiyor", !html.includes('href="javascript:') && html.includes('href="/liste"'));

    // --- Onaylı – Beklemede havuzu: neden + gözden geçirme tarihi zorunlu; puan korunur; görev/kaizen kapalı ---
    const havNo = "ÖNFR9901-05", kapNo = "ÖNFR9901-06";
    const havuzOku = async (no) => (await db.query("SELECT durum, puan, uygulama_durumu, bekleme_kategori, bekleme_nedeni, " +
      "bekleme_gozden, uygulanamadi_nedeni, uygulama_isleyen, gorev_atanan_id FROM oneriler WHERE `no` = ?", [no]))[0][0];
    const havuz = (no, alanlar) => post("/oneri/havuz", { csrf_token: csrf, no, ...alanlar });
    const KAT = "Bütçe / yatırım gerekiyor", gozdenTarih = gunEkle(60);
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "Yatırım", bekleme_gozden: gozdenTarih });
    ok("onaylanmamış öneri havuza alınamaz", !(await havuzOku(havNo)).uygulama_durumu);
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: havNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: ileriTermin, gorev_notu: "Uygula" });
    await post(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(havNo)}`, { csrf_token: csrf, tip: "oneri",
      no: havNo, p_form: "5", p_komite: "5", p_etki_0_0: "10" });
    const havPuan = (await havuzOku(havNo)).puan;
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(havNo)}`);
    ok("onaylı öneride havuz ve uygulanamadı kartları", html.includes('action="/oneri/havuz"') && html.includes("Beklemeye Al")
      && html.includes("Uygulanamadı Olarak Kapat") && html.includes(KAT));
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: "Uydurma tür", bekleme_nedeni: "x", bekleme_gozden: gozdenTarih });
    ok("listede olmayan bekleme türü reddedildi", !(await havuzOku(havNo)).uygulama_durumu);
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "  ", bekleme_gozden: gozdenTarih });
    ok("açıklamasız havuza alınmaz", !(await havuzOku(havNo)).uygulama_durumu);
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "Yatırım", bekleme_gozden: "" });
    ok("gözden geçirme tarihsiz havuza alınmaz", !(await havuzOku(havNo)).uygulama_durumu);
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "Yatırım", bekleme_gozden: gunEkle(-1) });
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(havNo)}`);
    ok("geçmiş gözden geçirme tarihi reddedildi", !(await havuzOku(havNo)).uygulama_durumu
      && html.includes("Gözden geçirme tarihi bugünden önce olamaz"));
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "2027 yatırım bütçesi bekleniyor",
      bekleme_gozden: gozdenTarih });
    let hv = await havuzOku(havNo);
    ok("havuza alındı: tür, neden, tarih, işleyen kayıtlı", hv.uygulama_durumu === "beklemede" && hv.bekleme_kategori === KAT
      && hv.bekleme_nedeni.startsWith("2027") && hv.bekleme_gozden === gozdenTarih && hv.uygulama_isleyen);
    ok("havuza alınca durum Onaylandı ve puan aynı kaldı, görev kaldırıldı", hv.durum === "Onaylandı" && hv.puan === havPuan
      && hv.puan > 0 && !hv.gorev_atanan_id);
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(havNo)}`);
    ok("detayda beklemede rozeti ve bilgisi; kaizene dönüştür yok", html.includes('class="durum-badge havuz"') && html.includes("2027 yatırım")
      && html.includes("Havuzdan Çıkar") && !html.includes("Kaizene Dönüştür") && !html.includes('action="/gorev"'));
    await post("/gorev", { csrf_token: csrf, no: havNo, gorev_denetmen: dz.id, gorev_termin: ileriTermin, gorev_notu: "Uygula" });
    ok("havuzdaki öneriye görev atanamaz", !(await havuzOku(havNo)).gorev_atanan_id);
    r = await get(`/kaizen/yeni?oneri=${encodeURIComponent(havNo)}`);
    ok("havuzdaki öneri kaizene dönüştürülemez", r.status === 302);
    // Bilgi güncelleme: tarih geçmişte kaldıysa aynı tarihle kaydedilebilir, yeni geçmiş tarih olmaz
    await db.query("UPDATE oneriler SET bekleme_gozden = ? WHERE `no` = ?", [gunEkle(-3), havNo]);
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "Bütçe Ocak'ta", bekleme_gozden: gunEkle(-3) });
    ok("değişmeyen eski gözden geçirme tarihiyle güncellenebilir", (await havuzOku(havNo)).bekleme_nedeni === "Bütçe Ocak'ta");
    await havuz(havNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "Yeni", bekleme_gozden: gunEkle(-5) });
    ok("güncellerken yeni geçmiş tarih olmaz", (await havuzOku(havNo)).bekleme_nedeni === "Bütçe Ocak'ta");
    html = await getText("/havuz");
    ok("Öneri Havuzu sayfası: beklemede bölümünde öneri ve gözden geçirme uyarısı", html.includes(havNo) && !html.includes(kapNo)
      && html.includes("gozden-geldi") && html.includes("Bütçe / yatırım gerekiyor") && html.includes('id="uygulanamadi"'));
    html = await getText("/liste?q=" + encodeURIComponent("Toplu 5"));
    ok("havuzdaki öneri ana listede görünmez; listede Öneri Havuzu düğmesi", !html.includes(havNo)
      && html.includes('href="/havuz"') && html.includes("Öneri Havuzu'ndakiler hariç"));
    r = await get("/liste?tip=oneri&durum=havuz");
    ok("eski havuz filtresi adresi Öneri Havuzu'na yönlenir", r.status === 302 && konum(r) === "/havuz#beklemede");
    html = await getText("/panel");
    ok("panelde havuz özeti (gözden geçirme tarihi gelen)", html.includes("Öneri Havuzu") && html.includes('href="/havuz#beklemede"')
      && html.includes("gözden geçirme tarihi geldi"));
    html = await getText("/gorevlerim");
    ok("takip listesinde gözden geçirme tarihi gelen öneri", html.includes("Gözden geçirme tarihi gelen") && html.includes(havNo));
    await havuz(havNo, { islem: "havuzdan_cikar" });
    hv = await havuzOku(havNo);
    ok("havuzdan çıkarıldı (puan aynı)", !hv.uygulama_durumu && hv.puan === havPuan);
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(havNo)}`);
    ok("havuzdan çıkınca görev atanabilir ve dönüştürülebilir", html.includes('action="/gorev"') && html.includes("Kaizene Dönüştür"));
    // Uygulanamadı: gerekçe zorunlu; kapalıyken havuz/görev yok; yeniden açılabilir
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: kapNo, durum: "Onaylandı" });
    await havuz(kapNo, { islem: "uygulanamadi", uygulanamadi_nedeni: "" });
    ok("gerekçesiz uygulanamadı kapatılmaz", !(await havuzOku(kapNo)).uygulama_durumu);
    await havuz(kapNo, { islem: "uygulanamadi", uygulanamadi_nedeni: "Tedarikçi parçayı üretmiyor" });
    hv = await havuzOku(kapNo);
    ok("uygulanamadı olarak kapatıldı (onaylı kaldı)", hv.uygulama_durumu === "uygulanamadi" && hv.durum === "Onaylandı"
      && hv.uygulanamadi_nedeni === "Tedarikçi parçayı üretmiyor");
    await havuz(kapNo, { islem: "beklemeye_al", bekleme_kategori: KAT, bekleme_nedeni: "x", bekleme_gozden: gozdenTarih });
    ok("kapatılmış öneri doğrudan havuza alınamaz", (await havuzOku(kapNo)).uygulama_durumu === "uygulanamadi");
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(kapNo)}`);
    ok("detayda uygulanamadı rozeti, gerekçe ve yeniden aç", html.includes('class="durum-badge kapali"') && html.includes("Tedarikçi parçayı")
      && html.includes("Yeniden Aç") && !html.includes("Beklemeye Al"));
    html = await getText("/havuz");
    const uyBolum = html.split('id="uygulanamadi"')[1] || "";
    ok("Öneri Havuzu: uygulanamadı bölümünde gerekçesiyle; havuzdan çıkan öneri yok", uyBolum.includes(kapNo)
      && uyBolum.includes("Tedarikçi parçayı") && !html.includes(havNo));
    html = await getText("/liste?q=" + encodeURIComponent("Toplu 6"));
    ok("uygulanamadı öneri ana listede görünmez", !html.includes(kapNo));
    r = await get("/oneri/excel");
    const ExcelJSh = require("exceljs");
    const wbH = new ExcelJSh.Workbook();
    await wbH.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const wsH = wbH.worksheets[0];
    const bH = wsH.getRow(1).values.slice(1);
    let kapSatir = null;
    wsH.eachRow((row) => { if (row.getCell(1).value === kapNo) kapSatir = row; });
    ok("öneri Excel'inde uygulama durumu sütunları (sonda)",
      bH.slice(-4).join("|") === "Uygulama Durumu|Bekleme Türü|Bekleme / Kapanış Nedeni|Gözden Geçirme"
      && kapSatir && kapSatir.getCell(bH.length - 3).value === "Uygulanamadı"
      && kapSatir.getCell(bH.length - 1).value === "Tedarikçi parçayı üretmiyor");
    await havuz(kapNo, { islem: "yeniden_ac" });
    ok("uygulanamadı kapanışı yeniden açıldı", !(await havuzOku(kapNo)).uygulama_durumu);
    // Yetki: değerlendirme yetkisi olmayan (denetmen) havuz işlemi yapamaz
    csrf = await girisYap("deniz123");
    r = await post("/oneri/havuz", { csrf_token: csrf, no: kapNo, islem: "uygulanamadi", uygulanamadi_nedeni: "x" });
    ok("denetmen havuz işlemi yapamaz", r.status === 302 && konum(r).startsWith("/yonetici/giris")
      && !(await havuzOku(kapNo)).uygulama_durumu);
    csrf = await girisYap("admin123");

    // --- İsim birleştirme: otomatik + elle ---
    csrf = csrfFrom(await getText("/oneri/yeni"));
    for (const [ad, soyad, konu] of [["ALİ", "TEST", "Büyük harfli"], ["Ali", "Tset", "Yazım hatalı"]]) {
      await post("/oneri/yeni", { csrf_token: csrf, bolum: "Montaj", tarih: bugun, sahibi_ad: ad, sahibi_soyad: soyad,
        gorevi: "Op", konu, detay: "d" });
      const [[o]] = await db.query("SELECT `no` FROM oneriler WHERE konu = ?", [konu]);
      await post("/durum", { csrf_token: csrf, tip: "oneri", no: o.no, durum: "Onaylandı" });
      await post(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(o.no)}`, { csrf_token: csrf, tip: "oneri",
        no: o.no, p_form: "5", p_komite: "5" });
    }
    const satirSay = (h, ad) => (h.match(new RegExp(`class="detay-ac"[^<]*</button>\\s*${ad}\\s`, "g")) || []).length;
    html = await getText("/puan-durumu");
    ok("ALİ TEST ve Ali Test tek satır", satirSay(html, "Ali Test") === 1, "satır: " + satirSay(html, "Ali Test"));
    ok("yazım hatalı isim ayrı satır (birleştirme öncesi)", satirSay(html, "Ali Tset") === 1);
    html = await getText("/isimler");
    ok("isim ekranı yazım hatasını öneriyor", html.includes("Olası yazım hataları") && html.includes("Ali Tset"));
    await post("/isimler/birlestir", { csrf_token: csrf, kaynak: I.isimAnahtar("Ali Tset"), hedef: I.isimAnahtar("Ali Test") });
    html = await getText("/puan-durumu");
    ok("elle birleştirme sonrası tek kişi", satirSay(html, "Ali Tset") === 0 && satirSay(html, "Ali Test") === 1);
    const [[hamAd]] = await db.query("SELECT sahibi FROM oneriler WHERE konu = 'Yazım hatalı'");
    ok("birleştirme kayıttaki ismi değiştirmedi", hamAd.sahibi === "Ali Tset");
    await post("/isimler/ayir", { csrf_token: csrf, kaynak: I.isimAnahtar("Ali Tset") });
    html = await getText("/puan-durumu");
    ok("ayırma sonrası tekrar ayrı", satirSay(html, "Ali Tset") === 1);

    // --- Yetkiler: tam yetki yok (yönetici hesapları + günlük yalnız ana yönetici), ayrıntılı yetki, eski anahtarlar ---
    csrf = csrfFrom(await getText("/yonetici"));
    await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Tam", soyad: "Yetkili", sifre: "tamyetki1", yetkiler: "tam" });
    const [[tamSay]] = await db.query("SELECT COUNT(*) AS n FROM yoneticiler WHERE ad = 'Tam Yetkili'");
    ok("formdan tam yetki verilemez", tamSay.n === 0);
    await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Plan", soyad: "Sorumlu", sifre: "planci12", yetkiler: "bes_plan" });
    const hp = require("../src/cekirdek").hashPassword;
    await db.query("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma) VALUES('eskiyetk', 'Eski Yetki', ?, '[\"bes_s\"]', '')",
      [hp("eskiyetki1")]);
    await db.query("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma) VALUES('eskitam', 'Eski Tam', ?, '[\"tam\"]', '')",
      [hp("tamyetki1")]);
    csrf = await girisYap("tamyetki1"); // eski "tam" kaydı
    r = await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Yeni", soyad: "Kişi", sifre: "yenikisi1", yetkiler: "odul" });
    const [[yeniSay]] = await db.query("SELECT COUNT(*) AS n FROM yoneticiler WHERE ad = 'Yeni Kişi'");
    ok("ek yönetici yönetici ekleyemez", konum(r) === "/" && yeniSay.n === 0);
    r = await post("/yonetici/sifre", { csrf_token: csrf, eski: "admin123", yeni: "x", yeni2: "x" });
    ok("ek yönetici ana şifreyi değiştiremez", konum(r) === "/");
    r = await post("/yonetici/yonetici/sil", { csrf_token: csrf, id: "eskiyetk" });
    const [[halaVar]] = await db.query("SELECT COUNT(*) AS n FROM yoneticiler WHERE id = 'eskiyetk'");
    ok("ek yönetici yönetici silemez", halaVar.n === 1);
    r = await get("/yonetici/gunluk");
    ok("ek yönetici işlem günlüğünü göremez", konum(r) === "/");
    r = await get("/5s/denetim-excel");
    ok("eski 'tam' kaydı 10 yetki alanına açıldı", r.status === 200);
    html = await getText("/yonetici");
    ok("yöneticiler bölümü ek yöneticiye gizli", !html.includes('id="yoneticiler"') && html.includes('id="denetmenler"'));
    csrf = await girisYap("planci12");
    const [[birDenetim]] = await db.query("SELECT id FROM denetimler WHERE puan IS NOT NULL LIMIT 1");
    r = await get(`/5s/denetim/${birDenetim.id}/revize`);
    ok("yalnız plan yetkisi → revize reddedildi", konum(r) === "/");
    r = await get("/5s/denetim-excel");
    ok("yalnız plan yetkisi → 5S rapor reddedildi", konum(r) === "/");
    csrf = await girisYap("eskiyetki1");
    r = await get("/5s/denetim-excel");
    ok("eski 'bes_s' yetkisi yeni 5S yetkilerine açıldı", r.status === 200);

    // --- 5S denetim revize ---
    csrf = await girisYap("admin123");
    r = await get(`/5s/denetim/${birDenetim.id}/revize`);
    ok("ödülü işlenmiş turda revize engellendi", r.status === 302 && konum(r) === `/5s/denetim/${birDenetim.id}`);
    const bagimsiz = { csrf_token: csrf, tarih: "2025-12-01", not: "bağımsız", denetmen: "Test Denetmen" };
    for (const k of BESS_TUM_KRITERLER) bagimsiz["bulgu_" + k] = "0";
    await post(`/5s/bolum/${bidler[0]}/denetim`, bagimsiz);
    const [[bd]] = await db.query("SELECT id, puan FROM denetimler WHERE tarih = '2025-12-01'");
    ok("bağımsız denetim 100", bd && bd.puan === 100);
    html = await getText(`/5s/denetim/${bd.id}/revize`);
    ok("revize formu ön-dolu açıldı", html.includes("Revize") && html.includes(`/5s/denetim/${bd.id}/revize`));
    const rev = { csrf_token: csrf, not: "revize edildi" };
    for (const k of BESS_TUM_KRITERLER) rev["bulgu_" + k] = k === "s1_1" ? "2" : "0";
    r = await postMultipart(`/5s/denetim/${bd.id}/revize`, rev, { foto_s1_1: ["k.png", MINI_PNG] });
    const [[bd2]] = await db.query("SELECT puan, revize_eden, fotolar FROM denetimler WHERE id = ?", [bd.id]);
    ok("revize skoru yeniden hesapladı (100 → 94)", bd2.puan === 94 && bd2.revize_eden === "Ana Yönetici", JSON.stringify(bd2));
    ok("revizede fotoğraf eklendi", (bd2.fotolar || "").includes("s1_1"));

    // --- 5S bölümler listesi + bölüm trendi ---
    html = await getText("/5s");
    ok("bölümler tablo görünümü (personel, açık aksiyon)", html.includes("bolum-tablo") && html.includes("Açık Aksiyon"));
    html = await getText(`/5s/bolum/${bidler[0]}`);
    ok("bölüm sayfasında trend + S kırılımı", html.includes("5S Skor Trendi") && html.includes("S1 <small>") && html.includes("Personel"));

    // --- 5S Periyodik Kontrol Formu ---
    const K = require("../src/kontrol");
    const C = require("../src/cekirdek");
    const trBugun = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 10);
    const kAy = trBugun.slice(0, 7), kGun = String(parseInt(trBugun.slice(8, 10), 10));
    const [[aliBolum]] = await db.query("SELECT id FROM bolumler WHERE sorumlu = 'Ali Test'");
    const kUrl = `/5s/bolum/${aliBolum.id}/kontrol`;
    await get("/yonetici/cikis");
    r = await get(kUrl);
    ok("kontrol formu girişsiz görüntülenebiliyor", r.status === 200);
    csrf = await girisYap("deniz123"); // bölüm lideri olmayan denetmen
    r = await post(kUrl, { csrf_token: csrf, ay: kAy, gun: kGun, durum_g1: "uygun" });
    let [[kSay]] = await db.query("SELECT COUNT(*) AS n FROM kontrol_kayitlari");
    ok("lider olmayan denetmen formu dolduramaz", kSay.n === 0);
    r = await post(kUrl + "/imza", { csrf_token: csrf, ay: kAy, tip: "hafta", sira: "1" });
    const [[imz]] = await db.query("SELECT onaylayan FROM kontrol_onaylari WHERE tip = 'hafta' AND sira = 1");
    ok("lider olmayan denetmen haftalık kontrolü imzalayabilir", imz && imz.onaylayan === "Deniz Denetmen");
    csrf = await girisYap("alitest99"); // bölümün ekip lideri
    html = await getText("/gorevlerim");
    ok("görevlerimde bugünkü kontrol formu", html.includes("Bugünkü periyodik kontrol"));
    r = await post(kUrl, { csrf_token: csrf, ay: kAy, gun: kGun, durum_g1: "uygun", durum_g2: "uygunsuz" });
    [[kSay]] = await db.query("SELECT COUNT(*) AS n FROM kontrol_kayitlari");
    ok("uygun değil açıklamasız kaydedilmedi", kSay.n === 0);
    const [[aksOnce]] = await db.query("SELECT COUNT(*) AS n FROM aksiyonlar");
    const kForm = { csrf_token: csrf, ay: kAy, gun: kGun, durum_g2: "uygunsuz",
      aciklama_g2: "Acil stop butonu çalışmıyor", aksiyon_g2: "1", termin_g2: "2099-01-01", durum_h1: "uygun" };
    for (const k of ["g1", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"]) kForm["durum_" + k] = "uygun";
    r = await post(kUrl, kForm);
    ok("kayıttan sonra takvimli tarihe dönüldü", konum(r) === `${kUrl}?tarih=${trBugun}`, konum(r));
    [[kSay]] = await db.query("SELECT COUNT(*) AS n FROM kontrol_kayitlari WHERE ay = ?", [kAy]);
    ok("lider formu kaydetti (11 madde)", kSay.n === 11, "kayıt: " + kSay.n);
    const [[aksSonra]] = await db.query("SELECT COUNT(*) AS n FROM aksiyonlar");
    ok("kontrol formundan aksiyon açılmıyor", aksSonra.n === aksOnce.n);
    r = await post(kUrl, { csrf_token: csrf, ay: kAy, gun: "31", durum_g1: "uygun" });
    ok("ileri tarih işaretlenemez (ayın 31'i bugün değilse)", kGun === "31" || konum(r).includes("tarih=" + kAy + "-31"));
    html = await getText(kUrl);
    ok("aylık tabloda işaretler görünüyor", html.includes("kt-ok") && html.includes("kt-x") && html.includes("Acil stop"));
    ok("tarih takvimle seçiliyor, aksiyon kutusu yok", html.includes('type="date" id="kontrol-tarih"') &&
      html.includes(`value="${trBugun}"`) && html.includes(`max="${trBugun}"`) && !html.includes("Aksiyon aç"));
    // Takvimden geçmiş bir gün: önceki ayın 3'ü → o ayın formu, 3. gün seçili
    const oncekiAy = K.ayKaydir(kAy, -1);
    html = await getText(`${kUrl}?tarih=${oncekiAy}-03`);
    ok("takvimden geçmiş gün açıldı", html.includes(`value="${oncekiAy}-03"`) && html.includes('name="gun" value="3"') &&
      html.includes(`name="ay" value="${oncekiAy}"`));
    html = await getText(`${kUrl}?tarih=2099-01-01`);
    ok("ileri tarih bugüne çekildi", html.includes(`value="${trBugun}"`));
    // Geçmiş aylara kayıt (Excel: yalnız seçilen ay iner)
    const ikiAyOnce = K.ayKaydir(kAy, -2);
    await db.query(`INSERT INTO kontrol_kayitlari(bolum_id, ay, gun, madde, durum, aciklama, isaretleyen, zaman)
      VALUES(?, ?, 5, 'g1', 'uygunsuz', 'Eski ay tespiti', 'Ali Test', ''), (?, ?, 7, 'g3', 'uygun', '', 'Ali Test', '')`,
      [aliBolum.id, ikiAyOnce, aliBolum.id, oncekiAy]);
    const ExcelJS = require("exceljs");
    const excelOku = async (ay) => {
      const rr = await get(`${kUrl}/excel?ay=${ay}`);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await rr.arrayBuffer()));
      return { rr, adlar: wb.worksheets.map((w) => w.name), wb };
    };
    const ayAd = (a) => C.ayEtiketi(a);
    let ex = await excelOku(kAy);
    ok("kontrol formu Excel", ex.rr.status === 200 && (ex.rr.headers.get("content-type") || "").includes("spreadsheet"));
    const exMetin = [];
    ex.wb.eachSheet((w) => w.eachRow((row) => exMetin.push(row.values.join(" "))));
    ok("form kodu (T-FR016) dosya adında, sayfada ve Excel'de yok",
      !/FR016/.test(decodeURIComponent(ex.rr.headers.get("content-disposition") || "")) &&
      !/FR016/.test(await getText(kUrl)) && !exMetin.some((t) => /FR016|REV/.test(t)));
    ok("Excel: yalnız seçilen ayın formu (önce) + özet; önceki aylar yok",
      ex.adlar.join("|") === [ayAd(kAy), "ÖZET"].join("|"), ex.adlar.join("|"));
    ok("Excel dosya adında yalnız seçilen ay",
      decodeURIComponent(ex.rr.headers.get("content-disposition") || "").includes(`_${kAy}.xlsx`));
    const ozetMetni = (wb) => { const m = []; wb.getWorksheet("ÖZET").eachRow((row) => m.push(row.values.join(" "))); return m; };
    let ozetMetin = ozetMetni(ex.wb);
    ok("Excel özetinde yalnız seçilen ayın uygunsuzlukları", ozetMetin.some((t) => t.includes("Acil stop")) &&
      !ozetMetin.some((t) => t.includes("Eski ay tespiti")));
    ex = await excelOku(ikiAyOnce);
    ozetMetin = ozetMetni(ex.wb);
    ok("Excel: geçmiş ay seçilince yalnız o ay iner",
      ex.adlar.join("|") === [ayAd(ikiAyOnce), "ÖZET"].join("|") && ozetMetin.some((t) => t.includes("Eski ay tespiti"))
      && !ozetMetin.some((t) => t.includes("Acil stop")), ex.adlar.join("|"));
    html = await getText(kUrl);
    ok("Excel ay seçiminde kayıtlı aylar", html.includes(`<option value="${ikiAyOnce}"`) && html.includes("Excel (seçilen ay)"));
    html = await getText("/5s");
    ok("bölümler listesinde bu ay kontrol sütunu", html.includes("Bu Ay Kontrol") && html.includes("1/" + kGun + " gün"));

    // --- Puan ve Ödül Ayarları (yalnız ana yönetici) ---
    const AYAR = "/yonetici/puan-ayarlari";
    const varsayilanForm = { esik: "300", bes1: "100", bes2: "75", bes3: "50", oneri_mod: "tablo", oneri_oran: "10",
      oneri_sabit: "10", kaizen_lider_oran: "50", kaizen_uye_oran: "25", uygulama: "ileri" };
    const ayarKaydet = async (degisen, islem = "kaydet") =>
      post(AYAR, { csrf_token: csrf, ...varsayilanForm, ...degisen, islem });
    // Kişinin puan listesindeki öneri ve net puanı (yoksa 0)
    const kisiPuani = async (ad) => {
      const h = await getText("/puan-durumu");
      const i = h.indexOf(`</button>\n                ${ad}\n`);
      if (i < 0) return { oneri: 0, net: 0 };
      const parca = h.slice(i, i + 1500);
      const sayi = (etiket) => parseFloat(((parca.match(new RegExp(`data-label="${etiket}">([^<]*)<`)) || [])[1] || "0").replace(",", "."));
      return { oneri: sayi("Öneri"), net: sayi("Net") };
    };
    csrf = await girisYap("deniz123");
    r = await get(AYAR);
    ok("denetmen puan ayarlarını açamaz", r.status === 302 && !konum(r).startsWith(AYAR));
    csrf = await girisYap("planci12");
    r = await get(AYAR);
    ok("ek yönetici puan ayarlarını açamaz", konum(r) === "/");
    csrf = await girisYap("admin123");
    html = await getText(AYAR);
    ok("ana yönetici puan ayarları sayfası", html.includes("Puan ve Ödül Ayarları") && html.includes("tablo × %10"));
    // Bilinen veri: eski (onay tarihi olmayan) onaylı + puanlı öneri
    await db.query(`INSERT INTO oneriler(\`no\`, tarih, sahibi, konu, durum, puan, kayit_zamani)
      VALUES('ÖNFR2601-90', '2026-01-05', 'Kural Test', 'Kural', 'Onaylandı', 100, '05.01.2026 10:00')`);
    let kp = await kisiPuani("Kural Test");
    ok("varsayılan kural: 100 puanlık öneriye %10 = 10", kp.oneri === 10, JSON.stringify(kp));
    // Önizleme kaydetmez
    html = await (await ayarKaydet({ oneri_oran: "20", uygulama: "geri" }, "onizle")).text();
    const [[ayarSay]] = await db.query("SELECT COUNT(*) AS n FROM config WHERE anahtar = 'puan_kurallari'");
    ok("önizleme etkiyi gösterir ama kaydetmez", html.includes("Önizleme") && html.includes("Kural Test") && ayarSay.n === 0);
    // Geçersiz değer reddedilir
    html = await (await ayarKaydet({ esik: "0" })).text();
    ok("geçersiz eşik reddedildi", html.includes("Ödül eşiği") && html.includes("ayar-hata"));
    // Bugünden itibaren: öneri onaylanınca sabit 15 puan
    r = await ayarKaydet({ oneri_mod: "sabit", oneri_sabit: "15", uygulama: "ileri" });
    ok("sabit puan kuralı kaydedildi", konum(r) === AYAR);
    kp = await kisiPuani("Kural Test");
    ok("ileriye dönük: eski onaylı öneri eski kuralla (10)", kp.oneri === 10, JSON.stringify(kp));
    await post("/oneri/yeni", { csrf_token: csrf, bolum: "Montaj", tarih: trBugun, sahibi_ad: "Sabit", sahibi_soyad: "Test",
      gorevi: "Operatör", konu: "Sabit puan denemesi", detay: "d", cozum: "c" });
    const [[sabitNo]] = await db.query("SELECT `no` FROM oneriler WHERE sahibi = 'Sabit Test'");
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(sabitNo.no)}`);
    ok("onay kartında sabit puan bilgisi", html.includes("Onaylanınca öneri sahibine") && html.includes("15 puan"));
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: sabitNo.no, durum: "Onaylandı" });
    const [[sabitKayit]] = await db.query("SELECT onay_zamani, puan FROM oneriler WHERE `no` = ?", [sabitNo.no]);
    ok("onay zamanı kaydedildi", Boolean(sabitKayit.onay_zamani));
    kp = await kisiPuani("Sabit Test");
    ok("sabit kural: onaylanan öneri sahibine 15 puan (puanlamasız)", kp.oneri === 15 && sabitKayit.puan === null, JSON.stringify(kp));
    r = await get(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(sabitNo.no)}`);
    ok("sabit kuraldaki öneri puanlama tablosuyla puanlanamaz", konum(r).startsWith("/detay"));
    html = await getText(`/detay?tip=oneri&no=${encodeURIComponent(sabitNo.no)}`);
    ok("detayda sabit puan ve yazılan puan", html.includes("Sabit puan: 15") && html.includes("+15") && !html.includes("★ Puanla"));
    html = await getText("/liste?q=Sabit");
    ok("listede 'sabit +15', Puanla düğmesi yok", html.includes("sabit +15") && !html.includes(`no=${encodeURIComponent(sabitNo.no)}&geri`));
    // Geriye dönük: tüm kayıtlara tablo × %20
    r = await ayarKaydet({ oneri_mod: "tablo", oneri_oran: "20", uygulama: "geri" });
    const [[kuralJson]] = await db.query("SELECT deger FROM config WHERE anahtar = 'puan_kurallari'");
    kp = await kisiPuani("Kural Test");
    const kpSabit = await kisiPuani("Sabit Test");
    ok("geriye dönük: eski öneri yeni oranla (20), tek sürüm kaldı", kp.oneri === 20 && JSON.parse(kuralJson.deger).length === 1, JSON.stringify(kp));
    ok("geriye dönük tablo kuralında puanlanmamış öneri puan almaz", kpSabit.oneri === 0);
    // Ödül eşiği: düşülen puan ödül kaydında saklanır
    await ayarKaydet({ oneri_oran: "20", uygulama: "geri", esik: "15" });
    html = await getText("/puan-durumu");
    ok("eşik değişti: Ödül Ver (−15)", html.includes("Ödül Ver (−15)"));
    await post("/odul-ver", { csrf_token: csrf, ad: "Kural Test" });
    const [[odulKayit]] = await db.query("SELECT puan FROM odul_arsiv WHERE ad = 'Kural Test'");
    await ayarKaydet({ oneri_oran: "20", uygulama: "geri", esik: "300" });
    kp = await kisiPuani("Kural Test");
    ok("ödülde düşülen 15 saklandı; eşik 300'e dönünce net 5", Number(odulKayit.puan) === 15 && kp.net === 5, JSON.stringify(kp));
    // 5S: işlenmiş turun puanı değişmez
    await ayarKaydet({ oneri_oran: "20", uygulama: "geri", bes1: "60", bes2: "40", bes3: "20" });
    const [[odulAyar]] = await db.query("SELECT deger FROM config WHERE anahtar = 'odul_ayarlari'");
    const [[besDefter]] = await db.query("SELECT MAX(puan) AS m FROM odul_kayitlari");
    ok("5S ödülleri kaydedildi, işlenmiş tur defteri aynı (100)", JSON.parse(odulAyar.deger).bes.join("/") === "60/40/20" && Number(besDefter.m) === 100);
    // Sürüm kaldırma
    await ayarKaydet({ oneri_mod: "sabit", oneri_sabit: "5", bes1: "60", bes2: "40", bes3: "20" });
    await post(AYAR + "/surum-sil", { csrf_token: csrf, gecerlilik: trBugun });
    const [[kuralSon]] = await db.query("SELECT deger FROM config WHERE anahtar = 'puan_kurallari'");
    ok("bugünkü sürüm kaldırıldı", JSON.parse(kuralSon.deger).length === 1);
    // Kullanıcı verisi onay penceresinde JS'e gömülmez (tırnaklı isim)
    await db.query(`INSERT INTO oneriler(\`no\`, tarih, sahibi, konu, durum, puan, kayit_zamani)
      VALUES('ÖNFR2601-91', '2026-01-06', 'O''Brien Test', 'Tırnak', 'Onaylandı', 100, '06.01.2026 10:00')`);
    html = await getText("/puan-durumu");
    ok("onay pencerelerinde isim JS dizgisine gömülmüyor", !html.includes("confirm('") && /data-onay="[^"]*O&#39;Brien Test/i.test(html));

    // --- Ortak bölüm listesi (Yönetim › Bölümler): öneri/kaizen açılır listesi + 5S'e dahil ---
    const BOL = "/yonetici/bolumler";
    const bolumleriOku = async () => Object.fromEntries(
      (await db.query("SELECT id, ad, bes_dahil FROM bolumler"))[0].map((b) => [b.ad, { ...b, bes_dahil: Number(b.bes_dahil) }]));
    csrf = await girisYap("kisitli123");
    r = await get(BOL);
    await post(BOL + "/ekle", { csrf_token: csrf, adlar: "Yetkisiz Liste" });
    ok("bes_plan yetkisi olmayan bölüm listesini açamaz/ekleyemez",
      konum(r) === "/" && !(await bolumleriOku())["Yetkisiz Liste"]);
    csrf = await girisYap("planci12");
    html = await getText(BOL);
    ok("bes_plan yetkili ek yönetici bölüm listesini açar", html.includes("🏭 Bölümler") && html.includes('name="ad_'));
    // Toplu ekleme (5S kutusu işaretsiz): mükerrer (harf farkıyla) atlanır, boşluk düzeltilir; eskiler 5S'te kalır
    r = await post(BOL + "/ekle", { csrf_token: csrf, adlar: "İdari İşler\nmontaj\n  Satın   Alma  \n\n<b>Xss</b>" });
    let bol = await bolumleriOku();
    ok("toplu ekleme: 3 yeni 5S dışı bölüm, mükerrer 'montaj' atlandı, boşluk düzeltildi",
      bol["İdari İşler"]?.bes_dahil === 0 && bol["Satın Alma"]?.bes_dahil === 0 && bol["<b>Xss</b>"]
      && Object.keys(bol).filter((a) => a.toLocaleLowerCase("tr") === "montaj").length === 1);
    ok("eski bölümler 5S'e dahil kaldı", bol.Montaj.bes_dahil === 1 && bol.Kaynak.bes_dahil === 1);
    html = await getText(BOL);
    ok("bölüm adı sayfada kaçışlı", html.includes("&lt;b&gt;Xss&lt;/b&gt;") && !html.includes("<b>Xss</b>"));
    html = await getText("/5s");
    ok("5S bölüm tablosunda 5S dışı bölüm yok", !html.includes("İdari İşler") && html.includes("3 bölüm 5S dışında"));
    // Üst menüde 5S yalnız girişliye; girişsiz ziyaretçi ana sayfadaki kutudan ulaşır
    html = await getText("/");
    ok("girişli üst menüde 5S var", html.includes('<a href="/5s">🧹 5S</a>'));
    // Öneri formu: açılır liste + sunucu doğrulaması (girişsiz)
    await get("/yonetici/cikis");
    html = await getText("/");
    ok("girişsiz üst menüde 5S yok, ana sayfa kutusu duruyor", !html.includes('<a href="/5s">🧹 5S</a>') && html.includes('class="hub-box" href="/5s"'));
    html = await getText("/oneri/yeni");
    const anonCsrf = csrfFrom(html);
    ok("öneri formunda bölüm açılır listesi (5S dışı bölümler de)",
      html.includes('<select id="bolum" name="bolum" required>') && html.includes('<option value="İdari İşler"'));
    html = await (await post("/oneri/yeni", { csrf_token: anonCsrf, bolum: "Uydurma Bölüm", tarih: bugun,
      sahibi_ad: "Liste", sahibi_soyad: "Dışı", gorevi: "Op", konu: "Liste dışı", detay: "d" })).text();
    const [[disiSay]] = await db.query("SELECT COUNT(*) AS n FROM oneriler WHERE sahibi = 'Liste Dışı'");
    ok("listede olmayan bölüm reddedildi, kayıt açılmadı", html.includes('flash error">Bölümü listeden seçin.') && disiSay.n === 0);
    await post("/oneri/yeni", { csrf_token: anonCsrf, bolum: "idari  işler", tarih: bugun,
      sahibi_ad: "Liste", sahibi_soyad: "İçi", gorevi: "Op", konu: "Liste içi", detay: "d" });
    const [[iciKayit]] = await db.query("SELECT `no`, bolum FROM oneriler WHERE sahibi = 'Liste İçi'");
    ok("bölüm listedeki yazılışıyla kaydedildi", iciKayit && iciKayit.bolum === "İdari İşler", JSON.stringify(iciKayit));
    html = await getText("/kaizen/yeni");
    ok("kaizen formunda aynı bölüm listesi", html.includes('<select id="bolum" name="bolum" required>') && html.includes('<option value="Satın Alma"'));
    html = await (await postMultipart("/kaizen/yeni", { csrf_token: anonCsrf, baslangic: bugun, konu: "Bölümsüz kaizen",
      bolum: "", lider_ad: "Kai", lider_soyad: "Zen", onceki: "o", sonraki: "s", onceki_maliyet: "0", sonraki_maliyet: "0" })).text();
    const [[kzSay]] = await db.query("SELECT COUNT(*) AS n FROM kaizenler WHERE konu = 'Bölümsüz kaizen'");
    ok("kaizende bölüm seçimi zorunlu", html.includes('flash error">Bölüm seçin.') && kzSay.n === 0);
    // Tek kaydet: ad değiştirme + 5S dışına alma; çakışan ad hiçbir şeyi kaydetmez
    csrf = await girisYap("planci12");
    const bolumFormu = (degis) => {
      const f = new URLSearchParams({ csrf_token: csrf });
      for (const b of Object.values(bol)) {
        const d = { ad: b.ad, bes: b.bes_dahil === 1, ...(degis[b.ad] || {}) };
        f.append("id", b.id);
        f.append(`ad_${b.id}`, d.ad);
        if (d.bes) f.append(`bes_${b.id}`, "1");
      }
      return f;
    };
    r = await post(BOL + "/kaydet", bolumFormu({ "İdari İşler": { ad: "MONTAJ" } }));
    html = await getText(BOL);
    ok("çakışan ad reddedildi, hiçbir şey değişmedi", html.includes("Aynı adla iki bölüm olamaz") && (await bolumleriOku())["İdari İşler"]);
    r = await post(BOL + "/kaydet", bolumFormu({ Kaynak: { ad: "Kaynakhane", bes: false }, "Satın Alma": { bes: true } }));
    html = await getText(BOL);
    bol = await bolumleriOku();
    ok("ad değişti + 5S'ten çıktı + 5S'e girdi (tek kayıt)", bol.Kaynakhane?.bes_dahil === 0 && !bol.Kaynak && bol["Satın Alma"].bes_dahil === 1);
    ok("değişiklik özeti mesajda", html.includes("Kaynak → Kaynakhane") && html.includes("Kaynakhane 5S dışına alındı"));
    const [[kaynakDenetim]] = await db.query("SELECT COUNT(*) AS n FROM denetimler WHERE bolum_id = ? AND puan IS NOT NULL", [bol.Kaynakhane.id]);
    ok("5S dışına alınan bölümün geçmiş denetimleri korundu", kaynakDenetim.n > 0);
    html = await getText(`/5s/bolum/${bol.Kaynakhane.id}`);
    ok("5S dışı bölüm sayfasında not, kontrol formu düğmesi yok", html.includes("Bu bölüm 5S'e dahil değil") && !html.includes("Periyodik Kontrol Formu</a>"));
    html = await getText("/panel");
    ok("5S trendinde geçmişi olan 5S dışı bölüm görünür, hiç denetimi olmayan görünmez",
      html.includes("Kaynakhane") && !html.includes("İdari İşler"));
    // Eski kayıttaki (listeden kalkmış) bölüm düzenlemede korunur
    const [[eskiKz]] = await db.query("SELECT `no` FROM kaizenler WHERE bolum = 'Kaynak' LIMIT 1");
    csrf = await girisYap("admin123");
    html = await getText(`/kaizen/duzenle?no=${encodeURIComponent(eskiKz.no)}`);
    ok("düzenlemede eski bölüm seçili kalır (listede yok)", html.includes('<option value="Kaynak" selected>Kaynak (eski kayıt — listede yok)</option>'));
    // Maliyeti olmayan eski kaizen: detayda not; düzenlerken maliyet zorunlu
    await db.query("INSERT INTO kaizenler(`no`, baslangic, konu, bolum, lider, uyeler, sorumlular, onceki, sonraki, durum, kayit_zamani) " +
      "VALUES('ÖSKFR9901-01', '2025-01-10', 'Eski maliyetsiz kaizen', 'Montaj', 'Eski Lider', '[]', 'Eski Lider', 'ö', 's', 'Değerlendiriliyor', '')");
    html = await getText(`/detay?tip=kaizen&no=${encodeURIComponent("ÖSKFR9901-01")}`);
    ok("maliyetsiz eski kaizen detayı açılır (not gösterilir)", html.includes("Maliyet hesabı girilmemiş"));
    const eskiDuzenle = `/kaizen/duzenle?no=${encodeURIComponent("ÖSKFR9901-01")}`;
    const eskiForm = { csrf_token: csrf, baslangic: "2025-01-10", konu: "Eski maliyetsiz kaizen", bolum: "Montaj",
      lider_ad: "Eski", lider_soyad: "Lider", onceki: "ö", sonraki: "s" };
    html = await (await postMultipart(eskiDuzenle, eskiForm)).text();
    let [[eskiM]] = await db.query("SELECT onceki_maliyet FROM kaizenler WHERE `no` = 'ÖSKFR9901-01'");
    ok("eski kaizen düzenlenirken maliyet zorunlu", html.includes("maliyetini (€) girin") && eskiM.onceki_maliyet === null);
    await postMultipart(eskiDuzenle, { ...eskiForm, onceki_maliyet: "2000", sonraki_maliyet: "1500,25" });
    [[eskiM]] = await db.query("SELECT onceki_maliyet, sonraki_maliyet FROM kaizenler WHERE `no` = 'ÖSKFR9901-01'");
    ok("düzenlemede maliyet kaydedildi", Number(eskiM.onceki_maliyet) === 2000 && Number(eskiM.sonraki_maliyet) === 1500.25);
    html = await getText(eskiDuzenle);
    ok("düzenleme formunda kayıtlı maliyet dolu", html.includes('value="2000"') && html.includes('value="1500.25"'));
    // Denetim turu yalnız 5S'e dahil bölümler için açılır
    await post("/5s/denetim-turu", { csrf_token: csrf, baslangic: "2027-03-01", bitis: "2027-03-05" });
    const [turBolum] = await db.query("SELECT bolum_id FROM denetimler WHERE tarih = '2027-03-01'");
    const dahilIdler = Object.values(await bolumleriOku()).filter((b) => b.bes_dahil === 1).map((b) => b.id).sort();
    ok("yeni denetim turu yalnız 5S'e dahil bölümleri kapsar",
      turBolum.map((x) => x.bolum_id).sort().join() === dahilIdler.join() && !turBolum.some((x) => x.bolum_id === bol.Kaynakhane.id));
    // Excel: öneri Excel'inde Bölüm sütunu (22 eski sütunun ardından)
    r = await get("/oneri/excel");
    const ExcelJSm = require("exceljs");
    const wbB = new ExcelJSm.Workbook();
    await wbB.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const wsB = wbB.worksheets[0];
    const basliklarB = wsB.getRow(1).values.slice(1);
    let iciSatir = null;
    wsB.eachRow((row) => { if (row.getCell(1).value === iciKayit.no) iciSatir = row; });
    const bolSutun = basliklarB.indexOf("Bölüm") + 1;
    ok("öneri Excel'inde Bölüm sütunu (eski sütunlardan sonra) ve değeri dolu",
      bolSutun === 23 && iciSatir && iciSatir.getCell(bolSutun).value === "İdari İşler");
    // Liste: bölüm filtresi (büyük/küçük harf önemsiz) + Bölüm sütunu + bölümü belirtilmemiş kayıtlar
    html = await getText("/liste?bolum=" + encodeURIComponent("İdari İşler"));
    ok("liste bölüm filtresi: yalnız o bölümün kayıtları", html.includes(iciKayit.no) && !html.includes("Dönüşen kaizen")
      && html.includes('<option value="İdari İşler" selected>') && html.includes("<th>Bölüm</th>"));
    html = await getText("/liste?bolum=" + encodeURIComponent("montaj"));
    ok("bölüm filtresi harf farkını önemsemez, seçenek listedeki yazılışla seçili", html.includes("Dönüşen kaizen")
      && !html.includes(iciKayit.no) && html.includes('<option value="Montaj" selected>'));
    html = await getText("/liste?tip=oneri&bolum=-&q=" + encodeURIComponent("Toplu 7"));
    ok("bölüm belirtilmemiş kayıtlar ayrı seçenekle süzülür", html.includes(">Toplu 7<") && html.includes("Bölüm belirtilmemiş")
      && !html.includes(iciKayit.no));
    html = await getText("/liste?bolum=-");
    ok("sayfa bağlantıları bölüm filtresini korur", html.includes('class="sayfalama"') && html.includes("bolum=-&amp;s=2"));
    // Silme: geçmişi olmayan bölüm silinir; öneri kaydındaki ad değişmez
    await post(BOL + "/sil", { csrf_token: csrf, id: (await bolumleriOku())["İdari İşler"].id });
    const [[iciSonra]] = await db.query("SELECT bolum FROM oneriler WHERE `no` = ?", [iciKayit.no]);
    ok("bölüm silindi, öneri kaydındaki bölüm adı yerinde", !(await bolumleriOku())["İdari İşler"] && iciSonra.bolum === "İdari İşler");
    html = await getText(BOL);
    ok("geçmişli bölümün silme onayında denetim sayısı uyarısı", /data-onay="[^"]*Kaynakhane[^"]*denetim ve fotoğrafları da KALICI/.test(html));

    // --- Bölüm personeli (toplu ekleme) + ekip lideri: Yönetim › Bölümler › bölüm sayfası ---
    csrf = await girisYap("planci12");
    bol = await bolumleriOku();
    const montajId = bol.Montaj.id, satinId = bol["Satın Alma"].id;
    const kisileriOku = async (id) => JSON.parse((await db.query("SELECT kisiler FROM bolumler WHERE id = ?", [id]))[0][0].kisiler);
    html = await getText(`${BOL}/${satinId}`);
    ok("bölüm personel sayfası açılır", html.includes("👥 Satın Alma") && html.includes('name="kisiler"'));
    await post(`${BOL}/${montajId}/personel`, { csrf_token: csrf, kisiler: "Deniz Kaya" });
    await post(`${BOL}/${satinId}/personel`, { csrf_token: csrf,
      kisiler: "ahmet  YILMAZ\r\nAyşe Nur Çelik\r\nTekkelime\r\nahmet yılmaz\r\ndeniz kaya\r\n" });
    html = await getText(`${BOL}/${satinId}`);
    ok("toplu personel: ad/soyad düzeltildi, tekrar ve tek kelime eklenmedi",
      (await kisileriOku(satinId)).join("|") === "Ahmet Yılmaz|Ayşe Nur Çelik|Deniz Kaya");
    ok("toplu personel mesajları (tek kelime, zaten var, başka bölümde)",
      html.includes("eklenmedi: Tekkelime") && html.includes("Zaten bu bölümde: Ahmet Yılmaz") && html.includes("Deniz Kaya (Montaj)"));
    await post(`${BOL}/${satinId}/lider`, { csrf_token: csrf, lider1_ad: "ayşe nur", lider1_soyad: "çelik", lider2_ad: "", lider2_soyad: "" });
    const [[satinL]] = await db.query("SELECT sorumlu FROM bolumler WHERE id = ?", [satinId]);
    ok("ekip lideri bölüm sayfasından kaydedildi", satinL.sorumlu === "Ayşe Nur Çelik", satinL.sorumlu);
    await post(`${BOL}/${satinId}/personel/sil`, { csrf_token: csrf, ad: "Deniz Kaya" });
    ok("personel bölümden çıkarıldı", !(await kisileriOku(satinId)).includes("Deniz Kaya"));
    html = await getText(BOL);
    ok("bölüm listesinde personel sayısı ve bağlantısı", html.includes(`href="/yonetici/bolumler/${satinId}"`) && html.includes("👥 2 kişi"));
    csrf = await girisYap("kisitli123");
    await post(`${BOL}/${satinId}/personel`, { csrf_token: csrf, kisiler: "Yetkisiz Kişi" });
    ok("yetkisiz kullanıcı personel ekleyemez", !(await kisileriOku(satinId)).includes("Yetkisiz Kişi"));

    // --- Görev tanımları: ortak liste; öneri ve kaizen ekibinde açılır liste ---
    const gorevListe = async () => {
      const [[r0]] = await db.query("SELECT deger FROM config WHERE anahtar = 'gorev_tanimlari'");
      return r0 ? JSON.parse(r0.deger) : [];
    };
    csrf = await girisYap("planci12");
    html = await getText(BOL);
    ok("kayıtlarda geçen görevler listeye eklenmek üzere önerilir",
      html.includes("Kayıtlarda geçen ama listede olmayan") && html.includes('name="adlar" value="Operatör"'));
    await post("/yonetici/gorevler/ekle", { csrf_token: csrf, adlar: "Operatör" }); // öneri kutusundan
    await post("/yonetici/gorevler/ekle", { csrf_token: csrf, adlar: "Ekip Lideri\nusta\nOPERATÖR\n<i>x</i>" });
    let gl = await gorevListe();
    ok("görev tanımları eklendi (mükerrer atlandı)", gl.length === 4 && gl.includes("Operatör") && gl.includes("usta") && gl.includes("Ekip Lideri"), gl.join("|"));
    html = await getText(BOL);
    ok("görev adı sayfada kaçışlı", html.includes("&lt;i&gt;x&lt;/i&gt;") && !html.includes("<i>x</i>"));
    const gorevFormu = (degis) => {
      const f = new URLSearchParams({ csrf_token: csrf });
      for (const g of gl) { f.append("eski", g); f.append("yeni", degis[g] || g); }
      return f;
    };
    await post("/yonetici/gorevler/kaydet", gorevFormu({ "Ekip Lideri": "operatör" }));
    html = await getText(BOL);
    ok("görevde çakışan ad reddedildi", html.includes("Aynı adla iki görev olamaz") && (await gorevListe()).includes("Ekip Lideri"));
    await post("/yonetici/gorevler/kaydet", gorevFormu({ usta: "Usta" }));
    await post("/yonetici/gorevler/sil", { csrf_token: csrf, ad: "<i>x</i>" });
    gl = await gorevListe();
    ok("görev adı değişti, görev silindi", gl.join("|") === "Ekip Lideri|Operatör|Usta", gl.join("|"));
    // Öneri formu: görev açılır listeden, zorunlu
    await get("/yonetici/cikis");
    html = await getText("/oneri/yeni");
    const anonG = csrfFrom(html);
    ok("öneri formunda görev açılır listesi", html.includes('<select id="gorevi" name="gorevi" required>') && html.includes('<option value="Usta"'));
    html = await (await post("/oneri/yeni", { csrf_token: anonG, bolum: "Montaj", gorevi: "Uydurma Görev", tarih: bugun,
      sahibi_ad: "Gorev", sahibi_soyad: "Disi", konu: "g", detay: "d" })).text();
    ok("listede olmayan görev reddedildi", html.includes('flash error">Görevi listeden seçin.'));
    await post("/oneri/yeni", { csrf_token: anonG, bolum: "Montaj", gorevi: "usta", tarih: bugun,
      sahibi_ad: "Gorev", sahibi_soyad: "Ici", konu: "g", detay: "d" });
    const [[gIci]] = await db.query("SELECT gorevi FROM oneriler WHERE sahibi = 'Gorev Ici'");
    ok("öneri görevi listedeki yazılışıyla kaydedildi", gIci && gIci.gorevi === "Usta");
    // Kaizen: lider ve her üye için görev
    html = await getText("/kaizen/yeni");
    ok("kaizen formunda lider ve üye görev listeleri",
      html.includes('<select id="lider_gorevi" name="lider_gorevi" required>') && html.includes('<select id="uye1_gorevi" name="uye1_gorevi">'));
    const kzForm = { csrf_token: anonG, baslangic: bugun, konu: "Görevli kaizen", bolum: "Montaj", lider_ad: "Kai",
      lider_soyad: "Lider", lider_gorevi: "Ekip Lideri", uye1_ad: "Üye", uye1_soyad: "Bir", uye1_gorevi: "",
      uye2_ad: "", uye2_soyad: "", uye2_gorevi: "", onceki: "o", sonraki: "s", onceki_maliyet: "100", sonraki_maliyet: "100" };
    html = await (await postMultipart("/kaizen/yeni", kzForm)).text();
    ok("kaizende üye yazıldıysa görevi zorunlu", html.includes('flash error">Üye Bir için görev seçin.'));
    html = await (await postMultipart("/kaizen/yeni", { ...kzForm, lider_gorevi: "" })).text();
    ok("kaizende lider görevi zorunlu", html.includes('flash error">Kaizen liderinin görevini seçin.'));
    await postMultipart("/kaizen/yeni", { ...kzForm, uye1_gorevi: "operatör" });
    const [[gkz]] = await db.query("SELECT `no`, lider_gorevi, uye_gorevleri FROM kaizenler WHERE konu = 'Görevli kaizen'");
    ok("kaizen ekip görevleri kaydedildi", gkz && gkz.lider_gorevi === "Ekip Lideri" && gkz.uye_gorevleri === '["Operatör"]',
      JSON.stringify(gkz));
    csrf = await girisYap("admin123");
    await post("/yonetici/gorevler/sil", { csrf_token: csrf, ad: "Ekip Lideri" });
    html = await getText(`/kaizen/duzenle?no=${encodeURIComponent(gkz.no)}`);
    ok("listeden silinen görev düzenlemede eski kayıt olarak seçili",
      html.includes('<option value="Ekip Lideri" selected>Ekip Lideri (eski kayıt — listede yok)</option>'));
    html = await getText(`/detay?tip=kaizen&no=${encodeURIComponent(gkz.no)}`);
    ok("kaizen detayında görevler", html.includes("Kai Lider (Ekip Lideri)") && html.includes("Üye Bir (Operatör)"));
    r = await get("/kaizen/excel");
    const wbK = new ExcelJSm.Workbook();
    await wbK.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const wsK = wbK.worksheets[0];
    const bK = wsK.getRow(1).values.slice(1);
    let kzSatir = null;
    wsK.eachRow((row) => { if (row.getCell(1).value === gkz.no) kzSatir = row; });
    const lgSutun = bK.indexOf("Lider Görevi") + 1;
    ok("kaizen Excel'inde Lider Görevi / Üye Görevleri sütunları",
      lgSutun === 21 && bK[lgSutun] === "Üye Görevleri" && kzSatir
      && kzSatir.getCell(lgSutun).value === "Ekip Lideri" && kzSatir.getCell(lgSutun + 1).value === "Üye Bir: Operatör");
    let dkSatir = null;
    wsK.eachRow((row) => { if (row.getCell(1).value === dk.kaizen_no) dkSatir = row; });
    ok("kaizen Excel'inin son 3 sütunu maliyet (€): önceki, sonraki, kazanç/zarar (sayı)",
      bK.slice(-3).join("|") === "Önceki Maliyet (€)|Sonraki Maliyet (€)|Kazanç (+) / Zarar (−) (€)" && dkSatir
      && dkSatir.getCell(bK.length - 2).value === 400 && dkSatir.getCell(bK.length).value === -250
      && kzSatir.getCell(bK.length).value === 0 && /€/.test(dkSatir.getCell(bK.length).numFmt || ""));

    await db.end();
  } finally {
    srv.kill();
    await new Promise((r) => setTimeout(r, 300));
  }

  // --- HTTPS/proxy bayrakları (R3): HSTS + Secure çerez ---
  const BASE2 = "http://127.0.0.1:5002";
  const proxyBaslik = { "x-forwarded-proto": "https" }; // reverse proxy'yi taklit et
  const srv2 = spawn(process.execPath, [path.join(PROJE, "server.js")], {
    env: { ...process.env, ...dbEnv, YALIN_DATA_DIR: DATA, PORT: "5002",
      YALIN_HTTPS: "1", YALIN_PROXY: "1" },
    stdio: "inherit",
  });
  try {
    let hazir2 = false;
    for (let i = 0; i < 30 && !hazir2; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { await fetch(BASE2 + "/", { headers: proxyBaslik }); hazir2 = true; } catch {}
    }
    const r = await fetch(BASE2 + "/", { headers: proxyBaslik, redirect: "manual" });
    const sc = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).join(" | ").toLowerCase();
    ok("HSTS başlığı (https modu)", Boolean(r.headers.get("strict-transport-security")));
    ok("oturum çerezi Secure bayraklı (https modu)", sc.includes("secure"));
  } finally {
    srv2.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  }

  console.log(`\nSONUÇ: ${basarili} başarılı, ${hatali} hatalı`);
  process.exit(hatali ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
