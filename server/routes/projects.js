const express = require('express');
const { db, createProjectSteps, PROCESS_STEPS } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function notify(userId, projectId, type, title, message) {
  db.prepare(
    `INSERT INTO notifications (user_id, project_id, type, title, message) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, projectId, type, title, message || null);
}

router.get('/', (req, res) => {
  const projects = db
    .prepare(
      `SELECT p.*, u.full_name AS owner_name,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count,
        (SELECT COUNT(*) FROM stock_items s WHERE s.project_id = p.id) AS stock_count
       FROM projects p
       LEFT JOIN users u ON u.id = p.owner_id
       ORDER BY p.updated_at DESC`
    )
    .all();
  res.json({ projects });
});

router.get('/stats', (req, res) => {
  const active = db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE status = 'actif'`).get().c;
  const tasksOpen = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status IN ('todo','in_progress','validation')`).get().c;
  const pendingValidations = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status = 'validation'`).get().c;
  const budget = db.prepare(`SELECT COALESCE(SUM(budget_spent),0) AS spent, COALESCE(SUM(budget_allocated),0) AS allocated FROM projects WHERE status = 'actif'`).get();
  const unread = db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user.id).c;
  res.json({
    projects_active: active,
    tasks_open: tasksOpen,
    validations_pending: pendingValidations,
    budget_spent: budget.spent,
    budget_allocated: budget.allocated,
    notifications_unread: unread
  });
});

router.post('/', (req, res) => {
  const { name, description, budget_allocated, deadline } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name requis' });
  const info = db
    .prepare(
      `INSERT INTO projects (name, description, budget_allocated, deadline, owner_id, current_step)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(name, description || null, budget_allocated || 0, deadline || null, req.user.id);

  const projectId = info.lastInsertRowid;
  createProjectSteps(projectId);
  db.prepare(`INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, 'responsable')`).run(
    projectId,
    req.user.id
  );

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  res.status(201).json({ project });
});

router.get('/:id', (req, res) => {
  const project = db
    .prepare(
      `SELECT p.*, u.full_name AS owner_name FROM projects p
       LEFT JOIN users u ON u.id = p.owner_id WHERE p.id = ?`
    )
    .get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });

  const members = db
    .prepare(
      `SELECT u.id, u.full_name, u.initials, u.role, pm.role_in_project
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?`
    )
    .all(project.id);

  const steps = db
    .prepare(`SELECT * FROM process_steps WHERE project_id = ? ORDER BY step_number`)
    .all(project.id);

  const features = db
    .prepare(`SELECT * FROM project_features WHERE project_id = ? ORDER BY id`)
    .all(project.id);

  res.json({ project, members, steps, features, process_definition: PROCESS_STEPS });
});

router.patch('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });

  const fields = ['name', 'description', 'status', 'budget_allocated', 'budget_spent', 'deadline', 'current_step'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  updates.push(`updated_at = datetime('now')`);
  values.push(project.id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ project: db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id) });
});

router.post('/:id/members', (req, res) => {
  const { user_id, role_in_project } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id requis' });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });
  db.prepare(
    `INSERT OR REPLACE INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)`
  ).run(project.id, user_id, role_in_project || 'membre');
  notify(user_id, project.id, 'membership', 'Ajouté au projet', `Vous avez été ajouté au projet « ${project.name} »`);
  res.status(201).json({ ok: true });
});

router.post('/:id/features', (req, res) => {
  const { title, description, status } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title requis' });
  const info = db
    .prepare(`INSERT INTO project_features (project_id, title, description, status) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, title, description || null, status || 'prevu');
  res.status(201).json({ feature: db.prepare('SELECT * FROM project_features WHERE id = ?').get(info.lastInsertRowid) });
});

// Process step update + GO/NO GO / conformité
router.patch('/:id/steps/:stepNumber', (req, res) => {
  const projectId = Number(req.params.id);
  const stepNumber = Number(req.params.stepNumber);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Projet introuvable' });

  const step = db
    .prepare(`SELECT * FROM process_steps WHERE project_id = ? AND step_number = ?`)
    .get(projectId, stepNumber);
  if (!step) return res.status(404).json({ error: 'Étape introuvable' });

  const { status, notes, data_json, decision } = req.body || {};

  // GO / NO GO (step 3)
  if (stepNumber === 3 && decision) {
    if (decision === 'NO_GO') {
      db.prepare(
        `UPDATE process_steps SET status = 'failed', notes = ?, data_json = ?, completed_at = datetime('now'), completed_by = ? WHERE id = ?`
      ).run(notes || 'NO GO', JSON.stringify({ decision: 'NO_GO', ...(data_json || {}) }), req.user.id, step.id);
      db.prepare(`UPDATE projects SET status = 'archive', go_decision = 'NO_GO', go_decided_at = datetime('now'), go_decided_by = ?, updated_at = datetime('now') WHERE id = ?`).run(
        req.user.id,
        projectId
      );
      return res.json({ ok: true, action: 'archived_nogo' });
    }
    if (decision === 'GO') {
      db.prepare(
        `UPDATE process_steps SET status = 'done', notes = ?, data_json = ?, completed_at = datetime('now'), completed_by = ? WHERE id = ?`
      ).run(notes || 'GO validé', JSON.stringify({ decision: 'GO', ...(data_json || {}) }), req.user.id, step.id);
      db.prepare(
        `UPDATE process_steps SET status = 'in_progress' WHERE project_id = ? AND step_number = 4`
      ).run(projectId);
      db.prepare(
        `UPDATE projects SET current_step = 4, go_decision = 'GO', go_decided_at = datetime('now'), go_decided_by = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(req.user.id, projectId);
      return res.json({ ok: true, action: 'go_approved', current_step: 4 });
    }
  }

  // Conformité tests (step 6) ou livraison (step 7)
  if ((stepNumber === 6 || stepNumber === 7) && decision === 'NON_CONFORME') {
    // retour étude capacités (step 2)
    db.prepare(
      `UPDATE process_steps SET status = 'failed', notes = ?, data_json = ?, completed_at = datetime('now'), completed_by = ? WHERE id = ?`
    ).run(notes || 'Non conforme', JSON.stringify({ decision: 'NON_CONFORME', ...(data_json || {}) }), req.user.id, step.id);
    db.prepare(`UPDATE process_steps SET status = 'in_progress' WHERE project_id = ? AND step_number = 2`).run(projectId);
    for (let n = 3; n <= 8; n++) {
      db.prepare(`UPDATE process_steps SET status = 'pending', completed_at = NULL WHERE project_id = ? AND step_number = ?`).run(projectId, n);
    }
    db.prepare(`UPDATE projects SET current_step = 2, updated_at = datetime('now') WHERE id = ?`).run(projectId);
    return res.json({ ok: true, action: 'loop_back', current_step: 2 });
  }

  if (status === 'done' || decision === 'CONFORME') {
    db.prepare(
      `UPDATE process_steps SET status = 'done', notes = COALESCE(?, notes), data_json = COALESCE(?, data_json), completed_at = datetime('now'), completed_by = ? WHERE id = ?`
    ).run(notes || null, data_json ? JSON.stringify(data_json) : null, req.user.id, step.id);

    const next = stepNumber + 1;
    if (next <= 8) {
      db.prepare(`UPDATE process_steps SET status = 'in_progress' WHERE project_id = ? AND step_number = ?`).run(projectId, next);
      db.prepare(`UPDATE projects SET current_step = ?, updated_at = datetime('now') WHERE id = ?`).run(next, projectId);
    } else {
      db.prepare(`UPDATE projects SET status = 'termine', current_step = 8, updated_at = datetime('now') WHERE id = ?`).run(projectId);
    }

    // notify members
    const members = db.prepare(`SELECT user_id FROM project_members WHERE project_id = ?`).all(projectId);
    for (const m of members) {
      if (m.user_id !== req.user.id) {
        notify(m.user_id, projectId, 'milestone', `Jalon validé : ${step.title}`, `Projet #${projectId}`);
      }
    }
    return res.json({ ok: true, action: 'step_done', current_step: Math.min(next, 8) });
  }

  if (notes !== undefined || data_json !== undefined || status) {
    db.prepare(
      `UPDATE process_steps SET notes = COALESCE(?, notes), data_json = COALESCE(?, data_json), status = COALESCE(?, status) WHERE id = ?`
    ).run(notes ?? null, data_json ? JSON.stringify(data_json) : null, status || null, step.id);
  }

  res.json({
    step: db.prepare(`SELECT * FROM process_steps WHERE id = ?`).get(step.id),
    project: db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId)
  });
});

module.exports = router;
