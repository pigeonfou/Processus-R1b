const express = require('express');
const { db } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../password');

const router = express.Router();

/** Diagnostic public (sans secret) pour déboguer la connexion */
router.get('/status', (_req, res) => {
  try {
    const count = Number(db.prepare('SELECT COUNT(*) AS c FROM users').get().c);
    const admin = db.prepare('SELECT id, email FROM users WHERE email = ?').get('admin@rd.local');
    res.json({
      ok: true,
      users_count: count,
      has_admin: !!admin,
      hint: count === 0
        ? 'Aucun utilisateur — redémarrez le service pour lancer le seed'
        : 'Utilisez admin@rd.local / admin123'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/register', (req, res) => {
  const { email, password, full_name, role, initials } = req.body || {};
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password et full_name requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6)' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });

  const hash = hashPassword(password);
  const init = initials || full_name.split(' ').map((p) => p[0]).join('').slice(0, 3).toUpperCase();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, full_name, role, initials)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(String(email).toLowerCase().trim(), hash, full_name, role || 'membre', init);

  const user = db.prepare('SELECT id, email, full_name, role, initials FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '')
      .toLowerCase()
      .trim();
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'email et password requis' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      console.warn('[auth] Login échoué: utilisateur inconnu', email);
      return res.status(401).json({ error: 'Identifiants invalides (utilisateur inconnu)' });
    }

    const hash = user.password_hash;
    if (!hash) {
      console.warn('[auth] Login échoué: pas de hash pour', email);
      return res.status(401).json({ error: 'Identifiants invalides (compte corrompu — redémarrez le service)' });
    }

    if (!verifyPassword(password, hash)) {
      console.warn('[auth] Login échoué: mauvais mot de passe pour', email, 'hash_prefix=', String(hash).slice(0, 12));
      return res.status(401).json({ error: 'Identifiants invalides (mot de passe)' });
    }

    const safe = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      initials: user.initials
    };
    res.json({ user: safe, token: signToken(safe) });
  } catch (e) {
    console.error('[auth] Exception login', e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

router.get('/me', authRequired, (req, res) => {
  const user = db
    .prepare('SELECT id, email, full_name, role, initials, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user });
});

router.get('/users', authRequired, (req, res) => {
  const users = db.prepare('SELECT id, email, full_name, role, initials FROM users ORDER BY full_name').all();
  res.json({ users });
});

module.exports = router;
