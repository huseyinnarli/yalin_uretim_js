// Yönetim › Bölümler — öneri/kaizen formlarındaki açılır liste ile 5S'in ORTAK bölüm listesi.
// Yetki: bes_plan ("Bölüm listesi & 5S denetim planı"); ana yönetici her zaman. İş kuralları: servis/bolumler.js.
const C = require("../cekirdek");
const { sar, flash, yetkiGerek } = require("../web");

const SAYFA = "/yonetici/bolumler";

function dizi(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

module.exports = function register(app) {
  app.get(SAYFA, yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bolumler = await C.loadBolumler();
    // Büyük/küçük harf farkıyla aynı ada sahip bölümler (eski sürüm engellemiyordu) — kaydetmeden önce düzeltilmeli
    const sayac = new Map();
    for (const b of bolumler) sayac.set(C.bolumAnahtar(b.ad), (sayac.get(C.bolumAnahtar(b.ad)) || 0) + 1);
    res.render("bolumler", {
      title: "Bölümler", bolumler, kullanim: await C.bolumKullanim(),
      ciftler: [...new Set(bolumler.filter((b) => sayac.get(C.bolumAnahtar(b.ad)) > 1).map((b) => b.ad))],
      ad_uzunluk: C.BOLUM_AD_UZUNLUK,
    });
  }));

  // Toplu ekleme: her satıra bir ad
  app.post(SAYFA + "/ekle", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const adlar = String((req.body || {}).adlar || "").split(/\r?\n/);
    const { eklenen, atlanan } = await C.bolumEkle(adlar, { besDahil: req.body.bes_dahil === "1" });
    if (eklenen.length) {
      flash(req, "success", `${eklenen.length} bölüm eklendi${req.body.bes_dahil === "1" ? "" : " (5S dışında)"}: ${eklenen.join(", ")}`);
    }
    if (atlanan.length) flash(req, "uyari", `Listede zaten olduğu için eklenmedi: ${atlanan.join(", ")}`);
    if (!eklenen.length && !atlanan.length) flash(req, "error", "Eklenecek bölüm adını yazın (her satıra bir ad).");
    res.redirect(SAYFA);
  }));

  // Tek "Kaydet": adlar + 5S'e dahil kutuları. İşaretsiz kutu gönderilmediği için satırlar gizli id alanından okunur.
  app.post(SAYFA + "/kaydet", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const b = req.body || {};
    const satirlar = dizi(b.id).map(String).map((id) => ({ id, ad: b[`ad_${id}`], bes_dahil: b[`bes_${id}`] === "1" }));
    const { degisiklikler, hata, planliCikan } = await C.bolumleriGuncelle(satirlar);
    if (hata) flash(req, "error", hata);
    else if (!degisiklikler.length) flash(req, "uyari", "Değişiklik yok.");
    else flash(req, "success", `Bölüm listesi kaydedildi: ${degisiklikler.join("; ")}`);
    if (planliCikan.length) {
      flash(req, "uyari", `5S dışına alınan ${planliCikan.join(", ")} için yapılmamış denetim planı var — ` +
        "gerekirse 5S › Denetim Planı'ndan silin.");
    }
    res.redirect(SAYFA);
  }));

  app.post(SAYFA + "/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bolum = await C.bolumById(String((req.body || {}).id || ""));
    if (!bolum) {
      flash(req, "error", "Bölüm bulunamadı.");
      return res.redirect(SAYFA);
    }
    await C.bolumSil(bolum.id);
    flash(req, "success", `Bölüm silindi: ${bolum.ad}`);
    res.redirect(SAYFA);
  }));
};
