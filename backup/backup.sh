#!/bin/sh
set -e

BACKUP_FILE="/tmp/backup_$(date +%Y%m%d_%H%M%S).sql.gz"

echo "[$(date)] Starting backup..."

# Dump database and compress (streaming to minimize memory)
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

FILESIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")
echo "[$(date)] Backup created: $BACKUP_FILE ($FILESIZE bytes)"

# Send to Telegram
echo "[$(date)] Sending to Telegram..."
RESPONSE=$(curl -s -F "document=@$BACKUP_FILE" \
  -F "caption=🗄 Database backup $(date '+%Y-%m-%d %H:%M')" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument?chat_id=${BACKUP_CHAT_ID}")

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "[$(date)] Backup sent successfully"
else
  echo "[$(date)] Failed to send backup: $RESPONSE" >&2
fi

# Cleanup
rm -f "$BACKUP_FILE"
echo "[$(date)] Cleanup done"
