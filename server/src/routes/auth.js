import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';

const router = Router();

// Lightweight email shape check — full RFC validation is overkill for a
// game signup; we just want "looks like an email" to catch typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Username, email and password are required.' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username 3+ chars, password 4+ chars.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: "That email doesn't look right." });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Username taken.' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail)) {
    return res.status(409).json({ error: 'That email is already registered.' });
  }
  const info = db.prepare('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(username, cleanEmail, hashPassword(password), Date.now());
  const token = signToken(info.lastInsertRowid);
  res.json({ token, user: { id: info.lastInsertRowid, username, email: cleanEmail } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken(user.id);
  const hasCharacter = !!db.prepare('SELECT id FROM characters WHERE user_id = ?').get(user.id);
  res.json({ token, user: { id: user.id, username: user.username, email: user.email }, hasCharacter });
});

export default router;
