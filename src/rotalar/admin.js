// Yönetici/denetmen/giriş + ek yönetici yönetimi + değerlendirme-puanlama rotaları.
const S = require("../sabitler");
const P = require("../puanlama");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir, tek, transaction, js } = require("../db");
const I = require("../isim");
const Y = require("../yetkiler");
const W = require("../web");
const {
  sar, flash, xlsxGonder, adminRequired, anaYoneticiRequired, yetkiGerek, alan, adSoyadOku, guvenliYol,
} = W;

// Kaba kuvvet koruması: IP başına 10 dakikada en fazla 8 başarısız deneme
const _girisDenemeleri = new Map();
const _GIRIS_LIMIT = 8, _GIRIS_PENCERE = 600;
function girisKilitli(ip) {
  const simdi = Date.now() / 1000;
  const denemeler = (_girisDenemeleri.get(ip) || []).filter((t) => simdi - t < _GIRIS_PENCERE);
  _girisDenemeleri.set(ip, denemeler);
  return denemeler.length >= _GIRIS_LIMIT;
}

// Checkbox'lardan gelen yetki listesi (yalnızca tanımlı alanlar)
function yetkileriOku(req) {
  return Y.yetkiFormdan((req.body || {}).yetkiler);
}

// İşlemi yapan yöneticinin adı (atama kayıtlarında "kim istedi" bilgisi)
function yapanAd(req) {
  return req.anaYonetici ? "Ana Yönetici" : ((req.yetkiBilgi && req.yetkiBilgi.ad) || "Yönetici");
}

// Sabit puan kuralındaki öneri puanlama tablosuyla puanlanmaz (ana yönetici › Puan ve Ödül Ayarları)
const SABIT_UYARI = "Bu öneri sabit puan kuralına tabi — puanlama tablosu kullanılmaz; onaylanınca sahibine sabit puan yazılır.";
async function sabitPuanliOneri(tip, rec) {
  return tip === "oneri" && (await C.kuralCozucu())(rec).oneri_mod === "sabit";
}

// Oturumu tamamen temizler (rol geçişlerinde eski roldan iz kalmasın)
function oturumuTemizle(session) {
  delete session.admin;
  delete session.super;
  delete session.yonetici_id;
  delete session.yonetici_ad;
  delete session.denetmen_id;
  delete session.denetmen_ad;
}

module.exports = function register(app) {
  // Tek giriş: şifre ana yöneticininkiyse ana yönetici (tam yetki), bir ek
  // yöneticininkiyse o yönetici (kısıtlı yetki), bir denetmeninkiyse o denetmen.
  app.get("/yonetici/giris", (req, res) => {
    res.render("yonetici_giris", { title: "Yönetici Girişi" });
  });

  app.post("/yonetici/giris", sar(async (req, res) => {
    const ip = req.ip || "?";
    if (girisKilitli(ip)) {
      flash(req, "error", "Çok fazla hatalı deneme — 10 dakika sonra tekrar deneyin.");
      return res.redirect("/yonetici/giris");
    }
    const sifre = String(req.body.sifre || "");
    // Yalnızca site içi yol: '//host' ve '/\host' adresleri ile dizi parametresi reddedilir (open redirect)
    const hedef = guvenliYol(typeof req.query.next === "string" ? req.query.next : "/");

    if (await C.adminSifreDogru(sifre)) {
      oturumuTemizle(req.session);
      req.session.admin = true;
      req.session.super = true; // ana yönetici — tüm yetkiler
      _girisDenemeleri.delete(ip);
      if (sifre === S.ADMIN_PASSWORD) {
        flash(req, "error", "⚠ Varsayılan yönetici şifresini kullanıyorsunuz — panelden hemen değiştirin!");
      }
      return res.redirect(hedef);
    }
    const y = await C.yoneticiBySifre(sifre);
    if (y) {
      oturumuTemizle(req.session);
      req.session.admin = true;
      req.session.yonetici_id = y.id;
      req.session.yonetici_ad = y.ad;
      _girisDenemeleri.delete(ip);
      flash(req, "success", `Hoş geldiniz, ${y.ad} (yönetici).`);
      return res.redirect(hedef);
    }
    const d = await C.denetmenBySifre(sifre);
    if (d) {
      oturumuTemizle(req.session);
      req.session.denetmen_id = d.id;
      req.session.denetmen_ad = d.ad;
      _girisDenemeleri.delete(ip);
      flash(req, "success", `Hoş geldiniz, ${d.ad} (denetmen).`);
      return res.redirect(hedef);
    }
    (_girisDenemeleri.get(ip) || _girisDenemeleri.set(ip, []).get(ip)).push(Date.now() / 1000);
    flash(req, "error", "Hatalı şifre.");
    res.redirect("/yonetici/giris" + (hedef !== "/" ? "?next=" + encodeURIComponent(hedef) : ""));
  }));

  app.get("/yonetici/cikis", (req, res) => {
    oturumuTemizle(req.session);
    flash(req, "success", "Çıkış yapıldı.");
    res.redirect("/");
  });

  // Yönetim sayfası: hesaplar (denetmen, misafir, ek yönetici) + ana şifre — yetkiye göre bölümler
  app.get("/yonetici", adminRequired, sar(async (req, res) => {
    const denetmenler = await C.loadDenetmenler();
    const adaylar = (await C.denetmenAdaylari())
      .filter((ad) => !denetmenler.some((d) => I.isimEsit(d.ad, ad)));
    const liderler = await C.denetmenAdaylari();
    res.render("dashboard", {
      title: "Yönetim",
      denetmenler: denetmenler.map((d) => ({ ...d, lider: liderler.some((ad) => I.isimEsit(ad, d.ad)) })),
      lider_adaylari: adaylar,
      misafirler: await C.loadMisafirler(),
      yoneticiler: req.anaYonetici
        ? (await C.loadYoneticiler()).map((y) => ({ ...y, ...Y.yetkiGenislet(y.yetkiler) }))
        : [],
      yetki_gruplari: Y.YETKI_GRUPLARI,
    });
  }));

  // ----- Ek yönetici yönetimi (yalnız ana yönetici) -----
  app.post("/yonetici/yonetici/ekle", anaYoneticiRequired, sar(async (req, res) => {
    const ad = adSoyadOku(req, "ad", "soyad").tam;
    const sifre = String(req.body.sifre || "").trim();
    const yetkiler = yetkileriOku(req);
    if (!ad) {
      flash(req, "error", "Yönetici adı gerekli.");
      return res.redirect("/yonetici#yoneticiler");
    }
    if (sifre.length < 6) {
      flash(req, "error", "Yönetici şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#yoneticiler");
    }
    if (!yetkiler.length) {
      flash(req, "error", "En az bir yetki alanı seçmelisiniz.");
      return res.redirect("/yonetici#yoneticiler");
    }
    // Şifre kimliği belirlediği için benzersiz olmalı (ana yönetici + denetmen + diğer yöneticiler)
    if (await C.sifreCakismasi(sifre)) {
      flash(req, "error", "Bu şifre kullanımda — her hesabın şifresi farklı olmalı.");
      return res.redirect("/yonetici#yoneticiler");
    }
    await calistir("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma) VALUES(?,?,?,?,?)",
      [C.uid(), ad, C.hashPassword(sifre), js(yetkiler), S.zamanTr()]);
    flash(req, "success", `${ad} yöneticisi eklendi.`);
    res.redirect("/yonetici#yoneticiler");
  }));

  // Yetkileri (ve isteğe bağlı şifreyi) günceller
  app.post("/yonetici/yonetici/guncelle", anaYoneticiRequired, sar(async (req, res) => {
    const id = req.body.id || "";
    const y = await C.yoneticiById(id);
    if (!y) {
      flash(req, "error", "Yönetici bulunamadı.");
      return res.redirect("/yonetici#yoneticiler");
    }
    const yetkiler = yetkileriOku(req);
    if (!yetkiler.length) {
      flash(req, "error", "En az bir yetki alanı seçmelisiniz.");
      return res.redirect("/yonetici#yoneticiler");
    }
    const yeniSifre = String(req.body.sifre || "").trim();
    if (yeniSifre) {
      if (yeniSifre.length < 6) {
        flash(req, "error", "Yönetici şifresi en az 6 karakter olmalı.");
        return res.redirect("/yonetici#yoneticiler");
      }
      if (await C.sifreCakismasi(yeniSifre, id)) {
        flash(req, "error", "Bu şifre kullanımda — her hesabın şifresi farklı olmalı.");
        return res.redirect("/yonetici#yoneticiler");
      }
      await calistir("UPDATE yoneticiler SET yetkiler = ?, sifre = ? WHERE id = ?",
        [js(yetkiler), C.hashPassword(yeniSifre), id]);
      flash(req, "success", `${y.ad} yetkileri ve şifresi güncellendi.`);
    } else {
      await calistir("UPDATE yoneticiler SET yetkiler = ? WHERE id = ?", [js(yetkiler), id]);
      flash(req, "success", `${y.ad} yetkileri güncellendi.`);
    }
    res.redirect("/yonetici#yoneticiler");
  }));

  // Ek yönetici silinebilir (ana yönetici sabittir ve silinemez)
  app.post("/yonetici/yonetici/sil", anaYoneticiRequired, sar(async (req, res) => {
    const id = req.body.id || "";
    if (id && id === req.session.yonetici_id) {
      flash(req, "error", "Kendi hesabınızı silemezsiniz.");
      return res.redirect("/yonetici#yoneticiler");
    }
    const r = await calistir("DELETE FROM yoneticiler WHERE id = ?", [id]);
    if (r.affectedRows) flash(req, "success", "Yönetici silindi.");
    res.redirect("/yonetici#yoneticiler");
  }));

  // ----- İşlem günlüğü (yalnız ana yönetici) -----
  app.get("/yonetici/gunluk", anaYoneticiRequired, sar(async (req, res) => {
    res.render("gunluk", { title: "İşlem Günlüğü", kayitlar: await C.loadGunluk(500) });
  }));

  app.post("/yonetici/gunluk/temizle", anaYoneticiRequired, sar(async (req, res) => {
    await C.gunlukTemizle();
    flash(req, "success", "İşlem günlüğü temizlendi.");
    res.redirect("/yonetici/gunluk");
  }));

  // ----- Denetmen hesapları ('kullanici' yetkisi) -----
  // Denetmen = giriş yapabilen saha hesabı: kendisine planlanan 5S denetimini yapar, bölüm
  // lideriyse aksiyon kapatır, öneri/kaizenleri görüntüler, kendisine atanan düzeltme ve
  // görevleri yapar. Bölüm lideri olması gerekmez. Aynı isimde hesap varsa şifresi güncellenir.
  app.post("/yonetici/denetmen/ekle", yetkiGerek("kullanici"), sar(async (req, res) => {
    const ad = adSoyadOku(req, "ad", "soyad");
    const sifre = String(req.body.sifre || "").trim();
    if (ad.eksik) {
      flash(req, "error", "Denetmenin adını ve soyadını yazın.");
      return res.redirect("/yonetici#denetmenler");
    }
    if (sifre.length < 6) {
      flash(req, "error", "Denetmen şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    // Şifre kimliği belirlediği için benzersiz olmalı; bu denetmenin mevcut kaydı hariç
    const kayit = (await C.loadDenetmenler()).find((d) => I.isimEsit(d.ad, ad.tam));
    const mevcutSahip = await C.denetmenBySifre(sifre);
    if ((await C.adminSifreDogru(sifre)) || (await C.yoneticiBySifre(sifre))
        || (mevcutSahip && (!kayit || mevcutSahip.id !== kayit.id))) {
      flash(req, "error", "Bu şifre kullanımda — her hesabın şifresi farklı olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    if (kayit) {
      await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), kayit.id]);
      flash(req, "success", `${kayit.ad} şifresi güncellendi.`);
    } else {
      await calistir("INSERT INTO denetmenler(id, ad, sifre, olusturma) VALUES(?,?,?,?)",
        [C.uid(), ad.tam, C.hashPassword(sifre), S.zamanTr()]);
      flash(req, "success", `${ad.tam} denetmen olarak eklendi.`);
    }
    res.redirect("/yonetici#denetmenler");
  }));

  app.post("/yonetici/denetmen/sifre", yetkiGerek("kullanici"), sar(async (req, res) => {
    const d = await C.denetmenById(req.body.id || "");
    const sifre = String(req.body.sifre || "").trim();
    if (!d) { flash(req, "error", "Denetmen bulunamadı."); return res.redirect("/yonetici#denetmenler"); }
    if (sifre.length < 6) {
      flash(req, "error", "Denetmen şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    const sahip = await C.denetmenBySifre(sifre);
    if ((await C.adminSifreDogru(sifre)) || (await C.yoneticiBySifre(sifre)) || (sahip && sahip.id !== d.id)) {
      flash(req, "error", "Bu şifre kullanımda — her hesabın şifresi farklı olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), d.id]);
    flash(req, "success", `${d.ad} şifresi güncellendi.`);
    res.redirect("/yonetici#denetmenler");
  }));

  app.post("/yonetici/denetmen/sil", yetkiGerek("kullanici"), sar(async (req, res) => {
    const r = await calistir("DELETE FROM denetmenler WHERE id = ?", [req.body.id || ""]);
    if (r.affectedRows) flash(req, "success", "Denetmen hesabı silindi.");
    res.redirect("/yonetici#denetmenler");
  }));

  // ----- Misafir denetmenler (5S plan yetkisi; giriş yapmazlar) -----
  app.post("/yonetici/misafir/ekle", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const ad = adSoyadOku(req, "ad", "soyad");
    if (ad.eksik) {
      flash(req, "error", "Misafir denetmenin adını ve soyadını yazın.");
      return res.redirect("/yonetici#misafirler");
    }
    if ((await C.loadMisafirler()).some((m) => I.isimEsit(m.ad, ad.tam))) {
      flash(req, "error", "Bu isimde misafir denetmen zaten var.");
      return res.redirect("/yonetici#misafirler");
    }
    await calistir("INSERT INTO misafirler(id, ad, olusturma) VALUES(?,?,?)",
      [C.uid(), ad.tam, S.zamanTr()]);
    flash(req, "success", `Misafir denetmen eklendi: ${ad.tam}`);
    res.redirect("/yonetici#misafirler");
  }));

  app.post("/yonetici/misafir/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const r = await calistir("DELETE FROM misafirler WHERE id = ?", [req.body.id || ""]);
    if (r.affectedRows) flash(req, "success", "Misafir denetmen silindi.");
    res.redirect("/yonetici#misafirler");
  }));

  // Ana yönetici şifresini değiştir (yalnızca ana yönetici)
  app.post("/yonetici/sifre", anaYoneticiRequired, sar(async (req, res) => {
    const eski = req.body.eski || "";
    const yeni = String(req.body.yeni || "").trim();
    const yeni2 = String(req.body.yeni2 || "").trim();
    if (!(await C.adminSifreDogru(eski))) flash(req, "error", "Mevcut şifre hatalı.");
    else if (!yeni) flash(req, "error", "Yeni şifre boş olamaz.");
    else if (yeni !== yeni2) flash(req, "error", "Yeni şifreler eşleşmiyor.");
    else if (await C.sifreCakismasi(yeni)) flash(req, "error", "Bu şifre başka bir hesapta kullanımda.");
    else {
      await C.setAdminPassword(yeni);
      flash(req, "success", "Şifre güncellendi.");
    }
    res.redirect("/yonetici");
  }));

  app.get("/yonetici/5s-trend/excel", yetkiGerek("bes_odul"), sar(async (req, res) => {
    const buf = await X.generateTrendExcel();
    if (!buf) {
      flash(req, "error", "İndirilecek trend verisi yok.");
      return res.redirect("/panel");
    }
    xlsxGonder(res, buf, "5S_Trend.xlsx");
  }));

  // Öneri/kaizen sil — kayıt "Reddedilen & Silinen" arşivine taşınır (geri yüklenebilir).
  // Kaizen görselleri diskte KORUNUR; kalıcı silmede (silinenler/sil) temizlenir.
  app.post("/sil", yetkiGerek("kayit"), sar(async (req, res) => {
    const tip = req.body.tip === "oneri" ? "oneri" : "kaizen";
    const tablo = tip === "oneri" ? "oneriler" : "kaizenler";
    const no = req.body.no || "";
    const ham = await tek(`SELECT * FROM ${tablo} WHERE \`no\` = ?`, [no]);
    if (!ham) return res.status(404).send("Kayıt bulunamadı.");
    await transaction(async (conn) => {
      await calistir(
        "INSERT INTO silinen_kayitlar(tip, `no`, veri, silen, silme_zamani) VALUES(?,?,?,?,?)",
        [tip, no, JSON.stringify(ham), yapanAd(req), S.zamanTr()], conn);
      await calistir(`DELETE FROM ${tablo} WHERE \`no\` = ?`, [no], conn);
    });
    flash(req, "success", `Kayıt silindi: ${no} (Reddedilen & Silinen arşivine taşındı)`);
    res.redirect(guvenliYol(req.body.don, "/liste"));
  }));

  // Durum değişikliği: onay / gerekçeli red / denetmene atanan düzeltme / değerlendirmeye geri alma.
  // Red için gerekçe; düzeltme için denetmen + açıklama zorunludur.
  app.post("/durum", yetkiGerek("degerlendir"), sar(async (req, res) => {
    const tip = req.body.tip === "kaizen" ? "kaizen" : "oneri";
    const no = req.body.no || "";
    const durum = req.body.durum || "";
    const detayUrl = "/detay?tip=" + tip + "&no=" + encodeURIComponent(no);
    const don = guvenliYol(req.body.don, detayUrl);
    if (!S.DURUMLAR.includes(durum)) return res.status(400).send("Geçersiz durum.");
    const mevcut = await C.getRecord(tip, no);
    if (!mevcut) return res.status(404).send("Kayıt bulunamadı.");
    const hata = (m) => { flash(req, "error", m); return res.redirect(don); };
    // Onaylanmış kayıt reddedilemez / düzeltmeye gönderilemez
    if (mevcut.durum === "Onaylandı" && durum !== "Onaylandı") {
      return hata(`${no} onaylanmış; reddedilemez veya düzeltmeye gönderilemez.`);
    }
    const alanlar = { durum };
    let ek = "";
    if (durum === "Reddedildi") {
      const neden = alan(req, "red_nedeni");
      if (!neden) return hata("Reddetmek için red nedenini yazın.");
      alanlar.red_nedeni = neden;
    } else if (durum === "Düzeltme İsteniyor") {
      const d = await C.denetmenById(req.body.revize_denetmen || "");
      const notu = alan(req, "revize_notu");
      if (!d) return hata("Düzeltme isterken düzeltmeyi yapacak denetmeni seçin.");
      if (!notu) return hata("Düzeltme isterken neyin düzeltileceğini yazın.");
      Object.assign(alanlar, {
        revize_notu: notu, revize_atanan_id: d.id, revize_atanan_ad: d.ad,
        revize_isteyen: yapanAd(req), revize_zamani: S.zamanTr(), revize_tamamlandi: null,
      });
      ek = ` · düzeltme ${d.ad} kişisine atandı`;
    } else if (durum === "Onaylandı") {
      // İlk onay zamanı: kayda o günün puan kuralı uygulanır (src/puanKurallari.js)
      if (!mevcut.onay_zamani) alanlar.onay_zamani = S.zamanTr();
      // Öneride isteğe bağlı: onayla birlikte uygulama görevi ata
      if (tip === "oneri" && req.body.gorev_denetmen) {
        const g = await C.denetmenById(req.body.gorev_denetmen);
        if (g) {
          Object.assign(alanlar, {
            gorev_atanan_id: g.id, gorev_atanan_ad: g.ad, gorev_termin: alan(req, "gorev_termin"),
            gorev_notu: alan(req, "gorev_notu"), gorev_atayan: yapanAd(req), gorev_zamani: S.zamanTr(),
          });
          ek += ` · görev ${g.ad} kişisine atandı`;
        }
      }
    }
    await C.updateRecord(tip, no, alanlar);
    flash(req, "success", `${no} → ${durum}${ek}`);
    res.redirect(don);
  }));

  // Onaylanan öneriye uygulama/kaizene dönüştürme görevi ata, değiştir veya kaldır
  app.post("/gorev", yetkiGerek("degerlendir"), sar(async (req, res) => {
    const no = req.body.no || "";
    const detayUrl = "/detay?tip=oneri&no=" + encodeURIComponent(no);
    const don = guvenliYol(req.body.don, detayUrl);
    const oneri = await C.getRecord("oneri", no);
    if (!oneri) return res.status(404).send("Kayıt bulunamadı.");
    if (oneri.durum !== "Onaylandı" || oneri.kaizen_no) {
      flash(req, "error", "Görev yalnızca onaylanmış ve henüz kaizene dönüştürülmemiş öneriye atanabilir.");
      return res.redirect(don);
    }
    if (req.body.kaldir) {
      await C.updateRecord("oneri", no, { gorev_atanan_id: null, gorev_atanan_ad: null,
        gorev_termin: null, gorev_notu: null, gorev_atayan: null, gorev_zamani: null });
      flash(req, "success", `${no} görev ataması kaldırıldı.`);
      return res.redirect(don);
    }
    const g = await C.denetmenById(req.body.gorev_denetmen || "");
    if (!g) { flash(req, "error", "Görevi yapacak denetmeni seçin."); return res.redirect(don); }
    await C.updateRecord("oneri", no, {
      gorev_atanan_id: g.id, gorev_atanan_ad: g.ad, gorev_termin: alan(req, "gorev_termin"),
      gorev_notu: alan(req, "gorev_notu"), gorev_atayan: yapanAd(req), gorev_zamani: S.zamanTr(),
    });
    flash(req, "success", `${no} uygulama ve kaizene dönüştürme görevi ${g.ad} kişisine atandı.`);
    res.redirect(don);
  }));

  // Puanlama sayfası + kaydet (kaydedince kaydın detayına döner; "Listeye Dön" kaldığın sayfaya)
  app.get("/degerlendir/puan", yetkiGerek("puanla"), sar(async (req, res) => {
    const tip = req.query.tip === "kaizen" ? "kaizen" : "oneri";
    const no = req.query.no || "";
    const rec = await C.getRecord(tip, no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    const geri = guvenliYol(req.query.geri, "/liste");
    const detayUrl = "/detay?tip=" + tip + "&no=" + encodeURIComponent(no) + "&geri=" + encodeURIComponent(geri);
    if ((rec.durum || S.VARSAYILAN_DURUM) !== "Onaylandı") {
      flash(req, "error", "Puanlamadan önce kaydı onaylayın.");
      return res.redirect(detayUrl);
    }
    if (await sabitPuanliOneri(tip, rec)) {
      flash(req, "error", SABIT_UYARI);
      return res.redirect(detayUrl);
    }
    res.render("degerlendir_puan", {
      title: `Puanla · ${rec.no}`, r: rec, tip, geri, detay_url: detayUrl,
      puan_temel: P.PUAN_TEMEL, puan_etki: P.PUAN_ETKI, puan_maliyet: P.PUAN_MALIYET,
      puan_yaygin: P.PUAN_YAYGIN, puan_efor: P.PUAN_EFOR, puan_max: P.PUAN_MAX,
      mevcut: rec.puanlama || {},
    });
  }));

  app.post("/degerlendir/puan", yetkiGerek("puanla"), sar(async (req, res) => {
    const tip = (req.query.tip || req.body.tip) === "kaizen" ? "kaizen" : "oneri";
    const no = req.query.no || req.body.no || "";
    const geri = guvenliYol(req.body.geri || req.query.geri, "/liste");
    const detayUrl = "/detay?tip=" + tip + "&no=" + encodeURIComponent(no) + "&geri=" + encodeURIComponent(geri);
    const rec = await C.getRecord(tip, no);
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if ((rec.durum || S.VARSAYILAN_DURUM) !== "Onaylandı") {
      flash(req, "error", "Puanlamadan önce kaydı onaylayın.");
      return res.redirect(detayUrl);
    }
    if (await sabitPuanliOneri(tip, rec)) {
      flash(req, "error", SABIT_UYARI);
      return res.redirect(detayUrl);
    }
    const { puanlama, toplam } = P.hesaplaPuanlama(req.body);
    await C.updateRecord(tip, no, { puanlama, puan: toplam, degerlendirme_notu: alan(req, "degerlendirme_notu") });
    flash(req, "success", `${no} puanlandı (Toplam: ${toplam}/100)`);
    res.redirect(detayUrl);
  }));
};
