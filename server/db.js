const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'rdprocess.db');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(DB_PATH);

const db = new DatabaseSync(DB_PATH);
try { db.exec('PRAGMA journal_mode = DELETE;'); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'membre',
      initials TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      current_step INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'actif',
      budget_allocated REAL DEFAULT 0,
      budget_spent REAL DEFAULT 0,
      deadline TEXT,
      owner_id INTEGER REFERENCES users(id),
      go_decision TEXT,
      go_decided_at TEXT,
      go_decided_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_in_project TEXT DEFAULT 'membre',
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS process_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      data_json TEXT,
      completed_at TEXT,
      completed_by INTEGER REFERENCES users(id),
      UNIQUE(project_id, step_number)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT DEFAULT 'normal',
      assignee_id INTEGER REFERENCES users(id),
      is_group INTEGER DEFAULT 0,
      due_date TEXT,
      step_number INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      threshold INTEGER NOT NULL DEFAULT 5,
      unit_cost REAL DEFAULT 0,
      supplier TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      step_number INTEGER,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'prevu'
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
  `);
}

const PROCESS_STEPS = [
  { n: 1, key: 'besoin', title: 'Mise en forme du besoin' },
  { n: 2, key: 'etudes', title: 'Études capacités & investissement' },
  { n: 3, key: 'go_nogo', title: 'GO / NO GO' },
  { n: 4, key: 'composants', title: 'Recherche composants & matériels' },
  { n: 5, key: 'proto', title: 'Fabrication / Prototypage' },
  { n: 6, key: 'tests', title: 'Tests de conformité' },
  { n: 7, key: 'livraison', title: 'Livraison DG' },
  { n: 8, key: 'archivage', title: 'Archivage → R2 Vente' }
];

function createProjectSteps(projectId) {
  const insert = db.prepare(`
    INSERT INTO process_steps (project_id, step_number, step_key, title, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const s of PROCESS_STEPS) {
    insert.run(projectId, s.n, s.key, s.title, s.n === 1 ? 'in_progress' : 'pending');
  }
}

module.exports = { db, initSchema, PROCESS_STEPS, createProjectSteps, DB_PATH };
