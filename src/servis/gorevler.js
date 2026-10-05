// Düzeltme (revize) ve görev atamaları: denetmenin Görevlerim sayfası, yönetici takip listesi, menü rozeti.
const I = require("../isim");
const { sorgu, tek, oneriRow, kaizenRow, aksiyonRow } = require("../db");
const { bolumMap } = require("./bes");
const { bugunkuKontroller } = require("./kontrolFormu");
const { aksiyonAtanan } = require("./aksiyon");

async function _revizeKayitlari(sart, params) {
  const out = [];
  for (const [tablo, row] of [["oneriler", oneriRow], ["kaizenler", kaizenRow]]) {
    for (const r of (await sorgu(`SELECT * FROM ${tablo} WHERE durum = 'Düzeltme İsteniyor'${sart}`, params)).map(row)) {
      out.push(r);
    }
  }
  return out.sort((a, b) => String(b.revize_zamani || "").localeCompare(String(a.revize_zamani || "")));
}

// Denetmenin "Görevlerim" sayfası
async function gorevlerim(denetmen) {
  const id = denetmen.id;
  const revizeler = await _revizeKayitlari(" AND revize_atanan_id = ?", [id]);
  const gorevler = (await sorgu(
    "SELECT * FROM oneriler WHERE gorev_atanan_id = ? ORDER BY gorev_zamani DESC", [id])).map(oneriRow);
  const bolumlar = await bolumMap();
  const denetimler = [];
  for (const d of await sorgu("SELECT * FROM denetimler WHERE puan IS NULL ORDER BY tarih DESC")) {
    if (I.isimIcerir(d.planlanan_denetmen, denetmen.ad)) {
      const b = bolumlar[d.bolum_id];
      denetimler.push({ ...d, bolum_ad: b ? b.ad : "?" });
    }
  }
  const aksiyonlar = [];
  for (const a of (await sorgu("SELECT * FROM aksiyonlar WHERE durum = 'acik'")).map(aksiyonRow)) {
    if (I.isimIcerir(await aksiyonAtanan(a, bolumlar), denetmen.ad)) aksiyonlar.push(a);
  }
  return {
    revizeler,
    kontroller: await bugunkuKontroller(denetmen),
    acikGorevler: gorevler.filter((g) => !g.kaizen_no),
    biten: gorevler.filter((g) => g.kaizen_no).slice(0, 10),
    denetimler, aksiyonlar,
  };
}

// Yönetici takip listesi: açık düzeltme ve görev atamaları (kimde ne var)
async function acikAtamalar() {
  const revizeler = await _revizeKayitlari("", []);
  const gorevler = (await sorgu(
    "SELECT * FROM oneriler WHERE gorev_atanan_id IS NOT NULL AND gorev_atanan_id != '' " +
    "AND (kaizen_no IS NULL OR kaizen_no = '') ORDER BY gorev_zamani DESC")).map(oneriRow);
  return { revizeler, gorevler };
}

// Üst menü rozeti: denetmene atanmış bekleyen düzeltme + kaizene dönüştürme görevi sayısı
async function gorevSayisi(denetmenId) {
  const r = await tek(
    "SELECT (SELECT COUNT(*) FROM oneriler WHERE durum = 'Düzeltme İsteniyor' AND revize_atanan_id = ?)" +
    " + (SELECT COUNT(*) FROM kaizenler WHERE durum = 'Düzeltme İsteniyor' AND revize_atanan_id = ?)" +
    " + (SELECT COUNT(*) FROM oneriler WHERE gorev_atanan_id = ? AND (kaizen_no IS NULL OR kaizen_no = ''))" +
    " AS n", [denetmenId, denetmenId, denetmenId]);
  return r ? Number(r.n) : 0;
}

module.exports = {
  gorevlerim, acikAtamalar, gorevSayisi,
};
