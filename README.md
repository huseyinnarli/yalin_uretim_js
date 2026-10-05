# Yalın Üretim Uygulamaları

Üretim/fabrika ortamı için **Öneri**, **Kaizen** ve **5S denetim** süreçlerini tek yerde yöneten,
bu süreçlerden doğan puanları **personel ödül sistemine** dönüştüren web uygulaması.

Çalışanlar giriş yapmadan öneri ve kaizen girer; yöneticiler kayıtları onaylar (ya da gerekçeyle reddeder,
denetmene düzeltme atar), onaylanan öneriyi uygulayıp kaizene dönüştürecek kişiyi atar ve 100 üzerinden puanlar;
bölümler periyodik 5S denetimlerinden ve günlük/haftalık/aylık 5S kontrol formundan geçer; biriken puanlar
personel sıralamasına ve ödüllere dönüşür. Tüm raporlar tek tıkla Excel olarak alınır.
Sürüm değişiklikleri için: **[DEGISIKLIKLER.md](DEGISIKLIKLER.md)**.

> **Giriş modeli:** Tek giriş ekranı vardır. Girilen şifre ana yöneticinin veya bir ek yöneticininkiyse
> **yönetici**, bir denetmeninkiyse o **denetmen** olarak oturum açılır — sistem kişiyi şifreden tanır.
> İlk kurulum şifresi `admin123`'tür; ilk girişten sonra panelden hemen değiştirin
> (varsayılan şifre kullanıldığında sistem uyarı gösterir).

---

## Genel Akış

```
Çalışan öneri/kaizen girer ─► Yönetici ONAYLAR ─► PUANLAR (0–100)
       (form herkese açık)     │   ├─ REDDEDER (gerekçe zorunlu) ─► Reddedilen & Silinen arşivi
                               │   └─ DÜZELTME İSTER ─► seçilen denetmen düzeltir ─► yeniden değerlendirme
                               └─ onaylanan öneriye GÖREV ─► denetmen uygular ─► KAİZENE DÖNÜŞTÜRÜR
5S: denetim turu ─► bölümler denetlenir ─► ilk 3 bölüm ödül alır ──────────┐
5S: günlük/haftalık/aylık kontrol formu ─► uygunsuzluk listesi               │
                                                                             ▼
                                        PUAN LİSTESİ (aynı kişinin yazılışları birleşir)
                                                                             │
                                                  Net 300'e ulaşan ─►  ÖDÜL VERİLİR
```

Anasayfada 3 kutu: **🏆 Puan Listesi · 💡🔧 Öneri & Kaizen · 🧹 5S**. Girişli kullanıcı üst menüde
**📊 Panel · 💡🔧 Öneri & Kaizen · 📋 Görevlerim** görür; yöneticiler ayrıca **🛠 Yönetim**.

---

## 1) Öneri & Kaizen

### Öneri Formu (No: `ÖNFR2607-01`) — herkese açık
Numara otomatik atanır: `ÖNFR` + yıl + ay + o ayki sıra (her ay sıfırlanır).
Alanlar: öneri sahibi (**ad** ve **soyad** ayrı kutularda), görevi, tarih, konu, detay açıklama, çözüm önerisi,
4 katkı sorusu (Kalite / Verimlilik / İSG / Maliyet), ek açıklama. Eksik bilgide form girilenler korunarak tekrar gösterilir.

### Kaizen Formu (No: `ÖSKFR2607-01`) — herkese açık
Başlangıç–bitiş tarihi, kazanç başlıkları (çoklu seçim), konu, bölüm, **ekip** (1 lider + en fazla 2 üye; her biri
ad/soyad ayrı), önceki/sonraki durum açıklaması **+ önce/sonra fotoğrafı**. Onaylanan öneriden dönüştürülürken
form öneriden doldurulur ve kaizen öneriye bağlanır.

### Liste, Değerlendirme, Görev (giriş gerekir)
- Öneri + kaizen tek listede tarihe göre; **20'şerli sayfa**; **Tür / Durum / Dönem / arama** filtreleri.
  Reddedilenler listede yer almaz.
- **Detay sayfasında değerlendirme kartları** (Değerlendirme yetkisi):
  - **✓ Onayla** — öneride isteğe bağlı **uygulama görevi** ataması.
  - **✕ Reddet** — red nedeni zorunlu. Onaylanmış kayıt reddedilemez.
  - **✏ Düzeltme İste** — düzeltmeyi yapacak **denetmen** + açıklama zorunlu. Yalnızca o denetmen düzenler;
    kaydedince kayıt "Değerlendiriliyor"a döner.
- **📌 Görev:** onaylanan öneri bir denetmene atanır (termin + not). Atanan kişi **🔧 Kaizene Dönüştür** ile
  kaizeni açar; öneri ↔ kaizen bağlantısı detaylarda görünür.
- **★ Puanla** (Puanlama yetkisi) — 100 üzerinden rubrik: Temel 10 · Etki 40 · Maliyet 20 · Yaygınlaştırma 15 ·
  Efor 15. Kaydedince kaydın detayına dönülür; "← Listeye Dön" kaldığın sayfaya/filtreye götürür.
- **🗂 Reddedilen & Silinen:** reddedilenler (gerekçesiyle) ve silinenler burada; denetmenler yalnızca görüntüler,
  kayıt yetkisi olan geri yükler veya kalıcı siler.

---

## 2) 5S Denetim

`/5s` — sekmeler: **Son Denetimler · Bölümler · Denetim Planı** + Geçmiş Denetimler ve Aksiyonlar.
5S sonuçları, aksiyonlar ve kontrol formları **herkese açıktır**.

- **Bölümler** (tablo): ekip lideri, personel sayısı, son skor ve tarih, açık aksiyon, bu ayki kontrol doluluğu.
- **Bölüm sayfası:** özet kutuları, ekip (1–2 lider + üyeler, ad/soyad ayrı), denetim geçmişi,
  **skor trend grafiği** ve her denetimin **S1–S5 kırılımı**.
- **Denetim Planı:** tarih aralığı seçilince tüm bölümler için denetim açılır; gün/saat/denetmen atanır;
  toplu dağıtım *Herkes kendi bölümüne* veya *Çapraz*; misafir denetmenler dengeli dağıtılır.
- **Denetim formu (şirket 5S Denetim Raporu):** 5 bölüm / 23 soru / 100 puan — S1 Ayıklama 25 · S2 Düzenleme 35 ·
  S3 Temizlik 20 · S4 Standartlaştırma 4 · S5 Eğitim-Disiplin 16. Denetmen **bulgu sayısı** (veya Evet/Hayır)
  girer, puan kuraldan hesaplanır. Soru başına 3 fotoğraf + açıklama + en fazla 2 düzeltici aksiyon.
- **Denetim revize:** yetkili yönetici yapılmış denetimi düzeltir (skor yeniden hesaplanır, fotoğraf ekle/sil,
  yeni aksiyon). **Ödülleri işlenmiş turda revize kapalıdır.**
- **Ödüllendirme:** tur tamamlanınca **"Ödülleri İşle"** → 1./2./3. bölüm ekibine **100 / 75 / 50 puan**.
- **Aksiyonlar:** açık/kapalı, tur → bölüm kırılımı. Bölümün ekip lideri (denetmen girişli) veya aksiyon yetkili
  yönetici kapatır; **açıklama + en az 1 fotoğraf zorunlu**.
- **✅ Periyodik Kontrol Formu** (bölüm sayfasından): 10 günlük, 3 haftalık, 2 aylık madde. Bölümün ekip
  lideri günü **Türkçe takvimden** seçip *Uygun / Uygun Değil* işaretler; uygun değilde açıklama zorunlu
  (uygunsuzluklar formun altında ve Excel'de listelenir, formdan aksiyon açılmaz). Aylık tablo kâğıt formdaki gibi
  gün gün görünür. Haftalık **grup lideri** ve aylık **bölüm sorumlusu** kontrol imzası (bölümün lideri dışındaki
  denetmen veya yetkili yönetici). **Excel:** ay seçilir, o aya kadar doldurulmuş tüm aylar iner (her ay ayrı
  sayfa + tüm ayların özeti ve uygunsuzluk listesi).

---

## 3) Puan Listesi & Ödül Sistemi

| Kaynak | Dağıtım |
|---|---|
| **Öneri** | sahibine, önerinin puanının **%10**'u |
| **Kaizen** | **lider %50**, her üye **%25** (ekip en fazla 3 kişi) |
| **5S** | turda 1./2./3. bölümün **tüm ekibine 100 / 75 / 50** |

- Sütunlar: Öneri · Kaizen · 5S · Kazanılan · **Net** (net = kazanılan − verilen ödüller).
- Aynı kişinin farklı yazılışları (**ALİ YILMAZ / ali yilmaz / Ali Yılmaz**) otomatik **tek kişi** sayılır;
  yazım hataları **🔗 İsim Birleştirme** sayfasından elle birleştirilir. Kayıtlardaki isimler değişmez.
- Net puanı **300**'e ulaşan kişiye **🎁 Ödül Ver** → 300 düşülür, **Ödül Alanlar** listesine geçer.

---

## 4) Panel ve Yönetim

- **📊 Panel** (denetmen + tüm yöneticiler): dönem butonlu (Bu Ay / Son 6 Ay / Bu Yıl / Tüm Zamanlar) tek tablo —
  öneri/kaizen × gelen / değerlendiriliyor / düzeltme / onaylandı / puan alan / reddedildi; altta sabit tüm
  zamanlar toplamı; **son 12 ay gelen vs. puan alan** grafiği; bölümlerin 5S trendi (Excel'e aktarılır).
- **🛠 Yönetim:** denetmen hesapları, misafir denetmenler, ek yöneticiler (yetki kutucukları; yalnız ana yönetici),
  ana yönetici şifresi — her bölüm yalnızca yetkisi olana görünür.
- **📋 Görevlerim:** atanan düzeltmeler, kaizene dönüştürme görevleri, planlanan 5S denetimleri, kapatılacak
  aksiyonlar, bugünkü kontrol formu. Değerlendirme yetkili yönetici tüm açık atamaları izler.
- **📜 İşlem Günlüğü** (ana yönetici): yönetici/denetmen işlemleri — kim, ne zaman, ne yaptı.

---

## Roller ve Erişim

**Ana yönetici** sabittir ve tek tam yetkili hesaptır; ek yönetici eklemek/silmek ve işlem günlüğü yalnız ondadır.
**Ek yöneticiler** ana yöneticinin seçtiği alanlarla sınırlıdır (ek yöneticiye tam yetki verilemez):

| Grup | Yetki alanı | Kapsam |
|---|---|---|
| Öneri & Kaizen | **Değerlendirme** | Onay, gerekçeli red, düzeltme isteyip denetmene atama, görev atama |
| | **Puanlama** | Onaylanan kayıtlara ★ puan |
| | **Kayıt düzenle-sil & raporlar** | Düzenleme, silme, silinenleri geri yükleme, Excel |
| 5S | **Bölüm & denetim planı** | Bölüm/ekip, denetim tarihi planlama, denetmen/misafir dağıtımı |
| | **Denetim yapma** | Her bölümün denetimini yapabilir, kontrol formunu doldurabilir |
| | **Denetim revize & silme** | Yapılmış denetimi düzeltme (ödülü işlenmemiş turda), silme |
| | **Aksiyon yönetimi** | Her aksiyonu kapatma/silme, aksiyon Excel/ZIP |
| | **5S ödül & raporlar** | Tur ödüllerini işleme, denetim Excel/ZIP, trend Excel |
| Puan & Ödül | **Ödül verme & isim birleştirme** | Ödül ver/sil, kişi gizleme, isim birleştirme, puan raporları |
| Hesaplar | **Denetmen hesapları** | Denetmen ekleme, şifre, silme |

| | Herkes (girişsiz) | Denetmen | Ek yönetici | Ana yönetici |
|---|---|---|---|---|
| Öneri/kaizen formu, puan listesi, 5S sonuçları, aksiyonlar, kontrol formları | ✅ | ✅ | ✅ | ✅ |
| Öneri/kaizen listesi ve detayları, Panel, Reddedilen & Silinen | ❌ | ✅ (görüntüleme) | ✅ | ✅ |
| Kendisine planlanan 5S denetimi, lideri olduğu bölümün aksiyonu ve kontrol formu | ❌ | ✅ | yetkiyle | ✅ |
| Kendisine atanan düzeltme ve kaizene dönüştürme görevi | ❌ | ✅ | — | — |
| Onay/red/düzeltme, puanlama, düzenle/sil, 5S yönetimi, ödül | ❌ | ❌ | verilen yetkiyle | ✅ |
| Ek yönetici yönetimi, işlem günlüğü | ❌ | ❌ | ❌ | ✅ |
| Ana yönetici şifresi | ❌ | ❌ | ❌ | ✅ |

---

## Kurulum ve Çalıştırma

**Gereksinimler:** Node.js **20+** (24 LTS önerilir) ve **MySQL 8** sunucusu.

```bash
npm install
npm start
```

- Bu bilgisayar: **http://127.0.0.1:5000**
- Aynı ağdaki cihazlar: **http://<PC-IP>:5000** (uygulama `0.0.0.0` dinler)

> **Sadece tasarımı çevrimiçi görmek için** (ör. Render): depodaki `Dockerfile` uygulamayı kendi içindeki geçici
> MariaDB ve örnek veriyle açar — harici veritabanı gerekmez. Ayrıntı: DAGITIM.md §11.

### Veritabanı bağlantısı

Bağlantı ayarları öncelik sırasıyla **ortam değişkenlerinden** veya
**`data/db-config.json`** dosyasından okunur:

```json
{ "host": "127.0.0.1", "port": 3306, "user": "yalin", "password": "...", "database": "yalin_uretim" }
```

Veritabanı ve kullanıcıyı bir kez oluşturmak yeterlidir (tablolar uygulama açılışında
kendiliğinden kurulur):

```sql
CREATE DATABASE yalin_uretim CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;
CREATE USER 'yalin'@'localhost' IDENTIFIED BY '<şifre>';
GRANT ALL PRIVILEGES ON yalin_uretim.* TO 'yalin'@'localhost';
```

### Yapılandırma (ortam değişkenleri)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `5000` | Dinlenen port |
| `YALIN_DATA_DIR` | `./data` | Veri klasörü (görseller, yedekler, db-config.json) |
| `YALIN_DB_HOST` | `127.0.0.1` | MySQL sunucu adresi |
| `YALIN_DB_PORT` | `3306` | MySQL portu |
| `YALIN_DB_USER` | `yalin` | MySQL kullanıcısı |
| `YALIN_DB_PASSWORD` | — | MySQL şifresi |
| `YALIN_DB_DATABASE` | `yalin_uretim` | Veritabanı adı |
| `YALIN_HTTPS` | kapalı | HTTPS arkasında: çerez `Secure` + HSTS başlığı |
| `YALIN_PROXY` | kapalı | Reverse proxy arkasında: gerçek istemci IP'si (`trust proxy`) |
| `YALIN_YEDEK_DIR` | `data/_yedek_otomatik` | Otomatik yedeklerin yazılacağı klasör (farklı disk önerilir) |

### İnternete açarken (HTTPS)

Uygulama TLS sonlandırmaz — bir reverse proxy (Caddy, nginx…) arkasına koyun ve
`data/config.json` dosyasına şunu ekleyin (veya `YALIN_HTTPS=1 YALIN_PROXY=1`):

```json
{ "https": true, "proxy": true }
```

Bu bayraklarla oturum çerezi yalnızca şifreli bağlantıda taşınır, HSTS başlığı gönderilir ve
hız limitleri/giriş kilidi proxy'nin ilettiği gerçek istemci IP'sine göre çalışır.

### Marka / Logo

Sol üstteki başlık [src/sabitler.js](src/sabitler.js) içindeki `MARKA_ADI` ile ayarlanır.
`static/` klasörüne adında "logo" geçen bir görsel (`logo.png` vb.) koyarsanız otomatik kullanılır.

---

## Veri ve Yedekleme

- Tüm kayıtlar **MySQL** veritabanında tutulur (`yalin_uretim`, utf8mb4 + Türkçe collation).
- Yüklenen fotoğraflar diskte (`data/kaizen_gorseller/`, `data/bes_s_gorseller/`,
  `data/aksiyon_gorseller/`), adları veritabanında.
- **Yüklenen fotoğraflar otomatik işlenir:** EXIF yönü düzeltilir, konum/metadata temizlenir,
  1600 px'e küçültülür (disk + mobil bant genişliği).
- **Uygulama içi otomatik yedek:** açılışta + 6 saatte bir tüm tablolar **ve görseller**
  tek ZIP olarak `data/_yedek_otomatik/yedek_*.zip` dosyasına yazılır (son 15 tutulur).
  Yedek klasörü `YALIN_YEDEK_DIR` ile farklı bir diske/ağ paylaşımına yönlendirilebilir;
  görseller `"yedek_gorseller": false` ile kapsam dışı bırakılabilir.
  Tam sunucu yedeği için ayrıca `mysqldump` önerilir:
  `mysqldump -u yalin -p yalin_uretim > yedek.sql`
- Excel raporları saklanmaz; her indirmede güncel veriden üretilir.

### Testler

```bash
npm test
```

Uçtan uca test paketi ayrı bir veritabanı (`yalin_e2e`) ve geçici veri klasörü kullanır —
canlı veriye dokunmaz. (Bir kez `CREATE DATABASE yalin_e2e` + GRANT gerekir.)

### Eski sistemlerden veri aktarma

- **JSON tabanlı ilk sürümden** (kaynağa yalnızca okuma yapılır):

  ```bash
  node scripts/import-json.js "<eski-uygulama>/data"
  ```

- **SQLite tabanlı sürümden** (`data/yalin.db`):

  ```bash
  npm run migrate
  ```

Eski hash'li şifreler (pbkdf2/scrypt) aynen tanınır — yönetici ve denetmenler mevcut
şifreleriyle giriş yapmaya devam eder.

### Canlı veritabanıyla yeni sürüme geçiş

Mevcut MySQL veritabanı olduğu gibi kullanılır; uygulama ilk açılışta yalnız eksik tablo/kolonları ekler. Önce
**salt-okunur ön kontrol** çalıştırın (veritabanına hiçbir şey yazmaz):

```bash
npm run gecis-kontrol > on_kontrol.md
```

Adım adım yedek, prova, güncelleme ve geri dönüş: **[VERITABANI_GECIS.md](VERITABANI_GECIS.md)**.

---

## Güvenlik Özeti

- Şifreler **pbkdf2 (600.000 iterasyon)** ile hash'lenir; düz metin saklanmaz.
- Tüm POST isteklerinde **CSRF token** doğrulaması.
- Girişte **kaba kuvvet koruması** (IP başına 10 dakikada 8 deneme); herkese açık yazma
  uçlarında hız limiti; giriş sonrası yönlendirme yalnız site içi yollara.
- CSRF belirteci sabit zamanlı karşılaştırılır; kullanıcı verisi şablonlarda otomatik kaçışlanır.
- Yüklenen dosyalar uzantı **+ dosya imzası (magic bytes)** ile doğrulanıp **sharp ile
  yeniden kodlanır** (EXIF/konum verisi temizlenir, 1600 px'e küçültülür); görsel servis
  uçları path-traversal korumalıdır.
- Güvenlik başlıkları (CSP, nosniff, X-Frame-Options DENY); oturum çerezi
  HttpOnly + SameSite=Lax, imza anahtarı veritabanında tutulur (koda gömülü değildir).

Ayrıntılar için: **[DEGISIKLIKLER.md](DEGISIKLIKLER.md)** (sürüm notları ve canlıya alma) ·
**[TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md)** (mimari ve iç işleyiş) ·
**[IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md)** (mimari ve güvenlik raporu, iyileştirme önerileri) ·
**[GELISTIRME_RAPORU.md](GELISTIRME_RAPORU.md)** (Ekim 2026 sürümünde yapılanlar) ·
**[VERITABANI_GECIS.md](VERITABANI_GECIS.md)** (canlı veritabanıyla geçiş) ·
**[DAGITIM.md](DAGITIM.md)** (sunucuda devreye alma: sunucu özellikleri, kurulum, HTTPS, yedekleme).
