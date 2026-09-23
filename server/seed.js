require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initSchema, createProjectSteps } = require('./db');

initSchema();

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count > 0) {
  console.log('Base déjà peuplée, seed ignoré.');
  process.exit(0);
}

const hash = bcrypt.hashSync('admin123', 10);
const users = [
  { email: 'admin@rd.local', name: 'Marie Dupont', role: 'admin', initials: 'MD' },
  { email: 'thomas@rd.local', name: 'Thomas Leroy', role: 'chef_projet', initials: 'TL' },
  { email: 'sophie@rd.local', name: 'Sophie Martin', role: 'technicien', initials: 'SM' }
];

const insertUser = db.prepare(
  `INSERT INTO users (email, password_hash, full_name, role, initials) VALUES (?, ?, ?, ?, ?)`
);
const ids = {};
for (const u of users) {
  const info = insertUser.run(u.email, hash, u.name, u.role, u.initials);
  ids[u.initials] = info.lastInsertRowid;
}

const pInfo = db
  .prepare(
    `INSERT INTO projects (name, description, current_step, status, budget_allocated, budget_spent, deadline, owner_id, go_decision, go_decided_at)
     VALUES (?, ?, 6, 'actif', 65000, 48200, '2025-10-12', ?, 'GO', datetime('now'))`
  )
  .run(
    'Capteur IoT v2',
    'Nouvelle génération de capteur IoT industriel',
    ids.TL
  );
const projectId = pInfo.lastInsertRowid;
createProjectSteps(projectId);

// mark steps 1-5 done, 6 in progress
for (let n = 1; n <= 5; n++) {
  db.prepare(
    `UPDATE process_steps SET status = 'done', completed_at = datetime('now') WHERE project_id = ? AND step_number = ?`
  ).run(projectId, n);
}
db.prepare(
  `UPDATE process_steps SET status = 'in_progress' WHERE project_id = ? AND step_number = 6`
).run(projectId);

db.prepare(`INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)`).run(projectId, ids.TL, 'responsable');
db.prepare(`INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)`).run(projectId, ids.MD, 'ingenieur');
db.prepare(`INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)`).run(projectId, ids.SM, 'technicien');

const tasks = [
  ['Préparer banc de test EMC', 'todo', 'urgent', ids.TL],
  ['Commander connecteurs M12', 'todo', 'stock', ids.SM],
  ['Tests de conformité IP67', 'in_progress', 'normal', ids.MD],
  ['Mesure consommation électrique', 'in_progress', 'normal', ids.TL],
  ['Rapport tests radio', 'validation', 'jalon', ids.TL],
  ['Prototypage PCB v2', 'done', 'normal', ids.SM]
];
const insTask = db.prepare(
  `INSERT INTO tasks (project_id, title, status, priority, assignee_id, created_by, step_number) VALUES (?, ?, ?, ?, ?, ?, 6)`
);
for (const t of tasks) insTask.run(projectId, t[0], t[1], t[2], t[3], ids.MD);

const stocks = [
  ['CONN-M12-8P', 'Connecteur M12 8 points', 3, 10, 4.85, 'RS Components'],
  ['MCU-STM32L4', 'Microcontrôleur STM32L4', 25, 15, 3.2, 'Mouser'],
  ['SENS-BME280', 'Capteur température/humidité', 12, 8, 2.9, 'Farnell'],
  ['BAT-LI-18650', 'Batterie Li-ion 18650', 6, 10, 7.5, 'Digi-Key'],
  ['PCB-IOT-V2', 'PCB Capteur IoT v2', 8, 5, 18.0, 'Eurocircuits']
];
const insStock = db.prepare(
  `INSERT INTO stock_items (reference, designation, quantity, threshold, unit_cost, supplier, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
);
for (const s of stocks) insStock.run(...s, projectId);

db.prepare(
  `INSERT INTO notifications (user_id, project_id, type, title, message) VALUES (?, ?, 'validation', 'Validation GO/NO GO requise', 'Module alimentation solaire')`
).run(ids.MD, projectId);

console.log('Seed OK.');
console.log('Comptes (mot de passe: admin123) :');
console.log('  admin@rd.local / Marie Dupont (admin)');
console.log('  thomas@rd.local / Thomas Leroy');
console.log('  sophie@rd.local / Sophie Martin');
