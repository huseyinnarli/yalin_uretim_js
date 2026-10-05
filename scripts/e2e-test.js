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
    await post("/oneri/yeni", { csrf_token: csrf, tarih: bugun, sahibi_ad: "Puan", sahibi_soyad: "Test",
      gorevi: "Operatör", konu: "Test konusu", detay: "Detay açıklama", cozum: "Çözüm" });
    await post("/oneri/yeni", { csrf_token: csrf, tarih: bugun, sahibi: "Puan Test 2",
      gorevi: "Operatör", konu: "İkinci konu", detay: "Detay", cozum: "" });
    html = await getText("/liste");
    const nolar = [...new Set([...html.matchAll(/ÖNFR\d{4}-\d{2}/g)].map((m) => m[0]))].sort();
    ok("numaralar sıralı üretildi (-01, -02)", nolar.length === 2 &&
      nolar[0].endsWith("-01") && nolar[1].endsWith("-02"), nolar.join(","));
    const no = nolar[0];

    await post("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Onaylandı" });
    html = await getText("/liste");
    ok("onaylanınca form no atandı", /FR-\d{4}-\d{4}/.test(html));
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
    // Kaizen: görselli kayıt (2 dosya sınırının içinde)
    await postMultipart("/kaizen/yeni", {
      csrf_token: csrf, baslangic: bugun, konu: "Görselli kaizen", bolum: "Test",
      lider: "Foto Test", onceki: "Önce", sonraki: "Sonra",
    }, { onceki_gorsel: ["once.png", MINI_PNG], sonraki_gorsel: ["sonra.png", MINI_PNG] });
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
    r = await post("/oneri/yeni", { csrf_token: anon, tarih: bugun, sahibi_ad: "aHMET", sahibi_soyad: "YILMAZ",
      gorevi: "Operatör", konu: "Girişsiz öneri", detay: "Detay" });
    ok("girişsiz öneri gönderildi → anasayfa", r.status === 302 && konum(r) === "/");
    html = await getText("/");
    ok("girişsiz gönderim teşekkür mesajı", html.includes("teşekkürler"));
    r = await post("/oneri/yeni", { csrf_token: anon, tarih: bugun, sahibi_ad: "Sadece", sahibi_soyad: "",
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
    // Onaylanacak öneri + görev ataması (kaizene dönüştürme)
    const gorNo = "ÖNFR9901-04";
    await post("/durum", { csrf_token: csrf, tip: "oneri", no: gorNo, durum: "Onaylandı", gorev_denetmen: dz.id,
      gorev_termin: "2026-12-31", gorev_notu: "Hatta uygula" });
    [[rd]] = await db.query("SELECT durum, gorev_atanan_ad, form_no FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("onayla birlikte görev atandı", rd.durum === "Onaylandı" && rd.gorev_atanan_ad === "Deniz Denetmen" && /FR-/.test(rd.form_no));

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
    r = await post(`/oneri/duzenle?no=${encodeURIComponent(revNo)}`, { csrf_token: csrf, tarih: "2025-01-15",
      sahibi_ad: "Toplu", sahibi_soyad: "Test", gorevi: "Op", konu: "Toplu 2 (düzeltildi)", detay: "Maliyet: 5.000 TL" });
    ok("düzeltme kaydı → görevlerim", konum(r) === "/gorevlerim");
    [[rd]] = await db.query("SELECT durum, konu, revize_tamamlandi FROM oneriler WHERE `no` = ?", [revNo]);
    ok("düzeltme sonrası yeniden değerlendirmede", rd.durum === "Değerlendiriliyor" && rd.revize_tamamlandi && rd.konu.includes("düzeltildi"));
    html = await getText(`/kaizen/yeni?oneri=${encodeURIComponent(gorNo)}`);
    ok("kaizene dönüştürme formu öneriyle dolu", html.includes(gorNo) && html.includes('name="kaynak_oneri"'));
    r = await postMultipart("/kaizen/yeni", { csrf_token: csrf, kaynak_oneri: gorNo, baslangic: bugun,
      konu: "Dönüşen kaizen", lider_ad: "Deniz", lider_soyad: "Denetmen", uye1_ad: "Ali", uye1_soyad: "Test",
      onceki: "Önce", sonraki: "Sonra" });
    const [[dk]] = await db.query("SELECT kaizen_no FROM oneriler WHERE `no` = ?", [gorNo]);
    ok("öneri kaizene dönüştü (bağlandı)", Boolean(dk.kaizen_no) && konum(r) === "/gorevlerim");
    const [[kk]] = await db.query("SELECT kaynak_oneri_no, uyeler FROM kaizenler WHERE `no` = ?", [dk.kaizen_no || ""]);
    ok("kaizende kaynak öneri kayıtlı", kk && kk.kaynak_oneri_no === gorNo);
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

    // --- İsim birleştirme: otomatik + elle ---
    csrf = csrfFrom(await getText("/oneri/yeni"));
    for (const [ad, soyad, konu] of [["ALİ", "TEST", "Büyük harfli"], ["Ali", "Tset", "Yazım hatalı"]]) {
      await post("/oneri/yeni", { csrf_token: csrf, tarih: bugun, sahibi_ad: ad, sahibi_soyad: soyad,
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

    // --- Yetkiler: tam yetkili ek yönetici, ayrıntılı yetki, eski yetki anahtarı ---
    csrf = csrfFrom(await getText("/yonetici"));
    await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Tam", soyad: "Yetkili", sifre: "tamyetki1", yetkiler: "tam" });
    await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Plan", soyad: "Sorumlu", sifre: "planci12", yetkiler: "bes_plan" });
    await db.query("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma) VALUES('eskiyetk', 'Eski Yetki', ?, '[\"bes_s\"]', '')",
      [require("../src/cekirdek").hashPassword("eskiyetki1")]);
    csrf = await girisYap("tamyetki1");
    r = await post("/yonetici/yonetici/ekle", { csrf_token: csrf, ad: "Yeni", soyad: "Kişi", sifre: "yenikisi1", yetkiler: "odul" });
    ok("tam yetkili ek yönetici yönetici ekleyebilir", konum(r) === "/yonetici#yoneticiler");
    r = await post("/yonetici/sifre", { csrf_token: csrf, eski: "admin123", yeni: "x", yeni2: "x" });
    ok("tam yetkili ek yönetici ana şifreyi değiştiremez", konum(r) === "/");
    const [[tamY]] = await db.query("SELECT id FROM yoneticiler WHERE ad = 'Tam Yetkili'");
    r = await post("/yonetici/yonetici/sil", { csrf_token: csrf, id: tamY.id });
    const [[halaVar]] = await db.query("SELECT COUNT(*) AS n FROM yoneticiler WHERE id = ?", [tamY.id]);
    ok("kendi hesabını silemez", halaVar.n === 1);
    r = await get("/yonetici/gunluk");
    ok("tam yetkili işlem günlüğünü görür", r.status === 200);
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
