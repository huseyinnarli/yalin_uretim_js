// Öneri / Kaizen kayıtları: okuma-yazma, birleşik liste, filtre + sayfalama, düzenleme/dönüştürme izni, kaizen görseli.
const path = require("path");

const S = require("../sabitler");
const { sorgu, tek, calistir, js, oneriRow, kaizenRow } = require("../db");
const { allowedFile, ayEtiketi, gorselKaydet } = require("./yardimci");

async function getRecord(tip, no) {
  if (tip === "oneri") {
    return oneriRow(await tek("SELECT * FROM oneriler WHERE `no` = ?", [no]));
  }
  return kaizenRow(await tek("SELECT * FROM kaizenler WHERE `no` = ?", [no]));
}

async function updateRecord(tip, no, fields) {
  const tablo = tip === "oneri" ? "oneriler" : "kaizenler";
  const f = { ...fields, guncelleme_zamani: S.zamanTr() };
  if ("puanlama" in f) f.puanlama = js(f.puanlama);
  const keys = Object.keys(f); // alan adları koddan gelir, kullanıcı girdisi değil
  const set = keys.map((k) => `${k} = ?`).join(", ");
  const r = await calistir(`UPDATE ${tablo} SET ${set} WHERE \`no\` = ?`,
    [...keys.map((k) => f[k]), no]);
  return r.affectedRows > 0;
}

// Öneri + kaizen birleşik, tarihe göre yeni->eski
async function combinedRecords() {
  const out = [];
  for (const r of (await sorgu("SELECT * FROM oneriler")).map(oneriRow)) {
    out.push({ ...r, sort_date: r.tarih || "", baslik: r.konu || "", kisi: r.sahibi || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  for (const r of (await sorgu("SELECT * FROM kaizenler")).map(kaizenRow)) {
    out.push({ ...r, sort_date: r.baslangic || "", baslik: r.konu || "", kisi: r.sorumlular || "",
      durum: r.durum || S.VARSAYILAN_DURUM });
  }
  out.sort((a, b) => (b.sort_date + (b.kayit_zamani || "")).localeCompare(a.sort_date + (a.kayit_zamani || "")));
  return out;
}

// Liste filtresi. Reddedilen kayıtlar ana listede yer almaz ("Reddedilen & Silinen"
// sayfasında toplanır). durum: "" (tümü) | "bekle" | "revize" | "onay"
function filtrele(records, tip, ay, q, durum = "") {
  q = (q || "").trim().toLocaleLowerCase("tr");
  return records.filter((r) => {
    if (r.durum === "Reddedildi") return false;
    if ((tip === "oneri" || tip === "kaizen") && r.tip !== tip) return false;
    if (ay && !r.sort_date.startsWith(ay)) return false;
    if (durum === "bekle" && r.durum !== S.VARSAYILAN_DURUM) return false;
    if (durum === "revize" && r.durum !== "Düzeltme İsteniyor") return false;
    if (durum === "onay" && r.durum !== "Onaylandı") return false;
    if (q) {
      const hay = `${r.baslik || ""} ${r.kisi || ""} ${r.no || ""}`.toLocaleLowerCase("tr");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Sayfalama: { kayitlar, sayfa, sayfaSayisi, toplam, bas, son }
function sayfala(liste, sayfa, boyut = S.SAYFA_BOYUTU) {
  const toplam = liste.length;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / boyut));
  const s = Math.min(Math.max(1, parseInt(sayfa, 10) || 1), sayfaSayisi);
  const bas = (s - 1) * boyut;
  return { kayitlar: liste.slice(bas, bas + boyut), sayfa: s, sayfaSayisi, toplam,
    bas: toplam ? bas + 1 : 0, son: Math.min(bas + boyut, toplam) };
}

function mevcutAylar(records) {
  const set = new Set(records.filter((r) => r.sort_date).map((r) => r.sort_date.slice(0, 7)));
  return [...set].sort().reverse().map((a) => [a, ayEtiketi(a)]);
}

// Kaydı düzenleyebilir mi: 'kayit' yetkisi VEYA düzeltmesi bu denetmene atanmış
function kayitDuzenleyebilir(rec, yetkiler, denetmen) {
  if (!rec) return false;
  if ((yetkiler || []).includes("kayit")) return true;
  return Boolean(denetmen && rec.durum === "Düzeltme İsteniyor" && rec.revize_atanan_id === denetmen.id);
}

// Onaylanan öneri kaizene dönüştürülebilir mi (henüz dönüştürülmemiş + yetkili ya da atanan kişi)
function kaizeneDonusturebilir(oneri, yetkiler, denetmen) {
  if (!oneri || oneri.durum !== "Onaylandı" || oneri.kaizen_no) return false;
  if ((yetkiler || []).some((k) => k === "degerlendir" || k === "kayit")) return true;
  return Boolean(denetmen && oneri.gorev_atanan_id === denetmen.id);
}

// Kaizen önce/sonra görseli kaydet (file: multer dosyası)
async function kaizenKaydetGorsel(file, etiket, sn) {
  if (file && file.originalname && allowedFile(file.originalname)) {
    const ext = path.extname(file.originalname).toLowerCase();
    const fname = `${sn}_${etiket}${ext}`;
    if (await gorselKaydet(file, path.join(S.KAIZEN_IMG_DIR, fname))) return fname;
  }
  return null;
}

module.exports = {
  getRecord, updateRecord, combinedRecords, filtrele, sayfala, mevcutAylar, kayitDuzenleyebilir,
  kaizeneDonusturebilir, kaizenKaydetGorsel,
};
