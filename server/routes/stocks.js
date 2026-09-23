const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const { project_id } = req.query;
  let items;
  if (project_id) {
    items = db.prepare(`SELECT * FROM stock_items WHERE project_id = ? OR project_id IS NULL ORDER BY reference`).all(project_id);
  } else {
    items = db.prepare(`SELECT * FROM stock_items ORDER BY reference`).all();
  }
  const totalValue = items.reduce((s, i) => s + (i.quantity * (i.unit_cost || 0)), 0);
  const below = items.filter((i) => i.quantity < i.threshold).length;
  res.json({ items, stats: { total_value: totalValue, below_threshold: below, count: items.length } });
});

router.post('/', (req, res) => {
  const { reference, designation, quantity, threshold, unit_cost, supplier, project_id } = req.body || {};
  if (!reference || !designation) return res.status(400).json({ error: 'reference et designation requis' });
  try {
    const info = db
      .prepare(
        `INSERT INTO stock_items (reference, designation, quantity, threshold, unit_cost, supplier, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reference,
        designation,
        quantity ?? 0,
        threshold ?? 5,
        unit_cost ?? 0,
        supplier || null,
        project_id || null
      );
    res.status(201).json({ item: db.prepare('SELECT * FROM stock_items WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Référence déjà existante' });
    throw e;
  }
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Article introuvable' });
  const fields = ['reference', 'designation', 'quantity', 'threshold', 'unit_cost', 'supplier', 'project_id'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  updates.push(`updated_at = datetime('now')`);
  values.push(item.id);
  db.prepare(`UPDATE stock_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ item: db.prepare('SELECT * FROM stock_items WHERE id = ?').get(item.id) });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stock_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
