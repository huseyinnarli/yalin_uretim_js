// Puan durumu: öneri / kaizen puanları (kayda onaylandığı günün kural sürümüyle — src/puanKurallari.js) +
// 5S ödül defteri; isimler birleşik anahtarla gruplanır; verilen ödüller net puandan düşülür.
const S = require("../sabitler");
const PK = require("../puanKurallari");
const { sorgu, oneriRow, kaizenRow, odulKayitRow } = require("../db");
const { puanKurallari, odulAyarlari } = require("./ayarlar");
const { isimCozucu, gorunenAd } = require("./isimler");

// secenek.surumler / secenek.esik verilirse kayıtlı ayarlar yerine onlar kullanılır (ayar önizlemesi)
async function puanDurumu(secenek = {}) {
  const surumler = secenek.surumler || await puanKurallari();
  const esik = secenek.esik || (await odulAyarlari()).esik;
  const bugun = S.bugunIso();
  const kuralBul = (r) => PK.kuralSec(surumler, PK.kuralTarihi(r, bugun));
  const kokBul = await isimCozucu();
  const tablo = new Map(); // kök anahtar -> satır

  function satir(ad) {
    ad = (ad || "").trim();
    const kok = ad ? kokBul(ad) : "";
    if (!kok) return null;
    if (!tablo.has(kok)) {
      tablo.set(kok, { anahtar: kok, _yazim: new Map(), oneri: 0, kaizen: 0, bes_s: 0, detay: [] });
    }
    const s = tablo.get(kok);
    s._yazim.set(ad, (s._yazim.get(ad) || 0) + 1);
    return s;
  }
  function puanEkle(ad, alan, tip, etiket, puan, no = "") {
    if (!(puan > 0)) return;
    const s = satir(ad);
    if (!s) return;
    s[alan] += puan;
    s.detay.push({ tip, etiket, no, puan: Math.round(puan * 100) / 100 });
  }

  for (const r of (await sorgu("SELECT * FROM oneriler WHERE puan IS NOT NULL OR durum = 'Onaylandı'")).map(oneriRow)) {
    const kural = kuralBul(r);
    const etiket = (r.konu || "Öneri") + (kural.oneri_mod === "sabit" ? " (sabit)" : "");
    puanEkle(r.sahibi, "oneri", "oneri", etiket, PK.oneriKazanci(r, kural), r.no);
  }
  for (const r of (await sorgu("SELECT * FROM kaizenler WHERE puan IS NOT NULL")).map(kaizenRow)) {
    const { lider, uye } = PK.kaizenKazanci(r, kuralBul(r));
    puanEkle(r.lider, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Lider)", lider, r.no);
    for (const u of (r.uyeler || []).slice(0, 2)) {
      puanEkle(u, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Üye)", uye, r.no);
    }
  }
  for (const k of (await sorgu("SELECT * FROM odul_kayitlari")).map(odulKayitRow)) {
    const etiket = `${k.tur_adi || "5S Denetim"} — ${k.bolum_ad || ""} (${k.sira ?? "?"}.)`;
    for (const ad of k.kisiler || []) puanEkle(ad, "bes_s", "5s", etiket, k.puan || 0, k.tarih || "");
  }

  // Verilen ödüller: her kayıtta o gün düşülen puan saklıdır (eşik sonradan değişse de aynı kalır)
  const harcanan = new Map(), odulAdet = new Map();
  for (const r of await sorgu("SELECT * FROM odul_arsiv")) {
    const kok = kokBul(r.ad);
    harcanan.set(kok, (harcanan.get(kok) || 0) + (Number(r.puan) || esik));
    odulAdet.set(kok, (odulAdet.get(kok) || 0) + 1);
  }
  const silinen = new Set((await sorgu("SELECT ad FROM silinen_kisiler")).map((r) => kokBul(r.ad)));

  const sonuc = [];
  for (const k of tablo.values()) {
    if (silinen.has(k.anahtar)) continue;
    k.ad = gorunenAd(k.anahtar, k._yazim);
    k.yazimlar = [...k._yazim.keys()];
    delete k._yazim;
    k.oneri = Math.round(k.oneri * 100) / 100;
    k.kaizen = Math.round(k.kaizen * 100) / 100;
    k.kazanilan = Math.round((k.oneri + k.kaizen + k.bes_s) * 100) / 100;
    k.harcanan = harcanan.get(k.anahtar) || 0;
    k.odul_sayisi = odulAdet.get(k.anahtar) || 0;
    k.net = Math.round((k.kazanilan - k.harcanan) * 100) / 100;
    if (k.net > 0) sonuc.push(k); // net 0 ise listeden çıkar
  }
  sonuc.sort((a, b) => b.net - a.net);
  return sonuc;
}

module.exports = {
  puanDurumu,
};
