#!/usr/bin/env bash
# Dumps the HighPre database to /opt/highpre/backups and keeps the newest 14.
# Runs nightly (see setup-server.sh). Run by hand any time: /opt/highpre/deploy/backup.sh
# Restore: docker run --rm -i -e URI="..." mongo:7 sh -c 'mongorestore --uri="$URI" --gzip --archive' < FILE
set -euo pipefail
cd /opt/highpre

URI=$(grep -E '^MONGODB_URI=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
STAMP=$(date +%Y-%m-%d_%H%M)
FILE="highpre-$STAMP.archive.gz"

docker run --rm -e URI="$URI" -v /opt/highpre/backups:/backups mongo:7 \
  sh -c 'mongodump --uri="$URI" --gzip --archive="/backups/'"$FILE"'" --quiet'

ls -1t backups/highpre-*.archive.gz | tail -n +15 | xargs -r rm --
echo "$(date -Is) backup ok: $FILE ($(du -h "backups/$FILE" | cut -f1))"
