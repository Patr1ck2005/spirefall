#!/usr/bin/env bash
# Offline frps setup: uses an already-uploaded tarball, no GitHub access.
set -euo pipefail
cd /root
rm -rf frp_0.61.1_linux_amd64
tar -xzf frp-linux.tar.gz
install -m 755 frp_0.61.1_linux_amd64/frps /usr/local/bin/frps
TOKEN="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
mkdir -p /etc/frp
cat > /etc/frps.toml <<EOF
bindPort = 7000
auth.token = "${TOKEN}"
EOF
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
sleep 1
echo "STATUS: $(systemctl is-active frps)"
echo "TOKEN=${TOKEN}"
