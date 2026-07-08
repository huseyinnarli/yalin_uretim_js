// 5S rotaları: bölümler, plan, denetim, aksiyonlar, ödüller.
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const S = require("../sabitler");
const P = require("../puanlama");
const C = require("../cekirdek");
const X = require("../excel");
const { db, js } = require("../db");
const { flash, adminRequired, denetciRequired, alan, hizLimitAsildi } = require("../web");
const { xlsxGonder } = require("./genel");

function zipGonder(res, ad, ekleyici) {
  res.set("Content-Type", "application/zip");
  res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(ad)}"`);
  const arch = archiver("zip", { zlib: { level: 6 } });
  arch.pipe(res);
  ekleyici(arch);
  arch.finalize();
}

module.exports = function register(app) {
  app.get("/5s", (req, res) => {
    const bolumler = C.loadBolumler().map((b) => ({ ...b, _son: C.sonDenetim(b.id) }));
    const islenen = C.odulIslenenler();
    const sonucTur = C.besSSonSonucTur();
    const sonucSiralama = sonucTur ? C.besSTurSiralama(sonucTur) : [];
    const oncekiTurlar = [];
    for (const t of C.besSTurlar()) {
      if (t === sonucTur) continue;
      const sira = C.besSTurSiralama(t);
      if (sira.length) oncekiTurlar.push({ tarih: t, ad: C.besSTurAdi(t) || C.turAdiUret(t), siralama: sira });
    }
    const planTur = C.besSPlanTur();
    const dHesap = C.aktifDenetmen(req.session);
    const planSatirlari = planTur ? C.besSPlanSatirlari(planTur, dHesap ? dHesap.ad : null) : [];
    const planAraligi = planSatirlari.length
      ? [planSatirlari[0].baslangic, planSatirlari[0].bitis] : null;
    // Girişli denetmenin kendi satırları en üstte
    if (dHesap && planSatirlari.length) {
      planSatirlari.sort((a, b) => (a.benim === b.benim)
        ? a.bolum_ad.localeCompare(b.bolum_ad, "tr") : (a.benim ? -1 : 1));
    }
    res.render("5s_liste", {
      title: "5S", bolumler, bugun: S.bugunIso(),
      sonuc_tur: sonucTur, sonuc_siralama: sonucSiralama,
      sonuc_tur_adi: sonucTur ? C.besSTurAdi(sonucTur) : "",
      sonuc_islendi: islenen.includes(sonucTur),
      sonuc_tamam: sonucTur ? C.besSTurTamam(sonucTur) : false,
      sonuc_eksikler: sonucTur ? C.besSTurEksikler(sonucTur) : [],
      onceki_turlar: oncekiTurlar,
      plan_tur: planTur, plan_tur_adi: planTur ? C.besSTurAdi(planTur) : "",
      plan_satirlari: planSatirlari,
      denetmen_secenekleri: C.denetmenAdaylari(),
      misafirler: C.loadMisafirler(),
      plan_araligi: planAraligi,
    });
  });

  app.post("/5s/odul-isle", adminRequired, (req, res) => {
    const tarih = alan(req, "tarih");
    if (!tarih) {
      flash(req, "error", "İşlenecek tur tarihi gerekli.");
      return res.redirect("/5s");
    }
    const [ok, msg] = C.besSIsle(tarih);
    flash(req, ok ? "success" : "error", ok ? "5S ödülleri eklendi — " + msg : "İşlenemedi — " + msg);
    res.redirect("/5s");
  });

  app.post("/5s/bolum/ekle", adminRequired, (req, res) => {
    const ad = alan(req, "ad");
    if (ad) {
      db.prepare("INSERT INTO bolumler(id, ad, sorumlu, kisiler) VALUES(?,?,?,'[]')")
        .run(C.uid(), ad, alan(req, "sorumlu"));
      flash(req, "success", `Bölüm eklendi: ${ad}`);
    }
    res.redirect("/5s#bolumler");
  });

  app.post("/5s/bolum/sil", adminRequired, (req, res) => {
    const bid = req.body.id || "";
    // Bölümün denetim fotoğraflarını diskten temizle
    for (const d of C.loadDenetimler()) {
      if (d.bolum_id === bid) {
        for (const fn of C.denetimFotolari(d)) {
          try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    db.prepare("DELETE FROM bolumler WHERE id = ?").run(bid);
    db.prepare("DELETE FROM denetimler WHERE bolum_id = ?").run(bid);
    flash(req, "success", "Bölüm silindi.");
    res.redirect("/5s#bolumler");
  });

  app.post("/5s/denetim-turu", adminRequired, (req, res) => {
    const baslangic = alan(req, "baslangic");
    const bitis = alan(req, "bitis") || baslangic;
    let turAdi = baslangic ? C.turAdiUret(baslangic) : "";
    if (!baslangic) {
      flash(req, "error", "Denetim başlangıç tarihi gerekli.");
      return res.redirect("/5s#plan");
    }
    const bolumler = C.loadBolumler();
    if (!bolumler.length) {
      flash(req, "error", "Önce bölüm ekleyin.");
      return res.redirect("/5s#plan");
    }
    // Aynı başlangıç tarihiyle ikinci tur açılamaz (turlar tarihle ayırt edilir)
    if (db.prepare("SELECT 1 FROM denetimler WHERE tarih = ? LIMIT 1").get(baslangic)) {
      flash(req, "error", `${C.trdate(baslangic)} başlangıç tarihinde zaten bir denetim turu var. ` +
        "Farklı bir başlangıç tarihi seçin ya da mevcut turu/denetimleri silin.");
      return res.redirect("/5s#plan");
    }
    // Aynı AY içinde başka tur(lar) varsa ada sıra eki
    const ayniAy = new Set(db.prepare("SELECT DISTINCT tarih FROM denetimler WHERE substr(tarih,1,7) = ?")
      .all(baslangic.slice(0, 7)).map((r) => r.tarih));
    if (ayniAy.size) turAdi = `${turAdi} ${ayniAy.size + 1}`;
    const now = S.zamanTr();
    const ins = db.prepare(`INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis,
      plan_gun, plan_saat, planlanan_denetmen, misafir_denetmen, denetmen, puan, checked,
      uygunsuz, notu, aciklamalar, durum, kayit_zamani)
      VALUES(?,?,?,?,?,?,'','','','','',NULL,'[]','[]','','{}','bekliyor',?)`);
    for (const b of bolumler) ins.run(C.uid(), b.id, baslangic, turAdi, baslangic, bitis, now);
    flash(req, "success", `${turAdi ? turAdi + " — " : ""}${baslangic} – ${bitis} denetim planı oluşturuldu.`);
    res.redirect("/5s#plan");
  });

  app.post("/5s/plan/kaydet", adminRequired, (req, res) => {
    const did = req.body.denetim_id || "";
    const d = C.denetimById(did);
    if (d) {
      // Yalnızca formda gelen alanlar güncellenir
      const f = {};
      for (const k of ["planlanan_denetmen", "misafir_denetmen", "plan_gun", "plan_saat"]) {
        if (k in req.body) f[k] = String(req.body[k] || "").trim();
      }
      if (Object.keys(f).length) {
        const set = Object.keys(f).map((k) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE denetimler SET ${set} WHERE id = ?`).run(...Object.values(f), did);
      }
    }
    flash(req, "success", "Denetim planı güncellendi.");
    res.redirect("/5s#plan");
  });

  // Toplu denetmen dağıtımı: kendi / çapraz (+ misafirler dengeli rastgele)
  app.post("/5s/plan/dagit", adminRequired, (req, res) => {
    const mod = req.body.mod || "";
    const tarih = req.body.tarih || "";
    const bekleyenler = C.loadDenetimler().filter((d) => d.tarih === tarih && d.puan === null);
    if (!bekleyenler.length) {
      flash(req, "error", "Atanacak bekleyen denetim yok.");
      return res.redirect("/5s#plan");
    }
    const bolumMap = Object.fromEntries(C.loadBolumler().map((b) => [b.id, b]));
    const guncelle = db.prepare("UPDATE denetimler SET planlanan_denetmen = ? WHERE id = ?");
    const misafirGuncelle = db.prepare("UPDATE denetimler SET misafir_denetmen = ? WHERE id = ?");

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    // Misafirleri DENGELİ rastgele dağıt (fark en fazla 1)
    function misafirleriDagit() {
      const misafirler = C.loadMisafirler().map((m) => m.ad);
      if (!misafirler.length) return false;
      const havuz = [];
      while (havuz.length < bekleyenler.length) havuz.push(...shuffle([...misafirler]));
      bekleyenler.forEach((d, i) => misafirGuncelle.run(havuz[i], d.id));
      return true;
    }

    if (mod === "kendi") {
      for (const d of bekleyenler) {
        const b = bolumMap[d.bolum_id];
        if (b && (b.sorumlu || "").trim()) guncelle.run(b.sorumlu.trim(), d.id);
      }
      const m = misafirleriDagit();
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
        guncelle.run((denetciBolum.sorumlu || "").trim(), bekleyenler[i].id);
      }
      const m = misafirleriDagit();
      flash(req, "success", "Çapraz denetim dengeli dağıtıldı — her bölüm başka bir bölümce denetlenecek, " +
        "kimse kendi bölümüne atanmadı." + (m ? " Misafir denetmenler rastgele dağıtıldı." : ""));
    } else {
      flash(req, "error", "Geçersiz dağıtım modu.");
    }
    res.redirect("/5s#plan");
  });

  // Sadece bekleyen (puanlanmamış) denetimleri sil — tamamlananlar korunur
  app.post("/5s/plan/sil", adminRequired, (req, res) => {
    const tarih = req.body.tarih || "";
    for (const d of C.loadDenetimler()) {
      if (d.tarih === tarih && d.puan === null) {
        for (const fn of C.denetimFotolari(d)) {
          try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    db.prepare("DELETE FROM denetimler WHERE tarih = ? AND puan IS NULL").run(tarih);
    flash(req, "success", "Denetim planı silindi (tamamlanan denetimler korundu).");
    res.redirect("/5s#plan");
  });

  app.get("/5s/gecmis", (req, res) => {
    res.render("5s_gecmis", { title: "5S — Geçmiş Denetimler", turlar: C.besSGecmisTurlar() });
  });

  app.get("/5s/onceki-aylar", (req, res) => {
    const [, gecmis] = C.besSArsivAylar();
    res.render("5s_onceki_aylar", { title: "5S — Denetim Listesi", gecmis });
  });

  app.get("/5s/aksiyonlar", (req, res) => {
    const acikGruplar = C.aksiyonGruplari("acik", req.session);
    const kapaliGruplar = C.aksiyonGruplari("kapali", req.session);
    res.render("5s_aksiyonlar", {
      title: "5S Aksiyonlar",
      acik_gruplar: acikGruplar, kapali_gruplar: kapaliGruplar,
      toplam_acik: acikGruplar.reduce((a, g) => a + g.toplam, 0),
      toplam_kapali: kapaliGruplar.reduce((a, g) => a + g.toplam, 0),
    });
  });

  // Aksiyonu kapat — yalnızca bölümün ekip lideri (girişli denetmen) veya yönetici
  app.post("/5s/aksiyon/:aid/kapat", (req, res) => {
    const aid = req.params.aid;
    if (hizLimitAsildi(req, "aksiyon", 40, 300)) {
      flash(req, "error", "Çok fazla işlem algılandı — birkaç dakika sonra tekrar deneyin.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const a = C.aksiyonById(aid);
    if (!a) return res.status(404).send("Aksiyon bulunamadı.");
    if (!C.aksiyonKapatabilir(a, req.session)) {
      const atanan = C.aksiyonAtanan(a);
      flash(req, "error", `Bu aksiyonu yalnızca ${atanan || "bölüm ekip lideri"} kapatabilir ` +
        "(o kişi denetmen olarak giriş yapmalı).");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const aciklama = alan(req, "aciklama");
    if (!aciklama) {
      flash(req, "error", "Aksiyonu kapatmak için açıklama zorunludur.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const fotolar = C.saveAksiyonFotolar(aid, (req.files || []).filter((f) => f.fieldname === "foto"));
    if (!fotolar.length) {
      flash(req, "error", "Aksiyonu kapatmak için en az bir fotoğraf eklemelisiniz.");
      return res.redirect("/5s/aksiyonlar#a-" + aid);
    }
    const d = C.aktifDenetmen(req.session);
    const kapatan = d ? d.ad : "Yönetici";
    db.prepare("UPDATE aksiyonlar SET durum = 'kapali', kapatma = ? WHERE id = ?")
      .run(js({ aciklama, kapatan, fotolar, kapatma_zamani: S.zamanTr() }), aid);
    flash(req, "success", "Aksiyon kapatıldı.");
    res.redirect("/5s/aksiyonlar#a-" + aid);
  });

  app.post("/5s/aksiyon/:aid/sil", adminRequired, (req, res) => {
    const a = C.aksiyonById(req.params.aid);
    if (!a) return res.status(404).send("Aksiyon bulunamadı.");
    for (const fn of C.aksiyonFotolari(a)) {
      try { fs.unlinkSync(path.join(S.BESS_AKSIYON_FOTO_DIR, fn)); } catch {}
    }
    db.prepare("DELETE FROM aksiyonlar WHERE id = ?").run(a.id);
    flash(req, "success", "Aksiyon silindi.");
    res.redirect("/5s/aksiyonlar");
  });

  app.get("/5s/aksiyon-gorsel/:filename", (req, res) => {
    const fpath = C.guvenliYol(S.BESS_AKSIYON_FOTO_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });

  app.get("/5s/aksiyonlar/excel", adminRequired, async (req, res) => {
    xlsxGonder(res, await X.generateAksiyonExcel(), "5S_Aksiyonlar.xlsx");
  });

  app.get("/5s/aksiyonlar/fotolar.zip", adminRequired, (req, res) => {
    let sayi = 0;
    const parcalar = [];
    for (const a of C.loadAksiyonlar()) {
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
  });

  app.get("/5s/bolum/:bid", (req, res) => {
    const b = C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const liderler = C.bolumLiderleri(b);
    res.render("5s_bolum", {
      title: `${b.ad} · 5S`, b, denetimler: C.bolumDenetimleri(b.id),
      lider1: liderler[0] || "", lider2: liderler[1] || "",
    });
  });

  app.post("/5s/bolum/:bid/kisi/ekle", adminRequired, (req, res) => {
    const b = C.bolumById(req.params.bid);
    const ad = alan(req, "ad");
    if (b && ad) {
      b.kisiler.push(ad);
      db.prepare("UPDATE bolumler SET kisiler = ? WHERE id = ?").run(js(b.kisiler), b.id);
    }
    res.redirect("/5s/bolum/" + req.params.bid);
  });

  app.post("/5s/bolum/:bid/kisi/sil", adminRequired, (req, res) => {
    const b = C.bolumById(req.params.bid);
    if (b) {
      const kalan = b.kisiler.filter((k) => k !== (req.body.ad || ""));
      db.prepare("UPDATE bolumler SET kisiler = ? WHERE id = ?").run(js(kalan), b.id);
    }
    res.redirect("/5s/bolum/" + req.params.bid);
  });

  // 1. ve 2. ekip liderini birleştir → "Ali / Veli"
  app.post("/5s/bolum/:bid/lider", adminRequired, (req, res) => {
    const l1 = alan(req, "lider1");
    const l2 = alan(req, "lider2");
    const yeni = (l1 || l2) ? [l1, l2].filter(Boolean).join(" / ") : alan(req, "sorumlu");
    db.prepare("UPDATE bolumler SET sorumlu = ? WHERE id = ?").run(yeni, req.params.bid);
    flash(req, "success", "Ekip lideri güncellendi.");
    res.redirect("/5s/bolum/" + req.params.bid);
  });

  // Denetim formu (GET) + kaydet (POST)
  app.get("/5s/bolum/:bid/denetim", denetciRequired, (req, res) => {
    const b = C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const bekleyen = bekleyenDenetim(b.id);
    const yetkiHata = denetmenYetkiKontrol(req, bekleyen);
    if (yetkiHata) { flash(req, "error", yetkiHata); return res.redirect("/5s#plan"); }
    const bugun = S.bugunIso();
    const denetimGunu = ((bekleyen && bekleyen.plan_gun) || "").trim() || bugun;
    res.render("5s_denetim", {
      title: `Denetim · ${b.ad}`, b, bess: P.BESS, bekleyen, bugun,
      denetim_gunu: denetimGunu, kriter_puan: P.BESS_KRITER_PUAN,
    });
  });

  function bekleyenDenetim(bid) {
    const ds = C.loadDenetimler().filter((x) => x.bolum_id === bid && x.puan === null);
    ds.sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || ""))
      .localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
    return ds[0] || null;
  }

  // Denetmen kısıtı: yönetici değilse yalnızca KENDİSİNE planlanan bölümü denetleyebilir
  function denetmenYetkiKontrol(req, bekleyen) {
    if (req.session.admin) return null;
    const dHesap = C.aktifDenetmen(req.session);
    const planlanan = ((bekleyen || {}).planlanan_denetmen || "").trim();
    if (!dHesap || !bekleyen || !C.isimListesi(planlanan).includes(dHesap.ad)) {
      return "Yalnızca size planlanan bölümün denetimini yapabilirsiniz.";
    }
    return null;
  }

  app.post("/5s/bolum/:bid/denetim", denetciRequired, (req, res) => {
    const bid = req.params.bid;
    const b = C.bolumById(bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const bekleyen = bekleyenDenetim(bid);
    const yetkiHata = denetmenYetkiKontrol(req, bekleyen);
    if (yetkiHata) { flash(req, "error", yetkiHata); return res.redirect("/5s#plan"); }

    S.ensureDirs();
    // Her kriter 0-5 arası puan
    const puanlar = {};
    let skor = 0;
    for (const k of P.BESS_TUM_KRITERLER) {
      let v = parseInt(req.body[`puan_${k}`], 10);
      if (Number.isNaN(v)) v = P.BESS_KRITER_PUAN;
      v = Math.max(0, Math.min(P.BESS_KRITER_PUAN, v));
      puanlar[k] = v;
      skor += v;
    }
    const checked = P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] === P.BESS_KRITER_PUAN);
    const uygunsuz = P.BESS_TUM_KRITERLER.filter((k) => puanlar[k] < P.BESS_KRITER_PUAN);
    const not_ = alan(req, "not");
    // Denetmen girişliyse adı OTOMATİK oturumdan (form değiştiremez)
    const dHesap = C.aktifDenetmen(req.session);
    const denetmen = dHesap ? dHesap.ad : alan(req, "denetmen");
    const aciklamalar = {};
    for (const k of P.BESS_TUM_KRITERLER) {
      const v = String(req.body[`aciklama_${k}`] || "").trim();
      if (v) aciklamalar[k] = v;
    }
    const now = S.zamanTr();
    const bugunIso = S.bugunIso();
    const did = bekleyen ? bekleyen.id : C.uid();
    const fotolar = C.saveDenetimFotolar(did, (bekleyen || {}).fotolar, req.files);
    let metaTarih, metaTur;
    if (bekleyen) {
      // Denetim tarihi: planlanan gün varsa o, yoksa bugün — kalıcı kaydedilir
      const dTarihi = (bekleyen.plan_gun || "").trim() || bugunIso;
      metaTarih = dTarihi;
      metaTur = bekleyen.tur_adi || "";
      db.prepare(`UPDATE denetimler SET puan = ?, puanlar = ?, checked = ?, uygunsuz = ?,
        notu = ?, denetmen = ?, aciklamalar = ?, fotolar = ?, denetim_tarihi = ?,
        durum = 'yapildi', kayit_zamani = ? WHERE id = ?`)
        .run(skor, js(puanlar), js(checked), js(uygunsuz), not_, denetmen,
          js(aciklamalar), js(fotolar), dTarihi, now, did);
    } else {
      const tarih = alan(req, "tarih") || bugunIso;
      metaTarih = tarih;
      metaTur = "";
      db.prepare(`INSERT INTO denetimler(id, bolum_id, tarih, tur_adi, baslangic, bitis,
        plan_gun, plan_saat, planlanan_denetmen, misafir_denetmen, denetmen,
        puan, puanlar, checked, uygunsuz, notu, aciklamalar, fotolar,
        durum, denetim_tarihi, kayit_zamani)
        VALUES(?,?,?,'','','','','','','',?,?,?,?,?,?,?,?,'yapildi',?,?)`)
        .run(did, bid, tarih, denetmen, skor, js(puanlar), js(checked), js(uygunsuz),
          not_, js(aciklamalar), js(fotolar), tarih, now);
    }
    const eklenenAksiyon = C.syncDenetimAksiyonlari(did, {
      tarih: metaTarih, tur_adi: metaTur, bolum_id: bid, bolum_ad: b.ad,
    }, req.body);
    let mesaj = `${b.ad} denetimi kaydedildi — Skor: ${skor}/100`;
    if (eklenenAksiyon) mesaj += ` · ${eklenenAksiyon} aksiyon atandı`;
    flash(req, "success", mesaj);
    res.redirect("/5s#plan");
  });

  app.get("/5s/denetim/:did", (req, res) => {
    const d = C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const b = C.bolumById(d.bolum_id);
    const aksiyonMap = {};
    for (const a of C.loadAksiyonlar()) {
      if (a.denetim_id === d.id) (aksiyonMap[a.kriter_k] = aksiyonMap[a.kriter_k] || []).push(a);
    }
    const geri = req.query.geri || (b ? "/5s/bolum/" + b.id : "/5s");
    res.render("5s_denetim_goster", {
      title: `Denetim Formu · ${b ? b.ad : ""}`, d, b, bess: P.BESS,
      kriter_puan: P.BESS_KRITER_PUAN, gosterilen_tarih: C.denetimTarihi(d),
      aksiyon_map: aksiyonMap, geri, kriter_puanlari: C.denetimKriterPuanlari(d),
    });
  });

  // Denetimi sil — işlenmiş ödül turundaysa bölümün 5S ödül kaydı da geri alınır
  app.post("/5s/denetim/:did/sil", adminRequired, (req, res) => {
    const d = C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const { tarih, bolum_id } = d;
    for (const fn of C.denetimFotolari(d)) {
      try { fs.unlinkSync(path.join(S.BESS_FOTO_DIR, fn)); } catch {}
    }
    db.prepare("DELETE FROM denetimler WHERE id = ?").run(d.id);
    // Denetime ait aksiyonlar (ve kapatma fotoğrafları)
    for (const a of C.loadAksiyonlar()) {
      if (a.denetim_id === d.id) {
        for (const fn of C.aksiyonFotolari(a)) {
          try { fs.unlinkSync(path.join(S.BESS_AKSIYON_FOTO_DIR, fn)); } catch {}
        }
      }
    }
    db.prepare("DELETE FROM aksiyonlar WHERE denetim_id = ?").run(d.id);
    // İşlenmiş ödül turuysa bu bölümün ödül kaydını geri al
    const silinen = db.prepare("DELETE FROM odul_kayitlari WHERE tarih = ? AND bolum_id = ?")
      .run(tarih, bolum_id);
    const kalanVar = db.prepare("SELECT 1 FROM odul_kayitlari WHERE tarih = ? LIMIT 1").get(tarih);
    if (!kalanVar) db.prepare("DELETE FROM odul_islenen WHERE tarih = ?").run(tarih);
    flash(req, "success", silinen.changes
      ? "Denetim silindi ve dağıtılan 5S ödül puanı geri alındı." : "Denetim silindi.");
    res.redirect(req.body.geri || "/5s");
  });

  app.get("/5s/gorsel/:filename", (req, res) => {
    const fpath = C.guvenliYol(S.BESS_FOTO_DIR, req.params.filename);
    if (!fpath || !fs.existsSync(fpath)) return res.status(404).send("Görsel yok.");
    res.sendFile(fpath);
  });

  app.get("/5s/denetim/:did/fotolar.zip", adminRequired, (req, res) => {
    const d = C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    if (!C.denetimFotolari(d).length) {
      flash(req, "error", "Bu denetimde indirilecek foto yok.");
      return res.redirect("/5s/denetim/" + d.id);
    }
    const b = C.bolumById(d.bolum_id);
    const ad = `${b ? b.ad : "denetim"}_${d.tarih || ""}_fotolar.zip`;
    zipGonder(res, ad, (arch) => {
      for (const [k, fl] of Object.entries(d.fotolar || {})) {
        for (const fn of fl) {
          const fp = path.join(S.BESS_FOTO_DIR, fn);
          if (fs.existsSync(fp)) arch.file(fp, { name: `${k.toUpperCase()}/${fn}` });
        }
      }
    });
  });

  app.get("/5s/denetim-excel", adminRequired, async (req, res) => {
    xlsxGonder(res, await X.generate5sExcel(), "5s_denetimler.xlsx");
  });

  app.get("/5s/denetim/:did/excel", adminRequired, async (req, res) => {
    const d = C.denetimById(req.params.did);
    if (!d) return res.status(404).send("Denetim bulunamadı.");
    const b = C.bolumById(d.bolum_id);
    const dosya = `${(b ? b.ad : "denetim")}_${d.tarih || ""}.xlsx`.replace(/ /g, "_");
    xlsxGonder(res, await X.generate5sFormExcel(d, b), dosya);
  });
};
