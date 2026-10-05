// 5S periyodik kontrol formu rotaları: görüntüleme (herkese açık), günlük doldurma (bölümün ekip lideri
// veya "denetim yapma" yetkili yönetici), haftalık/aylık kontrol imzası ve seçilen aya kadar Excel.
// İş kuralları: src/servis/kontrolFormu.js · form tanımı + takvim: src/kontrol.js
const S = require("../sabitler");
const C = require("../cekirdek");
const X = require("../excel");
const K = require("../kontrol");
const { sar, flash, xlsxGonder, girisRequired, alan } = require("../web");

module.exports = function register(app) {
  function kontrolAyiOku(req) {
    const ay = String((req.query && req.query.ay) || (req.body && req.body.ay) || "");
    return K.ayCoz(ay) ? ay : S.bugunIso().slice(0, 7);
  }
  // Ayın işaretlenebilir son günü (bugünden ileri gün işaretlenemez)
  function kontrolSonGun(ay) {
    const bugun = S.bugunIso();
    if (bugun.slice(0, 7) === ay) return parseInt(bugun.slice(8, 10), 10);
    return ay < bugun.slice(0, 7) ? K.ayGunSayisi(ay) : 0;
  }
  function kontrolKim(req) {
    if (req.denetmen) return req.denetmen.ad;
    return req.yetkiBilgi.ana ? "Ana Yönetici" : (req.yetkiBilgi.ad || "Yönetici");
  }
  const ikiHane = (n) => String(n).padStart(2, "0");
  // Takvimden seçilen ?tarih=YYYY-AA-GG → { ay, gun }; ileri tarih bugüne çekilir.
  // Eski ?ay=&gun= bağlantıları da çalışır.
  function kontrolTarihOku(req) {
    const t = String(req.query.tarih || "");
    const m = t.match(/^(\d{4}-\d{2})-(\d{2})$/);
    if (m && K.ayCoz(m[1])) {
      const bugun = S.bugunIso();
      if (t > bugun) return { ay: bugun.slice(0, 7), gun: parseInt(bugun.slice(8, 10), 10) };
      return { ay: m[1], gun: parseInt(m[2], 10) };
    }
    return { ay: kontrolAyiOku(req), gun: parseInt(req.query.gun, 10) };
  }

  app.get("/5s/bolum/:bid/kontrol", sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const { ay, gun: istenen } = kontrolTarihOku(req);
    const sonGun = kontrolSonGun(ay);
    const gun = istenen >= 1 && istenen <= sonGun ? istenen : sonGun;
    // Excel ay seçimi: kaydı olan aylar + bu ay (+ görüntülenen ay), yeniden eskiye; ileri ay yok
    const buAy = S.bugunIso().slice(0, 7);
    const excelAylari = [...new Set([...(await C.kontrolAylari(b.id)), buAy, ay])]
      .filter((a) => a <= buAy).sort().reverse();
    res.render("5s_kontrol", {
      title: `Kontrol Formu · ${b.ad}`, b, ay, ay_etiketi: C.ayEtiketi(ay),
      onceki_ay: K.ayKaydir(ay, -1), sonraki_ay: K.ayKaydir(ay, 1),
      gun_sayisi: K.ayGunSayisi(ay), son_gun: sonGun, gun,
      tarih: sonGun > 0 ? `${ay}-${ikiHane(gun)}` : "", bugun: S.bugunIso(),
      excel_aylari: excelAylari.map((a) => ({ ay: a, etiket: C.ayEtiketi(a) })),
      excel_ay: ay <= buAy ? ay : buAy,
      form: K.KONTROL_FORMU, periyotlar: K.PERIYOTLAR, haftalar: K.haftalar(ay),
      haftaNo: (g) => K.haftaNo(ay, g), haftaGunu: (g) => K.haftaGunu(ay, g),
      ...(await C.kontrolAy(b.id, ay)),
      doldurabilir: sonGun > 0 && C.kontrolDoldurabilir(b, req.yetkiler, req.denetmen),
      imzalayabilir: C.kontrolImzalayabilir(b, req.yetkiler, req.denetmen),
    });
  }));

  app.post("/5s/bolum/:bid/kontrol", girisRequired, sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const ay = kontrolAyiOku(req);
    const gun = parseInt(req.body.gun, 10);
    const geri = `/5s/bolum/${b.id}/kontrol?` + (gun >= 1 && gun <= 31 ? `tarih=${ay}-${ikiHane(gun)}` : `ay=${ay}`);
    if (!C.kontrolDoldurabilir(b, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Bu bölümün kontrol formunu yalnızca bölümün ekip lideri (denetmen girişiyle) doldurabilir.");
      return res.redirect(geri);
    }
    if (!(gun >= 1 && gun <= kontrolSonGun(ay))) {
      flash(req, "error", "Geçersiz gün — ileri tarihli kontrol işaretlenemez.");
      return res.redirect(geri);
    }
    const isaretler = [];
    for (const m of K.KONTROL_FORMU.maddeler) {
      const durum = req.body["durum_" + m.k];
      if (durum !== "uygun" && durum !== "uygunsuz") continue;
      isaretler.push({
        madde: m.k, durum,
        aciklama: String(req.body["aciklama_" + m.k] || "").trim().slice(0, S.ALAN_MAX),
      });
    }
    if (!isaretler.length) {
      flash(req, "error", "İşaretlenmiş madde yok.");
      return res.redirect(geri);
    }
    if (isaretler.some((x) => x.durum === "uygunsuz" && !x.aciklama)) {
      flash(req, "error", "\"Uygun Değil\" işaretlenen her madde için açıklama (tespit) yazın.");
      return res.redirect(geri);
    }
    const kaydedilen = await C.kontrolKaydet(b, ay, gun, isaretler, kontrolKim(req));
    flash(req, "success", `${b.ad} — ${gun} ${C.ayEtiketi(ay)} kontrolü kaydedildi (${kaydedilen} madde).`);
    res.redirect(geri);
  }));

  app.post("/5s/bolum/:bid/kontrol/imza", girisRequired, sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const ay = kontrolAyiOku(req);
    const geri = `/5s/bolum/${b.id}/kontrol?ay=${ay}#imzalar`;
    if (!C.kontrolImzalayabilir(b, req.yetkiler, req.denetmen)) {
      flash(req, "error", "Kontrol imzasını bölümün ekip lideri dışındaki bir denetmen veya yetkili yönetici atar.");
      return res.redirect(geri);
    }
    const tip = req.body.tip === "ay" ? "ay" : "hafta";
    const sira = tip === "ay" ? 0 : parseInt(req.body.sira, 10);
    if (tip === "hafta" && !K.haftalar(ay).some((h) => h.no === sira)) return res.status(400).send("Geçersiz hafta.");
    await C.kontrolImzala(b.id, ay, tip, sira, kontrolKim(req), alan(req, "notu"));
    flash(req, "success", `${b.ad} — ${tip === "ay" ? "aylık kontrol" : sira + ". hafta kontrolü"} imzalandı.`);
    res.redirect(geri);
  }));

  // Excel: seçilen aya KADAR kaydı olan tüm aylar (her ay ayrı sayfa, kâğıt düzeninde) + özet sayfası.
  // Seçilen ayın kendisi kayıt olmasa da eklenir (boş form yazdırılabilsin).
  app.get("/5s/bolum/:bid/kontrol/excel", girisRequired, sar(async (req, res) => {
    const b = await C.bolumById(req.params.bid);
    if (!b) return res.status(404).send("Bölüm bulunamadı.");
    const ay = kontrolAyiOku(req);
    const aylar = [...(await C.kontrolAylari(b.id)).filter((a) => a < ay), ay];
    const sayfalar = [];
    for (const a of aylar) sayfalar.push({ ay: a, veri: await C.kontrolAy(b.id, a) });
    const buf = await X.generateKontrolExcel(b, sayfalar);
    const donem = aylar.length > 1 ? `${aylar[0]}_${ay}` : ay;
    xlsxGonder(res, buf, `5S_Kontrol_Formu_${b.ad}_${donem}.xlsx`.replace(/\s+/g, "_"));
  }));
};
