# Canlı Veritabanıyla Geçiş Raporu (eski düzen → Ekim 2026 sürümü)

**Soru:** lean.oztasglobal.net'te eski sürümün (`1d67cea`) kullandığı, isimlerin tek kutudan yazıldığı bir veritabanı
var. Yeni sürümü bu veritabanını bozmadan nasıl devreye alırım?

**Kısa cevap:** Mevcut veritabanı **olduğu gibi** kullanılır. Dışa aktarma, dönüştürme veya elle SQL gerekmez.
Yeni sürüm ilk açılışta yalnızca **3 boş tablo ve 24 boş kolon ekler**; var olan hiçbir satır, kolon ya da isim
değişmez, silinmez, yeniden adlandırılmaz. İsimler veritabanında yine tek alanda durur; ad/soyad ayrımı yalnız
formdadır. Geri dönmek gerekirse eski kodu çalıştırmak yeterlidir. Bunların hepsi, eski sürümle üretilmiş bir
veritabanı üzerinde denendi (§6).

---

## 1. Uygulama açılırken veritabanında ne olur?

Sunucu her açılışta `src/db.js:init()` çalıştırır. Bu fonksiyon iki şey yapar, ikisi de yalnızca **ekleme**dir:

1. **Eksik tabloları oluşturur** (`CREATE TABLE IF NOT EXISTS` — tablo varsa dokunmaz).
2. **Eksik kolonları ekler** (`EK_KOLONLAR` listesi — kolon varsa dokunmaz).

| Tablo | Eklenen | Eski satırlarda değeri |
|---|---|---|
| `oneriler` | `red_nedeni`, `revize_notu`, `revize_atanan_id`, `revize_atanan_ad`, `revize_isteyen`, `revize_zamani`, `revize_tamamlandi`, `gorev_atanan_id`, `gorev_atanan_ad`, `gorev_termin`, `gorev_notu`, `gorev_atayan`, `gorev_zamani`, `kaizen_no` | boş (NULL) |
| `kaizenler` | `red_nedeni`, 6 adet `revize_*` kolonu, `kaynak_oneri_no` | boş (NULL) |
| `denetimler` | `revize_eden`, `revize_zamani` | boş (NULL) |
| yeni tablo | `isim_eslestirme` — elle isim birleştirmeleri | boş |
| yeni tablo | `kontrol_kayitlari`, `kontrol_onaylari` — periyodik kontrol formu | boş |

- Canlıda zaten bulunan `form_no` ve `bulgular` kolonları için hiçbir şey yapılmaz.
- MySQL 8.0 ve MariaDB 10.3+ sona kolon eklemeyi tabloyu yeniden yazmadan, anında yapar. Tablolar küçük olduğu için
  ilk açılış birkaç saniyeden kısa sürer.
- Açılışta ayrıca: düz metin kalmış şifre varsa hash'lenir (eski sürüm de bunu yapıyordu; normalde yoktur), oturum
  anahtarı veritabanındaki mevcut anahtardır — **kullanıcıların oturumu düşmez**.
- Yüklenen görseller (`data/` klasörü) ve dosya adları değişmez.

---

## 2. Ad ve soyadın tek kutudan yazıldığı eski veri

### 2.1 Saklama biçimi değişmedi
Yeni sürümde ad ve soyad formda **ayrı kutulardan** alınır, ama veritabanına eskisi gibi **tek alana tam ad**
olarak yazılır ("Ahmet" + "Yılmaz" → `sahibi = "Ahmet Yılmaz"`). Yani eski ve yeni kayıtlar aynı biçimdedir;
**veri dönüştürmeye gerek yoktur.**

### 2.2 Eski isimler nasıl görünür?
- **Listede ve detayda** isim kayıtta nasıl yazıldıysa öyle görünür ("ahmet yılmaz" küçük harfle kalır).
- **Bir kayıt düzenlenmek üzere açıldığında** tek alandaki isim ikiye bölünür: **son kelime soyad**, öncekiler ad
  ("Mehmet Ali Kaya" → Ad: *Mehmet Ali*, Soyad: *Kaya*). Büyük/küçük harf ve fazla boşluk düzeltilir.
  Kaydedilince düzeltilmiş isim **yalnız o kayda** yazılır. Kimse düzenlemedikçe hiçbir eski isim değişmez.
- Tek kelimelik isimler ("Hasan") ad kutusuna gelir, soyad boş kalır; düzenleyen kişi tamamlayabilir.

### 2.3 Puan listesinde aynı kişinin farklı yazılışları
Eski sürüm isimleri harfi harfine karşılaştırıyordu: "Ayşe Çelik" ile "ayşe çelik" **iki ayrı kişi** sayılıyor,
puanları bölünüyordu. Yeni sürüm karşılaştırmayı bir **anahtar** üzerinden yapar: küçük harf, tek boşluk,
ç/ğ/ı/ö/ş/ü/â/î/û sadeleştirilmiş, noktalama atılmış. Böylece:

| Kayıtlardaki yazılışlar | Yeni sürümde |
|---|---|
| "Ayşe Çelik" · "ayşe çelik" · "AYŞE ÇELİK" · "ayse celik" | **Tek kişi: Ayşe Çelik** — puanları toplanır |
| "Ahmet Yılmaz" · "ahmet yılmaz" · "AHMET YILMAZ" · "Ahmet  Yilmaz " | **Tek kişi: Ahmet Yılmaz** |
| "ŞÜKRÜ ÖZTÜRK" · "Sukru Ozturk" | **Tek kişi: Şükrü Öztürk** |
| "Ahmet Yılmz" (yazım hatası) | Ayrı kalır; **İsim Birleştirme** sayfasında "benzer" diye önerilir, siz karar verirsiniz |
| "Hasan" ile "Hasan Demir" | Ayrı kalır (otomatik birleşmez); aynı kişiyse elle birleştirilir |

- Birleşen grubun görünen adı: Türkçe karakterli ve düzgün yazılmış hâli seçilir ("Şükrü Öztürk").
- Bölüm sorumlusu alanındaki "Ali Yılmaz / Hasan Demir" iki ayrı ekip lideri olarak okunur (ayraç: `/` `,` `;`).
- Denetmen hesabı ile bölüm lideri de anahtarla eşleşir: hesap adı "ayşe çelik", lider "Ayşe Çelik" ise aynı kişidir.
- 5S ödül defterindeki (`odul_kayitlari.kisiler`) isimler de aynı kurala tabidir.
- **Kayıtlardaki isimler hiçbir zaman yeniden yazılmaz.** Elle birleştirmeler ayrı tabloda (`isim_eslestirme`)
  tutulur ve İsim Birleştirme sayfasından **geri ayrılabilir**.

> **Dikkat — ödül eşiği:** Bölünmüş puanlar birleştiği için bazı kişilerin toplamı artar. Denemede "Ayşe Çelik"
> dört yazılışla 75 + 45 + 15 + 8,8 puana bölünmüştü; yeni sürümde tek satırda **143,8** puan. Toplam puan hiç
> değişmez (denemede 1.195 = 1.195), yalnızca doğru kişide toplanır. Bu yüzden canlıya aldıktan sonra **ödül eşiğini
> (300 puan) geçen yeni kişiler** görülebilir — bu doğru sonuçtur, ama ödül dağıtımından önce listeye bir göz atın.

> **Bilinen sınır:** Aynı adı ve soyadı taşıyan iki farklı çalışan eski sürümde de ayırt edilemiyordu, yenisinde de
> edilemez. Kalıcı çözüm, kişi girişine sicil numarası eklemektir (IYILESTIRME_ANALIZI.md, Ö11).

---

## 3. Diğer eski veriler

| Eski veri | Yeni sürümde ne olur? |
|---|---|
| **Reddedilen** öneri/kaizenler | Ana listeden çıkar, **Reddedilen & Silinen** (`/arsiv`) sayfasında görünür. Eski kayıtlarda red gerekçesi yoktur, "—" görünür. |
| **Silinen** kayıtlar (`silinen_kayitlar`) | Aynı arşiv sayfasında; geri yükleme çalışır (yeni sürüm yalnız tablonun gerçek kolonlarını yazar). |
| **Form numaraları** (`form_no`) | Veritabanında aynen kalır; listede, detayda ve Excel'de gösterilmez, yeni numara verilmez. |
| **Ek yönetici yetkileri** | Eski anahtarlar okunurken açılır, kayıt değişmez: `degerlendirme` → Değerlendirme + Puanlama · `bes_s` → tüm 5S yetkileri + Denetmen hesapları · `odul`, `kayit` → aynı. Bir yönetici Yönetim'de kaydedilince yeni anahtarlarla yazılır. |
| **Denetmen hesapları** | Aynı şifrelerle girer. Bölüm lideri olan denetmen, kendi bölümünün periyodik kontrol formunu doldurabilir. |
| **Ana yönetici şifresi** | Aynı. Varsayılan şifre (admin123) hâlâ kullanılıyorsa ön kontrol aracı uyarır — mutlaka değiştirin. |
| **5S denetimleri, aksiyonlar, ödül defteri** | Aynı. Puan listesi toplamı aynı. |
| **Görseller** (`data/kaizen_gorseller`, 5S fotoğrafları) | Aynı klasör, aynı adlar. |
| **İşlem günlüğü** | Eski satırlar aynı, yeni işlemler eklenir. |
| **Oturumlar** | Aynı imza anahtarı; açık oturumlar geçerli kalır. |

---

## 4. Adım adım canlıya alma

Komutlar Linux (systemd) ve Windows (NSSM servisi) için verilmiştir; yolları kendi kurulumunuza göre değiştirin.

### Adım 0 — Ön koşul
- Sunucuda `node -v` → **v20 veya üstü** olmalı (sharp 0.35 ve multer 2 için).
- Uygulama klasöründeki `data/` klasörünün yeri bilinmeli (bağlantı ayarı `data/db-config.json` buradadır).

### Adım 1 — Yedek (zorunlu)
```bash
# Linux
mysqldump -u yalin -p --single-transaction --routines yalin_uretim > yedek_oncesi_$(date +%F).sql
cp -a /var/lib/yalin/data /var/lib/yalin/data_yedek_$(date +%F)
```
```powershell
# Windows (PowerShell) — mysqldump.exe MySQL kurulumunun bin klasöründedir
mysqldump.exe -u yalin -p --single-transaction --routines yalin_uretim --result-file=yedek_oncesi.sql
Copy-Item C:\Uygulamalar\yalin\data C:\Uygulamalar\yalin_data_yedek -Recurse
```

### Adım 2 — Salt-okunur ön kontrol (canlıya dokunmaz)
Yeni kodu canlının **yanına, ayrı bir klasöre** indirin (servisi durdurmadan) ve ön kontrolü canlı veritabanına karşı
çalıştırın. Araç bağlantıyı "READ ONLY" işlemde açar; veritabanına bir şey yazmaya çalışsa bile sunucu reddeder.
```bash
git clone https://github.com/huseyinnarli/yalin_uretim_js.git /tmp/yalin_yeni && cd /tmp/yalin_yeni && npm ci
YALIN_DATA_DIR=/var/lib/yalin/data npm run -s gecis-kontrol > on_kontrol.md
```
```powershell
git clone https://github.com/huseyinnarli/yalin_uretim_js.git C:\Gecici\yalin_yeni; cd C:\Gecici\yalin_yeni; npm ci
$env:YALIN_DATA_DIR = "C:\Uygulamalar\yalin\data"; npm run -s gecis-kontrol | Out-File -Encoding utf8 on_kontrol.md
```
Rapor şunları gösterir: oluşturulacak tablolar, eklenecek kolonlar, **otomatik eklenemeyecek eksik kolon (olmamalı)**,
kayıt sayıları, durumlara göre öneri/kaizen, otomatik birleşecek isimler, yazım hatası adayları, tek/çok kelimeli
isimler, ek yöneticilerin eski → yeni yetkileri, denetmen hesabı olmayan bölüm liderleri, varsayılan şifre uyarısı.
Çıkış kodu `2` ise "Sonuç" bölümündeki maddeler canlıya almadan önce çözülmelidir.

### Adım 3 — Kopya veritabanında prova (önerilir)
```bash
mysql -u root -p -e "CREATE DATABASE yalin_test CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci; GRANT ALL ON yalin_test.* TO 'yalin'@'localhost';"
mysql -u yalin -p yalin_test < yedek_oncesi_*.sql
cp -a /var/lib/yalin/data /tmp/yalin_test_data
cd /tmp/yalin_yeni && YALIN_DATA_DIR=/tmp/yalin_test_data YALIN_DB_DATABASE=yalin_test PORT=5099 node server.js
```
Tarayıcıda `http://sunucu:5099` → eski şifrelerle girin; Liste, Arşiv, Puan Durumu, İsim Birleştirme, 5S ve kontrol
formunu gezin. Ardından aynı kopyaya ön kontrolü tekrar çalıştırın: "eklenecek tablo/kolon: 0" görmelisiniz.
Bitince `yalin_test` silinebilir.

### Adım 4 — Güncelleme
```bash
# Linux
cd /home/yalinapp/app && sudo -u yalinapp git pull && sudo -u yalinapp npm ci && sudo systemctl restart yalin
journalctl -u yalin -n 20      # "Yalın Üretim Uygulamaları çalışıyor" satırını görün
```
```powershell
# Windows — kod elle kopyalanıyorsa data\ klasörünün ÜZERİNE YAZMAYIN
nssm stop YalinUretim
cd C:\Uygulamalar\yalin; git pull; npm ci
nssm start YalinUretim
```

### Adım 5 — Açılış sonrası kontrol
- Ön kontrolü canlıya bir daha çalıştırın: oluşturulacak tablo ve eklenecek kolon **0** olmalı.
- Eski şifrelerle giriş, Liste, Puan Durumu, 5S sayfaları açılıyor mu bakın.

### Adım 6 — Canlı sonrası yapılacaklar
1. Ana yönetici şifresi varsayılansa **hemen değiştirin** (Yönetim › Şifre Değiştir).
2. Yönetim › Yöneticiler: ek yöneticilerin yetkilerini gözden geçirip **bir kez kaydedin**.
3. Yönetim › Denetmenler: görev/düzeltme atanacak kişilere ve hesabı olmayan bölüm liderlerine **denetmen hesabı** açın.
4. 🔗 İsim Birleştirme: önerilen benzer yazılışları inceleyin; aynı kişiyse birleştirin.
5. Puan Durumu: birleşen isimler nedeniyle ödül eşiğini yeni geçen kişileri kontrol edin (§2.3).
6. Kullanıcılara duyurun: öneri/kaizen **listesi artık giriş istiyor** (formlar herkese açık); Excel'de **Form No**
   sütunu yok — Excel'i şablona yapıştıran varsa sütun kayması olur.

---

## 5. Geri dönüş planı

| Durum | Yapılacak | Veri kaybı |
|---|---|---|
| Yeni sürümde sorun çıktı, eskiye dönülecek | `git checkout 1d67cea` (veya eski klasör) → `npm ci` → servisi yeniden başlat | **Yok.** Eklenen tablo/kolonlar eski kodu bozmaz (denendi, §6). Yeni sürümde girilen red gerekçesi, görev, kontrol formu vb. veritabanında kalır, eski sürümde görünmez; tekrar yeni sürüme geçince yerindedir. |
| Veritabanı gerçekten bozuldu (beklenmez) | Adım 1'deki dump'ı geri yükleyin | Güncellemeden sonra girilen veriler |

---

## 6. Nasıl doğrulandı?

**Deney düzeni**
1. Canlıdaki sürüm (`1d67cea`) ayrı bir klasörde çalıştırıldı; kendi test paketi (54 kontrol) ve ek bir veri
   betiğiyle **eski düzende** veri üretildi: 29 öneri (isimler tek kutudan, 14 farklı yazılışla: büyük/küçük harf,
   çift boşluk, Türkçe karaktersiz, yazım hatası, tek kelime, üç kelime), 6 kaizen, iki liderli bölüm, ödül defteri,
   eski anahtarlı (`bes_s`, `degerlendirme`) ek yöneticiler, denetmenler, silinmiş kayıt, form numaraları.
2. Bu veritabanının dokunulmamış bir kopyası alındı.
3. **Ön kontrol** çalıştırıldı; öncesi ve sonrası bütün tabloların `CHECKSUM TABLE` değerleri **aynı** →
   araç gerçekten hiçbir şey yazmıyor.
4. Yeni sürüm bu veritabanıyla açıldı (otomatik ekleme) ve 46 kontrollük doğrulama çalıştırıldı.
5. Eski sürüm, genişletilmiş veritabanıyla tekrar açıldı (geri dönüş provası).

**Sonuç: 46/46**

| Kontrol | Sonuç |
|---|---|
| 16 eski tablonun her birinde eski kolonların tamamı, satır satır birebir aynı | ✔ |
| Yeni kolonlar eklendi, eski satırlarda boş | ✔ |
| 3 yeni tablo oluşturuldu | ✔ |
| Puan toplamları aynı (öneri 117,5 · kaizen 277,5 · 5S 800 · toplam 1.195) | ✔ |
| Her kişinin yeni puanı = eski yazılışlarının puanları toplamı (25 satır → 18 kişi) | ✔ |
| Eski ana yönetici, eski ek yönetici (`degerlendirme`+`odul`) ve eski denetmen şifreleriyle giriş | ✔ |
| Liste, Panel, Arşiv, Puan Durumu, İsim Birleştirme, 5S, Yönetim, Aksiyonlar, Görevlerim sayfaları | ✔ |
| Eski reddedilenler arşivde; listede form no görünmüyor | ✔ |
| Eski tek kutulu "Mehmet Ali Kaya" düzenleme formunda Ad: Mehmet Ali / Soyad: Kaya | ✔ |
| Öneri, kaizen ve puan Excel'leri iniyor | ✔ |
| Eski denetmen kendi bölümünün kontrol formunu doldurabiliyor | ✔ |
| **Geri dönüş:** eski sürüm genişletilmiş veritabanında giriş, öneri gönderme, listeler | ✔ |

Ön kontrolün deneme veritabanındaki çıktısından bir bölüm:
```
Oluşturulacak yeni tablo: 3 (kontrol_kayitlari, kontrol_onaylari, isim_eslestirme)
Eklenecek yeni kolon: 24 · Otomatik eklenemeyecek eksik kolon: 0
Otomatik birleşecekler:
- "Ayşe Çelik" · "ayse celik" · "AYŞE ÇELİK" · "ayşe çelik" — Öneri, Kaizen, 5S ödülü, Bölüm lideri, Denetmen
- "ŞÜKRÜ ÖZTÜRK" · "Sukru Ozturk" — Öneri
Benzer yazılışlar: "Ahmet Yılmaz" … ↔ "Ahmet Yılmz"
Ek yönetici: Kalite Müdürü — kayıtlı: degerlendirme, odul → Değerlendirme, Puanlama, Ödül verme & isim birleştirme
⚠ Ana yönetici şifresi hâlâ varsayılan (admin123)
```

---

## 7. Riskler ve önlemler

| Risk | Olasılık | Önlem |
|---|---|---|
| Kolon eklerken tablo kilidi / yavaşlama | Çok düşük | Sona kolon ekleme anlık; tablolar küçük. Mesai dışında yapılabilir. |
| İki farklı kişi yalnız büyük/küçük harf veya Türkçe karakter farkıyla yazılmış | Çok düşük | İsim Birleştirme sayfasından görülür. Aynı ad-soyadlı iki kişi için kalıcı çözüm sicil no. |
| Birleşme sonrası ödül eşiğini geçen yeni kişiler | Orta (doğru sonuç) | Ödül dağıtımından önce Puan Durumu kontrolü (§4 Adım 6). |
| Varsayılan yönetici şifresi | Bilinmiyor | Ön kontrol uyarır; kod herkese açık depoda olduğu için bu şifre bilinir — mutlaka değiştirin. |
| Excel'i sabit sütun düzeniyle kullanan şablonlar | Düşük | Öneri Excel'inde 2. sütun, kaizen Excel'inde "Kayıt Zamanı"ndan sonraki "Form No" sütunu kalktı; kaizen görsel sütunları (J/K) aynı. |
| Liste adresini yer imine almış girişsiz kullanıcılar | Kesin | Giriş sayfasına yönlenir; formlar açık. Duyuru yapın. |
| Sunucudaki Node sürümü eski | Düşük | `node -v` ≥ 20 (Adım 0). |

---

## 8. Sık sorulanlar

**Eski isimleri toplu olarak "Ad Soyad" biçimine çevirmem gerekir mi?** Hayır. Görüntüleme ve puan hesabı
düzensiz yazılışlarla da doğru çalışır. Toplu düzeltme yapılmaması özellikle tercih edildi: kayıtlar delil
niteliğindedir ve geri dönüş garantisi bozulmasın.

**Kopya veritabanında prova yaparken canlıya bir şey yazılır mı?** Hayır; prova `yalin_test` adlı ayrı veritabanına
ve ayrı bir `data` kopyasına bağlanır. Ön kontrol aracı ise hiçbir veritabanına yazmaz.

**Yeni sürüm açıkken eski sürüme dönersem yeni girilen kayıtlar ne olur?** Kayıtların kendisi (öneri, kaizen,
denetim) eski sürümde de görünür; yalnızca yeni alanlar (red gerekçesi, görev, kontrol formu) görünmez ama silinmez.

**Ön kontrol "eksik ve otomatik eklenmeyecek kolon" gösterirse?** Canlıya almayın; bu, şemaya eklenen bir kolonun
`src/db.js` içindeki `EK_KOLONLAR` listesine yazılmadığı anlamına gelir ve geliştirici düzeltmesi gerekir.
