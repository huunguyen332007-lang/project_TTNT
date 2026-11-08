#!/usr/bin/env bash
# Sao lưu PostgreSQL ra file .sql.gz, giữ 14 bản gần nhất.
# Chạy tay hoặc đặt cron:  0 3 * * *  /opt/ttnt/backup.sh >> /opt/ttnt/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a
file="backups/ttnt-$(date +%F-%H%M).sql.gz"

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-ttnt}" "${POSTGRES_DB:-ttnt}" | gzip > "$file"

ls -1t backups/ttnt-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Đã sao lưu: $file"
# Khôi phục:  gunzip -c backups/<file> | docker compose -f docker-compose.prod.yml exec -T postgres psql -U ttnt ttnt
