# Teknik Doküman — Yalın Üretim Uygulamaları

Bu belge uygulamanın **mimarisini, veri modelini, iş kurallarını ve iç işleyişini** anlatır.
Kod tabanını devralacak bir geliştirici için referanstır. Kullanıcı odaklı özet için
[README.md](README.md), bilinen riskler ve iyileştirme planı için
[IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md) dosyalarına bakın.

---

## 1. Genel Bakış

| | |
|---|---|
| **Tür** | Fabrika içi web uygulaması — Öneri, Kaizen, 5S denetim + personel puan/ödül sistemi |
| **Çalışma modeli** | Tek Node.js süreci, sunucu tarafı render (SPA değil), dış CDN yok |
| **Veritabanı** | MySQL 8 (`mysql2/promise` bağlantı havuzu, 10 bağlantı) — utf8mb4 + `utf8mb4_turkish_ci` |
| **Arayüz** | EJS şablonları + tek `static/style.css` + az miktarda vanilla JS |
| **Raporlama** | exceljs (Excel), archiver (fotoğraf ZIP'leri) — talep anında üretilir |
| **Kimlik** | İmzalı çerez oturumu (cookie-session, 12 saat), şifreden rol tanıma |

### Bağımlılıklar

`express` (web çatısı) · `mysql2` (MySQL sürücüsü, promise API) · `ejs` (şablon) ·
`exceljs` (Excel) · `archiver` (ZIP) · `multer` (dosya yükleme) · `cookie-session` (oturum) ·
`sharp` (görsel işleme — hazır binary ile kurulur, derleme gerektirmez).

---

## 2. Katmanlı Mimari

Bağımlılık yönü tek taraflıdır, döngü yoktur:

```
sabitler.js   → yollar, sabit değerler, TR saat yardımcıları        (saf, bağımlılıksız)
isim.js       → ad/soyad düzeltme, isim karşılaştırma anahtarı      (saf)
yetkiler.js   → ek yönetici yetki alanları + eski anahtar açılımı   (saf)
kontrol.js    → 5S periyodik kontrol formu tanımı + takvim           (saf)
puanlama.js   → öneri/kaizen rubriği + 5S kriter tanımları          (saf, IO/Express yok)
db.js         → MySQL havuzu + şema + EK_KOLONLAR + sorgu/transaction yardımcıları + otomatik yedek
servis/*.js   → iş mantığı, 12 alan modülü, 5 katman                 (Express'e bağımlı DEĞİL)
cekirdek.js   → cephe: servis modüllerini tek nesnede toplar (rotalar C.xxx ile kullanır)
web.js        → HTTP yardımcıları: sar(), flash, CSRF, hız limiti, yetki, Excel/ZIP yanıtları
rotalar/*.js  → HTTP rotaları (module.exports = register(app) deseni)
server.js     → async main(): şema kurulumu → Express kurulumu → middleware → modül kaydı
```

Veri erişimi **tamamen asenkrondur** (`async/await`). `db.js` üç yardımcı sunar:
`sorgu(sql, params)` (satır listesi), `tek(...)` (ilk satır), `calistir(...)` (INSERT/UPDATE
sonucu) ve `transaction(fn)` — `fn(conn)` tek transaction içinde çalışır, hata durumunda
tamamı geri alınır. Express 4 async hataları kendiliğinden yakalamadığından tüm async rota
işleyicileri `web.js:sar()` sarıcısıyla kaydedilir (reddedilen promise 500 işleyiciye düşer).

İş mantığı oturuma ihtiyaç duyduğunda `session` nesnesini **parametre olarak alır**
(`aktifDenetmen(session)`, `aksiyonKapatabilir(a, session)`) — bu sayede Express olmadan
test edilebilir.

### Servis modülleri ve katmanları

Bir modül yalnızca kendinden **alttaki** katmanlara dayanır (döngüsel bağımlılık yoktur). `cekirdek.js` hepsini tek
nesnede toplar ve aynı adın iki modülde tanımlanmasına izin vermez (açılışta hata). Yeni bir iş fonksiyonu, alanına
uygun modüle eklenir ve `module.exports` listesine yazılır; rotalar değişmeden `C.yeniFonksiyon` ile erişir.

| Katman | Modül | İçerik |
|---|---|---|
| 0 | `servis/guvenlik.js` | `hashPassword`, `checkPassword` (werkzeug pbkdf2/scrypt uyumlu), `adminSifreDogru`, `setAdminPassword`, `sifreleriHashle`, `getSecretKey` |
| 0 | `servis/yardimci.js` | `uid`, `nextNumber` (atomik sayaç), `safeName`, `allowedFile`, `guvenliYol` (dosya), `trdate`, `ayEtiketi`, `puanfmt`, `gorselKaydet` (imza + sharp), `logoBul` (5 dk önbellek) |
| 0 | `servis/gunluk.js` | `gunlukEkle`, `loadGunluk`, `gunlukTemizle` |
| 0 | `servis/ayarlar.js` | `puanKurallari`, `odulAyarlari`, `guncelKural`, `kuralCozucu`, `puanKuralKaydet`, `puanKuralSil`, `odulAyarKaydet` |
| 1 | `servis/kayitlar.js` | `getRecord`, `updateRecord`, `combinedRecords`, `filtrele`, `sayfala`, `mevcutAylar`, `kayitDuzenleyebilir`, `kaizeneDonusturebilir`, `kaizenKaydetGorsel` |
| 1 | `servis/bes.js` | bölüm/denetim/aksiyon okuma, `besSTur*`, `besSIsle`, `besSPlanSatirlari`, `besSTrendTablo`, `turIslendi`, `denetimKriterPuanlari`, `saveDenetimFotolar` |
| 2 | `servis/hesaplar.js` | denetmen/misafir/yönetici okuma, `denetmenBySifre`, `yoneticiBySifre`, `aktifDenetmen`, `oturumYetkileri`, `sifreCakismasi`, `bolumLiderleri`, `denetmenAdaylari` |
| 2 | `servis/kontrolFormu.js` | `kontrolDoldurabilir`, `kontrolImzalayabilir`, `kontrolAy`, `kontrolAylari`, `kontrolKaydet`, `kontrolImzala`, `kontrolOzet`, `bugunkuKontroller` |
| 3 | `servis/isimler.js` | `isimCozucu`, `gorunenAd`, `isimGruplari`, `isimBirlestir`, `isimAyir` |
| 3 | `servis/aksiyon.js` | `aksiyonAtanan`, `aksiyonKapatabilir`, `aksiyonGruplari`, `aksiyonFotolari`, `syncDenetimAksiyonlari`, `saveAksiyonFotolar` |
| 4 | `servis/puan.js` | `puanDurumu` |
| 4 | `servis/gorevler.js` | `gorevlerim`, `acikAtamalar`, `gorevSayisi` |
| 4 | `servis/panel.js` | `dashboardIstatistik` |

### Dosya dosya döküm

| Dosya | Sorumluluk |
|---|---|
| `server.js` | Express app, middleware sırası, rota modüllerinin kaydı, 404/500 yakalayıcı, `listen` |
| `src/sabitler.js` | `DATA_DIR` (env ile taşınabilir), tüm klasör yolları, `ODUL_ESIK=300`, `ODUL_MAP={100,75,50}`, `DURUMLAR`, `KAZANC_BASLIKLARI`, `TR_AYLAR`, `ALAN_MAX=5000`, `nowTr()/bugunIso()/zamanTr()` (Europe/Istanbul) |
| `src/isim.js` | `adDuzelt` (Türkçe baş harf büyük), `adSoyad`, `adBol` (düzenleme formu için), `isimAnahtar` (büyük/küçük harf, boşluk, noktalama, Türkçe karakter farkını yok sayan karşılaştırma anahtarı), `isimIcerir` ("Ali / Veli" listesinde arama), `uzaklik` (Damerau-Levenshtein — yazım hatası önerileri) |
| `src/yetkiler.js` | `YETKI_GRUPLARI` (10 ayrıntılı alan, 4 grup), `ESKI_YETKILER` (eski `degerlendirme`/`bes_s`/`tam` → yeni alanlar), `yetkiGenislet(liste)` → `{yetkiler}`, `yetkiFormdan(v)` |
| `src/puanKurallari.js` | Puan kuralları (saf): varsayılanlar, doğrulama (`kuralDogrula`, `odulDogrula`), sürüm seçimi (`kuralTarihi`, `kuralSec`, `yeniSurumler`), kazanç hesabı (`oneriKazanci`, `kaizenKazanci`, `puanAldi`), `kuralMetni` |
| `src/kontrol.js` | `KONTROL_FORMU` (10 G + 3 H + 2 A madde, form notu; form kodu gösterilmez), `ayGunSayisi`, `haftaNo`/`haftalar` (Pazartesi başlangıçlı ay haftaları), `ayKaydir`, `ayCoz` |
| `src/puanlama.js` | `PUAN_TEMEL/ETKI/MALIYET/YAYGIN/EFOR` rubrik tanımları, `PUAN_MAX`, `BESS` (şirket 5S formu: 5 bölüm / 23 soru, soru başına maksimum + kesme kuralı), `BESS_KRITER_MAX`, `bessKriterPuanla(k, bulgu)` (kuraldan puan), `bessKuralMetni(kr)`, `bessBulguTahmin` (eski kayıtta puandan bulgu), `bessBolumToplamlari` (S1–S5 toplamları), `hesaplaPuanlama(form)`, `puanlamaOzet(p)` |
| `src/db.js` | mysql2 bağlantı havuzu, `CREATE TABLE IF NOT EXISTS` şeması + `EK_KOLONLAR` (sonradan eklenen kolonların tek listesi; `init()` ve `scripts/gecis-kontrol.js` ortak kullanır), `sorgu/tek/calistir/transaction` yardımcıları, JSON kolon yardımcıları (`j`/`js`), satır dönüştürücüler (`oneriRow`, `denetimRow`…), `configGet/Set`, `yedekle()` (tüm tablolar + görseller → ZIP) + `baslatYedekleme()` |
| `src/cekirdek.js` | Cephe: `src/servis/*` modüllerini tek nesnede toplar (yukarıdaki tablo) |
| `src/web.js` | `flash` (+ işlem günlüğü), `hizLimitAsildi`, `alan` (kırp + 5000 sınır), `adSoyadOku`/`kisiOku` (ad + soyad kutuları, eski tek kutu da kabul), `guvenliYol` (site içi dönüş adresi), `ortakLocals` (yetki çözümü, `req.denetmen`, görev rozeti, şablon değişkenleri, flash, CSRF), `csrfDogrula` (sabit zamanlı karşılaştırma), `dosyaYukleyici`, `guvenlikBasliklari`, `xlsxGonder`, `zipGonder`, yetki middleware'leri: `girisRequired`, `adminRequired`, `yetkiGerek(alan)`, `anaYoneticiRequired`, `denetciRequired` |
| `src/excel.js` | 9 rapor üreticisi: öneri, kaizen (görsel gömülü), 5S toplu, 5S tek form, aksiyonlar, puan listesi, ödül alanlar, 5S trend (renkli fark), periyodik kontrol formu (seçilen aya kadar her ay bir sayfa + ÖZET) — hepsi buffer döner |
| `src/rotalar/genel.js` | Anasayfa, kılavuz, **panel**, liste (giriş + sayfalama), detay, **arşiv** (reddedilen + silinen, silinen detayı), **görevlerim**, puan durumu, ödül ver/sil, kişi gizle, **isim birleştirme**, Excel'ler |
| `src/rotalar/oneri.js` | Öneri yeni (herkese açık) / düzenle (kayıt yetkisi veya düzeltmesi atanan denetmen) / Excel |
| `src/rotalar/kaizen.js` | Kaizen yeni / **öneriden dönüştür** / düzenle / Excel / görsel servisi (girişli) |
| `src/rotalar/bes_s.js` | 5S: bölümler (liste + trend), plan, denetim (yap/göster/**revize**/sil/Excel/ZIP), aksiyonlar, ödül işleme, geçmiş, görsel servisleri |
| `src/rotalar/ayarlar.js` | **Puan ve Ödül Ayarları** (yalnız ana yönetici): görüntüle, önizle (`islem=onizle`), kaydet, kural sürümü kaldır |
| `src/rotalar/kontrol.js` | **Periyodik kontrol formu**: görüntüle (`?tarih=`), doldur, haftalık/aylık imza, Excel (`?ay=` — o aya kadar) |
| `src/rotalar/admin.js` | Giriş/çıkış, **Yönetim** sayfası, ek yönetici (yalnız ana yönetici) ve denetmen/misafir yönetimi, şifre, durum değişikliği (onay / gerekçeli red / düzeltme ataması), **görev ataması**, puanlama, kayıt silme, trend Excel |
| `scripts/import-json.js` | Eski JSON tabanlı sürümden veri + görsel aktarımı (kaynağa salt-okunur, tek transaction, hata durumunda tam geri alma) |
| `scripts/sqlite-to-mysql.js` | Önceki SQLite sürümünden (`data/yalin.db`) tüm tabloları MySQL'e taşır (`npm run migrate`) |
| `scripts/gecis-kontrol.js` | Canlıya almadan önce **salt-okunur** veritabanı ön kontrolü (`npm run gecis-kontrol`): şema farkı, isimler, yetkiler, varsayılan şifre — bkz. VERITABANI_GECIS.md |
| `scripts/e2e-test.js` | Uçtan uca test paketi — ayrı veritabanı (`yalin_e2e`) + geçici veri klasörü + ayrı port (`npm test`) |

---

## 3. İstek Yaşam Döngüsü

```
İstek gelir
  └─ guvenlikBasliklari      → CSP, nosniff, X-Frame-Options DENY, Referrer-Policy
  └─ /static                 → express.static (maxAge 365 gün)
  └─ express.urlencoded      → form gövdesi (1 MB sınır)
  └─ cookie-session          → imzalı çerez çözülür (12 saat, HttpOnly, SameSite=Lax)
  └─ ortakLocals             → yetki çözümü (req.yetkiler, req.denetmen), şablon değişkenleri, flash, CSRF
  └─ csrfDogrula             → POST ise csrf_token doğrulanır; multipart yalnız dosya uçlarına geçer
  └─ Rota
       ├─ girisRequired / yetkiGerek(alan) / denetciRequired …  (yetki — DOSYA YÜKLEMESİNDEN ÖNCE)
       ├─ dosyaYukleyici(N)                  (yalnız dosya uçlarında: multer bellek, 8 MB/dosya + CSRF)
       ├─ hizLimitAsildi(...)                (herkese açık yazma uçları)
       ├─ servis/* (cekirdek.js cephesi üzerinden) iş mantığı + parametreli SQL
       └─ res.render / res.redirect / buffer indirme
  └─ 404 / 500 yakalayıcı (hata detayı yalnızca sunucu konsoluna)
```

---

## 4. Veri Modeli (MySQL)

Tüm tablolar InnoDB, `utf8mb4` karakter seti ve `utf8mb4_turkish_ci` collation ile kurulur
(Türkçe karakterler ve sıralama doğru çalışır). Liste/nesne değerli alanlar **TEXT kolonlarında
JSON** olarak saklanır; okurken `db.js`'teki satır dönüştürücüler nesneye çevirir. Tarihler ISO
(`YYYY-MM-DD`), zaman damgaları `DD.MM.YYYY HH:MM` (TR saati) formatındadır.

| Tablo | Anahtar | Önemli kolonlar |
|---|---|---|
| `config` | `anahtar` | `admin_password` (hash), `secret_key` (oturum imzası), `puan_kurallari` (öneri/kaizen kural sürümleri, JSON), `odul_ayarlari` (eşik + 5S tur ödülleri, JSON) |
| `oneriler` | `no` (ÖNFR…) | tarih, sahibi, görev, konu, detay, çözüm, 4 katkı alanı, durum, `onay_zamani` (ilk onay — puan kuralı seçimi), `form_no` (eski, gösterilmez), `puan`, `puanlama` (JSON kırılım), degerlendirme_notu, `red_nedeni`, `revize_*` (düzeltme: not, atanan denetmen id/ad, isteyen, zaman, tamamlandı), `gorev_*` (görev: atanan id/ad, termin, not, atayan, zaman), `kaizen_no` (dönüştürülen kaizen) |
| `kaizenler` | `no` (ÖSKFR…) | başlangıç/bitiş, konu, bölüm, lider, `uyeler` (JSON), sorumlular, `kazanclar` (JSON), önceki/sonraki + görsel adları, durum, `onay_zamani` (ilk onay — puan kuralı seçimi), `form_no` (eski, gösterilmez), puan, puanlama, `red_nedeni`, `revize_*`, `kaynak_oneri_no` |
| `bolumler` | `id` (hex8) | ad, `sorumlu` ("Ali / Veli" — çoklu lider), `kisiler` (JSON) |
| `denetimler` | `id` (hex8) | `revize_eden`, `revize_zamani` (denetim revizesi), bolum_id, `tarih` (**tur kimliği**), tur_adi, baslangic/bitis, plan_gun/saat, planlanan/misafir/gerçek denetmen, `puan` (NULL=bekliyor), `puanlar` (JSON kriter→hesaplanan puan), `bulgular` (JSON kriter→bulgu sayısı), `notu`, `aciklamalar` (JSON), `fotolar` (JSON kriter→[dosya]), denetim_tarihi |
| `aksiyonlar` | `id` (hex8) | denetim_id, tur/bölüm bilgisi, kriter_k/m, aksiyon, sorumlu, atanan_lider, termin, durum (acik/kapali), `kapatma` (JSON: açıklama+kapatan+fotolar+zaman) |
| `odul_islenen` | `tarih` | ödülleri işlenmiş tur tarihleri |
| `odul_kayitlari` | otomatik | tur tarihi/adı, bölüm, sıra (1-3), puan (100/75/50), `kisiler` (JSON) — **kişi 5S puanlarının tek kaynağı** |
| `odul_arsiv` | otomatik | verilen 300'lük ödüller (ad, puan, tarih, zaman) |
| `silinen_kisiler` | `ad` | puan listesinden gizlenenler (puanlar silinmez) |
| `denetmenler` | `id` | ad, `sifre` (hash), oluşturma |
| `misafirler` | `id` | ad, oluşturma |
| `yoneticiler` | `id` | ek yönetici: ad, `sifre` (hash), `yetkiler` (JSON — `src/yetkiler.js` alanları; eski `degerlendirme`/`bes_s`/`tam` okunurken alanlara açılır), oluşturma |
| `isim_eslestirme` | `kaynak` | elle isim birleştirme: kaynak isim anahtarı → hedef anahtar (zincir izlenir, döngü engellenir) |
| `kontrol_kayitlari` | otomatik (`bolum_id, ay, gun, madde` tekil) | Kontrol formu işaretleri: durum (uygun/uygunsuz), açıklama, işaretleyen, zaman |
| `kontrol_onaylari` | otomatik (`bolum_id, ay, tip, sira` tekil) | haftalık (`tip=hafta`, `sira`=ay haftası) ve aylık (`tip=ay`) kontrol imzaları |
| `islem_gunlugu` · `silinen_kayitlar` | otomatik | işlem günlüğü (flash ile) · silinen öneri/kaizenin ham satırı (geri yükleme) |
| `sayaclar` | `onek` | öneri/kaizen numara sayaçları (ör. `ÖNFR2607-` → 2) — atomik artırma |

**Kritik tasarım kararları:**
- **`denetimler.tarih` = tur kimliği.** Bir denetim turu, plan başlangıç tarihiyle ayırt edilir;
  bu yüzden aynı başlangıç tarihiyle ikinci tur açmak engellenir (aksi hâlde eski tamamlanmış
  kayıtlarla çakışır).
- **5S ödül defteri (`odul_kayitlari`) kişi 5S puanlarının tek kaynağıdır.** Denetim silinirse
  ilgili bölümün ödül kaydı da silinir → kişilerin puanı otomatik düşer; o turdan hiç kayıt
  kalmazsa tur `odul_islenen`'den çıkarılır.
- **`bolumler.sorumlu` çoklu lider taşır** ("Ali / Veli"); `isimListesi()` her yerde `/ , ;`
  ayraçlarıyla böler — yetki kontrolleri (denetim yapma, aksiyon kapatma) iki lideri de kapsar.
- `denetimler.notu`: `not` SQL anahtar sözcüğü olduğundan kolon adı `notu`dur; satır
  dönüştürücü nesneye `not` olarak açar.

---

## 5. Önemli İş Kuralları ve Algoritmalar

### Numara üretimi (`nextNumber`)
`ÖNFR2607-01` = önek + yıl(2) + ay(2) + o ayki sıra. Sıra her ay sıfırlanır. Numara,
`sayaclar` tablosundaki **atomik sayaçtan** alınır (`UPDATE ... SET sayac = LAST_INSERT_ID(sayac+1)`
deseni) → eşzamanlı gönderimde mükerrer numara oluşmaz. Sayaç kaydı yoksa (ör. veri aktarımından
sonra ilk kayıt) mevcut kayıtların en büyük sırasından otomatik tohumlanır.

### Puanlama motoru (`hesaplaPuanlama`)
- **Temel Şartlar** ÇOKLU: iki madde de puanlanır, toplanır (max 10).
- **Etki / Maliyet / Yaygın / Efor** TEK: bölümde yalnızca en yüksek puanlı tek madde sayılır.
- Her değer 0–madde maksimumuna sıkıştırılır; `puan_items` düzenleme ekranı ön-doldurması için saklanır.
- İstemci tarafında aynı kurallar JS ile canlı hesaplanır (tek-seçimli bölümde diğerleri sıfırlanır);
  **sunucu hesabı bağlayıcıdır**.

### Puan durumu (`puanDurumu`) ve puan kuralları
Kurallar `src/puanKurallari.js` (saf) + `src/servis/ayarlar.js` (config'de saklama). Varsayılan: öneri → sahibine
tablo puanının %10'u · kaizen → lider %50, üye başına %25 (max 2 üye) · 5S → ödül defterindeki her kayıttan kişilere
(tur işlenirken yazılan puan: varsayılan 100/75/50) · ödül eşiği 300.
- **Kural sürümleri** (`config.puan_kurallari`, JSON dizi): `{gecerlilik, oneri_mod: "tablo"|"sabit", oneri_oran,
  oneri_sabit, kaizen_lider_oran, kaizen_uye_oran, kaydeden, zaman}`. Bir kayda `kuralTarihi(r)` gününde geçerli
  sürüm uygulanır: onaylı kayıtta `onay_zamani` (yoksa `kayit_zamani`, yoksa `tarih`), onaylanmamış kayıtta bugün
  (ekranda "onaylanınca ne olur" doğru görünsün). "Bundan sonra" kaydı bugünün tarihiyle sürüm ekler (aynı gün
  sürümünün yerine geçer); "geriye dönük" kaydı geçmişi silip tek sürüm (`2000-01-01`) bırakır.
- **Sabit mod:** onaylanan öneri sahibine `oneri_sabit` puan; tablo puanı hesaba girmez ve `/degerlendir/puan`
  bu öneriler için kapalıdır (liste/detayda Puanla düğmesi gizlenir).
- **Ödül ayarları** (`config.odul_ayarlari`): `{esik, bes:[1.,2.,3.]}` — sürümsüz, hemen geçerli. Ödül verilirken
  düşülen puan `odul_arsiv.puan`'a yazılır (eşik değişse de aynı kalır; ödül sayısı satır sayısıdır). 5S puanı tur
  işlenirken `odul_kayitlari.puan`'a yazılır; işlenmiş turun gösterimi defterdeki değeri kullanır.
- Net = kazanılan − ödüllerde düşülenler; `silinen_kisiler` gizlenir, net ≤ 0 olan listeden düşer.
- `puanDurumu({ surumler, esik })` verilirse kayıtlı ayar yerine onlar kullanılır — ayar sayfasındaki önizleme bununla
  "şu an / yeni ayarla" karşılaştırması yapar (`rotalar/ayarlar.js:etkiOzeti`).

### 5S denetim turu ve dağıtım (`/5s/plan/dagit`)
- **kendi:** her bölümün planlanan denetmeni kendi ekip lideri/liderleri olur.
- **capraz:** bölüm-bazlı **dengeli derangement** — rastgele permütasyon 500 denemeye kadar aranır;
  koşul: her bölümü denetleyecek bölümün lider kümesi boş olmayacak VE denetlenen bölümün lider
  kümesiyle **kesişmeyecek** (kimse kendi/ortak-lider olduğu bölüme denk gelmez).
- **misafirler:** karıştırılmış bloklar hâlinde dağıtılır — kişi başına denetim sayısı farkı en fazla 1.

### Denetim kaydetme (`POST /5s/bolum/:bid/denetim`)
Denetmen 23 soru için **bulgu sayısı** (veya Evet/Hayır) girer; puan `puanlama.js`'teki
kuraldan hesaplanır (`bessKriterPuanla`: bulgu tipi → eşikte 0, yoksa max − düşüş×bulgu;
evet_hayir → ya tam puan ya 0). Bölüm dağılımı S1:25 · S2:35 · S3:20 · S4:4 · S5:16 = 100.
Bulgu sayıları `bulgular` JSON kolonunda saklanır (Excel'de "Bulgu Sayısı" sütunu);
kriter fotoğrafları (max 3/kriter) doğrulanıp diske, adları JSON
kolonuna yazılır. Denetmen girişliyse adı **oturumdan** alınır (form değeri ezilir — sahte ad
gönderilemez). Bekleyen kayıt varsa güncellenir (plan bilgileri korunur), yoksa bağımsız denetim
kaydı açılır. Ardından `syncDenetimAksiyonlari` form'daki aksiyon alanlarından açık aksiyon üretir:
kriter başına en fazla 2 açık aksiyon, aynı metinli mükerrer eklenmez, termin denetim tarihinden
sonra olmalıdır (değilse boşaltılır), aksiyon bölümün **güncel** ekip liderine atanır.

### Ödül işleme (`besSIsle`)
Yalnızca tur **tüm bölümlerde** puanlanmışsa çalışır (eksik bölümler mesajda listelenir);
aynı tur iki kez işlenemez. İlk 3 bölümün lider+üye tam listesi o günkü 5S ödül ayarıyla (varsayılan 100/75/50) deftere yazılır.

### Değerlendirme akışı (öneri/kaizen)
- `POST /durum` (Değerlendirme): **Onaylandı** → öneride isteğe bağlı görev alanları (form no Ekim 2026'dan beri atanmaz;
  `form_no` kolonu eski değerlerle yerinde durur, gösterilmez).
  **Reddedildi** → `red_nedeni` zorunlu. **Düzeltme İsteniyor** → `revize_denetmen` (denetmen id) + `revize_notu`
  zorunlu; atanan ad/isteyen/zaman yazılır. **Değerlendiriliyor** → reddedileni geri alır. Onaylı kayıt reddedilemez /
  düzeltmeye gönderilemez. Dönüş adresi `don` alanıdır (`guvenliYol` ile doğrulanır).
- **Düzenleme yetkisi** `servis/kayitlar.js:kayitDuzenleyebilir`: `kayit` yetkisi VEYA (durum "Düzeltme İsteniyor" ve
  `revize_atanan_id` = oturumdaki denetmen). Denetmen kaydedince durum "Değerlendiriliyor"a, `revize_tamamlandi` dolar.
- **Görev** `POST /gorev`: yalnız onaylı ve dönüştürülmemiş öneri. `kaizeneDonusturebilir`: atanan denetmen veya
  değerlendirme/kayıt yetkili yönetici. `GET /kaizen/yeni?oneri=NO` formu öneriden doldurur; `POST` kaizeni ve
  `oneriler.kaizen_no`'yu **tek transaction**'da yazar; yetki sunucuda yeniden doğrulanır.
- Liste: `filtrele` reddedilenleri çıkarır; `sayfala` 20'li (`S.SAYFA_BOYUTU`). Puanlama `geri` adresini taşır,
  kaydedince detaya döner.

### İsim birleştirme
Kayıtlardaki isimler **değişmez**. `puanDurumu` her ismi `isimAnahtar` ile anahtara çevirir, `isim_eslestirme`
zincirini izleyip kök anahtarda toplar (öneri, kaizen, 5S ödül defteri, verilen ödüller, gizlenen kişiler aynı
anahtarla). Görünen ad: kökün kendi yazılışı > Türkçe karakterli yazılış > en sık. `isimGruplari` tüm kaynaklardan
grupları ve anahtar uzaklığı ≤1 (10+ karakterde ≤2) olan çiftleri öneri olarak verir. Aksiyon kapatma, plan
"benim" eşleşmesi ve denetmen yetki kontrolleri de `isimIcerir` (anahtarla) kullanır.

### Denetim revize
`/5s/denetim/:did/revize` (bes_revize). `turIslendi(tarih)` doğruysa (ödüller işlenmiş) GET/POST reddedilir.
Form `5s_denetim.ejs`'in revize modudur: kayıtlı bulgular (eski kayıtta `bessBulguTahmin`) ön-doludur; `foto_sil`
ile seçilen fotoğraflar (yalnız bu denetime aitse) silinir; puan yeniden hesaplanır; denetmen ve tarih değişmez;
`revize_eden/revize_zamani` yazılır; yeni aksiyonlar `syncDenetimAksiyonlari` kuralıyla eklenir.

### 5S periyodik kontrol formu
`/5s/bolum/:bid/kontrol?tarih=YYYY-MM-DD` herkese açık (takvim alanı `static/takvim.js` flatpickr ile açılır, gün
seçilince form kendiliğinden yenilenir; ileri tarih bugüne çekilir; eski `?ay=&gun=` bağlantıları da çalışır).
**Doldurma** (`kontrolDoldurabilir`): bölümün ekip lideri (denetmen) veya `bes_denetim`. Gün ≤ bugün. Boş bırakılan
madde kaydedilmez; "uygunsuz" açıklama ister. Formdan 5S aksiyonu **açılmaz** (uygunsuzluklar formun altında ve
Excel'de listelenir). **İmza** (`kontrolImzalayabilir`): `bes_denetim` veya bölümün lideri olmayan denetmen;
haftalık (ay haftası) / aylık. `kontrolOzet(ay)` Bölümler tablosundaki "günlük maddeleri tam işaretlenen gün / geçen
gün" değerini verir. **Excel** (`/kontrol/excel?ay=YYYY-MM`): `kontrolAylari(bid)` ile seçilen aydan önceki kayıtlı
aylar + seçilen ay; `generateKontrolExcel(b, sayfalar)` → ÖZET sayfası (ay başına kontrol günü, tam gün, uygun /
uygun değil, uygunluk %, imzalı hafta, aylık imza + tüm ayların uygunsuzluk listesi) ve her ay için kâğıt düzeninde
ayrı sayfa (`kontrolAySayfasi`).

### Panel istatistikleri
`dashboardIstatistik` → `donemler` (ay/6ay/yıl/tüm × öneri/kaizen/toplam × gelen, değerlendiriliyor, düzeltme,
onaylandı, puan alan, reddedildi) + `trend` (son 12 ay: gelen ve onaylanıp puan alan, kayıt tarihine göre).
Grafikler sunucu tarafında SVG olarak çizilir (dış kütüphane yok); her grafiğin tablo görünümü vardır.

### Kimlik doğrulama ve yetkilendirme
- Tek şifre alanı: sırayla ana yönetici hash'i → ek yönetici hash'leri → denetmen hash'leri
  denenir; eşleşen kimlik oturuma yazılır. Bu nedenle **şifreler benzersiz olmalıdır** — yeni
  şifre belirlenirken ana yönetici + tüm denetmen + tüm ek yöneticilerle çakışma kontrol edilir
  (`servis/hesaplar.js:sifreCakismasi`, min 6 karakter).
- **Roller ve oturum:** ana yönetici → `session.super = true` (tüm yetkiler); ek yönetici →
  `session.yonetici_id` (yetkiler her istekte veritabanından taze okunur, `web.js:ortakLocals`);
  denetmen → `session.denetmen_id`.
- **Yetki alanları** (`src/yetkiler.js`): `degerlendir`, `puanla`, `kayit`, `bes_plan`, `bes_denetim`,
  `bes_revize`, `bes_aksiyon`, `bes_odul`, `odul`, `kullanici`. Rotalar `yetkiGerek(alan)` ile kapılanır;
  ana yönetici her zaman geçer. Ek yönetici CRUD, işlem günlüğü ve ana yönetici şifresi yalnız ana yönetici
  (`anaYoneticiRequired`) — ek yöneticiye tam yetki verilemez. Girişli herkes (denetmen dahil): `girisRequired`.
  Eski kayıtlı `degerlendirme` → `degerlendir+puanla`, `bes_s` → tüm 5S alanları + `kullanici`, `tam` → 10 alanın tamamı (yönetici hesapları hariç; okurken açılır). Şablonlarda `yetki('alan')` yardımcısı
  butonları gizler; **arayüzde gizli bir eylem sunucuda da reddedilir** (çift katman).
- Hash formatı werkzeug uyumludur: yeni hash `pbkdf2:sha256:600000$salt$hex` üretilir;
  doğrulamada `pbkdf2:*` ve `scrypt:N:r:p` formatları desteklenir (`timingSafeEqual` ile).
  Böylece eski sistemden aktarılan şifreler değişmeden çalışır.
- Kaba kuvvet: IP başına 10 dakikada 8 hatalı deneme (bellek içi).

### Dosya/görsel işleme
- Yüklemeler bellekte alınır → uzantı beyaz listesi + **dosya imzası** (JPEG/PNG/GIF/BMP/WEBP
  magic bytes) kontrolü → **sharp ile yeniden kodlanır**: EXIF yönüne göre döndürme,
  metadata (GPS/konum) temizliği, 1600 px'e küçültme, JPEG/WEBP kalite 85. Sharp'ın
  çözemediği bozuk/sahte dosyalar reddedilir (BMP istisna: EXIF taşımaz, imza kontrolüyle
  olduğu gibi yazılır).
- Görsel servis uçları (`/kaizen/gorsel/:f`, `/5s/gorsel/:f`, `/5s/aksiyon-gorsel/:f`)
  `guvenliYol` ile path-traversal'a kapalıdır (resolve + kök önek kontrolü).

### Excel / ZIP
Tüm raporlar indirme anında veritabanından üretilir, diske yazılmaz (buffer olarak döner).
Kaizen raporunda önce/sonra görselleri hücrelere gömülür. ZIP'ler archiver ile akış hâlinde
yazılır (bellekte tam kopya tutulmaz). Excel/ZIP uçları yalnızca yöneticiye açıktır.

### Otomatik yedek
Açılışta + 6 saatte bir tüm tablolar (`veritabani.json`) **ve üç görsel klasörü** tek ZIP
olarak `yedek_YYYYMMDD_HHMMSS.zip` adıyla yazılır; son 15 kopya tutulur. Yedek klasörü
`YALIN_YEDEK_DIR` ortam değişkeni veya `data/config.json` → `"yedek_dir"` ile farklı bir
diske yönlendirilebilir; görseller `"yedek_gorseller": false` ile kapsam dışı bırakılabilir.
Bu, uygulama içi bir güvence katmanıdır — tam sunucu yedeği için `mysqldump` tercih edilmelidir.

---

## 6. Oturum, CSRF ve Güvenlik Başlıkları

- **Oturum:** cookie-session — veri imzalı çerezde taşınır (sunucuda oturum deposu yok; yeniden
  başlatmada oturumlar düşmez). İçerikte yalnızca `admin` bayrağı / `denetmen_id`+`ad` / CSRF
  token / flash mesajları bulunur. İmza anahtarı ilk açılışta üretilip `config` tablosunda saklanır.
- **CSRF:** oturum başına token; `ortakLocals` üretir, tüm POST'larda `csrfDogrula` form alanını
  karşılaştırır (uyuşmazsa 400). Yeni bir POST formu eklerken şablona
  `<input type="hidden" name="csrf_token" value="<%= csrf_token %>">` eklenmesi **zorunludur**.
- **Başlıklar:** `Content-Security-Policy: default-src 'self'` (+ inline style/script izni),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.

---

## 7. Şablon Katmanı (EJS)

- `views/partials/header.ejs` + `footer.ejs` her sayfada `include` edilir (üst bar, marka/logo,
  flash mesajları, nav; flatpickr + takvim.js yükleme).
- Ortak değişkenler middleware'den gelir: `admin`, `denetmen_adi`, `csrf_token`, `marka_adi`,
  `marka_logo`, `trdate()`, `puanfmt()`, `mesajlar`.
- Tekrarlanan bloklar partial'dır: `odul_siralama.ejs` (tur sıralama satırları),
  `aksiyon_kart.ejs` (aksiyon kartı + kapatma formu).
- `<%= %>` otomatik HTML kaçışı yapar; `<%- %>` yalnızca partial include ve kod-üretimi HTML'de
  kullanılır. **Kullanıcı verisini asla `<%- %>` ile basmayın.**
- Tarih inputları `static/takvim.js` ile Türkçe flatpickr'a dönüşür (görünen gg.aa.yyyy,
  sunucuya ISO gider — arka uç değişmez).

---

## 8. Dağıtım Notları

> Adım adım kurulum (sunucu özellikleri, Windows/Linux, systemd, reverse proxy, yedekleme,
> kontrol listesi) için: **[DAGITIM.md](DAGITIM.md)**. Mevcut canlı veritabanıyla yeni sürüme geçiş:
> **[VERITABANI_GECIS.md](VERITABANI_GECIS.md)**. Aşağıdakiler kısa özettir.

- **MySQL sunucusu:** Windows'ta servis olarak kurulması önerilir
  (`mysqld --install <ad> --defaults-file=<my.ini>` — veri dizini `C:\ProgramData` altında
  olmalıdır; kullanıcı profili altındaki veri diziniyle servis başlamayabilir).
  Bu makinedeki kurulum: `YalinMySQL` servisi, veri `C:\ProgramData\YalinMySQL\data`,
  yalnızca `127.0.0.1`'i dinler.
- **LAN (mevcut hedef):** `npm start` yeterli. Veri klasörünü kod dışına almak için
  `YALIN_DATA_DIR` kullanın; klasörün düzenli olarak farklı bir diske kopyalanması önerilir.
- **İnternet:** Uygulama TLS sonlandırmaz — bir reverse proxy (Caddy/nginx) arkasına konmalıdır.
  `data/config.json` → `{ "https": true, "proxy": true }` (veya `YALIN_HTTPS=1 YALIN_PROXY=1`):
  `proxy` bayrağı `trust proxy`yi açar (hız limiti/giriş kilidi gerçek istemci IP'sini görür),
  `https` bayrağı oturum çerezine `Secure` ekler ve HSTS başlığı gönderir. Proxy,
  `X-Forwarded-Proto`/`X-Forwarded-For` başlıklarını iletmelidir. Bayraklar açılışta okunur —
  değişiklik için uygulamayı yeniden başlatın.
- **Süreç yönetimi:** Windows'ta Görev Zamanlayıcı/NSSM, Linux'ta systemd ile açılışta başlatma.
  Veritabanı MySQL olduğundan gerekirse uygulama birden çok süreçle de çalıştırılabilir
  (hız-limit/giriş-kilidi sayaçları süreç-içidir; çok süreçte etkisi zayıflar).

## 9. Geliştirme Rehberi

- **Yeni rota eklerken:** ilgili `src/rotalar/*.js` dosyasına ekleyin; yazma ucuysa POST + CSRF
  input şart.
- **Yeni alan eklerken:** kolonu `db.js` içindeki `CREATE TABLE`'a VE `EK_KOLONLAR` listesine ekleyin (var olan
  kurulumlara yalnız bu liste kolon ekler; `npm run gecis-kontrol` eksik kalanı "otomatik eklenmeyecek" diye
  gösterir). Kolon silme/yeniden adlandırma/tip değiştirme yapmayın — eski sürüme dönüşü bozar. Satır
  dönüştürücüyü ve ilgili formu/detayı güncelleyin. Liste değerli alanlarda `js()`/`j()` yardımcılarını kullanın.
- **Yeni iş fonksiyonu:** alanına uygun `src/servis/*` modülüne yazın, `module.exports`'a ekleyin; yalnız alt
  katmandaki modüllere dayanın (bkz. §2 tablo). Rotalar `C.fonksiyon` ile erişir.
- **Veri erişimi:** yeni iş mantığı fonksiyonları `async` olmalı ve `sorgu/tek/calistir`
  kullanmalıdır; çok adımlı yazmaları `transaction(fn)` ile sarın. Rota işleyicisinde `await`
  varsa mutlaka `sar()` ile kaydedin.
- **İş kuralı değişikliği:** puan oranları `servis/puan.js:puanDurumu`, rubrik `puanlama.js`,
  ödül eşiği/haritası `sabitler.js` (`ODUL_ESIK`, `ODUL_MAP`).
- **Yeni rota/yetki:** rotayı `yetkiGerek(alan)` / `girisRequired` ile kapıla, şablonda `yetki('alan')` ile
  butonu gizle (ikisi birden). Dosya kabul eden rotada yetki middleware'i `dosyaYukleyici`'den ÖNCE gelir ve
  yol `web.js:DOSYA_YOLLARI`'na eklenir.
- **Test:** `npm test` — ayrı veritabanı (`yalin_e2e`) ve geçici veri klasörüyle 157 kontrollü uçtan uca
  senaryo; canlı veriye dokunmaz.
