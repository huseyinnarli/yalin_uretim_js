# Canlı Siteyi Güncelleme Rehberi

**lean.oztasglobal.net · eski sürüm (`1d67cea`, Temmuz 2026) → Kasım 2026 sürümü**

Bu belge, sunucudaki eski kodun üzerine yeni sürümü kuracak kişi içindir. Sırayla izlenirse veritabanı ve
fotoğraflar korunur, kullanıcıların oturumu düşmez, sorun çıkarsa dakikalar içinde eski sürüme dönülür.

- **Gereken bilgi:** sunucuda komut çalıştırabilmek (SSH / uzak masaüstü), MySQL'e bağlanabilmek.
- **Süre:** hazırlık + ön kontrol 30–45 dk, prova (önerilir) 20 dk. Kesinti, servis yeniden başlarken birkaç saniyedir.
- **Ayrıntı belgeleri:** veritabanı geçişinin teknik ayrıntısı ve deney sonuçları [VERITABANI_GECIS.md](VERITABANI_GECIS.md),
  sıfırdan sunucu kurulumu, HTTPS ve yedek düzeni [DAGITIM.md](DAGITIM.md), kullanıcıya görünen değişiklikler
  [DEGISIKLIKLER.md](DEGISIKLIKLER.md).

---

## 0. Bir bakışta

**Ne değişiyor?**
- **Kod:** yaklaşık 80 dosya değişti. Uygulama aynı: Node.js + Express + MySQL. Başlatma komutu (`node server.js`) ve port düzeni aynı.
- **Veritabanı:** aynı veritabanı kullanılır. Yeni sürüm ilk açılışta **3 boş tablo ve 26 boş kolon ekler**. Var olan
  hiçbir satır, kolon veya isim değişmez ya da silinmez.
- **Bağımlılıklar:** `multer` 1.4 → 2.4 (güvenlik güncellemesi). Bu yüzden `node_modules` **mutlaka yeniden kurulur**.
  Node.js **20.9 veya üstü** gerekir. Eski sürüm de aynı `sharp` sürümünü kullandığından canlıdaki Node büyük
  olasılıkla zaten uygundur.

**Yedi kural**
1. **`data/` klasörüne dokunmayın.** Fotoğraflar, veritabanı bağlantı ayarı (`db-config.json`), site ayarları
   (`config.json`) ve otomatik yedekler oradadır. Bu klasör git'te yoktur, yeni kodla gelmez. Silinirse geri gelmez.
2. **Yerel bilgisayardaki `data/` klasörünü sunucuya yüklemeyin.** Canlının bağlantı ayarlarının üzerine yazar.
3. **Önce yedek** (`mysqldump` + `data/` kopyası). Uygulamanın kendi ZIP yedeğine güvenmeyin (§4, T7).
4. **Önce salt-okunur ön kontrol** (`npm run gecis-kontrol`). Bu araç veritabanına hiçbir şey yazmaz.
5. **Veritabanı kullanıcısında CREATE ve ALTER yetkisi olmalı.** Bu yetkiler yoksa uygulama açılmaz (§4, T2). Ön kontrol bunu raporlar.
6. **`npm ci` sunucunun kendisinde çalıştırılır.** `node_modules` başka bir bilgisayardan kopyalanmaz.
7. **Eski kod klasörünü en az bir hafta silmeyin.** Geri dönüş bu klasörle yapılır.

---

## 1. Başlamadan önce: sunucuyu tanıyın

Aşağıdaki boşlukları doldurun. Rehberdeki `<UYGULAMA>`, `<VERI>`, `<DB>`, `<DBKULLANICI>` yer tutucuları bunlardır.

| Soru | Nasıl bakılır | Beklenen / not |
|---|---|---|
| Uygulama klasörü (`<UYGULAMA>`) | Servis tanımında `WorkingDirectory` (systemd), `AppDirectory` (NSSM) ya da paneldeki "Application root" | ör. `/home/yalinapp/app`, `C:\Uygulamalar\yalin` |
| Canlıdaki sürüm | `git -C <UYGULAMA> log -1 --oneline` | `1d67cea`. Klasör git değilse `package.json`'da `"multer": "^1.4.5-lts.2"` eski sürümü gösterir |
| Klasörde elle değiştirilmiş dosya var mı? | `git -C <UYGULAMA> status` | Temiz olmalı. Değişiklik varsa not edin, geliştiriciye sorun |
| Veri klasörü (`<VERI>`) | Servis ortamında `YALIN_DATA_DIR` var mı? Yoksa `<UYGULAMA>/data` | İçinde `db-config.json`, `kaizen_gorseller/`, `bes_s_gorseller/`, `aksiyon_gorseller/`, `_yedek_otomatik/` |
| Veritabanı adı ve kullanıcısı | `<VERI>/db-config.json` veya ortamdaki `YALIN_DB_*` | Varsayılan: `yalin_uretim` / `yalin` |
| Veritabanı sunucusu sürümü | `mysql -V` veya ön kontrol raporunun ilk satırı | MySQL 8 / MariaDB 10.6+ önerilir |
| Veritabanı kullanıcısının yetkileri | `mysql -u <DBKULLANICI> -p -e "SHOW GRANTS"` | En az **SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER** (ön kontrol de denetler) |
| Node sürümü | `node -v` | **v20.9.0 veya üstü** |
| Servis nasıl yönetiliyor? | `systemctl status yalin`, `pm2 ls`, `nssm status YalinUretim` veya panel | Yeniden başlatma komutunu not edin |
| Önde ters vekil (proxy) var mı? | nginx / Apache / IIS / Caddy / Cloudflare yapılandırması | Varsa `<VERI>/config.json`'daki `https` ve `proxy` ayarları ve yükleme sınırı önemlidir (§4, T3–T4) |
| Site ayarları | `<VERI>/config.json` (yoksa hepsi kapalıdır) | `{"https": true, "proxy": true, "yedek_dir": "..."}`. **Olduğu gibi kalmalı** |
| Disk boş alanı | `df -h` / Explorer | Yedek + `node_modules` (~150 MB) + dump için yer olmalı |
| İnternet erişimi | `npm ping` | `npm ci`, registry.npmjs.org'a erişmelidir (`sharp` işletim sistemine özel paket indirir) |

---

## 2. Adım adım güncelleme

### Adım 1 — Yedek (zorunlu)

Güncellemeden hemen önce alın. Uygulama çalışırken alınabilir.

```bash
# Linux
mysqldump -u <DBKULLANICI> -p --single-transaction --routines --default-character-set=utf8mb4 <DB> > yedek_oncesi_$(date +%F).sql
cp -a <VERI> <VERI>_yedek_$(date +%F)
```
```powershell
# Windows (mysqldump.exe, MySQL kurulumunun bin klasöründedir)
mysqldump.exe -u <DBKULLANICI> -p --single-transaction --routines --default-character-set=utf8mb4 <DB> --result-file=yedek_oncesi.sql
Copy-Item <VERI> <VERI>_yedek -Recurse
```

Karşılaştırma için şunu da yapın: **Puan Durumu › Excel** indirin. Güncellemeden sonra toplamlar aynı olmalıdır.

### Adım 2 — Yeni kodu yan klasöre hazırla (kesinti yok)

Canlı çalışmaya devam eder.

```bash
git clone https://github.com/huseyinnarli/yalin_uretim_js.git <UYGULAMA>_yeni
cd <UYGULAMA>_yeni && npm ci
```
`npm ci` hata vermeden bitmelidir. `sharp` ile ilgili bir hata görülürse §4, T6'ya bakın.

### Adım 3 — Salt-okunur ön kontrol (canlıya dokunmaz)

Yeni kodla, **canlı veritabanına karşı** çalıştırın. Araç, bağlantıyı veritabanı düzeyinde "READ ONLY" işlem olarak
açar; yazmaya kalksa bile sunucu reddeder.

```bash
cd <UYGULAMA>_yeni
YALIN_DATA_DIR=<VERI> npm run -s gecis-kontrol > on_kontrol.md ; echo "çıkış kodu: $?"
```
```powershell
cd <UYGULAMA>_yeni
$env:YALIN_DATA_DIR = "<VERI>"; npm run -s gecis-kontrol | Out-File -Encoding utf8 on_kontrol.md; "çıkış kodu: $LASTEXITCODE"
```
(Bağlantı ayarı ortam değişkenleriyle veriliyorsa aynı `YALIN_DB_*` değişkenlerini de verin.)

| Çıkış kodu | Anlamı |
|---|---|
| `0` | Engel yok |
| `2` | `on_kontrol.md` › **Sonuç** bölümündeki maddeler çözülmeden geçmeyin. Olası nedenler: varsayılan yönetici şifresi, eksik veritabanı yetkisi, otomatik eklenemeyecek kolon |
| `1` | Bağlanılamadı. Bağlantı ayarını kontrol edin |

Raporda bakılacaklar:
- **Oluşturulacak tablo: 3**, **eklenecek kolon: 26**, **otomatik EKLENMEYECEK kolon: 0**. Sıfır değilse durun, geliştiriciye bildirin.
- **Veritabanı kullanıcısının yetkileri → tamam.** "Eksik" yazıyorsa raporun önerdiği `GRANT` komutunu bir MySQL
  yöneticisine çalıştırtın (§4, T2).
- **Varsayılan şifre uyarısı:** ana yönetici şifresini **eski sitede şimdi değiştirin** (Yönetim › Şifre Değiştir) ve ön
  kontrolü tekrar çalıştırın.
- Otomatik birleşecek isimler ve benzer yazılışlar bilgi amaçlıdır; güncellemeyi engellemez (§5).

### Adım 4 — Kopya veritabanında prova (önerilir)

Canlının bir kopyası üzerinde yeni sürümü ayrı bir portta açıp gezin. Canlıya hiçbir şey yazılmaz.

```bash
mysql -u root -p -e "CREATE DATABASE yalin_prova CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci; GRANT ALL ON yalin_prova.* TO '<DBKULLANICI>'@'localhost';"
mysql -u <DBKULLANICI> -p yalin_prova < yedek_oncesi_*.sql
rsync -a --exclude _yedek_otomatik <VERI>/ /tmp/yalin_prova_veri/
cd <UYGULAMA>_yeni && YALIN_DATA_DIR=/tmp/yalin_prova_veri YALIN_DB_DATABASE=yalin_prova PORT=5099 node server.js
```
Tarayıcıda `http://<sunucu>:5099`. Eski şifrelerle girin, §2 Adım 7'deki listeyi gezin. Bitince `Ctrl+C` ile durdurun,
`yalin_prova` veritabanını ve kopya klasörü silin.

> Kopya klasördeki `config.json`'u açın ve iki satırı silin:
> - `"https"` satırı: prova doğrudan porttan (`http://`) yapıldığı için bu ayar açık kalırsa provada formlar çalışmaz (§4, T3).
> - `"yedek_dir"` satırı: prova sunucusu açılışta yedek alır; bu ayar kalırsa yedeği canlının yedek klasörüne yazar ve
>   oradaki en eski yedeği siler.

### Adım 5 — Geçiş (kısa kesinti)

Mesai dışında yapın. Üç yoldan sunucuya uyanı seçin.

**Yol A — Klasör değişimi (önerilen: kesinti saniyeler, geri dönüş en kolay)**

```bash
sudo systemctl stop yalin                                      # (Windows: nssm stop YalinUretim)
# Veri klasörü kodun İÇİNDEYSE (YALIN_DATA_DIR tanımlı değilse) yeni klasöre TAŞIYIN (aynı diskte anlıktır):
mv <UYGULAMA>/data <UYGULAMA>_yeni/data
mv <UYGULAMA> <UYGULAMA>_eski_$(date +%F)
mv <UYGULAMA>_yeni <UYGULAMA>
sudo systemctl start yalin                                     # (Windows: nssm start YalinUretim)
```
`mv` öncesinde `<UYGULAMA>_yeni` içinde `data` adlı bir klasör **olmamalıdır**; olursa veri `data/data` altına gider.
Klasör adı aynı kaldığı için servis tanımı değişmez. Uygulama başka bir kullanıcıyla çalışıyorsa (ör. `yalinapp`) yeni
klasörün sahibi o kullanıcı olmalıdır: `sudo chown -R yalinapp: <UYGULAMA>`.

**Yol B — Yerinde git güncellemesi** (canlı klasör temiz bir git klonuysa)

```bash
sudo systemctl stop yalin
cd <UYGULAMA> && git fetch origin && git checkout main && git pull --ff-only origin main && npm ci
sudo systemctl start yalin
```
Kesinti `npm ci` süresi kadardır (1–2 dk). Geri dönüş: `git checkout 1d67cea && npm ci`.

**Yol C — Dosya kopyalama (FTP / panel dosya yöneticisi)**

- Depodaki dosyaları eski klasörün **üzerine** kopyalayın. Klasörü önce **silmeyin**: `data/` içindedir.
- Kopyalanacak pakette `data/`, `node_modules/` ve `.git/` **olmamalı**.
- Sunucuda eski `node_modules` klasörünü silin, `npm ci` çalıştırın. Panelde "NPM Install" düğmesi varsa o da olur.
- Eski sürümden kalan `views/silinenler.ejs` zararsızdır, silinebilir.
- Panelli barındırmada (Plesk / cPanel "Node.js App") başlangıç dosyası `server.js`'dir. Ortam değişkenleri paneldeki
  ayarda kalır, değiştirmeyin. Bitince paneldeki "Restart" ile yeniden başlatın.

### Adım 6 — Açılış kontrolü

```bash
journalctl -u yalin -n 30        # Windows/NSSM: AppStdout dosyası · panel: uygulama günlüğü
```
- Beklenen satır: **`Yalın Üretim Uygulamaları çalışıyor: http://127.0.0.1:<PORT> (MySQL)`**.
- `Başlatma hatası — veritabanı kullanıcısının yetkisi yetersiz` görülürse §4, T2'yi uygulayın. O ana kadar oluşan
  tablolar zararsızdır. Hemen eski sürüme dönmek de mümkündür (§3).
- Ön kontrolü canlıya tekrar çalıştırın (Adım 3). Bu sefer **oluşturulacak tablo 0, eklenecek kolon 0** olmalıdır.

### Adım 7 — Duman testi (10 dk, canlıda)

Canlıda deneme kaydı oluşturmayın: her öneri/kaizen bir numara harcar ve silinse bile arşivde görünür.
Formlar ilk gerçek kayıtla takip edilir.

| # | Kontrol | Beklenen |
|---|---|---|
| 1 | Ana sayfayı bilgisayarda ve telefonda açın | Yeni görünüm, düzgün stil; girişten sonra üst menüde Panel. Stil bozuksa §4, T11 |
| 2 | Ana yönetici, bir ek yönetici ve bir denetmen **eski şifreleriyle** girsin | Giriş olur. Daha önce açık olan oturumlar da düşmez |
| 3 | Öneri & Kaizen listesi, bir kaydın detayı, bir kaizen görseli | Açılır |
| 4 | Puan Durumu: Adım 1'deki Excel ile karşılaştırın | **Toplam puan aynı.** Aynı kişinin farklı yazılışları birleştiği için kişi sayısı azalabilir; bu beklenen sonuçtur (§5) |
| 5 | 5S › bir bölüm › Periyodik Kontrol Formu | Takvim açılır |
| 6 | Excel: öneri, kaizen (görselli), puan listesi, kontrol formu | İner ve açılır |
| 7 | Yönetim › 🏆 Puan ve Ödül Ayarları | Açılır, değerler varsayılan: öneri %10, kaizen %50/%25, eşik 300, 5S 100/75/50. **Kaydetmeyin** |
| 8 | Yönetim › İşlem Günlüğü | Eski kayıtlar görünür |
| 9 | Ters vekil varsa: bir sonraki 5S denetiminde fotoğraflı gönderimi izleyin | "413" veya zaman aşımı olmamalı (§4, T4) |

### Adım 8 — Güncelleme sonrası yönetim işleri (ana yönetici)

1. Ana yönetici şifresi hâlâ varsayılansa **hemen değiştirin**.
2. Yönetim › Yöneticiler: ek yöneticilerin yetkilerini gözden geçirip **her birini bir kez kaydedin**. Eski yetki
   anahtarları okunurken otomatik çevrilir; kaydedince yeni biçimde yazılır.
3. Yönetim › Denetmenler: görev/düzeltme atanacak kişilere ve hesabı olmayan bölüm liderlerine hesap açın. Ön kontrol
   raporu bu bölüm liderlerinin listesini verir.
4. 🔗 İsim Birleştirme: önerilen benzer yazılışları inceleyin (§5).
5. Ödül dağıtmadan önce Puan Durumu'na bakın: isimler birleştiği için eşiği yeni geçen kişi olabilir.
6. Kullanıcılara duyurun:
   - Öneri ve kaizen **formları herkese açık**, ama **liste ve detay artık giriş ister**.
   - Excel'de **Form No sütunu kalktı.** Öneri Excel'inde 2. sütundu, sonraki sütunlar bir sola kaydı. Kaizen
     Excel'inde "Kayıt Zamanı"ndan sonraydı. Yeni sütunlar en sona eklendi. Excel'i sabit sütunlu bir şablona yapıştıran
     varsa şablonu güncellemelidir.

---

## 3. Geri dönüş

| Durum | Yapılacak | Veri kaybı |
|---|---|---|
| Yeni sürümde sorun var, eskiye dönülecek (Yol A) | Servisi durdurun, `data/` klasörünü (koddaysa) eski klasöre geri taşıyın, klasör adlarını geri çevirin, servisi başlatın | **Yok.** Eklenen tablo/kolonlar eski kodu bozmaz (denendi). Yeni sürümde girilen red gerekçesi, görev, kontrol formu gibi bilgiler veritabanında kalır; eski sürümde görünmez, yeniye dönünce yerindedir |
| Yol B ile güncellendiyse | `git checkout 1d67cea && npm ci`, servisi yeniden başlatın | Yok |
| Veritabanı gerçekten bozuldu (beklenmez) | Adım 1'deki dump'ı geri yükleyin: `mysql -u <DBKULLANICI> -p <DB> < yedek_oncesi_*.sql` | Güncellemeden sonra girilen kayıtlar |
| Fotoğraflar kayboldu (ör. `data/` silindi) | Adım 1'deki `<VERI>_yedek_*` kopyasını geri koyun | Güncellemeden sonra yüklenen fotoğraflar |

---

## 4. Dikkat edilmesi gereken noktalar

"Denendi" yazanlar 2 Kasım 2026'da gerçek ortamda yeniden üretildi (§7).

**T1 — `data/` klasörü kaybı.**
- Belirti: fotoğraflar açılmaz, uygulama "Başlatma hatası — MySQL bağlantı ayarlarını kontrol edin" diye açılmaz.
- Neden: klasör kodla birlikte silindi ya da yerelden gelen bir `data/` canlının üzerine yazdı.
- Çözüm: Adım 1 yedeğinden geri koyun. Kalıcı çözüm olarak veri klasörünü kodun dışına taşıyıp `YALIN_DATA_DIR` ile
  gösterin ([DAGITIM.md](DAGITIM.md) §5). Bundan sonraki güncellemeler veriye hiç değmez.

**T2 — Veritabanı yetkisi (denendi).**
- Uygulama **her açılışta** `CREATE TABLE IF NOT EXISTS` çalıştırır. Tablo zaten varsa bile CREATE yetkisi ister.
  Eksik kolon varsa ALTER yetkisi de gerekir.
- Eski sürümde eklenecek kolon olmadığı için ALTER hiç çalışmamış olabilir. Yetkinin eksik olduğu kimsenin dikkatini
  çekmemiş olabilir.
- Belirti: uygulama açılmaz. Günlükte `CREATE command denied ...` veya `ALTER command denied ... for table oneriler` görülür.
- Çözüm (MySQL yöneticisi): `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER ON <DB>.* TO '<DBKULLANICI>'@'<host>';`
  verin, sonra servisi yeniden başlatın. Ön kontrol (Adım 3) bunu önceden yakalar.

**T3 — `https` / `proxy` ayarları (denendi).**
- `<VERI>/config.json`'da `"https": true` varken istek uygulamaya şifreli gelmiş görünmezse oturum çerezi **hiç
  yazılmaz**.
- Belirti: her form gönderiminde **"CSRF doğrulaması başarısız — sayfayı yenileyip tekrar deneyin."** görülür,
  girişler başa döner.
- Bu iki durumda olur:
  - Ters vekil `X-Forwarded-Proto: https` başlığını göndermiyorsa, ya da `"proxy": true` değilse.
  - Site doğrudan `http://<ip>:5000` üzerinden açılıyorsa.
- Çözüm:
  - Vekilde başlığı ekleyin. nginx: `proxy_set_header X-Forwarded-Proto $scheme;` ve
    `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. IIS/ARR'de sunucu değişkeni olarak eklenir.
  - `config.json`'da `{"https": true, "proxy": true}` birlikte olsun.
  - Kullanıcılar yalnızca `https://lean.oztasglobal.net` adresini kullansın.
- Canlıda bu ayarlar zaten çalışıyorsa **değiştirmeyin**; `config.json` `data/` içinde olduğu için güncellemeden etkilenmez.

**T4 — Yükleme boyutu ve zaman aşımı.**
- 5S denetim formu soru başına 3, toplam 69 fotoğraf alanı içerir; her fotoğraf en çok 8 MB olabilir. Telefonla
  çekilmiş 20 fotoğraflık bir denetim 60–120 MB tutar.
- Ters vekilin varsayılan sınırları bunu keser:
  - nginx: varsayılan 1 MB.
  - IIS: ~28,6 MB.
  - Cloudflare ücretsiz plan: 100 MB ve 100 sn.
- Belirti: denetim gönderiminde "413 Request Entity Too Large" veya zaman aşımı görülür, girilen form kaybolur.
- Önerilen ayarlar:
  - nginx: `client_max_body_size 200m;` ve `proxy_read_timeout 300s;`. Fotoğraflı ZIP ve kaizen Excel'i de uzun sürebilir.
  - IIS: `requestFiltering/requestLimits maxAllowedContentLength="209715200"`.
- Eski sürümde de aynıydı; eski sitede fotoğraflı denetim sorunsuz gidiyorsa ayar zaten yeterlidir.

**T5 — Hız sınırları IP başınadır.**
- Sınırlar:
  - Öneri ve kaizen formu: 5 dakikada en çok 30.
  - Aksiyon kapatma: 5 dakikada en çok 40.
  - Hatalı şifre: 10 dakikada 8.
- Fabrikadan çıkan herkes internete tek bir IP ile çıkıyorsa bu sınırlar **bütün fabrikaya ortaktır**. Örneğin bir
  kişi 8 kez yanlış şifre girerse 10 dakika boyunca kimse giriş yapamaz.
- `"proxy": true` olmadan vekil arkasında herkes vekilin IP'si (127.0.0.1) görünür. Bu da aynı sonucu verir.
- Sayaçlar bellektedir; servis yeniden başlatılınca sıfırlanır. Eski sürümde de aynıydı. Kalıcı çözüm geliştirici
  tarafındadır (§6).

**T6 — `node_modules` ve `sharp`.**
- Belirti: `Could not load the "sharp" module` veya `Cannot find module 'multer'`.
- Neden: `node_modules` eski kaldı, başka bir işletim sisteminden (ör. Windows'tan Linux'a) kopyalandı ya da sunucu
  npm deposuna ulaşamadı.
- Çözüm: `node_modules`'ı silip **sunucuda** `npm ci` çalıştırın. Sunucunun internet erişimi yoksa `npm ci`'yi
  **aynı işletim sistemi ve işlemci mimarisindeki** bir makinede yapıp klasörü taşıyın.

**T7 — Uygulamanın kendi ZIP yedeği yeterli değildir.**
- Uygulama her açılışta ve 6 saatte bir `data/_yedek_otomatik/` içine (veya `config.json` › `yedek_dir`) bir ZIP
  yazar ve **son 15'i** tutar.
- Sınırları:
  - Güncelleme sırasında servisi 15 kez yeniden başlatırsanız güncelleme öncesi ZIP'ler silinir.
  - ZIP'ten geri yükleyen hazır bir araç **yoktur**; içindeki `veritabani.json` elle işlenmelidir.
  - Her ZIP bütün fotoğrafları içerir. 2 GB fotoğraf arşivi için 15 × 2 GB disk gerekir.
- Bu yüzden geri dönüşün esası Adım 1'deki `mysqldump` + `data/` kopyasıdır. Kalıcı düzen için günlük mysqldump
  kurun ([DAGITIM.md](DAGITIM.md) §7).

**T8 — `npm test` canlı sunucuda çalıştırılmaz.**
- Test, bağlandığı test veritabanının (`yalin_e2e`, ya da `YALIN_E2E_DB` ile verilen ad) **bütün tablolarını siler**.
- `YALIN_E2E_DB`'ye asla canlı veritabanının adını vermeyin. Testi geliştirme makinesinde çalıştırın.

**T9 — Demo dosyaları canlıda kullanılmaz.**
- `Dockerfile`, `scripts/demo-baslat.sh`, `scripts/demo-veri.js` ve `YALIN_DEMO` ortam değişkeni yalnızca Render'daki
  tasarım önizlemesi içindir.
- `YALIN_DEMO=1` canlıda tanımlanırsa sayfanın üstünde örnek şifreleri gösteren bir demo şeridi çıkar.

**T10 — Varsayılan şifre ve herkese açık depo.**
- Kod GitHub'da **herkese açık** (2 Kasım 2026 itibarıyla). Varsayılan ana yönetici şifresi `admin123` kaynak kodda okunabilir.
- Ana yönetici şifresinin değiştirildiğinden emin olun (ön kontrol uyarır).
- Depoyu gizli yapın: GitHub › Settings › Danger Zone › Change visibility › Private. Bunu yaparsanız sunucudaki
  `git pull` için erişim anahtarı (deploy key) gerekir.

**T11 — Tarayıcı ve CDN önbelleği.**
- Eski sürüm `/static/style.css` dosyasını tarayıcıya **1 yıl önbelleklet** diyerek gönderiyordu, adres de hep
  aynıydı. Bu yüzden güncellemeden sonra telefonlar eski stili kullanmaya devam edecekti.
- Bu sürümde düzeltildi: adresler içerik özetiyle sürümlüdür (`style.css?v=…`). Tarayıcı yeni dosyayı kendiliğinden indirir.
- Sitenin önünde HTML sayfalarını da önbelleğe alan bir CDN (ör. Cloudflare "Cache Everything") varsa güncellemeden
  sonra **önbelleği temizleyin** ("Purge Everything").

**T12 — Eski adresler ve QR kodları.**
- Eski sürümün bütün adresleri yeni sürümde de vardır (rota listesi karşılaştırıldı). Sahadaki QR kodları ve yer
  imleri çalışır.
- Fark şu: `/liste`, `/detay` ve kaizen görselleri artık giriş ister. Girişsiz gelen kullanıcı giriş sayfasına
  yönlenir. `/oneri/yeni` ve `/kaizen/yeni` formları açıktır.

**T13 — Giriş sırasında kısa donmalar.**
- Giriş "şifre = kimlik" mantığıyla çalışır: bir şifre girildiğinde bütün hesapların şifre özetleri sırayla denenir.
- Her deneme hesap başına yaklaşık 0,1–0,3 sn sürer ve bu sürede sunucu **başka hiçbir isteğe cevap vermez**.
- 30 hesapta tek bir yanlış şifre herkes için 3–9 sn duraklama demektir.
- Eski sürümde de aynıydı. Ancak yeni sürümde liste giriş istediği için giriş sayısı artar. Hesap sayısı artmadan
  önce düzeltilmesi önerilir (§6, Ö10).

**T14 — Bellek.**
- Yüklenen fotoğraflar işlenene kadar bellekte tutulur.
- Aynı anda birkaç fotoğraflı denetim gönderilirse yüzlerce MB kullanılabilir. Sunucuda en az 2 GB, tercihen 4 GB RAM olmalıdır.

**T15 — Saat.**
- Uygulama tarihleri her zaman Türkiye saatiyle (`Europe/Istanbul`) hesaplar; sunucunun saat dilimi ayarı önemli değildir.
- Ancak sunucu saati **doğru** olmalıdır; NTP açık olmalı.

---

## 5. İsim hataları ve kişi bazlı raporlar

Formlar herkese açık olduğu için isimler serbest yazılır ve yazım farkları kaçınılmazdır. Uygulama bunu üç katmanda ele alır:

1. **Girişte düzeltme:** ad ve soyad ayrı kutulardan alınır, büyük/küçük harf düzeltilir ("aYşe" "çelik" → "Ayşe Çelik").
2. **Otomatik eşleştirme:** puan hesabında isimler bir anahtarla karşılaştırılır. Bu anahtar büyük/küçük harf,
   Türkçe karakter (ç/ğ/ı/ö/ş/ü), fazla boşluk ve noktalama farklarını yok sayar. "AYŞE ÇELİK", "ayse celik" ve "Ayşe  Çelik" tek kişi sayılır.
3. **Elle birleştirme:** yazım hataları ("Ahmet Yılmz") otomatik birleşmez. **🔗 İsim Birleştirme** sayfası benzer
   yazılışları önerir, birleştirme bir tıkla yapılır ve geri alınabilir. Kayıtlardaki isimler hiçbir zaman değiştirilmez.

**Rapor alırken dikkat:**
- **Puan Durumu** ve **Puan Listesi Excel'i** birleştirilmiş isimlerle çalışır. Kişi bazlı toplamlar için doğru kaynak budur.
- **Öneri ve Kaizen Excel'leri** isimleri **kayıtta yazıldığı gibi** gösterir. Bu dosyada "kim kaç öneri verdi" diye
  özet tablo (pivot) yapılırsa aynı kişi birkaç satıra bölünebilir.
  - Bu, geliştirici tarafında açık bir eksiktir (§6, Ö14).
  - O düzeltilene kadar pivot yerine Puan Durumu'nu kullanın, ya da önce İsim Birleştirme sayfasını gözden geçirin.
- **Rutin:** her ay rapor ve ödül dağıtımından önce İsim Birleştirme sayfasını açıp "benzer" önerilerini temizleyin.
- **Bilinen sınır:** aynı adı ve soyadı taşıyan iki farklı çalışan ayırt edilemez. Kalıcı çözüm sicil numarasıdır (§6, Ö11).

---

## 6. Kod incelemesi: eksikler ve öneriler (geliştirici için)

İnceleme 2 Kasım 2026'da canlıya geçiş gözüyle yapıldı. Önceki güvenlik/mimari bulguları [IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md)'dedir.

| # | Bulgu | Etki | Durum |
|---|---|---|---|
| — | `/static` dosyaları 1 yıl önbelleklenirken adresleri sürümsüzdü; güncellemeden sonra kullanıcılar eski CSS/JS'i görecekti | Yüksek | ✅ **Düzeltildi:** `?v=<içerik özeti>` (`web.js:statikSurum`, `server.js`, header/footer). Test eklendi |
| — | Ön kontrol, veritabanı kullanıcısının CREATE/ALTER yetkisini denetlemiyordu; eksikse uygulama açılmıyor | Yüksek | ✅ **Eklendi:** `gecis-kontrol` SHOW GRANTS ile denetler, eksikse çıkış kodu 2 ve GRANT komutu önerir |
| — | Açılışta yetki hatası "bağlantı ayarlarını kontrol edin" diye yanlış yönlendiriyordu | Düşük | ✅ **Düzeltildi:** ayrı mesaj |
| Ö9 | Depo herkese açık; varsayılan şifre kaynakta | Yüksek | Açık: depoyu gizli yapın, şifreyi değiştirin (T10) |
| Ö10 | Girişte bütün hesap özetleri `pbkdf2Sync` ile taranıyor; olay döngüsü bloklanıyor | Orta–Yüksek | Açık: hızlı çözüm asenkron `crypto.pbkdf2` (~1 saat); kalıcı çözüm girişte kişi seçimi/kullanıcı adı. Komite puanlaması gibi hesap artışından önce yapılmalı (T13) |
| Ö14 | Öneri/Kaizen Excel'lerinde isimler ham; kişi bazlı sayım bölünüyor | Orta | Açık: Excel'e "Kişi (birleştirilmiş)" sütunu ve kişi başına öneri/kaizen sayısını veren bir "Kişi Özeti" sayfası (§5) |
| Ö11 | Aynı ad-soyadlı iki çalışan ayırt edilemiyor | Orta | Açık: personel listesi + sicil numarası |
| Ö15 | `npm test`, `YALIN_E2E_DB` ile verilen veritabanının tablolarını koşulsuz siliyor | Orta | Açık: ad canlı veritabanıyla aynıysa veya `test/e2e` içermiyorsa test başlamasın (T8) |
| Ö16 | ZIP yedeğinden geri yükleme aracı yok; her ZIP bütün fotoğrafları içeriyor; her açılışta bir yedek alınıyor | Orta | Açık: geri yükleme betiği; fotoğraflar için artımlı kopya; açılış yedeği için asgari aralık (T7) |
| Ö17 | Yüklemeler bellekte (`multer.memoryStorage`), denetimde 69 dosyaya kadar | Düşük–Orta | Açık: disk depolama veya toplam boyut sınırı (T14) |
| Ö18 | Hız sınırları yalnız IP'ye bağlı ve bellekte; fabrika tek IP'den çıkıyorsa herkese ortak | Düşük–Orta | Açık: giriş kilidinde IP + hesap birlikte; sınırları yapılandırılabilir yapmak (T5) |
| Ö3 | `/saglik` ucu yok; dışarıdan izleme yapılamıyor | Düşük | Açık |
| Ö12 | Çıkış GET ile; şifre değişince açık oturumlar düşmüyor | Düşük | Açık |
| Ö1 | CSP `'unsafe-inline'` (şablonlarda satır içi JS) | Düşük | Açık |

---

## 7. Bu rehber nasıl doğrulandı (2 Kasım 2026)

Güncel kod (bu belgeyle aynı commit), eski sürümün (`1d67cea`) ürettiği bir veritabanı üzerinde denendi. Bu veritabanında
29 öneri ve 6 kaizen vardı; isimler tek kutudan ve 14 farklı yazılışla girilmişti. Ayrıca eski yetki anahtarlı
yöneticiler, denetmenler, ödül defteri ve form numaraları bulunuyordu.

| Deneme | Sonuç |
|---|---|
| Ön kontrol (Adım 3): çalıştırmadan önce ve sonra bütün tabloların `CHECKSUM TABLE` değerleri | **Aynı**: araç hiçbir şey yazmıyor |
| Ön kontrol raporu | 3 tablo, 26 kolon eklenecek, otomatik eklenemeyecek kolon 0 |
| Yeni sürümün bu veritabanıyla açılması + 46 kontrollük geçiş doğrulaması (eski veri birebir, puan toplamları, eski şifrelerle giriş, bütün sayfalar, Excel'ler) | **46/46** |
| Açılıştan sonra ön kontrol | Eklenecek tablo 0, kolon 0 |
| Geri dönüş: eski sürüm (kendi `node_modules`'ıyla) genişletilmiş veritabanında | Giriş, öneri gönderme, listeler, puan, 5S, silinenler çalışıyor |
| Yalnız SELECT/INSERT/UPDATE/DELETE yetkili kullanıcı | Uygulama açılmıyor (`CREATE command denied`); ön kontrol "eksik: CREATE, ALTER" diyor |
| CREATE var, ALTER yok | Uygulama açılmıyor (`ALTER command denied ... oneriler`); ön kontrol "eksik: ALTER" diyor |
| Joker kalıplı yetki (`yalin\_yet%`.*) | Ön kontrol doğru çözüyor |
| `https: true` iken `X-Forwarded-Proto` yok | Oturum çerezi yazılmıyor; giriş formu **400 "CSRF doğrulaması başarısız"** |
| `https: true` + `proxy: true` + `X-Forwarded-Proto: https` | Çerez `Secure` ile yazılıyor, giriş çalışıyor |
| Uçtan uca test paketi (`npm test`, ayrı test veritabanı) | **159/159** |

---

## Ek A — Komut özeti

```bash
# --- Linux (systemd) ---
mysqldump -u <DBKULLANICI> -p --single-transaction --routines --default-character-set=utf8mb4 <DB> > yedek_oncesi_$(date +%F).sql
cp -a <VERI> <VERI>_yedek_$(date +%F)
git clone https://github.com/huseyinnarli/yalin_uretim_js.git <UYGULAMA>_yeni && cd <UYGULAMA>_yeni && npm ci
YALIN_DATA_DIR=<VERI> npm run -s gecis-kontrol > on_kontrol.md ; echo $?      # 0 olmalı
sudo systemctl stop yalin
mv <UYGULAMA>/data <UYGULAMA>_yeni/data            # yalnız veri klasörü kodun içindeyse
mv <UYGULAMA> <UYGULAMA>_eski_$(date +%F) && mv <UYGULAMA>_yeni <UYGULAMA>
sudo systemctl start yalin && journalctl -u yalin -n 30
cd <UYGULAMA> && YALIN_DATA_DIR=<VERI> npm run -s gecis-kontrol | grep -E "Oluşturulacak|Eklenecek"   # 0 / 0
```

```powershell
# --- Windows (NSSM) ---
mysqldump.exe -u <DBKULLANICI> -p --single-transaction --routines --default-character-set=utf8mb4 <DB> --result-file=yedek_oncesi.sql
Copy-Item <VERI> <VERI>_yedek -Recurse
git clone https://github.com/huseyinnarli/yalin_uretim_js.git <UYGULAMA>_yeni; cd <UYGULAMA>_yeni; npm ci
$env:YALIN_DATA_DIR = "<VERI>"; npm run -s gecis-kontrol | Out-File -Encoding utf8 on_kontrol.md; $LASTEXITCODE
nssm stop YalinUretim
Move-Item <UYGULAMA>\data <UYGULAMA>_yeni\data      # yalnız veri klasörü kodun içindeyse
Move-Item <UYGULAMA> <UYGULAMA>_eski; Move-Item <UYGULAMA>_yeni <UYGULAMA>
nssm start YalinUretim
```
