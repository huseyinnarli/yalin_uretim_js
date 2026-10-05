# Sunucuda Devreye Alma Rehberi (DAĞITIM)

Bu belge uygulamayı bir sunucuda kalıcı olarak çalıştırmak için gereken her şeyi anlatır:
sunucu özellikleri, adım adım kurulum (Windows ve Linux), HTTPS/internete açma, yedekleme,
güncelleme ve devreye alma kontrol listesi.

---

## 1. Dağıtım Senaryoları

| Senaryo | Uygun ortam | Not |
|---|---|---|
| **A — Fabrika içi Windows PC** | Mevcut bir ofis PC'si, LAN | En hızlı yol; bu makinede zaten kurulu düzen (bkz. §4) |
| **B — Linux sunucu (önerilen üretim)** | Şirket sunucusu veya bulut VM (Ubuntu LTS) | Servis yönetimi, yedek ve güncelleme en temiz burada (bkz. §5) |
| **C — İnternete açık** | B üzerine reverse proxy + TLS | `https`/`proxy` bayrakları ŞART (bkz. §6) |
| **D — Demo / tasarım önizleme** | Render (Docker) | Kendi içinde geçici MariaDB + örnek veri; gerçek veri YOK (bkz. §11) |

Uygulama **tek Node.js süreci + MySQL** ister; konteyner, mesaj kuyruğu, önbellek sunucusu
gibi ek bileşen gerekmez.

## 2. Sunucu Gereksinimleri

Uygulama hafiftir: sunucu tarafı render, ağır arka plan işi yok. Darboğaz büyüyen görsel
arşivi (disk) ve nadiren Excel üretimidir (CPU, kısa süreli).

| Bileşen | Asgari | Önerilen (50–150 kullanıcı, fabrika) |
|---|---|---|
| CPU | 2 çekirdek | 4 çekirdek (Excel üretimi + MySQL rahat eder) |
| RAM | 2 GB | 4–8 GB (MySQL InnoDB buffer + Node ~200 MB) |
| Disk | 20 GB SSD | 60+ GB SSD — büyüme kalemi fotoğraflardır (~150-400 KB/foto işlenmiş; denetim başına ≤69 foto) |
| İşletim sistemi | Windows 10/11, Windows Server 2019+, Ubuntu 22.04/24.04 LTS | Ubuntu 24.04 LTS |
| Yazılım | Node.js 20+ (24 LTS önerilir), MySQL 8.x | Aynı makinede MySQL yeterli |
| Ağ | 100 Mbps LAN | Sabit IP veya DNS kaydı (ör. `yalin.sirket.local`) |
| Yedek hedefi | — | İkinci disk veya ağ paylaşımı (ZIP yedekler + mysqldump için) |

Kapasite notu: mevcut mimari onlarca eşzamanlı kullanıcıyı tek süreçte rahat taşır.
Kayıt sayısı binleri, eşzamanlı kullanıcı ~50'yi aşarsa rapordaki Ö2 (sayfalama/worker)
maddesini uygulayın.

## 3. Ortak Kavramlar

- **Bağlantı ayarları:** `data/db-config.json` → `{host, port, user, password, database}`
  veya `YALIN_DB_*` ortam değişkenleri.
- **Dağıtım bayrakları:** `data/config.json` → `{"https": true, "proxy": true,
  "yedek_dir": "D:/YalinYedek", "yedek_gorseller": true}` (hepsi isteğe bağlı).
- **Veri klasörü:** görseller + yedekler + config `data/` altındadır; `YALIN_DATA_DIR` ile
  kod dizini dışına taşınabilir (üretimde önerilir).
- Şema otomatik kurulur — veritabanı ve kullanıcıyı bir kez oluşturmak yeterlidir.

## 4. Senaryo A — Windows (fabrika içi)

> Geliştirme yapılan makinede bu düzen zaten kuruludur: MySQL, `YalinMySQL` adlı Windows
> servisi olarak çalışır (veri: `C:\ProgramData\YalinMySQL`).

1. **Node.js 24 LTS** kurun: `winget install OpenJS.NodeJS.LTS`
2. **MySQL 8** kurun: `winget install Oracle.MySQL`
3. MySQL'i servis yapın (Yönetici PowerShell — veri dizini **ProgramData altında olmalı**,
   kullanıcı profili altında servis başlamaz):
   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --initialize-insecure --datadir="C:\ProgramData\YalinMySQL\data"
   # C:\ProgramData\YalinMySQL\my.ini dosyasını oluşturun:
   #   [mysqld]
   #   datadir=C:/ProgramData/YalinMySQL/data
   #   port=3306
   #   bind-address=127.0.0.1
   & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --install YalinMySQL --defaults-file=C:\ProgramData\YalinMySQL\my.ini
   sc.exe config YalinMySQL start= auto
   sc.exe start YalinMySQL
   ```
4. Veritabanı + kullanıcı (root ile bir kez; ardından root'a şifre koyun):
   ```sql
   CREATE DATABASE yalin_uretim CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;
   CREATE USER 'yalin'@'localhost' IDENTIFIED BY '<güçlü-şifre>';
   GRANT ALL PRIVILEGES ON yalin_uretim.* TO 'yalin'@'localhost';
   ALTER USER 'root'@'localhost' IDENTIFIED BY '<root-şifresi>';
   ```
5. Uygulama:
   ```powershell
   git clone https://github.com/huseyinnarli/yalin_uretim_js.git C:\Uygulamalar\yalin
   cd C:\Uygulamalar\yalin; npm ci
   # data\db-config.json dosyasını oluşturun (bkz. §3)
   npm start   # deneme — http://127.0.0.1:5000
   ```
6. **Uygulamayı servis yapın** (Node için en pratik yol [NSSM](https://nssm.cc)):
   ```powershell
   nssm install YalinUretim "C:\Program Files\nodejs\node.exe" "C:\Uygulamalar\yalin\server.js"
   nssm set YalinUretim AppDirectory C:\Uygulamalar\yalin
   nssm set YalinUretim Start SERVICE_AUTO_START
   nssm start YalinUretim
   ```
   (NSSM istenmiyorsa: Görev Zamanlayıcı'da "bilgisayar açılışında", kullanıcı oturumu
   gerektirmeyen bir görev de olur.)
7. **Güvenlik duvarı:** yalnızca LAN'dan 5000/TCP'ye izin verin; 3306 dışa kapalı kalsın:
   ```powershell
   New-NetFirewallRule -DisplayName "Yalin Uretim" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -RemoteAddress LocalSubnet
   ```
8. Diğer cihazlardan erişim: `http://<sunucu-ip>:5000`

## 5. Senaryo B — Linux sunucu (önerilen üretim)

Ubuntu 24.04 LTS üzerinde:

```bash
# 1) Node.js 24 + MySQL
sudo apt update && sudo apt install -y mysql-server git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs

# 2) MySQL sertleştirme + veritabanı
sudo mysql_secure_installation
sudo mysql -e "
  CREATE DATABASE yalin_uretim CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;
  CREATE USER 'yalin'@'localhost' IDENTIFIED BY '<güçlü-şifre>';
  GRANT ALL PRIVILEGES ON yalin_uretim.* TO 'yalin'@'localhost';"

# 3) Uygulama kullanıcısı + kod (root ile ÇALIŞTIRMAYIN)
sudo useradd -r -m -s /usr/sbin/nologin yalinapp
sudo -u yalinapp git clone https://github.com/huseyinnarli/yalin_uretim_js.git /home/yalinapp/app
cd /home/yalinapp/app && sudo -u yalinapp npm ci

# 4) Veri klasörü + bağlantı ayarı
sudo -u yalinapp mkdir -p /var/lib/yalin/data
# /var/lib/yalin/data/db-config.json → {"host":"127.0.0.1","port":3306,"user":"yalin","password":"...","database":"yalin_uretim"}
```

**systemd servisi** — `/etc/systemd/system/yalin.service`:

```ini
[Unit]
Description=Yalin Uretim Uygulamalari
After=network.target mysql.service
Requires=mysql.service

[Service]
User=yalinapp
WorkingDirectory=/home/yalinapp/app
Environment=YALIN_DATA_DIR=/var/lib/yalin/data
Environment=PORT=5000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
# Sertleştirme
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/yalin/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now yalin
sudo ufw allow from 10.0.0.0/8 to any port 5000 proto tcp   # yalnız LAN (ağınıza göre)
```

## 6. İnternete Açma (HTTPS)

Uygulama TLS sonlandırmaz — önüne bir reverse proxy koyun. En kolayı **Caddy**
(sertifikayı Let's Encrypt'ten otomatik alır ve yeniler):

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
#   yalin.sirketiniz.com {
#       reverse_proxy 127.0.0.1:5000
#   }
sudo systemctl reload caddy
```

Ardından uygulama bayraklarını açın — `/var/lib/yalin/data/config.json`:

```json
{ "https": true, "proxy": true }
```

ve `sudo systemctl restart yalin`. Bu bayraklarla: oturum çerezi yalnız şifreli bağlantıda
taşınır, HSTS gönderilir, hız limitleri gerçek istemci IP'sine göre çalışır.

**Zorunlu kontrol listesi (internet):** 5000 portunu dışarı KAPATIN (yalnız 80/443 açık;
proxy 127.0.0.1'e gider) · 3306 dışa kapalı · yönetici şifresi güçlü ve varsayılan değil ·
işletim sistemi otomatik güvenlik güncellemeleri açık (`unattended-upgrades`).

nginx tercih ederseniz: `proxy_pass http://127.0.0.1:5000` + `proxy_set_header X-Forwarded-For`
ve `X-Forwarded-Proto $scheme` başlıklarını iletmeyi unutmayın (certbot ile TLS).

## 7. Yedekleme Stratejisi

Üç katman önerilir:

1. **Uygulama içi (hazır):** açılışta + 6 saatte bir tablolar + görseller tek ZIP
   (son 15). `config.json` → `"yedek_dir"` ile **farklı diske/ağ paylaşımına** yönlendirin:
   `{"yedek_dir": "/mnt/yedek/yalin"}` veya Windows'ta `"D:/YalinYedek"`.
2. **mysqldump (günlük, cron):**
   ```bash
   # /etc/cron.d/yalin-yedek  (her gece 02:15)
   15 2 * * * yalinapp mysqldump -u yalin -p'<şifre>' yalin_uretim | gzip > /mnt/yedek/yalin/dump_$(date +\%F).sql.gz
   ```
   30 günden eskileri silen bir `find -mtime +30 -delete` satırı ekleyin.
3. **Saha dışı kopya (haftalık):** yedek klasörünü şirket dosya sunucusuna/buluta eşitleyin
   (rsync / Robocopy / bulut istemcisi).

**Geri dönüş tatbikatı:** dump'ı boş bir veritabanına yükleyin (`mysql yalin_test < dump.sql`),
uygulamayı `YALIN_DB_DATABASE=yalin_test` ile açıp veriyi görün. Yedek, geri dönülebildiği
kanıtlanınca yedektir.

## 8. Güncelleme Prosedürü

> Sürüme özel notlar (eklenen kolonlar/tablolar, canlıya alma sonrası yapılacaklar): **[DEGISIKLIKLER.md](DEGISIKLIKLER.md)**.

```bash
cd /home/yalinapp/app
sudo -u yalinapp git pull
sudo -u yalinapp npm ci
sudo -u yalinapp npm test          # isteğe bağlı ama önerilir (ayrı test DB'si ister)
sudo systemctl restart yalin
```

Şema değişikliği içeren sürümlerde tablolar `CREATE TABLE IF NOT EXISTS` ile kendiliğinden
tamamlanır; kolon eklemeleri sürüm notunda `ALTER TABLE` olarak belirtilir. Güncelleme öncesi
bir `mysqldump` alın.

## 9. İzleme ve Sorun Giderme

- **Loglar:** Linux `journalctl -u yalin -f` · Windows/NSSM `nssm set YalinUretim AppStdout <dosya>`.
- **MySQL logu:** Linux `/var/log/mysql/error.log` · Windows `C:\ProgramData\YalinMySQL\mysql-hata.log`.
- Uygulama açılışta DB'ye bağlanamazsa anlaşılır bir mesajla çıkar — `db-config.json` /
  `YALIN_DB_*` değerlerini ve MySQL servisini kontrol edin.
- Disk doluluğu izlenmeli (görsel arşivi + yedekler); yedek klasörü ayrı diskteyse uygulama
  diski dolduğunda yedekler etkilenmez.
- (Rapor Ö3) `/saglik` ucu eklendiğinde harici izleme araçlarına bağlanabilir.

## 10. Devreye Alma Kontrol Listesi

- [ ] MySQL servis olarak çalışıyor, yalnızca 127.0.0.1 dinliyor, root şifreli
- [ ] `yalin` DB kullanıcısı yalnızca `yalin_uretim` şemasına yetkili
- [ ] Uygulama servis olarak çalışıyor (yeniden başlatmada kendiliğinden kalkıyor)
- [ ] `YALIN_DATA_DIR` kod dizini dışında; klasör izinleri yalnız uygulama kullanıcısında
- [ ] Güvenlik duvarı: LAN'da yalnız 5000 (veya internette yalnız 80/443) açık
- [ ] İlk giriş yapıldı, **varsayılan `admin123` değiştirildi**
- [ ] Denetmen şifreleri tanımlandı (Yönetici Paneli → Denetmenler)
- [ ] Yedek klasörü farklı diske yönlendirildi; mysqldump cron'u kuruldu
- [ ] Geri dönüş tatbikatı bir kez yapıldı
- [ ] İnternet senaryosunda: `{"https":true,"proxy":true}` + reverse proxy + sertifika doğrulandı

## 11. Senaryo D — Render'da demo (tasarım önizleme)

Depodaki `Dockerfile` yalnızca **tasarımı çevrimiçi göstermek** içindir: uygulama, aynı kapta geçici bir
**MariaDB** ve **örnek veri** (6 bölüm, 3 denetim turu, ~22 öneri, 5 kaizen, kontrol formu kayıtları) ile açılır.
Harici veritabanı gerekmez. Veriler kalıcı değildir — kap her yeniden başladığında (deploy, uyku sonrası) demo
sıfırdan kurulur. Sayfanın üstünde demo şeridi ve giriş şifreleri görünür.

**Render'da kurulum:** New → **Web Service** → `huseyinnarli/yalin_uretim_js` → **Language: Docker** →
Instance: Free → Create. (Var olan "Node" servisi Docker'a çevrilemez; yeni servis açıp eskisini silin.)
Ortam değişkeni girmeye gerek yoktur; `PORT`'u Render verir.

**Demo girişleri:** ana yönetici `admin123` · ek yönetici `zeynep1234` · denetmen `ali1234` (Abkant Pres lideri),
`mehmet1234`, `ayse1234`, `murat1234`.

**Bellek:** MariaDB düşük bellek ayarlarıyla açılır (`scripts/demo-baslat.sh`); uygulama + veritabanı ≈ 210 MB.

**Yerelde deneme (Docker olmadan):** MariaDB kurulu bir Linux'ta `YALIN_DEMO=1 PORT=5030 sh scripts/demo-baslat.sh`.
`scripts/demo-veri.js` yalnızca BOŞ veritabanına yazar; içinde bölüm kaydı olan bir veritabanına dokunmaz.

> Canlı (fabrika) kurulumda `Dockerfile` ve `demo-*` betikleri kullanılmaz.
