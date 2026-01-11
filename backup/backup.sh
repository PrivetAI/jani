#!/bin/sh
set -e

BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S).sql.gz"
FIFO="/tmp/backup_fifo"

echo "[$(date)] Starting backup..."

# Create named pipe for streaming
rm -f "$FIFO"
mkfifo "$FIFO"

# Start curl in background, reading from pipe
curl -s -F "document=@$FIFO;filename=$BACKUP_NAME" \
  -F "caption=🗄 Database backup $(date '+%Y-%m-%d %H:%M')" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument?chat_id=${BACKUP_CHAT_ID}" > /tmp/curl_response.txt 2>&1 &
CURL_PID=$!

# Stream pg_dump -> gzip -> pipe (no disk storage)
pg_dump "$DATABASE_URL" | gzip > "$FIFO"

# Wait for curl to finish
wait $CURL_PID
RESPONSE=$(cat /tmp/curl_response.txt)

# Cleanup
rm -f "$FIFO" /tmp/curl_response.txt

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "[$(date)] Backup sent successfully (streamed directly, no disk storage)"
else
  echo "[$(date)] Failed to send backup: $RESPONSE" >&2
  exit 1
fi
