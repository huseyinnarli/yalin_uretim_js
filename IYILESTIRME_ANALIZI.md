# Kod İnceleme Raporu — İyileştirmeler ve Riskler

Tarih: 2026-07-08 · Kapsam: tüm kaynak kod + bağımlılık denetimi (`npm audit`)

**Özet karar:** Mimari sağlam ve katmanlı; güvenlik temelleri (CSRF, hash'li şifreler,
parametreli SQL, path-traversal koruması, dosya imzası doğrulaması) yerinde. Fabrika içi ağda
(LAN) kullanım için **hazır**. İnternete açılmadan önce kapatılması gereken **1 somut açık**
(R1) ve **2 önemli sertleştirme eksiği** (R2, R3) vardır.

## Bulgu Özeti

| No | Bulgu | Önem | Etki alanı |
|---|---|---|---|
| R1 | Open redirect (`next` parametresi `//host` biçimini kabul ediyor) | **Yüksek** | Giriş akışı |
| R2 | Dosya yükleme bellek sınırı çok geniş (istek başına ~1,1 GB olasılığı) | **Yüksek** | DoS |
| R3 | HTTPS/reverse-proxy desteği yok (secure cookie, trust proxy, HSTS) | **Yüksek** (yalnız internet senaryosu) | Dağıtım |
| R4 | Görseller yeniden işlenmiyor (küçültme/EXIF temizliği yok) | Orta | Gizlilik + disk |
| R5 | Yedek kapsamı: görseller hariç, yedekler aynı diskte | Orta | Felaket kurtarma |
| R6 | Çok adımlı bazı yazmalar transaction dışında | Orta | Veri tutarlılığı |
| R7 | Bellek içi hız-limit tabloları sınırsız büyüyor | Orta | Uzun süreli çalışma |
| R8 | `npm audit`: 2 orta bulgu (exceljs → uuid zinciri) | Düşük | Bağımlılık |
| R9 | Depoda otomatik test paketi yok | Orta | Bakım/regresyon |
| R10–R16 | Bilinçli tasarım kabulleri / düşük öncelikli notlar | Düşük | — |

---

## Yüksek Öncelik

### R1 — Open redirect (somut açık)
`src/rotalar/admin.js` girişteki `next` parametresini `hedef.startsWith("/")` ile doğrular.
Ancak `//saldirgan.com` da `/` ile başlar ve tarayıcı bunu **protokol-göreli mutlak adres**
sayar → başarılı girişten sonra kullanıcı dış siteye yönlendirilebilir (oltalama senaryosu:
sahte "oturumunuz düştü" e-postasındaki `?next=//kopya-site` bağlantısı).

**Düzeltme (tek satır):**
```js
const hedef = (hedefRaw.startsWith("/") && !hedefRaw.startsWith("//")) ? hedefRaw : "/";
```

### R2 — Dosya yükleme bellek DoS'u
`server.js` multer'ı **bellek depolamayla ve tüm rotalara** (`upload.any()`) uygular; sınırlar
dosya başına 16 MB × 70 dosya ≈ istek başına **~1,1 GB RAM**. Toplam istek boyutu sınırı yoktur
ve herkese açık uçlar da (öneri formu gibi) multipart kabul eder. Kötü niyetli tek istemci
birkaç eşzamanlı istekle süreci belleksiz bırakabilir.

**Öneri:**
1. multer'ı yalnızca dosya kabul eden rotalara bağla (kaizen yeni/düzenle, denetim, aksiyon kapat).
2. Sınırları gerçek ihtiyaca indir: `fileSize: 8 MB`, denetim için `files: 60`, kaizen için 2,
   aksiyon için 5.
3. Alternatif: disk depolamaya (`multer.diskStorage` → geçici klasör) geçip doğrulama sonrası taşı.

### R3 — HTTPS / reverse-proxy desteği yok
- Oturum çerezinde `secure` bayrağı yok; HSTS başlığı yok.
- `trust proxy` kapalı: reverse proxy arkasında `req.ip` hep proxy adresi olur →
  **tüm kullanıcılar tek IP sayılır**; 8 hatalı girişte herkes kilitlenir, hız limitleri
  ortak havuzdan tükenir.

LAN'da sorun oluşturmaz; internete çıkışta şarttır.

**Öneri:** `config` tablosuna `https` ve `proxy` bayrakları ekle; açıkken
`app.set("trust proxy", 1)`, cookie-session'a `secure: true`, başlıklara
`Strict-Transport-Security` ekle. (Eski sistemdeki `ProxyFix` + `SESSION_COOKIE_SECURE`
davranışının karşılığı.)

---

## Orta Öncelik

### R4 — Görseller yeniden işlenmiyor
`gorselKaydet` imza kontrolünden sonra dosyayı **olduğu gibi** diske yazar:
- **EXIF verisi temizlenmiyor** — telefon fotoğraflarındaki konum (GPS) bilgisi sistemde ve
  Excel/ZIP çıktılarında yaşamaya devam eder (gizlilik).
- Küçültme yok — 12–16 MB'lık fotoğraflar diski hızla büyütür, mobilde sayfaları yavaşlatır.

**Öneri:** `sharp` paketi (Windows dahil hazır binary ile kurulur): doğrula → EXIF yönüne göre
döndür → 1600 px'e küçült → JPEG kalite 85 kaydet. Tek fonksiyon değişikliğiyle üç sorun kapanır.

### R5 — Yedekleme kapsamı ve konumu
- Otomatik yedek yalnızca `yalin.db` — üç görsel klasörü kapsam dışı.
- Yedekler ana veriyle **aynı disk ve klasör ağacında** (`data/_yedek_otomatik/`); disk
  arızasında asıl veriyle birlikte kaybolur.

**Öneri:** yedeğe görselleri de dahil eden bir ZIP seçeneği; yedek klasörünü env değişkeniyle
farklı diske yönlendirme; haftalık harici kopya (paylaşımlı klasör/bulut) prosedürü.

### R6 — Transaction kapsamı
Öneri/kaizen ekleme `BEGIN IMMEDIATE` ile atomiktir, ancak şu çok adımlı yazmalar transaction'sızdır:
- `besSIsle`: 3 ödül kaydı + "işlendi" işareti,
- denetim silme: denetim + aksiyonlar + ödül geri alma + işlenen temizliği.

Node tek iş parçacıklı ve sürücü senkron olduğundan istekler arası yarış yoktur; risk yalnızca
**adımlar ortasında süreç çökmesi** → yarım işlenmiş tur/silme. Düşük olasılık, ucuz düzeltme:
bu blokları `BEGIN … COMMIT` ile sarmak.

### R7 — Bellek içi durum sınırsız büyüyor
`web.js:_hizGecmisi` ve `admin.js:_girisDenemeleri` Map'lerinden eski IP girdileri yalnızca aynı
IP tekrar istek atınca budanır; hiç dönmeyen IP'lerin kaydı kalıcıdır. LAN'da önemsiz; internete
açık senaryoda yavaş bellek büyümesi. Ayrıca her ikisi süreç yeniden başlatılınca sıfırlanır
(kilitler düşer) — bilinçli ve kabul edilebilir.

**Öneri:** saatte bir süresi dolmuş girdileri süpüren küçük bir `setInterval`.

### R9 — Depoda otomatik test yok
Doğrulama sırasında kullanılan 24 adımlı uçtan uca senaryo (giriş/CSRF/5S turu/ödül/puanlama/
Excel/yetki sınırları) depoya eklenmedi. Gelecek değişikliklerde regresyon güvencesi şu an
yalnızca elle test.

**Öneri:** senaryoyu `scripts/e2e-test.js` olarak depoya al (izole `YALIN_DATA_DIR` + ayrı port
ile çalışır, canlı veriye dokunmaz); `npm test` betiği tanımla.

---

## Düşük Öncelik / Bilinçli Tasarım Kabulleri

- **R10 — Şifre = kimlik modeli:** kullanıcı adı yoktur; tek şifre alanı tüm hesap uzayını
  temsil eder. Zayıf bir denetmen şifresi o kimliği verir. 6+ karakter zorunluluğu, benzersizlik
  kontrolü ve brute-force limiti riski sınırlar. (Kurumsal tercih — kolay kullanım için bilinçli.)
- **R11 — CSP'de `'unsafe-inline'`:** şablonlardaki satır içi `<script>` blokları nedeniyle.
  JS'ler dış dosyaya taşınırsa `script-src 'self'` yeterli olur.
- **R12 — Şema düzeyinde FOREIGN KEY yok:** `PRAGMA foreign_keys=ON` açık ama tablolar FK
  bildirmediğinden etkisizdir; yetim kayıt temizliği kod tarafında (bölüm/denetim silme
  rotaları) doğru yapılır. Şema güvencesi istenirse FK'lı migrasyon gerekir.
- **R13 — Senkron SQLite + tek süreç:** ağır Excel üretimi (özellikle görsel gömülü kaizen
  raporu) sırasında diğer istekler bekler. Fabrika ölçeğinde (onlarca kullanıcı) sorun değil;
  yüzlerce eşzamanlı kullanıcıda darboğaz. `/liste`de sayfalama da yok — binlerce kayıtta
  tek sayfa büyür.
- **R14 — Oturum verisi imzalı ama şifresiz çerezde:** içerikte gizli veri yok (rol + id +
  CSRF + flash) — kabul edilebilir. İmza anahtarı ve şifre hash'leri aynı DB dosyasında:
  **dosya sızarsa** oturum sahteciliği + offline hash kırma birlikte mümkün olur; DB dosyasının
  işletim sistemi düzeyinde erişim izinleri önemlidir.
- **R15 — Denetim/audit logu yok:** hangi yöneticinin neyi sildiği/onayladığı kayıt altına
  alınmaz (tek paylaşımlı yönetici hesabı olduğundan kişiye bağlanamaz).
- **R16 — Bağımlılık denetimi:** `npm audit` → 2 **orta** bulgu, ikisi de `exceljs → uuid<11.1.1`
  zincirinde (uuid v3/v5/v6'da buffer sınır kontrolü). exceljs uuid'i bu yolla kullanmadığından
  pratik istismar yolu yok. **`npm audit fix --force` çalıştırmayın** — exceljs'i 3.4'e düşürür
  (kırıcı değişiklik); exceljs'in yeni sürümünü beklemek yeterli.
- Varsayılan `admin123` ilk kurulumda aktiftir (girişte uyarı gösterilir); `node:sqlite` görece
  yeni bir API'dir — Node büyük sürüm atlamalarında değişiklik notları kontrol edilmelidir.
- `Content-Disposition` dosya adlarında Türkçe karakterler yüzde-kodlu gider (`filename*`
  kullanılmıyor) — bazı tarayıcılarda indirme adı çirkin görünebilir, işlevsel sorun değil.

---

## Önerilen Yol Haritası

| Sıra | İş | Efor | Ne zaman |
|---|---|---|---|
| 1 | R1 open redirect düzeltmesi | 1 satır | Hemen |
| 2 | R2 multer'ı rota-bazlı yapıp sınırları daraltmak | ~1 saat | Hemen |
| 3 | R9 e2e testini depoya almak (`npm test`) | ~1 saat | Hemen |
| 4 | R6 transaction sarmalama + R7 süpürme zamanlayıcısı | ~1 saat | Kısa vade |
| 5 | R4 sharp ile görsel işleme (küçültme + EXIF temizliği) | ~2 saat | Kısa vade |
| 6 | R5 yedek kapsamı/konumu | ~2 saat | Kısa vade |
| 7 | R3 https/proxy yapılandırma bayrakları | ~2 saat | İnternete açılmadan önce **şart** |
| 8 | R11 inline JS'leri dış dosyaya taşıyıp CSP sertleştirme | ~yarım gün | Orta vade |
| 9 | R13 `/liste` sayfalama | ~yarım gün | Kayıt sayısı binleri bulunca |
