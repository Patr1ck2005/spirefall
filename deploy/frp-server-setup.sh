#!/usr/bin/env bash
# Spirefall frp server deployment — runs ON the VPS (Ubuntu 22.04, amd64).
# Usage: bash frp-server-setup.sh
set -euo pipefail

FRP_VERSION="0.61.1"
TOKEN="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"

echo "== installing frp ${FRP_VERSION} =="
cd /tmp
wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz"
tar -xzf "frp_${FRP_VERSION}_linux_amd64.tar.gz"
install -m 755 "frp_${FRP_VERSION}_linux_amd64/frps" /usr/local/bin/frps

echo "== writing /etc/frps.toml (token: ${TOKEN}) =="
mkdir -p /etc/frp
cat > /etc/frps.toml <<EOF
bindPort = 7000
auth.token = "${TOKEN}"
EOF

echo "== systemd unit =="
cat > /etc/systemd/system/frps.service <<EOF
[Unit]
Description=frp server
After=network.target

[Service]
ExecStart=/usr/local/bin/frps -c /etc/frps.toml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now frps
systemctl status frps --no-pager | head -n 5

echo ""
echo "=============================================="
echo " frps is running. Your token (keep private):"
echo " TOKEN=${TOKEN}"
echo "=============================================="
