// Öneri rotaları (yeni / düzenle / excel).
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir } = require("../db");
const { sar, flash, yetkiGerek, alan, hizLimitAsildi } = require("../web");
const { xlsxGonder } = require("./genel");

function formToDict(req) {
  return {
    tarih: alan(req, "tarih"), sahibi: alan(req, "sahibi"), gorevi: alan(req, "gorevi"),
    konu: alan(req, "konu"), detay: alan(req, "detay"), cozum: alan(req, "cozum"),
    kalite: alan(req, "kalite"), verimlilik: alan(req, "verimlilik"),
    isg: alan(req, "isg"), maliyet: alan(req, "maliyet"), ek: alan(req, "ek"),
  };
}

module.exports = function register(app) {
  app.get("/oneri/yeni", (req, res) => {
    res.render("oneri_form", { title: "Yeni Öneri", bugun: S.bugunIso(), kayit: {},
      action_url: "/oneri/yeni", duzenle: false });
  });

  app.post("/oneri/yeni", sar(async (req, res) => {
    if (hizLimitAsildi(req, "oneri", 30, 300)) {
      flash(req, "error", "Çok fazla gönderim algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/oneri/yeni");
    }
    const k = formToDict(req);
    if (!(k.sahibi && k.konu && k.detay)) {
      flash(req, "error", "Öneri sahibi, konu ve detay açıklama zorunludur.");
      return res.render("oneri_form", { title: "Yeni Öneri", bugun: S.bugunIso(), kayit: k,
        action_url: "/oneri/yeni", duzenle: false });
    }
    // Numara atomik sayaçtan gelir — eşzamanlı gönderimde mükerrer numara oluşmaz
    const no = await C.nextNumber("oneriler", "ÖNFR");
    await calistir(
      `INSERT INTO oneriler(\`no\`, tarih, sahibi, gorevi, konu, detay, cozum,
        kalite, verimlilik, isg, maliyet, ek, durum, puan, puanlama, kayit_zamani)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      [no, k.tarih, k.sahibi, k.gorevi, k.konu, k.detay, k.cozum,
        k.kalite, k.verimlilik, k.isg, k.maliyet, k.ek, S.VARSAYILAN_DURUM, S.zamanTr()]);
    flash(req, "success", `Öneri kaydedildi: ${no}`);
    res.redirect("/liste");
  }));

  app.get("/oneri/duzenle", yetkiGerek("kayit"), sar(async (req, res) => {
    const rec = await C.getRecord("oneri", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    res.render("oneri_form", { title: "Öneri Düzenle", bugun: "", kayit: rec,
      action_url: "/oneri/duzenle?no=" + encodeURIComponent(rec.no), duzenle: true });
  }));

  app.post("/oneri/duzenle", yetkiGerek("kayit"), sar(async (req, res) => {
    const no = req.query.no || "";
    const rec = await C.getRecord("oneri", no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    await C.updateRecord("oneri", no, formToDict(req));
    flash(req, "success", `Öneri güncellendi: ${no}`);
    res.redirect("/liste");
  }));

  app.get("/oneri/excel", yetkiGerek("kayit"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateOneriExcel(), "oneriler.xlsx");
  }));
};
