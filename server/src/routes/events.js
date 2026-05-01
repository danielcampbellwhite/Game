import { Router } from 'express';
import { verifyToken } from '../auth.js';
import { db } from '../db.js';
import { loadCharacter } from '../services/character.js';
import { registerStream, unregisterStream } from '../services/events.js';

const router = Router();

// EventSource doesn't allow custom request headers, so the token comes in
// on the query string for this endpoint only. Everything else continues to
// use the Authorization: Bearer header.
router.get('/', (req, res) => {
  const token = req.query?.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const ch = loadCharacter(user.id);
  if (!ch) return res.status(404).json({ error: 'No character' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial hello so the client knows the stream is live; also flushes any
  // proxy buffering.
  res.write(`event: hello\ndata: ${JSON.stringify({ char_id: ch.id, ts: Date.now() })}\n\n`);

  registerStream(ch.id, res);

  // Heartbeat every 25s — keeps idle proxies from killing the connection.
  const heartbeat = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unregisterStream(ch.id, res);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
});

export default router;
