// Genel/herkese açık rotalar: anasayfa, liste, detay, puan durumu, ödüller.
const fs = require("fs");
const path = require("path");
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { sorgu, tek, calistir, transaction, j } = require("../db");
const { sar, flash, yetkiGerek, alan } = require("../web");

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

  app.post("/odul-ver", yetkiGerek("odul"), sar(async (req, res) => {
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

  app.post("/puan/sil", yetkiGerek("odul"), sar(async (req, res) => {
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
  app.post("/odul-alanlar/sil", yetkiGerek("odul"), sar(async (req, res) => {
    const r = await tek("SELECT id FROM odul_arsiv WHERE ad = ? AND zaman = ? LIMIT 1",
      [req.body.ad || "", req.body.zaman || ""]);
    if (r) {
      await calistir("DELETE FROM odul_arsiv WHERE id = ?", [r.id]);
      flash(req, "success", `${req.body.ad} ödül kaydı silindi — ${S.ODUL_ESIK} puan net puanına geri eklendi.`);
    }
    res.redirect("/odul-alanlar");
  }));

  // ----- Silinen öneri/kaizen arşivi (kayıt yetkisi) -----
  app.get("/silinenler", yetkiGerek("kayit"), sar(async (req, res) => {
    const satirlar = (await sorgu("SELECT * FROM silinen_kayitlar ORDER BY id DESC")).map((s) => {
      const v = j(s.veri, {}) || {};
      return {
        id: s.id, tip: s.tip, no: s.no, silen: s.silen, silme_zamani: s.silme_zamani,
        konu: v.konu || "", kisi: s.tip === "oneri" ? (v.sahibi || "") : (v.sorumlular || v.lider || ""),
        tarih: v.tarih || v.baslangic || "", durum: v.durum || "", puan: v.puan,
      };
    });
    res.render("silinenler", { title: "Silinen Kayıtlar", kayitlar: satirlar });
  }));

  // Geri yükle: arşivdeki ham satırı ilgili tabloya yeniden ekler
  app.post("/silinenler/geri", yetkiGerek("kayit"), sar(async (req, res) => {
    const s = await tek("SELECT * FROM silinen_kayitlar WHERE id = ?", [req.body.id || ""]);
    if (!s) { flash(req, "error", "Silinen kayıt bulunamadı."); return res.redirect("/silinenler"); }
    const tablo = s.tip === "oneri" ? "oneriler" : "kaizenler";
    if (await tek(`SELECT 1 FROM ${tablo} WHERE \`no\` = ?`, [s.no])) {
      flash(req, "error", `Bu numara (${s.no}) şu an kullanımda — geri yüklenemedi.`);
      return res.redirect("/silinenler");
    }
    const ham = j(s.veri, null);
    if (!ham) { flash(req, "error", "Kayıt verisi okunamadı."); return res.redirect("/silinenler"); }
    const kolonlar = Object.keys(ham);
    const kolonSql = kolonlar.map((k) => `\`${k}\``).join(", ");
    const yer = kolonlar.map(() => "?").join(", ");
    await transaction(async (conn) => {
      await calistir(`INSERT INTO ${tablo}(${kolonSql}) VALUES(${yer})`,
        kolonlar.map((k) => ham[k]), conn);
      await calistir("DELETE FROM silinen_kayitlar WHERE id = ?", [s.id], conn);
    });
    flash(req, "success", `${s.no} geri yüklendi.`);
    res.redirect("/silinenler");
  }));

  // Kalıcı sil: arşivden çıkar + kaizen görsellerini diskten temizle
  app.post("/silinenler/sil", yetkiGerek("kayit"), sar(async (req, res) => {
    const s = await tek("SELECT * FROM silinen_kayitlar WHERE id = ?", [req.body.id || ""]);
    if (!s) { flash(req, "error", "Silinen kayıt bulunamadı."); return res.redirect("/silinenler"); }
    if (s.tip === "kaizen") {
      const v = j(s.veri, {}) || {};
      for (const fld of ["onceki_gorsel", "sonraki_gorsel"]) {
        if (v[fld]) { try { fs.unlinkSync(path.join(S.KAIZEN_IMG_DIR, v[fld])); } catch {} }
      }
    }
    await calistir("DELETE FROM silinen_kayitlar WHERE id = ?", [s.id]);
    flash(req, "success", `${s.no} kalıcı olarak silindi.`);
    res.redirect("/silinenler");
  }));

  app.get("/puan-durumu/excel", yetkiGerek("odul"), sar(async (req, res) => {
    xlsxGonder(res, await X.generatePuanExcel(), "puan_listesi.xlsx");
  }));

  app.get("/odul-alanlar/excel", yetkiGerek("odul"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateOdulExcel(), "odul_alanlar.xlsx");
  }));
};

module.exports.xlsxGonder = xlsxGonder;
