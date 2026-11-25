// Hesaplar ve oturum yetkileri: denetmen / misafir / ek yönetici kayıtları, şifreyle kimlik bulma,
// oturumdaki hesabın taze okunması, oturum yetki çözümü, şifre çakışma kontrolü, bölüm liderleri.
const I = require("../isim");
const Y = require("../yetkiler");
const { sorgu, tek, calistir, yoneticiRow } = require("../db");
const { checkPassword, adminSifreDogru, hashPassword } = require("./guvenlik");
const { loadBolumler } = require("./bolumler");

async function loadDenetmenler() {
  return sorgu("SELECT * FROM denetmenler ORDER BY ad");
}

async function loadMisafirler() {
  return sorgu("SELECT * FROM misafirler ORDER BY ad");
}

// 'Ali / Veli' → ['Ali', 'Veli'] — ayraç: / , ;
const isimListesi = I.isimListesi;

function bolumLiderleri(b) {
  return isimListesi((b || {}).sorumlu);
}

// Denetmen adayları = tüm bölümlerin ekip liderleri (benzersiz, sıralı)
async function denetmenAdaylari() {
  const adlar = [];
  for (const b of await loadBolumler()) {
    for (const ad of bolumLiderleri(b)) if (!adlar.includes(ad)) adlar.push(ad);
  }
  return adlar.sort((a, b) => a.localeCompare(b, "tr"));
}

// Oturumdaki denetmen kaydı (silinmiş hesabı düşürür)
async function aktifDenetmen(session) {
  const did = session && session.denetmen_id;
  if (!did) return null;
  const d = await tek("SELECT * FROM denetmenler WHERE id = ?", [did]);
  if (!d) { delete session.denetmen_id; delete session.denetmen_ad; }
  return d || null;
}

async function loadYoneticiler() {
  return (await sorgu("SELECT * FROM yoneticiler ORDER BY ad")).map(yoneticiRow);
}

async function yoneticiById(id) {
  return yoneticiRow(await tek("SELECT * FROM yoneticiler WHERE id = ?", [id]));
}

// Oturumdaki ek yönetici kaydı (silinmiş/yetkisi güncellenmiş hesabı taze okur)
async function aktifYonetici(session) {
  const yid = session && session.yonetici_id;
  if (!yid) return null;
  const y = await yoneticiById(yid);
  if (!y) { delete session.yonetici_id; delete session.yonetici_ad; delete session.admin; }
  return y;
}

// Oturumun yetki durumu (Express'ten bağımsız): ana yönetici (tüm yetkiler + yönetici hesapları) /
// ek yönetici (ayrıntılı yetki listesi). Ek yönetici yetkileri her çağrıda veritabanından TAZE okunur.
async function oturumYetkileri(session) {
  const bos = { yonetici: false, ana: false, yetkiler: [], ad: null };
  if (!session || !session.admin) return bos;
  if (session.super) {
    return { yonetici: true, ana: true, yetkiler: [...Y.TUM_YETKILER], ad: "Ana Yönetici" };
  }
  const y = await aktifYonetici(session);
  if (!y) return bos;
  return { yonetici: true, ana: false, yetkiler: Y.yetkiGenislet(y.yetkiler).yetkiler, ad: y.ad };
}

async function denetmenById(id) {
  return id ? tek("SELECT * FROM denetmenler WHERE id = ?", [id]) : null;
}

// ----- Giriş kullanıcı adları (kullanıcı adı + şifre) -----
// Ana yöneticinin kullanıcı adı sabittir; başka hesaba verilemez.
const ANA_YONETICI_KULLANICI = "admin";
const _kAnahtar = I.kullaniciAdiAnahtar;

// Kullanılan kullanıcı adları (küçük harf) — denetmen + ek yönetici + "admin"; haric: {tablo, id} hariç tutulur
async function kullaniciAdlari(haric = null) {
  const set = new Set([ANA_YONETICI_KULLANICI]);
  for (const tablo of ["denetmenler", "yoneticiler"]) {
    for (const r of await sorgu(`SELECT id, kullanici_adi FROM ${tablo} WHERE kullanici_adi IS NOT NULL AND kullanici_adi <> ''`)) {
      if (haric && haric.tablo === tablo && haric.id === r.id) continue;
      set.add(_kAnahtar(r.kullanici_adi));
    }
  }
  return set;
}

// Addan benzersiz kullanıcı adı önerisi (ali.yilmaz, ali.yilmaz2, …)
async function kullaniciAdiOner(ad, kullanilan = null) {
  return I.kullaniciAdiSec(ad, kullanilan || await kullaniciAdlari());
}

// Kullanıcı adı doğrulama (biçim + ayrılmış + benzersiz). Döner: hata metni | null
async function kullaniciAdiHatasi(k, haric = null) {
  const a = _kAnahtar(k);
  if (!I.KULLANICI_ADI_RE.test(a)) {
    return "Kullanıcı adı 3–32 karakter olmalı: küçük harf, rakam, nokta, tire (ör. ali.yilmaz).";
  }
  if ((await kullaniciAdlari(haric)).has(a)) return `"${a}" kullanıcı adı kullanımda.`;
  return null;
}

// Kullanıcı adı olmayan hesaplara addan otomatik verir (açılışta ve girişte çağrılır — eski sürümle açılmış
// hesaplar da tamamlanır). Aynı anda iki giriş aynı adı iki hesaba vermesin diye çağrılar sıraya alınır.
// Döner: [{ tablo, ad, kullanici_adi }]
let _tamamlaSirasi = Promise.resolve();
function kullaniciAdlariniTamamla() {
  const is = _tamamlaSirasi.then(_kullaniciAdlariniTamamla);
  _tamamlaSirasi = is.catch(() => {});
  return is;
}
async function _kullaniciAdlariniTamamla() {
  const verilen = [];
  let set = null;
  for (const tablo of ["denetmenler", "yoneticiler"]) {
    const eksik = await sorgu(`SELECT id, ad FROM ${tablo} WHERE kullanici_adi IS NULL OR kullanici_adi = '' ORDER BY ad`);
    for (const r of eksik) {
      set = set || await kullaniciAdlari();
      const k = await kullaniciAdiOner(r.ad, set);
      await calistir(`UPDATE ${tablo} SET kullanici_adi = ? WHERE id = ? AND (kullanici_adi IS NULL OR kullanici_adi = '')`, [k, r.id]);
      set.add(k);
      verilen.push({ tablo, ad: r.ad, kullanici_adi: k });
    }
  }
  return verilen;
}

// Girişte hesap bulma: kullanıcı adı + şifre — tek hash karşılaştırması (eskiden her hatalı girişte tüm hesaplar
// taranıyordu). Bilinmeyen kullanıcı adında da bir sahte karşılaştırma yapılır: süre farkından hangi adların
// var olduğu anlaşılmasın. Döner: { tip: "ana"|"yonetici"|"denetmen", hesap } | null
let _sahteHash = null;
async function girisHesabi(kullanici, sifre) {
  const k = _kAnahtar(kullanici);
  sifre = String(sifre || "");
  if (!k || !sifre) return null;
  if (k === ANA_YONETICI_KULLANICI) return (await adminSifreDogru(sifre)) ? { tip: "ana", hesap: null } : null;
  const y = await tek("SELECT * FROM yoneticiler WHERE LOWER(kullanici_adi) = ?", [k]);
  if (y) return checkPassword(y.sifre, sifre) ? { tip: "yonetici", hesap: yoneticiRow(y) } : null;
  const d = await tek("SELECT * FROM denetmenler WHERE LOWER(kullanici_adi) = ?", [k]);
  if (d) return checkPassword(d.sifre, sifre) ? { tip: "denetmen", hesap: d } : null;
  _sahteHash = _sahteHash || hashPassword("yok-" + Date.now());
  checkPassword(_sahteHash, sifre);
  return null;
}

// Kullanıcı adı değiştirme (Yönetim). Döner: hata metni | null
async function kullaniciAdiDegistir(tablo, id, yeni) {
  if (!["denetmenler", "yoneticiler"].includes(tablo)) return "Geçersiz hesap türü.";
  const hata = await kullaniciAdiHatasi(yeni, { tablo, id });
  if (hata) return hata;
  await calistir(`UPDATE ${tablo} SET kullanici_adi = ? WHERE id = ?`, [_kAnahtar(yeni), id]);
  return null;
}

module.exports = {
  ANA_YONETICI_KULLANICI, kullaniciAdlari, kullaniciAdiOner, kullaniciAdiHatasi, kullaniciAdlariniTamamla, girisHesabi,
  kullaniciAdiDegistir,
  loadDenetmenler, loadMisafirler, isimListesi, bolumLiderleri, denetmenAdaylari,
  aktifDenetmen, loadYoneticiler, yoneticiById, oturumYetkileri, denetmenById,
};
