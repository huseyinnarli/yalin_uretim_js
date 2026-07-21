# CLAUDE.md — Yalın Üretim Uygulamaları (yalin_uretim_js)

Bu dosya, projede çalışan yapay zekâ asistanı ve yeni geliştiriciler için hızlı bağlamdır.

## Proje kimliği

Fabrika içi web uygulaması: **Öneri + Kaizen + 5S denetim** süreçleri ve personel puan/ödül
sistemi. Eski Python/Flask sürümünün (`../yalin_uretim_uygulamalari`) JavaScript ile sıfırdan
yazılmış hâli; önce SQLite'la yazıldı, sonra **MySQL 8**'e taşındı.

- **Yığın:** Node.js 24 + Express 4 + MySQL 8 (`mysql2/promise`) + EJS (sunucu tarafı render)
  + exceljs + archiver + multer + sharp + cookie-session. SPA/dış CDN yok.
- **GitHub:** https://github.com/huseyinnarli/yalin_uretim_js (private)
- **Dil:** Kod, yorumlar, commit mesajları ve arayüz **Türkçe**.

## Doküman haritası (hepsi güncel tutulur)

| Dosya | İçerik |
|---|---|
| [README.md](README.md) | Uygulama tanıtımı, modüller, roller, kurulum, yapılandırma |
| [TEKNIK_DOKUMAN.md](TEKNIK_DOKUMAN.md) | Mimari, istek yaşam döngüsü, veri modeli, iş kuralları/algoritmalar |
| [IYILESTIRME_ANALIZI.md](IYILESTIRME_ANALIZI.md) | Kod inceleme raporu: güvenlik durumu, açık öneriler (Ö1–Ö8) |
| [DAGITIM.md](DAGITIM.md) | Sunucuda devreye alma: gereksinimler, Windows/Linux kurulum, HTTPS, yedek |

## Komutlar

```bash
npm start        # sunucu → http://127.0.0.1:5000 (0.0.0.0 dinler)
npm test         # 34 adımlı e2e — AYRI veritabanı (yalin_e2e) + geçici veri klasörü; canlıya dokunmaz
npm run migrate  # eski SQLite verisini (data/yalin.db) MySQL'e taşır
npm run import   # eski Flask/JSON verisini aktarır: node scripts/import-json.js "<eski>/data"
```

Sözdizimi hızlı kontrol: `node --check <dosya>`. Önizleme: kök `Projeler/.claude/launch.json`
içinde `yalin-uretim-js` yapılandırması var (`preview_start name=yalin-uretim-js`).

## Bu makinedeki ortam (geliştirme PC'si)

- **Node:** `C:\Program Files\nodejs` (yeni terminalde PATH'e eklemek gerekebilir).
- **MySQL:** Windows servisi **`YalinMySQL`** (otomatik başlar; yalnız 127.0.0.1:3306 dinler).
  Veri: `C:\ProgramData\YalinMySQL\data`, ini: `C:\ProgramData\YalinMySQL\my.ini`,
  hata logu: `C:\ProgramData\YalinMySQL\mysql-hata.log`.
  ⚠ mysqld servisi kullanıcı profili altındaki datadir ile SESSİZCE başlamaz — ProgramData şart.
- **Bağlantı:** `data/db-config.json` (git dışı) → user `yalin`, db `yalin_uretim`.
  Root şifresi: `%LOCALAPPDATA%\YalinMySQL\root-sifre.txt`.
- **Test DB:** `yalin_e2e` (yalin kullanıcısına yetkili) — `npm test` bunu kullanır.
- Canlı veritabanında kullanıcının GERÇEK verisi var (28 bölüm, denetmenler, ödül defteri) —
  test ederken canlıya yazma; `npm test` veya izole `YALIN_DB_DATABASE`/`YALIN_DATA_DIR` kullan.

## Mimari (özet — ayrıntı TEKNIK_DOKUMAN.md)

Katmanlar tek yönlü: `sabitler → puanlama → db → cekirdek → web → rotalar → server`.
Veri erişimi tamamen async (`sorgu/tek/calistir/transaction`, `src/db.js`). İş mantığı
`src/cekirdek.js`'te ve Express'ten bağımsızdır (session'ı parametre alır).

## Kritik konvansiyonlar ve tuzaklar

1. **Yeni POST formu eklerken** şablona mutlaka
   `<input type="hidden" name="csrf_token" value="<%= csrf_token %>">` ekle — yoksa 400.
2. **`await` içeren her rota işleyicisini `sar()` ile sar** (`web.js`) — Express 4 async
   hataları kendiliğinden yakalamaz.
3. **Dosya kabul eden yeni rota** eklersen İKİ yer değişir: rotaya `...dosyaYukleyici(N)`
   middleware'i VE `web.js` içindeki `DOSYA_YOLLARI` regex listesi (aksi hâlde multipart
   istek kapıda 400 alır). Ayrıca N, formdaki dosya kutusu SAYISI kadar olmalı — tarayıcı
   boş dosya kutularını da multipart parçası olarak gönderir ve multer bunları sayar
   (bu yüzden denetim rotasında sınır `3 × soru sayısı`ndan hesaplanır).
4. **Liste/nesne alanları** TEXT kolonlarda JSON'dur — yazarken `js()`, okuma dönüşümleri
   `db.js`'teki satır dönüştürücülerde (`denetimRow` vb.).
5. **`denetimler.notu`**: `not` SQL anahtar sözcüğü olduğundan kolon adı `notu`; satır
   nesnesinde `not` olarak açılır. `no` kolonu sorgularda backtick'lenir.
6. **Şema değişikliği:** tablolar `CREATE TABLE IF NOT EXISTS` ile kurulur; mevcut kuruluma
   kolon eklemek için `db.js init()` içine güvenli `ALTER TABLE` migrasyonu ekle
   (örnek: `bulgular` kolonu).
7. **5S formu** (sorular + puan kesme kuralları) tek yerde: `src/puanlama.js` → `BESS`.
   Denetmen puan girmez; **bulgu sayısı / Evet-Hayır** girer, puan `bessKriterPuanla` ile
   hesaplanır (sunucu bağlayıcı; istemcideki canlı hesap yalnız gösterim). e2e testi kriter
   listesini buradan okur — form değişince test kendiliğinden uyar.
8. **Kişi 5S puanlarının tek kaynağı `odul_kayitlari`** tablosudur; denetim silinince ödül
   kaydı da transaction içinde geri alınır (puan otomatik düşer). Bu kuralı bozma.
8b. **Yetki sistemi:** roller = ana yönetici (`session.super`, tüm yetkiler), ek yönetici
   (`session.yonetici_id`, `yoneticiler.yetkiler` JSON: `degerlendirme`/`bes_s`/`odul`/`kayit`),
   denetmen. Rotayı `web.js:yetkiGerek(alan)` ile kapıla (ana-yönetici-özel için `superRequired`);
   şablonda butonu `yetki('alan')` ile gizle. Yeni bir yönetici-eylemi eklerken HER İKİSİNİ de
   yap — arayüzde gizlemek yetmez, sunucu da reddetmeli. Yetki alanları `web.js:YETKILER`de tanımlı.
9. Numara üretimi (`ÖNFR2607-01`) `sayaclar` tablosunda **atomik sayaçtır** — elle SELECT
   MAX + INSERT yazma.
10. Kullanıcı git commit'lerine **Co-Authored-By eklenmesini istemiyor**.

## Kısa tarihçe (git log ile birebir)

1. `5e8d3c7` İlk sürüm — Flask uygulamasının Node.js + SQLite portu (tam özellik eşleniği)
2. `09d7171` Dokümantasyon seti
3. `9aec218` **SQLite → MySQL geçişi** (async veri katmanı, atomik sayaç, transaction'lar)
4. `5ec68d8` R2: rota-bazlı multer + yükleme sınırları
5. `3c46785` R3: `https`/`proxy` yapılandırma bayrakları (secure cookie, HSTS, trust proxy)
6. `3be9661` R4+R5: sharp ile görsel işleme (EXIF temizliği, 1600px) + ZIP yedek (tablolar+görseller)
7. `494732f` Rapor yeniden yazımı + DAGITIM.md
8. `30a0125` **5S formu şirketin gerçek 5S Denetim Raporu şablonuna geçirildi** (5 bölüm / 23 soru: S1:25 S2:35 S3:20 S4:4 S5:16)
9. `d7d9099` **Kural tabanlı puanlama**: bulgu sayısı girilir, puan otomatik (ör. her bulgu −3; 5+ bulguda 0)
10. `5d6a5a2` Düzeltme: boş dosya kutuları 60-dosya sınırına takılıyordu
11. Kullanım kılavuzu genişletildi (`56f4684`)
12. **Ek yönetici + yetki sistemi:** ana yönetici, panelden ek yönetici ekler ve her birine
    yetki alanlarını (degerlendirme/bes_s/odul/kayit) kutucuklarla verir. `yoneticiler` tablosu,
    `yetkiGerek`/`superRequired` middleware, tüm rotalar/şablonlar yetkiye göre kapılandı (e2e 46/46).

## Açık konular

- IYILESTIRME_ANALIZI.md §5: Ö1 CSP inline JS, Ö2 sayfalama/Excel worker, Ö3 loglama +
  `/saglik`, Ö4 FK migrasyonu, Ö5 GitHub Actions CI, Ö7 cekirdek bölünmesi.
- Karar bekliyor: ZIP/Excel dosya adındaki tarih tur başlangıç tarihi (`d.tarih`) —
  gerçekleşme tarihine (`denetim_tarihi`) çevrilmesi önerildi, kullanıcı henüz onaylamadı.
