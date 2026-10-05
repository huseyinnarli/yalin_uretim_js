// Puan durumu: öneri %10, kaizen lider %50 / üye %25 + 5S ödül defteri; isimler birleşik anahtarla gruplanır.
const S = require("../sabitler");
const { sorgu, oneriRow, kaizenRow, odulKayitRow } = require("../db");
const { isimCozucu, gorunenAd } = require("./isimler");

async function puanDurumu() {
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

  for (const r of (await sorgu("SELECT * FROM oneriler WHERE puan IS NOT NULL")).map(oneriRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    puanEkle(r.sahibi, "oneri", "oneri", r.konu || "Öneri", Math.round(p * 10) / 100, r.no);
  }
  for (const r of (await sorgu("SELECT * FROM kaizenler WHERE puan IS NOT NULL")).map(kaizenRow)) {
    const p = parseFloat(r.puan);
    if (!p) continue;
    puanEkle(r.lider, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Lider)", Math.round(p * 50) / 100, r.no);
    for (const u of (r.uyeler || []).slice(0, 2)) {
      puanEkle(u, "kaizen", "kaizen", (r.konu || "Kaizen") + " (Üye)", Math.round(p * 25) / 100, r.no);
    }
  }
  for (const k of (await sorgu("SELECT * FROM odul_kayitlari")).map(odulKayitRow)) {
    const etiket = `${k.tur_adi || "5S Denetim"} — ${k.bolum_ad || ""} (${k.sira ?? "?"}.)`;
    for (const ad of k.kisiler || []) puanEkle(ad, "bes_s", "5s", etiket, k.puan || 0, k.tarih || "");
  }

  const harcanan = new Map();
  for (const r of await sorgu("SELECT * FROM odul_arsiv")) {
    const kok = kokBul(r.ad);
    harcanan.set(kok, (harcanan.get(kok) || 0) + (r.puan || S.ODUL_ESIK));
  }
  const silinen = new Set((await sorgu("SELECT ad FROM silinen_kisiler")).map((r) => kokBul(r.ad)));

  const sonuc = [];
  for (const k of tablo.values()) {
    if (silinen.has(k.anahtar)) continue;
    k.ad = gorunenAd(k.anahtar, k._yazim);
    k.yazimlar = [...k._yazim.keys()];
    delete k._yazim;
    k.kazanilan = Math.round((k.oneri + k.kaizen + k.bes_s) * 100) / 100;
    k.harcanan = harcanan.get(k.anahtar) || 0;
    k.odul_sayisi = Math.floor(k.harcanan / S.ODUL_ESIK);
    k.net = Math.round((k.kazanilan - k.harcanan) * 100) / 100;
    if (k.net > 0) sonuc.push(k); // net 0 ise listeden çıkar
  }
  sonuc.sort((a, b) => b.net - a.net);
  return sonuc;
}

module.exports = {
  puanDurumu,
};
