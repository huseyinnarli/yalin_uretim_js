#!/bin/sh
# Demo (tasarım önizleme) kabı: aynı kapta geçici bir MariaDB başlatır, örnek veriyi yükler ve
# uygulamayı açar. Veriler /tmp'dedir — kap her yeniden başladığında demo sıfırdan kurulur.
# CANLI KURULUMDA KULLANILMAZ (canlı kurulum: DAGITIM.md).
set -e
VERI="${DEMO_DB_DIR:-/tmp/demo-mariadb}"
SOKET="$VERI/mysqld.sock"

if [ ! -d "$VERI/mysql" ]; then
  mkdir -p "$VERI"
  mariadb-install-db --user=root --datadir="$VERI" --auth-root-authentication-method=normal \
    --skip-test-db >/dev/null
fi

# Az bellekli ayarlar (Render ücretsiz plan ~512 MB)
mariadbd --user=root --datadir="$VERI" --socket="$SOKET" --pid-file="$VERI/mysqld.pid" \
  --port=3306 --bind-address=127.0.0.1 \
  --skip-name-resolve --skip-log-bin --performance-schema=OFF --innodb-buffer-pool-size=32M \
  --innodb-log-file-size=16M --key-buffer-size=4M --max-connections=30 --table-open-cache=200 \
  >/tmp/demo-mariadb.log 2>&1 &

i=0
until mariadb-admin --socket="$SOKET" -uroot ping >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "MariaDB başlamadı:"; cat /tmp/demo-mariadb.log; exit 1; }
  sleep 1
done

mariadb --socket="$SOKET" -uroot -e "
  CREATE DATABASE IF NOT EXISTS yalin_uretim CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;
  CREATE USER IF NOT EXISTS 'yalin'@'127.0.0.1' IDENTIFIED BY 'demo';
  GRANT ALL PRIVILEGES ON yalin_uretim.* TO 'yalin'@'127.0.0.1';
  FLUSH PRIVILEGES;"

export YALIN_DB_HOST=127.0.0.1 YALIN_DB_PORT=3306 YALIN_DB_USER=yalin YALIN_DB_PASSWORD=demo YALIN_DB_DATABASE=yalin_uretim
node scripts/demo-veri.js
exec node server.js
