// Hesaplar ve oturum yetkileri: denetmen / misafir / ek yönetici kayıtları, şifreyle kimlik bulma,
// oturumdaki hesabın taze okunması, oturum yetki çözümü, şifre çakışma kontrolü, bölüm liderleri.
const I = require("../isim");
const Y = require("../yetkiler");
const { sorgu, tek, yoneticiRow } = require("../db");
const { checkPassword, adminSifreDogru } = require("./guvenlik");
const { loadBolumler } = require("./bes");

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

// Şifreden denetmeni bulur (giriş) — hash karşılaştırmalı
async function denetmenBySifre(sifre) {
  if (!sifre) return null;
  for (const d of await loadDenetmenler()) {
    if (checkPassword(d.sifre, sifre)) return d;
  }
  return null;
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

// Şifreden ek yöneticiyi bulur (giriş) — hash karşılaştırmalı
async function yoneticiBySifre(sifre) {
  if (!sifre) return null;
  for (const y of await loadYoneticiler()) {
    if (checkPassword(y.sifre, sifre)) return y;
  }
  return null;
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

// Şifre başka bir hesapta (ana yönetici / denetmen / başka ek yönetici) kullanılıyor mu?
// haricYoneticiId verilirse o ek yönetici kendi şifresini korurken çakışma sayılmaz.
async function sifreCakismasi(sifre, haricYoneticiId = null) {
  if (await adminSifreDogru(sifre)) return true;
  if (await denetmenBySifre(sifre)) return true;
  const y = await yoneticiBySifre(sifre);
  if (y && y.id !== haricYoneticiId) return true;
  return false;
}

module.exports = {
  loadDenetmenler, loadMisafirler, isimListesi, bolumLiderleri, denetmenAdaylari, denetmenBySifre,
  aktifDenetmen, loadYoneticiler, yoneticiById, yoneticiBySifre, oturumYetkileri, denetmenById,
  sifreCakismasi,
};
