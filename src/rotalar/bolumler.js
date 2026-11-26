// Yönetim › Bölümler ve Görevler — öneri/kaizen formlarındaki açılır listeler ile 5S'in ORTAK verisi:
// bölüm listesi (5S'e dahil), bölüm personeli + ekip liderleri, görev tanımları.
// Yetki: bes_plan; ana yönetici her zaman. İş kuralları: servis/bolumler.js, servis/gorevTanimlari.js.
const C = require("../cekirdek");
const { sar, flash, yetkiGerek, kisiOku } = require("../web");

const SAYFA = "/yonetici/bolumler";
const GOREVLER = SAYFA + "#gorevler";

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
      title: "Bölümler ve Görevler", bolumler, kullanim: await C.bolumKullanim(), gorev: await C.gorevOzeti(),
      ciftler: [...new Set(bolumler.filter((b) => sayac.get(C.bolumAnahtar(b.ad)) > 1).map((b) => b.ad))],
      ad_uzunluk: C.BOLUM_AD_UZUNLUK,
      secili_bolum: typeof req.query.bolum === "string" ? req.query.bolum : "",
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

  // --- Bölüm sayfası: ekip liderleri + personel (toplu ekleme) ---
  app.get(SAYFA + "/:bid", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bolum = await C.bolumById(req.params.bid);
    if (!bolum) return res.status(404).send("Bölüm bulunamadı.");
    const liderler = C.bolumLiderleri(bolum);
    res.render("bolum_personel", {
      title: `${bolum.ad} · Personel`, b: bolum, lider1: liderler[0] || "", lider2: liderler[1] || "",
      kisiler: [...bolum.kisiler].sort((x, y) => x.localeCompare(y, "tr")),
    });
  }));

  // Toplu personel ekleme (her satıra Ad Soyad) — bölüm sayfasından ve Bölümler listesindeki "Ekibe personel ekle"
  // kartından ortak. Döner: false (bölüm yok) | true
  async function personelEkle(req, bid, bolumAdi = "") {
    const r = await C.bolumKisiEkle(bid, String((req.body || {}).kisiler || "").split(/\r?\n/));
    if (!r) return false;
    const yer = bolumAdi ? ` (${bolumAdi})` : "";
    if (r.eklenen.length) flash(req, "success", `${r.eklenen.length} kişi eklendi${yer}: ${r.eklenen.join(", ")}`);
    if (r.atlanan.length) flash(req, "uyari", `Zaten bu bölümde: ${r.atlanan.join(", ")}`);
    if (r.hatali.length) flash(req, "error", `Ad ve soyad birlikte yazılmalı, eklenmedi: ${r.hatali.join(", ")}`);
    if (r.baskaBolumde.length) {
      flash(req, "uyari", "Başka bölümde de kayıtlı (gerekirse oradan çıkarın): " +
        r.baskaBolumde.map((x) => `${x.ad} (${x.bolum})`).join(", "));
    }
    if (!r.eklenen.length && !r.atlanan.length && !r.hatali.length) flash(req, "error", "Eklenecek kişiyi yazın (her satıra Ad Soyad).");
    return true;
  }

  // Bölümler listesindeki kart: bölüm açılır listeden seçilir; dönüşte aynı bölüm seçili kalır (art arda ekleme için)
  app.post(SAYFA + "/personel", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bid = String((req.body || {}).bid || "");
    const bolum = bid ? await C.bolumById(bid) : null;
    if (!bolum) {
      flash(req, "error", "Personel eklenecek bölümü seçin.");
      return res.redirect(SAYFA + "#personel");
    }
    await personelEkle(req, bolum.id, bolum.ad);
    res.redirect(`${SAYFA}?bolum=${encodeURIComponent(bolum.id)}#personel`);
  }));

  app.post(SAYFA + "/:bid/personel", yetkiGerek("bes_plan"), sar(async (req, res) => {
    if (!(await personelEkle(req, req.params.bid))) return res.status(404).send("Bölüm bulunamadı.");
    res.redirect(SAYFA + "/" + encodeURIComponent(req.params.bid));
  }));

  app.post(SAYFA + "/:bid/personel/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const ad = String((req.body || {}).ad || "");
    if (await C.bolumKisiSil(req.params.bid, ad)) flash(req, "success", `${ad} bölümden çıkarıldı.`);
    res.redirect(SAYFA + "/" + encodeURIComponent(req.params.bid));
  }));

  app.post(SAYFA + "/:bid/lider", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bolum = await C.bolumById(req.params.bid);
    if (!bolum) return res.status(404).send("Bölüm bulunamadı.");
    const l = [kisiOku(req, "lider1"), kisiOku(req, "lider2")];
    if (l.some((x) => (x.ad || x.soyad) && x.eksik)) {
      flash(req, "error", "Ekip liderinin adını ve soyadını birlikte yazın.");
    } else {
      const sorumlu = await C.bolumLiderKaydet(bolum.id, l.map((x) => x.tam));
      flash(req, "success", `${bolum.ad} ekip lideri: ${sorumlu || "—"}`);
    }
    res.redirect(SAYFA + "/" + encodeURIComponent(bolum.id));
  }));

  // --- Görev tanımları (öneri "Görevi" + kaizen ekip görevleri) ---
  app.post("/yonetici/gorevler/ekle", yetkiGerek("bes_plan"), sar(async (req, res) => {
    // Metin kutusu (her satıra bir görev) ya da "kayıtlarda geçen" önerilerinden işaretlenenler
    const adlar = dizi((req.body || {}).adlar).flatMap((v) => String(v).split(/\r?\n/));
    const { eklenen, atlanan } = await C.gorevEkle(adlar);
    if (eklenen.length) flash(req, "success", `${eklenen.length} görev tanımı eklendi: ${eklenen.join(", ")}`);
    if (atlanan.length) flash(req, "uyari", `Listede zaten olduğu için eklenmedi: ${atlanan.join(", ")}`);
    if (!eklenen.length && !atlanan.length) flash(req, "error", "Eklenecek görev adını yazın (her satıra bir ad).");
    res.redirect(GOREVLER);
  }));

  app.post("/yonetici/gorevler/kaydet", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const eski = dizi((req.body || {}).eski), yeni = dizi((req.body || {}).yeni);
    const { degisiklikler, hata } = await C.gorevleriGuncelle(eski.map((e, i) => ({ eski: e, yeni: yeni[i] })));
    if (hata) flash(req, "error", hata);
    else if (!degisiklikler.length) flash(req, "uyari", "Değişiklik yok.");
    else flash(req, "success", `Görev tanımları kaydedildi: ${degisiklikler.join("; ")}`);
    res.redirect(GOREVLER);
  }));

  app.post("/yonetici/gorevler/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const ad = String((req.body || {}).ad || "");
    if (await C.gorevSil(ad)) flash(req, "success", `Görev tanımı silindi: ${ad}`);
    res.redirect(GOREVLER);
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
