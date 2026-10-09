// 5S rotaları: bölümler, plan, denetim, aksiyonlar, ödüller.
const fs = require("fs");
const path = require("path");
const S = require("../sabitler");
const P = require("../puanlama");
const C = require("../cekirdek");
const X = require("../excel");
const { sorgu, tek, calistir, transaction, js, aksiyonRow } = require("../db");
const I = require("../isim");
const {
  sar, flash, xlsxGonder, zipGonder, yetkiGerek, denetciRequired, alan, kisiOku, guvenliYol, hizLimitAsildi, dosyaYukleyici,
} = require("../web");

// Bölümdeki benzersiz kişi sayısı (ekip liderleri + üyeler; aynı isim bir kez sayılır)
function bolumPersonelSayisi(b) {
  const set = new Set([...C.bolumLiderleri(b), ...(b.kisiler || [])].map(I.isimAnahtar).filter(Boolean));
  return set.size;
}

// Bir denetimin form alanlarından puan/bulgu/açıklama hesapları (yeni denetim ve revize ortak)
function denetimFormuOku(req) {
  const puanlar = {};
  const bulgular = {};
  let skor = 0;
  for (const k of P.BESS_TUM_KRITERLER) {
    let b = parseInt(req.body[`bulgu_${k}`], 10);
    if (Number.isNaN(b) || b < 0) b = 0;
    bulgular[k] = b;
    const v = P.bessKriterPuanla(k, b);
    puanlar[k] = v;
    skor += v;
  }
  const aciklamalar = {};
  for (const k of P.BESS_TUM_KRITERLER) {
    const v = String(req.body[`aciklama_${k}`] || "").trim();
    if (v) aciklamalar[k] = v;
  }
  return {
    puanlar, bulgular, skor, aciklamalar, not_: alan(req, "not"),
    checked: P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] === P.BESS_KRITER_MAX[k]),
    uygunsuz: P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] < P.BESS_KRITER_MAX[k]),
  };
}

module.exports = function register(app) {
  app.get("/5s", sar(async (req, res) => {
    // Bölüm listesi: son denetim + personel sayısı + açık aksiyon sayısı
    const acikAks = {};
    for (const a of await sorgu("SELECT bolum_id FROM aksiyonlar WHERE durum = 'acik'")) {
      acikAks[a.bolum_id] = (acikAks[a.bolum_id] || 0) + 1;
    }
    const kontrolAyi = S.bugunIso().slice(0, 7);
    const kontrol = await C.kontrolOzet(kontrolAyi);
    const bolumler = [];
    for (const b of await C.loadBolumler()) {
      bolumler.push({ ...b, _son: await C.sonDenetim(b.id), _personel: bolumPersonelSayisi(b),
        _acik_aksiyon: acikAks[b.id] || 0, _kontrol: kontrol.ozet[b.id] || null });
    }
    const islenen = await C.odulIslenenler();
    const sonucTur = await C.besSSonSonucTur();
    const ctx = {
      denetimler: await C.loadDenetimler(),
      bolumlar: await C.bolumMap(),
      aksiyonSay: await C.aksiyonSayilari(),
    };
    const sonucSiralama = sonucTur ? await C.besSTurSiralama(sonucTur, ctx) : [];
    const oncekiTurlar = [];
    for (const t of await C.besSTurlar()) {
      if (t === sonucTur) continue;
      const sira = await C.besSTurSiralama(t, ctx);
      if (sira.length) {
        oncekiTurlar.push({ tarih: t, ad: (await C.besSTurAdi(t)) || C.turAdiUret(t), siralama: sira });
      }
    }
    const planTur = await C.besSPlanTur();
    const dHesap = await C.aktifDenetmen(req.session);
    const planSatirlari = planTur ? await C.besSPlanSatirlari(planTur, dHesap ? dHesap.ad : null) : [];
    const planAraligi = planSatirlari.length
      ? [planSatirlari[0].baslangic, planSatirlari[0].bitis] : null;
    // Girişli denetmenin kendi satırları en üstte
    if (dHesap && planSatirlari.length) {
      planSatirlari.sort((a, b) => (a.benim === b.benim)
        ? a.bolum_ad.localeCompare(b.bolum_ad, "tr") : (a.benim ? -1 : 1));
    }
    res.render("5s_liste", {
      title: "5S", bolumler, bugun: S.bugunIso(), kontrol_gecen: kontrol.gecen, kontrol_ay: kontrolAyi,
      sonuc_tur: sonucTur, sonuc_siralama: sonucSiralama,
      sonuc_tur_adi: sonucTur ? await C.besSTurAdi(sonucTur) : "",
      sonuc_islendi: islenen.includes(sonucTur),
      sonuc_tamam: sonucTur ? await C.besSTurTamam(sonucTur, ctx.denetimler) : false,
      sonuc_eksikler: sonucTur ? await C.besSTurEksikler(sonucTur, ctx) : [],
      onceki_turlar: oncekiTurlar,
      plan_tur: planTur, plan_tur_adi: planTur ? await C.besSTurAdi(planTur) : "",
      plan_satirlari: planSatirlari,
      denetmen_secenekleri: await C.denetmenAdaylari(),
      misafirler: await C.loadMisafirler(),
      plan_araligi: planAraligi,
      bes_odul: (await C.odulAyarlari()).bes,
    });
  }));

  app.post("/5s/odul-isle", yetkiGerek("bes_odul"), sar(async (req, res) => {
    const tarih = alan(req, "tarih");
    if (!tarih) {
      flash(req, "error", "İşlenecek tur tarihi gerekli.");
      return res.redirect("/5s");
    }
    const [ok, msg] = await C.besSIsle(tarih);
    flash(req, ok ? "success" : "error", ok ? "5S ödülleri eklendi — " + msg : "İşlenemedi — " + msg);
    res.redirect("/5s");
  }));

  app.post("/5s/bolum/ekle", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const ad = alan(req, "ad");
    if (ad) {
      await calistir("INSERT INTO bolumler(id, ad, sorumlu, kisiler) VALUES(?,?,?,'[]')",
        [C.uid(), ad, kisiOku(req, "sorumlu").tam]);
      flash(req, "success", `Bölüm eklendi: ${ad}`);
    }
    res.redirect("/5s#bolumler");
  }));

  app.post("/5s/bolum/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const bid = req.body.id || "";
    // Bölümün denetim fotoğraflarını diskten temizle
    for (const d of await C.loadDenetimler()) {
      if (d.bolum_id === bid) {
        for (const fn of C.denetimFotolari(d)) {
          try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    await transaction(async (conn) => {
      await calistir("DELETE FROM bolumler WHERE id = ?", [bid], conn);
      await calistir("DELETE FROM denetimler WHERE bolum_id = ?", [bid], conn);
    });
    flash(req, "success", "Bölüm silindi.");
    res.redirect("/5s#bolumler");
  }));

  app.post("/5s/denetim-turu", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const baslangic = alan(req, "baslangic");
    const bitis = alan(req, "bitis") || baslangic;
    let turAdi = baslangic ? C.turAdiUret(baslangic) : "";
    if (!baslangic) {
      flash(req, "error", "Denetim başlangıç tarihi gerekli.");
      return res.redirect("/5s#plan");
    }
    const bolumler = await C.loadBolumler();
    if (!bolumler.length) {
      flash(req, "error", "Önce bölüm ekleyin.");
      return res.redirect("/5s#plan");
    }
    // Aynı başlangıç tarihiyle ikinci tur açılamaz (turlar tarihle ayırt edilir)
    if (await tek("SELECT 1 FROM denetimler WHERE tarih = ? LIMIT 1", [baslangic])) {
      flash(req, "error", `${C.trdate(baslangic)} başlangıç tarihinde zaten bir denetim turu var. ` +
        "Farklı bir başlangıç tarihi seçin ya da mevcut turu/denetimleri silin.");
      return res.redirect("/5s#plan");
    }
    // Aynı AY içinde başka tur(lar) varsa ada sıra eki
    const ayniAy = await sorgu(
      "SELECT DISTINCT tarih FROM denetimler WHERE SUBSTRING(tarih, 1, 7) = ?", [baslangic.slice(0, 7)]);
    if (ayniAy.length) turAdi = `${turAdi} ${ayniAy.length + 1}`;
    const now = S.zamanTr();
    await transaction(async (conn) => {
      for (const b of bolumler) {
        await calistir(
          `INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis,
             plan_gun, plan_saat, planlanan_denetmen, misafir_denetmen, denetmen, puan, checked,
             uygunsuz, notu, aciklamalar, durum, kayit_zamani)
           VALUES(?,?,?,?,?,?,'','','','','',NULL,'[]','[]','','{}','bekliyor',?)`,
          [C.uid(), b.id, baslangic, turAdi, baslangic, bitis, now], conn);
      }
    });
    flash(req, "success", `${turAdi ? turAdi + " — " : ""}${baslangic} – ${bitis} denetim planı oluşturuldu.`);
    res.redirect("/5s#plan");
  }));

  app.post("/5s/plan/kaydet", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const did = req.body.denetim_id || "";
    const d = await C.denetimById(did);
    if (d) {
      // Yalnızca formda gelen alanlar güncellenir
      const f = {};
      for (const k of ["planlanan_denetmen", "misafir_denetmen", "plan_gun", "plan_saat"]) {
        if (k in req.body) f[k] = String(req.body[k] || "").trim();
      }
      if (Object.keys(f).length) {
        const set = Object.keys(f).map((k) => `${k} = ?`).join(", ");
        await calistir(`UPDATE denetimler SET ${set} WHERE id = ?`, [...Object.values(f), did]);
      }
    }
    flash(req, "success", "Denetim planı güncellendi.");
    res.redirect("/5s#plan");
  }));

  // Toplu denetmen dağıtımı: kendi / çapraz (+ misafirler dengeli rastgele)
  app.post("/5s/plan/dagit", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const mod = req.body.mod || "";
    const tarih = req.body.tarih || "";
    const bekleyenler = (await C.loadDenetimler()).filter((d) => d.tarih === tarih && d.puan === null);
    if (!bekleyenler.length) {
      flash(req, "error", "Atanacak bekleyen denetim yok.");
      return res.redirect("/5s#plan");
    }
    const bolumMap = await C.bolumMap();

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    // Misafirleri DENGELİ rastgele dağıt (fark en fazla 1)
    async function misafirleriDagit() {
      const misafirler = (await C.loadMisafirler()).map((m) => m.ad);
      if (!misafirler.length) return false;
      const havuz = [];
      while (havuz.length < bekleyenler.length) havuz.push(...shuffle([...misafirler]));
      for (let i = 0; i < bekleyenler.length; i++) {
        await calistir("UPDATE denetimler SET misafir_denetmen = ? WHERE id = ?",
          [havuz[i], bekleyenler[i].id]);
      }
      return true;
    }

    if (mod === "kendi") {
      for (const d of bekleyenler) {
        const b = bolumMap[d.bolum_id];
        if (b && (b.sorumlu || "").trim()) {
          await calistir("UPDATE denetimler SET planlanan_denetmen = ? WHERE id = ?",
            [b.sorumlu.trim(), d.id]);
        }
      }
      const m = await misafirleriDagit();
      flash(req, "success", "Herkes kendi bölümüne denetmen olarak atandı."
        + (m ? " Misafir denetmenler rastgele dağıtıldı." : ""));
    } else if (mod === "capraz") {
      // DENGELİ bölüm-bazlı çapraz: her bölüm başka BİR bölümce denetlenir,
      // kimse kendi/ortak-lider olduğu bölüme denk gelmez.
      const liderset = (d) => new Set(C.isimListesi((bolumMap[d.bolum_id] || {}).sorumlu));
      if (bekleyenler.filter((d) => liderset(d).size).length < 2) {
        flash(req, "error", "Çapraz dağıtım için ekip lideri tanımlı en az 2 bölüm gerekir.");
        return res.redirect("/5s#plan");
      }
      const n = bekleyenler.length;
      let atama = null;
      for (let deneme = 0; deneme < 500; deneme++) {
        const idx = shuffle([...Array(n).keys()]);
        let ok = true;
        for (let i = 0; i < n; i++) {
          const denetci = liderset(bekleyenler[idx[i]]);
          const kendi = liderset(bekleyenler[i]);
          if (!denetci.size || [...denetci].some((x) => kendi.has(x))) { ok = false; break; }
        }
        if (ok) { atama = idx; break; }
      }
      if (!atama) {
        flash(req, "error", "Çapraz dağıtım kurulamadı — bölümlerin lider çeşitliliği yetersiz " +
          "(çok bölüm aynı liderde olabilir).");
        return res.redirect("/5s#plan");
      }
      for (let i = 0; i < n; i++) {
        const denetciBolum = bolumMap[bekleyenler[atama[i]].bolum_id] || {};
        await calistir("UPDATE denetimler SET planlanan_denetmen = ? WHERE id = ?",
          [(denetciBolum.sorumlu || "").trim(), bekleyenler[i].id]);
      }
      const m = await misafirleriDagit();
      flash(req, "success", "Çapraz denetim dengeli dağıtıldı — her bölüm başka bir bölümce denetlenecek, " +
        "kimse kendi bölümüne atanmadı." + (m ? " Misafir denetmenler rastgele dağıtıldı." : ""));
    } else {
      flash(req, "error", "Geçersiz dağıtım modu.");
    }
    res.redirect("/5s#plan");
  }));

  // Sadece bekleyen (puanlanmamış) denetimleri sil — tamamlananlar korunur
  app.post("/5s/plan/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const tarih = req.body.tarih || "";
    for (const d of await C.loadDenetimler()) {
      if (d.tarih === tarih && d.puan === null) {
        for (const fn of C.denetimFotolari(d)) {
          try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    await calistir("DELETE FROM denetimler WHERE tarih = ? AND puan IS NULL", [tarih]);
    flash(req, "success", "Denetim planı silindi (tamamlanan denetimler korundu).");
    res.redirect("/5s#plan");
  }));

  app.get("/5s/gecmis", sar(async (req, res) => {
    res.render("5s_gecmis", { title: "5S — Geçmiş Denetimler", turlar: await C.besSGecmisTurlar() });
  }));

  app.get("/5s/onceki-aylar", sar(async (req, res) => {
    const [, gecmis] = await C.besSArsivAylar();
    res.render("5s_onceki_aylar", { title: "5S — Denetim Listesi", gecmis });
  }));

  app.get("/5s/aksiyonlar", sar(async (req, res) => {
    const acikGruplar = await C.aksiyonGruplari("acik", req.session);
    const kapaliGruplar = await C.aksiyonGruplari("kapali", req.session);
    res.render("5s_aksiyonlar", {
      title: "5S Aksiyonlar",
      acik_gruplar: acikGruplar, kapali_gruplar: kapaliGruplar,
      toplam_acik: acikGruplar.reduce((a, g) => a + g.toplam, 0),
      toplam_kapali: kapaliGruplar.reduce((a, g) => a + g.toplam, 0),
    });
  }));

  // Aksiyonu kapat — yalnızca bölümün ekip lideri (girişli denetmen) veya yönetici
  app.post("/5s/aksiyon/:aid/kapat", ...dosyaYukleyici(5), sar(async (req, res) => {
    const aid = req.params.aid;
    if (hizLimitAsildi(req, "aksiyon", 40, 300)) {
      flash(req, "error", "Çok fazla işlem algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const a = await C.aksiyonById(aid);
    if (!a) return res.status(404).send("Aksiyon bulunamadı.");
    if (!(await C.aksiyonKapatabilir(a, req.session))) {
      const atanan = await C.aksiyonAtanan(a);
      flash(req, "error", `Bu aksiyonu yalnızca ${atanan || "bölüm ekip lideri"} kapatabilir ` +
        "(o kişi denetmen olarak giriş yapmalı).");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const aciklama = alan(req, "aciklama");
    if (!aciklama) {
      flash(req, "error", "Aksiyonu kapatmak için açıklama zorunludur.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const fotolar = await C.saveAksiyonFotolar(aid, (req.files || []).filter((f) => f.fieldname === "foto"));
    if (!fotolar.length) {
      flash(req, "error", "Aksiyonu kapatmak için en az bir fotoğraf eklemelisiniz.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const d = await C.aktifDenetmen(req.session);
    const kapatan = d ? d.ad : "Yönetici";
    await calistir("UPDATE aksiyonlar SET durum = 'kapali', kapatma = ? WHERE id = ?",
      [js({ aciklama, kapatan, fotolar, kapatma_zamani: S.zamanTr() }), aid]);
    flash(req, "success", "Aksiyon kapatıldı.");
    res.redirect("/5s/aksiyonlar#a-" + aid);
  }));

  app.post("/5s/aksiyon/:aid/sil", yetkiGerek("bes_aksiyon"), sar(async (req, res) => {
    const a = await C.aksiyonById(req.params.aid);
    if (!a) return res.status(404).send("Aksiyon bulunamadı.");
    for (const fn of C.aksiyonFotolari(a)) {
      try { fs.unlinkSync(path.join(S.BESS_AKSIYON_FOTO_DIR, fn)); } catch {}
    }
    await calistir("DELETE FROM aksiyonlar WHERE id = ?", [a.id]);
    flash(req, "success", "Aksiyon silindi.");
    res.redirect("/5s/aksiyonlar");
  }));

  app.get("/5s/aksiyon-gorsel/:filename", (req, res) => {
    const fpath = C.guvenliYol(S.BESS_AKSIYON_FOTO_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });

  app.get("/5s/aksiyonlar/excel", yetkiGerek("bes_aksiyon"), sar(async (req, res) => {
    xlsxGonder(res, await X.generateAksiyonExcel(), "5S_Aksiyonlar.xlsx");
  }));

  app.get("/5s/aksiyonlar/fotolar.zip", yetkiGerek("bes_aksiyon"), sar(async (req, res) => {
    let sayi = 0;
    const parcalar = [];
    for (const a of await C.loadAksiyonlar()) {
      for (const fn of C.aksiyonFotolari(a)) {
        const fp = path.join(S.BESS_AKSIYON_FOTO_DIR, fn);
        if (fs.existsSync(fp)) {
          parcalar.push([fp, `${C.safeName(`${a.bolum_ad || "bolum"}_${a.kriter_k || ""}`)}/${fn}`]);
          sayi++;
        }
      }
    }
    if (!sayi) {
      flash(req, "error", "İndirilecek aksiyon fotoğrafı yok.");
      return res.redirect("/5s/aksiyonlar");
    }
    zipGonder(res, "5S_Aksiyon_Fotograflari.zip", (arch) => {
      for (const [fp, ad] of parcalar) arch.file(fp, { name: ad });
    });
  }));

  app.get("/5s/bolum/:bid", sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const liderler = C.bolumLiderleri(b);
    const denetimler = await C.bolumDenetimleri(b.id);
    // Trend: tamamlanan denetimler eskiden yeniye; toplam skor + S1–S5 kırılımı
    const trend = denetimler.filter((d) => d.puan !== null).map((d) => ({
      id: d.id, tarih: C.denetimTarihi(d), tur_adi: d.tur_adi || "", puan: d.puan,
      s: P.bessBolumToplamlari(C.denetimKriterPuanlari(d)),
    })).sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
    const acikAksiyon = (await sorgu(
      "SELECT COUNT(*) AS n FROM aksiyonlar WHERE bolum_id = ? AND durum = 'acik'", [b.id]))[0].n;
    res.render("5s_bolum", {
      title: `${b.ad} · 5S`, b, denetimler, trend, bess: P.BESS,
      acik_aksiyon: Number(acikAksiyon), personel_sayisi: bolumPersonelSayisi(b),
      lider1: liderler[0] || "", lider2: liderler[1] || "",
    });
  }));

  app.post("/5s/bolum/:bid/kisi/ekle", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    const k = kisiOku(req, "kisi");
    const ad = k.tam;
    if (b && k.eksik) flash(req, "error", "Kişinin adını ve soyadını yazın.");
    else if (b && b.kisiler.some((x) => I.isimEsit(x, ad))) flash(req, "error", `${ad} zaten bu bölümde.`);
    else if (b && ad) {
      b.kisiler.push(ad);
      await calistir("UPDATE bolumler SET kisiler = ? WHERE id = ?", [js(b.kisiler), b.id]);
    }
    res.redirect("/5s/bolum/" + req.params.bid);
  }));

  app.post("/5s/bolum/:bid/kisi/sil", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (b) {
      const kalan = b.kisiler.filter((k) => k !== (req.body.ad || ""));
      await calistir("UPDATE bolumler SET kisiler = ? WHERE id = ?", [js(kalan), b.id]);
    }
    res.redirect("/5s/bolum/" + req.params.bid);
  }));

  // 1. ve 2. ekip liderini birleştir → "Ali / Veli"
  app.post("/5s/bolum/:bid/lider", yetkiGerek("bes_plan"), sar(async (req, res) => {
    const l1 = kisiOku(req, "lider1").tam;
    const l2 = kisiOku(req, "lider2").tam;
    const yeni = (l1 || l2) ? [l1, l2].filter(Boolean).join(" / ") : kisiOku(req, "sorumlu").tam;
    await calistir("UPDATE bolumler SET sorumlu = ? WHERE id = ?", [yeni, req.params.bid]);
    flash(req, "success", "Ekip lideri güncellendi.");
    res.redirect("/5s/bolum/" + req.params.bid);
  }));

  async function bekleyenDenetim(bid) {
    const ds = (await C.loadDenetimler()).filter((x) => x.bolum_id === bid && x.puan === null);
    ds.sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || ""))
      .localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
    return ds[0] || null;
  }

  // Denetmen kısıtı: 5S yetkili yönetici her bölümü denetleyebilir; değilse (denetmen)
  // yalnızca KENDİSİNE planlanan bölümü denetleyebilir.
  async function denetmenYetkiKontrol(req, bekleyen) {
    if ((req.yetkiler || []).includes("bes_denetim")) return null;
    const dHesap = req.denetmen;
    const planlanan = ((bekleyen || {}).planlanan_denetmen || "").trim();
    if (!dHesap || !bekleyen || !I.isimIcerir(planlanan, dHesap.ad)) {
      return "Yalnızca size planlanan bölümün denetimini yapabilirsiniz.";
    }
    return null;
  }

  // Denetim formu (GET) + kaydet (POST)
  app.get("/5s/bolum/:bid/denetim", denetciRequired, sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const bekleyen = await bekleyenDenetim(b.id);
    const yetkiHata = await denetmenYetkiKontrol(req, bekleyen);
    if (yetkiHata) { flash(req, "error", yetkiHata); return res.redirect("/5s#plan"); }
    const bugun = S.bugunIso();
    const denetimGunu = ((bekleyen && bekleyen.plan_gun) || "").trim() || bugun;
    res.render("5s_denetim", {
      title: `Denetim · ${b.ad}`, b, bess: P.BESS, bekleyen, bugun,
      denetim_gunu: denetimGunu, kural_metni: P.bessKuralMetni,
    });
  }));

  // Sınır = form üzerindeki dosya kutusu sayısı (soru × 3) — tarayıcı BOŞ dosya
  // kutularını da multipart parçası olarak gönderir ve multer bunları da sayar.
  // Giriş/yetki kontrolü dosya yüklemesinden ÖNCE (girişsiz istek belleğe dosya alamaz)
  app.post("/5s/bolum/:bid/denetim", denetciRequired, ...dosyaYukleyici(3 * P.BESS_TUM_KRITERLER.length),
    sar(async (req, res) => {
    const bid = req.params.bid;
    const b = await C.bolumById(bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const bekleyen = await bekleyenDenetim(bid);
    const yetkiHata = await denetmenYetkiKontrol(req, bekleyen);
    if (yetkiHata) { flash(req, "error", yetkiHata); return res.redirect("/5s#plan"); }

    S.ensureDirs();
    // Denetmen bulgu sayısı (veya Evet/Hayır) girer; puan form kurallarından hesaplanır
    // (ör. "her bulgu −3 puan; 5+ bulguda tamamı gider") — bkz. puanlama.js
    const { puanlar, bulgular, skor, aciklamalar, not_, checked, uygunsuz } = denetimFormuOku(req);
    // Denetmen girişliyse adı OTOMATİK oturumdan (form değiştiremez)
    const dHesap = req.denetmen;
    const denetmen = dHesap ? dHesap.ad : alan(req, "denetmen");
    const now = S.zamanTr();
    const bugunIso = S.bugunIso();
    const did = bekleyen ? bekleyen.id : C.uid();
    const fotolar = await C.saveDenetimFotolar(did, (bekleyen || {}).fotolar, req.files);
    let metaTarih, metaTur;
    if (bekleyen) {
      // Denetim tarihi: planlanan gün varsa o, yoksa bugün — kalıcı kaydedilir
      const dTarihi = (bekleyen.plan_gun || "").trim() || bugunIso;
      metaTarih = dTarihi;
      metaTur = bekleyen.tur_adi || "";
      await calistir(
        `UPDATE denetimler SET puan = ?, puanlar = ?, bulgular = ?, checked = ?, uygunsuz = ?,
           notu = ?, denetmen = ?, aciklamalar = ?, fotolar = ?, denetim_tarihi = ?,
           durum = 'yapildi', kayit_zamani = ? WHERE id = ?`,
        [skor, js(puanlar), js(bulgular), js(checked), js(uygunsuz), not_, denetmen,
          js(aciklamalar), js(fotolar), dTarihi, now, did]);
    } else {
      const tarih = alan(req, "tarih") || bugunIso;
      metaTarih = tarih;
      metaTur = "";
      await calistir(
        `INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis,
           plan_gun, plan_saat, planlanan_denetmen, misafir_denetmen, denetmen,
           puan, puanlar, bulgular, checked, uygunsuz, notu, aciklamalar, fotolar,
           durum, denetim_tarihi, kayit_zamani)
         VALUES(?,?,?,'','','','','','','',?,?,?,?,?,?,?,?,?,'yapildi',?,?)`,
        [did, bid, tarih, denetmen, skor, js(puanlar), js(bulgular), js(checked), js(uygunsuz),
          not_, js(aciklamalar), js(fotolar), tarih, now]);
    }
    const eklenenAksiyon = await C.syncDenetimAksiyonlari(did, {
      tarih: metaTarih, tur_adi: metaTur, bolum_id: bid, bolum_ad: b.ad,
    }, req.body);
    let mesaj = `${b.ad} denetimi kaydedildi — Skor: ${skor}/100`;
    if (eklenenAksiyon) mesaj += ` · ${eklenenAksiyon} aksiyon atandı`;
    flash(req, "success", mesaj);
    res.redirect("/5s#plan");
  }));

  app.get("/5s/denetim/:did", sar(async (req, res) => {
    const d = await C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const b = await C.bolumById(d.bolum_id);
    const aksiyonMap = {};
    for (const a of (await sorgu("SELECT * FROM aksiyonlar WHERE denetim_id = ?", [d.id])).map(aksiyonRow)) {
      (aksiyonMap[a.kriter_k] = aksiyonMap[a.kriter_k] || []).push(a);
    }
    const geri = guvenliYol(req.query.geri, b ? "/5s/bolum/" + b.id : "/5s");
    res.render("5s_denetim_goster", {
      title: `Denetim Formu · ${b ? b.ad : ""}`, d, b, bess: P.BESS,
      tur_islendi: await C.turIslendi(d.tarih),
      s_toplam: P.bessBolumToplamlari(C.denetimKriterPuanlari(d)),
      kriter_puan: P.BESS_KRITER_PUAN, gosterilen_tarih: C.denetimTarihi(d),
      aksiyon_map: aksiyonMap, geri, kriter_puanlari: C.denetimKriterPuanlari(d),
    });
  }));

  // ----- Denetim revize: yapılmış denetimin düzeltilmesi ('bes_revize' yetkisi) -----
  // Ödülleri işlenmiş turdaki denetim revize edilemez (dağıtılmış puanlar değişmesin).
  async function revizeHedefi(req, res) {
    const d = await C.denetimById(req.params.did);
    if (!d || d.puan === null) { res.status(404).send("Tamamlanmış denetim bulunamadı."); return null; }
    if (await C.turIslendi(d.tarih)) {
      flash(req, "error", "Bu turun 5S ödülleri işlenmiş — denetim revize edilemez.");
      res.redirect("/5s/denetim/" + d.id);
      return null;
    }
    return d;
  }

  app.get("/5s/denetim/:did/revize", yetkiGerek("bes_revize"), sar(async (req, res) => {
    const d = await revizeHedefi(req, res);
    if (!d) return;
    const b = await C.bolumById(d.bolum_id);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    // Ön-doldurma: kayıtlı bulgu sayıları (eski kayıtlarda puandan tahmin)
    const kp = C.denetimKriterPuanlari(d);
    const bulgular = {};
    for (const k of P.BESS_TUM_KRITERLER) {
      const v = (d.bulgular || {})[k];
      bulgular[k] = (v !== undefined && v !== null) ? v : P.bessBulguTahmin(k, kp[k]);
    }
    const acikAks = {};
    for (const a of await sorgu("SELECT kriter_k FROM aksiyonlar WHERE denetim_id = ? AND durum = 'acik'", [d.id])) {
      acikAks[a.kriter_k] = (acikAks[a.kriter_k] || 0) + 1;
    }
    res.render("5s_denetim", {
      title: `Denetim Revize · ${b.ad}`, b, bess: P.BESS, bekleyen: d, bugun: S.bugunIso(),
      denetim_gunu: C.denetimTarihi(d) || S.bugunIso(), kural_metni: P.bessKuralMetni,
      revize: { d, bulgular, acik_aksiyon: acikAks },
    });
  }));

  app.post("/5s/denetim/:did/revize", yetkiGerek("bes_revize"),
    ...dosyaYukleyici(3 * P.BESS_TUM_KRITERLER.length), sar(async (req, res) => {
    const d = await revizeHedefi(req, res);
    if (!d) return;
    const b = await C.bolumById(d.bolum_id);
    S.ensureDirs();
    const f = denetimFormuOku(req);
    // Silinmek üzere işaretlenen fotoğraflar (yalnızca bu denetime ait olanlar)
    let silinecek = req.body.foto_sil || [];
    if (!Array.isArray(silinecek)) silinecek = [silinecek];
    const mevcutTum = new Set(C.denetimFotolari(d));
    silinecek = silinecek.filter((fn) => mevcutTum.has(fn));
    const kalan = {};
    for (const [k, fl] of Object.entries(d.fotolar || {})) {
      const l = fl.filter((fn) => !silinecek.includes(fn));
      if (l.length) kalan[k] = l;
    }
    const fotolar = await C.saveDenetimFotolar(d.id, kalan, req.files);
    const eskiPuan = d.puan;
    const kim = req.yetkiBilgi.ana ? "Ana Yönetici" : (req.yetkiBilgi.ad || "Yönetici");
    await calistir(
      `UPDATE denetimler SET puan = ?, puanlar = ?, bulgular = ?, checked = ?, uygunsuz = ?,
         notu = ?, aciklamalar = ?, fotolar = ?, revize_eden = ?, revize_zamani = ? WHERE id = ?`,
      [f.skor, js(f.puanlar), js(f.bulgular), js(f.checked), js(f.uygunsuz), f.not_,
        js(f.aciklamalar), js(fotolar), kim, S.zamanTr(), d.id]);
    for (const fn of silinecek) {
      try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
    }
    const eklenen = await C.syncDenetimAksiyonlari(d.id, {
      tarih: C.denetimTarihi(d), tur_adi: d.tur_adi || "", bolum_id: d.bolum_id, bolum_ad: b ? b.ad : "",
    }, req.body);
    flash(req, "success", `${b ? b.ad : ""} denetimi revize edildi — Skor: ${eskiPuan} → ${f.skor}` +
      (eklenen ? ` · ${eklenen} aksiyon eklendi` : ""));
    res.redirect("/5s/denetim/" + d.id);
  }));

  // Denetimi sil — işlenmiş ödül turundaysa bölümün 5S ödül kaydı da geri alınır
  app.post("/5s/denetim/:did/sil", yetkiGerek("bes_revize"), sar(async (req, res) => {
    const d = await C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const { tarih, bolum_id } = d;
    for (const fn of C.denetimFotolari(d)) {
      try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
    }
    // Aksiyon kapatma fotoğraflarını diskten temizle
    for (const a of await C.loadAksiyonlar()) {
      if (a.denetim_id === d.id) {
        for (const fn of C.aksiyonFotolari(a)) {
          try { fs.unlinkSync(path.join(S.BESS_AKSIYON_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    let odulGeriAlindi = false;
    await transaction(async (conn) => {
      await calistir("DELETE FROM denetimler WHERE id = ?", [d.id], conn);
      await calistir("DELETE FROM aksiyonlar WHERE denetim_id = ?", [d.id], conn);
      // İşlenmiş ödül turuysa bu bölümün ödül kaydını geri al
      const silinen = await calistir(
        "DELETE FROM odul_kayitlari WHERE tarih = ? AND bolum_id = ?", [tarih, bolum_id], conn);
      odulGeriAlindi = silinen.affectedRows > 0;
      const kalanVar = await tek(
        "SELECT 1 FROM odul_kayitlari WHERE tarih = ? LIMIT 1", [tarih], conn);
      if (!kalanVar) await calistir("DELETE FROM odul_islenen WHERE tarih = ?", [tarih], conn);
    });
    flash(req, "success", odulGeriAlindi
      ? "Denetim silindi ve dağıtılan 5S ödül puanı geri alındı." : "Denetim silindi.");
    res.redirect(guvenliYol(req.body.geri, "/5s"));
  }));

  app.get("/5s/gorsel/:filename", (req, res) => {
    const fpath = C.guvenliYol(S.BESS_FOTO_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });

  app.get("/5s/denetim/:did/fotolar.zip", yetkiGerek("bes_odul"), sar(async (req, res) => {
    const d = await C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    if (!C.denetimFotolari(d).length) {
      flash(req, "error", "Bu denetimde indirilecek foto yok.");
      return res.redirect("/5s/denetim/" + d.id);
    }
    const b = await C.bolumById(d.bolum_id);
    const ad = `${b ? b.ad : "denetim"}_${d.tarih || ""}_fotolar.zip`;
    zipGonder(res, ad, (arch) => {
      for (const [k, fl] of Object.entries(d.fotolar || {})) {
        for (const fn of fl) {
          const fp = path.join(S.BESS_FOTO_DIR, fn);
          if (fs.existsSync(fp)) arch.file(fp, { name: `${k.toUpperCase()}/${fn}` });
        }
      }
    });
  }));

  app.get("/5s/denetim-excel", yetkiGerek("bes_odul"), sar(async (req, res) => {
    xlsxGonder(res, await X.generate5sExcel(), "5s_denetimler.xlsx");
  }));

  app.get("/5s/denetim/:did/excel", yetkiGerek("bes_odul"), sar(async (req, res) => {
    const d = await C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const b = await C.bolumById(d.bolum_id);
    const dosya = `${(b ? b.ad : "denetim")}_${d.tarih || ""}.xlsx`.replace(/ /g, "_");
    xlsxGonder(res, await X.generate5sFormExcel(d, b), dosya);
  }));
};
