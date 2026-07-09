// Genel/herkese açık rotalar: anasayfa, liste, detay, puan durumu, ödüller.
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { sorgu, tek, calistir } = require("../db");
const { sar, flash, adminRequired, alan } = require("../web");

function xlsxGonder(res, buffer, ad) {
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(ad)}"`);
  res.send(Buffer.from(buffer));
}

module.exports = function register(app) {
  app.get("/", (req, res) => {
    res.render("anasayfa", { title: "Anasayfa · Yalın Üretim Uygulamaları" });
  });

  app.get("/yardim", (req, res) => {
    res.render("kullanim", { title: "Kullanım Kılavuzu", esik: S.ODUL_ESIK });
  });

  app.get("/liste", sar(async (req, res) => {
    const records = await C.combinedRecords();
    const tip = req.query.tip || "hepsi";
    const ay = req.query.ay || "";
    const q = req.query.q || "";
    res.render("liste", {
      title: "Öneri & Kaizen Listesi · Yalın Üretim",
      kayitlar: C.filtrele(records, tip, ay, q),
      aylar: C.mevcutAylar(records),
      tip, ay, q, toplam: records.length,
      tam_yol: req.originalUrl,
    });
  }));

  app.get("/detay", sar(async (req, res) => {
    const rec = await C.getRecord(req.query.tip || "", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    res.render("detay", {
      title: `${rec.no} · Detay`,
      r: rec, tip: req.query.tip,
      kazanc_basliklari: S.KAZANC_BASLIKLARI,
      geri: req.query.geri || "/liste",
    });
  }));

  app.get("/puan-durumu", sar(async (req, res) => {
    res.render("puan_durumu", {
      title: "Puan Listesi · Yalın Üretim",
      siralama: await C.puanDurumu(), esik: S.ODUL_ESIK,
    });
  }));

  app.post("/odul-ver", adminRequired, sar(async (req, res) => {
    const ad = alan(req, "ad");
    const kisi = (await C.puanDurumu()).find((k) => k.ad === ad);
    if (!kisi || kisi.net < S.ODUL_ESIK) {
      flash(req, "error", `${ad || "Kişi"} için net puan ${S.ODUL_ESIK}'ün altında.`);
      return res.redirect("/puan-durumu");
    }
    await calistir("INSERT INTO odul_arsiv(ad, puan, tarih, zaman) VALUES(?,?,?,?)",
      [ad, S.ODUL_ESIK, S.bugunIso(), S.zamanTr()]);
    flash(req, "success", `${ad} ödül aldı — ${S.ODUL_ESIK} puan düşüldü.`);
    res.redirect("/puan-durumu");
  }));

  app.post("/puan/sil", adminRequired, sar(async (req, res) => {
    const ad = alan(req, "ad");
    if (ad) {
      await calistir("INSERT IGNORE INTO silinen_kisiler(ad) VALUES(?)", [ad]);
      flash(req, "success", `${ad} puan listesinden kaldırıldı.`);
    }
    res.redirect("/puan-durumu");
  }));

  app.get("/odul-alanlar", sar(async (req, res) => {
    const arsiv = await sorgu("SELECT * FROM odul_arsiv ORDER BY tarih DESC, id DESC");
    const ozet = {};
    for (const r of arsiv) ozet[r.ad] = (ozet[r.ad] || 0) + 1;
    const ozetListe = Object.entries(ozet).sort((a, b) => b[1] - a[1]);
    res.render("odul_alanlar", { title: "Ödül Alanlar", arsiv, ozet: ozetListe });
  }));

  // Ödül kaydını siler — düşülen puan kişinin net puanına geri döner.
  app.post("/odul-alanlar/sil", adminRequired, sar(async (req, res) => {
    const r = await tek("SELECT id FROM odul_arsiv WHERE ad = ? AND zaman = ? LIMIT 1",
      [req.body.ad || "", req.body.zaman || ""]);
    if (r) {
      await calistir("DELETE FROM odul_arsiv WHERE id = ?", [r.id]);
      flash(req, "success", `${req.body.ad} ödül kaydı silindi — ${S.ODUL_ESIK} puan net puanına geri eklendi.`);
    }
    res.redirect("/odul-alanlar");
  }));

  app.get("/puan-durumu/excel", adminRequired, sar(async (req, res) => {
    xlsxGonder(res, await X.generatePuanExcel(), "puan_listesi.xlsx");
  }));

  app.get("/odul-alanlar/excel", adminRequired, sar(async (req, res) => {
    xlsxGonder(res, await X.generateOdulExcel(), "odul_alanlar.xlsx");
  }));
};

module.exports.xlsxGonder = xlsxGonder;
