// 5S — bölümler, denetimler, turlar, ödül defteri, trend. (Aksiyonlar: aksiyon.js; periyodik kontrol formu: kontrolFormu.js)
const path = require("path");

const S = require("../sabitler");
const P = require("../puanlama");
const I = require("../isim");
const { sorgu, tek, calistir, transaction, js, bolumRow, denetimRow, aksiyonRow } = require("../db");
const { uid, allowedFile, gorselKaydet } = require("./yardimci");

async function loadBolumler() {
  return (await sorgu("SELECT * FROM bolumler ORDER BY ad")).map(bolumRow);
}

async function bolumById(bid) {
  return bolumRow(await tek("SELECT * FROM bolumler WHERE id = ?", [bid]));
}

// id -> bölüm haritası (döngülerde N+1 sorguyu önler)
async function bolumMap() {
  const m = {};
  for (const b of await loadBolumler()) m[b.id] = b;
  return m;
}

async function loadDenetimler() {
  return (await sorgu("SELECT * FROM denetimler")).map(denetimRow);
}

async function denetimById(did) {
  return denetimRow(await tek("SELECT * FROM denetimler WHERE id = ?", [did]));
}

async function loadAksiyonlar() {
  return (await sorgu("SELECT * FROM aksiyonlar")).map(aksiyonRow);
}

async function aksiyonById(aid) {
  return aksiyonRow(await tek("SELECT * FROM aksiyonlar WHERE id = ?", [aid]));
}

async function odulIslenenler() {
  return (await sorgu("SELECT tarih FROM odul_islenen")).map((r) => r.tarih);
}

async function bolumDenetimleri(bid) {
  const ds = (await sorgu("SELECT * FROM denetimler WHERE bolum_id = ?", [bid])).map(denetimRow);
  ds.sort((a, b) => ((b.tarih || "") + (b.kayit_zamani || ""))
    .localeCompare((a.tarih || "") + (a.kayit_zamani || "")));
  return ds;
}

async function sonDenetim(bid) {
  return (await bolumDenetimleri(bid))[0] || null;
}

// Bir denetimin kriter bazlı puanları (0-5). Eski 'checked' formatıyla uyumlu.
function denetimKriterPuanlari(d) {
  if (d.puanlar) {
    const out = {};
    for (const k of P.BESS_TUM_KRITERLER) out[k] = parseInt(d.puanlar[k], 10) || 0;
    return out;
  }
  const ch = new Set(d.checked || []);
  const out = {};
  for (const k of P.BESS_TUM_KRITERLER) out[k] = ch.has(k) ? P.BESS_KRITER_PUAN : 0;
  return out;
}

function denetimTarihi(d) {
  return d.denetim_tarihi || d.plan_gun || d.tarih || "";
}

function denetimFotolari(d) {
  const out = [];
  for (const fl of Object.values(d.fotolar || {})) out.push(...fl);
  return out;
}

function turAdiUret(tarih) {
  const [y, m] = String(tarih || "").split("-");
  const ay = S.TR_AYLAR[parseInt(m, 10) - 1];
  return ay ? `${ay} ${y} Denetimi` : "Denetim";
}

async function besSTurAdi(tarih) {
  const r = await tek(
    "SELECT tur_adi FROM denetimler WHERE tarih = ? AND tur_adi IS NOT NULL AND TRIM(tur_adi) != '' LIMIT 1",
    [tarih]);
  return r ? r.tur_adi.trim() : "";
}

async function besSTurlar() {
  return (await sorgu(
    "SELECT DISTINCT tarih FROM denetimler WHERE tarih IS NOT NULL AND tarih != '' ORDER BY tarih DESC"
  )).map((r) => r.tarih);
}

async function besSPlanTur() {
  const r = await tek(
    "SELECT tarih FROM denetimler WHERE puan IS NULL AND tarih != '' ORDER BY tarih DESC LIMIT 1");
  return r ? r.tarih : null;
}

async function besSSonSonucTur() {
  const r = await tek(
    "SELECT tarih FROM denetimler WHERE puan IS NOT NULL AND tarih != '' ORDER BY tarih DESC LIMIT 1");
  return r ? r.tarih : null;
}

async function aksiyonSayilari() {
  const say = {};
  for (const a of await sorgu("SELECT denetim_id, durum FROM aksiyonlar")) {
    const s = (say[a.denetim_id] = say[a.denetim_id] || { toplam: 0, acik: 0 });
    s.toplam += 1;
    if (a.durum === "acik") s.acik += 1;
  }
  return say;
}

// Bir turdaki bölümlerin skor sıralaması + alacakları ödül (önizleme).
// ctx verilirse (denetimler/bolumlar/aksiyonSay) tekrar sorgu atılmaz.
async function besSTurSiralama(tarih, ctx = null) {
  const denetimler = ctx ? ctx.denetimler : await loadDenetimler();
  const bolumlar = ctx ? ctx.bolumlar : await bolumMap();
  const aks = ctx ? ctx.aksiyonSay : await aksiyonSayilari();
  const ds = denetimler.filter((d) => d.tarih === tarih && d.puan !== null);
  ds.sort((a, b) => b.puan - a.puan);
  return ds.map((d, i) => {
    const b = bolumlar[d.bolum_id];
    const ak = aks[d.id] || { toplam: 0, acik: 0 };
    return { sira: i + 1, ad: b ? b.ad : "?", skor: d.puan, odul: S.ODUL_MAP[i] || 0,
      denetim_id: d.id, bolum_id: d.bolum_id, tarih: denetimTarihi(d),
      aksiyon: ak.toplam, aksiyon_acik: ak.acik };
  });
}

async function besSTurTamam(tarih, denetimler = null) {
  const ds = (denetimler || await loadDenetimler()).filter((d) => d.tarih === tarih);
  return ds.length > 0 && ds.every((d) => d.puan !== null);
}

async function besSTurEksikler(tarih, ctx = null) {
  const denetimler = ctx ? ctx.denetimler : await loadDenetimler();
  const bolumlar = ctx ? ctx.bolumlar : await bolumMap();
  const eksik = [];
  for (const d of denetimler) {
    if (d.tarih === tarih && d.puan === null) {
      const b = bolumlar[d.bolum_id];
      if (b) eksik.push(b.ad);
    }
  }
  return eksik;
}

// Bir turun ödüllerini kalıcı deftere işler (ilk 3 bölüm ekibine 100/75/50).
// Tamamı tek transaction'dadır.
async function besSIsle(tarih) {
  if ((await odulIslenenler()).includes(tarih)) return [false, "Bu tur zaten işlenmiş."];
  const denetimler = await loadDenetimler();
  if (!(await besSTurTamam(tarih, denetimler))) {
    const eksik = await besSTurEksikler(tarih, { denetimler, bolumlar: await bolumMap() });
    return [false, `Tüm bölümler denetlenmeden ödül dağıtılamaz. Eksik: ${eksik.join(", ")}`];
  }
  const turdaki = denetimler.filter((d) => d.tarih === tarih && d.puan !== null);
  if (!turdaki.length) return [false, "Bu turda puanlanmış denetim yok."];
  turdaki.sort((a, b) => b.puan - a.puan);
  const turAdi = await besSTurAdi(tarih);
  const bolumlar = await bolumMap();
  const now = S.zamanTr();
  await transaction(async (conn) => {
    for (let sira = 0; sira < Math.min(3, turdaki.length); sira++) {
      const b = bolumlar[turdaki[sira].bolum_id];
      if (!b) continue;
      const kisiler = [b.sorumlu || "", ...(b.kisiler || [])].map((x) => (x || "").trim()).filter(Boolean);
      await calistir(
        `INSERT INTO odul_kayitlari(tarih, tur_adi, bolum_id, bolum_ad, sira, puan, kisiler, islenme_zamani)
         VALUES(?,?,?,?,?,?,?,?)`,
        [tarih, turAdi, b.id, b.ad, sira + 1, S.ODUL_MAP[sira], js(kisiler), now], conn);
    }
    await calistir("INSERT INTO odul_islenen(tarih) VALUES(?)", [tarih], conn);
  });
  return [true, `${tarih} turu işlendi.`];
}

async function besSTurKazananlar(tarih) {
  const ks = (await sorgu("SELECT * FROM odul_kayitlari WHERE tarih = ?", [tarih])).map(odulKayitRow);
  return ks.sort((a, b) => (a.sira || 9) - (b.sira || 9));
}

// İşlenmiş ödül turları (en yenisi hariç) — geçmiş aylar
async function besSArsivAylar() {
  const islenen = (await odulIslenenler()).sort().reverse();
  const guncel = islenen[0] || null;
  const gecmis = [];
  for (const tarih of islenen) {
    if (tarih === guncel) continue;
    gecmis.push({ tarih, kazananlar: await besSTurKazananlar(tarih) });
  }
  return [guncel, gecmis];
}

async function besSGecmisTurlar() {
  const ctx = {
    denetimler: await loadDenetimler(),
    bolumlar: await bolumMap(),
    aksiyonSay: await aksiyonSayilari(),
  };
  const out = [];
  for (const t of await besSTurlar()) {
    out.push({
      tarih: t,
      ad: await besSTurAdi(t),
      siralama: await besSTurSiralama(t, ctx),
      tamam: await besSTurTamam(t, ctx.denetimler),
    });
  }
  return out;
}

// Plan tablosu satırları; aktifDenetmenAd verilirse `benim` işaretlenir.
async function besSPlanSatirlari(tarih, aktifDenetmenAd) {
  const bolumlar = await bolumMap();
  const out = [];
  for (const d of await loadDenetimler()) {
    if (d.tarih !== tarih) continue;
    const b = bolumlar[d.bolum_id];
    const planlanan = d.planlanan_denetmen || "";
    out.push({
      denetim_id: d.id, bolum_id: d.bolum_id, bolum_ad: b ? b.ad : "?",
      lider: b ? b.sorumlu || "" : "",
      planlanan_denetmen: planlanan,
      benim: Boolean(aktifDenetmenAd && I.isimIcerir(planlanan, aktifDenetmenAd)),
      misafir_denetmen: d.misafir_denetmen || "", denetmen: d.denetmen || "",
      plan_gun: d.plan_gun || "", plan_saat: d.plan_saat || "",
      denetim_tarihi: denetimTarihi(d),
      baslangic: d.baslangic || d.tarih || "", bitis: d.bitis || d.tarih || "",
      yapildi: d.puan !== null, puan: d.puan,
    });
  }
  out.sort((a, b) => a.bolum_ad.localeCompare(b.bolum_ad, "tr"));
  return out;
}

// Trend tablosu: satır=bölüm, sütun=denetim turu (eski->yeni), fark renklendirilir.
async function besSTrendTablo() {
  const denetimler = await loadDenetimler();
  const turlar = [...new Set(denetimler.filter((d) => d.tarih && d.puan !== null).map((d) => d.tarih))].sort();
  const basliklar = [];
  for (const t of turlar) basliklar.push({ tarih: t, ad: (await besSTurAdi(t)) || turAdiUret(t) });
  const satirlar = [];
  for (const b of await loadBolumler()) {
    const hucreler = [];
    let onceki = null;
    for (const t of turlar) {
      const d = denetimler.find((x) => x.bolum_id === b.id && x.tarih === t && x.puan !== null);
      if (d) {
        hucreler.push({ puan: d.puan, fark: onceki !== null ? d.puan - onceki : null });
        onceki = d.puan;
      } else hucreler.push(null);
    }
    satirlar.push({ ad: b.ad, hucreler });
  }
  satirlar.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return [basliklar, satirlar];
}

// Bir 5S turunun ödülleri işlendi mi (işlendiyse o turdaki denetimler revize edilemez)
async function turIslendi(tarih) {
  return Boolean(await tek("SELECT 1 FROM odul_islenen WHERE tarih = ?", [tarih || ""]));
}

// Her kriter için en fazla 3 foto kaydeder (mevcutları korur). files: multer dizisi.
async function saveDenetimFotolar(did, mevcut, files) {
  const fotolar = { ...(mevcut || {}) };
  const grup = {};
  for (const f of files || []) {
    (grup[f.fieldname] = grup[f.fieldname] || []).push(f);
  }
  for (const k of P.BESS_TUM_KRITERLER) {
    const varolan = [...(fotolar[k] || [])];
    for (const f of grup[`foto_${k}`] || []) {
      if (varolan.length >= 3) break;
      if (f && f.originalname && allowedFile(f.originalname)) {
        const ext = path.extname(f.originalname).toLowerCase();
        const fname = `${did}_${k}_${uid().slice(0, 6)}${ext}`;
        if (await gorselKaydet(f, path.join(S.BESS_FOTO_DIR, fname))) varolan.push(fname);
      }
    }
    if (varolan.length) fotolar[k] = varolan;
  }
  return fotolar;
}

module.exports = {
  loadBolumler, bolumById, bolumMap, loadDenetimler, denetimById, loadAksiyonlar, aksiyonById, odulIslenenler,
  bolumDenetimleri, sonDenetim, denetimKriterPuanlari, denetimTarihi, denetimFotolari,
  turAdiUret, besSTurAdi, besSTurlar, besSPlanTur, besSSonSonucTur, aksiyonSayilari, besSTurSiralama,
  besSTurTamam, besSTurEksikler, besSIsle, besSArsivAylar, besSGecmisTurlar,
  besSPlanSatirlari, besSTrendTablo, turIslendi, saveDenetimFotolar,
};
