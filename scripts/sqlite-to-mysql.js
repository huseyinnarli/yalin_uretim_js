// SQLite (önceki sürüm, data/yalin.db) verisini MySQL'e taşır.
// Kullanım: node scripts/sqlite-to-mysql.js [sqlite-dosya-yolu]
// Görseller diskte aynı klasörlerde kaldığından yalnızca tablolar taşınır.
const path = require("path");
const fs = require("fs");
const S = require("../src/sabitler");
const { pool, calistir, transaction, init } = require("../src/db");

const SQLITE_YOL = process.argv[2] || path.join(S.DATA_DIR, "yalin.db");

async function main() {
  if (!fs.existsSync(SQLITE_YOL)) {
    console.error("SQLite dosyası bulunamadı:", SQLITE_YOL);
    process.exit(1);
  }
  const { DatabaseSync } = require("node:sqlite");
  const sq = new DatabaseSync(SQLITE_YOL, { readOnly: true });

  await init();
  let toplam = 0;
  const log = (ad, n) => { console.log(`  ${ad}: ${n} kayıt`); toplam += n; };

  // kaynak tablo -> [kolonlar] (iki şemada da aynı adlar; SQLite'ta AUTOINCREMENT id atlanır)
  const tablolar = [
    ["config", ["anahtar", "deger"]],
    ["oneriler", ["no", "tarih", "sahibi", "gorevi", "konu", "detay", "cozum", "kalite",
      "verimlilik", "isg", "maliyet", "ek", "durum", "puan", "puanlama",
      "degerlendirme_notu", "kayit_zamani", "guncelleme_zamani"]],
    ["kaizenler", ["no", "baslangic", "bitis", "konu", "bolum", "lider", "uyeler",
      "sorumlular", "kazanclar", "onceki", "sonraki", "onceki_gorsel", "sonraki_gorsel",
      "durum", "puan", "puanlama", "degerlendirme_notu", "kayit_zamani", "guncelleme_zamani"]],
    ["bolumler", ["id", "ad", "sorumlu", "kisiler"]],
    ["denetimler", ["id", "bolum_id", "tarih", "tur_adi", "baslangic", "bitis", "plan_gun",
      "plan_saat", "planlanan_denetmen", "misafir_denetmen", "denetmen", "puan", "puanlar",
      "checked", "uygunsuz", "notu", "aciklamalar", "fotolar", "durum", "denetim_tarihi",
      "kayit_zamani"]],
    ["aksiyonlar", ["id", "denetim_id", "tarih", "tur_adi", "bolum_id", "bolum_ad",
      "kriter_k", "kriter_m", "aksiyon", "sorumlu", "atanan_lider", "termin", "durum",
      "olusturma_zamani", "kapatma"]],
    ["odul_islenen", ["tarih"]],
    ["odul_kayitlari", ["tarih", "tur_adi", "bolum_id", "bolum_ad", "sira", "puan",
      "kisiler", "islenme_zamani"]],
    ["odul_arsiv", ["ad", "puan", "tarih", "zaman"]],
    ["silinen_kisiler", ["ad"]],
    ["denetmenler", ["id", "ad", "sifre", "olusturma"]],
    ["misafirler", ["id", "ad", "olusturma"]],
  ];

  await transaction(async (conn) => {
    for (const [tablo, kolonlar] of tablolar) {
      let satirlar;
      try {
        satirlar = sq.prepare(`SELECT * FROM ${tablo}`).all();
      } catch { satirlar = []; } // eski dosyada tablo yoksa atla
      const kolonSql = kolonlar.map((k) => `\`${k}\``).join(", ");
      const yer = kolonlar.map(() => "?").join(", ");
      for (const r of satirlar) {
        await calistir(
          `REPLACE INTO ${tablo}(${kolonSql}) VALUES(${yer})`,
          kolonlar.map((k) => r[k] === undefined ? null : r[k]), conn);
      }
      log(tablo, satirlar.length);
    }
  });

  sq.close();
  console.log(`\n✔ Taşıma tamamlandı — toplam ${toplam} kayıt MySQL'e aktarıldı.`);
  await pool.end();
}

main().catch((e) => { console.error("✗ Taşıma başarısız:", e.message); process.exit(1); });
