# Geliştirme Raporu — Ekim 2026 Sürümü

**Kapsam:** Canlıda çalışan sürüm `1d67cea` (21.07.2026, "Silinen kayıtlar sayfası + onaylanınca form numarası")
ile bu sürüm arasındaki bütün değişiklikler. Ne eklendi, ne kaldırıldı, ne değişti, hangi araçlar kullanıldı.

| | Canlı sürüm (`1d67cea`) | Bu sürüm |
|---|---|---|
| Rota (HTTP ucu) | 72 | 87 (+15, hiçbiri kaldırılmadı) |
| Tablo | 16 | 19 (+3, hepsi yeni; mevcutlara yalnız kolon eklendi) |
| Uçtan uca test | 54 kontrol | 136 kontrol |
| Eski veritabanıyla geçiş doğrulaması | — | 46 kontrol (bkz. [VERITABANI_GECIS.md](VERITABANI_GECIS.md)) |
| Çalışma zamanı bağımlılığı | 8 paket | 8 paket (yeni paket yok; 4'ü güvenlik için güncellendi) |

İlgili dokümanlar: kullanıcıya görünen değişiklik özeti [DEGISIKLIKLER.md](DEGISIKLIKLER.md) · canlıya alma ve eski
veritabanı [VERITABANI_GECIS.md](VERITABANI_GECIS.md) · güvenlik/mimari değerlendirmesi ve öneriler
[IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md) · iç işleyiş [TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md).

---

## 1. İstenenler ve karşılıkları

| # | İstek | Yapılan |
|---|---|---|
| 1 | Red edilince gerekçe; onaylanan öneriyi kimin uygulayıp kaizene dönüştüreceği | Gerekçesiz red reddedilir. Onaylanan öneriye denetmen + termin + not ile **görev** atanır; atanan kişi "Kaizene Dönüştür" ile öneriden dolu kaizen formunu açar, kayıt öneriye bağlanır. |
| 2 | Ek yöneticiler, ayrıntılı yetki; silinebilir hesaplar, ana yönetici sabit | 10 ayrıntılı yetki alanı (4 grup). Ek yönetici silinebilir; ana yönetici sabit. *İlk sürümde "tam yetki" seçeneği vardı, isteğinizle kaldırıldı:* yönetici hesapları ve işlem günlüğü yalnız ana yöneticide. |
| 3 | Öneri/kaizen herkese kapalı; "5S Denetmen" → "Denetmen"; düzeltmeyi seçilen denetmen yapsın | Liste ve detay girişe kapalı (formlar açık). Rol adı "Denetmen". Düzeltme istenirken denetmen seçilir; yalnız o kişi (ve kayıt yetkili yönetici) düzenleyebilir. |
| 4 | 5S sonuçları, aksiyonlar ve checklist herkese açık | 5S sonuçları, aksiyonlar, bölüm sayfaları ve periyodik kontrol formu girişsiz görüntülenir. |
| 5 | Reddedilen + silinen ayrı listede, denetmen yalnız görsün | `/arsiv` "Reddedilen & Silinen" sayfası; denetmen görüntüler, geri yükleme/kalıcı silme kayıt yetkisi ister. |
| 6 | Ad ve soyad ayrı kutulardan | Tüm kişi girişlerinde ayrı kutu + otomatik düzeltme; aynı kişinin farklı yazılışları puanda birleşir; elle birleştirme sayfası. |
| 7 | Liste 20'şerli; onay/red detayda; puanlamadan sonra kayda ve listeye dönüş | Sayfalama + durum filtresi; detayda Onayla / Reddet / Düzeltme İste kartları; puanlamadan sonra detaya, oradan kaldığınız liste sayfasına dönüş. |
| 8 | Her değişiklik dokümanlara | README, teknik doküman, sürüm notu, dağıtım, kılavuz, CLAUDE.md ve bu raporlar. |
| 9 | Denetmen ve yöneticiler için panel | `/panel`: dönem butonlu tek tablo, altta sabit tüm zamanlar toplamı, son 12 ay "gelen / puan alan" grafiği. |
| 10 | Bölüm sayfasında 5S trendi (S1–S5), açık aksiyon, personel; bölümler liste | Bölüm sayfası özet kutuları + trend grafiği + her denetimin S1–S5 kırılımı; 5S › Bölümler tablo görünümü. |
| 11 | Şirketin 5S periyodik kontrol formu; her denetmen kendi bölümünü doldursun | Günlük/haftalık/aylık 15 madde, bölümün ekip lideri doldurur, haftalık/aylık kontrol imzası, aylık tablo, Excel. |
| 12 | Kontrol formunda takvim; maddelerden aksiyon kaldırılsın; Excel aylık, o aya kadar | Türkçe takvimle gün seçimi; aksiyon açma kaldırıldı; Excel seçilen aya kadar tüm aylar (her ay ayrı sayfa + özet). |
| 13 | Tam yetki olmasın; form numarası kalksın; kontrol formundaki form kodu kalksın | Tam yetki kaldırıldı; öneri/kaizen form no artık verilmiyor/gösterilmiyor (eski numaralar veritabanında duruyor); kontrol formundaki "T-FR016 / REV00" sayfadan, Excel'den ve dosya adından kaldırıldı. |
| 14 | Kod incelemesi, anlaşılır mimari, clean code | Çekirdek iş mantığı 12 alan modülüne bölündü, ölü kod temizlendi, ortak yardımcılar tek yere alındı, inceleme bulguları düzeltildi (§5, §8). |

---

## 2. Eklenen özellikler (kullanıcıya görünen)

### 2.1 Öneri ve Kaizen
- **Erişim:** Liste (`/liste`) ve detay (`/detay`) yalnız girişli kullanıcıya (denetmen + yöneticiler). Öneri/kaizen
  **formları herkese açık**; girişsiz gönderen ana sayfaya teşekkür mesajıyla döner.
- **Liste:** 20'şerli sayfa (`S.SAYFA_BOYUTU`), durum filtresi (Değerlendiriliyor / Düzeltme İsteniyor / Onaylandı),
  tür / dönem / arama filtreleri. Reddedilenler ana listede yer almaz.
- **Değerlendirme kartları (detayda):** ✓ Onayla (öneride isteğe bağlı görev ataması ile) · ✕ Reddet (**gerekçe
  zorunlu**, onaylı kayıt reddedilemez) · ✏ Düzeltme İste (**denetmen seçimi + not zorunlu**). Listede hızlı "✓ Onay" kalır.
- **Düzeltme akışı:** Atanan denetmen kaydı düzenler, kaydedince kayıt kendiliğinden "Değerlendiriliyor"a döner
  (`revize_tamamlandi`). Atanmamış denetmen düzenleyemez.
- **Görev + kaizene dönüştürme:** Onaylanan öneriye görev (denetmen, termin, not). Atanan kişi
  `/kaizen/yeni?oneri=NO` ile öneriden doldurulmuş kaizen formunu açar; kayıt tek transaction'da yazılır ve öneri ↔
  kaizen bağlanır (`oneriler.kaizen_no` ↔ `kaizenler.kaynak_oneri_no`).
- **Dönüş yolları:** Puanlamadan sonra kaydın detayına, "← Listeye Dön" ile kaldığınız sayfa + filtreye dönülür
  (dönüş adresleri `guvenliYol` ile doğrulanır).
- **Reddedilen & Silinen arşivi** (`/arsiv`): reddedilenler ve silinenler tek sayfada; denetmen görüntüler; geri
  yükleme ve kalıcı silme `kayit` yetkisi ister. Eski `/silinenler` adresi buraya yönlenir.

### 2.2 İsimler
- Tüm kişi girişlerinde (öneri sahibi, kaizen lideri/üyeleri, bölüm lideri/üyeleri, denetmen, misafir, yönetici)
  **ad ve soyad ayrı kutu**; "aHMET" "YILMAZ" → "Ahmet Yılmaz" (`isim.js:adDuzelt`, Türkçe büyük/küçük harf kuralıyla).
- Puan listesinde aynı kişinin farklı yazılışları **otomatik tek kişi** (anahtar: küçük harf, tek boşluk,
  ç/ğ/ı/ö/ş/ü/â/î/û sadeleştirilmiş, noktalama atılmış — `isimAnahtar`).
- **İsim Birleştirme** (`/isimler`, ödül yetkisi): tüm kaynaklardaki isim grupları, yazım hatası adayları (harf
  yer değiştirmesini de sayan OSA uzaklığı), elle birleştirme ve geri ayırma (`isim_eslestirme` tablosu).
- **Kayıtlardaki isimler hiçbir zaman değiştirilmez** — birleştirme yalnızca hesaplamadadır.

### 2.3 Roller, yetkiler, Görevlerim
- "5S Denetmen" → **Denetmen**. Denetmen hesabı bölüm lideri olmayan kişiye de açılabilir.
- **Ek yönetici yetkileri** 4 geniş alandan 10 ayrıntılı alana: Değerlendirme · Puanlama · Kayıt düzenle-sil &
  raporlar · Bölüm & denetim planı · Denetim yapma · Denetim revize & silme · Aksiyon yönetimi · 5S ödül & raporlar ·
  Ödül verme & isim birleştirme · Denetmen hesapları. Eski kayıtlı anahtarlar (`degerlendirme`, `bes_s`) okunurken
  yeni alanlara açılır — veritabanı elle güncellenmez.
- **Tam yetki yok:** ek yönetici ekleme/düzenleme/silme ve işlem günlüğü yalnız ana yöneticide.
- **Görevlerim** (`/gorevlerim`): atanan düzeltmeler, kaizene dönüştürme görevleri, planlanan 5S denetimleri,
  kapatılacak aksiyonlar, bugünkü kontrol formu. Üst menüde bekleyen iş rozeti. Değerlendirme yetkili yönetici tüm
  açık atamaları izler.
- Denetmen şifresi Yönetim'den değiştirilebilir (`/yonetici/denetmen/sifre`).

### 2.4 Panel
- `/panel` (girişli herkes): Bu Ay / Son 6 Ay / Bu Yıl / Tüm Zamanlar butonlu tek tablo (öneri, kaizen, toplam ×
  gelen, değerlendiriliyor, düzeltme, onaylandı, puan alan, reddedildi), altta sabit tüm zamanlar toplamı,
  **son 12 ay gelen vs. puan alan** çizgi grafiği, bölümlerin 5S trendi. Hesap işlemleri ayrı **Yönetim** sayfasında.

### 2.5 5S
- **Bölümler sekmesi** kart yerine tablo: ekip lideri, personel, son skor/tarih, açık aksiyon, bu ayki kontrol formu doluluğu.
- **Bölüm sayfası:** personel / açık aksiyon / son skor / tamamlanan denetim kutuları, skor trend grafiği, her
  denetimin S1–S5 kırılımı (renkli: %80+ yeşil, %60 altı kırmızı).
- **Denetim revize** (`bes_revize`): yapılmış denetimin bulguları, açıklamaları, fotoğrafları düzeltilir, yeni
  aksiyon eklenebilir; **ödülleri işlenmiş turda kapalıdır** (dağıtılmış puan değişmesin). Bulgu sayısı kaydı
  olmayan eski denetimlerde form, puandan geri tahminle ön-doldurulur (`bessBulguTahmin`).
- 5S sonuçları, aksiyonlar ve kontrol formları herkese açık.

### 2.6 Periyodik Kontrol Formu (şirketin kâğıt 5S ve Güvenlik Kontrol Formu)
- 15 madde: 10 günlük, 3 haftalık, 2 aylık — kâğıt formdaki metinlerle birebir (`src/kontrol.js`).
- **Doldurma:** bölümün ekip lideri (denetmen girişiyle) veya "denetim yapma" yetkili yönetici. Gün **Türkçe
  takvimden** seçilir (ileri gün kapalı, seçilince o günün formu açılır). Uygun / Uygun Değil; uygun değilde
  açıklama zorunlu. Boş bırakılan madde kaydedilmez.
- **İmza:** haftalık (grup lideri) ve aylık (bölüm sorumlusu) "Kontrol Ettim" — denetim yetkili yönetici veya
  bölümün kendi lideri olmayan denetmen.
- **Aylık tablo** kâğıt formdaki gibi gün gün ✓/✗, uygunsuzluk listesi, form notu.
- **Excel:** ay seçilir; o aya kadar kaydı olan bütün aylar tek dosyada — başta ÖZET (ay başına kontrol günü, tam
  gün, uygun/uygun değil, uygunluk %, imzalı hafta, aylık imza + tüm ayların uygunsuzluk listesi), sonra her ay kâğıt
  düzeninde ayrı sayfa. Dosya adı `5S_Kontrol_Formu_<Bölüm>_<ilk ay>_<son ay>.xlsx`.
- Form kodu/revizyon numarası gösterilmez; formdan aksiyon açılmaz.

### 2.7 Demo (yalnız tasarım önizleme)
- `Dockerfile` + `scripts/demo-baslat.sh` + `scripts/demo-veri.js`: Render'da kendi içinde geçici MariaDB ve örnek
  veriyle çalışan kopya. Üstte demo şeridi (`YALIN_DEMO=1`). Canlı kurulumla ilgisi yoktur.

---

## 3. Kaldırılan veya davranışı değişen özellikler

| Özellik | Önce | Şimdi | Veri |
|---|---|---|---|
| Öneri/kaizen listesi ve detayı | Herkese açık | Girişe kapalı (formlar açık) | — |
| Silinenler sayfası | `/silinenler` | `/arsiv` (reddedilenlerle birlikte); eski adres yönlenir | Değişmez |
| Form numarası (`FR-YYYY-NNNN`) | İlk onayda verilir, listede/detayda/Excel'de görünür | Verilmez, görünmez | `form_no` kolonu ve eski değerler **yerinde** |
| Ek yönetici "tam yetki" | (bu sürümün ara hâlinde vardı) | Yok | Eski `["tam"]` kaydı 10 alana açılır |
| Kontrol formundan aksiyon açma | (ara hâlde vardı) | Yok | — |
| Kontrol formu kodu "T-FR016 REV00" | (ara hâlde vardı) | Yok | — |
| "5S Denetmen" adı | 5S Denetmen | Denetmen | — |
| 5S Bölümler | Kart | Tablo | — |
| İsim girişi | Tek kutu | Ad + Soyad | Eski kayıtlar değişmez |
| Ek yönetici yetkileri | 4 alan | 10 alan | Eski anahtarlar okunurken açılır |

---

## 4. Kullanılan teknolojiler ve araçlar

**Yeni çalışma zamanı bağımlılığı eklenmedi.** Her şey mevcut yığınla yapıldı:

| Araç | Nerede / ne için |
|---|---|
| Node.js (22/24) + Express 4 | HTTP katmanı, rota modülleri |
| EJS | Sunucu tarafı sayfalar; yeni sayfalar: panel, arşiv, görevlerim, isim birleştirme, kontrol formu |
| MySQL 8 (`mysql2/promise`) | Tüm veri; yeni tablolar ve kolon eklemeleri. **MariaDB 10.11'de de test edildi** |
| exceljs | Kontrol formu Excel'i (çok sayfalı, kâğıt düzeni), öneri/kaizen Excel'ine yeni sütunlar |
| sharp | Denetim revizesinde eklenen fotoğrafların işlenmesi (EXIF/GPS temizliği, 1600 px) |
| multer | Revize rotasında fotoğraf yükleme |
| archiver | Mevcut ZIP indirmeleri (yardımcı `web.js`'e taşındı) |
| cookie-session, Node `crypto` | Oturum; CSRF belirteci artık sabit zamanlı karşılaştırılıyor (`timingSafeEqual`) |
| flatpickr (zaten `static/vendor` içinde) | Kontrol formunun Türkçe takvimi |
| Sunucu tarafı SVG | Panel ve bölüm grafikleri — dış grafik kütüphanesi/CDN yok; erişilebilirlik için tablo görünümü de var |
| Docker + MariaDB | Yalnız Render demo kabı |
| Playwright (geliştirme makinesinde) | Ekran görüntüsüyle görsel kontrol — depoya eklenmedi |

**Güvenlik güncellemeleri** (`npm audit fix`, kırıcı değişiklik yok): sharp 0.35.3 → 0.35.5 (yüksek: libheif),
brace-expansion (yüksek, dolaylı), express 4.22.2 → 4.22.3 (body-parser/qs DoS), mysql2 3.22.6 → 3.24.5 (sıkıştırma
bombası DoS). Ayrıca multer 1.4.5-lts.2 → 2.4.0 (1.x dalının bilinen çok parçalı form DoS düzeltmeleri; API aynı,
yükleme testleri geçti). Kalan tek uyarı exceljs → uuid (orta; uygulamanın kullanmadığı bir yol, ayrıntı
IYILESTIRME_ANALIZI.md).

---

## 5. Mimari değişiklikler

### 5.1 Katmanlar

```
sabitler · isim · yetkiler · kontrol · puanlama   (saf — IO yok, test edilebilir)
        ↓
db.js        bağlantı havuzu, şema + EK_KOLONLAR (tek kaynak), satır↔nesne, yedek
        ↓
servis/*     iş kuralları — 12 modül, 5 katman, döngüsel bağımlılık yok
        ↓
cekirdek.js  cephe: servisleri tek nesnede toplar (rotalar `C.xxx` ile kullanır)
        ↓
web.js       HTTP yardımcıları: sar, flash+günlük, CSRF, yetki middleware'leri, dosya yanıtları
        ↓
rotalar/*    genel · oneri · kaizen · bes_s · kontrol · admin
        ↓
server.js    kurulum
```

### 5.2 Çekirdeğin bölünmesi
Önceki `src/cekirdek.js` 1.218 satırlık tek dosyaydı. Fonksiyonlar **değiştirilmeden** alan modüllerine taşındı:
dışa açık 98 fonksiyonun gövdesi eski hâliyle karakteri karakterine karşılaştırıldı, hepsi aynı. `cekirdek.js` artık
35 satırlık bir cephedir ve aynı adı iki modülün tanımlamasına izin vermez (açılışta hata verir).

| Katman | Modül | Satır | Sorumluluk |
|---|---|---|---|
| 0 | `servis/guvenlik.js` | 73 | Şifre hash/doğrulama (werkzeug uyumlu), ana yönetici şifresi, oturum anahtarı |
| 0 | `servis/yardimci.js` | 132 | Numara/kimlik üretimi (atomik sayaç), tarih/puan biçimi, güvenli dosya yolu, görsel işleme, logo |
| 0 | `servis/gunluk.js` | 24 | İşlem günlüğü |
| 1 | `servis/kayitlar.js` | 102 | Öneri/kaizen okuma-yazma, liste filtresi + sayfalama, düzenleme/dönüştürme izni |
| 1 | `servis/bes.js` | 300 | 5S bölüm, denetim, tur, ödül defteri, trend, denetim fotoğrafları |
| 2 | `servis/hesaplar.js` | 108 | Denetmen/misafir/ek yönetici, şifreyle kimlik, oturum yetkileri, şifre çakışması |
| 2 | `servis/kontrolFormu.js` | 113 | Periyodik kontrol formu: işaret, imza, aylık özet, bugünkü formlar |
| 3 | `servis/isimler.js` | 134 | İsim birleştirme (otomatik + elle) |
| 3 | `servis/aksiyon.js` | 119 | 5S aksiyonları: kapatma izni, gruplu liste, denetimden senkron, fotoğraf |
| 4 | `servis/puan.js` | 72 | Kişi puan durumu |
| 4 | `servis/gorevler.js` | 66 | Düzeltme/görev atamaları, Görevlerim, menü rozeti |
| 4 | `servis/panel.js` | 66 | Panel istatistikleri + 12 ay trendi |

Bir modül yalnızca kendinden **alttaki** katmanlara dayanır; bu kural bölme sırasında otomatik denetlendi.

### 5.3 Diğer yapısal düzenlemeler
- **Rota modülü:** Kontrol formu rotaları `bes_s.js`'ten `rotalar/kontrol.js`'e ayrıldı (5S rota dosyası 823 → 688 satır).
- **Dosya yanıtları:** `xlsxGonder` bir rota dosyasından (genel.js), `zipGonder` bes_s.js'ten `web.js`'e taşındı —
  rota modülleri artık birbirini `require` etmiyor.
- **Şema tek kaynak:** `db.js` içinde dağınık `ALTER TABLE` blokları yerine bildirimsel `EK_KOLONLAR` listesi;
  `init()` ve geçiş ön kontrol aracı aynı listeyi kullanır.
- **Ölü kod temizliği:** hiç çağrılmayan `odulKayitlari`, `nextFormNo`, `tamYetkiRequired`, kullanılmayan içe
  aktarmalar (`fs`, `path`, `K`, `girisRequired`) silindi; yalnız kendi modülünde kullanılan yardımcılar dışa açılmaktan
  çıkarıldı (`hashMi`, `getAdminPassword`, `aktifYonetici`, `puanVar`, `besSTurKazananlar`, `isimEslestirmeleri`, `kokAnahtar`, `sayDurum`).
- **Şablon güvenliği:** Detay sayfasında elle kaçışlanan HTML dizgisi yerine EJS'in otomatik kaçışını kullanan
  `partials/denetmen_secenekleri.ejs`.
- **Saf modüller:** `isim.js` (isim kuralları), `yetkiler.js` (yetki tanımları), `kontrol.js` (form + takvim) —
  IO'suz, Express'ten ve veritabanından bağımsız.

---

## 6. Veritabanı değişiklikleri (yalnızca ekleme)

| Tablo | Eklenen | Amaç |
|---|---|---|
| `oneriler`, `kaizenler` | `red_nedeni`, `revize_notu`, `revize_atanan_id`, `revize_atanan_ad`, `revize_isteyen`, `revize_zamani`, `revize_tamamlandi` | Red gerekçesi, düzeltme ataması |
| `oneriler` | `gorev_atanan_id`, `gorev_atanan_ad`, `gorev_termin`, `gorev_notu`, `gorev_atayan`, `gorev_zamani`, `kaizen_no` | Uygulama görevi, dönüştürülen kaizen |
| `kaizenler` | `kaynak_oneri_no` | Kaizenin doğduğu öneri |
| `oneriler`, `kaizenler` | `onay_zamani` | İlk onay zamanı — kayda hangi puan kuralının uygulanacağı (9 Ekim) |
| `denetimler` | `revize_eden`, `revize_zamani` | Denetim revizesi izi |
| yeni | `isim_eslestirme` | Elle isim birleştirme |
| yeni | `kontrol_kayitlari`, `kontrol_onaylari` | Periyodik kontrol formu işaretleri ve imzaları |

Silinen, yeniden adlandırılan veya tipi değişen kolon **yoktur**. `form_no` kolonu kullanılmasa da korunur.
Ayrıntı ve canlıya alma adımları: [VERITABANI_GECIS.md](VERITABANI_GECIS.md).

---

## 7. Dosya envanteri

**Eklenen**

| Dosya | Amaç |
|---|---|
| `src/isim.js` | Ad/soyad düzeltme, bölme, karşılaştırma anahtarı, benzerlik |
| `src/yetkiler.js` | Yetki alanları, eski anahtarların açılması |
| `src/kontrol.js` | Kontrol formu maddeleri + ay/hafta takvim yardımcıları |
| `src/servis/*.js` (12) | İş kuralları (§5.2) |
| `src/rotalar/kontrol.js` | Kontrol formu rotaları |
| `views/panel.ejs`, `arsiv.ejs`, `gorevlerim.ejs`, `isimler.ejs`, `5s_kontrol.ejs` | Yeni sayfalar |
| `views/partials/denetmen_secenekleri.ejs` | Denetmen seçim listesi |
| `scripts/gecis-kontrol.js` | Canlıya almadan önce salt-okunur veritabanı ön kontrolü (`npm run gecis-kontrol`) |
| `scripts/demo-veri.js`, `scripts/demo-baslat.sh`, `Dockerfile`, `.dockerignore` | Render demo |
| `DEGISIKLIKLER.md`, `GELISTIRME_RAPORU.md`, `VERITABANI_GECIS.md` | Sürüm notu ve raporlar |

**Değişen:** `server.js`, `src/cekirdek.js` (cepheye dönüştü), `src/db.js`, `src/web.js`, `src/excel.js`,
`src/puanlama.js` (revize için `bessBulguTahmin`, `bessBolumToplamlari`), `src/sabitler.js` (`SAYFA_BOYUTU`),
tüm rota dosyaları, 18 şablon, `static/style.css`, `scripts/e2e-test.js`, `package.json` + kilit dosyası, bütün dokümanlar.

**Kaldırılan:** `views/silinenler.ejs` (yerini `arsiv.ejs` aldı).

---

## 8. Kod incelemesinde düzeltilen güvenlik bulguları

| Bulgu | Etki | Düzeltme |
|---|---|---|
| Giriş sonrası yönlendirmede `/\site.com` biçimi kabul ediliyordu | Bazı tarayıcılar bunu başka siteye gider (open redirect) | Girişte de ortak `guvenliYol` kullanılıyor; test eklendi |
| `?next=` parametresi iki kez verilince istek 500 hatası veriyordu | Gereksiz hata | Dizi parametresi reddedilir; test eklendi |
| Herkese açık Kullanım Kılavuzu varsayılan yönetici şifresini yazıyordu | Şifre değiştirilmediyse herkes yönetici olur | Kılavuzdan kaldırıldı; ön kontrol aracı varsayılan şifreyi yakalar |
| Arşivden geri yüklemede kolon adları arşivdeki JSON'dan alınıyordu | Bozuk/yabancı arşiv satırı hata verir | Yalnız tablonun gerçek kolonları yazılır |
| CSRF belirteci `!==` ile karşılaştırılıyordu | Teorik zamanlama sızıntısı | `crypto.timingSafeEqual` |
| Denetmen listesi elle kaçışlanan HTML dizgisiyle üretiliyordu | Kaçış unutulursa XSS riski | EJS otomatik kaçışlı partial |
| Bağımlılıklarda 2 yüksek + 4 orta açık | DoS / görsel kütüphanesi açıkları | Güncellendi (§4) |

---

## 9. Test ve doğrulama

- **Uçtan uca test** (`npm test`, ayrı veritabanı): **136/136**. Kapsam: giriş/oturum/CSRF/open redirect, rol ve
  yetki matrisi, öneri/kaizen yaşam döngüsü (onay, gerekçeli red, düzeltme ataması, görev, kaizene dönüştürme,
  arşiv, geri yükleme), sayfalama, isim birleştirme, 5S plan/denetim/ödül/revize, kontrol formu (takvim, ileri tarih,
  imza, aksiyon açılmaması, çok aylı Excel ve içeriği, form kodu olmaması), HTTPS/proxy bayrakları.
- **Eski veritabanıyla geçiş doğrulaması** (46/46): canlı sürümle (`1d67cea`) üretilmiş, isimleri tek kutudan farklı
  yazılışlarla girilmiş veri yeni sürümle açıldı; eski kolonların tamamı birebir aynı, puan toplamları aynı, eski
  hesaplarla giriş ve tüm sayfalar çalışıyor. Ayrıntı: [VERITABANI_GECIS.md](VERITABANI_GECIS.md) §6.
- **Geri dönüş:** Eski sürüm, yeni sürümün genişlettiği veritabanında çalıştırıldı — giriş, kayıt gönderme ve
  listeler sorunsuz.
- **Salt-okunurluk:** Ön kontrol aracı çalıştırılmadan önce ve sonra tüm tabloların `CHECKSUM TABLE` değerleri aynı.
- Test paketi önceki turda MySQL 8 ve MariaDB 10.11'de (122/122), bu turda MariaDB 10.11'de (136/136) çalıştırıldı.
- **Görsel kontrol:** Kontrol formu (masaüstü + telefon), takvim, yönetim sayfası ekran görüntüleriyle denetlendi.

---

## 10. Açık kalanlar

Güvenlik ve mimari açısından önerilen sonraki adımlar (öncelik sırasıyla) [IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md)
§5'te. Kısaca: deponun gizli yapılması ve varsayılan şifrenin doğrulanması, giriş modelinin hızlandırılması
(şifre taraması), çıkışın POST'a alınması, satır içi script'lerin dosyaya taşınıp CSP'nin sıkılaştırılması, CI.

---

## Ek — 9 Ekim 2026: Puan ve Ödül Ayarları

**İstek:** Öneri, kaizen ve 5S puan karşılıklarını ve ödül eşiğini değiştirebilmek; önerinin puanlama tablosuyla mı
yoksa onaylanınca sabit puanla mı (ör. 10 puan) değerlendirileceğine ana yöneticinin karar verebilmesi.

**Yapılan:**

| Parça | Ne |
|---|---|
| `src/puanKurallari.js` (yeni, saf) | Varsayılanlar, doğrulama, kural sürümü seçimi (onay günü), kazanç hesabı, açıklama metni |
| `src/servis/ayarlar.js` (yeni, katman 0) | Kural sürümlerini ve ödül ayarlarını `config` tablosunda okur/yazar |
| `src/rotalar/ayarlar.js` + `views/puan_ayarlari.ejs` (yeni) | Ana yönetici sayfası: eşik, 5S puanları, öneri modu, oranlar, uygulama kapsamı, **etki önizlemesi**, kural geçmişi |
| `servis/puan.js`, `servis/panel.js`, `servis/bes.js` | Sabit değerler yerine ayar; işlenmiş 5S turu ve verilmiş ödül kayıttaki değeriyle |
| `rotalar/admin.js` | İlk onayda `onay_zamani`; sabit kuraldaki öneri tabloyla puanlanamaz |
| Liste, detay, puan listesi, kılavuz, kaizen formu, Excel | Sabit puan gösterimi, "puan listesine yazılan" satırı, oran metinleri ayardan, Excel'de yazılan puan sütunları |
| Güvenlik (B10) | Onay pencerelerinde kullanıcı verisi JS dizgisinden `data-onay` özniteliğine |

**Tasarım kararı — neden "geçerlilik tarihli" kural:** Ödüller paraya dönüştüğü için oran değişikliğinin geçmişte
kazanılmış puanları sessizce değiştirmemesi gerekir. Bu yüzden her kayda onaylandığı günün kuralı uygulanır;
istenirse "geriye dönük" seçeneğiyle tüm kayıtlar yeniden hesaplanır. Ödülde düşülen puan ve işlenmiş 5S turunun
puanı zaten kayıtlarda saklandığı için eşik ve 5S değişikliği geçmişi etkilemez. Ayar hiç kaydedilmezse varsayılanlar
önceki sabit değerlerle aynıdır — güncelleme puanları değiştirmez.

**Test:** 21 yeni uçtan uca kontrol (yetki, önizlemenin kaydetmemesi, doğrulama, bugünden itibaren / geriye dönük,
sabit puan ve puanlama engeli, eşik ve ödül düşümü, 5S defteri, sürüm kaldırma, onay penceresi XSS) → **157/157**.

