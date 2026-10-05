# Mimari ve Kod İnceleme Raporu

Tarih: 2026-07-10 · Kapsam: tüm kaynak kod (3.228 satır JS + 22 EJS şablonu) + bağımlılıklar
· Test durumu: `npm test` → **34/34 başarılı** (uçtan uca, izole veritabanı)

İlgili dokümanlar: [README.md](README.md) (kullanım) · [TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md)
(iç işleyiş referansı) · [DAGITIM.md](DAGITIM.md) (sunucuda devreye alma rehberi)

---

> **Ekim 2026 notu:** Bu rapor 10 Temmuz 2026 tarihlidir; satır sayıları ve test sayısı (bugün 122) eskidir.
> O tarihten beri yapılanlar: işlem günlüğü (Ö3-b), öneri/kaizen listesi sayfalaması (Ö2'nin bir kısmı),
> rol/yetki modelinin ayrıntılandırılması — bkz. [DEGISIKLIKLER.md](DEGISIKLIKLER.md).

## 1. Yönetici Özeti

Uygulama; Öneri, Kaizen ve 5S denetim süreçlerini tek yerde yöneten, puanları personel ödül
sistemine dönüştüren bir fabrika içi web uygulamasıdır. **Node.js + Express + MySQL 8** üzerine
katmanlı bir mimariyle kurulmuştur; arayüz sunucu tarafında render edilir (EJS), dış CDN
bağımlılığı yoktur.

**Karar:** Kod tabanı üretim kullanımına hazırdır. İlk incelemede tespit edilen yüksek ve orta
öncelikli bulguların tamamı (open redirect, yükleme DoS'u, HTTPS/proxy desteği, görsel
işleme/EXIF, yedek kapsamı, transaction bütünlüğü, bellek büyümesi, test eksikliği) kapatılmış
ve düzeltmeler otomatik test paketiyle güvence altına alınmıştır. Açık kalanlar bilinçli
tasarım kabulleri ve orta/uzun vadeli iyileştirme fırsatlarıdır (bkz. §5).

---

## 2. Mimari İnceleme

### 2.1 Katmanlı yapı

Bağımlılık yönü tek taraflıdır, döngü yoktur:

```
sabitler.js → puanlama.js → db.js → cekirdek.js → web.js → rotalar/* → server.js
   (saf)        (saf)      (MySQL)  (iş mantığı)  (middleware)  (HTTP)   (kurulum)
```

**Değerlendirme — güçlü yönler:**
- Saf modüller (sabitler, puanlama) IO'suz; kurallar tek yerde, test edilebilir.
- `cekirdek.js` Express'e bağımlı değildir — oturumu parametre alır
  (`aktifDenetmen(session)`); iş mantığı web çatısından bağımsız çalıştırılabilir.
- Veri erişimi tek kapıdan geçer (`db.js`: `sorgu/tek/calistir/transaction`); SQL tamamen
  parametrelidir, satır↔nesne dönüşümü tek yerde yapılır.
- Rotalar `register(app)` deseniyle modülerdir; async hatalar `sar()` sarıcısıyla merkezî
  hata işleyiciye düşer (Express 4'ün bilinen async boşluğu kapatılmıştır).

### 2.2 Kod yapısı ve boyutlar

| Dosya | Satır | Sorumluluk | Değerlendirme |
|---|---|---|---|
| `src/cekirdek.js` | 728 | Tüm iş mantığı | ⚠ Büyümeye devam ederse bölünmeli (bkz. Ö7) |
| `src/rotalar/bes_s.js` | 553 | 27 5S rotası | Kabul edilebilir — rota başına ~20 satır |
| `src/db.js` | 240 | Havuz + şema + migrasyon + yedek | İyi |
| `src/excel.js` | 232 | 8 Excel raporu | İyi — tekrar eden stil yardımcılara alınmış |
| `src/rotalar/admin.js` | 225 | Giriş + panel + değerlendirme | İyi |
| `src/puanlama.js` | 227 | Rubrik + 5S form soruları/kuralları (çoğu veri) | İyi |
| `src/web.js` | 132 | Middleware'ler | İyi |
| diğer rotalar + sabitler + server | ~380 | — | İyi |
| `scripts/` | 508 | e2e test + 2 veri aktarımı | İyi |

22 EJS şablonu; tekrar eden bloklar partial'lardadır (`odul_siralama`, `aksiyon_kart`,
header/footer). Adlandırma tutarlıdır (Türkçe alan/fonksiyon adları, eski sistemle birebir).

### 2.3 İstek yaşam döngüsü

Güvenlik başlıkları → statik → gövde çözümleme (urlencoded 1 MB; multipart yalnızca 4 dosya
rotasında, uca özel sınırla) → imzalı çerez oturumu → ortak şablon değişkenleri + CSRF üretimi
→ CSRF doğrulama → yetki (`adminRequired`/`denetciRequired`) → iş mantığı → render/redirect →
404/500 yakalayıcı. Sıralama doğrudur; kritik ayrıntı: dosya kabul etmeyen uçlara multipart
gönderim daha kapıda reddedilir, bu sayede CSRF kontrolü gövde-çözümleme sırası üzerinden
atlatılamaz.

### 2.4 Veri modeli

14 tablo, InnoDB, `utf8mb4_turkish_ci`. Öne çıkan kararlar ve değerlendirmesi:

| Karar | Değerlendirme |
|---|---|
| Liste/nesne alanları TEXT içinde JSON (`uyeler`, `puanlar`, `fotolar`…) | ✔ Eski şemayla uyum, az join; ✖ bu alanlarda SQL sorgusu/bütünlük yok — mevcut kullanım için doğru ödünleşim |
| `odul_kayitlari` = kişi 5S puanlarının **tek kaynağı** | ✔ Denetim silinince puanın otomatik geri alınması bu tasarımın doğrudan sonucu — en kritik iş kuralı sağlam |
| `denetimler.tarih` = tur kimliği | ✔ Basit; aynı tarihli ikinci tur uygulama kuralıyla engellenir |
| Numara üretimi `sayaclar` tablosunda atomik sayaç | ✔ Eşzamanlı gönderimde mükerrer numara imkânsız; aktarım sonrası otomatik tohumlama var |
| 5S formu = şirket şablonu, **kural tabanlı puanlama** | ✔ Sorular + kesme kuralları tek yerde (`puanlama.js`); denetmen bulgu sayısı girer, puan kuraldan hesaplanır (sunucu bağlayıcı); bulgu sayıları `bulgular` kolonunda saklanır |
| FK bildirimi yok | ⚠ Yetim kayıt temizliği kod tarafında (transaction içinde) — çalışıyor, ama şema güvencesi yok (Ö4) |

---

## 3. Güvenlik Durumu

| Katman | Durum |
|---|---|
| SQL enjeksiyonu | Parametreli sorgular; dinamik tanımlayıcılar yalnızca koddan ✅ |
| XSS | EJS otomatik kaçış; `<%- %>` yalnızca kod-üretimi içerikte ✅ |
| CSRF | Oturum token'ı, tüm POST'larda; multipart bypass'ı kapalı ✅ |
| Kimlik | pbkdf2 600k (werkzeug uyumlu), `timingSafeEqual`, brute-force limiti ✅ |
| Open redirect | `//host` dahil reddedilir (testli) ✅ |
| Dosya yükleme | Rota-bazlı multer, uca özel adet + 8 MB sınırı, imza kontrolü, **sharp ile yeniden kodlama** (EXIF/GPS temizliği, 1600px) ✅ |
| Dosya servisi | Path-traversal korumalı; `data/` statik servis edilmez ✅ |
| Başlıklar/çerez | CSP, nosniff, XFO DENY; HttpOnly + SameSite=Lax; `https` bayrağıyla Secure + HSTS ✅ |
| Veritabanı | Yalnızca 127.0.0.1 dinler; uygulama kullanıcısı tek şemaya yetkili ✅ |
| Yedek | 6 saatte bir ZIP (tablolar + görseller), yönlendirilebilir klasör, son 15 ✅ |

---

## 4. Kapatılmış Bulgular (geçmiş kayıt)

İlk incelemede (2026-07-08) raporlanan R1–R9 bulgularından yüksek/orta öncelikli olanların
tamamı kapatıldı: R1 open redirect · R2 yükleme bellek DoS'u · R3 HTTPS/proxy bayrakları ·
R4 görsel işleme (sharp) · R5 yedek kapsamı/konumu · R6 transaction bütünlüğü ·
R7 hız-limit bellek süpürmesi · R9 otomatik test paketi. Ayrıntılar git geçmişinde
(commit mesajları) ve `scripts/e2e-test.js` kapsamındadır.

---

## 5. Açık Konular ve İyileştirme Önerileri

Öncelik: 🟡 orta vadede önerilir · ⚪ isteğe bağlı / koşula bağlı

### 🟡 Ö1 — CSP'de `'unsafe-inline'` script izni
Şablonlardaki satır içi `<script>` blokları (sekme geçişi, canlı puan hesabı vb.) nedeniyle
CSP `script-src 'unsafe-inline'` içerir; XSS savunmasının son katmanı zayıf kalır (ilk katman
olan EJS kaçışı sağlamdır). **Öneri:** ~6 şablondaki inline JS'i `static/` altında dosyalara
taşıyıp `script-src 'self'`e sertleştirmek. Efor: ~yarım gün.

### 🟡 Ö2 — `/liste` sayfalama + ağır Excel işleri
Birleşik liste tüm kayıtları tek sayfada render eder; kayıt sayısı binleri bulunca sayfa
büyür ve sorgu maliyeti artar. Görsel gömülü kaizen Excel'i CPU'yu istek süresince tutar
(Node tek iş parçacığı — bu sırada diğer istekler bekler). **Öneri:** sayfalama (LIMIT/OFFSET
+ sayfa bağlantıları) ve/veya Excel üretimini `worker_threads`'e almak. Efor: ~1 gün.
Tetikleyici: kayıt sayısı ≳ 2.000 veya eşzamanlı kullanıcı ≳ 50.

### 🟡 Ö3 — İşletim görünürlüğü: loglama + sağlık ucu
Uygulama yalnızca hataları konsola yazar; kim ne zaman ne yaptı (özellikle yönetici silme /
ödül işleme) kayıt altında değildir ve izleme sistemleri için bir sağlık ucu yoktur.
**Öneri:** (a) `pino` ile yapılandırılmış istek/hata logu + günlük dosya rotasyonu,
(b) yönetici eylemleri için `islem_gunlugu` tablosu (kim/ne/ne zaman), (c) `GET /saglik`
ucu (DB ping + sürüm) — izleme ve yük dengeleyici kontrolleri için. Efor: ~1 gün.

### 🟡 Ö4 — Şema düzeyinde FOREIGN KEY
`bolum_id`/`denetim_id` ilişkileri FK olarak bildirilmemiştir; bütünlük kod disiplinine
emanettir (bugün doğru işliyor). **Öneri:** `ON DELETE CASCADE/SET NULL` kararlarıyla FK'lı
bir migrasyon; mevcut verideki olası yetimler önce temizlenmeli. Efor: ~yarım gün.

### 🟡 Ö5 — Sürekli entegrasyon (CI)
Test paketi var ama otomatik çalışmıyor. **Öneri:** GitHub Actions iş akışı — push'ta
MySQL servisli bir job'da `npm ci && npm test` + `node --check`. Regresyonlar push anında
yakalanır. Efor: ~2 saat.

### ⚪ Ö6 — Kimlik modeli (bilinçli kabul)
"Şifre = kimlik" modeli (kullanıcı adı yok) kolay kullanım için bilinçli tercihtir; zayıf bir
denetmen şifresi o kimliği verir. Mevcut hafifletmeler: 6+ karakter, benzersizlik kontrolü,
brute-force limiti. İnternete açık ve çok kullanıcılı bir senaryoya gidilirse kullanıcı
adı + şifre modeline geçiş düşünülmelidir.

### ⚪ Ö7 — `cekirdek.js`'in bölünmesi
728 satır — bugün yönetilebilir, ancak büyümeye devam ederse `kimlik.js` (şifre/denetmen),
`kayitlar.js` (öneri/kaizen/puan durumu), `bes_s.js` (5S motoru) olarak üçe bölmek isabetli
olur. Dışa açılan API aynı kalacağı için rotalara dokunmadan yapılabilir.

### ⚪ Ö8 — Küçük kalemler
- **exceljs → uuid** zinciri `npm audit`te 2 "orta" bulgu üretir; pratik istismar yolu yok,
  exceljs'in yeni sürümü çıkınca güncellenmeli. `npm audit fix --force` ÇALIŞTIRMAYIN
  (exceljs'i 3.4'e düşürür).
- Oturum imza anahtarı ve şifre hash'leri aynı veritabanındadır; MySQL kullanıcı yetkileri ve
  sunucu erişimi bu yüzden önemlidir (bkz. DAGITIM.md sertleştirme).
- `data/db-config.json` düz metin DB şifresi içerir (git dışında; dosya sistemi izinlerine
  emanet). İstenirse ortam değişkenine taşınabilir.
- ESLint + `npm run lint` eklenmesi stil/hata yakalamayı otomatikleştirir. Efor: ~1 saat.

## 6. Önerilen Sıra

| Sıra | İş | Efor | Ne zaman |
|---|---|---|---|
| 1 | Ö5 CI (GitHub Actions'ta `npm test`) | ~2 saat | İlk fırsatta |
| 2 | Ö3 loglama + işlem günlüğü + `/saglik` | ~1 gün | Devreye almayla birlikte |
| 3 | Ö1 inline JS → dosya + CSP sertleştirme | ~yarım gün | Orta vade |
| 4 | Ö4 FK migrasyonu | ~yarım gün | Orta vade |
| 5 | Ö2 sayfalama + Excel worker | ~1 gün | Veri/kullanıcı artınca |
| 6 | Ö7 cekirdek bölünmesi · Ö8 kalemleri | değişken | Fırsat buldukça |
