#!/usr/bin/env bash
# Répare login : met à jour le code + recrée les comptes démo
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rd-process-hub}"
cd "$APP_DIR"

echo "==> Répertoire : $(pwd)"
echo "==> Contenu server/routes/auth.js (status?) :"
grep -n "status\|Identifiants" server/routes/auth.js | head -20 || true

echo "==> Mise à jour Git force"
git remote -v || true
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

echo "==> Vérif nouveau code"
grep -n "auth/status\|ensureDemoUsers\|utilisateur inconnu" server/routes/auth.js server/seed.js server/index.js | head -20

echo "==> npm install"
npm install --omit=dev

echo "==> Stop service + reset DB"
systemctl stop rd-process-hub || true
rm -f data/rdprocess.db data/rdprocess.db-wal data/rdprocess.db-shm
mkdir -p data public/uploads
# Droits : utilisateur du service
SVC_USER=$(systemctl show -p User --value rd-process-hub 2>/dev/null || echo rdhub)
if id "$SVC_USER" &>/dev/null; then
  chown -R "$SVC_USER:$SVC_USER" data public/uploads
fi

echo "==> Seed manuel"
sudo -u "${SVC_USER:-root}" env DB_PATH="$APP_DIR/data/rdprocess.db" node server/seed.js || \
  env DB_PATH="$APP_DIR/data/rdprocess.db" node server/seed.js

echo "==> Start service"
systemctl start rd-process-hub
sleep 2

echo "==> STATUS"
curl -sS http://127.0.0.1:3000/api/auth/status || true
echo
echo "==> LOGIN"
curl -sS -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@rd.local","password":"admin123"}'
echo
echo "==> LOGS"
journalctl -u rd-process-hub -n 25 --no-pager
