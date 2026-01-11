#!/bin/sh
set -e

# Convert BACKUP_INTERVAL to cron format if needed
CRON_SCHEDULE="${BACKUP_INTERVAL:-0 */8 * * *}"

echo "Starting backup scheduler with cron: $CRON_SCHEDULE"

# Create crontab
echo "$CRON_SCHEDULE /backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

# Run initial backup on startup
echo "Running initial backup..."
/backup.sh

# Start cron in foreground
echo "Starting cron daemon..."
crond -f -l 2
