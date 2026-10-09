// Puan ve Ödül Ayarları (yalnız ana yönetici):
//  - ödül eşiği ve 5S tur ödülleri (hemen geçerli),
//  - öneri değerlendirme modu (puanlama tablosu / onaylanınca sabit puan) ve öneri-kaizen oranları
//    (bugünden itibaren onaylananlara ya da geriye dönük tüm kayıtlara),
//  - kaydetmeden önce mevcut veride etki önizlemesi ve kural geçmişi.
// Kuralların hesabı: src/puanKurallari.js · saklama: src/servis/ayarlar.js
const S = require("../sabitler");
const PK = require("../puanKurallari");
const C = require("../cekirdek");
const { sar, flash, anaYoneticiRequired } = require("../web");

const YOL = "/yonetici/puan-ayarlari";
const yuvarla = (x) => Math.round(x * 100) / 100;

// Önce / sonra puan listelerinden etki özeti: toplamlar, eşiği geçen kişi, olası ödül, değişen kişiler
function etkiOzeti(once, sonra, esikOnce, esikSonra) {
  const top = (l, k) => yuvarla(l.reduce((t, x) => t + (x[k] || 0), 0));
  const ozet = (l, esik) => ({
    oneri: top(l, "oneri"), kaizen: top(l, "kaizen"), bes: top(l, "bes_s"), kazanilan: top(l, "kazanilan"),
    esigi_gecen: l.filter((k) => k.net >= esik).length,
    olasi_odul: l.reduce((t, k) => t + Math.floor(Math.max(0, k.net) / esik), 0),
  });
  const onceMap = new Map(once.map((k) => [k.anahtar, k]));
  const sonraMap = new Map(sonra.map((k) => [k.anahtar, k]));
  const degisen = [];
  for (const a of new Set([...onceMap.keys(), ...sonraMap.keys()])) {
    const o = onceMap.get(a), s = sonraMap.get(a);
    const netO = o ? o.net : 0, netS = s ? s.net : 0;
    const gecO = netO >= esikOnce, gecS = netS >= esikSonra;
    if (Math.abs(netS - netO) < 0.005 && gecO === gecS) continue;
    degisen.push({ ad: (s || o).ad, once: netO, sonra: netS, fark: yuvarla(netS - netO), gecO, gecS });
  }
  degisen.sort((x, y) => Math.abs(y.fark) - Math.abs(x.fark) || x.ad.localeCompare(y.ad, "tr"));
  return { once: ozet(once, esikOnce), sonra: ozet(sonra, esikSonra), degisen: degisen.slice(0, 30), degisen_sayisi: degisen.length };
}

function formOku(body) {
  const k = PK.kuralDogrula(body || {});
  const o = PK.odulDogrula(body || {});
  return { kural: k.kural, odul: o.odul, geriyeDonuk: (body || {}).uygulama === "geri", hatalar: [...o.hatalar, ...k.hatalar] };
}

module.exports = function register(app) {
  async function sayfa(res, { form = null, onizleme = null, hatalar = [] } = {}) {
    const surumler = await C.puanKurallari();
    const odul = await C.odulAyarlari();
    const guncel = PK.kuralSec(surumler, S.bugunIso());
    res.render("puan_ayarlari", {
      title: "Puan ve Ödül Ayarları",
      surumler, odul, guncel, onizleme, hatalar,
      form: form || { kural: guncel, odul, geriyeDonuk: false },
      kural_metni: PK.kuralMetni, baslangic: PK.BASLANGIC,
    });
  }

  app.get(YOL, anaYoneticiRequired, sar(async (req, res) => sayfa(res)));

  // islem=onizle → kaydetmeden etkiyi göster · islem=kaydet → değişen kısımları kaydet
  app.post(YOL, anaYoneticiRequired, sar(async (req, res) => {
    const f = formOku(req.body);
    if (f.hatalar.length) return sayfa(res, { form: f, hatalar: f.hatalar });
    const surumler = await C.puanKurallari();
    const odulMevcut = await C.odulAyarlari();
    const guncel = PK.kuralSec(surumler, S.bugunIso());
    // Değerler aynı olsa da "geriye dönük" seçimi birden çok sürümü teke indirir → bu da bir değişikliktir
    const kuralDegisti = !PK.kuralAyni(f.kural, guncel) || (f.geriyeDonuk && surumler.length > 1);
    const esikDegisti = f.odul.esik !== odulMevcut.esik;
    const besDegisti = f.odul.bes.some((v, i) => v !== odulMevcut.bes[i]);

    if (req.body.islem === "onizle") {
      const yeni = kuralDegisti
        ? PK.yeniSurumler(surumler, f.kural, { geriyeDonuk: f.geriyeDonuk, bugun: S.bugunIso() }) : surumler;
      const once = await C.puanDurumu();
      const sonra = await C.puanDurumu({ surumler: yeni, esik: f.odul.esik });
      return sayfa(res, {
        form: f,
        onizleme: { ...etkiOzeti(once, sonra, odulMevcut.esik, f.odul.esik),
          kuralDegisti, esikDegisti, besDegisti, geriyeDonuk: f.geriyeDonuk, esik_once: odulMevcut.esik, esik_sonra: f.odul.esik },
      });
    }

    if (!kuralDegisti && !esikDegisti && !besDegisti) {
      flash(req, "error", "Kaydedilecek bir değişiklik yok.");
      return res.redirect(YOL);
    }
    const ozet = [];
    if (esikDegisti || besDegisti) {
      await C.odulAyarKaydet(f.odul);
      if (esikDegisti) ozet.push(`ödül eşiği ${odulMevcut.esik} → ${f.odul.esik}`);
      if (besDegisti) ozet.push(`5S tur ödülleri ${odulMevcut.bes.join("/")} → ${f.odul.bes.join("/")}`);
    }
    if (kuralDegisti) {
      await C.puanKuralKaydet(f.kural, { geriyeDonuk: f.geriyeDonuk, kim: "Ana Yönetici" });
      ozet.push(`${PK.kuralMetni(f.kural)} (${f.geriyeDonuk ? "tüm kayıtlara, geriye dönük" : "bugünden itibaren onaylananlara"})`);
    }
    flash(req, "success", "Puan ayarları güncellendi: " + ozet.join(" · "));
    res.redirect(YOL);
  }));

  // Bir kural sürümünü kaldır (o dönemin kayıtlarına bir önceki sürüm uygulanır; temel sürüm kaldırılamaz)
  app.post(YOL + "/surum-sil", anaYoneticiRequired, sar(async (req, res) => {
    const g = String(req.body.gecerlilik || "");
    if (await C.puanKuralSil(g)) {
      flash(req, "success", `${C.trdate(g)} tarihli puan kuralı sürümü kaldırıldı — o tarihten sonra onaylanan kayıtlara bir önceki sürüm uygulanır.`);
    } else {
      flash(req, "error", "Bu sürüm kaldırılamaz.");
    }
    res.redirect(YOL);
  }));
};
