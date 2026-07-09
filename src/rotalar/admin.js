// Yönetici/denetmen/giriş + değerlendirme-puanlama rotaları.
const fs = require("fs");
const path = require("path");
const S = require("../sabitler");
const P = require("../puanlama");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir } = require("../db");
const { sar, flash, adminRequired, alan } = require("../web");
const { xlsxGonder } = require("./genel");

// Kaba kuvvet koruması: IP başına 10 dakikada en fazla 8 başarısız deneme
const _girisDenemeleri = new Map();
const _GIRIS_LIMIT = 8, _GIRIS_PENCERE = 600;
function girisKilitli(ip) {
  const simdi = Date.now() / 1000;
  const denemeler = (_girisDenemeleri.get(ip) || []).filter((t) => simdi - t < _GIRIS_PENCERE);
  _girisDenemeleri.set(ip, denemeler);
  return denemeler.length >= _GIRIS_LIMIT;
}

module.exports = function register(app) {
  // Tek giriş: şifre yöneticininkiyse yönetici, bir denetmeninkiyse o denetmen
  app.get("/yonetici/giris", (req, res) => {
    res.render("yonetici_giris", { title: "Yönetici Girişi" });
  });

  app.post("/yonetici/giris", sar(async (req, res) => {
    const ip = req.ip || "?";
    if (girisKilitli(ip)) {
      flash(req, "error", "Çok fazla hatalı deneme — 10 dakika sonra tekrar deneyin.");
      return res.redirect("/yonetici/giris");
    }
    const sifre = req.body.sifre || "";
    const hedefRaw = req.query.next || "/";
    // Yalnızca site içi yol: '//host' protokol-göreli adresleri de reddedilir (open redirect)
    const hedef = (hedefRaw.startsWith("/") && !hedefRaw.startsWith("//")) ? hedefRaw : "/";
    if (await C.adminSifreDogru(sifre)) {
      req.session.admin = true;
      delete req.session.denetmen_id;
      delete req.session.denetmen_ad;
      _girisDenemeleri.delete(ip);
      if (sifre === S.ADMIN_PASSWORD) {
        flash(req, "error", "⚠ Varsayılan yönetici şifresini kullanıyorsunuz — panelden hemen değiştirin!");
      }
      return res.redirect(hedef);
    }
    const d = await C.denetmenBySifre(sifre);
    if (d) {
      req.session.denetmen_id = d.id;
      req.session.denetmen_ad = d.ad;
      delete req.session.admin;
      _girisDenemeleri.delete(ip);
      flash(req, "success", `Hoş geldiniz, ${d.ad} (denetmen).`);
      return res.redirect(hedef);
    }
    (_girisDenemeleri.get(ip) || _girisDenemeleri.set(ip, []).get(ip)).push(Date.now() / 1000);
    flash(req, "error", "Hatalı şifre.");
    res.redirect("/yonetici/giris" + (req.query.next ? "?next=" + encodeURIComponent(req.query.next) : ""));
  }));

  app.get("/yonetici/cikis", (req, res) => {
    delete req.session.admin;
    delete req.session.denetmen_id;
    delete req.session.denetmen_ad;
    flash(req, "success", "Çıkış yapıldı.");
    res.redirect("/");
  });

  app.get("/yonetici", adminRequired, sar(async (req, res) => {
    const [trendBasliklar, trendSatirlar] = await C.besSTrendTablo();
    const denetmenler = await C.loadDenetmenler();
    const sifreli = new Set(denetmenler.map((d) => d.ad));
    const adaylar = (await C.denetmenAdaylari()).map((ad) => ({ ad, sifreli: sifreli.has(ad) }));
    res.render("dashboard", {
      title: "Yönetici Paneli",
      ist: await C.dashboardIstatistik(),
      trend_basliklar: trendBasliklar, trend_satirlar: trendSatirlar,
      denetmen_adaylar: adaylar,
      denetmenler,
      misafirler: await C.loadMisafirler(),
    });
  }));

  // Bölüm sorumlusuna şifre belirler (denetmen listesi = bölüm sorumluları)
  app.post("/yonetici/denetmen/ekle", adminRequired, sar(async (req, res) => {
    const ad = alan(req, "ad");
    const sifre = String(req.body.sifre || "").trim();
    if (!(await C.denetmenAdaylari()).includes(ad)) {
      flash(req, "error", "Denetmenler yalnızca bölüm sorumluları arasından belirlenir.");
      return res.redirect("/yonetici#denetmenler");
    }
    if (sifre.length < 6) {
      flash(req, "error", "Denetmen şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    // Şifre kimliği belirlediği için benzersiz olmalı (admin şifresi dahil)
    const mevcutSahip = await C.denetmenBySifre(sifre);
    if ((await C.adminSifreDogru(sifre)) || (mevcutSahip && mevcutSahip.ad !== ad)) {
      flash(req, "error", "Bu şifre kullanımda — her denetmenin şifresi farklı olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    const kayit = (await C.loadDenetmenler()).find((d) => d.ad === ad);
    if (kayit) {
      await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), kayit.id]);
      flash(req, "success", `${ad} şifresi güncellendi.`);
    } else {
      await calistir("INSERT INTO denetmenler(id, ad, sifre, olusturma) VALUES(?,?,?,?)",
        [C.uid(), ad, C.hashPassword(sifre), S.zamanTr()]);
      flash(req, "success", `${ad} için giriş şifresi belirlendi.`);
    }
    res.redirect("/yonetici#denetmenler");
  }));

  app.post("/yonetici/denetmen/sil", adminRequired, sar(async (req, res) => {
    const r = await calistir("DELETE FROM denetmenler WHERE id = ?", [req.body.id || ""]);
    if (r.affectedRows) flash(req, "success", "Denetmen silindi.");
    res.redirect("/yonetici#denetmenler");
  }));

  app.post("/yonetici/misafir/ekle", adminRequired, sar(async (req, res) => {
    const ad = alan(req, "ad");
    if (!ad) {
      flash(req, "error", "Misafir denetmen adı gerekli.");
      return res.redirect("/yonetici#misafirler");
    }
    if ((await C.loadMisafirler()).some((m) => m.ad === ad)) {
      flash(req, "error", "Bu isimde misafir denetmen zaten var.");
      return res.redirect("/yonetici#misafirler");
    }
    await calistir("INSERT INTO misafirler(id, ad, olusturma) VALUES(?,?,?)",
      [C.uid(), ad, S.zamanTr()]);
    flash(req, "success", `Misafir denetmen eklendi: ${ad}`);
    res.redirect("/yonetici#misafirler");
  }));

  app.post("/yonetici/misafir/sil", adminRequired, sar(async (req, res) => {
    const r = await calistir("DELETE FROM misafirler WHERE id = ?", [req.body.id || ""]);
    if (r.affectedRows) flash(req, "success", "Misafir denetmen silindi.");
    res.redirect("/yonetici#misafirler");
  }));

  app.post("/yonetici/sifre", adminRequired, sar(async (req, res) => {
    const eski = req.body.eski || "";
    const yeni = String(req.body.yeni || "").trim();
    const yeni2 = String(req.body.yeni2 || "").trim();
    if (!(await C.adminSifreDogru(eski))) flash(req, "error", "Mevcut şifre hatalı.");
    else if (!yeni) flash(req, "error", "Yeni şifre boş olamaz.");
    else if (yeni !== yeni2) flash(req, "error", "Yeni şifreler eşleşmiyor.");
    else {
      await C.setAdminPassword(yeni);
      flash(req, "success", "Şifre güncellendi.");
    }
    res.redirect("/yonetici");
  }));

  app.get("/yonetici/5s-trend/excel", adminRequired, sar(async (req, res) => {
    const buf = await X.generateTrendExcel();
    if (!buf) {
      flash(req, "error", "İndirilecek trend verisi yok.");
      return res.redirect("/yonetici");
    }
    xlsxGonder(res, buf, "5S_Trend.xlsx");
  }));

  // Öneri/kaizen sil (kaizen görselleri dahil)
  app.post("/sil", adminRequired, sar(async (req, res) => {
    const tip = req.body.tip || "";
    const no = req.body.no || "";
    const rec = await C.getRecord(tip, no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if (tip === "kaizen") {
      for (const fld of ["onceki_gorsel", "sonraki_gorsel"]) {
        if (rec[fld]) {
          try { fs.unlinkSync(path.join(S.KAIZEN_IMG_DIR, rec[fld])); } catch {}
        }
      }
    }
    await calistir(
      `DELETE FROM ${tip === "oneri" ? "oneriler" : "kaizenler"} WHERE \`no\` = ?`, [no]);
    flash(req, "success", `Kayıt silindi: ${no}`);
    res.redirect("/liste");
  }));

  // Hızlı onay / red / düzeltme isteme
  app.post("/durum", adminRequired, sar(async (req, res) => {
    const tip = req.body.tip || "";
    const no = req.body.no || "";
    const durum = req.body.durum || "";
    if (!S.DURUMLAR.includes(durum)) return res.status(400).send("Geçersiz durum.");
    const mevcut = await C.getRecord(tip, no);
    if (!mevcut) return res.status(404).send("Kayıt bulunamadı.");
    // Onaylanmış kayıt tekrar reddedilemez
    if (mevcut.durum === "Onaylandı" && durum === "Reddedildi") {
      flash(req, "error", `${no} onaylanmış; reddedilemez.`);
      return res.redirect("/liste");
    }
    await C.updateRecord(tip, no, { durum });
    flash(req, "success", `${no} → ${durum}`);
    res.redirect("/liste");
  }));

  // Puanlama sayfası + kaydet
  app.get("/degerlendir/puan", adminRequired, sar(async (req, res) => {
    const tip = req.query.tip || "";
    const no = req.query.no || "";
    const rec = await C.getRecord(tip, no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if ((rec.durum || S.VARSAYILAN_DURUM) !== "Onaylandı") {
      flash(req, "error", "Puanlamadan önce kaydı onaylayın.");
      return res.redirect("/liste");
    }
    res.render("degerlendir_puan", {
      title: `Puanla · ${rec.no}`, r: rec, tip,
      puan_temel: P.PUAN_TEMEL, puan_etki: P.PUAN_ETKI, puan_maliyet: P.PUAN_MALIYET,
      puan_yaygin: P.PUAN_YAYGIN, puan_efor: P.PUAN_EFOR, puan_max: P.PUAN_MAX,
      mevcut: rec.puanlama || {},
    });
  }));

  app.post("/degerlendir/puan", adminRequired, sar(async (req, res) => {
    const tip = req.query.tip || req.body.tip || "";
    const no = req.query.no || req.body.no || "";
    const rec = await C.getRecord(tip, no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if ((rec.durum || S.VARSAYILAN_DURUM) !== "Onaylandı") {
      flash(req, "error", "Puanlamadan önce kaydı onaylayın.");
      return res.redirect("/liste");
    }
    const { puanlama, toplam } = P.hesaplaPuanlama(req.body);
    let durum = req.body.durum || rec.durum || S.VARSAYILAN_DURUM;
    if (!S.DURUMLAR.includes(durum)) durum = rec.durum || S.VARSAYILAN_DURUM;
    await C.updateRecord(tip, no, {
      puanlama, puan: toplam, durum,
      degerlendirme_notu: alan(req, "degerlendirme_notu"),
    });
    flash(req, "success", `${no} puanlandı (Toplam: ${toplam}/100, Durum: ${durum})`);
    res.redirect("/liste");
  }));
};
