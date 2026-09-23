const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 20);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

router.get('/', (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id requis' });
  const docs = db
    .prepare(
      `SELECT d.*, u.full_name AS uploader_name
       FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.project_id = ? ORDER BY d.created_at DESC`
    )
    .all(project_id);
  res.json({ documents: docs });
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const project_id = req.body.project_id;
  if (!project_id) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'project_id requis' });
  }
  const info = db
    .prepare(
      `INSERT INTO documents (project_id, filename, original_name, mime_type, size_bytes, step_number, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      project_id,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.body.step_number || null,
      req.user.id
    );
  res.status(201).json({ document: db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid) });
});

router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const fp = path.join(UPLOAD_DIR, doc.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  res.json({ ok: true });
});

module.exports = router;
