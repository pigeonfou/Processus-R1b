const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function notify(userId, projectId, type, title, message) {
  if (!userId) return;
  db.prepare(
    `INSERT INTO notifications (user_id, project_id, type, title, message) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, projectId, type, title, message || null);
}

router.get('/', (req, res) => {
  const { project_id, status } = req.query;
  let sql = `
    SELECT t.*, u.full_name AS assignee_name, u.initials AS assignee_initials, p.name AS project_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE 1=1`;
  const params = [];
  if (project_id) {
    sql += ' AND t.project_id = ?';
    params.push(project_id);
  }
  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY t.updated_at DESC';
  res.json({ tasks: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { project_id, title, description, status, priority, assignee_id, is_group, due_date, step_number } =
    req.body || {};
  if (!project_id || !title) return res.status(400).json({ error: 'project_id et title requis' });

  const info = db
    .prepare(
      `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, is_group, due_date, step_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      project_id,
      title,
      description || null,
      status || 'todo',
      priority || 'normal',
      assignee_id || null,
      is_group ? 1 : 0,
      due_date || null,
      step_number || null,
      req.user.id
    );

  if (assignee_id && assignee_id !== req.user.id) {
    notify(assignee_id, project_id, 'task_assigned', `Tâche affectée : ${title}`, `Par ${req.user.full_name || req.user.email}`);
  }

  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

  const fields = ['title', 'description', 'status', 'priority', 'assignee_id', 'is_group', 'due_date', 'step_number'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(f === 'is_group' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ' });
  updates.push(`updated_at = datetime('now')`);
  values.push(task.id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
  if (req.body.assignee_id && req.body.assignee_id !== task.assignee_id) {
    notify(req.body.assignee_id, task.project_id, 'task_assigned', `Tâche affectée : ${updated.title}`, null);
  }
  if (req.body.status === 'validation') {
    // notify owner
    const owner = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(task.project_id);
    if (owner?.owner_id) {
      notify(owner.owner_id, task.project_id, 'validation', `Validation requise : ${updated.title}`, null);
    }
  }
  res.json({ task: updated });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
