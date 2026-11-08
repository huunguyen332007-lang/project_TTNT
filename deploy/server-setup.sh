#!/usr/bin/env bash
# Chuẩn bị một server Ubuntu 22.04/24.04 mới. Chạy bằng root:  sudo bash server-setup.sh
# Việc script làm: cài Docker, tạo swap 2GB (ai-service nạp model khá tốn RAM), bật firewall,
# tạo user "deploy" để GitHub Actions đăng nhập và thư mục /opt/ttnt.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/ttnt}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

[ "$(id -u)" -eq 0 ] || { echo "Hãy chạy bằng root (sudo)."; exit 1; }

echo "==> Cập nhật hệ thống"
apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> Cài Docker Engine + Compose plugin"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Tạo user ${DEPLOY_USER}"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

echo "==> Tạo swap ${SWAP_SIZE}"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall: chỉ mở SSH, HTTP, HTTPS"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat <<MSG

Xong. Các bước tiếp theo:
  1. Dán PUBLIC key của GitHub Actions vào /home/${DEPLOY_USER}/.ssh/authorized_keys
  2. Tạo file ${APP_DIR}/.env (mẫu: .env.example ở thư mục gốc repo)
  3. Thêm secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY vào GitHub rồi push lên main.
MSG
