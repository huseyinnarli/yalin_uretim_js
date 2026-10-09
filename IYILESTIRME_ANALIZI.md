# Mimari ve Güvenlik Raporu

Tarih: 05.10.2026 · Kapsam: tüm kaynak kod (4.818 satır JS, 29 EJS şablonu) + bağımlılıklar ·
Test: `npm test` **136/136**, eski veritabanıyla geçiş doğrulaması **46/46** · Önceki rapor: 10.07.2026 (34 test).

İlgili: [GELISTIRME_RAPORU.md](GELISTIRME_RAPORU.md) (bu sürümde ne eklendi/değişti) ·
[VERITABANI_GECIS.md](VERITABANI_GECIS.md) (canlıya alma) · [TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md) (iç işleyiş) ·
[DAGITIM.md](DAGITIM.md) (sunucu kurulumu, sertleştirme).

---

## 1. Yönetici özeti

Uygulama katmanlı, test edilmiş ve canlıya alınabilir durumdadır. Bu incelemede çekirdek iş mantığı alan
modüllerine bölündü, §4'teki bulgular (B1–B10) kapatıldı ve bağımlılıklardaki 2 yüksek + 4 orta açık giderildi.

Canlıya almadan önce veya hemen sonra yapılması gerekenler:

| Öncelik | Konu | Neden | Efor |
|---|---|---|---|
| 🔴 | GitHub deposunu **gizli** yapın; canlıda varsayılan yönetici şifresinin değiştirildiğini doğrulayın (Ö9) | Depo şu an **herkese açık**: kod, varsayılan şifre ve iç yapı herkes tarafından okunabilir. Eski sürümün herkese açık kılavuz sayfası da varsayılan şifreyi yazıyordu. | 5 dk |
| 🟠 | Giriş sırasında tüm hesap şifrelerinin taranması (Ö10) | Her hatalı girişte hesap başına ~0,28 sn işlemci; bu sırada sunucu başka isteğe cevap veremez. 15 kişilik komite hesabı eklenirse belirginleşir. | ~1 saat (hızlı çözüm) |
| 🟠 | Oturum: çıkışın GET ile yapılması, şifre değişince eski oturumların düşmemesi (Ö12) | Düşük etkili ama ucuz düzeltmeler | ~2 saat |

---

## 2. Mimari

### 2.1 Katmanlar

```
saf modüller   sabitler · isim · yetkiler · kontrol · puanlama        (IO yok)
      ↓
db.js          MySQL havuzu · şema + EK_KOLONLAR (tek kaynak) · satır↔nesne · yedek
      ↓
servis/*       12 iş modülü, 5 katman (aşağıdaki modül yalnız alttakine dayanır)
      ↓
cekirdek.js    cephe — servisleri tek nesnede toplar; aynı adın iki kez tanımlanmasına izin vermez
      ↓
web.js         HTTP katmanı: sar · flash + işlem günlüğü · CSRF · güvenlik başlıkları · hız limiti ·
               dosya yükleme · yetki middleware'leri · Excel/ZIP yanıtları
      ↓
rotalar/*      genel · oneri · kaizen · bes_s · kontrol · admin   (register(app) deseni)
      ↓
server.js      kurulum (oturum, statik, rota kaydı, 404/500)
```

Bağımlılık yönü tek taraflıdır, döngü yoktur. Servis katmanları: **0** guvenlik, yardimci, gunluk → **1** kayitlar,
bes → **2** hesaplar, kontrolFormu → **3** isimler, aksiyon → **4** puan, gorevler, panel.

### 2.2 Boyutlar

| Dosya | Satır | Değerlendirme |
|---|---|---|
| `src/servis/*` (12 modül) | 24–300 | ✔ Her modül tek alan; en büyüğü `bes.js` (5S motoru) |
| `src/cekirdek.js` | 35 | ✔ Yalnız cephe (önce 1.218 satırdı) |
| `src/rotalar/bes_s.js` | 688 | ⚠ 5S'in plan, denetim, aksiyon, ödül ve görsel uçları bir arada — bölünebilir (Ö13) |
| `src/rotalar/admin.js` | 440 | ⚠ Giriş, hesaplar ve değerlendirme aynı dosyada — bölünebilir (Ö13) |
| `src/excel.js` | 408 | ✔ 9 rapor, ortak stil yardımcıları |
| `src/db.js` | 356 | ✔ Şema, bildirimsel kolon ekleme listesi, yedek |
| `src/web.js` | 262 | ✔ HTTP yardımcıları |
| `src/puanlama.js` | 265 | ✔ Çoğu veri (rubrik + 5S formu) |
| `scripts/e2e-test.js` | 692 | ⚠ Tek dosya; alanlara bölünmesi ve saf modüllere birim testi önerilir (Ö13) |

### 2.3 Clean code değerlendirmesi

**Güçlü yönler**
- **Katman disiplini:** iş kuralları Express'ten bağımsızdır (oturum/yetki parametre alınır); rotalar ince kalır.
- **Saf çekirdek kurallar:** isim karşılaştırma, yetki açılımı, kontrol formu takvimi, 5S puan kuralları IO'suz,
  bağımsız denenebilir.
- **Tek kapıdan veri erişimi:** `sorgu/tek/calistir/transaction`; tüm SQL parametreli; dinamik tablo/kolon adları
  yalnız koddan gelir (bkz. §3).
- **Tek kaynak şema:** yeni kolonlar `EK_KOLONLAR` listesinde; uygulama ve geçiş ön kontrol aracı aynı listeyi kullanır.
- **Çift katman yetki:** her yetkili eylem hem rotada middleware ile hem şablonda `yetki()` ile korunur; testli.
- **Ölü kod yok:** kullanılmayan fonksiyon/içe aktarma taraması bu incelemede temizlendi.
- **Davranışı değiştirmeyen yeniden düzenleme:** bölünen 98 fonksiyonun gövdesi eskisiyle karakter karakter aynı.

**Zayıf yönler (öneriler §5)**
- İki büyük rota dosyası (`bes_s.js`, `admin.js`).
- Adlandırma karışık: çoğunluk Türkçe (`puanDurumu`, `kontrolKaydet`), eski kısım İngilizce (`getRecord`, `loadBolumler`, `hashPassword`).
- 10 şablonda satır içi `<script>` (CSP'de `'unsafe-inline'` zorunlu kalıyor).
- Lint/biçimlendirici ve CI yok; tip denetimi yok.
- Liste alanları TEXT içinde JSON; şemada yabancı anahtar (FK) yok.

### 2.4 İstek yaşam döngüsü
Güvenlik başlıkları → statik → gövde çözümleme (urlencoded 1 MB; multipart yalnız 5 dosya ucunda) → imzalı çerez
oturumu → ortak şablon değişkenleri + yetki çözümü (her istekte veritabanından taze) → CSRF → rota middleware'i
(giriş/yetki) → iş mantığı → render/yönlendirme → 404/500. Dosya kabul etmeyen uçlara multipart daha kapıda
reddedilir; böylece CSRF denetimi gövde çözümleme sırası üzerinden atlatılamaz.

### 2.5 Veri modeli
19 tablo, InnoDB, `utf8mb4_turkish_ci`. Bu sürümde 3 tablo ve 26 kolon eklendi; hiçbir kolon silinmedi/değişmedi.

| Karar | Değerlendirme |
|---|---|
| Şema değişiklikleri yalnız ekleme (`CREATE IF NOT EXISTS` + `EK_KOLONLAR`) | ✔ Eski sürüme dönüş veri kaybı olmadan mümkün (denendi) |
| İsimler tek alanda tam ad; karşılaştırma anahtarla | ✔ Eski veriyle tam uyum; ✖ aynı ad-soyadlı iki kişi ayrılamaz (Ö11) |
| `odul_kayitlari` = kişi 5S puanlarının tek kaynağı | ✔ Denetim silinince puan kendiliğinden düşer |
| Numara üretimi atomik sayaç (`sayaclar`) | ✔ Eşzamanlı gönderimde mükerrer numara yok |
| Liste alanları JSON (TEXT) | ✔ Az join; ✖ bu alanlarda SQL sorgusu/bütünlük yok |
| FK bildirimi yok | ⚠ Bütünlük kod tarafında, transaction içinde (Ö4) |

---

## 3. Güvenlik durumu

| Katman | Durum |
|---|---|
| SQL enjeksiyonu | ✅ Parametreli sorgular. Dinamik tanımlayıcılar yalnız koddaki sabit listelerden; arşivden geri yüklemede kolonlar tablonun gerçek kolonlarıyla sınırlı |
| XSS | ✅ EJS otomatik kaçış. `<%-` yalnız `include` ve koddan üretilen sayısal içerikte; kullanıcı verisi geçen ham HTML üretimi kaldırıldı |
| CSRF | ✅ Oturum belirteci tüm POST'larda, sabit zamanlı karşılaştırma; multipart atlatma kapısı kapalı. ⚠ Çıkış GET ile (Ö12) |
| Kimlik doğrulama | ✅ pbkdf2-sha256 600.000 tur (werkzeug uyumlu), `timingSafeEqual`, IP başına 10 dakikada 8 hatalı deneme sınırı. ⚠ Şifre=kimlik taraması (Ö10) |
| Yetkilendirme | ✅ 10 ayrıntılı alan; ek yönetici hesapları ve işlem günlüğü yalnız ana yöneticide; rota + şablon çift katman; e2e'de yetki matrisi testli |
| Oturum | ✅ İmzalı çerez, HttpOnly, SameSite=Lax, 12 saat; `https` bayrağıyla Secure + HSTS. Silinen hesabın oturumu bir sonraki istekte düşer. ⚠ Şifre değişiminde diğer oturumlar düşmez (Ö12) |
| Açık yönlendirme | ✅ `//host`, `/\host` ve dizi parametresi reddedilir (testli) |
| Dosya yükleme | ✅ Uca özel multer sınırı (adet + 8 MB), dosya imzası kontrolü, sharp ile yeniden kodlama (EXIF/GPS temizliği), giriş kontrolü yüklemeden önce |
| Dosya servisi | ✅ Yol geçişi korumalı; kaizen görselleri girişe kapalı; 5S fotoğrafları (5S sonuçları gibi) herkese açık; `data/` statik servis edilmez |
| Başlıklar | ✅ CSP, nosniff, X-Frame-Options DENY, Referrer-Policy. ⚠ CSP'de `script-src 'unsafe-inline'` (Ö1) |
| Bağımlılıklar | ✅ `npm audit`: yüksek 0. ⚠ 2 orta (exceljs → uuid; uygulamanın kullanmadığı tampon parametresi yolu) |
| Gizli bilgiler | ✅ Depoda veri/şifre yok (`data/` git dışında, geçmiş tarandı). ⚠ **Depo herkese açık**, varsayılan şifre kodda (Ö9) |
| Yedek | ✅ 6 saatte bir ZIP (tablolar + görseller), son 15. ⚠ Yedekte şifre hash'leri var — klasör izinleri (Ö8) |
| Denetim izi | ✅ Yönetici/denetmen başarılı işlemleri işlem günlüğüne (kim, ne, ne zaman, IP) |

---

## 4. Kapatılan bulgular

**Bu incelemede (Ekim 2026)**

| # | Bulgu | Düzeltme |
|---|---|---|
| B1 | Giriş sonrası `?next=/\site.com` kabul ediliyordu (bazı tarayıcılarda başka siteye gider) | Ortak `guvenliYol`; test |
| B2 | `?next=` iki kez verilince 500 hatası | Dizi reddedilir; test |
| B3 | Herkese açık kılavuz varsayılan yönetici şifresini yazıyordu | Kaldırıldı; ön kontrol aracı varsayılan şifreyi yakalar |
| B4 | Arşivden geri yüklemede kolon adları arşiv JSON'undan | Tablonun gerçek kolonlarıyla sınırlandı |
| B5 | CSRF belirteci `!==` ile karşılaştırılıyordu | `timingSafeEqual` |
| B6 | Denetmen seçenekleri elle kaçışlanan HTML dizgisiyle | EJS otomatik kaçışlı partial |
| B7 | `npm audit`: 2 yüksek (sharp/libheif, brace-expansion) + 4 orta (express, body-parser, qs, mysql2) | `npm audit fix` (kırıcı değişiklik yok): sharp 0.35.5, express 4.22.3, mysql2 3.24.5; ayrıca multer 1.x → 2.4.0 (1.x dalının bilinen çok parçalı form DoS düzeltmeleri) |
| B8 | Ek yöneticiye "tam yetki" ile yönetici yönetimi verilebiliyordu | Kaldırıldı; yalnız ana yönetici |
| B9 | Üst menü her istekte `static/` klasörünü tarıyordu | 5 dakikalık önbellek |
| B10 | Puan listesi, ödül alanlar ve 5S sonuç satırlarında kişi/bölüm adı `onsubmit="confirm('…ad…')"` içine yazılıyordu: herkese açık öneri formundan tırnaklı bir isim girilirse, yönetici "Ödül Ver"e bastığında tarayıcısında kod çalışabilirdi (saklı XSS) | Ad `data-onay` özniteliğine taşındı, `confirm(this.dataset.onay)`; test (9 Ekim) |

**Önceki incelemelerde:** R1 açık yönlendirme · R2 yükleme bellek DoS'u · R3 HTTPS/proxy bayrakları · R4 görsel
işleme · R5 yedek kapsamı · R6 transaction bütünlüğü · R7 hız-limit bellek süpürmesi · R9 otomatik test ·
Ö2 (liste sayfalaması kısmı) · Ö3-b (işlem günlüğü) · Ö7 (çekirdeğin bölünmesi — bu incelemede).

---

## 5. Açık konular ve iyileştirme önerileri

Öncelik: 🔴 hemen · 🟠 kısa vadede · 🟡 orta vadede · ⚪ isteğe bağlı

### 🔴 Ö9 — Herkese açık depo ve varsayılan şifre
GitHub deposu **public**. Gizli bilgi yok (taranmıştır), ama varsayılan yönetici şifresi `admin123` kodda ve
dokümanda yazıyor; eski sürümün herkese açık "Kullanım Kılavuzu" sayfası da bu şifreyi gösteriyordu.
**Öneri:** (1) Depoyu GitHub › Settings › General › Danger Zone › *Change visibility* ile **Private** yapın.
(2) Canlıda `npm run gecis-kontrol` çalıştırın; "VARSAYILAN ŞİFRE" uyarısı varsa hemen değiştirin.
(3) Kalıcı çözüm: varsayılan şifreyle girişte şifre değiştirmeden başka sayfaya geçilememesi (zorunlu değişim). Efor: ~1 saat.

### 🟠 Ö10 — Giriş: "şifre = kimlik" taraması
Kullanıcı adı olmadığı için giriş, şifreyi sırayla ana yönetici → tüm ek yöneticiler → tüm denetmenlerin hash'iyle
dener. Bir doğrulama ~0,28 sn sürer ve `pbkdf2Sync` olduğu için **o sırada sunucu başka hiçbir isteğe cevap
vermez**. 20 hesapta hatalı bir giriş ~5,5 sn kilitlenme demektir; farklı IP'lerden gelen denemeler sunucuyu
yavaşlatabilir. Komite için 15 hesap eklenmesi bu durumu belirginleştirir.
**Öneri:** (a) Hızlı: `crypto.pbkdf2` (asenkron) — sunucu kilitlenmez, ~1 saat. (b) Kalıcı: girişte önce kişi
seçimi (veya kullanıcı adı), sonra yalnız o hesabın şifresi — tarama tamamen kalkar, hesap bazlı kilitleme
mümkün olur, şifrelerin benzersiz olma zorunluluğu da kalkar. ~yarım gün.

### 🟠 Ö12 — Oturum düzeltmeleri
- Çıkış `GET /yonetici/cikis`: başka bir sitedeki bir resim etiketi kullanıcının oturumunu kapatabilir (yalnız
  rahatsızlık). **Öneri:** POST + CSRF.
- Şifre değiştirilince o hesabın açık oturumları 12 saat geçerli kalır. **Öneri:** hesaba `oturum_surumu` kolonu;
  şifre değişince artar, oturumdaki sürüm eşleşmezse oturum düşer.
- Yalnız mutlak süre (12 saat) var; **öneri:** paylaşılan fabrika bilgisayarları için 30–60 dk hareketsizlik süresi.
Efor: ~2 saat.

### 🟡 Ö1 — CSP'de `'unsafe-inline'`
10 şablonda satır içi script var (takvim davranışı, canlı puan hesabı, sekme geçişi, grafik etkileşimi vb.).
**Öneri:** `static/js/*.js` dosyalarına taşıyıp `script-src 'self'`. EJS kaçışı ilk savunma hattı olarak sağlam;
bu, son hattı güçlendirir. Efor: ~yarım gün.

### 🟡 Ö5 — Sürekli entegrasyon (CI)
**Öneri:** GitHub Actions — her push'ta MySQL servisli işte `npm ci`, `node --check`, `npm test`, `npm audit
--audit-level=high`. Bu incelemede yapılan türden yeniden düzenlemeler (fonksiyon taşıma) CI ile güvenle sürdürülür.
Efor: ~2 saat.

### 🟡 Ö13 — Kod düzeninin sürdürülmesi
- `rotalar/bes_s.js` → `bes_plan.js`, `bes_denetim.js`, `bes_aksiyon.js`, `bes_odul.js`;
  `rotalar/admin.js` → `giris.js`, `hesaplar.js`, `degerlendirme.js` (servis bölünmesiyle aynı yöntem: taşı + karşılaştır + test).
- Adlandırmayı Türkçede birleştirmek (`getRecord` → `kayitGetir` vb.) — kademeli, cephe üzerinden takma adla.
- ESLint + Prettier (`npm run lint`), `// @ts-check` + JSDoc ile tip denetimi.
- e2e testini alanlara bölmek; saf modüllere (`isim`, `yetkiler`, `kontrol`, `puanlama`) birim testi.
Efor: 1–2 gün, parça parça.

### 🟡 Ö4 — Şema düzeyinde FOREIGN KEY
`bolum_id`/`denetim_id` ilişkileri bildirilmemiş; bütünlük kodda. **Öneri:** önce yetim kayıt raporu, sonra
`ON DELETE` kararlarıyla FK migrasyonu. Efor: ~yarım gün.

### 🟡 Ö2 — Ağır Excel işleri
Liste sayfalaması yapıldı. Görsel gömülü kaizen Excel'i istek boyunca işlemciyi tutar. **Öneri:** `worker_threads`.
Tetikleyici: kayıt ≳ 2.000 veya eşzamanlı kullanıcı ≳ 50.

### 🟡 Ö3 — İşletim görünürlüğü
İşlem günlüğü yapıldı. Kalan: yapılandırılmış istek/hata logu (dosya rotasyonlu) ve `GET /saglik` (veritabanı
ping + sürüm) — izleme için. Efor: ~yarım gün.

### ⚪ Ö11 — Kişi kimliği (sicil numarası)
İsim kişinin tek kimliği; yazım farkları anahtarla çözülüyor ama **aynı ad-soyadlı iki çalışan ayrılamaz**.
Ödüller paraya döndüğü için orta vadede formlara isteğe bağlı sicil no alanı ve puanın sicil bazlı toplanması önerilir.

### ⚪ Ö8 — Küçük kalemler
- exceljs → uuid orta uyarısı: exceljs yeni sürüm çıkınca güncelleyin; `npm audit fix --force` **çalıştırmayın**
  (exceljs'i 3.4'e düşürür).
- Otomatik yedekler (`data/_yedek_otomatik`) şifre hash'lerini içerir; klasör yalnız uygulama kullanıcısınca okunmalı.
- `data/db-config.json` düz metin veritabanı şifresi içerir (git dışında); istenirse ortam değişkenine taşınabilir.
- Hız limiti bellekte tutulur; tek süreçli kurulumda doğru, birden çok süreçte paylaşılan depo gerekir.
- Karar bekliyor: denetim ZIP/Excel dosya adındaki tarih (tur tarihi mi, gerçekleşme tarihi mi).

---

## 6. Önerilen sıra

| Sıra | İş | Efor | Ne zaman |
|---|---|---|---|
| 1 | Ö9 depoyu gizli yapma + varsayılan şifre kontrolü | 5 dk | Canlıya almadan önce |
| 2 | Ö10-a asenkron şifre doğrulama | ~1 saat | Komite hesapları açılmadan önce |
| 3 | Ö12 oturum düzeltmeleri · Ö9-3 zorunlu şifre değişimi | ~3 saat | İlk ay |
| 4 | Ö5 CI | ~2 saat | İlk ay |
| 5 | Ö1 inline script → dosya + CSP | ~yarım gün | Orta vade |
| 6 | Ö13 rota dosyalarının bölünmesi, lint, birim testleri | 1–2 gün | Fırsat buldukça |
| 7 | Ö10-b kullanıcı seçimli giriş · Ö11 sicil no | ~1 gün | Hesap/kişi sayısı arttıkça |
| 8 | Ö4 FK · Ö2 Excel worker · Ö3 log + sağlık ucu | değişken | İhtiyaç oldukça |
