const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  jwt = null;
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyHs256(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (sig !== expected) throw new Error('bad sig');
  const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('expired');
  return payload;
}

function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600
  };
  if (jwt) return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  return signHs256(payload);
}

function verifyToken(token) {
  if (jwt) return jwt.verify(token, JWT_SECRET);
  return verifyHs256(token);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      /* ignore */
    }
  }
  next();
}

module.exports = { signToken, authRequired, optionalAuth, JWT_SECRET };
