# CLAUDE.md — Yalın Üretim Uygulamaları (yalin_uretim_js)

Bu dosya, projede çalışan yapay zekâ asistanı ve yeni geliştiriciler için hızlı bağlamdır.

## Proje kimliği

Fabrika içi web uygulaması: **Öneri + Kaizen + 5S denetim** süreçleri ve personel puan/ödül
sistemi. Eski Python/Flask sürümünün (`../yalin_uretim_uygulamalari`) JavaScript ile sıfırdan
yazılmış hâli; önce SQLite'la yazıldı, sonra **MySQL 8**'e taşındı.

- **Yığın:** Node.js 24 + Express 4 + MySQL 8 (`mysql2/promise`) + EJS (sunucu tarafı render)
  + exceljs + archiver + multer + sharp + cookie-session. SPA/dış CDN yok.
- **GitHub:** https://github.com/huseyinnarli/yalin_uretim_js (⚠ şu an PUBLIC — gizli yapılması önerildi, IYILESTIRME_ANALIZI Ö9)
- **Dil:** Kod, yorumlar, commit mesajları ve arayüz **Türkçe**.

## Doküman haritası (hepsi güncel tutulur)

| Dosya | İçerik |
|---|---|
| [README.md](README.md) | Uygulama tanıtımı, modüller, roller, kurulum, yapılandırma |
| [TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md) | Mimari, istek yaşam döngüsü, veri modeli, iş kuralları/algoritmalar |
| [IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md) | Mimari ve güvenlik raporu: güvenlik durumu, kapatılan bulgular, açık öneriler (Ö1–Ö18) |
| [GELISTIRME_RAPORU.md](GELISTIRME_RAPORU.md) | Ekim 2026 sürümünde ne eklendi/değişti/kaldırıldı, kullanılan araçlar, dosya envanteri |
| [VERITABANI_GECIS.md](VERITABANI_GECIS.md) | Canlı (eski düzen) veritabanıyla geçiş: otomatik eklemeler, tek kutulu isimler, adım adım canlıya alma, geri dönüş |
| [GUNCELLEME_REHBERI.md](GUNCELLEME_REHBERI.md) | **Canlı siteyi güncelleyecek kişi için** adım adım rehber: bilgi toplama, yedek, ön kontrol, geçiş yolları, duman testi, geri dönüş, tuzaklar (T1–T15), kod incelemesi bulguları |
| [DAGITIM.md](DAGITIM.md) | Sunucuda devreye alma: gereksinimler, Windows/Linux kurulum, HTTPS, yedek |
| [DEGISIKLIKLER.md](DEGISIKLIKLER.md) | Sürüm notları: kullanıcıya görünen değişiklikler, DB migrasyonları, canlıya alma adımları |

## Komutlar

```bash
npm start        # sunucu → http://127.0.0.1:5000 (0.0.0.0 dinler)
npm test         # 276 kontrollü e2e — AYRI veritabanı (yalin_e2e) + geçici veri klasörü; canlıya dokunmaz
npm run gecis-kontrol  # canlıya almadan önce SALT-OKUNUR veritabanı ön kontrolü (şema farkı, isimler, yetkiler)
npm run migrate  # eski SQLite verisini (data/yalin.db) MySQL'e taşır
npm run import   # eski Flask/JSON verisini aktarır: node scripts/import-json.js "<eski>/data"
# Demo (Render, tasarım önizleme): Dockerfile → scripts/demo-baslat.sh (geçici MariaDB) → scripts/demo-veri.js
# (yalnız BOŞ veritabanına örnek veri). YALIN_DEMO=1 üstte demo şeridi gösterir. Canlıda kullanılmaz.
```

Sözdizimi hızlı kontrol: `node --check <dosya>`. Önizleme: kök `Projeler/.claude/launch.json`
içinde `yalin-uretim-js` yapılandırması var (`preview_start name=yalin-uretim-js`).

## Bu makinedeki ortam (geliştirme PC'si)

- **Node:** `C:\Program Files\nodejs` (yeni terminalde PATH'e eklemek gerekebilir).
- **MySQL:** Windows servisi **`YalinMySQL`** (otomatik başlar; yalnız 127.0.0.1:3306 dinler).
  Veri: `C:\ProgramData\YalinMySQL\data`, ini: `C:\ProgramData\YalinMySQL\my.ini`,
  hata logu: `C:\ProgramData\YalinMySQL\mysql-hata.log`.
  ⚠ mysqld servisi kullanıcı profili altındaki datadir ile SESSİZCE başlamaz — ProgramData şart.
- **Bağlantı:** `data/db-config.json` (git dışı) → user `yalin`, db `yalin_uretim`.
  Root şifresi: `%LOCALAPPDATA%\YalinMySQL\root-sifre.txt`.
- **Test DB:** `yalin_e2e` (yalin kullanıcısına yetkili) — `npm test` bunu kullanır.
- Canlı veritabanında kullanıcının GERÇEK verisi var (28 bölüm, denetmenler, ödül defteri) —
  test ederken canlıya yazma; `npm test` veya izole `YALIN_DB_DATABASE`/`YALIN_DATA_DIR` kullan.

## Mimari (özet — ayrıntı TEKNIK_DOKUMAN.md)

Katmanlar tek yönlü: `sabitler · isim · yetkiler · kontrol · puanlama → db → servis/* → cekirdek (cephe) → web → rotalar → server`.
Veri erişimi tamamen async (`sorgu/tek/calistir/transaction`, `src/db.js`). İş mantığı `src/servis/*` modüllerinde
(5 katman; bir modül yalnız ALTTAKİ katmana dayanır — sıra `cekirdek.js` başındaki açıklamada) ve Express'ten
bağımsızdır (session'ı parametre alır). Rotalar `C = require("../cekirdek")` cephesini kullanır; yeni fonksiyonu
ilgili servis modülüne yazıp `module.exports`'a ekle — cephe aynı adın iki modülde olmasına izin vermez.

## Kritik konvansiyonlar ve tuzaklar

1. **Yeni POST formu eklerken** şablona mutlaka
   `<input type="hidden" name="csrf_token" value="<%= csrf_token %>">` ekle — yoksa 400.
2. **`await` içeren her rota işleyicisini `sar()` ile sar** (`web.js`) — Express 4 async
   hataları kendiliğinden yakalamaz.
3. **Dosya kabul eden yeni rota** eklersen İKİ yer değişir: rotaya `...dosyaYukleyici(N)`
   middleware'i VE `web.js` içindeki `DOSYA_YOLLARI` regex listesi (aksi hâlde multipart
   istek kapıda 400 alır). Ayrıca N, formdaki dosya kutusu SAYISI kadar olmalı — tarayıcı
   boş dosya kutularını da multipart parçası olarak gönderir ve multer bunları sayar
   (bu yüzden denetim rotasında sınır `3 × soru sayısı`ndan hesaplanır).
4. **Liste/nesne alanları** TEXT kolonlarda JSON'dur — yazarken `js()`, okuma dönüşümleri
   `db.js`'teki satır dönüştürücülerde (`denetimRow` vb.).
5. **`denetimler.notu`**: `not` SQL anahtar sözcüğü olduğundan kolon adı `notu`; satır
   nesnesinde `not` olarak açılır. `no` kolonu sorgularda backtick'lenir.
6. **Şema değişikliği:** tablolar `CREATE TABLE IF NOT EXISTS` ile kurulur; mevcut kuruluma kolon
   eklemek için kolonu `db.js` → `EK_KOLONLAR` listesine yaz (init() ve `scripts/gecis-kontrol.js` aynı listeyi
   kullanır). YALNIZ EKLEME — kolon silme/yeniden adlandırma/tip değişikliği yapma (eski sürüme dönüşü bozar).
7. **5S formu** (sorular + puan kesme kuralları) tek yerde: `src/puanlama.js` → `BESS`.
   Denetmen puan girmez; **bulgu sayısı / Evet-Hayır** girer, puan `bessKriterPuanla` ile
   hesaplanır (sunucu bağlayıcı; istemcideki canlı hesap yalnız gösterim). e2e testi kriter
   listesini buradan okur — form değişince test kendiliğinden uyar.
8. **Kişi 5S puanlarının tek kaynağı `odul_kayitlari`** tablosudur; denetim silinince ödül
   kaydı da transaction içinde geri alınır (puan otomatik düşer). Bu kuralı bozma.
8b. **Yetki sistemi:** roller = ana yönetici (`session.super`, sabit, tüm yetkiler), ek yönetici
   (`session.yonetici_id`, `yoneticiler.yetkiler` JSON — alanlar `src/yetkiler.js`: `degerlendir`, `puanla`,
   `kayit`, `bes_plan`, `bes_denetim`, `bes_revize`, `bes_aksiyon`, `bes_odul`, `odul`, `kullanici`;
   tam yetki YOK — ek yönetici hesapları + işlem günlüğü yalnız ana yönetici; eski `["tam"]` kaydı 10 alana açılır),
   denetmen (`session.denetmen_id`). Yetkiler her istekte `cekirdek.js:oturumYetkileri` ile çözülür (`req.yetkiler`,
   `req.anaYonetici`, `req.denetmen`). Rotayı `yetkiGerek(alan)` / `girisRequired` / `anaYoneticiRequired` ile
   kapıla; şablonda `yetki('alan')` ile gizle — HER İKİSİNİ de yap. Eski kayıtlı `degerlendirme`/`bes_s`
   anahtarları okurken açılır (`ESKI_YETKILER`) — veritabanını elle güncellemeye gerek yok.
8b2. **Puan kuralları ayardır, sabit değildir:** öneri/kaizen oranları, öneri modu (tablo/sabit), ödül eşiği ve 5S
   tur ödülleri `config`'te (`puan_kurallari` sürümlü, `odul_ayarlari`). Kod içinde 10/50/25/300/100-75-50 YAZMA —
   `src/puanKurallari.js` (saf hesap) + `C.kuralCozucu()/C.guncelKural()/C.odulAyarlari()` kullan. Kayda onaylandığı
   günün sürümü uygulanır (`onay_zamani`). Ödülde düşülen puan `odul_arsiv.puan`, 5S puanı `odul_kayitlari.puan`'da
   saklıdır — ayar değişince geçmiş değişmez. Kullanıcı verisini `onsubmit="confirm('…<%= ad %>…')"` içine koyma;
   `data-onay="…"` + `confirm(this.dataset.onay)` kullan.
8c. **İsimler:** kişi girişleri ad + soyad ayrı kutulardır (`web.js:kisiOku`). Kişi karşılaştırmalarında
   ASLA `===` kullanma — `isim.js:isimEsit/isimIcerir` (anahtarla) kullan. Puan listesi `isimCozucu` +
   `isim_eslestirme` ile gruplar; kayıtlardaki isimler değiştirilmez.
8c2. **Bölüm listesi ortaktır:** `bolumler` tablosu hem 5S bölümleri hem öneri/kaizen formlarının açılır listesi
   (`servis/bolumler.js`, sayfa `/yonetici/bolumler`, yetki `bes_plan`). 5S'in "şimdiki" listeleri (tur planı, 5S tablosu,
   günlük kontrol formları) `C.besBolumleri()` (yalnız `bes_dahil`) kullanır; ad çözümü/geçmiş için `bolumMap()` (hepsi).
   Yeni bir 5S listesi yazarken `loadBolumler()` değil `besBolumleri()` kullan. Formdan gelen bölüm `C.bolumSecimi(girilen,
   await C.bolumAdlari(), mevcut)` ile doğrulanır; kayıt bölümü ADIYLA saklar. Personel (`kisiler`) ve ekip lideri için
   `C.bolumKisiEkle/bolumKisiSil/bolumLiderKaydet` kullan (5S ve Bölümler sayfası ortak).
8c3. **Görev tanımları** tek ortak listedir (`config.gorev_tanimlari`, `servis/gorevTanimlari.js`): öneri `gorevi`, kaizen
   `lider_gorevi` + `uye_gorevleri` (JSON, `uyeler` ile AYNI SIRADA) `C.gorevSecimi(...)` ile doğrulanır. Liste boşken öneride
   serbest metin, kaizende görev alanı yoktur. Bölüm ve görev alanları aynı şablonla çizilir: `partials/liste_secimi.ejs`
   (`alan_adi, etiket, secenekler, secili, mevcut, zorunlu, bos_yazi, serbest`); saf doğrulama `src/liste.js`.
8d. **Dosya yükleme sırası:** yetki/giriş middleware'i `...dosyaYukleyici(N)`'den ÖNCE gelir (girişsiz istek
   belleğe dosya alamasın). Dönüş adresleri (`geri`, `don`) daima `web.js:guvenliYol` ile doğrulanır.
9. Numara üretimi (`ÖNFR2607-01`) `sayaclar` tablosunda **atomik sayaçtır** — elle SELECT
   MAX + INSERT yazma.
10. Kullanıcı git commit'lerine **Co-Authored-By eklenmesini istemiyor**.

## Kısa tarihçe (git log ile birebir)

1. `5e8d3c7` İlk sürüm — Flask uygulamasının Node.js + SQLite portu (tam özellik eşleniği)
2. `09d7171` Dokümantasyon seti
3. `9aec218` **SQLite → MySQL geçişi** (async veri katmanı, atomik sayaç, transaction'lar)
4. `5ec68d8` R2: rota-bazlı multer + yükleme sınırları
5. `3c46785` R3: `https`/`proxy` yapılandırma bayrakları (secure cookie, HSTS, trust proxy)
6. `3be9661` R4+R5: sharp ile görsel işleme (EXIF temizliği, 1600px) + ZIP yedek (tablolar+görseller)
7. `494732f` Rapor yeniden yazımı + DAGITIM.md
8. `30a0125` **5S formu şirketin gerçek 5S Denetim Raporu şablonuna geçirildi** (5 bölüm / 23 soru: S1:25 S2:35 S3:20 S4:4 S5:16)
9. `d7d9099` **Kural tabanlı puanlama**: bulgu sayısı girilir, puan otomatik (ör. her bulgu −3; 5+ bulguda 0)
10. `5d6a5a2` Düzeltme: boş dosya kutuları 60-dosya sınırına takılıyordu
11. Kullanım kılavuzu genişletildi (`56f4684`)
12. **Ek yönetici + yetki sistemi:** ana yönetici, panelden ek yönetici ekler ve her birine
    yetki alanlarını (degerlendirme/bes_s/odul/kayit) kutucuklarla verir. `yoneticiler` tablosu,
    `yetkiGerek`/`superRequired` middleware, tüm rotalar/şablonlar yetkiye göre kapılandı (e2e 46/46).
13. **İşlem günlüğü:** `islem_gunlugu` tablosu; `web.js:flash()` her BAŞARILI yönetici/denetmen
    işlemini otomatik kaydeder (mesaj = flash metni). Ana yönetici `/yonetici/gunluk`'ta görür.
    Yeni bir loglanabilir eylem eklerken ekstra bir şey yapmana gerek yok — `flash(success)` yeter.
14. **Silinen kayıtlar:** `/sil` artık hard-delete değil — kaydı `silinen_kayitlar`e (ham JSON)
    taşır, kaizen görselleri diskte KALIR. `/silinenler` (yetki kayit): görüntüle/geri yükle/
    kalıcı sil (kalıcıda görseller de silinir). Geri yükleme ham satırı tabloya yeniden ekler.
15. **Form no** (Ekim 2026'da KALDIRILDI — atanmıyor/gösterilmiyor; `form_no` kolonu ve eski değerler yerinde):
    kayıt İLK "Onaylandı" olunca `nextFormNo()` (sayaclar `FORM-<yıl>`, atomik)
    ile `FR-YYYY-NNNN` atanır (öneri+kaizen ortak). `/durum` ve `/degerlendir/puan`'da atanır;
    `oneriler/kaizenler.form_no` kolonu (init migrasyonu). Excel'de: öneri 2. sütun, kaizen SON
    sütun (görsel J/K sütunları kaymasın diye).

16. **Ekim 2026 sürümü** (ayrıntı: DEGISIKLIKLER.md): öneri/kaizen liste+detay girişe kapalı (formlar açık),
    20'li sayfalama; detayda onay / gerekçeli red / denetmene düzeltme ataması; onaylanan öneriye görev +
    kaizene dönüştürme (`kaizen_no` ↔ `kaynak_oneri_no`); Reddedilen & Silinen arşivi (`/arsiv`); Görevlerim;
    ad/soyad ayrı + otomatik/elle isim birleştirme (`/isimler`); 10 ayrıntılı yetki;
    Panel (`/panel`, girişli herkes) ve Yönetim (`/yonetici`) ayrımı; 5S bölümler tablosu, bölüm trendi + S1–S5;
    denetim revize (ödül işlenmiş turda kapalı); **5S periyodik kontrol formu** (`kontrol_kayitlari`,
    `kontrol_onaylari`). Tüm şema değişiklikleri `init()` içinde yalnız ekleme (`kolonEkle`).
    Aynı sürümün devamında: kontrol formunda takvimli tarih (`?tarih=`), formdan aksiyon açma kaldırıldı,
    Excel seçilen aya kadar tüm aylar (her ay sayfa + ÖZET); ek yöneticiye tam yetki kaldırıldı (yönetici hesapları +
    günlük yalnız ana yönetici); form no kaldırıldı; kontrol formundan form kodu (T-FR016) kaldırıldı.
17. **Kod düzeni + güvenlik turu:** `cekirdek.js` 12 servis modülüne bölündü (98 fonksiyon birebir taşındı),
    kontrol rotaları `rotalar/kontrol.js`, `xlsxGonder/zipGonder` → `web.js`, `db.js` `EK_KOLONLAR`; giriş
    open-redirect (`/\`) + dizi `next`, CSRF timingSafeEqual, arşiv geri yükleme kolon denetimi, kılavuzdan
    varsayılan şifre; npm audit fix + multer 2. Yeni `scripts/gecis-kontrol.js`. Eski DB (1d67cea) ile geçiş
    doğrulaması 46/46. e2e 136/136.
18. **Puan ve Ödül Ayarları** (9 Ekim): `src/puanKurallari.js` + `servis/ayarlar.js` + `rotalar/ayarlar.js`
    (`/yonetici/puan-ayarlari`, ana yönetici): eşik, 5S tur ödülleri, öneri modu tablo/sabit, öneri/kaizen oranları;
    bugünden itibaren / geriye dönük; önizleme (`puanDurumu({surumler, esik})`); `onay_zamani` kolonları; onay
    pencerelerinde data-onay. e2e 157/157.
19. **Devreye alma incelemesi** (2 Kasım): `GUNCELLEME_REHBERI.md`; statik dosyalara `?v=<içerik özeti>`
    (`web.js:statikSurum` → `app.locals.sv`; eski sürüm style.css'i 1 yıl önbelleklettiği için güncellemede şart);
    `gecis-kontrol` veritabanı kullanıcısının CREATE/ALTER yetkisini SHOW GRANTS ile denetler (eksikse uygulama açılmaz);
    açılışta yetki hatası ayrı mesaj. Eski DB (1d67cea) ile geçiş 46/46 + geri dönüş yeniden doğrulandı. e2e 159/159.
    Yeni statik dosya eklerken şablonda `?v=<%= sv %>` kullan.
20. **Ortak bölüm listesi** (16 Kasım): `servis/bolumler.js` (katman 1; `bes` katman 2'ye indi), `rotalar/bolumler.js`,
    `views/bolumler.ejs`, `partials/bolum_secimi.ejs`; `bolumler.bes_dahil` + `oneriler.bolum` (EK_KOLONLAR → 28 kolon);
    öneri/kaizen formunda zorunlu açılır liste; 5S yalnız 5S'e dahil bölümler; 5S sekmesindeki ekle/sil Bölümler'e taşındı
    (eski uçlar duruyor); gecis-kontrol §6 bölüm listesi; `flash(req, "uyari", …)` (sarı, günlüğe yazılmaz).
    Eski DB ile geçiş + geri dönüş denendi. e2e 181/181.
21. **Bölüm personeli + görev tanımları** (16 Kasım, devam): "Bölümler ve Görevler" sayfası; bölüm sayfası
    `/yonetici/bolumler/:bid` (ekip lideri + toplu personel); görev tanımları (`/yonetici/gorevler/*`, config); öneri
    görevi ve kaizen ekip görevleri açılır listeden (`kaizenler.lider_gorevi`, `uye_gorevleri` → 30 kolon); `src/liste.js`,
    `servis/gorevTanimlari.js` (katman 0), `partials/liste_secimi.ejs` (`bolum_secimi.ejs` kaldırıldı). Eski DB ile geçiş +
    geri dönüş denendi. e2e 203/203.
22. **Görev atamasında termin + açıklama zorunlu** (23 Kasım): `admin.js:gorevAlanlari` (/durum onay + /gorev ortak;
    termin geçerli tarih ve bugünden önce değil, değişmeyen eski termin kabul); onay kartında denetmen seçilince alanlar
    `required` (detay.ejs satır içi betik, takvimin görünen kutusu dahil); `res.locals.bugun_iso`. e2e 210/210.
23. **Onaylı öneri havuzu** (25 Kasım): `POST /oneri/havuz` (`admin.js`, yetki `degerlendir`; islem `beklemeye_al` /
    `havuzdan_cikar` / `uygulanamadi` / `yeniden_ac`); `oneriler.uygulama_durumu` ('beklemede' | 'uygulanamadi' | NULL) +
    `bekleme_kategori/nedeni/gozden`, `uygulanamadi_nedeni`, `uygulama_isleyen/zamani` (EK_KOLONLAR → 37 kolon); türler
    `S.BEKLEME_KATEGORILERI`. Kayıt "Onaylandı" kalır (puan değişmez); havuzda/kapalıyken `/gorev`, onayla görev ve
    `kaizeneDonusturebilir` kapalı; havuza alınca/kapatınca görev temizlenir. Tarih denetimi `admin.js:ileriTarihHatasi`
    (görev termini ile ortak). Havuz listesi (sonradan ayrı sayfa: madde 27), `C.havuzOzeti` (panel), `acikAtamalar().gozden`,
    öneri Excel'inin son 4 sütunu. Eski DB ile geçiş + geri dönüş denendi. e2e 236/236.
24. **Kontrol formu Excel'i yalnız seçilen ay** (25 Kasım): `rotalar/kontrol.js` excel rotası tek ay gönderir; dosya adı
    `5S_Kontrol_Formu_<Bölüm>_<ay>.xlsx`; `generateKontrolExcel` önce form sayfası(ları), sonra ÖZET (üretici hâlâ çok ayı
    destekler). Düğme "⬇ Excel (seçilen ay)". Veritabanı değişmedi. e2e 237/237.
25. **Mobil menü + 5S menüde + liste bölüm filtresi** (25 Kasım): `style.css` ≤1160 px düğme düzeni (sonra ≤1220, madde 29), 1161–1380 px
    `.brand-logo + span` gizli; üst menüde `/5s` (yalnız girişli); `kayitlar.filtrele(..., bolum)` (`L.anahtar` ile, `BOLUMSUZ = "-"`),
    `listeBolumleri(records, bolumAdlari)`; listede Bölüm sütunu. e2e 241/241.
26. **Kaizen maliyet hesabı (€)** (25 Kasım): `kaizenler.onceki_maliyet/sonraki_maliyet` DECIMAL(14,2) (EK_KOLONLAR → 39 kolon;
    `kaizenRow` sayıya çevirir, yoksa null); formda zorunlu (`kaizen.js:maliyetOku`, saf `yardimci.paraOku` — `1.250,50`/`1250.5`
    kabul, eksi yok); `paraFmt`, `maliyetFarki` (önceki − sonraki → kazanç/zarar; `res.locals.parafmt/maliyetFarki`); formda
    canlı fark (satır içi betik), detayda kazanç/zarar, kaizen Excel'inin son 3 sütunu (€ biçimli). e2e 254/254.
27. **Öneri Havuzu sayfası** (25 Kasım): `GET /havuz` (`genel.js`, girişli) + `views/havuz.ejs`, `kayitlar.havuzKayitlari()`;
    `filtrele` havuzdakileri (`uygulama_durumu` dolu) ana listeden çıkarır; `?durum=havuz|uygulanamadi` → `/havuz#…` yönlendirme.
    Emoji yerine SVG ikonlar: `web.js:IKONLAR` → `res.locals.ikon` (`bekle`, `kapali`, `devam`, `takvim`; şablonda `<%- ikon.bekle %>`).
    e2e 257/257.
28. **5S Aksiyonlar grupları** (25 Kasım): `aksiyon.aksiyonGruplari` artık yalnız `tur_adi` ile gruplar (aksiyon `tarih`'i denetimin
    yapıldığı gün — tarihle gruplayınca aynı turu bölüyordu); başlıkta bölüm çipleri (`.bolum-cip`), en yeni açık grup `open`. e2e 259/259.
29. **Görsel düzen** (25 Kasım): emoji yerine **Lucide çizgi ikonları** — `src/ikonlar.js` (yalnız kullanılan ~56 ikon, ISC lisans
    başlıkta; yeni ikon: lucide-static `icons/<ad>.svg` gövdesini ekle), şablonda `<%- ik('ad') %>` (`res.locals.ik`; bilinmeyen ad
    boş döner + uyarı). Madalyalar `.madalya.m1/m2/m3`. **Yeni şablon metninde emoji kullanma** (e2e üst menüde emoji arar).
    Liste telefonda `.liste-tablo` grid kartı (`c-tur/c-no/c-tarih/c-konu/c-kisi/c-bolum/c-durum/c-puan/c-islem`). Yönetim sekmeleri
    (`.ysekme[data-sekme]`, `#denetmenler|#misafirler|#yoneticiler|#sifre`; betiksiz hepsi görünür). Üst menüde Puan Listesi (girişli);
    menü kırılımları ≤1220 px düğme, 1221–1440 px marka yazısı gizli. `GET /yonetici/gunluk/excel` (ana yönetici, `tumGunluk`,
    `generateGunlukExcel`). Bölüm sayfasında tek denetim tablosu. e2e 265/265.
30. **Denetmen kısıtları** (25 Kasım): `/5s/aksiyonlar` `girisRequired`; denetmene `aksiyonGruplari(..., kisiAd)` filtresi (atanan lider
    `isimIcerir` veya `sorumlu` `isimEsit`); kontrol formu Excel'i `adminRequired`. **Kural: denetmen hiçbir Excel/ZIP indiremez** —
    yeni indirme ucu `yetkiGerek(...)`/`adminRequired` ile, düğmesi `yetki(...)`/`admin` ile kapılanır. e2e 273/273.
31. **Düzeltme: bölüm sayfasındaki aksiyon bağlantısı 404** (25 Kasım): `<<%= koşul ? 'a href="…"' : 'div' %>` kalıbında `<%=` tırnakları
    `&#34;` yaptı → href bozuldu. Etiket parçası basarken `<%-` kullan (yalnız sabit metin). e2e'ye **bağlantı taraması** eklendi
    (ana yönetici + denetmen olarak siteyi gezer; bozuk href / 404 / 500 yakalar). e2e 275/275.
32. **Düzeltme: kontrol formu aylık tablosu telefonda** (25 Kasım): ≤860 px'teki genel `.data-table` → kart kuralı ızgarayı bozuyordu;
    `.kontrol-tablo` için tablo düzeni geri yüklenir, `.table-wrap.yatay-kaydir` yatay kayar, `.kt-madde` sticky; `th.kt-bugun`
    sütununa otomatik kaydırma (satır içi betik). Zebra kuralı (`tr:nth-child(even) td`) `.kt-ok/.kt-x/.kt-pazar`'ı eziyordu →
    daha özgül seçici. **Izgara tipi yeni tablolar** için de aynı sınıflar (kart düzeni yalnız kayıt-satırı tabloları için). e2e 276/276.

## Açık konular

- GUNCELLEME_REHBERI.md §6 (2 Kasım): Ö14 öneri/kaizen Excel'inde isimler ham (kişi bazlı sayım bölünür) ·
  Ö15 `npm test` koruması · Ö16 ZIP yedek geri yükleme aracı/artımlı foto · Ö17 bellekte yükleme · Ö18 IP'ye bağlı limitler.
- IYILESTIRME_ANALIZI.md §5: 🔴 Ö9 depo public + varsayılan şifre, 🟠 Ö10 giriş şifre taraması (pbkdf2Sync),
  🟠 Ö12 oturum (GET çıkış, şifre değişince oturum düşmüyor), Ö1 CSP inline JS (9 şablon), Ö5 CI, Ö13 bes_s/admin
  rota bölünmesi + lint + birim test, Ö4 FK, Ö2 Excel worker, Ö3 log + `/saglik`, Ö11 sicil no.
- Giriş "şifre = kimlik": her başarısız giriş tüm hesap hash'lerini `pbkdf2Sync` ile tarar (hesap başına
  ~0,28 sn, olay döngüsünü bloklar). Komite puanlaması (15 hesap) konuşuldu — yapılırsa önce Ö10.
- Fikir (25 Kasım, kullanıcı "şimdilik manuel, ileride belki" dedi): öneri/kaizen formlarında kişi adını bölüm personeli
  listesinden seçtirme (bölüm seç → o bölümün personeli; kaizende tüm personel aranabilir) + "Listede yok, elle yaz" yedeği.
  Dikkat: formlar girişsiz ve site internete açık → tüm çalışan adlarını açık sayfada listelemek KVKK konusu; önce İK/bilgi işlemle konuşulmalı.
- **Bekleyen görsel öneriler** (25 Kasım, kullanıcı "sakla" dedi — sırası gelince sorulacak; önerilen sıra 1+5, sonra 2+3):
  1) 5S denetim formu telefonda: soru metni dar sütunda (tam genişlik yapılmalı), her soruda 3 ham "Dosya Seç" (toplam 69) →
  tek "Fotoğraf ekle" düğmesi + küçük önizleme (DOSYA_YOLLARI / dosyaYukleyici sayısına dikkat — tuzak 3). 2) Puan listesi
  telefonda kişi başı ~10 satırlık kart → kısa kart (sıra · ad · net; öneri/kaizen/5S tek satır). 3) Öneri Havuzu ve
  Reddedilen & Silinen telefonda aynı uzun kart → kısa kart. 4) Kırmızı düğme kalabalığı: puan listesinde her satırda
  "Kaldır", 5S'te "Sil" "Formu Gör"ün yanında → satır ayrıntısına taşı. 5) Kaizen formu ve aksiyon kapatmada ham
  "Dosya Seç" kutuları (1 ile aynı düzeltme).
- Karar bekliyor: ZIP/Excel dosya adındaki tarih tur başlangıç tarihi (`d.tarih`) —
  gerçekleşme tarihine (`denetim_tarihi`) çevrilmesi önerildi, kullanıcı henüz onaylamadı.
