import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const seen = ch.last_log_seen_at || 0;

  // Recent notify-flagged entries (last 30, regardless of seen, for the dropdown)
  const items = db.prepare(`
    SELECT id, type, message, meta_json, created_at
    FROM log
    WHERE char_id = ? AND notify = 1
    ORDER BY id DESC
    LIMIT 30
  `).all(ch.id).map(r => ({
    id: r.id, type: r.type, message: r.message,
    meta: r.meta_json ? JSON.parse(r.meta_json) : null,
    created_at: r.created_at,
    unread: r.created_at > seen,
  }));

  const unreadCount = db.prepare(
    'SELECT COUNT(*) as n FROM log WHERE char_id = ? AND notify = 1 AND created_at > ?'
  ).get(ch.id, seen).n;

  res.json({ items, unreadCount });
});

router.post('/seen', requireAuth, requireCharacter, (req, res) => {
  db.prepare('UPDATE characters SET last_log_seen_at = ? WHERE id = ?').run(Date.now(), req.character.id);
  res.json({ ok: true });
});

export default router;
