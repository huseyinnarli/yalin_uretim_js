# Sürüm Notları

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
- **T-FR016 Periyodik Kontrol Formu** (Günlük/Haftalık/Aylık 5S ve Güvenlik): bölüm sayfasından açılır,
  bölümün ekip lideri doldurur; kontrol günü **Türkçe takvimden** seçilir (gün seçilince form açılır, ileri tarih
  seçilemez); uygun değil işaretlenen maddeye açıklama zorunlu, uygunsuzluklar formun altında listelenir
  (formdan aksiyon açılmaz); haftalık (grup lideri) ve aylık (bölüm sorumlusu) kontrol imzası. Herkes görüntüleyebilir.
- **Kontrol formu Excel'i:** ay seçilir, **o aya kadar doldurulmuş tüm aylar** tek dosyada iner — her ay kâğıt
  düzeninde ayrı sayfa, başta ÖZET (ay başına kontrol günü, uygun/uygun değil, uygunluk %, imzalı hafta, aylık imza)
  ve tüm ayların uygunsuzluk listesi.

**Form No kaldırıldı**
- Onaylanan öneri/kaizene artık `FR-YYYY-NNNN` form numarası **verilmez**; liste, detay, arama ve Excel'den çıkarıldı
  (öneri Excel'inde 2. sütun, kaizen Excel'inde "Form No" sütunu yok). Daha önce verilmiş numaralar veritabanında
  (`form_no` kolonu) **olduğu gibi durur**, yalnızca gösterilmez.

**Demo (tasarım önizleme)**
- `Dockerfile` + `scripts/demo-baslat.sh` + `scripts/demo-veri.js`: Render'da harici veritabanı olmadan, içinde geçici
  MariaDB ve örnek veriyle çalışan demo. Canlı kurulumu etkilemez (bkz. DAGITIM.md §11). Uygulama MariaDB 10.11'de
  de test edildi (133/133).

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
| yeni tablo | `kontrol_kayitlari`, `kontrol_onaylari` (T-FR016 formu) |
| değişmeyen | `oneriler.form_no`, `kaizenler.form_no` kolonları ve değerleri yerinde kalır (artık yazılmaz/gösterilmez) |

**Eski yetkiler:** veritabanında `degerlendirme` kayıtlı ek yönetici otomatik olarak *Değerlendirme + Puanlama*,
`bes_s` kayıtlı olan *tüm 5S yetkileri + Denetmen hesapları*, (test ortamında verilmiş olabilecek) `tam` kayıtlı olan
*10 alanın tamamını* alır — yönetici hesapları ve işlem günlüğü hariç. Kayıt değişmez; yönetici bir kez
kaydedilince yeni anahtarlarla yazılır.

**Doğrulama:** Eski sürümün oluşturduğu veritabanı yeni kodla açılarak denendi — eski kolonlardaki verinin
tamamı birebir aynı kaldı, puan listesi aynı çıktı, eski ek yönetici ve denetmen girişleri çalıştı.
Uçtan uca test: **133/133**.

### Canlıya alma

1. **Yedek:** `mysqldump -u yalin -p yalin_uretim > yedek_oncesi.sql` + `data/` klasörünün kopyası.
2. **(Önerilir) Kopyada deneme:** dump'ı `yalin_test` veritabanına yükleyip yeni kodu
   `YALIN_DB_DATABASE=yalin_test` ile açın, sayfaları gezin.
3. **Güncelle:** `git pull` → `npm ci` → servisi yeniden başlat. Kod elle kopyalanıyorsa `data/` klasörünün
   üzerine yazmayın.
4. **İlk iş:** Yönetim › Yöneticiler'de ek yöneticilerin yetkilerini gözden geçirip kaydedin; Yönetim ›
   Denetmenler'de görev/düzeltme atanacak kişilere denetmen hesabı açın.
5. **Geri dönüş:** önceki sürüme dönüp yeniden başlatmak yeterli — eklenen kolonlar eski kodu bozmaz.
