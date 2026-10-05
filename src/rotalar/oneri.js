// Öneri rotaları (yeni / düzenle / excel).
// Yeni öneri formu herkese açıktır; düzenleme 'kayit' yetkisi veya düzeltmesi atanmış denetmen içindir.
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir } = require("../db");
const {
  sar, flash, xlsxGonder, yetkiGerek, girisRequired, alan, kisiOku, guvenliYol, hizLimitAsildi,
} = require("../web");

function formToDict(req) {
  const sahibi = kisiOku(req, "sahibi");
  return {
    k: {
      tarih: alan(req, "tarih"), sahibi: sahibi.tam, gorevi: alan(req, "gorevi"),
      konu: alan(req, "konu"), detay: alan(req, "detay"), cozum: alan(req, "cozum"),
      kalite: alan(req, "kalite"), verimlilik: alan(req, "verimlilik"),
      isg: alan(req, "isg"), maliyet: alan(req, "maliyet"), ek: alan(req, "ek"),
    },
    sahibiEksik: sahibi.eksik,
  };
}

function formRender(res, kayit, duzenle, geri = "") {
  res.render("oneri_form", {
    title: duzenle ? "Öneri Düzenle" : "Yeni Öneri", bugun: duzenle ? "" : S.bugunIso(), kayit,
    action_url: duzenle
      ? "/oneri/duzenle?no=" + encodeURIComponent(kayit.no) + (geri ? "&geri=" + encodeURIComponent(geri) : "")
      : "/oneri/yeni",
    duzenle, geri,
  });
}

module.exports = function register(app) {
  app.get("/oneri/yeni", (req, res) => formRender(res, {}, false));

  app.post("/oneri/yeni", sar(async (req, res) => {
    if (hizLimitAsildi(req, "oneri", 30, 300)) {
      flash(req, "error", "Çok fazla gönderim algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/oneri/yeni");
    }
    const { k, sahibiEksik } = formToDict(req);
    if (sahibiEksik || !(k.konu && k.detay)) {
      // Form, girilen bilgiler kaybolmadan hata mesajıyla yeniden gösterilir
      res.locals.mesajlar.push(["error", sahibiEksik
        ? "Öneri sahibinin adını ve soyadını ayrı kutulara yazın."
        : "Konu ve detay açıklama zorunludur."]);
      return formRender(res, k, false);
    }
    // Numara atomik sayaçtan gelir — eşzamanlı gönderimde mükerrer numara oluşmaz
    const no = await C.nextNumber("oneriler", "ÖNFR");
    await calistir(
      `INSERT INTO oneriler(\`no\`, tarih, sahibi, gorevi, konu, detay, cozum,
        kalite, verimlilik, isg, maliyet, ek, durum, puan, puanlama, kayit_zamani)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      [no, k.tarih, k.sahibi, k.gorevi, k.konu, k.detay, k.cozum,
        k.kalite, k.verimlilik, k.isg, k.maliyet, k.ek, S.VARSAYILAN_DURUM, S.zamanTr()]);
    flash(req, "success", `Öneri kaydedildi: ${no}` + (req.girisli ? "" : " — teşekkürler!"));
    res.redirect(req.girisli ? "/liste" : "/");
  }));

  // Düzenleme: 'kayit' yetkisi VEYA düzeltmesi bu denetmene atanmış kayıt
  app.get("/oneri/duzenle", girisRequired, sar(async (req, res) => {
    const rec = await C.getRecord("oneri", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if (!C.kayitDuzenleyebilir(rec, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu kaydı düzenleme yetkiniz yok.");
      return res.redirect("/detay?tip=oneri&no=" + encodeURIComponent(rec.no));
    }
    formRender(res, rec, true, guvenliYol(req.query.geri, ""));
  }));

  app.post("/oneri/duzenle", girisRequired, sar(async (req, res) => {
    const no = req.query.no || "";
    const rec = await C.getRecord("oneri", no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if (!C.kayitDuzenleyebilir(rec, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu kaydı düzenleme yetkiniz yok.");
      return res.redirect("/detay?tip=oneri&no=" + encodeURIComponent(no));
    }
    const { k, sahibiEksik } = formToDict(req);
    if (sahibiEksik || !(k.konu && k.detay)) {
      res.locals.mesajlar.push(["error", "Öneri sahibinin adı-soyadı, konu ve detay açıklama zorunludur."]);
      return formRender(res, { ...rec, ...k }, true, guvenliYol(req.query.geri, ""));
    }
    // Düzeltmesi atanan denetmen kaydedince kayıt yeniden değerlendirmeye döner
    const revizeTamam = rec.durum === "Düzeltme İsteniyor" && req.denetmen
      && rec.revize_atanan_id === req.denetmen.id;
    if (revizeTamam) { k.durum = S.VARSAYILAN_DURUM; k.revize_tamamlandi = S.zamanTr(); }
    await C.updateRecord("oneri", no, k);
    flash(req, "success", revizeTamam
      ? `${no} düzeltildi ve yeniden değerlendirmeye gönderildi.` : `Öneri güncellendi: ${no}`);
    const geri = guvenliYol(req.query.geri, "");
    res.redirect(revizeTamam && !req.yetkiBilgi.yonetici ? "/gorevlerim"
      : "/detay?tip=oneri&no=" + encodeURIComponent(no) + (geri ? "&geri=" + encodeURIComponent(geri) : ""));
  }));

  app.get("/oneri/excel", yetkiGerek("kayit"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateOneriExcel(), "oneriler.xlsx");
  }));
};
