// Live chat — world / faction / gang. Each message is persisted to
// chat_messages and fanned out over SSE to every recipient who has an
// open event stream right now. DMs go through the existing /messages
// route; the chat widget UI talks to both endpoints.
//
// Scope resolution: the SERVER decides which scope a message belongs
// to based on the caller, so a client can't post into "another gang's"
// chat by spoofing a scope_id. The body's scope_id is only read for
// reads (you can browse another faction's public log? no — same rule
// applies: server picks scope from caller).

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { insertMessage, loadMessages, rateLimit } from '../services/chat.js';
import { broadcastAll, broadcastTo } from '../services/events.js';

const router = Router();

const CHANNELS = ['world', 'faction', 'gang'];

// Resolve which scope_id the caller belongs to for this channel.
// Returns { scopeId } on success or { error } if the player can't
// participate (no faction / no gang).
function scopeFor(ch, channel) {
  if (channel === 'world')   return { scopeId: '' };
  if (channel === 'faction') {
    if (!ch.faction) return { error: 'You\'re not affiliated with a faction.' };
    return { scopeId: ch.faction };
  }
  if (channel === 'gang') {
    const m = db.prepare('SELECT gang_id FROM gang_members WHERE char_id = ?').get(ch.id);
    if (!m?.gang_id) return { error: 'You\'re not in a gang.' };
    return { scopeId: String(m.gang_id) };
  }
  return { error: 'Unknown channel.' };
}

// Recipients for a channel + scope. World goes to every connected
// stream (broadcastAll handles that). Faction goes to every char in
// that faction; gang goes to every gang member.
function recipientCharIds(channel, scopeId) {
  if (channel === 'faction') {
    return db.prepare('SELECT id FROM characters WHERE faction = ?').all(scopeId).map(r => r.id);
  }
  if (channel === 'gang') {
    return db.prepare('SELECT char_id AS id FROM gang_members WHERE gang_id = ?').all(parseInt(scopeId, 10)).map(r => r.id);
  }
  return [];
}

// GET /api/chat/:channel?before=<id> — recent messages for the channel
// the caller is in. Returns oldest-first so the client appends without
// re-sorting.
router.get('/:channel', requireAuth, requireCharacter, (req, res) => {
  const channel = req.params.channel;
  if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Unknown channel.' });
  const s = scopeFor(req.character, channel);
  if (s.error) return res.json({ channel, scope_id: null, messages: [], unavailable: s.error });
  const beforeId = req.query.before ? parseInt(req.query.before, 10) : null;
  const messages = loadMessages(channel, s.scopeId, beforeId, 50);
  res.json({ channel, scope_id: s.scopeId || null, messages });
});

// POST /api/chat/:channel — send a message. Body: { body }. Scope is
// inferred from the caller — clients can't post into a foreign scope.
router.post('/:channel', requireAuth, requireCharacter, (req, res) => {
  const channel = req.params.channel;
  if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Unknown channel.' });
  const s = scopeFor(req.character, channel);
  if (s.error) return res.status(403).json({ error: s.error });
  if (!rateLimit(req.character.id, channel)) {
    return res.status(429).json({ error: 'Slow down — too many messages.' });
  }
  const r = insertMessage(channel, s.scopeId, req.character, req.body?.body);
  if (r.error) return res.status(400).json({ error: r.error });

  const message = {
    id: r.id,
    channel,
    scope_id: s.scopeId || null,
    char_id: req.character.id,
    name: req.character.name,
    faction: req.character.faction || null,
    body: (req.body?.body || '').toString().trim().slice(0, 500),
    created_at: Date.now(),
  };
  if (channel === 'world') {
    broadcastAll('chat.message', message);
  } else {
    broadcastTo(recipientCharIds(channel, s.scopeId), 'chat.message', message);
  }
  res.json({ ok: true, message });
});

export default router;
