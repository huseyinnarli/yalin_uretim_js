// Kaizen rotaları (yeni / öneriden dönüştür / düzenle / excel / görsel).
const fs = require("fs");
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const { calistir, transaction, js } = require("../db");
const {
  sar, flash, xlsxGonder, yetkiGerek, girisRequired, alan, kisiOku, guvenliYol, hizLimitAsildi, dosyaYukleyici,
} = require("../web");

// Ekip: lider + en fazla 2 üye, her biri ayrı ad/soyad kutularından ve (görev listesi tanımlıysa) görevi ile
function ekipOku(req) {
  const lider = kisiOku(req, "lider");
  const u = [kisiOku(req, "uye1"), kisiOku(req, "uye2")];
  const ug = [alan(req, "uye1_gorevi"), alan(req, "uye2_gorevi")];
  // Boş üye kutuları atlanır; görevler üyelerle aynı sırada kalır
  const dolu = u.map((x, i) => ({ ad: x.tam, gorev: ug[i] })).filter((x) => x.ad).slice(0, 2);
  const uyeler = dolu.map((x) => x.ad);
  const sorumlular = lider.tam ? [lider.tam, ...uyeler].join(", ") : uyeler.join(", ");
  // Üye kutularından yalnızca biri (ad ya da soyad) doldurulduysa eksik sayılır
  const uyeEksik = u.some((x) => (x.ad || x.soyad) && x.eksik);
  return { lider: lider.tam, liderEksik: lider.eksik, liderGorevi: alan(req, "lider_gorevi"),
    uyeler, uyeGorevleri: dolu.map((x) => x.gorev), sorumlular, uyeEksik };
}

// Ekip görevlerini görev tanımları listesine göre doğrular; ekip.liderGorevi/uyeGorevleri listedeki yazılışa çevrilir.
// Liste boşken formda görev alanı yoktur: düzenlemede kayıttaki görevler korunur. mevcut: kaydın veritabanındaki hâli.
async function ekipGorevleriDogrula(ekip, mevcut = {}) {
  const liste = await C.gorevTanimlari();
  const mevcutUye = mevcut.uye_gorevleri || [];
  if (!liste.length) {
    ekip.liderGorevi = mevcut.lider_gorevi || "";
    ekip.uyeGorevleri = ekip.uyeler.map((_, i) => mevcutUye[i] || "");
    return null;
  }
  const lg = C.gorevSecimi(ekip.liderGorevi, liste, mevcut.lider_gorevi, { bosHata: "Kaizen liderinin görevini seçin." });
  ekip.liderGorevi = lg.gorev;
  if (lg.hata) return lg.hata;
  for (let i = 0; i < ekip.uyeler.length; i++) {
    const ug = C.gorevSecimi(ekip.uyeGorevleri[i], liste, mevcutUye[i], { bosHata: `${ekip.uyeler[i]} için görev seçin.` });
    ekip.uyeGorevleri[i] = ug.gorev;
    if (ug.hata) return ug.hata;
  }
  return null;
}

function kazanclarOku(req) {
  let v = (req.body || {}).kazanclar || [];
  if (!Array.isArray(v)) v = [v];
  return v.filter(Boolean);
}

function dosya(req, ad) {
  return (req.files || []).find((f) => f.fieldname === ad && f.originalname);
}

// Formdan gelen alanlar (hata durumunda form bu bilgilerle yeniden gösterilir)
function formKaydi(req, ekip) {
  return {
    baslangic: alan(req, "baslangic"), bitis: alan(req, "bitis"), konu: alan(req, "konu"),
    bolum: alan(req, "bolum"), lider: ekip.lider, uyeler: ekip.uyeler,
    lider_gorevi: ekip.liderGorevi, uye_gorevleri: ekip.uyeGorevleri,
    kazanclar: kazanclarOku(req), onceki: alan(req, "onceki"), sonraki: alan(req, "sonraki"),
    onceki_maliyet: alan(req, "onceki_maliyet"), sonraki_maliyet: alan(req, "sonraki_maliyet"),
    kaynak_oneri_no: alan(req, "kaynak_oneri"),
  };
}

// Maliyet hesabı (€): önceki ve sonraki durum maliyeti ZORUNLU (maliyet yoksa 0). Döner: { onceki, sonraki, hata }
function maliyetOku(req) {
  const o = C.paraOku(alan(req, "onceki_maliyet"));
  const s = C.paraOku(alan(req, "sonraki_maliyet"));
  const hata = o.hata || s.hata || (o.deger === null || s.deger === null
    ? "Önceki ve sonraki durum maliyetini (€) girin — maliyet yoksa 0 yazın." : null);
  return { onceki: o.deger, sonraki: s.deger, hata };
}

// mevcut: düzenlemede kaydın veritabanındaki hâli (listeden kalkmış eski bölüm/görevler seçenek olarak kalır)
async function formRender(res, kayit, duzenle, geri = "", mevcut = {}) {
  res.render("kaizen_form", {
    kural: await C.guncelKural(), // ekip kutularındaki "puanın %…'i" notları
    bolum_secenekleri: await C.bolumAdlari(), gorev_secenekleri: await C.gorevTanimlari(), mevcut,
    title: duzenle ? "Kaizen Düzenle" : "Yeni Kaizen", bugun: duzenle ? "" : S.bugunIso(), kayit,
    kazanc_basliklari: S.KAZANC_BASLIKLARI,
    action_url: duzenle
      ? "/kaizen/duzenle?no=" + encodeURIComponent(kayit.no) + (geri ? "&geri=" + encodeURIComponent(geri) : "")
      : "/kaizen/yeni",
    duzenle, geri,
  });
}

function ekipHatasi(ekip, req) {
  if (ekip.liderEksik) return "Kaizen liderinin adını ve soyadını ayrı kutulara yazın.";
  if (ekip.uyeEksik) return "Üyeler için ad ve soyad birlikte yazılmalıdır.";
  if (!(alan(req, "konu") && alan(req, "onceki") && alan(req, "sonraki"))) {
    return "Kaizen konusu, önceki ve sonraki durum zorunludur.";
  }
  return null;
}

module.exports = function register(app) {
  // Yeni kaizen formu herkese açık. ?oneri=NO ile onaylanmış öneriden dönüştürme
  // (öneriye görev atanan denetmen veya değerlendirme/kayıt yetkili yönetici).
  app.get("/kaizen/yeni", sar(async (req, res) => {
    const oneriNo = req.query.oneri || "";
    if (!oneriNo) return await formRender(res, {}, false);
    const oneri = req.girisli ? await C.getRecord("oneri", oneriNo) : null;
    if (!C.kaizeneDonusturebilir(oneri, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu öneri kaizene dönüştürülemez (onaylı değil, zaten dönüştürülmüş ya da görev size atanmamış).");
      return res.redirect(oneri ? "/detay?tip=oneri&no=" + encodeURIComponent(oneriNo) : "/");
    }
    await formRender(res, {
      konu: oneri.konu, onceki: oneri.detay, sonraki: oneri.cozum, bolum: oneri.bolum || "",
      lider: oneri.gorev_atanan_ad || "", kaynak_oneri_no: oneri.no,
    }, false);
  }));

  app.post("/kaizen/yeni", ...dosyaYukleyici(2), sar(async (req, res) => {
    if (hizLimitAsildi(req, "kaizen", 30, 300)) {
      flash(req, "error", "Çok fazla gönderim algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/kaizen/yeni");
    }
    S.ensureDirs();
    const ekip = ekipOku(req);
    const secim = C.bolumSecimi(alan(req, "bolum"), await C.bolumAdlari());
    const maliyet = maliyetOku(req);
    const hata = ekipHatasi(ekip, req) || maliyet.hata || secim.hata || await ekipGorevleriDogrula(ekip);
    const kayit = formKaydi(req, ekip);
    kayit.bolum = secim.bolum || kayit.bolum;
    if (hata) {
      // Form girilen bilgilerle yeniden gösterilir (seçilen fotoğrafların yeniden seçilmesi gerekir)
      res.locals.mesajlar.push(["error", hata + " Fotoğraf seçtiyseniz yeniden seçin."]);
      return await formRender(res, kayit, false);
    }
    // Öneriden dönüştürme: yetki ve durum sunucuda yeniden doğrulanır
    let oneri = null;
    if (kayit.kaynak_oneri_no) {
      oneri = req.girisli ? await C.getRecord("oneri", kayit.kaynak_oneri_no) : null;
      if (!C.kaizeneDonusturebilir(oneri, req.yetkiler, req.denetmen)) {
        flash(req, "error", "Bu öneri kaizene dönüştürülemez.");
        return res.redirect("/");
      }
    }
    const no = await C.nextNumber("kaizenler", "ÖSKFR");
    const sn = C.safeName(no);
    const gorselOnceki = (await C.kaizenKaydetGorsel(dosya(req, "onceki_gorsel"), "oncesi", sn)) || "";
    const gorselSonraki = (await C.kaizenKaydetGorsel(dosya(req, "sonraki_gorsel"), "sonrasi", sn)) || "";
    const now = S.zamanTr();
    await transaction(async (conn) => {
      await calistir(
        `INSERT INTO kaizenler(\`no\`, baslangic, bitis, konu, bolum, lider, lider_gorevi, uyeler, uye_gorevleri,
          sorumlular, kazanclar, onceki, sonraki, onceki_maliyet, sonraki_maliyet, onceki_gorsel, sonraki_gorsel,
          durum, puan, puanlama, kayit_zamani, kaynak_oneri_no)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)`,
        [no, kayit.baslangic, kayit.bitis, kayit.konu, kayit.bolum, ekip.lider, ekip.liderGorevi,
          js(ekip.uyeler), js(ekip.uyeGorevleri),
          ekip.sorumlular, js(kayit.kazanclar), kayit.onceki, kayit.sonraki, maliyet.onceki, maliyet.sonraki,
          gorselOnceki, gorselSonraki,
          S.VARSAYILAN_DURUM, now, oneri ? oneri.no : null], conn);
      if (oneri) {
        await calistir("UPDATE oneriler SET kaizen_no = ?, guncelleme_zamani = ? WHERE `no` = ?",
          [no, now, oneri.no], conn);
      }
    });
    if (oneri) {
      flash(req, "success", `${oneri.no} önerisi kaizene dönüştürüldü: ${no}`);
      return res.redirect(req.yetkiBilgi.yonetici ? "/detay?tip=kaizen&no=" + encodeURIComponent(no) : "/gorevlerim");
    }
    flash(req, "success", `Kaizen kaydedildi: ${no}` + (req.girisli ? "" : " — teşekkürler!"));
    res.redirect(req.girisli ? "/liste" : "/");
  }));

  // Düzenleme: 'kayit' yetkisi VEYA düzeltmesi bu denetmene atanmış kayıt.
  // Giriş kontrolü dosya yüklemesinden ÖNCE yapılır (girişsiz istek belleğe dosya alamaz).
  app.get("/kaizen/duzenle", girisRequired, sar(async (req, res) => {
    const rec = await C.getRecord("kaizen", req.query.no || "");
    if (!rec) return res.status(404).send("Kayıt bulunamadı.");
    if (!C.kayitDuzenleyebilir(rec, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu kaydı düzenleme yetkiniz yok.");
      return res.redirect("/detay?tip=kaizen&no=" + encodeURIComponent(rec.no));
    }
    await formRender(res, rec, true, guvenliYol(req.query.geri, ""), rec);
  }));

  app.post("/kaizen/duzenle", girisRequired, ...dosyaYukleyici(2), sar(async (req, res) => {
    const no = req.query.no || "";
    const eski = await C.getRecord("kaizen", no);
    if (!eski) return res.status(404).send("Kayıt bulunamadı.");
    if (!C.kayitDuzenleyebilir(eski, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu kaydı düzenleme yetkiniz yok.");
      return res.redirect("/detay?tip=kaizen&no=" + encodeURIComponent(no));
    }
    const geri = guvenliYol(req.query.geri, "");
    const ekip = ekipOku(req);
    const secim = C.bolumSecimi(alan(req, "bolum"), await C.bolumAdlari(), eski.bolum);
    const maliyet = maliyetOku(req);
    const hata = ekipHatasi(ekip, req) || maliyet.hata || secim.hata || await ekipGorevleriDogrula(ekip, eski);
    if (hata) {
      res.locals.mesajlar.push(["error", hata]);
      return await formRender(res, { ...eski, ...formKaydi(req, ekip), no }, true, geri, eski);
    }
    S.ensureDirs();
    const sn = C.safeName(no);
    const yeniOnceki = await C.kaizenKaydetGorsel(dosya(req, "onceki_gorsel"), "oncesi", sn);
    const yeniSonraki = await C.kaizenKaydetGorsel(dosya(req, "sonraki_gorsel"), "sonrasi", sn);
    const alanlar = {
      baslangic: alan(req, "baslangic"), bitis: alan(req, "bitis"),
      konu: alan(req, "konu"), bolum: secim.bolum,
      lider: ekip.lider, lider_gorevi: ekip.liderGorevi, uyeler: js(ekip.uyeler),
      uye_gorevleri: js(ekip.uyeGorevleri), sorumlular: ekip.sorumlular,
      kazanclar: js(kazanclarOku(req)),
      onceki: alan(req, "onceki"), sonraki: alan(req, "sonraki"),
      onceki_maliyet: maliyet.onceki, sonraki_maliyet: maliyet.sonraki,
      // Yeni görsel yüklenmediyse mevcudu koru
      onceki_gorsel: yeniOnceki || eski.onceki_gorsel || "",
      sonraki_gorsel: yeniSonraki || eski.sonraki_gorsel || "",
    };
    // Düzeltmesi atanan denetmen kaydedince kayıt yeniden değerlendirmeye döner
    const revizeTamam = eski.durum === "Düzeltme İsteniyor" && req.denetmen
      && eski.revize_atanan_id === req.denetmen.id;
    if (revizeTamam) { alanlar.durum = S.VARSAYILAN_DURUM; alanlar.revize_tamamlandi = S.zamanTr(); }
    await C.updateRecord("kaizen", no, alanlar);
    flash(req, "success", revizeTamam
      ? `${no} düzeltildi ve yeniden değerlendirmeye gönderildi.` : `Kaizen güncellendi: ${no}`);
    res.redirect(revizeTamam && !req.yetkiBilgi.yonetici ? "/gorevlerim"
      : "/detay?tip=kaizen&no=" + encodeURIComponent(no) + (geri ? "&geri=" + encodeURIComponent(geri) : ""));
  }));

  app.get("/kaizen/excel", yetkiGerek("kayit"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateKaizenExcel(), "kaizenler.xlsx");
  }));

  // Kaizen görselleri yalnızca girişli kullanıcılara (liste/detay da girişe kapalı)
  app.get("/kaizen/gorsel/:filename", girisRequired, (req, res) => {
    const fpath = C.guvenliYol(S.KAIZEN_IMG_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });
};
