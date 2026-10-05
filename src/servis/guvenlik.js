// Şifre ve oturum anahtarı: werkzeug uyumlu hash (eski verideki pbkdf2/scrypt hash'leri de doğrulanır),
// ana yönetici şifresi, açılışta düz metin şifrelerin hash'lenmesi, cookie-session imza anahtarı.
const crypto = require("crypto");

const S = require("../sabitler");
const { sorgu, calistir, configGet, configSet } = require("../db");

function hashPassword(sifre) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iter = 600000;
  const h = crypto.pbkdf2Sync(sifre, salt, iter, 32, "sha256").toString("hex");
  return `pbkdf2:sha256:${iter}$${salt}$${h}`;
}

function hashMi(v) {
  return typeof v === "string" && (v.startsWith("pbkdf2:") || v.startsWith("scrypt:"));
}

function checkPassword(kayitli, sifre) {
  if (!kayitli) return false;
  if (!hashMi(kayitli)) return kayitli === sifre; // eski düz metin
  const [method, salt, hash] = kayitli.split("$");
  if (!method || !salt || !hash) return false;
  try {
    let hesap;
    if (method.startsWith("pbkdf2:")) {
      const [, algo, iterStr] = method.split(":");
      const iter = parseInt(iterStr, 10) || 260000;
      hesap = crypto.pbkdf2Sync(sifre, salt, iter, hash.length / 2, algo || "sha256").toString("hex");
    } else if (method.startsWith("scrypt:")) {
      const [, nStr, rStr, pStr] = method.split(":");
      const N = parseInt(nStr, 10) || 32768, r = parseInt(rStr, 10) || 8, p = parseInt(pStr, 10) || 1;
      hesap = crypto.scryptSync(sifre, salt, hash.length / 2,
        { N, r, p, maxmem: 256 * 1024 * 1024 }).toString("hex");
    } else return false;
    return crypto.timingSafeEqual(Buffer.from(hesap, "hex"), Buffer.from(hash, "hex"));
  } catch { return false; }
}

async function getAdminPassword() {
  return (await configGet("admin_password")) || S.ADMIN_PASSWORD;
}

async function adminSifreDogru(sifre) {
  return checkPassword(await getAdminPassword(), sifre);
}

async function setAdminPassword(yeni) {
  await configSet("admin_password", hashPassword(yeni));
}

// Açılışta düz metin şifreleri hash'e çevir (ilk kurulum / eski aktarım)
async function sifreleriHashle() {
  const kayitli = await getAdminPassword();
  if (!hashMi(kayitli)) await setAdminPassword(kayitli);
  for (const d of await sorgu("SELECT * FROM denetmenler")) {
    if (d.sifre && !hashMi(d.sifre)) {
      await calistir("UPDATE denetmenler SET sifre = ? WHERE id = ?", [hashPassword(d.sifre), d.id]);
    }
  }
}

// Oturum imza anahtarı config'de tutulur (koda gömülü değil)
async function getSecretKey() {
  let k = await configGet("secret_key");
  if (!k) { k = crypto.randomBytes(32).toString("hex"); await configSet("secret_key", k); }
  return k;
}

module.exports = {
  hashPassword, checkPassword, adminSifreDogru, setAdminPassword, sifreleriHashle,
  getSecretKey,
};
