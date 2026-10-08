#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04 / 24.04 server. Run as root:
#   ssh root@SERVER_IP 'bash -s' < deploy/setup-server.sh
# Installs security updates, a firewall (SSH, HTTP, HTTPS only), fail2ban,
# Docker, 2 GB of swap for the first build, and a nightly database backup.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get -y upgrade
apt-get install -y ufw unattended-upgrades fail2ban curl ca-certificates
dpkg-reconfigure -f noninteractive unattended-upgrades

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# The first build compiles Next.js and the Go agent; swap keeps a small server from running out of memory.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/highpre/backups
chmod 700 /opt/highpre

# Nightly database backup at 02:30 server time (MongoDB Atlas Free has no automatic backups).
cat > /etc/cron.d/highpre-backup <<'CRON'
30 2 * * * root /opt/highpre/deploy/backup.sh >> /var/log/highpre-backup.log 2>&1
CRON

echo
echo "Server ready. Docker $(docker --version | cut -d' ' -f3 | tr -d ,), firewall on, backups scheduled."
