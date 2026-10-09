// Puan ve ödül ayarları: config tablosunda saklanır (ana yönetici değiştirir).
//  - "puan_kurallari": öneri/kaizen kural SÜRÜMLERİ (JSON dizi, geçerlilik tarihli)
//  - "odul_ayarlari" : ödül eşiği + 5S tur ödülleri (JSON, hemen geçerli)
// Kuralların anlamı ve hesap: src/puanKurallari.js (saf).
const S = require("../sabitler");
const PK = require("../puanKurallari");
const { configGet, configSet, j } = require("../db");

async function puanKurallari() {
  return PK.kurallariTamamla(j(await configGet("puan_kurallari"), []));
}
async function odulAyarlari() {
  return PK.odulTamamla(j(await configGet("odul_ayarlari"), {}));
}
// Bugün geçerli kural (ekran metinleri, onaylanmamış kayıtlar)
async function guncelKural() {
  return PK.kuralSec(await puanKurallari(), S.bugunIso());
}

// Kayıt → ona uygulanacak kural sürümü (ayarlar bir kez okunur; döngülerde tekrar sorgu atılmaz)
async function kuralCozucu() {
  const surumler = await puanKurallari();
  const bugun = S.bugunIso();
  return (r) => PK.kuralSec(surumler, PK.kuralTarihi(r, bugun));
}

// Yeni kural sürümü kaydeder. geriyeDonuk=true → kural TÜM kayıtlara uygulanır (geçmiş sürümler silinir);
// aksi hâlde bugünden itibaren onaylanan kayıtlara. Önizleme aynı hesabı PK.yeniSurumler ile yapar.
async function puanKuralKaydet(kural, { geriyeDonuk, kim }) {
  const surumler = PK.yeniSurumler(await puanKurallari(), kural,
    { geriyeDonuk, bugun: S.bugunIso(), kaydeden: kim || "", zaman: S.zamanTr() });
  await configSet("puan_kurallari", JSON.stringify(surumler));
  return surumler;
}
// Bir sürümü kaldırır (ilk/temel sürüm kaldırılamaz) — o dönemin kayıtlarına bir önceki sürüm uygulanır
async function puanKuralSil(gecerlilik) {
  const surumler = await puanKurallari();
  if (gecerlilik === surumler[0].gecerlilik) return false;
  const kalan = surumler.filter((s) => s.gecerlilik !== gecerlilik);
  if (kalan.length === surumler.length) return false;
  await configSet("puan_kurallari", JSON.stringify(kalan));
  return true;
}
async function odulAyarKaydet(odul) {
  await configSet("odul_ayarlari", JSON.stringify(PK.odulTamamla(odul)));
}

module.exports = {
  puanKurallari, odulAyarlari, guncelKural, kuralCozucu, puanKuralKaydet, puanKuralSil, odulAyarKaydet,
};
