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
    ok("admin girişi", html.includes("Yönetici Paneli"));

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
    await post(`/5s/bolum/${bidler[0]}/kisi/ekle`, { csrf_token: csrf, ad: "Uye Bir" });
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

    // --- Denetimleri yap ---
    const kriterler = ["1s1","1s2","1s3","1s4","2s1","2s2","2s3","2s4","3s1","3s2","3s3","3s4",
      "4s1","4s2","4s3","4s4","5s1","5s2","5s3","5s4"];
    for (const [i, bid] of bidler.entries()) {
      const form = { csrf_token: csrf, not: "e2e test", denetmen: "Test Denetmen" };
      for (const k of kriterler) form["puan_" + k] = (i === 0 && k === "1s1") ? "3" : "5";
      if (i === 0) {
        form["aksiyon_1s1_1"] = "Gereksiz malzemeleri kaldır";
        form["aksiyon_sorumlu_1s1_1"] = "Ali Test";
      }
      await post(`/5s/bolum/${bid}/denetim`, form);
    }
    html = await getText("/5s");
    ok("denetimler kaydedildi (98 + 100)", html.includes("98/100") && html.includes("100/100"));

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
    await post("/oneri/yeni", { csrf_token: csrf, tarih: bugun, sahibi: "Puan Test",
      gorevi: "Operatör", konu: "Test konusu", detay: "Detay açıklama", cozum: "Çözüm" });
    await post("/oneri/yeni", { csrf_token: csrf, tarih: bugun, sahibi: "Puan Test 2",
      gorevi: "Operatör", konu: "İkinci konu", detay: "Detay", cozum: "" });
    html = await getText("/liste");
    const nolar = [...new Set([...html.matchAll(/ÖNFR\d{4}-\d{2}/g)].map((m) => m[0]))].sort();
    ok("numaralar sıralı üretildi (-01, -02)", nolar.length === 2 &&
      nolar[0].endsWith("-01") && nolar[1].endsWith("-02"), nolar.join(","));
    const no = nolar[0];

    await post("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Onaylandı" });
    await post(`/degerlendir/puan?tip=oneri&no=${encodeURIComponent(no)}`, {
      csrf_token: csrf, tip: "oneri", no,
      p_form: "5", p_komite: "5", p_etki_0_3: "40", p_maliyet_0: "20",
      p_yaygin_2: "15", p_efor_2: "15", degerlendirme_notu: "tam puan",
    });
    html = await getText("/puan-durumu");
    ok("öneri sahibi %10 aldı", html.includes("Puan Test"));

    await post("/durum", { csrf_token: csrf, tip: "oneri", no, durum: "Reddedildi" });
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
