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
  delete session.son_kullanici;
}

// Formdaki kullanıcı adı: boşsa addan otomatik önerilir, doluysa biçim + benzersizlik denetlenir.
// haric: {tablo, id} — güncellenen hesabın kendi adı çakışma sayılmaz. Döner: { k } | { hata }
async function kullaniciAdiAl(req, ad, haric = null) {
  const girilen = String(req.body.kullanici_adi || "").trim();
  if (!girilen) return { k: await C.kullaniciAdiOner(ad) };
  const hata = await C.kullaniciAdiHatasi(girilen, haric);
  return hata ? { hata } : { k: I.kullaniciAdiAnahtar(girilen) };
}

module.exports = function register(app) {
  // YYYY-AA-GG geçerli mi ve bugünden önce değil mi (değişmeyen eski tarih kabul). Döner: hata metni | null
  function ileriTarihHatasi(tarih, eski, etiket) {
    const t = new Date(tarih + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || isNaN(t) || t.toISOString().slice(0, 10) !== tarih) {
      return `${etiket} geçerli bir tarih olmalı.`;
    }
    if (tarih !== eski && tarih < S.bugunIso()) return `${etiket} bugünden önce olamaz.`;
    return null;
  }

  // Uygulama/kaizene dönüştürme görevi: denetmen + termin + açıklama ZORUNLU. Termin bugünden önce olamaz
  // (görev değiştirilirken tarihi değişmeyen eski termin kalabilir). Döner: { alanlar } ya da { hata }
  function gorevAlanlari(req, denetmen, eskiTermin = "") {
    const termin = alan(req, "gorev_termin");
    const notu = alan(req, "gorev_notu");
    if (!termin || !notu) return { hata: "Görev atarken termin ve açıklama zorunludur." };
    const tHata = ileriTarihHatasi(termin, eskiTermin, "Termin");
    if (tHata) return { hata: tHata };
    return { alanlar: {
      gorev_atanan_id: denetmen.id, gorev_atanan_ad: denetmen.ad, gorev_termin: termin,
      gorev_notu: notu, gorev_atayan: yapanAd(req), gorev_zamani: S.zamanTr(),
    } };
  }

  // Tek giriş: kullanıcı adı + şifre. "admin" ana yönetici (tam yetki); diğer adlar ek yönetici (kısıtlı yetki)
  // ya da denetmen hesabıdır — hangisi olduğunu sistem kullanıcı adından bulur.
  app.get("/yonetici/giris", (req, res) => {
    const kullanici_adi = typeof req.session.son_kullanici === "string" ? req.session.son_kullanici : "";
    delete req.session.son_kullanici;
    res.render("yonetici_giris", { title: "Giriş", kullanici_adi });
  });

  app.post("/yonetici/giris", sar(async (req, res) => {
    const ip = req.ip || "?";
    if (girisKilitli(ip)) {
      flash(req, "error", "Çok fazla hatalı deneme — 10 dakika sonra tekrar deneyin.");
      return res.redirect("/yonetici/giris");
    }
    const kullanici = String(req.body.kullanici_adi || "").trim().slice(0, 64);
    const sifre = String(req.body.sifre || "");
    // Yalnızca site içi yol: '//host' ve '/\host' adresleri ile dizi parametresi reddedilir (open redirect)
    const hedef = guvenliYol(typeof req.query.next === "string" ? req.query.next : "/");

    await C.kullaniciAdlariniTamamla(); // eski sürümle / elle eklenmiş hesaplar da giriş yapabilsin
    const g = await C.girisHesabi(kullanici, sifre);
    if (g) {
      oturumuTemizle(req.session);
      _girisDenemeleri.delete(ip);
      if (g.tip === "ana") {
        req.session.admin = true;
        req.session.super = true; // ana yönetici — tüm yetkiler
        if (sifre === S.ADMIN_PASSWORD) {
          flash(req, "error", "⚠ Varsayılan yönetici şifresini kullanıyorsunuz — panelden hemen değiştirin!");
        }
      } else if (g.tip === "yonetici") {
        req.session.admin = true;
        req.session.yonetici_id = g.hesap.id;
        req.session.yonetici_ad = g.hesap.ad;
        flash(req, "success", `Hoş geldiniz, ${g.hesap.ad} (yönetici).`);
      } else {
        req.session.denetmen_id = g.hesap.id;
        req.session.denetmen_ad = g.hesap.ad;
        flash(req, "success", `Hoş geldiniz, ${g.hesap.ad} (denetmen).`);
      }
      return res.redirect(hedef);
    }
    (_girisDenemeleri.get(ip) || _girisDenemeleri.set(ip, []).get(ip)).push(Date.now() / 1000);
    flash(req, "error", kullanici ? "Kullanıcı adı veya şifre hatalı." : "Kullanıcı adınızı ve şifrenizi girin.");
    req.session.son_kullanici = kullanici; // giriş kutusu tekrar dolu gelsin (şifre değil)
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
    // Kimlik kullanıcı adından belirlenir; şifrelerin farklı olması gerekmez (eskiden şifre = kimlikti)
    const ka = await kullaniciAdiAl(req, ad);
    if (ka.hata) {
      flash(req, "error", ka.hata);
      return res.redirect("/yonetici#yoneticiler");
    }
    await calistir("INSERT INTO yoneticiler(id, ad, sifre, yetkiler, olusturma, kullanici_adi) VALUES(?,?,?,?,?,?)",
      [C.uid(), ad, C.hashPassword(sifre), js(yetkiler), S.zamanTr(), ka.k]);
    flash(req, "success", `${ad} yöneticisi eklendi — kullanıcı adı: ${ka.k}`);
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
    if (yeniSifre && yeniSifre.length < 6) {
      flash(req, "error", "Yönetici şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#yoneticiler");
    }
    // Kullanıcı adı alanı formda varsa ve değiştiyse güncellenir (alan yoksa/boşsa dokunulmaz)
    const yeniK = I.kullaniciAdiAnahtar(req.body.kullanici_adi);
    const kDegisti = !!yeniK && yeniK !== I.kullaniciAdiAnahtar(y.kullanici_adi);
    if (kDegisti) {
      const hata = await C.kullaniciAdiHatasi(yeniK, { tablo: "yoneticiler", id });
      if (hata) { flash(req, "error", hata); return res.redirect("/yonetici#yoneticiler"); }
    }
    await calistir("UPDATE yoneticiler SET yetkiler = ? WHERE id = ?", [js(yetkiler), id]);
    if (yeniSifre) await calistir("UPDATE yoneticiler SET sifre = ? WHERE id = ?", [C.hashPassword(yeniSifre), id]);
    if (kDegisti) await calistir("UPDATE yoneticiler SET kullanici_adi = ? WHERE id = ?", [yeniK, id]);
    const ekler = [yeniSifre && "şifresi", kDegisti && `kullanıcı adı (${yeniK})`].filter(Boolean);
    flash(req, "success", `${y.ad} yetkileri${ekler.length ? " ve " + ekler.join(", ") : ""} güncellendi.`);
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

  // Günlüğün tamamı Excel olarak (yalnız ana yönetici — günlüğü görebilen tek hesap)
  app.get("/yonetici/gunluk/excel", anaYoneticiRequired, sar(async (req, res) => {
    xlsxGonder(res, await X.generateGunlukExcel(await C.tumGunluk()), `islem_gunlugu_${S.bugunIso()}.xlsx`);
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
    // Kimlik kullanıcı adından belirlenir; şifrelerin farklı olması gerekmez (eskiden şifre = kimlikti)
    const kayit = (await C.loadDenetmenler()).find((d) => I.isimEsit(d.ad, ad.tam));
    if (kayit) {
      await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), kayit.id]);
      flash(req, "success", `${kayit.ad} şifresi güncellendi (kullanıcı adı: ${kayit.kullanici_adi || "-"}).`);
    } else {
      const ka = await kullaniciAdiAl(req, ad.tam);
      if (ka.hata) {
        flash(req, "error", ka.hata);
        return res.redirect("/yonetici#denetmenler");
      }
      await calistir("INSERT INTO denetmenler(id, ad, sifre, olusturma, kullanici_adi) VALUES(?,?,?,?,?)",
        [C.uid(), ad.tam, C.hashPassword(sifre), S.zamanTr(), ka.k]);
      flash(req, "success", `${ad.tam} denetmen olarak eklendi — kullanıcı adı: ${ka.k}`);
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
    await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), d.id]);
    flash(req, "success", `${d.ad} şifresi güncellendi.`);
    res.redirect("/yonetici#denetmenler");
  }));

  // Denetmen hesabı: kullanıcı adı (zorunlu) + isteğe bağlı yeni şifre — Yönetim'deki hesap satırı
  app.post("/yonetici/denetmen/guncelle", yetkiGerek("kullanici"), sar(async (req, res) => {
    const d = await C.denetmenById(req.body.id || "");
    if (!d) { flash(req, "error", "Denetmen bulunamadı."); return res.redirect("/yonetici#denetmenler"); }
    const sifre = String(req.body.sifre || "").trim();
    if (sifre && sifre.length < 6) {
      flash(req, "error", "Denetmen şifresi en az 6 karakter olmalı.");
      return res.redirect("/yonetici#denetmenler");
    }
    const yeniK = I.kullaniciAdiAnahtar(req.body.kullanici_adi);
    const kDegisti = yeniK !== I.kullaniciAdiAnahtar(d.kullanici_adi);
    if (kDegisti) {
      const hata = await C.kullaniciAdiHatasi(yeniK, { tablo: "denetmenler", id: d.id });
      if (hata) { flash(req, "error", hata); return res.redirect("/yonetici#denetmenler"); }
    }
    if (!kDegisti && !sifre) {
      flash(req, "uyari", `${d.ad}: değişiklik yok (yeni şifre boş, kullanıcı adı aynı).`);
      return res.redirect("/yonetici#denetmenler");
    }
    if (kDegisti) await calistir("UPDATE denetmenler SET kullanici_adi = ? WHERE id = ?", [yeniK, d.id]);
    if (sifre) await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [C.hashPassword(sifre), d.id]);
    const ne = [kDegisti && `kullanıcı adı (${yeniK})`, sifre && "şifresi"].filter(Boolean).join(" ve ");
    flash(req, "success", `${d.ad} ${ne} güncellendi.`);
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
    else {
      await C.setAdminPassword(yeni);
      flash(req, "success", "Şifre güncellendi.");
    }
    res.redirect("/yonetici#sifre");
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
      // Öneride isteğe bağlı: onayla birlikte uygulama görevi ata (atanırsa termin + açıklama zorunlu)
      if (tip === "oneri" && req.body.gorev_denetmen) {
        if (mevcut.uygulama_durumu || mevcut.kaizen_no) {
          return hata("Öneri havuzda, kapatılmış ya da kaizene dönüştürülmüş; görev buradan atanamaz.");
        }
        const g = await C.denetmenById(req.body.gorev_denetmen);
        if (!g) return hata("Görevi yapacak denetmen bulunamadı. Kayıt onaylanmadı.");
        const gorev = gorevAlanlari(req, g);
        if (gorev.hata) return hata(`${gorev.hata} Kayıt onaylanmadı.`);
        Object.assign(alanlar, gorev.alanlar);
        ek += ` · görev ${g.ad} kişisine atandı (termin ${C.trdate(gorev.alanlar.gorev_termin)})`;
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
    if (oneri.uygulama_durumu) {
      flash(req, "error", oneri.uygulama_durumu === "beklemede"
        ? "Öneri onaylı – beklemede havuzunda; görev atamak için önce havuzdan çıkarın."
        : "Öneri \"Uygulanamadı\" olarak kapatılmış; görev atamak için önce yeniden açın.");
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
    const gorev = gorevAlanlari(req, g, oneri.gorev_termin || "");
    if (gorev.hata) { flash(req, "error", gorev.hata); return res.redirect(don); }
    await C.updateRecord("oneri", no, gorev.alanlar);
    flash(req, "success", `${no} uygulama ve kaizene dönüştürme görevi ${g.ad} kişisine atandı (termin ${C.trdate(gorev.alanlar.gorev_termin)}).`);
    res.redirect(don);
  }));

  // Onaylı öneri havuzu: beklemeye al (ya da bekleme bilgisini güncelle) / havuzdan çıkar / "Uygulanamadı" olarak
  // kapat / yeniden aç. Kayıt "Onaylandı" kalır ve onay puanını korur; havuzda ya da kapalıyken görev atanmaz,
  // kaizene dönüştürülmez. Beklemeye alınan ya da kapatılan öneride varsa uygulama görevi kaldırılır.
  app.post("/oneri/havuz", yetkiGerek("degerlendir"), sar(async (req, res) => {
    const no = req.body.no || "";
    const don = guvenliYol(req.body.don, "/detay?tip=oneri&no=" + encodeURIComponent(no));
    const hata = (m) => { flash(req, "error", m); return res.redirect(don); };
    const oneri = await C.getRecord("oneri", no);
    if (!oneri) return res.status(404).send("Kayıt bulunamadı.");
    if (oneri.durum !== "Onaylandı" || oneri.kaizen_no) {
      return hata("Yalnızca onaylanmış ve kaizene dönüştürülmemiş öneri havuza alınabilir ya da kapatılabilir.");
    }
    const iz = { uygulama_isleyen: yapanAd(req), uygulama_zamani: S.zamanTr() };
    const gorevKaldir = oneri.gorev_atanan_id ? { gorev_atanan_id: null, gorev_atanan_ad: null, gorev_termin: null,
      gorev_notu: null, gorev_atayan: null, gorev_zamani: null } : {};
    const gorevNotu = oneri.gorev_atanan_ad ? ` · ${oneri.gorev_atanan_ad} kişisinin uygulama görevi kaldırıldı` : "";
    const islem = req.body.islem || "";

    if (islem === "beklemeye_al") {
      if (oneri.uygulama_durumu === "uygulanamadi") return hata("Öneri \"Uygulanamadı\" olarak kapatılmış; önce yeniden açın.");
      const kategori = alan(req, "bekleme_kategori");
      const neden = alan(req, "bekleme_nedeni");
      const gozden = alan(req, "bekleme_gozden");
      if (!S.BEKLEME_KATEGORILERI.includes(kategori)) return hata("Bekleme nedeninin türünü seçin.");
      if (!neden) return hata("Neden beklediğini yazın.");
      if (!gozden) return hata("Gözden geçirme tarihini seçin.");
      const tHata = ileriTarihHatasi(gozden, oneri.uygulama_durumu === "beklemede" ? oneri.bekleme_gozden : "",
        "Gözden geçirme tarihi");
      if (tHata) return hata(tHata);
      const guncelleme = oneri.uygulama_durumu === "beklemede";
      await C.updateRecord("oneri", no, { uygulama_durumu: "beklemede", bekleme_kategori: kategori,
        bekleme_nedeni: neden, bekleme_gozden: gozden, ...iz, ...gorevKaldir });
      flash(req, "success", guncelleme
        ? `${no} bekleme bilgisi güncellendi: ${kategori} · gözden geçirme ${C.trdate(gozden)}`
        : `${no} onaylı – beklemede havuzuna alındı: ${kategori} · gözden geçirme ${C.trdate(gozden)}${gorevNotu}`);
    } else if (islem === "havuzdan_cikar") {
      if (oneri.uygulama_durumu !== "beklemede") return hata("Öneri havuzda değil.");
      await C.updateRecord("oneri", no, { uygulama_durumu: null, ...iz });
      flash(req, "success", `${no} havuzdan çıkarıldı — uygulama görevi atanabilir.`);
    } else if (islem === "uygulanamadi") {
      if (oneri.uygulama_durumu === "uygulanamadi") return hata("Öneri zaten \"Uygulanamadı\" olarak kapatılmış.");
      const neden = alan(req, "uygulanamadi_nedeni");
      if (!neden) return hata("Neden uygulanamadığını yazın.");
      await C.updateRecord("oneri", no, { uygulama_durumu: "uygulanamadi", uygulanamadi_nedeni: neden, ...iz, ...gorevKaldir });
      flash(req, "success", `${no} "Uygulanamadı" olarak kapatıldı (onay puanı korunur)${gorevNotu}`);
    } else if (islem === "yeniden_ac") {
      if (oneri.uygulama_durumu !== "uygulanamadi") return hata("Öneri \"Uygulanamadı\" olarak kapatılmamış.");
      await C.updateRecord("oneri", no, { uygulama_durumu: null, ...iz });
      flash(req, "success", `${no} yeniden açıldı — uygulama görevi atanabilir.`);
    } else {
      return hata("Geçersiz işlem.");
    }
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
