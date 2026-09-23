# Guide d'installation et de déploiement — R&D Process Hub

Plateforme collaborative de gestion du processus de conception R&D (**R1b**), avec base de données **SQLite**, API REST Node.js et interface web.

Public cible : serveur **Ubuntu 22.04 ou 24.04** fraîchement installé.

---

## 1. Prérequis

- Ubuntu 22.04 LTS ou 24.04 LTS (serveur ou desktop)
- Accès `sudo`
- Connexion Internet (pour les paquets)
- Ports **80** (HTTP) et éventuellement **3000** ouverts selon votre pare-feu

Matériel minimal recommandé :

| Ressource | Minimum |
|-----------|---------|
| CPU       | 1 vCPU  |
| RAM       | 1 Go    |
| Disque    | 5 Go libres |

---

## 2. Installation automatique (recommandée)

Sur le serveur Ubuntu, en tant qu'utilisateur avec sudo :

```bash
# 1. Installer git si besoin
sudo apt-get update && sudo apt-get install -y git

# 2. Cloner le dépôt
git clone https://github.com/VOTRE_COMPTE/rd-process-hub.git
cd rd-process-hub

# 3. Lancer le script d'installation
chmod +x scripts/install-ubuntu.sh
sudo ./scripts/install-ubuntu.sh
```

Le script effectue :

1. Mise à jour système + paquets (`build-essential`, `nginx`, etc.)
2. Installation de **Node.js 22.x**
3. Création de l'utilisateur système `rdhub`
4. Déploiement dans `/opt/rd-process-hub`
5. Génération du fichier `.env` (secret JWT aléatoire)
6. `npm install` (dépendances Node)
7. Seed des données de démonstration
8. Service **systemd** `rd-process-hub`
9. **Nginx** en reverse proxy sur le port 80

À la fin, ouvrez dans le navigateur :

```text
http://IP_DU_SERVEUR
```

Compte démo :

| Email            | Mot de passe |
|------------------|--------------|
| admin@rd.local   | admin123     |
| thomas@rd.local  | admin123     |
| sophie@rd.local  | admin123     |

**Changez immédiatement le mot de passe en production** (créer un nouvel utilisateur admin puis désactiver les comptes démo).

---

## 3. Installation manuelle

### 3.1 Paquets système

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 curl git nginx
```

### 3.2 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # >= 18
```

### 3.3 Application

```bash
sudo mkdir -p /opt/rd-process-hub
sudo git clone https://github.com/VOTRE_COMPTE/rd-process-hub.git /opt/rd-process-hub
cd /opt/rd-process-hub

sudo cp .env.example .env
sudo nano .env   # éditer JWT_SECRET, PORT, etc.

sudo npm install --omit=dev
sudo mkdir -p data public/uploads
sudo node server/seed.js
```

### 3.4 Service systemd

Créer `/etc/systemd/system/rd-process-hub.service` :

```ini
[Unit]
Description=R&D Process Hub
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/rd-process-hub
EnvironmentFile=/opt/rd-process-hub/.env
ExecStart=/usr/bin/node /opt/rd-process-hub/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/rd-process-hub
sudo systemctl daemon-reload
sudo systemctl enable --now rd-process-hub
sudo systemctl status rd-process-hub
```

### 3.5 Nginx

`/etc/nginx/sites-available/rd-process-hub` :

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -sfn /etc/nginx/sites-available/rd-process-hub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Configuration (`.env`)

| Variable     | Description                          | Défaut                    |
|--------------|--------------------------------------|---------------------------|
| `PORT`       | Port d'écoute Node                   | `3000`                    |
| `HOST`       | Interface d'écoute                   | `0.0.0.0`                 |
| `JWT_SECRET` | Secret de signature des tokens       | **obligatoire en prod**   |
| `DB_PATH`    | Chemin fichier SQLite                | `./data/rdprocess.db`     |
| `UPLOAD_DIR` | Dossier des fichiers uploadés        | `./public/uploads`        |
| `NODE_ENV`   | `production` / `development`         | `production`              |

---

## 5. Base de données SQL (SQLite)

La base est un fichier SQLite unique (pas de serveur PostgreSQL/MySQL à installer).

Emplacement par défaut après installation script :

```text
/opt/rd-process-hub/data/rdprocess.db
```

Tables principales :

- `users` — comptes et rôles
- `projects` — projets de conception
- `process_steps` — étapes R1b (1→8) par projet
- `tasks` — tâches Kanban
- `stock_items` — matériel / pièces / coûts
- `documents` — métadonnées fichiers
- `notifications` — alertes validation / affectation
- `project_members` / `project_features`

Sauvegarde :

```bash
sudo systemctl stop rd-process-hub
sudo cp /opt/rd-process-hub/data/rdprocess.db /var/backups/rdprocess-$(date +%F).db
sudo systemctl start rd-process-hub
```

Inspection :

```bash
sudo apt-get install -y sqlite3
sqlite3 /opt/rd-process-hub/data/rdprocess.db ".tables"
```

---

## 6. HTTPS (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d votredomaine.example.com
```

---

## 7. Pare-feu (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## 8. Mise à jour de l'application

```bash
cd /opt/rd-process-hub
sudo -u rdhub git pull   # ou rsync depuis votre poste
sudo npm install --omit=dev
sudo systemctl restart rd-process-hub
```

---

## 9. Dépannage

| Symptôme | Commande / action |
|----------|-------------------|
| Service down | `sudo systemctl status rd-process-hub` |
| Logs | `sudo journalctl -u rd-process-hub -f` |
| Health API | `curl -s http://127.0.0.1:3000/api/health` |
| Nginx | `sudo nginx -t` ; `sudo tail -f /var/log/nginx/error.log` |
| Droits data/uploads | `sudo chown -R rdhub:rdhub /opt/rd-process-hub/data /opt/rd-process-hub/public/uploads` |

---

## 10. Développement local

```bash
git clone https://github.com/VOTRE_COMPTE/rd-process-hub.git
cd rd-process-hub
cp .env.example .env
npm install
node server/seed.js
npm start
# → http://localhost:3000
```

---

## 11. Architecture

```text
Navigateur
    │
    ▼
 Nginx :80  ──proxy──►  Node.js Express :3000
                            │
                            ├─ SQLite (data/rdprocess.db)
                            ├─ JWT auth
                            └─ Fichiers (public/uploads)
```

Processus métier R1b guidé : besoin → études → GO/NO GO → composants → proto → tests → livraison DG → archivage / R2 Vente, avec boucles « non conforme » et archivage NO GO.
