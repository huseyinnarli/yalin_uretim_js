# Sürüm Notları

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
