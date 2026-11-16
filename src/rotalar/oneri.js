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
      tarih: alan(req, "tarih"), sahibi: sahibi.tam, gorevi: alan(req, "gorevi"), bolum: alan(req, "bolum"),
      konu: alan(req, "konu"), detay: alan(req, "detay"), cozum: alan(req, "cozum"),
      kalite: alan(req, "kalite"), verimlilik: alan(req, "verimlilik"),
      isg: alan(req, "isg"), maliyet: alan(req, "maliyet"), ek: alan(req, "ek"),
    },
    sahibiEksik: sahibi.eksik,
  };
}

// Bölüm ve görev seçimini ortak listelere göre doğrular; değerleri listedeki yazılışa çevirir.
// mevcut: düzenlemede kaydın veritabanındaki hâli (listeden kalkmış eski değer korunabilir). Döner: hata | null
async function secimleriDogrula(k, mevcut = {}) {
  const g = C.gorevSecimi(k.gorevi, await C.gorevTanimlari(), mevcut.gorevi);
  const b = C.bolumSecimi(k.bolum, await C.bolumAdlari(), mevcut.bolum);
  k.gorevi = g.gorev;
  k.bolum = b.bolum;
  return g.hata || b.hata;
}

// mevcut: düzenlemede kaydın veritabanındaki hâli (listeden kalkmış eski bölüm/görev seçenek olarak kalır)
async function formRender(res, kayit, duzenle, geri = "", mevcut = {}) {
  res.render("oneri_form", {
    title: duzenle ? "Öneri Düzenle" : "Yeni Öneri", bugun: duzenle ? "" : S.bugunIso(), kayit,
    bolum_secenekleri: await C.bolumAdlari(), gorev_secenekleri: await C.gorevTanimlari(), mevcut,
    action_url: duzenle
      ? "/oneri/duzenle?no=" + encodeURIComponent(kayit.no) + (geri ? "&geri=" + encodeURIComponent(geri) : "")
      : "/oneri/yeni",
    duzenle, geri,
  });
}

module.exports = function register(app) {
  app.get("/oneri/yeni", sar(async (req, res) => formRender(res, {}, false)));

  app.post("/oneri/yeni", sar(async (req, res) => {
    if (hizLimitAsildi(req, "oneri", 30, 300)) {
      flash(req, "error", "Çok fazla gönderim algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/oneri/yeni");
    }
    const { k, sahibiEksik } = formToDict(req);
    const secimHata = await secimleriDogrula(k);
    if (sahibiEksik || !(k.konu && k.detay) || secimHata) {
      // Form, girilen bilgiler kaybolmadan hata mesajıyla yeniden gösterilir
      res.locals.mesajlar.push(["error", sahibiEksik
        ? "Öneri sahibinin adını ve soyadını ayrı kutulara yazın."
        : (secimHata || "Konu ve detay açıklama zorunludur.")]);
      return formRender(res, k, false);
    }
    // Numara atomik sayaçtan gelir — eşzamanlı gönderimde mükerrer numara oluşmaz
    const no = await C.nextNumber("oneriler", "ÖNFR");
    await calistir(
      `INSERT INTO oneriler(\`no\`, tarih, sahibi, gorevi, bolum, konu, detay, cozum,
        kalite, verimlilik, isg, maliyet, ek, durum, puan, puanlama, kayit_zamani)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,
      [no, k.tarih, k.sahibi, k.gorevi, k.bolum, k.konu, k.detay, k.cozum,
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
    await formRender(res, rec, true, guvenliYol(req.query.geri, ""), rec);
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
    const secimHata = await secimleriDogrula(k, rec);
    if (sahibiEksik || !(k.konu && k.detay) || secimHata) {
      res.locals.mesajlar.push(["error", sahibiEksik || !(k.konu && k.detay)
        ? "Öneri sahibinin adı-soyadı, konu ve detay açıklama zorunludur." : secimHata]);
      return formRender(res, { ...rec, ...k }, true, guvenliYol(req.query.geri, ""), rec);
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
