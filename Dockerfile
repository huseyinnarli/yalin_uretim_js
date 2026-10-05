# DEMO / TASARIM ÖNİZLEME kabı (ör. Render): uygulama + aynı kapta geçici MariaDB + örnek veri.
# Veriler kalıcı DEĞİLDİR; kap her yeniden başladığında demo sıfırdan kurulur.
# Canlı (fabrika) kurulumu için bu dosya kullanılmaz — bkz. DAGITIM.md.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends mariadb-server \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

# Render HTTPS proxy arkasında çalışır; PORT'u Render verir (yoksa 10000)
ENV NODE_ENV=production YALIN_PROXY=1 YALIN_HTTPS=1 YALIN_DATA_DIR=/tmp/yalin-data YALIN_DEMO=1 PORT=10000
EXPOSE 10000
CMD ["sh", "scripts/demo-baslat.sh"]
