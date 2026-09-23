# R&D Process Hub

Plateforme web collaborative pour **gérer et guider le processus de création de produit** dans un bureau R&D (processus **R1b – Conception**).

## Fonctionnalités

- Guidage étape par étape du processus R1b (stepper + décisions GO/NO GO et conformité)
- Projets, fonctionnalités, documentation
- Tâches individuelles et de groupe (Kanban)
- Stocks matériaux / pièces détachées et coûts d’achat
- Stockage de documents (upload)
- Notifications (validation de jalons, affectation de tâches)
- Authentification JWT et multi-utilisateurs
- Base de données **SQL (SQLite)**

## Démarrage rapide (développement)

```bash
cp .env.example .env
npm install
node server/seed.js
npm start
```

Ouvrir [http://localhost:3000](http://localhost:3000) — compte démo `admin@rd.local` / `admin123`.

## Installation production (Ubuntu)

Voir le guide complet : **[INSTALL.md](./INSTALL.md)**

```bash
chmod +x scripts/install-ubuntu.sh
sudo ./scripts/install-ubuntu.sh
```

## Structure

```text
rd-process-hub/
├── INSTALL.md              # Guide d'installation / déploiement Ubuntu
├── README.md
├── package.json
├── .env.example
├── scripts/install-ubuntu.sh
├── server/                 # API Express + SQLite
│   ├── index.js
│   ├── db.js
│   ├── seed.js
│   ├── middleware/
│   └── routes/
└── public/                 # Interface web
    ├── index.html
    └── js/
```

## Licence

Usage interne / adapter selon votre organisation.
