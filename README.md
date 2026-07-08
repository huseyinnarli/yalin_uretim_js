# Yalın Üretim Uygulamaları (Node.js + SQLite)

Fabrika içi **Öneri**, **Kaizen** ve **5S denetim** süreçleri + **personel puan/ödül sistemi**.
Python/Flask sürümünün JavaScript ile sıfırdan yazılmış hâlidir; veri artık JSON dosyaları yerine
**SQLite veritabanında** tutulur.

## Teknolojiler

| Katman | Teknoloji |
|---|---|
| Sunucu | Node.js + Express |
| Veritabanı | SQLite (`node:sqlite`, WAL modu) — `data/yalin.db` |
| Arayüz | EJS şablonları + `static/style.css` (sunucu tarafı render) |
| Excel | exceljs (talep anında üretilir) |
| ZIP | archiver (fotoğraf paketleri) |
| Yükleme | multer (bellek içi → doğrulama → disk) |
| Oturum | cookie-session (imzalı çerez, 12 saat) |

## Kurulum ve Çalıştırma

```bash
npm install
npm start
```

- Bu bilgisayar: **http://127.0.0.1:5000**
- Aynı ağdaki cihazlar: **http://<PC-IP>:5000** (0.0.0.0 dinler)
- İlk yönetici şifresi: **admin123** — girişten sonra Yönetici Paneli → Şifre Değiştir'den hemen değiştirin.

## Eski (Flask/JSON) veriyi aktarma

Eski uygulamanın `data/` klasöründeki tüm kayıtları (öneri, kaizen, 5S, denetmenler, ödüller)
ve görselleri yeni veritabanına aktarır. **Eski veriye yalnızca okuma yapılır.**

```bash
node scripts/import-json.js "C:\...\yalin_uretim_uygulamalari\data"
```

Eski hash'li şifreler (werkzeug pbkdf2/scrypt) aynen çalışır — yönetici ve denetmenler
mevcut şifreleriyle giriş yapabilir.

## Klasör Yapısı

```
server.js            # Express kurulumu + middleware + rota kaydı
src/
  sabitler.js        # yollar, sabitler, TR saat yardımcıları
  puanlama.js        # öneri/kaizen puan rubriği + 5S kriterleri (saf)
  db.js              # SQLite şema + satır dönüşümleri + otomatik yedek
  cekirdek.js        # iş mantığı (numara, puan durumu, 5S, aksiyonlar, kimlik)
  web.js             # flash, CSRF, hız limiti, yetki middleware'leri
  excel.js           # exceljs raporları
  rotalar/           # genel / oneri / kaizen / bes_s / admin
views/               # EJS şablonları (partials/header+footer)
static/              # style.css, takvim.js, flatpickr, logo
scripts/import-json.js  # eski JSON verisini aktarma
data/                # yalin.db + görsel klasörleri + _yedek_otomatik/ (çalışınca oluşur)
```

## Güvenlik

- Şifreler pbkdf2 (werkzeug uyumlu format) ile hash'lenir; eski hash'ler doğrulanır.
- Tüm POST'larda CSRF token; güvenlik başlıkları (nosniff, X-Frame-Options, CSP).
- Girişte kaba kuvvet koruması (IP başına 10 dk'da 8 deneme), yazma uçlarında hız limiti.
- Yüklenen dosyalar uzantı + dosya imzası (magic bytes) ile doğrulanır; path-traversal korumalı servis.
- Oturum çerezi HttpOnly + SameSite=Lax; imza anahtarı veritabanında (koda gömülü değil).
- Otomatik yedek: açılışta + 6 saatte bir `data/_yedek_otomatik/` altına veritabanı kopyası (son 15).

## Veri Modeli (SQLite tabloları)

`oneriler`, `kaizenler`, `bolumler`, `denetimler`, `aksiyonlar`,
`odul_islenen`, `odul_kayitlari` (5S ödül defteri — kişi 5S puanlarının tek kaynağı),
`odul_arsiv` (300'lük ödüller), `silinen_kisiler`, `denetmenler`, `misafirler`, `config`.

Liste/nesne alanları (üyeler, kazançlar, kriter puanları, fotoğraflar, kapatma bilgisi)
JSON kolonlarında saklanır. Görseller diskte (`data/*_gorseller/`), adları veritabanında.
