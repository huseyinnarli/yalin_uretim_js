// Puan ve ödül kuralları (saf — IO yok). Değerler veritabanında (config) saklanır ve ana yönetici
// "Puan ve Ödül Ayarları" sayfasından değiştirir; burada varsayılanlar, doğrulama, bir kayda hangi
// kural sürümünün uygulanacağı ve kişiye yazılan puanın hesabı vardır.
//
// İki tür ayar:
//  - Ödül ayarları (eşik, 5S tur ödülleri): sürümsüz, hemen geçerli. Verilmiş ödülde düşülen puan ve işlenmiş
//    5S turlarının puanı kayıtlarda saklandığı için değişiklik geçmişi etkilemez.
//  - Öneri/kaizen kuralları: geçerlilik tarihli SÜRÜMLER. Bir kayda, ONAYLANDIĞI gün geçerli olan sürüm uygulanır
//    (onay tarihi yoksa kayıt tarihi). Böylece "bundan sonra" yapılan değişiklik eski kayıtların puanını değiştirmez.

const BASLANGIC = "2000-01-01"; // geriye dönük (tüm kayıtlar) sürümün geçerlilik tarihi

const VARSAYILAN_KURAL = {
  gecerlilik: BASLANGIC,
  oneri_mod: "tablo",      // "tablo": puanlama tablosu × oran · "sabit": onaylanınca sabit puan
  oneri_oran: 10,          // % — tablo modunda öneri sahibine yazılan pay
  oneri_sabit: 10,         // puan — sabit modda onaylanan öneri için sahibine
  kaizen_lider_oran: 50,   // % — kaizen puanının lidere yazılan payı
  kaizen_uye_oran: 25,     // % — her üyeye
};
const VARSAYILAN_ODUL = {
  esik: 300,               // net puan bu değere ulaşınca ödül verilebilir; ödülde bu kadar puan düşülür
  bes: [100, 75, 50],      // 5S turunda 1./2./3. bölüm ekibinin her üyesine
};

const SINIR = { oran: 100, sabit: 1000, esik: 100000, bes: 1000 };

// Formdan gelen sayıyı oku (virgüllü ondalık da kabul); geçersizse null
function sayi(v) {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Kural formunu doğrular → { kural, hatalar[] }
function kuralDogrula(girdi) {
  const hatalar = [];
  const kural = {
    oneri_mod: girdi.oneri_mod === "sabit" ? "sabit" : "tablo",
    oneri_oran: sayi(girdi.oneri_oran),
    oneri_sabit: sayi(girdi.oneri_sabit),
    kaizen_lider_oran: sayi(girdi.kaizen_lider_oran),
    kaizen_uye_oran: sayi(girdi.kaizen_uye_oran),
  };
  const aralik = (alan, ad, ust) => {
    if (kural[alan] === null || kural[alan] < 0 || kural[alan] > ust) hatalar.push(`${ad} 0 ile ${ust} arasında olmalı.`);
  };
  aralik("oneri_oran", "Öneri oranı (%)", SINIR.oran);
  aralik("oneri_sabit", "Öneri sabit puanı", SINIR.sabit);
  aralik("kaizen_lider_oran", "Kaizen lider oranı (%)", SINIR.oran);
  aralik("kaizen_uye_oran", "Kaizen üye oranı (%)", SINIR.oran);
  return { kural, hatalar };
}

// Ödül formunu doğrular → { odul, hatalar[] }
function odulDogrula(girdi) {
  const hatalar = [];
  const odul = { esik: sayi(girdi.esik), bes: [sayi(girdi.bes1), sayi(girdi.bes2), sayi(girdi.bes3)] };
  if (odul.esik === null || odul.esik <= 0 || odul.esik > SINIR.esik) hatalar.push(`Ödül eşiği 0'dan büyük, en çok ${SINIR.esik} olmalı.`);
  odul.bes.forEach((v, i) => {
    if (v === null || v < 0 || v > SINIR.bes) hatalar.push(`5S ${i + 1}. bölüm puanı 0 ile ${SINIR.bes} arasında olmalı.`);
  });
  return { odul, hatalar };
}

// Kayıtlı (JSON) değerleri varsayılanlarla tamamlar — eksik/bozuk alan uygulamayı durdurmasın
function kurallariTamamla(surumler) {
  const liste = (Array.isArray(surumler) ? surumler : [])
    .filter((s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s.gecerlilik))
    .map((s) => ({ ...VARSAYILAN_KURAL, ...s }))
    .sort((a, b) => a.gecerlilik.localeCompare(b.gecerlilik));
  if (!liste.length || liste[0].gecerlilik > BASLANGIC) liste.unshift({ ...VARSAYILAN_KURAL });
  return liste;
}
function odulTamamla(o) {
  const v = o && typeof o === "object" ? o : {};
  const bes = Array.isArray(v.bes) ? v.bes : [];
  return {
    esik: Number(v.esik) > 0 ? Number(v.esik) : VARSAYILAN_ODUL.esik,
    bes: VARSAYILAN_ODUL.bes.map((d, i) => (Number.isFinite(Number(bes[i])) && bes[i] !== null ? Number(bes[i]) : d)),
  };
}

// Yeni kural eklenince oluşacak sürüm listesi. geriyeDonuk → geçmiş silinir, kural tüm kayıtlara uygulanır;
// aksi hâlde bugünden geçerli sürüm eklenir (aynı gün kaydedilmiş sürüm varsa onun yerine geçer).
function yeniSurumler(surumler, kural, { geriyeDonuk, bugun, kaydeden = "", zaman = "" }) {
  const yeni = { ...kural, gecerlilik: geriyeDonuk ? BASLANGIC : bugun, kaydeden, zaman };
  return kurallariTamamla(geriyeDonuk ? [yeni] : [...surumler.filter((s) => s.gecerlilik !== bugun), yeni]);
}
// İki kural aynı mı (yalnız hesaba giren alanlar)
const KURAL_ALANLARI = ["oneri_mod", "oneri_oran", "oneri_sabit", "kaizen_lider_oran", "kaizen_uye_oran"];
function kuralAyni(a, b) {
  return KURAL_ALANLARI.every((k) => String(a[k]) === String(b[k]));
}

// "05.10.2026 12:48" → "2026-10-05"; ISO tarih aynen; anlaşılmazsa ""
function tarihIso(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// Kurala esas tarih: onaylanmış kayıtta onay günü (yoksa kayıt günü); henüz onaylanmamış kayıtta bugün
// (onaylanırsa bugünün kuralıyla puan alır — ekranda "onaylanınca ne olur" doğru gösterilsin).
function kuralTarihi(r, bugunIso) {
  if ((r.durum || "") !== "Onaylandı") return bugunIso;
  return tarihIso(r.onay_zamani) || tarihIso(r.kayit_zamani) || tarihIso(r.tarih) || bugunIso;
}

// Sürüm listesinde (artan sıralı) tarihte geçerli olan sürüm
function kuralSec(surumler, tarih) {
  let secilen = surumler[0];
  for (const s of surumler) if (s.gecerlilik <= tarih) secilen = s;
  return secilen;
}

const yuvarla = (x) => Math.round(x * 100) / 100;
const puanVar = (r) => r.puan !== null && r.puan !== undefined && r.puan !== "" && parseFloat(r.puan) > 0;

// Öneri sahibine yazılan puan
function oneriKazanci(r, kural) {
  if (kural.oneri_mod === "sabit") return (r.durum || "") === "Onaylandı" ? yuvarla(kural.oneri_sabit) : 0;
  return puanVar(r) ? yuvarla((parseFloat(r.puan) * kural.oneri_oran) / 100) : 0;
}
// Kaizen liderine ve her üyesine yazılan puan
function kaizenKazanci(r, kural) {
  if (!puanVar(r)) return { lider: 0, uye: 0 };
  const p = parseFloat(r.puan);
  return { lider: yuvarla((p * kural.kaizen_lider_oran) / 100), uye: yuvarla((p * kural.kaizen_uye_oran) / 100) };
}
// Panelde "puan alan" sayılır mı: sabit modda onaylanan öneri; aksi hâlde tablo puanı verilmiş kayıt
function puanAldi(r, kural, tip) {
  if ((r.durum || "") !== "Onaylandı") return false;
  if (tip === "oneri" && kural.oneri_mod === "sabit") return true;
  return r.puan !== null && r.puan !== undefined && r.puan !== ""; // tablo puanı girilmiş (0 da olsa)
}

// Kısa açıklama (ekran metinleri için)
function kuralMetni(kural) {
  const oneri = kural.oneri_mod === "sabit"
    ? `Öneri → onaylanınca sahibine sabit ${kural.oneri_sabit} puan`
    : `Öneri → sahibine puanın %${kural.oneri_oran} payı`;
  return `${oneri} · Kaizen → lider %${kural.kaizen_lider_oran}, her üye %${kural.kaizen_uye_oran} pay`;
}

module.exports = {
  BASLANGIC, VARSAYILAN_KURAL, VARSAYILAN_ODUL,
  kuralDogrula, odulDogrula, kurallariTamamla, odulTamamla, yeniSurumler, kuralAyni,
  tarihIso, kuralTarihi, kuralSec, oneriKazanci, kaizenKazanci, puanAldi, kuralMetni,
};
