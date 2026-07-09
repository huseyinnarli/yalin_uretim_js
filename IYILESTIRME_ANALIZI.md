# Kod İnceleme Raporu — İyileştirmeler ve Riskler

Tarih: 2026-07-08 · Kapsam: tüm kaynak kod + bağımlılık denetimi (`npm audit`)
Güncelleme: 2026-07-10 — Yüksek ve orta öncelikli TÜM bulgular **kapatıldı**
(R1, R2, R3, R4, R5, R6, R7, R9).

**Özet karar:** Mimari sağlam ve katmanlı; güvenlik temelleri (CSRF, hash'li şifreler,
parametreli SQL, path-traversal koruması, görsel yeniden kodlama) yerinde. Fabrika içi ağda
(LAN) kullanım için **hazır**; internete açılırken `https`/`proxy` bayraklarını etkinleştirmek
yeterlidir. Açık kalanlar yalnızca düşük öncelikli notlar ve bilinçli tasarım kabulleridir
(R8, R10–R17).

## Bulgu Özeti

| No | Bulgu | Önem | Durum |
|---|---|---|---|
| R1 | Open redirect (`next` parametresi `//host` biçimini kabul ediyordu) | Yüksek | ✅ **Düzeltildi** (2026-07-09, e2e testte doğrulanıyor) |
| R2 | Dosya yükleme bellek sınırı çok genişti (istek başına ~1,1 GB olasılığı) | Yüksek | ✅ **Düzeltildi** (2026-07-09, rota-bazlı multer + uca özel sınırlar) |
| R3 | HTTPS/reverse-proxy desteği yoktu (secure cookie, trust proxy, HSTS) | Yüksek | ✅ **Düzeltildi** (2026-07-09, `https`/`proxy` yapılandırma bayrakları) |
| R4 | Görseller yeniden işlenmiyordu (küçültme/EXIF temizliği yoktu) | Orta | ✅ **Düzeltildi** (2026-07-10, sharp ile yeniden kodlama) |
| R5 | Yedek kapsamı: görseller hariçti, yedekler aynı diskteydi | Orta | ✅ **Düzeltildi** (2026-07-10, ZIP + görseller + yönlendirilebilir klasör) |
| R6 | Çok adımlı bazı yazmalar transaction dışındaydı | Orta | ✅ **Düzeltildi** (ödül işleme, denetim/bölüm silme, plan oluşturma `transaction()` içinde) |
| R7 | Bellek içi hız-limit tabloları sınırsız büyüyordu | Orta | ✅ **Düzeltildi** (saatlik süpürme zamanlayıcısı) |
| R8 | `npm audit`: 2 orta bulgu (exceljs → uuid zinciri) | Düşük | İzleniyor |
| R9 | Depoda otomatik test paketi yoktu | Orta | ✅ **Düzeltildi** (`npm test` — 24 adımlı e2e, izole veritabanı) |
| R10–R17 | Bilinçli tasarım kabulleri / düşük öncelikli notlar | Düşük | — |

---

## Yüksek Öncelik

### R1 — Open redirect ✅ DÜZELTİLDİ (2026-07-09)
`src/rotalar/admin.js` girişteki `next` parametresini yalnızca `startsWith("/")` ile
doğruluyordu; `//saldirgan.com` gibi protokol-göreli adresler geçebiliyordu. Doğrulama
`startsWith("/") && !startsWith("//")` olarak sıkılaştırıldı; e2e testinde
"open redirect engellendi" adımıyla sürekli doğrulanıyor.

### R2 — Dosya yükleme bellek DoS'u ✅ DÜZELTİLDİ (2026-07-09)
multer artık global değil — yalnızca dosya kabul eden 4 rotada, uca özel sınırlarla çalışır
(`web.js:dosyaYukleyici`): kaizen yeni/düzenle **2 dosya**, 5S denetim **60 dosya**,
aksiyon kapatma **5 dosya**; dosya başına **8 MB** (`GORSEL_MAX_BAYT`). Sınır aşımı 500 yerine
açıklayıcı 400 döner. Dosya kabul etmeyen uçlara multipart gönderim **doğrudan reddedilir**
(bu sayede CSRF kontrolü multipart üzerinden atlatılamaz; token dosya uçlarında multer'dan
sonra ayrıca doğrulanır). En kötü durum bellek kullanımı istek başına ~1,1 GB'tan
herkese açık uçlarda ~16-40 MB'a indi. e2e testinde 3 yeni adımla doğrulanıyor.

### R3 — HTTPS / reverse-proxy desteği ✅ DÜZELTİLDİ (2026-07-09)
`data/config.json` (`{ "https": true, "proxy": true }`) veya `YALIN_HTTPS`/`YALIN_PROXY`
ortam değişkenleriyle açılır (`sabitler.js:siteKonfig`). `proxy` → `trust proxy` (hız
limiti/giriş kilidi gerçek istemci IP'sini görür); `https` → oturum çerezine `Secure`
bayrağı + `Strict-Transport-Security` başlığı. Varsayılan kapalıdır (LAN davranışı değişmez).
e2e testinde bayraklar açık ikinci bir sunucuyla HSTS ve Secure çerez doğrulanıyor.
Not: `https` açıkken proxy `X-Forwarded-Proto: https` iletmelidir — aksi hâlde çerez
yazılamaz (bilinçli: şifresiz bağlantıda oturum taşınmaz).

---

## Orta Öncelik

### R4 — Görsel işleme ✅ DÜZELTİLDİ (2026-07-10)
`gorselKaydet` artık imza kontrolünden sonra görseli **sharp ile yeniden kodlar**:
EXIF yönüne göre döndürülür, **tüm metadata (GPS/konum dahil) temizlenir**, 1600 px'i aşan
görseller küçültülür, JPEG/WEBP kalite 85 kaydedilir. Sharp'ın çözemediği (bozuk/sahte)
dosyalar reddedilir; BMP (EXIF taşımaz, sharp desteklemez) imza kontrolüyle olduğu gibi
yazılır. Doğrulama: 3000×2000 EXIF'li JPEG → 1600×1067, metadata yok; imzası geçerli ama
gövdesi bozuk dosya reddedildi.

### R5 — Yedekleme kapsamı ve konumu ✅ DÜZELTİLDİ (2026-07-10)
Otomatik yedek artık tek **ZIP**: tüm tablolar (`veritabani.json`) + üç görsel klasörü.
Görseller `data/config.json` → `"yedek_gorseller": false` ile kapsam dışı bırakılabilir.
Yedek klasörü `YALIN_YEDEK_DIR` ortam değişkeni veya config `"yedek_dir"` anahtarıyla
**farklı bir diske/ağ paylaşımına** yönlendirilebilir. Kalan öneri (kullanıcı prosedürü):
yedek klasörünü haricî bir konuma (ör. `D:` ya da ağ paylaşımı) yönlendirmek.

### R6 — Transaction kapsamı ✅ DÜZELTİLDİ (2026-07-09)
MySQL geçişiyle birlikte çok adımlı yazmalar `db.js:transaction(fn)` içine alındı:
ödül işleme (`besSIsle`), denetim silme (denetim + aksiyonlar + ödül geri alma),
bölüm silme, denetim turu oluşturma ve her iki veri aktarım scripti. Hata durumunda
tamamı geri alınır.

### R7 — Bellek içi durum sınırsız büyüyordu ✅ DÜZELTİLDİ (2026-07-09)
`web.js`'e saatlik süpürme zamanlayıcısı eklendi — süresi dolmuş hız-limit girdileri
düzenli temizlenir. (Giriş kilidi/limit sayaçlarının süreç yeniden başlatılınca sıfırlanması
bilinçli kabul olarak sürüyor.)

### R9 — Depoda otomatik test yoktu ✅ DÜZELTİLDİ (2026-07-09)
24 adımlı uçtan uca senaryo `scripts/e2e-test.js` olarak depoda; `npm test` ile çalışır.
Ayrı MySQL veritabanı (`yalin_e2e`) + geçici veri klasörü + ayrı port kullanır — canlı
veriye dokunmaz. Kapsam: giriş/yanlış şifre/CSRF/open-redirect, bölüm→plan→çapraz
dağıtım→denetim→ödül işleme→puan dağılımı, numara sıralılığı, onay kuralları,
5 Excel ucu, denetmen kimliği ve yetki sınırları.

---

## Düşük Öncelik / Bilinçli Tasarım Kabulleri

- **R10 — Şifre = kimlik modeli:** kullanıcı adı yoktur; tek şifre alanı tüm hesap uzayını
  temsil eder. Zayıf bir denetmen şifresi o kimliği verir. 6+ karakter zorunluluğu, benzersizlik
  kontrolü ve brute-force limiti riski sınırlar. (Kurumsal tercih — kolay kullanım için bilinçli.)
- **R11 — CSP'de `'unsafe-inline'`:** şablonlardaki satır içi `<script>` blokları nedeniyle.
  JS'ler dış dosyaya taşınırsa `script-src 'self'` yeterli olur.
- **R12 — Şema düzeyinde FOREIGN KEY yok:** tablolar arası ilişki (bolum_id, denetim_id)
  FK olarak bildirilmemiştir; yetim kayıt temizliği kod tarafında (bölüm/denetim silme
  rotaları, transaction içinde) doğru yapılır. Şema güvencesi istenirse FK'lı migrasyon gerekir.
- **R13 — Ağır işlerde tek süreç:** MySQL geçişiyle veri erişimi asenkron oldu ve DB artık
  ayrı süreçte — eşzamanlılık belirgin iyileşti. Yine de ağır Excel üretimi (görsel gömülü
  kaizen raporu) CPU'yu istek süresince tutar; `/liste`de sayfalama da yok — binlerce kayıtta
  tek sayfa büyür.
- **R14 — Oturum verisi imzalı ama şifresiz çerezde:** içerikte gizli veri yok (rol + id +
  CSRF + flash) — kabul edilebilir. İmza anahtarı ve şifre hash'leri veritabanındadır;
  veritabanı sızarsa oturum sahteciliği + offline hash kırma birlikte mümkün olur.
- **R17 — Veritabanı kimlik bilgileri düz metin:** uygulama kullanıcısının MySQL şifresi
  `data/db-config.json` içinde düz metindir (git'e girmez; klasör erişimi işletim sistemi
  izinlerine emanettir). MySQL yalnızca `127.0.0.1`'i dinler — ağdan veritabanına doğrudan
  erişim kapalıdır. Root şifresi `%LOCALAPPDATA%\YalinMySQL\root-sifre.txt` dosyasındadır;
  not alıp dosyayı silmeniz önerilir.
- **R15 — Denetim/audit logu yok:** hangi yöneticinin neyi sildiği/onayladığı kayıt altına
  alınmaz (tek paylaşımlı yönetici hesabı olduğundan kişiye bağlanamaz).
- **R16 — Bağımlılık denetimi:** `npm audit` → 2 **orta** bulgu, ikisi de `exceljs → uuid<11.1.1`
  zincirinde (uuid v3/v5/v6'da buffer sınır kontrolü). exceljs uuid'i bu yolla kullanmadığından
  pratik istismar yolu yok. **`npm audit fix --force` çalıştırmayın** — exceljs'i 3.4'e düşürür
  (kırıcı değişiklik); exceljs'in yeni sürümünü beklemek yeterli.
- Varsayılan `admin123` ilk kurulumda aktiftir (girişte uyarı gösterilir).
- `Content-Disposition` dosya adlarında Türkçe karakterler yüzde-kodlu gider (`filename*`
  kullanılmıyor) — bazı tarayıcılarda indirme adı çirkin görünebilir, işlevsel sorun değil.

---

## Önerilen Yol Haritası

| Sıra | İş | Efor | Ne zaman |
|---|---|---|---|
| ~~1~~ | ~~R1 open redirect düzeltmesi~~ | — | ✅ Yapıldı (2026-07-09) |
| ~~2~~ | ~~R9 e2e testini depoya almak (`npm test`)~~ | — | ✅ Yapıldı (2026-07-09) |
| ~~3~~ | ~~R6 transaction sarmalama + R7 süpürme zamanlayıcısı~~ | — | ✅ Yapıldı (2026-07-09) |
| ~~4~~ | ~~R2 multer'ı rota-bazlı yapıp sınırları daraltmak~~ | — | ✅ Yapıldı (2026-07-09) |
| ~~5~~ | ~~R4 sharp ile görsel işleme (küçültme + EXIF temizliği)~~ | — | ✅ Yapıldı (2026-07-10) |
| ~~6~~ | ~~R5 yedek kapsamı/konumu~~ | — | ✅ Yapıldı (2026-07-10) |
| ~~7~~ | ~~R3 https/proxy yapılandırma bayrakları~~ | — | ✅ Yapıldı (2026-07-09) |
| 8 | R11 inline JS'leri dış dosyaya taşıyıp CSP sertleştirme | ~yarım gün | Orta vade |
| 9 | R13 `/liste` sayfalama | ~yarım gün | Kayıt sayısı binleri bulunca |
