// Panel istatistikleri: dönem tablosu (öneri/kaizen ayrı) + son 12 ay gelen / puan alan trendi.
const S = require("../sabitler");
const { combinedRecords } = require("./kayitlar");

function puanVar(r) {
  return r.puan !== null && r.puan !== undefined && r.puan !== "";
}

function sayDurum(records) {
  const d = { toplam: 0, onay: 0, puanli: 0, red: 0, bekle: 0, revize: 0 };
  for (const r of records) {
    d.toplam += 1;
    const du = r.durum || S.VARSAYILAN_DURUM;
    if (du === "Onaylandı") {
      d.onay += 1;
      if (puanVar(r)) d.puanli += 1;
    } else if (du === "Reddedildi") d.red += 1;
    else if (du === "Düzeltme İsteniyor") d.revize += 1;
    else d.bekle += 1;
  }
  return d;
}

const _KISA_AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

async function dashboardIstatistik() {
  const recs = await combinedRecords();
  const now = S.nowTr();
  const p = (n) => String(n).padStart(2, "0");
  const buAy = `${now.getFullYear()}-${p(now.getMonth() + 1)}`;
  const buYil = String(now.getFullYear());
  const c6 = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  const cutoff6 = `${c6.getFullYear()}-${p(c6.getMonth() + 1)}-${p(c6.getDate())}`;

  const donem = (k, ad, f) => {
    const rs = recs.filter(f);
    return { k, ad, oneri: sayDurum(rs.filter((r) => r.tip === "oneri")),
      kaizen: sayDurum(rs.filter((r) => r.tip === "kaizen")), toplam: sayDurum(rs) };
  };
  const donemler = [
    donem("ay", "Bu Ay", (r) => r.sort_date.startsWith(buAy)),
    donem("6ay", "Son 6 Ay", (r) => r.sort_date && r.sort_date >= cutoff6),
    donem("yil", "Bu Yıl", (r) => r.sort_date.startsWith(buYil)),
    donem("tum", "Tüm Zamanlar", () => true),
  ];

  // Son 12 ay (bu ay dahil): o ay gelenler ve bunlardan onaylanıp puan alanlar
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ay = `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
    const rs = recs.filter((r) => r.sort_date.startsWith(ay));
    const puanli = (tip) => rs.filter((r) => r.tip === tip && r.durum === "Onaylandı" && puanVar(r)).length;
    trend.push({
      ay, etiket: `${_KISA_AY[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      gelen_oneri: rs.filter((r) => r.tip === "oneri").length,
      gelen_kaizen: rs.filter((r) => r.tip === "kaizen").length,
      puanli_oneri: puanli("oneri"), puanli_kaizen: puanli("kaizen"),
    });
  }
  return { donemler, tum: donemler[3], trend };
}

module.exports = {
  dashboardIstatistik,
};
