// Çekirdek iş mantığı: numara üretimi, puan durumu, 5S denetim/aksiyon/ödül,
// kimlik doğrulama yardımcıları ve güvenli dosya işlemleri.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const S = require("./sabitler");
const P = require("./puanlama");
const {
  db, js, configGet, configSet,
  oneriRow, kaizenRow, bolumRow, denetimRow, aksiyonRow, odulKayitRow,
} = require("./db");

// ---------------------------------------------------------------------------
// Şifre (werkzeug uyumlu: eski JSON verisindeki pbkdf2/scrypt hash'leri de doğrular)
// ---------------------------------------------------------------------------
function hashPassword(sifre) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iter = 600000;
  const h = crypto.pbkdf2Sync(sifre, salt, iter, 32, "sha256").toString("hex");
  return `pbkdf2:sha256:${iter}$${salt}$${h}`;
}

function hashMi(v) {
  return typeof v === "string" && (v.startsWith("pbkdf2:") || v.startsWith("scrypt:"));
}

function checkPassword(kayitli, sifre) {
  if (!kayitli) return false;
  if (!hashMi(kayitli)) return kayitli === sifre; // eski düz metin
  const [method, salt, hash] = kayitli.split("$");
  if (!method || !salt || !hash) return false;
  try {
    let hesap;
    if (method.startsWith("pbkdf2:")) {
      const [, algo, iterStr] = method.split(":");
      const iter = parseInt(iterStr, 10) || 260000;
      hesap = crypto.pbkdf2Sync(sifre, salt, iter, hash.length / 2, algo || "sha256").toString("hex");
    } else if (method.startsWith("scrypt:")) {
      const [, nStr, rStr, pStr] = method.split(":");
      const N = parseInt(nStr, 10) || 32768, r = parseInt(rStr, 10) || 8, p = parseInt(pStr, 10) || 1;
      hesap = crypto.scryptSync(sifre, salt, hash.length / 2,
        { N, r, p, maxmem: 256 * 1024 * 1024 }).toString("hex");
    } else return false;
    return crypto.timingSafeEqual(Buffer.from(hesap, "hex"), Buffer.from(hash, "hex"));
  } catch { return false; }
}

function getAdminPassword() {
  return configGet("admin_password") || S.ADMIN_PASSWORD;
}
function adminSifreDogru(sifre) {
  return checkPassword(getAdminPassword(), sifre);
}
function setAdminPassword(yeni) {
  configSet("admin_password", hashPassword(yeni));
}
// Açılışta düz metin şifreleri hash'e çevir (ilk kurulum / eski aktarım)
function sifreleriHashle() {
  const kayitli = getAdminPassword();
  if (!hashMi(kayitli)) setAdminPassword(kayitli);
  for (const d of db.prepare("SELECT * FROM denetmenler").all()) {
    if (d.sifre && !hashMi(d.sifre)) {
      db.prepare("UPDATE denetmenler SET sifre = ? WHERE id = ?").run(hashPassword(d.sifre), d.id);
    }
  }
}
// Oturum imza anahtarı config'de tutulur (koda gömülü değil)
function getSecretKey() {
  let k = configGet("secret_key");
  if (!k) { k = crypto.randomBytes(32).toString("hex"); configSet("secret_key", k); }
  return k;
}

// ---------------------------------------------------------------------------
// Genel yardımcılar
// ---------------------------------------------------------------------------
function uid() { return crypto.randomBytes(4).toString("hex"); }

// ÖNFR2606-01 benzeri numara — sıra her ay sıfırlanır. Ekleme transaction
// içinden çağrılır (eşzamanlı istekte mükerrer numara yarışı yok).
function nextNumber(tablo, prefix) {
  const d = S.nowTr();
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0");
  const fullPrefix = `${prefix}${yymm}-`;
  let maxSeq = 0;
  for (const r of db.prepare(`SELECT no FROM ${tablo} WHERE no LIKE ?`).all(fullPrefix + "%")) {
    const seq = parseInt(String(r.no).split("-").pop(), 10);
    if (!Number.isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
  }
  return `${fullPrefix}${String(maxSeq + 1).padStart(2, "0")}`;
}

function safeName(no) {
  return String(no).replace(/Ö/g, "O").replace(/ö/g, "o").replace(/-/g, "_");
}

function allowedFile(filename) {
  return S.ALLOWED_EXT.has(path.extname(filename || "").toLowerCase());
}

// Path-traversal güvenli dosya yolu; base dışına çıkarsa null.
function guvenliYol(baseDir, filename) {
  const tam = path.resolve(baseDir, filename);
  const kok = path.resolve(baseDir);
  if (tam === kok || tam.startsWith(kok + path.sep)) return tam;
  return null;
}

// YYYY-MM-DD -> DD.MM.YYYY
function trdate(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

// 2026-06 -> Haziran 2026
function ayEtiketi(yyyymm) {
  const [y, m] = String(yyyymm).split("-");
  const ay = S.TR_AYLAR[parseInt(m, 10) - 1];
  return ay ? `${ay} ${y}` : yyyymm;
}

// 7.5 -> '7,5' ; 50.0 -> '50'
function puanfmt(v) {
  const f = parseFloat(v);
  if (Number.isNaN(f)) return v;
  const s = f === Math.trunc(f) ? String(Math.trunc(f))
    : f.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}

// Görsel doğrulama: uzantı + dosya imzası (magic bytes) kontrolüyle kaydeder.
const _IMZALAR = [
  [0xFF, 0xD8, 0xFF],                    // JPEG
  [0x89, 0x50, 0x4E, 0x47],              // PNG
  [0x47, 0x49, 0x46, 0x38],              // GIF
  [0x42, 0x4D],                          // BMP
  [0x52, 0x49, 0x46, 0x46],              // WEBP (RIFF)
];
function gorselKaydet(file, hedefYol) {
  if (!file || !file.buffer || !file.buffer.length) return false;
  if (file.buffer.length > S.GORSEL_MAX_BAYT) return false;
  const b = file.buffer;
  const gecerli = _IMZALAR.some((sig) => sig.every((v, i) => b[i] === v));
  if (!gecerli) return false;
  try { fs.writeFileSync(hedefYol, b); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Öneri / Kaizen
// ---------------------------------------------------------------------------
function getRecord(tip, no) {
  if (tip === "oneri") return oneriRow(db.prepare("SELECT * FROM oneriler WHERE no = ?").get(no));
  return kaizenRow(db.prepare("SELECT * FROM kaizenler WHERE no = ?").get(no));
}

function updateRecord(tip, no, fields) {
  const tablo = tip === "oneri" ? "oneriler" : "kaizenler";
  const f = { ...fields, guncelleme_zamani: S.zamanTr() };
  if ("puanlama" in f) f.puanlama = js(f.puanlama);
  const keys = Object.keys(f);
  const set = keys.map((k) => `${k} = ?`).join(", ");
  const r = db.prepare(`UPDATE ${tablo} SET ${set} WHERE no = ?`).run(...keys.map((k) => f[k]), no);
  return r.changes > 0;
}

// Öneri + kaizen birleşik, tarihe göre yeni->eski
function combinedRecords() {
  const out = [];
  for (const r of db.prepare("SELECT * FROM oneriler").all().map(oneriRow)) {
    out.push({ ...r, sort_date: r.tarih || "", baslik: r.konu || "", kisi: r.sahibi || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  for (const r of db.prepare("SELECT * FROM kaizenler").all().map(kaizenRow)) {
    out.push({ ...r, sort_date: r.baslangic || "", baslik: r.konu || "", kisi: r.sorumlular || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  out.sort((a, b) => (b.sort_date + (b.kayit_zamani || "")).localeCompare(a.sort_date + (a.kayit_zamani || "")));
  return out;
}

function filtrele(records, tip, ay, q) {
  q = (q || "").trim().toLowerCase();
  return records.filter((r) => {
    if ((tip === "oneri" || tip === "kaizen") && r.tip !== tip) return false;
    if (ay && !r.sort_date.startsWith(ay)) return false;
    if (q) {
      const hay = `${r.baslik || ""} ${r.kisi || ""} ${r.no || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function mevcutAylar(records) {
  const set = new Set(records.filter((r) => r.sort_date).map((r) => r.sort_date.slice(0, 7)));
  return [...set].sort().reverse().map((a) => [a, ayEtiketi(a)]);
}

// ---------------------------------------------------------------------------
// Puan durumu (öneri %10, kaizen lider %50 / üye %25, 5S ödül defteri)
// ---------------------------------------------------------------------------
function puanDurumu() {
  const tablo = {};
  const detaylar = {};

  function puanEkle(ad, alan, puan) {
    ad = (ad || "").trim();
    if (!ad || puan <= 0) return;
    if (!tablo[ad]) tablo[ad] = { ad, oneri: 0, kaizen: 0, bes_s: 0 };
    tablo[ad][alan] += puan;
  }
  function detayEkle(ad, tip, etiket, puan, no = "") {
    ad = (ad || "").trim();
    if (!ad || puan <= 0) return;
    (detaylar[ad] = detaylar[ad] || []).push({ tip, etiket, no, puan: Math.round(puan * 100) / 100 });
  }

  for (const r of db.prepare("SELECT * FROM oneriler WHERE puan IS NOT NULL").all().map(oneriRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    const pay = Math.round(p * 10) / 100;
    puanEkle(r.sahibi, "oneri", pay);
    detayEkle(r.sahibi, "oneri", r.konu || "Öneri", pay, r.no);
  }
  for (const r of db.prepare("SELECT * FROM kaizenler WHERE puan IS NOT NULL").all().map(kaizenRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    const liderPay = Math.round(p * 50) / 100;
    puanEkle(r.lider, "kaizen", liderPay);
    detayEkle(r.lider, "kaizen", (r.konu || "Kaizen") + " (Lider)", liderPay, r.no);
    for (const u of (r.uyeler || []).slice(0, 2)) {
      const uyePay = Math.round(p * 25) / 100;
      puanEkle(u, "kaizen", uyePay);
      detayEkle(u, "kaizen", (r.konu || "Kaizen") + " (Üye)", uyePay, r.no);
    }
  }
  for (const k of db.prepare("SELECT * FROM odul_kayitlari").all().map(odulKayitRow)) {
    let etiket = k.tur_adi || "5S Denetim";
    etiket = `${etiket} — ${k.bolum_ad || ""} (${k.sira ?? "?"}.)`;
    for (const ad of k.kisiler || []) {
      puanEkle(ad, "bes_s", k.puan || 0);
      detayEkle(ad, "5s", etiket, k.puan || 0, k.tarih || "");
    }
  }

  const harcanan = {};
  for (const r of db.prepare("SELECT * FROM odul_arsiv").all()) {
    harcanan[r.ad] = (harcanan[r.ad] || 0) + (r.puan || S.ODUL_ESIK);
  }
  const silinen = new Set(db.prepare("SELECT ad FROM silinen_kisiler").all().map((r) => r.ad));

  const sonuc = [];
  for (const k of Object.values(tablo)) {
    if (silinen.has(k.ad)) continue;
    k.kazanilan = Math.round((k.oneri + k.kaizen + k.bes_s) * 100) / 100;
    k.harcanan = harcanan[k.ad] || 0;
    k.odul_sayisi = Math.floor(k.harcanan / S.ODUL_ESIK);
    k.net = Math.round((k.kazanilan - k.harcanan) * 100) / 100;
    k.detay = detaylar[k.ad] || [];
    if (k.net > 0) sonuc.push(k); // net 0 ise listeden çıkar
  }
  sonuc.sort((a, b) => b.net - a.net);
  return sonuc;
}

function sayDurum(records) {
  const d = { toplam: 0, oneri: 0, kaizen: 0, onay: 0, red: 0, bekle: 0, revize: 0 };
  for (const r of records) {
    d.toplam += 1;
    d[r.tip] += 1;
    const du = r.durum || S.VARSAYILAN_DURUM;
    if (du === "Onaylandı") d.onay += 1;
    else if (du === "Reddedildi") d.red += 1;
    else if (du === "Düzeltme İsteniyor") d.revize += 1;
    else d.bekle += 1;
  }
  return d;
}

function dashboardIstatistik() {
  const recs = combinedRecords();
  const now = S.nowTr();
  const p = (n) => String(n).padStart(2, "0");
  const buAy = `${now.getFullYear()}-${p(now.getMonth() + 1)}`;
  const buYil = String(now.getFullYear());
  const c6 = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  const cutoff6 = `${c6.getFullYear()}-${p(c6.getMonth() + 1)}-${p(c6.getDate())}`;
  return {
    bu_ay: sayDurum(recs.filter((r) => r.sort_date.startsWith(buAy))),
    son_6ay: sayDurum(recs.filter((r) => r.sort_date && r.sort_date >= cutoff6)),
    bu_yil: sayDurum(recs.filter((r) => r.sort_date.startsWith(buYil))),
    tum: sayDurum(recs),
  };
}

// ---------------------------------------------------------------------------
// 5S — bölümler, denetimler, ödüller
// ---------------------------------------------------------------------------
function loadBolumler() {
  return db.prepare("SELECT * FROM bolumler ORDER BY ad").all().map(bolumRow);
}
function bolumById(bid) {
  return bolumRow(db.prepare("SELECT * FROM bolumler WHERE id = ?").get(bid));
}
function loadDenetimler() {
  return db.prepare("SELECT * FROM denetimler").all().map(denetimRow);
}
function denetimById(did) {
  return denetimRow(db.prepare("SELECT * FROM denetimler WHERE id = ?").get(did));
}
function loadAksiyonlar() {
  return db.prepare("SELECT * FROM aksiyonlar").all().map(aksiyonRow);
}
function aksiyonById(aid) {
  return aksiyonRow(db.prepare("SELECT * FROM aksiyonlar WHERE id = ?").get(aid));
}
function loadDenetmenler() {
  return db.prepare("SELECT * FROM denetmenler ORDER BY ad").all();
}
function loadMisafirler() {
  return db.prepare("SELECT * FROM misafirler ORDER BY ad").all();
}
function odulIslenenler() {
  return db.prepare("SELECT tarih FROM odul_islenen").all().map((r) => r.tarih);
}
function odulKayitlari() {
  return db.prepare("SELECT * FROM odul_kayitlari").all().map(odulKayitRow);
}

function bolumDenetimleri(bid) {
  const ds = loadDenetimler().filter((d) => d.bolum_id === bid);
  ds.sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || ""))
    .localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
  return ds;
}
function sonDenetim(bid) {
  return bolumDenetimleri(bid)[0] || null;
}

// Bir denetimin kriter bazlı puanları (0-5). Eski 'checked' formatıyla uyumlu.
function denetimKriterPuanlari(d) {
  if (d.puanlar) {
    const out = {};
    for (const k of P.BESS_TUM_KRITERLER) out[k] = parseInt(d.puanlar[k], 10) || 0;
    return out;
  }
  const ch = new Set(d.checked || []);
  const out = {};
  for (const k of P.BESS_TUM_KRITERLER) out[k] = ch.has(k) ? P.BESS_KRITER_PUAN : 0;
  return out;
}

function denetimTarihi(d) {
  return d.denetim_tarihi || d.plan_gun || d.tarih || "";
}

function denetimFotolari(d) {
  const out = [];
  for (const fl of Object.values(d.fotolar || {})) out.push(...fl);
  return out;
}

function turAdiUret(tarih) {
  const [y, m] = String(tarih || "").split("-");
  const ay = S.TR_AYLAR[parseInt(m, 10) - 1];
  return ay ? `${ay} ${y} Denetimi` : "Denetim";
}

function besSTurAdi(tarih) {
  const r = db.prepare(
    "SELECT tur_adi FROM denetimler WHERE tarih = ? AND tur_adi IS NOT NULL AND TRIM(tur_adi) != '' LIMIT 1"
  ).get(tarih);
  return r ? r.tur_adi.trim() : "";
}

function besSTurlar() {
  return db.prepare("SELECT DISTINCT tarih FROM denetimler WHERE tarih IS NOT NULL AND tarih != '' ORDER BY tarih DESC")
    .all().map((r) => r.tarih);
}

function besSPlanTur() {
  for (const t of besSTurlar()) {
    const r = db.prepare("SELECT 1 FROM denetimler WHERE tarih = ? AND puan IS NULL LIMIT 1").get(t);
    if (r) return t;
  }
  return null;
}

function besSSonSonucTur() {
  for (const t of besSTurlar()) {
    const r = db.prepare("SELECT 1 FROM denetimler WHERE tarih = ? AND puan IS NOT NULL LIMIT 1").get(t);
    if (r) return t;
  }
  return null;
}

function aksiyonSayilari() {
  const say = {};
  for (const a of loadAksiyonlar()) {
    const s = (say[a.denetim_id] = say[a.denetim_id] || { toplam: 0, acik: 0 });
    s.toplam += 1;
    if (a.durum === "acik") s.acik += 1;
  }
  return say;
}

// Bir turdaki bölümlerin skor sıralaması + alacakları ödül (önizleme)
function besSTurSiralama(tarih) {
  const ds = loadDenetimler().filter((d) => d.tarih === tarih && d.puan !== null);
  ds.sort((a, b) => b.puan - a.puan);
  const aks = aksiyonSayilari();
  return ds.map((d, i) => {
    const b = bolumById(d.bolum_id);
    const ak = aks[d.id] || { toplam: 0, acik: 0 };
    return { sira: i + 1, ad: b ? b.ad : "?", skor: d.puan, odul: S.ODUL_MAP[i] || 0,
      denetim_id: d.id, bolum_id: d.bolum_id, tarih: denetimTarihi(d),
      aksiyon: ak.toplam, aksiyon_acik: ak.acik };
  });
}

function besSTurTamam(tarih) {
  const ds = loadDenetimler().filter((d) => d.tarih === tarih);
  return ds.length > 0 && ds.every((d) => d.puan !== null);
}

function besSTurEksikler(tarih) {
  const eksik = [];
  for (const d of loadDenetimler()) {
    if (d.tarih === tarih && d.puan === null) {
      const b = bolumById(d.bolum_id);
      if (b) eksik.push(b.ad);
    }
  }
  return eksik;
}

// Bir turun ödüllerini kalıcı deftere işler (ilk 3 bölüm ekibine 100/75/50).
function besSIsle(tarih) {
  if (odulIslenenler().includes(tarih)) return [false, "Bu tur zaten işlenmiş."];
  if (!besSTurTamam(tarih)) {
    return [false, `Tüm bölümler denetlenmeden ödül dağıtılamaz. Eksik: ${besSTurEksikler(tarih).join(", ")}`];
  }
  const turdaki = loadDenetimler().filter((d) => d.tarih === tarih && d.puan !== null);
  if (!turdaki.length) return [false, "Bu turda puanlanmış denetim yok."];
  turdaki.sort((a, b) => b.puan - a.puan);
  const now = S.zamanTr();
  const ins = db.prepare(`INSERT INTO odul_kayitlari(tarih, tur_adi, bolum_id, bolum_ad, sira, puan, kisiler, islenme_zamani)
                          VALUES(?,?,?,?,?,?,?,?)`);
  const tx = db.prepare("INSERT INTO odul_islenen(tarih) VALUES(?)");
  for (let sira = 0; sira < Math.min(3, turdaki.length); sira++) {
    const b = bolumById(turdaki[sira].bolum_id);
    if (!b) continue;
    const kisiler = [b.sorumlu || "", ...(b.kisiler || [])].map((x) => (x || "").trim()).filter(Boolean);
    ins.run(tarih, besSTurAdi(tarih), b.id, b.ad, sira + 1, S.ODUL_MAP[sira], js(kisiler), now);
  }
  tx.run(tarih);
  return [true, `${tarih} turu işlendi.`];
}

function besSTurKazananlar(tarih) {
  return odulKayitlari().filter((k) => k.tarih === tarih).sort((a, b) => (a.sira || 9) - (b.sira || 9));
}

// İşlenmiş ödül turları (en yenisi hariç) — geçmiş aylar
function besSArsivAylar() {
  const islenen = odulIslenenler().sort().reverse();
  const guncel = islenen[0] || null;
  const gecmis = islenen.filter((t) => t !== guncel)
    .map((tarih) => ({ tarih, kazananlar: besSTurKazananlar(tarih) }));
  return [guncel, gecmis];
}

function besSGecmisTurlar() {
  return besSTurlar().map((t) => ({
    tarih: t, ad: besSTurAdi(t), siralama: besSTurSiralama(t), tamam: besSTurTamam(t),
  }));
}

// Plan tablosu satırları; aktifDenetmenAd verilirse `benim` işaretlenir.
function besSPlanSatirlari(tarih, aktifDenetmenAd) {
  const out = [];
  for (const d of loadDenetimler()) {
    if (d.tarih !== tarih) continue;
    const b = bolumById(d.bolum_id);
    const planlanan = d.planlanan_denetmen || "";
    out.push({
      denetim_id: d.id, bolum_id: d.bolum_id, bolum_ad: b ? b.ad : "?",
      lider: b ? b.sorumlu || "" : "",
      planlanan_denetmen: planlanan,
      benim: Boolean(aktifDenetmenAd && isimListesi(planlanan).includes(aktifDenetmenAd)),
      misafir_denetmen: d.misafir_denetmen || "", denetmen: d.denetmen || "",
      plan_gun: d.plan_gun || "", plan_saat: d.plan_saat || "",
      denetim_tarihi: denetimTarihi(d),
      baslangic: d.baslangic || d.tarih || "", bitis: d.bitis || d.tarih || "",
      yapildi: d.puan !== null, puan: d.puan,
    });
  }
  out.sort((a, b) => a.bolum_ad.localeCompare(b.bolum_ad, "tr"));
  return out;
}

// Trend tablosu: satır=bölüm, sütun=denetim turu (eski->yeni), fark renklendirilir.
function besSTrendTablo() {
  const denetimler = loadDenetimler();
  const turlar = [...new Set(denetimler.filter((d) => d.tarih && d.puan !== null).map((d) => d.tarih))].sort();
  const basliklar = turlar.map((t) => ({ tarih: t, ad: besSTurAdi(t) || turAdiUret(t) }));
  const satirlar = [];
  for (const b of loadBolumler()) {
    const hucreler = [];
    let onceki = null;
    for (const t of turlar) {
      const d = denetimler.find((x) => x.bolum_id === b.id && x.tarih === t && x.puan !== null);
      if (d) {
        hucreler.push({ puan: d.puan, fark: onceki !== null ? d.puan - onceki : null });
        onceki = d.puan;
      } else hucreler.push(null);
    }
    satirlar.push({ ad: b.ad, hucreler });
  }
  satirlar.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return [basliklar, satirlar];
}

// ---------------------------------------------------------------------------
// Çoklu lider / denetmen
// ---------------------------------------------------------------------------
// 'Ali / Veli' → ['Ali', 'Veli'] — ayraç: / , ;
function isimListesi(s) {
  return String(s || "").replace(/[,;]/g, "/").split("/").map((x) => x.trim()).filter(Boolean);
}
function bolumLiderleri(b) {
  return isimListesi((b || {}).sorumlu);
}
// Denetmen adayları = tüm bölümlerin ekip liderleri (benzersiz, sıralı)
function denetmenAdaylari() {
  const adlar = [];
  for (const b of loadBolumler()) {
    for (const ad of bolumLiderleri(b)) if (!adlar.includes(ad)) adlar.push(ad);
  }
  return adlar.sort((a, b) => a.localeCompare(b, "tr"));
}
// Şifreden denetmeni bulur (giriş) — hash karşılaştırmalı
function denetmenBySifre(sifre) {
  if (!sifre) return null;
  for (const d of loadDenetmenler()) {
    if (checkPassword(d.sifre, sifre)) return d;
  }
  return null;
}
// Oturumdaki denetmen kaydı (silinmiş hesabı düşürür)
function aktifDenetmen(session) {
  const did = session && session.denetmen_id;
  if (!did) return null;
  const d = db.prepare("SELECT * FROM denetmenler WHERE id = ?").get(did);
  if (!d) { delete session.denetmen_id; delete session.denetmen_ad; }
  return d || null;
}

// ---------------------------------------------------------------------------
// Aksiyonlar
// ---------------------------------------------------------------------------
// Aksiyonu kapatabilecek kişi = açıldığı bölümün GÜNCEL ekip lideri
function aksiyonAtanan(a) {
  const b = bolumById(a.bolum_id);
  if (b && (b.sorumlu || "").trim()) return b.sorumlu.trim();
  return (a.atanan_lider || "").trim();
}
// Yönetici her zaman; denetmen yalnızca kendi bölümünün lideri olarak atanmışsa
function aksiyonKapatabilir(a, session) {
  if (a.durum === "kapali") return false;
  if (session && session.admin) return true;
  const d = aktifDenetmen(session);
  return Boolean(d && isimListesi(aksiyonAtanan(a)).includes(d.ad));
}

// Aksiyonları iki seviyede gruplar: denetim TURU → BÖLÜM → aksiyonlar
function aksiyonGruplari(durum, session) {
  const turlar = new Map();
  for (const a of loadAksiyonlar()) {
    if (durum && a.durum !== durum) continue;
    a._atanan = aksiyonAtanan(a);
    a._kapatabilir = aksiyonKapatabilir(a, session);
    const turAdi = a.tur_adi || turAdiUret(a.tarih || "");
    const anahtar = `${a.tarih || ""}|${turAdi}`;
    if (!turlar.has(anahtar)) {
      turlar.set(anahtar, { tarih: a.tarih || "", tur_adi: turAdi, bolumler: new Map(), toplam: 0 });
    }
    const t = turlar.get(anahtar);
    const ad = a.bolum_ad || "?";
    if (!t.bolumler.has(ad)) t.bolumler.set(ad, []);
    t.bolumler.get(ad).push(a);
    t.toplam += 1;
  }
  const out = [...turlar.values()].map((t) => ({
    ...t,
    bolumler: [...t.bolumler.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([ad, aksiyonlar]) => ({ ad, aksiyonlar })),
  }));
  out.sort((a, b) => (b.tarih + b.tur_adi).localeCompare(a.tarih + a.tur_adi));
  return out;
}

function aksiyonFotolari(a) {
  return [...(((a || {}).kapatma || {}).fotolar || [])];
}

// Denetim formundaki 'Aksiyon Ata' alanlarından açık aksiyon kayıtları oluşturur.
// Her kriter için EN FAZLA 2 açık aksiyon; aynı metinli mükerrer eklenmez.
function syncDenetimAksiyonlari(did, meta, form) {
  const atananLider = ((bolumById(meta.bolum_id) || {}).sorumlu || "").trim();
  const mevcutlar = loadAksiyonlar().filter((a) => a.denetim_id === did && a.durum === "acik");
  const mevcutMetinler = new Set(mevcutlar.map((a) => `${a.kriter_k}|${(a.aksiyon || "").trim()}`));
  const acikSayisi = {};
  for (const a of mevcutlar) acikSayisi[a.kriter_k] = (acikSayisi[a.kriter_k] || 0) + 1;

  const now = S.zamanTr();
  const ins = db.prepare(`INSERT INTO aksiyonlar(id, denetim_id, tarih, tur_adi, bolum_id, bolum_ad,
      kriter_k, kriter_m, aksiyon, sorumlu, atanan_lider, termin, durum, olusturma_zamani, kapatma)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`);
  let eklendi = 0;
  for (const s of P.BESS) {
    for (const kr of s.kriterler) {
      const k = kr.k;
      for (const slot of [1, 2]) {
        const metin = String(form[`aksiyon_${k}_${slot}`] || "").trim();
        if (!metin || mevcutMetinler.has(`${k}|${metin}`)) continue;
        if ((acikSayisi[k] || 0) >= 2) continue;
        let termin = String(form[`aksiyon_termin_${k}_${slot}`] || "").trim();
        if (termin && meta.tarih && termin <= meta.tarih) termin = ""; // termin denetimden sonra olmalı
        ins.run(uid(), did, meta.tarih, meta.tur_adi, meta.bolum_id, meta.bolum_ad,
          k, kr.m, metin, String(form[`aksiyon_sorumlu_${k}_${slot}`] || "").trim(),
          atananLider, termin, "acik", now);
        mevcutMetinler.add(`${k}|${metin}`);
        acikSayisi[k] = (acikSayisi[k] || 0) + 1;
        eklendi += 1;
      }
    }
  }
  return eklendi;
}

// Her kriter için en fazla 3 foto kaydeder (mevcutları korur). files: multer dizisi.
function saveDenetimFotolar(did, mevcut, files) {
  const fotolar = { ...(mevcut || {}) };
  const grup = {};
  for (const f of files || []) {
    (grup[f.fieldname] = grup[f.fieldname] || []).push(f);
  }
  for (const k of P.BESS_TUM_KRITERLER) {
    const varolan = [...(fotolar[k] || [])];
    for (const f of grup[`foto_${k}`] || []) {
      if (varolan.length >= 3) break;
      if (f && f.originalname && allowedFile(f.originalname)) {
        const ext = path.extname(f.originalname).toLowerCase();
        const fname = `${did}_${k}_${uid().slice(0, 6)}${ext}`;
        if (gorselKaydet(f, path.join(S.BESS_FOTO_DIR, fname))) varolan.push(fname);
      }
    }
    if (varolan.length) fotolar[k] = varolan;
  }
  return fotolar;
}

// Aksiyon kapatma fotoğrafları (en fazla 5)
function saveAksiyonFotolar(aid, files) {
  S.ensureDirs();
  const fotolar = [];
  for (const f of files || []) {
    if (fotolar.length >= 5) break;
    if (f && f.originalname && allowedFile(f.originalname)) {
      const ext = path.extname(f.originalname).toLowerCase();
      const fname = `aksiyon_${aid}_${uid().slice(0, 6)}${ext}`;
      if (gorselKaydet(f, path.join(S.BESS_AKSIYON_FOTO_DIR, fname))) fotolar.push(fname);
    }
  }
  return fotolar;
}

// Kaizen önce/sonra görseli kaydet (file: multer dosyası)
function kaizenKaydetGorsel(file, etiket, sn) {
  if (file && file.originalname && allowedFile(file.originalname)) {
    const ext = path.extname(file.originalname).toLowerCase();
    const fname = `${sn}_${etiket}${ext}`;
    if (gorselKaydet(file, path.join(S.KAIZEN_IMG_DIR, fname))) return fname;
  }
  return null;
}

// Marka + logo (static/ içinde adında 'logo' geçen ilk görsel)
const _LOGO_EXT = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
function logoBul() {
  let dosyalar;
  try { dosyalar = fs.readdirSync(S.STATIC_DIR); } catch { return null; }
  for (const f of dosyalar) {
    const ext = path.extname(f).toLowerCase();
    if (path.basename(f, path.extname(f)).toLowerCase() === "logo" && _LOGO_EXT.includes(ext)) return f;
  }
  for (const f of [...dosyalar].sort()) {
    const ext = path.extname(f).toLowerCase();
    if (path.basename(f, path.extname(f)).toLowerCase().includes("logo") && _LOGO_EXT.includes(ext)) return f;
  }
  return null;
}

module.exports = {
  hashPassword, hashMi, checkPassword, getAdminPassword, adminSifreDogru,
  setAdminPassword, sifreleriHashle, getSecretKey,
  uid, nextNumber, safeName, allowedFile, guvenliYol, trdate, ayEtiketi, puanfmt,
  gorselKaydet, getRecord, updateRecord, combinedRecords, filtrele, mevcutAylar,
  puanDurumu, dashboardIstatistik,
  loadBolumler, bolumById, loadDenetimler, denetimById, loadAksiyonlar, aksiyonById,
  loadDenetmenler, loadMisafirler, odulIslenenler, odulKayitlari,
  bolumDenetimleri, sonDenetim, denetimKriterPuanlari, denetimTarihi, denetimFotolari,
  turAdiUret, besSTurAdi, besSTurlar, besSPlanTur, besSSonSonucTur, aksiyonSayilari,
  besSTurSiralama, besSTurTamam, besSTurEksikler, besSIsle, besSTurKazananlar,
  besSArsivAylar, besSGecmisTurlar, besSPlanSatirlari, besSTrendTablo,
  isimListesi, bolumLiderleri, denetmenAdaylari, denetmenBySifre, aktifDenetmen,
  aksiyonAtanan, aksiyonKapatabilir, aksiyonGruplari, aksiyonFotolari,
  syncDenetimAksiyonlari, saveDenetimFotolar, saveAksiyonFotolar, kaizenKaydetGorsel,
  logoBul,
};
