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
puanlama.js   → öneri/kaizen rubriği + 5S kriter tanımları          (saf, IO/Express yok)
db.js         → MySQL havuzu + şema + sorgu/transaction yardımcıları + otomatik yedek
cekirdek.js   → iş mantığı: numara, puan durumu, 5S motoru, kimlik  (Express'e bağımlı DEĞİL)
web.js        → istek bağlamı gerektiren yardımcılar: flash, CSRF, hız limiti, yetki, sar()
rotalar/*.js  → HTTP rotaları (module.exports = register(app) deseni)
server.js     → async main(): şema kurulumu → Express kurulumu → middleware → modül kaydı
```

Veri erişimi **tamamen asenkrondur** (`async/await`). `db.js` üç yardımcı sunar:
`sorgu(sql, params)` (satır listesi), `tek(...)` (ilk satır), `calistir(...)` (INSERT/UPDATE
sonucu) ve `transaction(fn)` — `fn(conn)` tek transaction içinde çalışır, hata durumunda
tamamı geri alınır. Express 4 async hataları kendiliğinden yakalamadığından tüm async rota
işleyicileri `web.js:sar()` sarıcısıyla kaydedilir (reddedilen promise 500 işleyiciye düşer).

`cekirdek.js` oturuma ihtiyaç duyduğunda `session` nesnesini **parametre olarak alır**
(`aktifDenetmen(session)`, `aksiyonKapatabilir(a, session)`) — bu sayede Express olmadan
test edilebilir.

### Dosya dosya döküm

| Dosya | Sorumluluk |
|---|---|
| `server.js` | Express app, middleware sırası, rota modüllerinin kaydı, 404/500 yakalayıcı, `listen` |
| `src/sabitler.js` | `DATA_DIR` (env ile taşınabilir), tüm klasör yolları, `ODUL_ESIK=300`, `ODUL_MAP={100,75,50}`, `DURUMLAR`, `KAZANC_BASLIKLARI`, `TR_AYLAR`, `ALAN_MAX=5000`, `nowTr()/bugunIso()/zamanTr()` (Europe/Istanbul) |
| `src/puanlama.js` | `PUAN_TEMEL/ETKI/MALIYET/YAYGIN/EFOR` rubrik tanımları, `PUAN_MAX`, `BESS` (şirket 5S formu: 5 bölüm / 23 soru, soru başına özel maksimum — `BESS_KRITER_MAX`), `hesaplaPuanlama(form)`, `puanlamaOzet(p)` |
| `src/db.js` | mysql2 bağlantı havuzu, `CREATE TABLE IF NOT EXISTS` şeması (`init()`), `sorgu/tek/calistir/transaction` yardımcıları, JSON kolon yardımcıları (`j`/`js`), satır dönüştürücüler (`oneriRow`, `denetimRow`…), `configGet/Set`, `yedekle()` (tüm tablolar → json.gz) + `baslatYedekleme()` |
| `src/cekirdek.js` | Şifre (hash/doğrulama, werkzeug uyumlu), `nextNumber`, `guvenliYol`, `gorselKaydet` (magic bytes), öneri/kaizen CRUD yardımcıları, `combinedRecords/filtrele/mevcutAylar`, `puanDurumu`, `dashboardIstatistik`, tüm 5S fonksiyonları (`besSTur*`, `besSIsle`, `besSPlanSatirlari`, `besSTrendTablo`…), aksiyon mantığı (`aksiyonKapatabilir`, `syncDenetimAksiyonlari`), denetmen/misafir yardımcıları |
| `src/web.js` | `flash`, `hizLimitAsildi` (bellek içi kayan pencere), `alan` (kırp + 5000 sınır), `ortakLocals` (her istekte şablon değişkenleri + flash tüketimi + CSRF üretimi), `csrfDogrula`, `guvenlikBasliklari`, `adminRequired`/`denetciRequired` |
| `src/excel.js` | 7 rapor üreticisi: öneri, kaizen (görsel gömülü), 5S toplu, 5S tek form, aksiyonlar, puan listesi, ödül alanlar, 5S trend (renkli fark) — hepsi buffer döner |
| `src/rotalar/genel.js` | Anasayfa, kılavuz, birleşik liste, detay, puan durumu, ödül ver/sil, kişi gizle, Excel'ler (11 rota) |
| `src/rotalar/oneri.js` | Öneri yeni/düzenle/Excel (5 rota) |
| `src/rotalar/kaizen.js` | Kaizen yeni/düzenle/Excel/görsel servisi (6 rota) |
| `src/rotalar/bes_s.js` | 5S: bölümler, plan (oluştur/kaydet/dağıt/sil), denetim (yap/göster/sil/Excel/ZIP), aksiyonlar (kapat/sil/Excel/ZIP), ödül işleme, geçmiş/arşiv, görsel servisleri (27 rota) |
| `src/rotalar/admin.js` | Giriş/çıkış, dashboard, denetmen/misafir yönetimi, şifre değiştirme, durum değiştirme, değerlendirme-puanlama, kayıt silme, trend Excel (13 rota) |
| `scripts/import-json.js` | Eski JSON tabanlı sürümden veri + görsel aktarımı (kaynağa salt-okunur, tek transaction, hata durumunda tam geri alma) |
| `scripts/sqlite-to-mysql.js` | Önceki SQLite sürümünden (`data/yalin.db`) tüm tabloları MySQL'e taşır (`npm run migrate`) |
| `scripts/e2e-test.js` | Uçtan uca test paketi — ayrı veritabanı (`yalin_e2e`) + geçici veri klasörü + ayrı port (`npm test`) |

---

## 3. İstek Yaşam Döngüsü

```
İstek gelir
  └─ guvenlikBasliklari      → CSP, nosniff, X-Frame-Options DENY, Referrer-Policy
  └─ /static                 → express.static (maxAge 365 gün)
  └─ express.urlencoded      → form gövdesi (1 MB sınır)
  └─ multer (bellek)         → multipart dosyalar (dosya başına 16 MB, 70 dosya)
  └─ cookie-session          → imzalı çerez çözülür (12 saat, HttpOnly, SameSite=Lax)
  └─ ortakLocals             → session/admin/denetmen_adi/csrf_token/marka/flash şablona
  └─ csrfDogrula             → POST ise csrf_token alanı doğrulanır (yoksa 400)
  └─ Rota
       ├─ adminRequired / denetciRequired    (yetki — girişe yönlendirir)
       ├─ hizLimitAsildi(...)                (herkese açık yazma uçları)
       ├─ cekirdek.js iş mantığı + parametreli SQL
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
| `config` | `anahtar` | `admin_password` (hash), `secret_key` (oturum imzası) |
| `oneriler` | `no` (ÖNFR…) | tarih, sahibi, görev, konu, detay, çözüm, 4 katkı alanı, durum, `puan`, `puanlama` (JSON kırılım), degerlendirme_notu |
| `kaizenler` | `no` (ÖSKFR…) | başlangıç/bitiş, konu, bölüm, lider, `uyeler` (JSON), sorumlular, `kazanclar` (JSON), önceki/sonraki + görsel adları, durum, puan, puanlama |
| `bolumler` | `id` (hex8) | ad, `sorumlu` ("Ali / Veli" — çoklu lider), `kisiler` (JSON) |
| `denetimler` | `id` (hex8) | bolum_id, `tarih` (**tur kimliği**), tur_adi, baslangic/bitis, plan_gun/saat, planlanan/misafir/gerçek denetmen, `puan` (NULL=bekliyor), `puanlar` (JSON kriter→verilen puan), `notu`, `aciklamalar` (JSON), `fotolar` (JSON kriter→[dosya]), denetim_tarihi |
| `aksiyonlar` | `id` (hex8) | denetim_id, tur/bölüm bilgisi, kriter_k/m, aksiyon, sorumlu, atanan_lider, termin, durum (acik/kapali), `kapatma` (JSON: açıklama+kapatan+fotolar+zaman) |
| `odul_islenen` | `tarih` | ödülleri işlenmiş tur tarihleri |
| `odul_kayitlari` | otomatik | tur tarihi/adı, bölüm, sıra (1-3), puan (100/75/50), `kisiler` (JSON) — **kişi 5S puanlarının tek kaynağı** |
| `odul_arsiv` | otomatik | verilen 300'lük ödüller (ad, puan, tarih, zaman) |
| `silinen_kisiler` | `ad` | puan listesinden gizlenenler (puanlar silinmez) |
| `denetmenler` | `id` | ad, `sifre` (hash), oluşturma |
| `misafirler` | `id` | ad, oluşturma |
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

### Puan durumu (`puanDurumu`)
Öneri → sahibine %10 · Kaizen → lider %50, üye başına %25 (max 2 üye) · 5S → ödül defterindeki
her kayıttan kişilere. Net = kazanılan − verilen 300'lük ödüller; `silinen_kisiler` gizlenir,
net ≤ 0 olan listeden düşer.

### 5S denetim turu ve dağıtım (`/5s/plan/dagit`)
- **kendi:** her bölümün planlanan denetmeni kendi ekip lideri/liderleri olur.
- **capraz:** bölüm-bazlı **dengeli derangement** — rastgele permütasyon 500 denemeye kadar aranır;
  koşul: her bölümü denetleyecek bölümün lider kümesi boş olmayacak VE denetlenen bölümün lider
  kümesiyle **kesişmeyecek** (kimse kendi/ortak-lider olduğu bölüme denk gelmez).
- **misafirler:** karıştırılmış bloklar hâlinde dağıtılır — kişi başına denetim sayısı farkı en fazla 1.

### Denetim kaydetme (`POST /5s/bolum/:bid/denetim`)
23 soru × (0–soru maksimumu) puan → skor (S1:25 · S2:35 · S3:20 · S4:4 · S5:16 = 100);
kriter fotoğrafları (max 3/kriter) doğrulanıp diske, adları JSON
kolonuna yazılır. Denetmen girişliyse adı **oturumdan** alınır (form değeri ezilir — sahte ad
gönderilemez). Bekleyen kayıt varsa güncellenir (plan bilgileri korunur), yoksa bağımsız denetim
kaydı açılır. Ardından `syncDenetimAksiyonlari` form'daki aksiyon alanlarından açık aksiyon üretir:
kriter başına en fazla 2 açık aksiyon, aynı metinli mükerrer eklenmez, termin denetim tarihinden
sonra olmalıdır (değilse boşaltılır), aksiyon bölümün **güncel** ekip liderine atanır.

### Ödül işleme (`besSIsle`)
Yalnızca tur **tüm bölümlerde** puanlanmışsa çalışır (eksik bölümler mesajda listelenir);
aynı tur iki kez işlenemez. İlk 3 bölümün lider+üye tam listesi 100/75/50 puanla deftere yazılır.

### Kimlik doğrulama
- Tek şifre alanı: önce yönetici hash'i, sonra tüm denetmen hash'leri denenir → eşleşen kimlik
  oturuma yazılır. Bu nedenle **şifreler benzersiz olmalıdır** — denetmen şifresi belirlenirken
  admin şifresiyle ve diğer denetmenlerle çakışma kontrol edilir (min 6 karakter).
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
> kontrol listesi) için: **[DAGITIM.md](DAGITIM.md)**. Aşağıdakiler kısa özettir.

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
  input şart; yetki için `adminRequired`/`denetciRequired` middleware'i kullanın.
- **Yeni alan eklerken:** şemaya kolon ekleyin (`db.js` — mevcut kurulumlar için
  `ALTER TABLE ... ADD COLUMN` migrasyonu gerekir), satır dönüştürücüyü ve ilgili formu/detayı
  güncelleyin. Liste değerli alanlarda `js()`/`j()` yardımcılarını kullanın.
- **Veri erişimi:** yeni iş mantığı fonksiyonları `async` olmalı ve `sorgu/tek/calistir`
  kullanmalıdır; çok adımlı yazmaları `transaction(fn)` ile sarın. Rota işleyicisinde `await`
  varsa mutlaka `sar()` ile kaydedin.
- **İş kuralı değişikliği:** puan oranları `cekirdek.js:puanDurumu`, rubrik `puanlama.js`,
  ödül eşiği/haritası `sabitler.js` (`ODUL_ESIK`, `ODUL_MAP`).
- **Test:** `npm test` — ayrı veritabanı (`yalin_e2e`) ve geçici veri klasörüyle 24 adımlı
  uçtan uca senaryo; canlı veriye dokunmaz.
