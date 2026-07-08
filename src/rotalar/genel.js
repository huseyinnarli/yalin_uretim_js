// Genel/herkese açık rotalar: anasayfa, liste, detay, puan durumu, ödüller.
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { db } = require("../db");
const { flash, adminRequired, alan } = require("../web");

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

  app.get("/liste", (req, res) => {
    const records = C.combinedRecords();
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
  });

  app.get("/detay", (req, res) => {
    const rec = C.getRecord(req.query.tip || "", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    res.render("detay", {
      title: `${rec.no} · Detay`,
      r: rec, tip: req.query.tip,
      kazanc_basliklari: S.KAZANC_BASLIKLARI,
      geri: req.query.geri || "/liste",
    });
  });

  app.get("/puan-durumu", (req, res) => {
    res.render("puan_durumu", {
      title: "Puan Listesi · Yalın Üretim",
      siralama: C.puanDurumu(), esik: S.ODUL_ESIK,
    });
  });

  app.post("/odul-ver", adminRequired, (req, res) => {
    const ad = alan(req, "ad");
    const kisi = C.puanDurumu().find((k) => k.ad === ad);
    if (!kisi || kisi.net < S.ODUL_ESIK) {
      flash(req, "error", `${ad || "Kişi"} için net puan ${S.ODUL_ESIK}'ün altında.`);
      return res.redirect("/puan-durumu");
    }
    db.prepare("INSERT INTO odul_arsiv(ad, puan, tarih, zaman) VALUES(?,?,?,?)")
      .run(ad, S.ODUL_ESIK, S.bugunIso(), S.zamanTr());
    flash(req, "success", `${ad} ödül aldı — ${S.ODUL_ESIK} puan düşüldü.`);
    res.redirect("/puan-durumu");
  });

  app.post("/puan/sil", adminRequired, (req, res) => {
    const ad = alan(req, "ad");
    if (ad) {
      db.prepare("INSERT OR IGNORE INTO silinen_kisiler(ad) VALUES(?)").run(ad);
      flash(req, "success", `${ad} puan listesinden kaldırıldı.`);
    }
    res.redirect("/puan-durumu");
  });

  app.get("/odul-alanlar", (req, res) => {
    const arsiv = db.prepare("SELECT * FROM odul_arsiv ORDER BY tarih DESC, id DESC").all();
    const ozet = {};
    for (const r of arsiv) ozet[r.ad] = (ozet[r.ad] || 0) + 1;
    const ozetListe = Object.entries(ozet).sort((a, b) => b[1] - a[1]);
    res.render("odul_alanlar", { title: "Ödül Alanlar", arsiv, ozet: ozetListe });
  });

  // Ödül kaydını siler — düşülen puan kişinin net puanına geri döner.
  app.post("/odul-alanlar/sil", adminRequired, (req, res) => {
    const r = db.prepare("SELECT id FROM odul_arsiv WHERE ad = ? AND zaman = ? LIMIT 1")
      .get(req.body.ad || "", req.body.zaman || "");
    if (r) {
      db.prepare("DELETE FROM odul_arsiv WHERE id = ?").run(r.id);
      flash(req, "success", `${req.body.ad} ödül kaydı silindi — ${S.ODUL_ESIK} puan net puanına geri eklendi.`);
    }
    res.redirect("/odul-alanlar");
  });

  app.get("/puan-durumu/excel", adminRequired, async (req, res) => {
    xlsxGonder(res, await X.generatePuanExcel(), "puan_listesi.xlsx");
  });

  app.get("/odul-alanlar/excel", adminRequired, async (req, res) => {
    xlsxGonder(res, await X.generateOdulExcel(), "odul_alanlar.xlsx");
  });
};

module.exports.xlsxGonder = xlsxGonder;
