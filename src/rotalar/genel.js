// Genel rotalar: anasayfa, panel, öneri/kaizen listesi ve detayı (giriş gerekir), arşiv
// (reddedilen + silinen), görevlerim, puan durumu, ödüller, isim birleştirme.
const fs = require("fs");
const path = require("path");
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { sorgu, tek, calistir, transaction, j, oneriRow, kaizenRow } = require("../db");
const { sar, flash, yetkiGerek, girisRequired, alan, guvenliYol } = require("../web");

function xlsxGonder(res, buffer, ad) {
  res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(ad)}"`);
  res.send(Buffer.from(buffer));
}

// Silinen kayıt arşivindeki ham satırı detay sayfasının beklediği nesneye çevirir
function silinenKayit(s) {
  const ham = j(s.veri, null);
  if (!ham) return null;
  return s.tip === "oneri" ? oneriRow(ham) : kaizenRow(ham);
}

module.exports = function register(app) {
  app.get("/", (req, res) => {
    res.render("anasayfa", { title: "Anasayfa · Yalın Üretim Uygulamaları" });
  });

  app.get("/yardim", (req, res) => {
    res.render("kullanim", { title: "Kullanım Kılavuzu", esik: S.ODUL_ESIK });
  });

  // ----- Panel: istatistikler + 5S trendi (girişli herkes: denetmen ve tüm yöneticiler) -----
  app.get("/panel", girisRequired, sar(async (req, res) => {
    const [trendBasliklar, trendSatirlar] = await C.besSTrendTablo();
    res.render("panel", {
      title: "Panel",
      ist: await C.dashboardIstatistik(),
      trend_basliklar: trendBasliklar, trend_satirlar: trendSatirlar,
    });
  }));

  // ----- Öneri & Kaizen listesi (girişli; reddedilenler hariç; 20'li sayfa) -----
  app.get("/liste", girisRequired, sar(async (req, res) => {
    const records = await C.combinedRecords();
    const tip = req.query.tip || "hepsi";
    const ay = req.query.ay || "";
    const q = req.query.q || "";
    const durum = req.query.durum || "";
    const sf = C.sayfala(C.filtrele(records, tip, ay, q, durum), req.query.s);
    const filtre = { tip, ay, q, durum };
    const sayfaUrl = (n) => "/liste?" + new URLSearchParams(
      Object.fromEntries(Object.entries({ ...filtre, s: String(n) }).filter(([, v]) => v && v !== "hepsi"))).toString();
    res.render("liste", {
      title: "Öneri & Kaizen Listesi · Yalın Üretim",
      kayitlar: sf.kayitlar, sf, sayfaUrl,
      aylar: C.mevcutAylar(records),
      tip, ay, q, durum,
      toplam: records.filter((r) => r.durum !== "Reddedildi").length,
      tam_yol: req.originalUrl,
    });
  }));

  // ----- Kayıt detayı: değerlendirme işlemleri (onay / red / düzeltme / görev) burada -----
  app.get("/detay", girisRequired, sar(async (req, res) => {
    const tip = req.query.tip === "kaizen" ? "kaizen" : "oneri";
    const rec = await C.getRecord(tip, req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    const yt = req.yetkiler;
    res.render("detay", {
      title: `${rec.no} · Detay`,
      r: rec, tip,
      kazanc_basliklari: S.KAZANC_BASLIKLARI,
      geri: guvenliYol(req.query.geri, "/liste"),
      bu_sayfa: req.originalUrl,
      denetmenler: yt.includes("degerlendir") ? await C.loadDenetmenler() : [],
      duzenleyebilir: C.kayitDuzenleyebilir(rec, yt, req.denetmen),
      donusturebilir: tip === "oneri" && C.kaizeneDonusturebilir(rec, yt, req.denetmen),
      silinen: null,
    });
  }));

  // ----- Reddedilen & Silinen arşivi (girişli herkes görür; işlem yalnız yetkiliye) -----
  app.get("/arsiv", girisRequired, sar(async (req, res) => {
    const reddedilenler = (await C.combinedRecords()).filter((r) => r.durum === "Reddedildi");
    const silinenler = (await sorgu("SELECT * FROM silinen_kayitlar ORDER BY id DESC")).map((s) => {
      const v = j(s.veri, {}) || {};
      return {
        id: s.id, tip: s.tip, no: s.no, silen: s.silen, silme_zamani: s.silme_zamani,
        konu: v.konu || "", kisi: s.tip === "oneri" ? (v.sahibi || "") : (v.sorumlular || v.lider || ""),
        tarih: v.tarih || v.baslangic || "", durum: v.durum || "", puan: v.puan,
      };
    });
    res.render("arsiv", { title: "Reddedilen & Silinen", reddedilenler, silinenler, bu_sayfa: req.originalUrl });
  }));

  app.get("/arsiv/silinen/:id", girisRequired, sar(async (req, res) => {
    const s = await tek("SELECT * FROM silinen_kayitlar WHERE id = ?", [req.params.id]);
    const rec = s ? silinenKayit(s) : null;
    if (!rec) return res.status(404).send("Silinen kayıt bulunamadı.");
    res.render("detay", {
      title: `${rec.no} · Silinen Kayıt`, r: rec, tip: s.tip,
      kazanc_basliklari: S.KAZANC_BASLIKLARI, geri: "/arsiv#silinenler", bu_sayfa: req.originalUrl,
      denetmenler: [], duzenleyebilir: false, donusturebilir: false,
      silinen: { id: s.id, silen: s.silen, silme_zamani: s.silme_zamani },
    });
  }));

  // Eski adres (yer imleri için)
  app.get("/silinenler", girisRequired, (req, res) => res.redirect("/arsiv#silinenler"));

  // Geri yükle: arşivdeki ham satırı ilgili tabloya yeniden ekler
  app.post("/silinenler/geri", yetkiGerek("kayit"), sar(async (req, res) => {
    const s = await tek("SELECT * FROM silinen_kayitlar WHERE id = ?", [req.body.id || ""]);
    if (!s) { flash(req, "error", "Silinen kayıt bulunamadı."); return res.redirect("/arsiv#silinenler"); }
    const tablo = s.tip === "oneri" ? "oneriler" : "kaizenler";
    if (await tek(`SELECT 1 FROM ${tablo} WHERE \`no\` = ?`, [s.no])) {
      flash(req, "error", `Bu numara (${s.no}) şu an kullanımda — geri yüklenemedi.`);
      return res.redirect("/arsiv#silinenler");
    }
    const ham = j(s.veri, null);
    if (!ham) { flash(req, "error", "Kayıt verisi okunamadı."); return res.redirect("/arsiv#silinenler"); }
    const kolonlar = Object.keys(ham);
    const kolonSql = kolonlar.map((k) => `\`${k}\``).join(", ");
    const yer = kolonlar.map(() => "?").join(", ");
    await transaction(async (conn) => {
      await calistir(`INSERT INTO ${tablo}(${kolonSql}) VALUES(${yer})`,
        kolonlar.map((k) => ham[k]), conn);
      await calistir("DELETE FROM silinen_kayitlar WHERE id = ?", [s.id], conn);
    });
    flash(req, "success", `${s.no} geri yüklendi.`);
    res.redirect("/arsiv#silinenler");
  }));

  // Kalıcı sil: arşivden çıkar + kaizen görsellerini diskten temizle
  app.post("/silinenler/sil", yetkiGerek("kayit"), sar(async (req, res) => {
    const s = await tek("SELECT * FROM silinen_kayitlar WHERE id = ?", [req.body.id || ""]);
    if (!s) { flash(req, "error", "Silinen kayıt bulunamadı."); return res.redirect("/arsiv#silinenler"); }
    if (s.tip === "kaizen") {
      const v = j(s.veri, {}) || {};
      for (const fld of ["onceki_gorsel", "sonraki_gorsel"]) {
        if (v[fld]) { try { fs.unlinkSync(path.join(S.KAIZEN_IMG_DIR, v[fld])); } catch {} }
      }
    }
    await calistir("DELETE FROM silinen_kayitlar WHERE id = ?", [s.id]);
    flash(req, "success", `${s.no} kalıcı olarak silindi.`);
    res.redirect("/arsiv#silinenler");
  }));

  // ----- Görevlerim: denetmene atanan düzeltmeler, kaizene dönüştürme görevleri, 5S işleri -----
  app.get("/gorevlerim", girisRequired, sar(async (req, res) => {
    const benim = req.denetmen ? await C.gorevlerim(req.denetmen) : null;
    const tumu = req.yetkiler.includes("degerlendir") ? await C.acikAtamalar() : null;
    res.render("gorevlerim", { title: "Görevlerim", benim, tumu });
  }));

  // ----- Puan listesi + ödüller -----
  app.get("/puan-durumu", sar(async (req, res) => {
    res.render("puan_durumu", {
      title: "Puan Listesi · Yalın Üretim",
      siralama: await C.puanDurumu(), esik: S.ODUL_ESIK,
    });
  }));

  app.post("/odul-ver", yetkiGerek("odul"), sar(async (req, res) => {
    const ad = alan(req, "ad");
    const kokBul = await C.isimCozucu();
    const kisi = ad ? (await C.puanDurumu()).find((k) => k.anahtar === kokBul(ad)) : null;
    if (!kisi || kisi.net < S.ODUL_ESIK) {
      flash(req, "error", `${ad || "Kişi"} için net puan ${S.ODUL_ESIK}'ün altında.`);
      return res.redirect("/puan-durumu");
    }
    await calistir("INSERT INTO odul_arsiv(ad, puan, tarih, zaman) VALUES(?,?,?,?)",
      [kisi.ad, S.ODUL_ESIK, S.bugunIso(), S.zamanTr()]);
    flash(req, "success", `${kisi.ad} ödül aldı — ${S.ODUL_ESIK} puan düşüldü.`);
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
    const kokBul = await C.isimCozucu();
    const ozet = new Map(); // aynı kişinin farklı yazılışları tek satır
    for (const r of arsiv) {
      const k = kokBul(r.ad);
      if (!ozet.has(k)) ozet.set(k, [r.ad, 0]);
      ozet.get(k)[1] += 1;
    }
    const ozetListe = [...ozet.values()].sort((a, b) => b[1] - a[1]);
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

  // ----- İsim birleştirme (aynı kişinin farklı yazılışları; kayıtlar değişmez) -----
  app.get("/isimler", yetkiGerek("odul"), sar(async (req, res) => {
    const v = await C.isimGruplari();
    res.render("isimler", { title: "İsim Birleştirme", ...v });
  }));

  app.post("/isimler/birlestir", yetkiGerek("odul"), sar(async (req, res) => {
    const kaynak = String(req.body.kaynak || "");
    const hedef = String(req.body.hedef || "");
    const kim = req.yetkiBilgi.ad || "Yönetici";
    const [ok, hata] = await C.isimBirlestir(kaynak, hedef, kim);
    if (!ok) flash(req, "error", hata);
    else flash(req, "success", `"${alan(req, "kaynak_ad") || kaynak}" → "${alan(req, "hedef_ad") || hedef}" ` +
      "aynı kişi olarak birleştirildi.");
    res.redirect("/isimler");
  }));

  app.post("/isimler/ayir", yetkiGerek("odul"), sar(async (req, res) => {
    if (await C.isimAyir(String(req.body.kaynak || ""))) {
      flash(req, "success", `"${alan(req, "kaynak_ad") || req.body.kaynak}" birleştirmesi kaldırıldı.`);
    }
    res.redirect("/isimler");
  }));

  app.get("/puan-durumu/excel", yetkiGerek("odul"), sar(async (req, res) => {
    xlsxGonder(res, await X.generatePuanExcel(), "puan_listesi.xlsx");
  }));

  app.get("/odul-alanlar/excel", yetkiGerek("odul"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateOdulExcel(), "odul_alanlar.xlsx");
  }));
};

module.exports.xlsxGonder = xlsxGonder;
