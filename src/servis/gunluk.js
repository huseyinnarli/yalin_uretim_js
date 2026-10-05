// İşlem günlüğü (denetim izi): yönetici/denetmen eylemleri web.js:flash() üzerinden otomatik kaydedilir.
const S = require("../sabitler");
const { sorgu, calistir } = require("../db");

async function gunlukEkle({ kim, rol, mesaj, yol, ip }) {
  try {
    await calistir(
      "INSERT INTO islem_gunlugu(zaman, kim, rol, mesaj, yol, ip) VALUES(?,?,?,?,?,?)",
      [S.zamanTr(), (kim || "").slice(0, 191), (rol || "").slice(0, 16),
        String(mesaj || "").slice(0, 1000), (yol || "").slice(0, 255), (ip || "").slice(0, 64)]);
  } catch (e) { console.error("Günlük yazılamadı:", e.message); }
}

async function loadGunluk(limit = 500) {
  return sorgu("SELECT * FROM islem_gunlugu ORDER BY id DESC LIMIT ?", [limit]);
}

async function gunlukTemizle() {
  await calistir("DELETE FROM islem_gunlugu");
}

module.exports = {
  gunlukEkle, loadGunluk, gunlukTemizle,
};
