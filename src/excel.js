// Excel rapor üretimi (exceljs) — talep anında veritabanından üretilir.
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const S = require("./sabitler");
const P = require("./puanlama");
const C = require("./cekirdek");
const K = require("./kontrol");
const { sorgu, oneriRow, kaizenRow } = require("./db");

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5C8A" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const THIN = { style: "thin", color: { argb: "FFBBBBBB" } };
const BORDER = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const WRAP = { wrapText: true, vertical: "top", horizontal: "left" };
const CENTER = { horizontal: "center", vertical: "middle", wrapText: true };

function styleHeader(ws, ncol) {
  const row = ws.getRow(1);
  for (let c = 1; c <= ncol; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = CENTER;
    cell.border = BORDER;
  }
  row.height = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function govdeStil(ws, ncol, hizala = WRAP) {
  ws.eachRow((row, i) => {
    if (i === 1) return;
    for (let c = 1; c <= ncol; c++) {
      row.getCell(c).alignment = hizala;
      row.getCell(c).border = BORDER;
    }
  });
}

async function generateOneriExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Öneriler");
  const headers = ["Öneri No", "Form No", "Tarih", "Öneri Sahibi", "Görevi", "Konu (Kısa)",
    "Detay Açıklama", "Çözüm Önerisi", "Kaliteye Katkısı", "Verimliliğe Katkısı",
    "İSG'ye Katkısı", "Maliyete Katkısı", "Ek Açıklama", "Durum", "Puan",
    "Puan Detayı", "Kayıt Zamanı", "Red Nedeni", "Düzeltme Talebi", "Görev Atanan",
    "Görev Termini", "Dönüştürülen Kaizen"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [16, 14, 12, 22, 18, 30, 40, 40, 28, 28, 28, 28, 30, 16, 8, 50, 18, 30, 30, 20, 12, 16]
    .forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const r of (await sorgu("SELECT * FROM oneriler")).map(oneriRow)) {
    ws.addRow([r.no, r.form_no || "", r.tarih, r.sahibi, r.gorevi, r.konu, r.detay, r.cozum,
      r.kalite, r.verimlilik, r.isg, r.maliyet, r.ek,
      r.durum || S.VARSAYILAN_DURUM, r.puan ?? "",
      P.puanlamaOzet(r.puanlama), r.kayit_zamani, r.red_nedeni || "",
      r.revize_notu ? `${r.revize_notu} (${r.revize_atanan_ad || ""})` : "",
      r.gorev_atanan_ad || "", r.gorev_termin || "", r.kaizen_no || ""]);
  }
  govdeStil(ws, headers.length);
  return wb.xlsx.writeBuffer();
}

async function generateKaizenExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kaizenler");
  // Not: görsel sütunları J(10)/K(11) sabit — Form No sütunu bu yüzden EN SONA eklenir.
  const headers = ["Kaizen No", "Başlangıç", "Bitiş", "Kaizen Konusu", "Bölüm",
    "Sorumlular", "Kazançlar", "Önceki Durum", "Sonraki Durum",
    "Önceki Görsel", "Sonraki Görsel", "Durum", "Puan", "Puan Detayı", "Kayıt Zamanı", "Form No",
    "Red Nedeni", "Düzeltme Talebi", "Kaynak Öneri"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [18, 12, 12, 28, 20, 22, 30, 38, 38, 22, 22, 16, 8, 50, 18, 14, 30, 30, 16]
    .forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const r of (await sorgu("SELECT * FROM kaizenler")).map(kaizenRow)) {
    ws.addRow([r.no, r.baslangic, r.bitis, r.konu, r.bolum, r.sorumlular,
      (r.kazanclar || []).join(", "), r.onceki, r.sonraki,
      r.onceki_gorsel || "", r.sonraki_gorsel || "",
      r.durum || S.VARSAYILAN_DURUM, r.puan ?? "",
      P.puanlamaOzet(r.puanlama), r.kayit_zamani, r.form_no || "", r.red_nedeni || "",
      r.revize_notu ? `${r.revize_notu} (${r.revize_atanan_ad || ""})` : "", r.kaynak_oneri_no || ""]);
    const rowIdx = ws.rowCount;
    let hasImg = false;
    for (const [fname, col] of [[r.onceki_gorsel, 10], [r.sonraki_gorsel, 11]]) {
      if (!fname) continue;
      const fpath = path.join(S.KAIZEN_IMG_DIR, fname);
      if (!fs.existsSync(fpath)) continue;
      const ext = path.extname(fname).slice(1).toLowerCase();
      if (!["png", "jpeg", "jpg", "gif"].includes(ext)) continue;
      try {
        const imgId = wb.addImage({ filename: fpath, extension: ext === "jpg" ? "jpeg" : ext });
        ws.addImage(imgId, {
          tl: { col: col - 1, row: rowIdx - 1 },
          ext: { width: 160, height: 120 },
        });
        hasImg = true;
      } catch { /* bozuk görsel raporu düşürmesin */ }
    }
    if (hasImg) ws.getRow(rowIdx).height = 95;
  }
  govdeStil(ws, headers.length);
  return wb.xlsx.writeBuffer();
}

async function generate5sExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("5S Denetimler");
  const kritKodlar = P.BESS.flatMap((s) => s.kriterler.map((kr) => kr.k.toUpperCase()));
  const headers = ["Bölüm", "Tarih", "Skor", "Durum", ...kritKodlar, "Foto Sayısı", "Not"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [22, 12, 8, 12, ...kritKodlar.map(() => 7), 11, 40]
    .forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const bolumlar = await C.bolumMap();
  const denetimler = (await C.loadDenetimler())
    .sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || "")).localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
  for (const d of denetimler) {
    if (d.puan === null) continue;
    const b = bolumlar[d.bolum_id];
    const kp = C.denetimKriterPuanlari(d);
    const row = [b ? b.ad : "?", d.tarih || "", d.puan, "Yapıldı"];
    for (const s of P.BESS) for (const kr of s.kriterler) row.push(kp[kr.k] || 0);
    row.push(C.denetimFotolari(d).length, d.not || "");
    ws.addRow(row);
  }
  govdeStil(ws, headers.length);
  return wb.xlsx.writeBuffer();
}

async function generate5sFormExcel(d, b) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("5S Denetim");
  ws.addRow(["5S DENETİM FORMU"]).getCell(1).font = { bold: true, size: 13, color: { argb: "FF2E5C8A" } };
  ws.addRow(["Bölüm", b ? b.ad : "—"]);
  ws.addRow(["Tarih", d.tarih || ""]);
  ws.addRow(["Skor", `${d.puan ?? ""}/100`]);
  ws.addRow(["Denetmen", d.denetmen || d.planlanan_denetmen || ""]);
  ws.addRow(["Kayıt", d.kayit_zamani || ""]);
  ws.addRow([]);
  const basRow = ws.addRow(["Kategori", "Soru", "Bulgu Sayısı", "Puan", "Maks", "Açıklama / Bulgular"]);
  basRow.eachCell((c) => { c.font = HEADER_FONT; c.fill = HEADER_FILL; c.alignment = CENTER; });
  const bas = basRow.number;
  const kp = C.denetimKriterPuanlari(d);
  const aciklamalar = d.aciklamalar || {};
  const bulgular = d.bulgular || {};
  for (const s of P.BESS) {
    for (const kr of s.kriterler) {
      const bs = bulgular[kr.k];
      const bsGoster = bs === undefined || bs === null ? ""
        : (kr.kural.tip === "evet_hayir" ? (bs > 0 ? "Hayır" : "Evet") : bs);
      ws.addRow([s.ad, kr.m, bsGoster, kp[kr.k] || 0, kr.puan, aciklamalar[kr.k] || ""]);
    }
  }
  ws.addRow([]);
  ws.addRow(["Not", d.not || ""]);
  [24, 60, 12, 9, 9, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let i = bas; i <= ws.rowCount; i++) {
    ws.getRow(i).eachCell((c) => { c.alignment = WRAP; });
  }
  return wb.xlsx.writeBuffer();
}

// (5s toplu raporda kriter sütun başlıkları BESS anahtarlarından üretilir — form
// değişikliklerinde kendiliğinden uyum sağlar)

async function generateAksiyonExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aksiyonlar");
  const headers = ["Denetim", "Tarih", "Bölüm", "Kriter", "Aksiyon", "Sorumlu",
    "Termin", "Durum", "Kapatan", "Kapatma Açıklaması", "Kapatma Zamanı",
    "Fotoğraf Sayısı", "Oluşturma"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [22, 12, 22, 32, 40, 18, 12, 10, 16, 40, 16, 12, 16]
    .forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const a of await C.loadAksiyonlar()) {
    const kap = a.kapatma || {};
    ws.addRow([a.tur_adi || C.turAdiUret(a.tarih || ""), C.trdate(a.tarih || ""),
      a.bolum_ad || "", a.kriter_m || "", a.aksiyon || "", a.sorumlu || "",
      C.trdate(a.termin || ""), a.durum === "kapali" ? "Kapalı" : "Açık",
      kap.kapatan || "", kap.aciklama || "", kap.kapatma_zamani || "",
      (kap.fotolar || []).length, a.olusturma_zamani || ""]);
  }
  govdeStil(ws, headers.length);
  return wb.xlsx.writeBuffer();
}

async function generatePuanExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Puan Listesi");
  const headers = ["Sıra", "Personel", "Öneri", "Kaizen", "5S", "Kazanılan", "Net", "Ödül Sayısı"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [8, 26, 12, 12, 12, 14, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  (await C.puanDurumu()).forEach((k, i) => {
    ws.addRow([i + 1, k.ad, k.oneri, k.kaizen, k.bes_s, k.kazanilan, k.net, k.odul_sayisi]);
  });
  govdeStil(ws, headers.length, undefined);
  return wb.xlsx.writeBuffer();
}

async function generateOdulExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ödül Alanlar");
  const headers = ["Personel", "Tarih", "Düşülen Puan", "Zaman"];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  [26, 14, 14, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const r of await sorgu("SELECT * FROM odul_arsiv ORDER BY tarih DESC")) {
    ws.addRow([r.ad, r.tarih, r.puan, r.zaman]);
  }
  govdeStil(ws, headers.length, undefined);
  return wb.xlsx.writeBuffer();
}

async function generateTrendExcel() {
  const [basliklar, satirlar] = await C.besSTrendTablo();
  if (!basliklar.length) return null;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("5S Trend");
  const headers = ["Bölüm", ...basliklar.map((b) => `${b.ad} (${C.trdate(b.tarih)})`)];
  ws.addRow(headers);
  styleHeader(ws, headers.length);
  ws.getColumn(1).width = 32;
  for (let i = 2; i <= headers.length; i++) ws.getColumn(i).width = 24;
  const kirmizi = { bold: true, color: { argb: "FFC0392B" } };
  const yesil = { bold: true, color: { argb: "FF1E8449" } };
  for (const s of satirlar) {
    const hucreDegerleri = s.hucreler.map((h) => {
      if (!h) return "—";
      if (h.fark === null) return `${h.puan}`;
      const isaret = h.fark > 0 ? "+" : "";
      return `${h.puan} (${isaret}${h.fark})`;
    });
    const row = ws.addRow([s.ad, ...hucreDegerleri]);
    s.hucreler.forEach((h, i) => {
      const cell = row.getCell(i + 2);
      cell.alignment = CENTER;
      cell.border = BORDER;
      if (h && h.fark !== null && h.fark !== 0) cell.font = h.fark < 0 ? kirmizi : yesil;
    });
    row.getCell(1).border = BORDER;
  }
  return wb.xlsx.writeBuffer();
}

// T-FR016 5S ve Güvenlik Kontrol Formu — kâğıt formun düzeninde aylık tablo
async function generateKontrolExcel(b, ay, veri) {
  const F = K.KONTROL_FORMU;
  const gunSayisi = K.ayGunSayisi(ay);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("KONTROL FORMU", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
  const sonSutun = 3 + gunSayisi;
  ws.mergeCells(1, 1, 1, sonSutun - 6);
  ws.getCell(1, 1).value = F.baslik.toLocaleUpperCase("tr");
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(1, 1).alignment = CENTER;
  ws.mergeCells(1, sonSutun - 5, 1, sonSutun);
  ws.getCell(1, sonSutun - 5).value = `Doküman No: ${F.kod} · Rev: ${F.rev}`;
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, 2);
  ws.getCell(2, 1).value = `TAKIM: ${b.ad}`;
  ws.getCell(2, 3).value = `Takım lideri: ${b.sorumlu || ""}`;
  ws.mergeCells(2, sonSutun - 5, 2, sonSutun);
  ws.getCell(2, sonSutun - 5).value = `DÖNEM / AY: ${C.ayEtiketi(ay)}`;
  [2].forEach((r) => ws.getRow(r).eachCell((c) => { c.font = { bold: true }; }));

  const bas = ws.addRow(["NO", "Yapılacak İşlemler", "P", ...Array.from({ length: gunSayisi }, (_, i) => i + 1)]);
  bas.eachCell((c) => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER; c.border = BORDER; });
  const yesil = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4F6EC" } };
  const kirmizi = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCEBEA" } };
  for (const m of F.maddeler) {
    const satir = [K.PERIYOTLAR[m.p].toLocaleUpperCase("tr"), m.m, m.p];
    for (let g = 1; g <= gunSayisi; g++) {
      const r = ((veri.isaret || {})[m.k] || {})[g];
      satir.push(r ? (r.durum === "uygun" ? "✓" : "✗") : "");
    }
    const row = ws.addRow(satir);
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = BORDER;
      c.alignment = col === 2 ? WRAP : CENTER;
      if (col > 3 && c.value === "✓") c.fill = yesil;
      if (col > 3 && c.value === "✗") { c.fill = kirmizi; c.font = { bold: true, color: { argb: "FFA4322A" } }; }
    });
    row.height = 42;
  }
  const imza = ["TAKIM LİDERİ", "İMZA", ""];
  for (let g = 1; g <= gunSayisi; g++) {
    const kim = F.maddeler.map((m) => ((veri.isaret || {})[m.k] || {})[g]).filter(Boolean).map((r) => r.isaretleyen)[0];
    imza.push(kim ? kim.split(" ").map((x) => x[0]).join("") : "");
  }
  ws.addRow(imza).eachCell({ includeEmpty: true }, (c) => { c.border = BORDER; c.alignment = CENTER; c.font = { bold: true }; });
  ws.addRow(["G: GÜNLÜK    H: HAFTALIK    A: AYLIK"]);
  ws.addRow([]);
  ws.addRow(["GRUP LİDERİ KONTROLLERİ (haftalık)"]).getCell(1).font = { bold: true };
  for (const h of K.haftalar(ay)) {
    const o = (veri.onaylar || {})[`hafta-${h.no}`];
    ws.addRow([`${h.no}. hafta`, `${h.bas}–${h.son} ${C.ayEtiketi(ay)}`, "",
      o ? `${o.onaylayan} · ${o.zaman}${o.notu ? " · " + o.notu : ""}` : "—"]);
  }
  const ao = (veri.onaylar || {})["ay-0"];
  ws.addRow(["YETKİLİ BÖLÜM SORUMLUSU (aylık)", "", "", ao ? `${ao.onaylayan} · ${ao.zaman}${ao.notu ? " · " + ao.notu : ""}` : "—"])
    .getCell(1).font = { bold: true };
  ws.addRow([]);
  ws.addRow(["UYGUNSUZLUKLAR (önlem planı)"]).getCell(1).font = { bold: true };
  for (const m of F.maddeler) {
    for (const [g, r] of Object.entries((veri.isaret || {})[m.k] || {})) {
      if (r.durum === "uygunsuz") ws.addRow([`${g} ${C.ayEtiketi(ay)}`, `${m.k.toUpperCase()} — ${r.aciklama || ""}`, "", r.isaretleyen || ""]);
    }
  }
  ws.addRow([]);
  const notRow = ws.addRow(["NOT: " + F.not]);
  ws.mergeCells(notRow.number, 1, notRow.number, sonSutun);
  notRow.getCell(1).alignment = WRAP;
  notRow.height = 48;
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 60;
  ws.getColumn(3).width = 4;
  for (let c = 4; c <= sonSutun; c++) ws.getColumn(c).width = 4;
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 3 }];
  return wb.xlsx.writeBuffer();
}

module.exports = {
  generateOneriExcel, generateKaizenExcel, generate5sExcel, generate5sFormExcel,
  generateAksiyonExcel, generatePuanExcel, generateOdulExcel, generateTrendExcel, generateKontrolExcel,
};
