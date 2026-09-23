#!/usr/bin/env bash
# Installation R&D Process Hub sur Ubuntu 22.04 / 24.04 (frais)
set -euo pipefail

APP_NAME="rd-process-hub"
APP_USER="${APP_USER:-rdhub}"
APP_DIR="${APP_DIR:-/opt/rd-process-hub}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PORT="${PORT:-3000}"

echo "==> Mise à jour système"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential python3 curl git ca-certificates gnupg nginx

echo "==> Installation Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Utilisateur système ${APP_USER}"
if ! id "${APP_USER}" >/dev/null 2>&1; then
  sudo useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> Déploiement dans ${APP_DIR}"
sudo mkdir -p "${APP_DIR}"
# Copie depuis le répertoire courant du script (racine projet)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sudo rsync -a --delete \
  --exclude node_modules --exclude data --exclude .git --exclude public/uploads \
  "${SCRIPT_DIR}/" "${APP_DIR}/"

sudo mkdir -p "${APP_DIR}/data" "${APP_DIR}/public/uploads"
if [[ ! -f "${APP_DIR}/.env" ]]; then
  JWT=$(openssl rand -hex 32)
  sudo tee "${APP_DIR}/.env" >/dev/null <<EOF
PORT=${PORT}
NODE_ENV=production
HOST=127.0.0.1
JWT_SECRET=${JWT}
DB_PATH=${APP_DIR}/data/rdprocess.db
UPLOAD_DIR=${APP_DIR}/public/uploads
APP_URL=http://$(hostname -I | awk '{print $1}')
EOF
fi

echo "==> Dépendances npm (compilation better-sqlite3)"
cd "${APP_DIR}"
sudo npm install --omit=dev

echo "==> Seed initial (si base vide)"
sudo -u "${APP_USER}" env $(grep -v '^#' "${APP_DIR}/.env" | xargs) node server/seed.js || true

sudo chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> Service systemd"
sudo tee /etc/systemd/system/${APP_NAME}.service >/dev/null <<EOF
[Unit]
Description=R&D Process Hub
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ${APP_NAME}

echo "==> Nginx reverse proxy"
sudo tee /etc/nginx/sites-available/${APP_NAME} >/dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sfn /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "============================================"
echo " Installation terminée"
echo " URL : http://$(hostname -I | awk '{print $1}')"
echo " Service : sudo systemctl status ${APP_NAME}"
echo " Comptes démo : admin@rd.local / admin123"
echo "============================================"
