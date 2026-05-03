import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { loadCharacterById, publicProfileFor } from '../services/character.js';
import {
  findOrCreateThread, loadThread, otherParty, blockBetween,
  insertMessage, listThreads, totalUnread, loadMessages, markRead,
} from '../services/dm.js';
import { sendEvent } from '../services/events.js';

const router = Router();

const MAX_BODY = 1500;
// Crude per-character rate limit. In-process map; resets on server reload,
// which is fine for this build.
const rateBuckets = new Map(); // char_id -> [timestamps]
function rateLimit(charId) {
  const now = Date.now();
  const bucket = (rateBuckets.get(charId) || []).filter(t => now - t < 60_000);
  if (bucket.length >= 20) return false;
  bucket.push(now);
  rateBuckets.set(charId, bucket);
  return true;
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    threads: listThreads(ch.id),
    total_unread: totalUnread(ch.id),
  });
});

router.get('/unread', requireAuth, requireCharacter, (req, res) => {
  res.json({ total_unread: totalUnread(req.character.id) });
});

router.get('/:threadId', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.threadId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad thread id' });
  const t = loadThread(id);
  if (!t) return res.status(404).json({ error: 'Thread not found' });
  if (t.char_lo !== req.character.id && t.char_hi !== req.character.id) {
    return res.status(403).json({ error: 'Not your thread' });
  }
  const beforeId = req.query.before ? parseInt(req.query.before, 10) : null;
  const messages = loadMessages(t.id, beforeId, 50);
  const otherId = otherParty(t, req.character.id);
  const other = loadCharacterById(otherId);
  res.json({
    thread: { id: t.id, other: other ? publicProfileFor(other, req.character.id, null, req.character.city) : null },
    messages: messages.reverse().map(m => ({ ...m, mine: m.sender_id === req.character.id })),
  });
});

// POST /api/messages/to/:targetId — send to a player by character id (auto-creates thread).
router.post('/to/:targetId', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const targetId = parseInt(req.params.targetId, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target id' });
  if (targetId === ch.id) return res.status(400).json({ error: "Can't message yourself" });
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found' });

  const blocker = blockBetween(ch.id, targetId);
  if (blocker === ch.id) return res.status(403).json({ error: "You've blocked this player. Unblock to message." });
  if (blocker === targetId) return res.status(403).json({ error: 'You cannot message this player.' });

  const body = (req.body?.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Empty message' });
  if (body.length > MAX_BODY) return res.status(400).json({ error: `Message too long (max ${MAX_BODY} chars)` });
  if (!rateLimit(ch.id)) return res.status(429).json({ error: 'Slow down — you\'re sending too many messages.' });

  const thread = findOrCreateThread(ch.id, targetId);
  const msg = insertMessage(thread.id, ch.id, body);

  // Push to the recipient's open SSE streams.
  sendEvent(targetId, 'dm.received', {
    thread_id: thread.id,
    message: { ...msg, mine: false },
    from: { id: ch.id, name: ch.name, avatar: ch.avatar },
    total_unread: totalUnread(targetId),
  });
  // Echo to the sender's own other tabs so they update too.
  sendEvent(ch.id, 'dm.sent', {
    thread_id: thread.id,
    message: { ...msg, mine: true },
  });

  res.json({ ok: true, thread_id: thread.id, message: { ...msg, mine: true } });
});

router.post('/:threadId/read', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.threadId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad thread id' });
  const t = loadThread(id);
  if (!t) return res.status(404).json({ error: 'Thread not found' });
  if (t.char_lo !== req.character.id && t.char_hi !== req.character.id) {
    return res.status(403).json({ error: 'Not your thread' });
  }
  const upTo = markRead(id, req.character.id, req.body?.up_to || null);
  // Bell badge updates immediately on read.
  sendEvent(req.character.id, 'dm.unread', { total_unread: totalUnread(req.character.id) });
  res.json({ ok: true, read_up_to: upTo });
});

//  Block list 

router.get('/blocks/list', requireAuth, requireCharacter, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.avatar
    FROM dm_blocks b JOIN characters c ON c.id = b.blocked_id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `).all(req.character.id);
  res.json({ blocks: rows });
});

router.post('/blocks/:targetId', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.targetId, 10);
  if (!Number.isFinite(id) || id === req.character.id) return res.status(400).json({ error: 'Bad target id' });
  const target = loadCharacterById(id);
  if (!target) return res.status(404).json({ error: 'Player not found' });
  db.prepare(`
    INSERT INTO dm_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)
    ON CONFLICT(blocker_id, blocked_id) DO NOTHING
  `).run(req.character.id, id, Date.now());
  res.json({ ok: true });
});

router.delete('/blocks/:targetId', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.targetId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad target id' });
  db.prepare('DELETE FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.character.id, id);
  res.json({ ok: true });
});

export default router;
