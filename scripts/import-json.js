// Eski Flask uygulamasının JSON verisini SQLite'a aktarır.
// Kullanım: node scripts/import-json.js "C:\...\yalin_uretim_uygulamalari\data"
// Eski veriye YALNIZCA OKUMA yapılır; görseller yeni data klasörüne KOPYALANIR.
const fs = require("fs");
const path = require("path");
const S = require("../src/sabitler");
const { db, js, configSet } = require("../src/db");

const KAYNAK = process.argv[2];
if (!KAYNAK || !fs.existsSync(KAYNAK)) {
  console.error("Kullanım: node scripts/import-json.js <eski-data-klasörü>");
  console.error('Örnek:   node scripts/import-json.js "C:\\...\\yalin_uretim_uygulamalari\\data"');
  process.exit(1);
}

S.ensureDirs();

function oku(rel, varsayilan) {
  const p = path.join(KAYNAK, rel);
  if (!fs.existsSync(p)) return varsayilan;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return varsayilan; }
}

function kopyala(kaynakDir, dosya, hedefDir) {
  if (!dosya) return;
  const src = path.join(kaynakDir, dosya);
  if (fs.existsSync(src)) {
    try { fs.copyFileSync(src, path.join(hedefDir, dosya)); } catch (e) {
      console.warn("  ! kopyalanamadı:", dosya, e.message);
    }
  }
}

function sayi(v) {
  if (v === null || v === undefined || v === "") return null;
  const f = parseFloat(v);
  return Number.isNaN(f) ? null : f;
}

let toplam = 0;
function log(ad, n) { console.log(`  ${ad}: ${n} kayıt`); toplam += n; }

db.exec("BEGIN");
try {
  // --- config (admin şifresi hash'i ve secret key taşınır) ---
  const cfg = oku("config.json", {});
  if (cfg.admin_password) configSet("admin_password", cfg.admin_password);
  if (cfg.secret_key) configSet("secret_key", cfg.secret_key);

  // --- öneriler ---
  const oneriler = oku(path.join("oneri", "oneriler.json"), []);
  const insO = db.prepare(`INSERT OR REPLACE INTO oneriler(no, tarih, sahibi, gorevi, konu,
    detay, cozum, kalite, verimlilik, isg, maliyet, ek, durum, puan, puanlama,
    degerlendirme_notu, kayit_zamani, guncelleme_zamani) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of oneriler) {
    insO.run(r.no, r.tarih || "", r.sahibi || "", r.gorevi || "", r.konu || "",
      r.detay || "", r.cozum || "", r.kalite || "", r.verimlilik || "", r.isg || "",
      r.maliyet || "", r.ek || "", r.durum || S.VARSAYILAN_DURUM, sayi(r.puan),
      r.puanlama ? js(r.puanlama) : null, r.degerlendirme_notu || "",
      r.kayit_zamani || "", r.guncelleme_zamani || null);
  }
  log("Öneri", oneriler.length);

  // --- kaizenler + görselleri ---
  const kaizenler = oku(path.join("kaizen", "kaizenler.json"), []);
  const eskiKaizenImg = path.join(KAYNAK, "kaizen", "gorseller");
  const insK = db.prepare(`INSERT OR REPLACE INTO kaizenler(no, baslangic, bitis, konu, bolum,
    lider, uyeler, sorumlular, kazanclar, onceki, sonraki, onceki_gorsel, sonraki_gorsel,
    durum, puan, puanlama, degerlendirme_notu, kayit_zamani, guncelleme_zamani)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of kaizenler) {
    insK.run(r.no, r.baslangic || "", r.bitis || "", r.konu || "", r.bolum || "",
      r.lider || "", js(r.uyeler || []), r.sorumlular || "", js(r.kazanclar || []),
      r.onceki || "", r.sonraki || "", r.onceki_gorsel || "", r.sonraki_gorsel || "",
      r.durum || S.VARSAYILAN_DURUM, sayi(r.puan), r.puanlama ? js(r.puanlama) : null,
      r.degerlendirme_notu || "", r.kayit_zamani || "", r.guncelleme_zamani || null);
    kopyala(eskiKaizenImg, r.onceki_gorsel, S.KAIZEN_IMG_DIR);
    kopyala(eskiKaizenImg, r.sonraki_gorsel, S.KAIZEN_IMG_DIR);
  }
  log("Kaizen", kaizenler.length);

  // --- 5S bölümler ---
  const bolumler = oku(path.join("5s", "bolumler.json"), []);
  const insB = db.prepare("INSERT OR REPLACE INTO bolumler(id, ad, sorumlu, kisiler) VALUES(?,?,?,?)");
  for (const b of bolumler) insB.run(b.id, b.ad || "", b.sorumlu || "", js(b.kisiler || []));
  log("5S bölüm", bolumler.length);

  // --- 5S denetimler + fotoğrafları ---
  const denetimler = oku(path.join("5s", "denetimler.json"), []);
  const eskiBessImg = path.join(KAYNAK, "5s", "gorseller");
  const insD = db.prepare(`INSERT OR REPLACE INTO denetimler(id, bolum_id, tarih, tur_adi,
    baslangic, bitis, plan_gun, plan_saat, planlanan_denetmen, misafir_denetmen, denetmen,
    puan, puanlar, checked, uygunsuz, notu, aciklamalar, fotolar, durum, denetim_tarihi,
    kayit_zamani) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const d of denetimler) {
    insD.run(d.id, d.bolum_id || "", d.tarih || "", d.tur_adi || "",
      d.baslangic || "", d.bitis || "", d.plan_gun || "", d.plan_saat || "",
      d.planlanan_denetmen || "", d.misafir_denetmen || "", d.denetmen || "",
      d.puan === null || d.puan === undefined ? null : d.puan,
      d.puanlar ? js(d.puanlar) : null, js(d.checked || []), js(d.uygunsuz || []),
      d["not"] || "", js(d.aciklamalar || {}), js(d.fotolar || {}),
      d.durum || "", d.denetim_tarihi || null, d.kayit_zamani || "");
    for (const fl of Object.values(d.fotolar || {})) {
      for (const fn of fl) kopyala(eskiBessImg, fn, S.BESS_FOTO_DIR);
    }
  }
  log("5S denetim", denetimler.length);

  // --- 5S ödül defteri ---
  const oduller = oku(path.join("5s", "oduller.json"), { islenen: [], kayitlar: [] });
  db.prepare("DELETE FROM odul_islenen").run();
  db.prepare("DELETE FROM odul_kayitlari").run();
  const insI = db.prepare("INSERT OR IGNORE INTO odul_islenen(tarih) VALUES(?)");
  for (const t of oduller.islenen || []) insI.run(t);
  const insOK = db.prepare(`INSERT INTO odul_kayitlari(tarih, tur_adi, bolum_id, bolum_ad,
    sira, puan, kisiler, islenme_zamani) VALUES(?,?,?,?,?,?,?,?)`);
  for (const k of oduller.kayitlar || []) {
    insOK.run(k.tarih || "", k.tur_adi || "", k.bolum_id || "", k.bolum_ad || "",
      k.sira || null, k.puan || 0, js(k.kisiler || []), k.islenme_zamani || "");
  }
  log("5S ödül kaydı", (oduller.kayitlar || []).length);

  // --- 5S aksiyonlar + kapatma fotoğrafları ---
  const aksiyonlar = oku(path.join("5s", "aksiyonlar.json"), []);
  const eskiAksImg = path.join(KAYNAK, "5s", "aksiyon_gorseller");
  const insA = db.prepare(`INSERT OR REPLACE INTO aksiyonlar(id, denetim_id, tarih, tur_adi,
    bolum_id, bolum_ad, kriter_k, kriter_m, aksiyon, sorumlu, atanan_lider, termin,
    durum, olusturma_zamani, kapatma) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const a of aksiyonlar) {
    insA.run(a.id, a.denetim_id || "", a.tarih || "", a.tur_adi || "",
      a.bolum_id || "", a.bolum_ad || "", a.kriter_k || "", a.kriter_m || "",
      a.aksiyon || "", a.sorumlu || "", a.atanan_lider || "", a.termin || "",
      a.durum || "acik", a.olusturma_zamani || "", a.kapatma ? js(a.kapatma) : null);
    for (const fn of (a.kapatma || {}).fotolar || []) kopyala(eskiAksImg, fn, S.BESS_AKSIYON_FOTO_DIR);
  }
  log("5S aksiyon", aksiyonlar.length);

  // --- denetmenler / misafirler ---
  const denetmenler = oku("denetmenler.json", []);
  const insDn = db.prepare("INSERT OR REPLACE INTO denetmenler(id, ad, sifre, olusturma) VALUES(?,?,?,?)");
  for (const d of denetmenler) insDn.run(d.id, d.ad || "", d.sifre || "", d.olusturma || "");
  log("Denetmen", denetmenler.length);

  const misafirler = oku("misafir_denetmenler.json", []);
  const insM = db.prepare("INSERT OR REPLACE INTO misafirler(id, ad, olusturma) VALUES(?,?,?)");
  for (const m of misafirler) insM.run(m.id, m.ad || "", m.olusturma || "");
  log("Misafir denetmen", misafirler.length);

  // --- ödül arşivi / silinen kişiler ---
  const arsiv = oku("odul_arsiv.json", []);
  db.prepare("DELETE FROM odul_arsiv").run();
  const insAr = db.prepare("INSERT INTO odul_arsiv(ad, puan, tarih, zaman) VALUES(?,?,?,?)");
  for (const r of arsiv) insAr.run(r.ad || "", r.puan || S.ODUL_ESIK, r.tarih || "", r.zaman || "");
  log("Ödül arşivi", arsiv.length);

  const silinen = oku("silinen_kisiler.json", []);
  const insSl = db.prepare("INSERT OR IGNORE INTO silinen_kisiler(ad) VALUES(?)");
  for (const ad of silinen) insSl.run(ad);
  log("Silinen kişi", silinen.length);

  db.exec("COMMIT");
  console.log(`\n✔ Aktarım tamamlandı — toplam ${toplam} kayıt. Veritabanı: ${S.DB_PATH}`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error("✗ Aktarım başarısız, geri alındı:", e);
  process.exit(1);
}
