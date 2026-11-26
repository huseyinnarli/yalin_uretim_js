# Sürüm Notları

## 26 Kasım 2026 — 5S denetim silme yalnız ana yöneticide

- **Yapılmış 5S denetimini yalnız ana yönetici silebilir.** Ek yöneticide "Denetim revize" yetkisi olsa da "Denetimi Sil"
  ve sıralamadaki "Sil" düğmeleri görünmez; doğrudan istek de reddedilir. Revize (düzeltme) yetkisi aynen kalır.
- Bölüm silmek o bölümün denetimlerini de sildiği için **geçmiş denetimi olan bölümü** de yalnız ana yönetici silebilir;
  ek yönetici listede "silinemez" görür (5S'ten çıkarmak için "5S'e dahil" işaretini kaldırabilir).
- Yetki kutucuğunun adı "Denetim revize & silme" → **"Denetim revize"**. Veritabanı değişmedi; mevcut ek yöneticilerin
  kayıtlı yetkileri elle düzeltilmeden geçerli olur.
- Denetim planındaki **Planı Sil** (yalnız henüz yapılmamış denetimleri kaldırır, tamamlananlara dokunmaz) plan yetkisinde kaldı.
- e2e testi: **321/321**.

## 26 Kasım 2026 — Bölümler ve Görevler sekmeli

- **Bölümler ve Görevler** sayfası 5S sayfası gibi sekmelere ayrıldı: **Bölümler** (ekleme + liste) · **Ekip & Personel**
  (Ekibe personel ekle kartı + Ekipler tablosu) · **Görev Tanımları**. Sekmeye tıklayınca sayfa yenilenmeden geçer; seçili
  sekme adreste kalır (yenileyince / işlemden dönünce aynı sekme açılır). Sekmelerde bölüm ve görev sayısı yazar.
- Ekip lideri ve personel sayısı Bölümler listesinden **Ekip & Personel** sekmesindeki Ekipler tablosuna taşındı;
  **Düzenle** bölüm sayfasını açar, oradaki geri düğmesi Ekip & Personel sekmesine döner.
- Veritabanı değişmedi. e2e testi: **314/314**.

## 26 Kasım 2026 — Ekip ve personel tek yerde: Bölümler ve Görevler

- **5S › Bölümler** sekmesindeki "Bölüm listesini düzenle" düğmesi kaldırıldı (yerine kısa bir not). Bölüm, ekip lideri ve
  personel düzenleme **Yönetim › Bölümler ve Görevler**'de.
- **Bölümler ve Görevler**'e **Ekibe personel ekle** kartı: bölüm açılır listeden seçilir, personel her satıra Ad Soyad yazılarak
  (Excel'den yapıştırılabilir) toplu eklenir; eklemeden sonra aynı bölüm seçili kalır, mesajda bölüm adı yazar. Ekip lideri ve
  personel çıkarma tablodaki **kişi** düğmesiyle açılan bölüm sayfasında (değişmedi). Sayfa başında "Ekibe personel ekle" kısayolu.
- **5S bölüm sayfası** ekibi artık yalnız gösterir (lider/personel formları kaldırıldı); yetkili kullanıcıya "Ekibi düzenle →" bağlantısı.
- Veritabanı değişmedi. e2e testi: **312/312**.

## 26 Kasım 2026 — Demo: ana yönetici bilgisi şeritte gösterilmiyor

- Demo şeridinde artık ana yönetici kullanıcı adı ve şifresi yazmıyor (yalnız örnek ek yönetici ve denetmen hesapları).
  Demoda ana yönetici girişi (`admin` / `admin123`) aynen çalışır. Canlı kurulumu etkilemez.

## 26 Kasım 2026 — Üst menü sırası

- Girişli üst menü artık **Panel · Puan Listesi · Öneri & Kaizen · 5S** sırasıyla (ardından Görevlerim ve Kılavuz).
  Veritabanı değişmedi. e2e testi: **305/305**.

## 25 Kasım 2026 (devam) — Giriş: kullanıcı adı + şifre

- **Giriş artık kullanıcı adı ve şifreyle.** Yalnız şifreyle giriş kapandı (eskiden sistem kişiyi şifreden tanıyordu).
  Ana yöneticinin kullanıcı adı **`admin`** (sabit). Diğer hesaplara addan otomatik verilir: Ali Yılmaz → `ali.yilmaz`,
  aynısı varsa `ali.yilmaz2`. Girişte büyük/küçük harf ve Türkçe harf farkı önemsenmez (`Ali.Yılmaz` da olur);
  hatalı girişte kullanıcı adı kutuda kalır, telefon klavyesi ilk harfi büyütmez.
- **Mevcut hesaplar:** güncellemeden sonraki ilk açılışta kullanıcı adı olmayan her denetmen ve ek yöneticiye addan kullanıcı
  adı verilir (sunucu günlüğüne yazılır; `npm run gecis-kontrol` önceden hangi adların verileceğini listeler). **Şifreler değişmez.**
- **Yönetim:** Denetmenler ve Yöneticiler sekmelerinde her hesabın kullanıcı adı görünür ve değiştirilebilir (yeni şifre kutusu
  boşsa şifre değişmez). Yeni hesapta kullanıcı adı kutusu boş bırakılırsa addan verilir. Kullanıcı adları benzersizdir
  (3–32 karakter: harf, rakam, nokta, tire); `admin` ana yöneticiye ayrılmıştır. Şifre sekmesinde "Kullanıcı adınız: admin".
- **"Her şifre farklı olmalı" kuralı kaldırıldı** — kimlik artık kullanıcı adından geliyor. Bu kural, başka bir hesabın
  şifresini deneme yanılmayla bulmaya da açık kapı bırakıyordu ("bu şifre kullanımda" uyarısı).
- **Hızlı giriş:** her hatalı girişte tüm hesapların şifreleri tek tek denenmiyor (hesap başına ~0,3 sn sunucuyu kilitliyordu);
  yalnız o kullanıcı adının şifresi karşılaştırılır.
- **Veritabanı (yalnız ekleme):** `denetmenler.kullanici_adi`, `yoneticiler.kullanici_adi` (VARCHAR(64)). Eski sürüm genişletilmiş
  veritabanında çalışır ve yine şifreyle girer; eski sürümle açılan hesaba yeni sürüm ilk açılışta kullanıcı adı verir
  (eski düzen veritabanıyla geçiş, ön kontrol, geri dönüş ve tekrar geçiş denendi).
- **Canlıya alırken:** güncellemeden sonra denetmenlere / ek yöneticilere kullanıcı adlarını bildirin (Yönetim'de listeli).
- e2e testi: **304/304**.

## 25 Kasım 2026 (devam) — 5S: bölüm liderine kısayollar, Benim Aksiyonlarım / Tüm Aksiyonlar, Geçmiş sekmesi

- **5S sayfası:** girişli bölüm liderine **Periyodik Kontrol Formu** düğmesi (birden çok bölümün lideriyse her biri için).
  Denetmen / bölüm lideri **Benim Aksiyonlarım** ve **Aksiyonlar** düğmelerini görür.
- **Aksiyonlar iki sekme** (denetmen / bölüm lideri): **Benim Aksiyonlarım** — geçmiş ve güncel denetimlerden açık ve
  kapattığı aksiyonlar (ekip lideri olduğu bölümler + sorumlusu olduğu); **Tüm Aksiyonlar** — bütün bölümler, yalnız
  görüntüleme (kapatma düğmesi yalnız kendi aksiyonlarında). Tüm Aksiyonlar'da **bölüm süzgeci**. Excel/ZIP yine yalnız yöneticide.
- **Geçmiş Denetimler artık 5S sayfasında sekme:** dört sekme (Son Denetimler · Bölümler · Denetim Planı · Geçmiş Denetimler)
  aynı sekme çubuğunda, sayfa yenilenmeden geçer; ayrı sayfa açan düğmeler (kontrol formu, aksiyonlar, Excel) sağda.
  Seçili sekme adreste kalır (yenileyince / geri gelince aynı sekme). Eski `/5s/gecmis` adresi sekmeye yönlenir.
- Veritabanı değişikliği yok. e2e testi: **282/282**.

## 25 Kasım 2026 (devam) — Düzeltme: kontrol formunun aylık tablosu telefonda okunmuyordu

- 5S periyodik kontrol formunun **aylık tablosu** telefonda bozuk görünüyordu: gün numaraları gizleniyor, her gün ayrı
  satıra düşüyordu (sayfa ~12.000 px, hangi işaretin hangi güne ait olduğu anlaşılmıyordu). Artık tablo telefonda da
  **ızgara** olarak kalır, sağa-sola kaydırılır, madde sütunu solda sabit durur ve açılışta **bugünün sütunu** görünür.
- Düzeltme (bilgisayarda da): tablonun çift satırlarında ✓ / ✗ hücrelerinin yeşil / kırmızı zemini görünmüyordu.
- Veritabanı değişikliği yok. e2e testi: **276/276**.

## 25 Kasım 2026 (devam) — Düzeltme: bölüm sayfasındaki "Açık aksiyon" bağlantısı

- 5S bölüm sayfasındaki **Açık aksiyon** kutusu ve 5S Bölümler tablosundaki "N açık" etiketi, bir önceki güncellemede bozulan
  bağlantı yüzünden "sayfa bulunamadı" veriyordu; düzeltildi.
- Test paketine **site içi bağlantı taraması** eklendi: yönetici ve denetmen olarak tüm sayfaları gezip bozuk ya da
  bulunamayan bağlantı arar (bu tür hata bir daha fark edilmeden gitmesin). e2e testi: **275/275**.

## 25 Kasım 2026 (devam) — Denetmen / bölüm lideri: yalnız kendi aksiyonları, dosya indirme yok

- **5S Aksiyonlar** sayfası artık girişe kapalı. Yönetici tüm aksiyonları görür; **denetmen / bölüm lideri yalnız kendi
  aksiyonlarını** görür ("5S Aksiyonlarım"): ekip lideri olduğu bölümlerin aksiyonları ve sorumlusu olduğu aksiyonlar.
  Görevlerim'deki "Aksiyona Git" de bu sayfaya götürür. Girişsiz ziyaretçi giriş sayfasına yönlenir; 5S sayfalarındaki
  aksiyon sayıları görünmeye devam eder (bağlantısız).
- **Denetmen / bölüm lideri hiçbir Excel veya ZIP dosyası indiremez.** Tek açık uç olan periyodik kontrol formu Excel'i
  de yalnız yöneticiye açıldı (düğme denetmene görünmez). Diğer Excel/ZIP uçları zaten yönetici yetkisi istiyordu.
- Veritabanı değişikliği yok. e2e testi: **273/273**.

## 25 Kasım 2026 (devam) — Görsel düzen: çizgi ikonlar, kısa mobil liste, sekmeli Yönetim, menüde Puan Listesi

- **Tek tip çizgi ikonlar:** sitedeki emojiler (menü, sayfa başlıkları, düğmeler, bilgi satırları) her cihazda aynı görünen
  sade çizgi ikonlarla değişti (Lucide ikon seti, ISC lisansı; dış bağlantı yok, sunucudan gelir). 1./2./3. sıra madalyaları
  renkli numaralı rozet oldu. Ana sayfa kartlarında ikonlar yuvarlak zeminde.
- **Telefonda kısa liste kartı:** Öneri & Kaizen listesinde her kayıt artık ~5 satırlık kart (tür · no · tarih, konu,
  kişi · bölüm, durum · puan, işlem düğmeleri) — önceki "her alan ayrı satır" kartının yarısından az yer kaplar.
- **Tekrarlar kaldırıldı:** Panel, Puan Listesi, Görevlerim ve Yönetim başlıklarındaki üst menüyü tekrarlayan kısayollar
  çıkarıldı. Bölüm sayfasındaki "Denetim Geçmişi" tablosu kaldırıldı — denetimler tek tabloda (S1–S5 kırılımı + Formu Gör);
  skor trendi Ekip'in yanına taşındı; yapılacak denetim varsa üstte "Denetimi Doldur" notu çıkar.
- **Yönetim sayfası sekmeli:** Denetmenler · Misafir Denetmenler · Yöneticiler · Şifre Değiştir. İşlem sonrası doğru
  sekmeye dönülür (şifre değişikliği dahil).
- **Üst menüye 🏆 Puan Listesi** (giriş yapınca; 5S gibi). Menü 1220 px ve altında düğme düzeninde, 1221–1440 px'te tek
  satır (logonun yanındaki şirket adı gizlenir), daha genişte tam.
- **İşlem günlüğü Excel'i:** İşlem Günlüğü sayfasında **Günlük Excel (tümü)** — bütün kayıtlar (Zaman, Kim, Rol, İşlem,
  Sayfa, IP; başlık sabit, filtreli). Yalnız ana yönetici. Temizle onayında önce indirme önerilir.
- Veritabanı değişikliği yok. e2e testi: **265/265**.

## 25 Kasım 2026 (devam) — Arayüz incelemesi: küçük düzeltmeler

- Üst menüde ana yönetici rozetinde "Ana Yönetici yönetici" tekrarı kaldırıldı (ek yöneticide ad + "yönetici" kalır).
- Liste arama ipucundan kaldırılmış "form no" çıkarıldı; Filtrele ve Temizle düğmeleri aynı hizada.
- Panel kısayolunda Öneri & Kaizen simgesi üst menüyle aynı; bölüm sayfasında "Form" düğmesi diğerleri gibi "Formu Gör".
- Detay sayfasında tek ana eylem öne çıkar: Düzenle ve (puanlanmışsa) Puanı Düzenle ikincil düğme.
- **Geciken terminler kırmızı:** açık 5S aksiyonlarında ve görev terminlerinde (Görevlerim) tarih geçtiyse "— gecikti".
- Puan listesindeki "Sil" düğmesi yaptığı işi anlatsın diye **"Kaldır"** (kişiyi puan listesinden kaldırır).
- Görevlerim'de gözden geçirme tarihi gelen havuz önerisi tek satırda (tarih · bekleme türü).
- Veritabanı değişikliği yok. e2e testi: **259/259**.

## 25 Kasım 2026 (devam) — 5S Aksiyonlar: bölüm adları başlıkta, tur başına tek grup

- **Düzeltme:** aynı denetim turunun aksiyonları, denetimler farklı günlerde yapıldığı için ayrı ayrı gruplara bölünüyordu
  (ör. tek bölümlük birçok "Kasım 2026 Denetimi" grubu). Artık **tur adına göre tek grup**; sıralama turun en son denetim
  gününe göre.
- Grup başlığında **bölüm adları ve aksiyon sayıları** görünür (açık aksiyonlarda kırmızı, kapalılarda gri etiket) —
  hangi bölümde ne kadar aksiyon olduğunu görmek için grubu açmak gerekmez. En yeni turun açık aksiyonları açık gelir.
- Veritabanı değişikliği yok. e2e testi: **259/259**.

## 25 Kasım 2026 (devam) — Öneri Havuzu sayfası, sade rozetler

- **🗃 Öneri Havuzu** (`/havuz`, girişli herkes): beklemedeki ve uygulanamadı olarak kapatılan öneriler artık **ana listede
  görünmez**, burada toplanır (reddedilen/silinenler ayrı: 🗂 Reddedilen & Silinen).
  - **Beklemede** tablosu: öneri, sahibi, bölüm, bekleme türü + açıklama, gözden geçirme tarihi (yakın olan üstte; tarihi
    gelen kırmızı), puan. **Uygulanamadı** tablosu: kapanış nedeni, kapatan ve zaman (son kapatılan üstte), puan.
  - Liste sayfasında **🗃 Öneri Havuzu** düğmesi (havuzdaki öneri sayısıyla). Panel özeti, Görevlerim takip listesi ve
    detaydaki rozet havuz sayfasına götürür. Eski `?durum=havuz` / `?durum=uygulanamadi` adresleri havuz sayfasına yönlenir;
    ana listedeki bu iki durum filtresi kaldırıldı.
- **Rozetler:** "Beklemede" ve "Uygulanamadı" işaretleri emoji yerine sade çizgi ikonlu rozetler (her cihazda aynı görünür);
  detay kartlarının başlık ve düğme yazıları sadeleşti ("Beklemeye Al", "Havuzdan Çıkar", "Uygulanamadı Olarak Kapat").
- Veritabanı değişikliği yok. e2e testi: **257/257**.

## 25 Kasım 2026 (devam) — Kaizen maliyet hesabı (€)

- Kaizen formunda **Önceki Durum** ve **Sonraki Durum** açıklamalarının altına **maliyet (€)** kutusu eklendi; ikisi de
  **zorunlu** (maliyet yoksa 0). Türkçe yazım kabul: `1250,50`, `1.250,50`, `1250`. Eksi değer ve harf kabul edilmez.
- Fark (önceki − sonraki) formda yazarken ve kaizen detayında görünür: pozitifse **Kazanç** (yeşil), negatifse **Zarar**
  (kırmızı). İki durum aynı dönem için girilmeli (ör. yıllık) — formda not var.
- Maliyeti olmayan **eski kaizenler** detayda "Maliyet hesabı girilmemiş" notuyla açılır; düzenlenirken (düzeltme dahil)
  maliyet girilmesi istenir.
- Kaizen Excel'inin sonuna **Önceki Maliyet (€)**, **Sonraki Maliyet (€)**, **Kazanç (+) / Zarar (−) (€)** sütunları
  eklendi (sayı, € biçimli — Excel'de toplanabilir). Görsel sütunlarının yeri değişmedi.
- **Veritabanı (yalnız ekleme):** `kaizenler.onceki_maliyet`, `kaizenler.sonraki_maliyet` (DECIMAL(14,2)). Eski sürüm
  genişletilmiş veritabanında çalışır; eski sürümle girilen kaizende maliyet boş kalır (eski düzen veritabanıyla geçiş ve geri dönüş denendi).
- e2e testi: **254/254**.

## 25 Kasım 2026 (devam) — Üst menüde 5S, listede bölüm filtresi

- **Üst menüye 🧹 5S** eklendi — yalnız giriş yapınca görünür (girişsiz ziyaretçi 5S'e ana sayfadaki kutudan ulaşmaya devam eder).
- Üst menü yerleşimi: 1160 px ve altında (telefon, tablet, dar ekran) düğme düzeni — marka ortada, düğmeler her satırı
  doldurur. 1161–1380 px arasında (ör. 1280/1366 dizüstü) menü tek satıra sığsın diye logonun yanındaki marka yazısı
  gizlenir (logo adı zaten taşır; logo yoksa yazı görünür). Daha geniş ekranda değişiklik yok.
- **Öneri & Kaizen listesine Bölüm filtresi:** ortak bölüm listesi + kayıtlarda geçen eski/silinmiş bölüm adları; büyük/küçük
  harf farkı önemsiz. "— Bölüm belirtilmemiş —" seçeneği bölümü boş eski kayıtları gösterir. Listeye **Bölüm** sütunu
  eklendi. Filtre sayfa bağlantılarında korunur ve diğer filtrelerle (tür, durum, dönem, arama) birlikte çalışır.
- Veritabanı değişikliği yok. e2e testi: **241/241**.

## 25 Kasım 2026 (devam) — Mobilde üst menü simetrik

- Telefon ve tablette (860 px ve altı) üst menü artık sola yaslı ve düzensiz satırlar hâlinde değil: marka ortada,
  menü düğmeleri her satırı iki kenara kadar dolduruyor; kullanıcı rozeti (👤 ad · rol) kendi satırında. Düğmeler
  dokunmaya uygun büyüklükte. Masaüstü görünümü değişmedi.
- Yalnız `static/style.css`; veritabanı değişikliği yok. Önbellek sorunu olmaz (stil dosyası adresi içerik özetiyle değişir).

## 25 Kasım 2026 (devam) — Kontrol formu Excel'i yalnız seçilen ay

- 5S ve Güvenlik Kontrol Formu sayfasındaki **⬇ Excel (seçilen ay)** artık **yalnız seçilen ayı** indirir (önceden o aya
  kadar doldurulmuş tüm aylar iniyordu).
- Dosyada önce o ayın kâğıt düzenindeki form sayfası (uygunsuzluklar altında), sonra **ÖZET** sayfası (kontrol yapılan
  gün, tam gün, uygun / uygun değil, uygunluk %, imzalı hafta, aylık imza, uygunsuzluk listesi).
- Dosya adı: `5S_Kontrol_Formu_<Bölüm>_<YYYY-AA>.xlsx`. Ay listesi aynı (kaydı olan aylar + bu ay).
- Veritabanı: değişiklik yok. e2e testi: **237/237**.

## 25 Kasım 2026 — Onaylı öneri havuzu (Onaylı – Beklemede / Uygulanamadı)

- Onaylanmış ama şu an uygulanamayan öneri, detay sayfasından **⏸ Onaylı – Beklemede** havuzuna alınır.
  - **Zorunlu:** neden türü (Bütçe / yatırım · Teknik imkân / altyapı · Tedarikçi / malzeme · Başka projeye / karara bağlı ·
    Üretim yoğunluğu / zaman · Diğer), açıklama ve **gözden geçirme tarihi** (bugünden önce olamaz; bilgi güncellenirken
    tarih aynı bırakılırsa geçmişte kalmış tarih kabul edilir).
  - Öneri **"Onaylandı" kalır, onay puanı ve puan listesindeki karşılığı değişmez.**
  - Havuzdayken uygulama görevi atanamaz ve kaizene dönüştürülemez; atanmış görev varsa havuza alınınca kaldırılır
    (mesajda yazar).
  - **▶ Havuzdan Çıkar:** öneri normale döner (görev atanabilir, kaizene dönüştürülebilir).
  - **⛔ Uygulanamadı olarak kapat** (gerekçe zorunlu; normal durumdan ya da havuzdan): öneri onaylı kalır, puanı korunur,
    uygulanmayacağı kayda geçer. **↩ Yeniden Aç** ile geri alınır.
- Liste: durum filtresine **⏸ Onaylı – Beklemede (havuz)** ve **⛔ Uygulanamadı** eklendi. Havuz görünümü gözden geçirme
  tarihine göre (en yakın/geçmiş en üstte) sıralanır; tarihi gelenler kırmızı yazar. Satırlarda rozet.
- Panel: havuz özeti (kaç öneri, kaçının gözden geçirme tarihi geldi, kaç uygulanamadı). 📋 Görevlerim'deki yönetici takip
  listesinde "gözden geçirme tarihi gelen havuz önerileri".
- Öneri Excel'inin sonuna **Uygulama Durumu** (Uygulanacak / Görev atandı / Kaizene dönüştü / Onaylı – Beklemede /
  Uygulanamadı), **Bekleme Türü**, **Bekleme / Kapanış Nedeni**, **Gözden Geçirme** sütunları eklendi (eski sütunların yeri aynı).
- İşlemler (havuza alma, güncelleme, çıkarma, kapatma, yeniden açma) işlem günlüğüne yazılır. Yetki: Değerlendirme.
- **Veritabanı (yalnız ekleme):** `oneriler` tablosuna 7 kolon — `uygulama_durumu`, `bekleme_kategori`, `bekleme_nedeni`,
  `bekleme_gozden`, `uygulanamadi_nedeni`, `uygulama_isleyen`, `uygulama_zamani`. Eski sürüm genişletilmiş veritabanında
  çalışmaya devam eder (denendi); eski sürüme dönülürse havuzdaki öneriler normal onaylı öneri gibi görünür.
- e2e testi: **236/236** (26 yeni kontrol).

## 23 Kasım 2026 — Görev atamasında termin ve açıklama zorunlu

- Öneriyi uygulayıp kaizene dönüştürme görevi atanırken **termin** ve **açıklama** artık zorunlu (önceden isteğe bağlıydı).
  - Onay kartında görev isteğe bağlı kalır; denetmen seçilince termin ve açıklama kutuları zorunlu olur. Eksikse kayıt
    onaylanmaz ve sebebi yazılır.
  - "Uygulama Görevi Ata / Görevi Değiştir" kartında ikisi de her zaman zorunlu.
  - Termin bugünden önce olamaz (takvimde geçmiş günler kapalı). Görev değiştirilirken termin aynı bırakılırsa geçmişte
    kalmış eski termin kabul edilir.
  - Başarı mesajında (ve işlem günlüğünde) termin tarihi yazar.
- Veritabanı: değişiklik yok. e2e testi: **210/210** (7 yeni kontrol).

## 16 Kasım 2026 (devam) — Bölüm personeli ve görev tanımları

- Sayfa adı **Yönetim › 🏭 Bölümler ve Görevler** (yetki adı: Bölüm/görev listeleri & denetim planı).
- **Bölüm personeli:** listede her bölümün yanında **👥 N kişi** düğmesi → bölüm sayfası (`/yonetici/bolumler/:id`):
  ekip lideri (en fazla 2, ad/soyad ayrı) ve personel. Personel **toplu eklenir**: her satıra "Ad Soyad" (Excel'den
  sütun yapıştırılabilir; son kelime soyad, harfler düzeltilir). Tek kelimelik satır eklenmez; bu bölümde olan atlanır;
  başka bölümde de kayıtlı olan eklenir ve bildirilir. 5S bölüm sayfasındaki tek tek ekleme de duruyor.
- **Görev tanımları:** tüm bölümler için tek liste (toplu ekleme, ad değiştirme, silme, kullanım sayısı). Kayıtlarda
  serbest yazılmış görevler "listede olmayan görevler" kutusunda en sıktan listelenir; işaretlenip listeye eklenir.
- **Öneri formunda görev açılır listeden** seçilir ve zorunludur. **Kaizen formunda ekipteki her kişinin görevi** (lider
  zorunlu, üye yazıldıysa zorunlu) listeden seçilir. Liste boşken eski davranış: öneride serbest metin, kaizende görev yok.
  Düzenlemede listeden kalkmış eski görev "(eski kayıt — listede yok)" olarak seçili kalır.
- Kaizen detayında kişilerin görevleri parantez içinde; kaizen Excel'inin sonunda **Lider Görevi** ve **Üye Görevleri**.
- `npm run gecis-kontrol`: §6 önerilerdeki görev yazılışlarını (en sık) listeler.
- **Veritabanı (yalnız ekleme):** `kaizenler.lider_gorevi`, `kaizenler.uye_gorevleri`; görev listesi `config.gorev_tanimlari`.
  Eski sürüm genişletilmiş veritabanında çalışmaya devam eder (denendi).
- Kod: ortak saf liste yardımcıları `src/liste.js`; `servis/gorevTanimlari.js`; form alanı `partials/liste_secimi.ejs`
  (bölüm ve görev için tek şablon). e2e testi: **203/203** (22 yeni kontrol).

## 16 Kasım 2026 — Ortak bölüm listesi

- **Yönetim › 🏭 Bölümler** (yetki: Bölüm listesi & denetim planı): öneri/kaizen formları ile 5S'in **tek** bölüm listesi.
  - Toplu ekleme (her satıra bir ad; listede olan ad — büyük/küçük harf farkıyla — atlanır).
  - Tek "Kaydet" ile ad değiştirme ve her bölüm için **5S'e dahil** kutusu. İki bölüm aynı ada düşerse hiçbir şey kaydedilmez.
  - Her bölümün öneri, kaizen ve 5S denetim sayısı. Silme onayında, bölümün 5S geçmişi varsa kaç denetimin (ve
    fotoğraflarının) silineceği yazar; 5S'ten çıkarmak için silmek yerine kutunun kaldırılması önerilir.
- **Öneri ve kaizen formlarında bölüm açılır listeden seçilir** ve zorunludur (sunucuda listeye göre doğrulanır; liste boşsa
  serbest metin). Öneride yeni alan; kaizende serbest metin yerine liste. Öneriden kaizene dönüştürmede bölüm taşınır.
  Düzenlemede listeden kalkmış eski ad "(eski kayıt — listede yok)" olarak seçili kalır.
- **5S yalnız 5S'e dahil bölümleri kullanır:** denetim turu planı, 5S bölüm tablosu, denetmenin günlük kontrol formları.
  5S dışına alınan bölümün geçmiş denetimleri korunur; trendde yalnız geçmişi varsa görünür, bölüm sayfasında not çıkar.
  5S sekmesindeki ekleme/silme Bölümler sayfasına taşındı (eski uçlar aynı listeye yazar).
- Öneri detayında ve öneri Excel'inde (son sütun) **Bölüm**.
- `npm run gecis-kontrol`: yeni "Bölüm listesi" bölümü — aynı adlı bölümler ve listede olmayan kaizen bölüm adları.
- **Veritabanı (yalnız ekleme):** `bolumler.bes_dahil` (varsayılan 1 — eski bölümler 5S'te kalır), `oneriler.bolum`.
  Eski sürüm genişletilmiş veritabanında çalışmaya devam eder (denendi).
- e2e testi: **181/181** (22 yeni kontrol).

## 2 Kasım 2026 — Devreye alma hazırlığı

Kullanıcıya görünen işlev değişmedi; canlıdaki eski sitenin üzerine güvenli kurulum için:

- **[GUNCELLEME_REHBERI.md](GUNCELLEME_REHBERI.md):** güncellemeyi yapacak kişi için adım adım rehber. İçeriği: sunucu
  bilgisi toplama, yedek, ön kontrol, prova, üç geçiş yolu, duman testi, geri dönüş, 15 tuzak ve kod incelemesi bulguları.
- **Tarayıcı önbelleği:** `/static` dosyaları (style.css, takvim, flatpickr, logo) 1 yıl önbelleklenirken adresleri
  sabitti. Güncellemeden sonra telefonlar eski stili kullanacaktı. Artık adreslerde içerik özeti var (`style.css?v=…`);
  dosya değişince tarayıcı yenisini kendiliğinden indirir.
- **Ön kontrol (`npm run gecis-kontrol`):** veritabanı kullanıcısının yetkilerini de denetler. Açılışta CREATE ve,
  eklenecek kolon varsa, ALTER gerekir; eksikse uygulama açılmaz. Rapor eksik yetkiyi ve `GRANT` komutunu verir, çıkış kodu 2 olur.
- **Açılış hatası:** yetki yetersizliğinde "bağlantı ayarlarını kontrol edin" yerine ne yapılacağını söyleyen ayrı mesaj.
- Eski sürümün (`1d67cea`) veritabanıyla geçiş ve geri dönüş güncel kodla yeniden doğrulandı (46/46). e2e testi: **159/159**.
- Veritabanı: değişiklik yok.

## 9 Ekim 2026 — Puan ve Ödül Ayarları

**Ana yönetici** artık puan ve ödül kurallarını kod değiştirmeden ayarlayabilir: Yönetim › **🏆 Puan ve Ödül Ayarları**.

- **Ödül eşiği** (varsayılan 300) ve **5S tur ödülleri** (1./2./3. bölüm, varsayılan 100/75/50) değiştirilebilir.
  Hemen geçerlidir. Daha önce verilmiş ödülde düşülen puan ve ödülü işlenmiş 5S turlarının puanı **değişmez**
  (ikisi de kayıtta saklanır).
- **Öneri değerlendirme modu:**
  - *Puanlama tablosuyla* (önceki davranış): öneri puanlanır, sahibine puanın belirlenen yüzdesi (varsayılan %10) yazılır.
  - *Onaylanınca sabit puan*: puanlama tablosu kullanılmaz; öneri onaylandığı an sahibine sabit puan (ör. 10) yazılır.
    Bu önerilerde "Puanla" düğmesi görünmez; listede "sabit +10" yazar.
- **Kaizen oranları** (lider / her üye, varsayılan %50 / %25) değiştirilebilir.
- Öneri/kaizen kuralı iki şekilde uygulanır: **bugünden itibaren onaylananlara** (önerilen; eski puanlar değişmez) veya
  **tüm kayıtlara geriye dönük**. Her kayda **onaylandığı günün** kuralı uygulanır; kural geçmişi sayfada listelenir,
  bir sürüm kaldırılabilir.
- **Etkisini Önizle:** kaydetmeden önce mevcut veride toplam puanların, eşiği geçen kişi sayısının ve kişi kişi net
  puanların nasıl değişeceğini gösterir.
- Kayıt detayında "Puan listesine yazılan: öneri sahibine +X / lidere +X, her üyeye +Y" satırı; öneri ve kaizen
  Excel'ine sondan "yazılan puan" sütunları eklendi (görsel sütunları kaymaz). Kılavuz, puan listesi ve kaizen
  formundaki oran metinleri güncel ayardan gelir.
- Güvenlik: puan listesi, ödül alanlar ve 5S sayfalarındaki onay pencerelerinde kişi/bölüm adı artık JavaScript
  dizgisine gömülmüyor (adında tırnak olan bir öneri sahibi, yöneticinin tarayıcısında kod çalıştıramaz).
- **Veritabanı (yalnız ekleme):** `oneriler.onay_zamani`, `kaizenler.onay_zamani` (ilk onay zamanı — kural seçimi);
  ayarlar `config` tablosunda (`puan_kurallari`, `odul_ayarlari`). Ayar hiç kaydedilmemişse varsayılanlar geçerlidir,
  yani güncellemeden sonra puanlar **aynı kalır**.
- e2e testi: **157/157**.

## Ekim 2026 — Roller, görev atama, panel ve 5S periyodik kontrol formu

### Kullanıcıya görünen değişiklikler

**Öneri & Kaizen**
- Liste ve kayıt detayları artık **yalnızca girişli kullanıcılara** (denetmen + yöneticiler) açık.
  Öneri/kaizen **formları herkese açık** kalır; girişsiz gönderen anasayfaya döner ve teşekkür mesajı görür.
- Liste **20'şerli sayfalanır**; durum filtresi eklendi (Değerlendiriliyor / Düzeltme İsteniyor / Onaylandı).
- **Kaydın detay sayfasında değerlendirme yapılır:** ✓ Onayla · ✕ Reddet · ✏ Düzeltme İste kartları.
  Listede hızlı "✓ Onay" kalır; red/düzeltme gerekçe istediği için detaya yönlendirir.
- **Red için gerekçe zorunlu.** Gerekçe detayda, arşivde ve Excel'de görünür.
- **Düzeltme isterken** düzeltmeyi yapacak **denetmen seçilir** + ne düzeltileceği yazılır. Yalnızca o denetmen
  (ve kayıt yetkili yönetici) kaydı düzenleyebilir; denetmen kaydedince kayıt otomatik **"Değerlendiriliyor"**a döner.
- **Onaylanan öneriye görev atanır:** uygulayıp kaizene dönüştürecek denetmen + termin + not (onaylarken ya da
  sonradan detaydan). Atanan kişi **🔧 Kaizene Dönüştür** ile öneriden doldurulmuş kaizen formunu açar;
  kaydedilince öneri ve kaizen birbirine bağlanır.
- **Puanlamadan sonra kaydın detayına dönülür;** "← Listeye Dön" kaldığın sayfaya ve filtreye götürür.
- **Reddedilen & Silinen** kayıtlar ana listeden çıkıp `/arsiv` sayfasında toplanır. Denetmenler görüntüler,
  işlem yapamaz (geri yükle / kalıcı sil kayıt yetkisi ister). Eski `/silinenler` adresi buraya yönlenir.

**İsimler ve puan listesi**
- Tüm kişi girişlerinde **Ad** ve **Soyad** ayrı kutulardan alınır ve düzeltilir ("aHMET" "YILMAZ" → "Ahmet Yılmaz").
- Puan listesinde aynı kişinin farklı yazılışları **otomatik birleşir** (büyük/küçük harf, boşluk, ı/i, ş/s…).
- **İsim Birleştirme** sayfası (`/isimler`, ödül yetkisi): yazım hatalarını önerir, elle birleştirme ve geri ayırma.
  **Kayıtlardaki isimler değişmez** — birleştirme yalnızca hesaplamadadır.

**Roller ve yetkiler**
- "5S Denetmen" → **Denetmen**. Denetmen hesabı bölüm lideri olmayan kişilere de açılabilir.
  Denetmen: kendisine planlanan 5S denetimini yapar, lideri olduğu bölümün aksiyonlarını kapatır ve
  **periyodik kontrol formunu** doldurur, öneri/kaizenleri görüntüler, kendisine atanan düzeltme ve görevleri yapar.
- **Görevlerim** sayfası: atanan düzeltmeler, kaizene dönüştürme görevleri, planlanan denetimler, kapatılacak
  aksiyonlar ve bugünkü kontrol formu. Menüde bekleyen iş sayısı rozeti görünür.
- Ek yönetici yetkileri **ayrıntılandı** (4 → 10 alan):
  | Grup | Yetki |
  |---|---|
  | Öneri & Kaizen | Değerlendirme · Puanlama · Kayıt düzenle-sil & raporlar |
  | 5S | Bölüm & denetim planı · Denetim yapma · Denetim revize & silme · Aksiyon yönetimi · 5S ödül & raporlar |
  | Puan & Ödül | Ödül verme & isim birleştirme |
  | Hesaplar | Denetmen hesapları |
- **Tam yetki yalnız ana yöneticide:** ek yönetici ekleme/düzenleme/silme ve işlem günlüğü yalnızca ana yöneticidedir;
  ek yöneticiye "tam yetki" verilemez (bir ara sunulan ⭐ tam yetki seçeneği kaldırıldı). Ana yönetici sabittir.

**Panel ve 5S**
- **Panel** (`/panel`) denetmenler ve tüm yöneticilere açık: dönem butonlu tek istatistik tablosu (Bu Ay /
  Son 6 Ay / Bu Yıl / Tüm Zamanlar), altta sabit tüm zamanlar toplamı, **son 12 ay gelen vs. puan alan** grafiği,
  bölümlerin 5S trendi. Hesap yönetimi **Yönetim** (`/yonetici`) sayfasında kaldı.
- **5S › Bölümler** sekmesi kart yerine **tablo**: ekip lideri, personel sayısı, son skor/tarih, açık aksiyon,
  bu ayki kontrol doluluğu.
- **Bölüm sayfası:** personel / açık aksiyon / son skor özetleri, **skor trend grafiği** ve her denetimin
  **S1–S5 kırılımı**.
- **Denetim revize:** "Denetim revize & silme" yetkili yönetici yapılmış denetimi düzeltebilir (bulgular,
  açıklamalar, fotoğraf ekle/sil, yeni aksiyon). **Ödülleri işlenmiş turda revize kapalıdır.**
- **5S Periyodik Kontrol Formu** (Günlük/Haftalık/Aylık 5S ve Güvenlik): bölüm sayfasından açılır,
  bölümün ekip lideri doldurur; kontrol günü **Türkçe takvimden** seçilir (gün seçilince form açılır, ileri tarih
  seçilemez); uygun değil işaretlenen maddeye açıklama zorunlu, uygunsuzluklar formun altında listelenir
  (formdan aksiyon açılmaz); haftalık (grup lideri) ve aylık (bölüm sorumlusu) kontrol imzası. Herkes görüntüleyebilir.
- **Kontrol formu Excel'i:** ay seçilir, **o aya kadar doldurulmuş tüm aylar** tek dosyada iner — her ay kâğıt
  düzeninde ayrı sayfa, başta ÖZET (ay başına kontrol günü, uygun/uygun değil, uygunluk %, imzalı hafta, aylık imza)
  ve tüm ayların uygunsuzluk listesi.
- Kontrol formunda **form kodu ve revizyon numarası gösterilmez** (sayfa, Excel başlığı, dosya adı:
  `5S_Kontrol_Formu_<Bölüm>_<ay>.xlsx`).

**Form No kaldırıldı**
- Onaylanan öneri/kaizene artık `FR-YYYY-NNNN` form numarası **verilmez**; liste, detay, arama ve Excel'den çıkarıldı
  (öneri Excel'inde 2. sütun, kaizen Excel'inde "Form No" sütunu yok). Daha önce verilmiş numaralar veritabanında
  (`form_no` kolonu) **olduğu gibi durur**, yalnızca gösterilmez.

**Kod düzeni ve güvenlik** (ayrıntı: [GELISTIRME_RAPORU.md](GELISTIRME_RAPORU.md), [IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md))
- İş mantığı tek dosyadan (`cekirdek.js`, 1.218 satır) 12 alan modülüne (`src/servis/*`) bölündü; fonksiyonlar
  değiştirilmeden taşındı. Kontrol formu rotaları ayrı dosyada (`rotalar/kontrol.js`). Ölü kod temizlendi.
- Güvenlik: girişte `/\site` yönlendirme açığı ve `?next=` çift parametre hatası kapandı; herkese açık kılavuzdan
  varsayılan şifre kaldırıldı; CSRF sabit zamanlı karşılaştırma; arşivden geri yükleme kolon denetimi.
- Bağımlılıklar: sharp 0.35.5, express 4.22.3, mysql2 3.24.5, multer 2.4.0 (`npm audit`: yüksek açık kalmadı).
- **Geçiş ön kontrolü:** `npm run gecis-kontrol` — canlı veritabanına salt-okunur bağlanıp şema farkını, isimleri,
  yetkileri ve varsayılan şifreyi raporlar (bkz. [VERITABANI_GECIS.md](VERITABANI_GECIS.md)).

**Demo (tasarım önizleme)**
- `Dockerfile` + `scripts/demo-baslat.sh` + `scripts/demo-veri.js`: Render'da harici veritabanı olmadan, içinde geçici
  MariaDB ve örnek veriyle çalışan demo. Canlı kurulumu etkilemez (bkz. DAGITIM.md §11). Uygulama MariaDB 10.11'de
  de test edildi (136/136).

### Veritabanı değişiklikleri (otomatik, yalnızca EKLEME)

Uygulama açılışında `db.js:init()` eksik olanları ekler; **mevcut satır ve kolonlara dokunulmaz**, silme/yeniden
adlandırma/tip değişikliği yoktur. MySQL 8'de sona kolon ekleme anlık (instant) işlemdir.

| Tablo | Eklenen |
|---|---|
| `oneriler`, `kaizenler` | `red_nedeni`, `revize_notu`, `revize_atanan_id`, `revize_atanan_ad`, `revize_isteyen`, `revize_zamani`, `revize_tamamlandi` |
| `oneriler` | `gorev_atanan_id`, `gorev_atanan_ad`, `gorev_termin`, `gorev_notu`, `gorev_atayan`, `gorev_zamani`, `kaizen_no` |
| `kaizenler` | `kaynak_oneri_no` |
| `denetimler` | `revize_eden`, `revize_zamani` |
| yeni tablo | `isim_eslestirme` (elle isim birleştirme) |
| yeni tablo | `kontrol_kayitlari`, `kontrol_onaylari` (periyodik kontrol formu) |
| değişmeyen | `oneriler.form_no`, `kaizenler.form_no` kolonları ve değerleri yerinde kalır (artık yazılmaz/gösterilmez) |

**Eski yetkiler:** veritabanında `degerlendirme` kayıtlı ek yönetici otomatik olarak *Değerlendirme + Puanlama*,
`bes_s` kayıtlı olan *tüm 5S yetkileri + Denetmen hesapları*, (test ortamında verilmiş olabilecek) `tam` kayıtlı olan
*10 alanın tamamını* alır — yönetici hesapları ve işlem günlüğü hariç. Kayıt değişmez; yönetici bir kez
kaydedilince yeni anahtarlarla yazılır.

**Doğrulama:** Canlıdaki sürümün (`1d67cea`) ürettiği, isimleri tek kutudan farklı yazılışlarla girilmiş
veritabanı yeni kodla açıldı — 16 eski tablonun eski kolonları birebir aynı, puan toplamları aynı, eski hesaplarla
giriş ve tüm sayfalar çalışıyor (46/46); eski kod genişletilmiş veritabanında da çalışıyor (geri dönüş).
Uçtan uca test: **136/136**. Ayrıntı: [VERITABANI_GECIS.md](VERITABANI_GECIS.md) §6.

### Canlıya alma

Adım adım ve komutlarıyla: **[VERITABANI_GECIS.md](VERITABANI_GECIS.md) §4**. Özet:

1. **Yedek:** `mysqldump -u yalin -p yalin_uretim > yedek_oncesi.sql` + `data/` klasörünün kopyası.
1b. **Ön kontrol (salt-okunur):** yeni kodu ayrı klasöre indirip `npm ci` → `YALIN_DATA_DIR=<canlı data> npm run gecis-kontrol`.
2. **(Önerilir) Kopyada deneme:** dump'ı `yalin_test` veritabanına yükleyip yeni kodu
   `YALIN_DB_DATABASE=yalin_test` ile açın, sayfaları gezin.
3. **Güncelle:** `git pull` → `npm ci` → servisi yeniden başlat. Kod elle kopyalanıyorsa `data/` klasörünün
   üzerine yazmayın.
4. **İlk iş:** varsayılan yönetici şifresi kullanılıyorsa değiştirin; Yönetim › Yöneticiler'de ek yöneticilerin
   yetkilerini gözden geçirip kaydedin; Yönetim › Denetmenler'de görev/düzeltme atanacak kişilere denetmen hesabı
   açın; İsim Birleştirme önerilerini ve ödül eşiğini yeni geçenleri kontrol edin.
5. **Geri dönüş:** önceki sürüme dönüp yeniden başlatmak yeterli — eklenen kolonlar eski kodu bozmaz.
