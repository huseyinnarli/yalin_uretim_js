// Kaizen rotaları (yeni / düzenle / excel / görsel).
const fs = require("fs");
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir, js } = require("../db");
const { sar, flash, adminRequired, alan, hizLimitAsildi, dosyaYukleyici } = require("../web");
const { xlsxGonder } = require("./genel");

function ekipOku(req) {
  const lider = alan(req, "lider");
  const uyeler = [alan(req, "uye1"), alan(req, "uye2")].filter(Boolean).slice(0, 2);
  const sorumlular = lider ? [lider, ...uyeler].join(", ") : uyeler.join(", ");
  return { lider, uyeler, sorumlular };
}

function kazanclarOku(req) {
  let v = (req.body || {}).kazanclar || [];
  if (!Array.isArray(v)) v = [v];
  return v.filter(Boolean);
}

function dosya(req, ad) {
  return (req.files || []).find((f) => f.fieldname === ad && f.originalname);
}

module.exports = function register(app) {
  app.get("/kaizen/yeni", (req, res) => {
    res.render("kaizen_form", { title: "Yeni Kaizen", bugun: S.bugunIso(), kayit: {},
      kazanc_basliklari: S.KAZANC_BASLIKLARI, action_url: "/kaizen/yeni", duzenle: false });
  });

  app.post("/kaizen/yeni", ...dosyaYukleyici(2), sar(async (req, res) => {
    if (hizLimitAsildi(req, "kaizen", 30, 300)) {
      flash(req, "error", "Çok fazla gönderim algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/kaizen/yeni");
    }
    S.ensureDirs();
    const { lider, uyeler, sorumlular } = ekipOku(req);
    if (!(alan(req, "konu") && lider && alan(req, "onceki") && alan(req, "sonraki"))) {
      flash(req, "error", "Kaizen konusu, lider, önceki ve sonraki durum zorunludur.");
      return res.redirect("/kaizen/yeni");
    }
    const no = await C.nextNumber("kaizenler", "ÖSKFR");
    const sn = C.safeName(no);
    await calistir(
      `INSERT INTO kaizenler(\`no\`, baslangic, bitis, konu, bolum, lider, uyeler,
        sorumlular, kazanclar, onceki, sonraki, onceki_gorsel, sonraki_gorsel,
        durum, puan, puanlama, kayit_zamani)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      [no, alan(req, "baslangic"), alan(req, "bitis"), alan(req, "konu"),
        alan(req, "bolum"), lider, js(uyeler), sorumlular, js(kazanclarOku(req)),
        alan(req, "onceki"), alan(req, "sonraki"),
        C.kaizenKaydetGorsel(dosya(req, "onceki_gorsel"), "oncesi", sn) || "",
        C.kaizenKaydetGorsel(dosya(req, "sonraki_gorsel"), "sonrasi", sn) || "",
        S.VARSAYILAN_DURUM, S.zamanTr()]);
    flash(req, "success", `Kaizen kaydedildi: ${no}`);
    res.redirect("/liste");
  }));

  app.get("/kaizen/duzenle", adminRequired, sar(async (req, res) => {
    const rec = await C.getRecord("kaizen", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    res.render("kaizen_form", { title: "Kaizen Düzenle", bugun: "", kayit: rec,
      kazanc_basliklari: S.KAZANC_BASLIKLARI,
      action_url: "/kaizen/duzenle?no=" + encodeURIComponent(rec.no), duzenle: true });
  }));

  app.post("/kaizen/duzenle", ...dosyaYukleyici(2), adminRequired, sar(async (req, res) => {
    const no = req.query.no || "";
    const eski = await C.getRecord("kaizen", no);
    if (!eski) return res.status(404).send("Kayıt bulunamadı.");
    S.ensureDirs();
    const sn = C.safeName(no);
    const yeniOnceki = C.kaizenKaydetGorsel(dosya(req, "onceki_gorsel"), "oncesi", sn);
    const yeniSonraki = C.kaizenKaydetGorsel(dosya(req, "sonraki_gorsel"), "sonrasi", sn);
    const { lider, uyeler, sorumlular } = ekipOku(req);
    await C.updateRecord("kaizen", no, {
      baslangic: alan(req, "baslangic"), bitis: alan(req, "bitis"),
      konu: alan(req, "konu"), bolum: alan(req, "bolum"),
      lider, uyeler: js(uyeler), sorumlular, kazanclar: js(kazanclarOku(req)),
      onceki: alan(req, "onceki"), sonraki: alan(req, "sonraki"),
      // Yeni görsel yüklenmediyse mevcudu koru
      onceki_gorsel: yeniOnceki || eski.onceki_gorsel || "",
      sonraki_gorsel: yeniSonraki || eski.sonraki_gorsel || "",
    });
    flash(req, "success", `Kaizen güncellendi: ${no}`);
    res.redirect("/liste");
  }));

  app.get("/kaizen/excel", adminRequired, sar(async (req, res) => {
    xlsxGonder(res, await X.generateKaizenExcel(), "kaizenler.xlsx");
  }));

  app.get("/kaizen/gorsel/:filename", (req, res) => {
    const fpath = C.guvenliYol(S.KAIZEN_IMG_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });
};
