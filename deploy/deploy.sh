#!/usr/bin/env bash
# Deploys the committed code to the server, from Git Bash on your PC:
#   ./deploy/deploy.sh root@SERVER_IP
# Uploads the code (git archive of HEAD), .env.production as .env and the
# agent signing key, then builds and restarts with Docker Compose.
set -euo pipefail
TARGET="${1:?Usage: ./deploy/deploy.sh root@SERVER_IP}"
cd "$(dirname "$0")/.."

[ -f .env.production ] || { echo "Missing .env.production"; exit 1; }
[ -f agent-update-key.pem ] || { echo "Missing agent-update-key.pem"; exit 1; }
if grep -qE 'FILL-ME|cluster0\.xxxxx|USER:PASSWORD' .env.production || grep -qE '^SMTP_(USER|PASS)=""' .env.production; then
  echo "Fill in the FILL ME values in .env.production first (domain, MongoDB, SMTP)."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes. Only committed code is deployed: commit first."
  exit 1
fi
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d'"' -f2)

echo "Uploading $(git rev-parse --short HEAD) to $TARGET ..."
# Replace the code but keep settings, the signing key and backups.
ssh "$TARGET" 'mkdir -p /opt/highpre && cd /opt/highpre && find . -mindepth 1 -maxdepth 1 ! -name .env ! -name agent-update-key.pem ! -name backups -exec rm -rf {} +'
git archive --format=tar HEAD | ssh "$TARGET" 'tar -x -C /opt/highpre'
scp -q .env.production "$TARGET:/opt/highpre/.env"
scp -q agent-update-key.pem "$TARGET:/opt/highpre/agent-update-key.pem"

echo "Building and starting (the first build takes 5-10 minutes) ..."
ssh "$TARGET" 'cd /opt/highpre && chmod 600 .env agent-update-key.pem && chmod +x deploy/*.sh && docker compose up -d --build && docker image prune -f >/dev/null && docker compose ps'

echo "Waiting for https://$DOMAIN ..."
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "Live: https://$DOMAIN"
    exit 0
  fi
  sleep 10
done
echo "Not answering over HTTPS yet. Check that the domain's A record points to the server, then:"
echo "  ssh $TARGET 'cd /opt/highpre && docker compose logs --tail=100 app caddy'"
exit 1
