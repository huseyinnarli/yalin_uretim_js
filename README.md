# Yalın Üretim Uygulamaları

Üretim/fabrika ortamı için **Öneri**, **Kaizen** ve **5S denetim** süreçlerini tek yerde yöneten,
bu süreçlerden doğan puanları **personel ödül sistemine** dönüştüren web uygulaması.

Çalışanlar giriş yapmadan öneri ve kaizen girer; yöneticiler kayıtları onaylayıp 100 üzerinden
puanlar; bölümler periyodik 5S denetimlerinden geçer; biriken puanlar personel sıralamasına ve
ödüllere dönüşür. Tüm raporlar tek tıkla Excel olarak alınır.

> **Giriş modeli:** Tek giriş ekranı vardır. Girilen şifre yöneticininkiyse **yönetici**, bir
> denetmeninkiyse o **denetmen** olarak oturum açılır — sistem kişiyi şifreden tanır.
> İlk kurulum şifresi `admin123`'tür; ilk girişten sonra panelden hemen değiştirin
> (varsayılan şifre kullanıldığında sistem uyarı gösterir).

---

## Genel Akış

```
Çalışan öneri/kaizen girer  ──►  Yönetici ONAYLAR  ──►  PUANLAR (0–100)
                                                              │
5S: bölümler denetlenir ──► ilk 3 bölüm ödül alır ───────────┤
                                                              ▼
                                              PUAN LİSTESİ (personel sıralaması)
                                                              │
                                          Net 300'e ulaşan ──►  ÖDÜL VERİLİR (arşive geçer)
```

Anasayfada 3 kutu: **🏆 Puan Listesi · 💡🔧 Öneri & Kaizen · 🧹 5S**

---

## 1) Öneri & Kaizen

### Öneri Formu (No: `ÖNFR2607-01`)
Numara otomatik atanır: `ÖNFR` + yıl + ay + o ayki sıra (her ay sıfırlanır).
Alanlar: öneri sahibi, görevi, tarih, konu, detay açıklama, çözüm önerisi,
4 katkı sorusu (Kalite / Verimlilik / İSG / Maliyet), ek açıklama.

### Kaizen Formu (No: `ÖSKFR2607-01`)
Başlangıç–bitiş tarihi, kazanç başlıkları (Makine, İşçilik, Kalite, İSG, Ergonomi, Setup,
Stok, 5S… çoklu seçim), konu, yapıldığı bölüm, **ekip** (1 lider + en fazla 2 üye),
önceki/sonraki durum açıklaması **+ önce/sonra fotoğrafı**.

### Birleşik Liste ve Değerlendirme
- Öneri + kaizen tek listede tarihe göre sıralanır; **Tür / Dönem (ay) / arama** filtreleri.
- Satıra tıklayınca detay sayfası (kaizen'de önce/sonra görseller, puan kırılımı).
- **Yönetici akışı:** Onay / Red / Revize → onaylanan kayıtta **★ Puanla** →
  100 üzerinden rubrik puanlama:
  - Temel Şartlar (0–10) · Etki Odağı (0–40, 6 odaktan tek seviye) · Maliyet (0–20) ·
    Yaygınlaştırma (0–15) · Efor (0–15)
  - Her maddeye 0–maksimum arası serbest puan verilir; toplam canlı hesaplanır.
  - Bir kez onaylanan kayıt artık reddedilemez.

---

## 2) 5S Denetim

`/5s` sayfası — sekmeler: **Son Denetimler · Bölümler · Denetim Planı** + Geçmiş Denetimler ve Aksiyonlar sayfaları.

- **Bölümler:** bölüm ekle/sil; her bölüme 1 veya 2 **ekip lideri** + üye listesi.
- **Denetim Planı:** tarih aralığı seçilince tüm bölümler için denetim açılır
  (tur adı aydan otomatik: "Temmuz 2026 Denetimi"). Her bölüme gün + saat + denetmen atanır.
  - **Toplu dağıtım:** *Herkes kendi bölümüne* ya da *Çapraz* — her bölüm başka bir bölümce
    denetlenir, kimse kendi (veya ortak lider olduğu) bölümüne denk gelmez.
    Misafir denetmenler dengeli rastgele dağıtılır.
- **Denetim formu (şirket 5S Denetim Raporu şablonu):** 5 bölüm — S1 Ayıklama (25) ·
  S2 Düzenleme (35) · S3 Temizlik (20) · S4 Standartlaştırma (4) · S5 Eğitim-Disiplin (16);
  23 soru, her sorunun kendi puan üst sınırı
  (toplam 100, canlı hesaplanır). Kriter başına 3 fotoğraf + açıklama + en fazla 2
  **düzeltici aksiyon** (sorumlu + termin). Denetmen girişliyse adı oturumdan otomatik yazılır;
  denetmen yalnızca **kendisine planlanan** bölümü denetleyebilir.
- **Ödüllendirme:** tur tüm bölümlerde tamamlanınca yönetici **"Ödülleri İşle"** der →
  1./2./3. bölümün **tüm ekibine 100 / 75 / 50 puan** kalıcı eklenir.
- **Aksiyonlar:** açık/kapalı aksiyonlar tur → bölüm kırılımıyla listelenir. Aksiyonu yalnızca
  açıldığı bölümün ekip lideri (denetmen girişli) veya yönetici kapatabilir;
  **açıklama + en az 1 fotoğraf zorunlu**. Fotoğraflar ZIP, liste Excel olarak indirilebilir.

---

## 3) Puan Listesi & Ödül Sistemi

| Kaynak | Dağıtım |
|---|---|
| **Öneri** | sahibine, önerinin puanının **%10**'u |
| **Kaizen** | **lider %50**, her üye **%25** (en fazla 3 kişi) |
| **5S** | turda 1./2./3. bölümün **tüm ekibine 100 / 75 / 50** |

- Sütunlar: Öneri · Kaizen · 5S · Kazanılan · **Net** (net = kazanılan − verilen ödüller).
- Kişi satırına tıklayınca puanın hangi kayıtlardan geldiği açılır.
- Net puanı **300**'e ulaşan kişiye yönetici **🎁 Ödül Ver** der → 300 düşülür, kişi
  **Ödül Alanlar** listesine geçer. Ödül kaydı silinirse puan geri döner.

---

## 4) Yönetici Paneli

- **📊 İstatistikler:** Bu Ay / Son 6 Ay / Bu Yıl / Tüm Zamanlar — öneri-kaizen sayısı + durum dağılımı.
- **🧹 5S Trendi:** bölüm × tur skor tablosu (düşüş kırmızı ▼, artış yeşil ▲; Excel'e aktarılır).
- **👥 Denetmenler:** bölüm ekip liderleri otomatik listelenir; yönetici yalnızca şifre belirler.
- **🎫 Misafir denetmenler:** plan dağıtımında kullanılan harici kişiler.
- **🔑 Şifre değiştir.**

---

## Roller ve Erişim

| | Genel kullanıcı | Denetmen (girişli) | Yönetici (girişli) |
|---|---|---|---|
| Öneri/kaizen ekleme, tüm listeleri görüntüleme | ✅ | ✅ | ✅ |
| Kendisine planlanan bölümün 5S denetimi | ❌ | ✅ | ✅ |
| Kendi bölümünün aksiyonunu kapatma | ❌ | ✅ | ✅ |
| Onay/red/puanlama, düzenle/sil, 5S yönetimi | ❌ | ❌ | ✅ |
| Excel/ZIP indirme, yönetici paneli | ❌ | ❌ | ✅ |

---

## Kurulum ve Çalıştırma

**Gereksinimler:** Node.js **20+** (24 LTS önerilir) ve **MySQL 8** sunucusu.

```bash
npm install
npm start
```

- Bu bilgisayar: **http://127.0.0.1:5000**
- Aynı ağdaki cihazlar: **http://<PC-IP>:5000** (uygulama `0.0.0.0` dinler)

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

---

## Güvenlik Özeti

- Şifreler **pbkdf2 (600.000 iterasyon)** ile hash'lenir; düz metin saklanmaz.
- Tüm POST isteklerinde **CSRF token** doğrulaması.
- Girişte **kaba kuvvet koruması** (IP başına 10 dakikada 8 deneme); herkese açık yazma
  uçlarında hız limiti.
- Yüklenen dosyalar uzantı **+ dosya imzası (magic bytes)** ile doğrulanıp **sharp ile
  yeniden kodlanır** (EXIF/konum verisi temizlenir, 1600 px'e küçültülür); görsel servis
  uçları path-traversal korumalıdır.
- Güvenlik başlıkları (CSP, nosniff, X-Frame-Options DENY); oturum çerezi
  HttpOnly + SameSite=Lax, imza anahtarı veritabanında tutulur (koda gömülü değildir).

Ayrıntılar için: **[TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md)** (mimari ve iç işleyiş) ·
**[IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md)** (mimari/kod inceleme raporu ve iyileştirme önerileri) ·
**[DAGITIM.md](DAGITIM.md)** (sunucuda devreye alma: sunucu özellikleri, kurulum, HTTPS, yedekleme).
