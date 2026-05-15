// Friends API — request / accept / reject / remove, plus the lists
// that power the Friends page and the player-profile button state.
//
// Everything is character-scoped: a friendship is between two ACTIVE
// characters. Permadeath / retirement ends the friendship (the row
// is left in place but the deceased character is gone, so the helper
// silently filters out missing characters).

import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  requestFriend, acceptFriend, rejectFriend, removeFriend,
  listAccepted, listIncoming, listOutgoing, statusFor,
} from '../services/friends.js';
import { loadCharacterById } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { sendEvent } from '../services/events.js';

const router = Router();

// Decorate a friendship row with the OTHER character's public info
// (name, avatar, level, faction, online presence). Returns null if
// the other side has been deleted / never existed — the route filters
// nulls out so a stale row is invisible rather than an error.
function decorate(row) {
  if (!row) return null;
  const other = loadCharacterById(row.other_id);
  if (!other) return null;
  return {
    id: row.id,
    other: {
      id: other.id,
      name: other.name,
      avatar: other.avatar,
      level: other.level,
      faction: other.faction || null,
    },
    status: row.status,
    requested_by: row.requested_by,
    created_at: row.created_at,
    accepted_at: row.accepted_at,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const me = req.character.id;
  res.json({
    accepted: listAccepted(me).map(decorate).filter(Boolean),
    incoming: listIncoming(me).map(decorate).filter(Boolean),
    outgoing: listOutgoing(me).map(decorate).filter(Boolean),
  });
});

// Lightweight helper for the Player profile page — tells the UI which
// button to render without pulling the whole friends list.
router.get('/status/:charId', requireAuth, requireCharacter, (req, res) => {
  const otherId = parseInt(req.params.charId, 10);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Bad char id.' });
  res.json({ status: statusFor(req.character.id, otherId) });
});

router.post('/request', requireAuth, requireCharacter, (req, res) => {
  const otherId = parseInt(req.body?.char_id, 10);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'char_id required.' });
  const other = loadCharacterById(otherId);
  if (!other) return res.status(404).json({ error: 'Character not found.' });
  const r = requestFriend(req.character.id, otherId);
  if (r.error) return res.status(400).json({ error: r.error });
  // Auto-accept path returns status='accepted'; notify both sides.
  if (r.status === 'accepted') {
    sendEvent(otherId, 'friend.accepted', { char_id: req.character.id, name: req.character.name });
    writeLog(req.character.id, 'social', ` ${other.name} is now your friend.`);
    // notify=true so the recipient sees a 🔔 alert — they didn't
    // initiate this, the auto-accept fired because they'd already
    // requested.
    writeLog(otherId, 'social', ` ${req.character.name} is now your friend.`, null, true);
  } else {
    sendEvent(otherId, 'friend.requested', { char_id: req.character.id, name: req.character.name });
    writeLog(req.character.id, 'social', `Sent a friend request to ${other.name}.`);
    // notify=true so the recipient gets a bell entry. SSE delivers
    // the live ping when they're online; the log row is what makes
    // the bell stay lit until they look at it.
    writeLog(otherId, 'social', ` ${req.character.name} sent you a friend request.`, null, true);
  }
  res.json(r);
});

router.post('/accept', requireAuth, requireCharacter, (req, res) => {
  const otherId = parseInt(req.body?.char_id, 10);
  const other = loadCharacterById(otherId);
  if (!other) return res.status(404).json({ error: 'Character not found.' });
  const r = acceptFriend(req.character.id, otherId);
  if (r.error) return res.status(400).json({ error: r.error });
  sendEvent(otherId, 'friend.accepted', { char_id: req.character.id, name: req.character.name });
  writeLog(req.character.id, 'social', ` ${other.name} is now your friend.`);
  // notify=true — the requester didn't trigger this acceptance, so
  // they should see it in the bell.
  writeLog(otherId, 'social', ` ${req.character.name} accepted your friend request.`, null, true);
  res.json(r);
});

router.post('/reject', requireAuth, requireCharacter, (req, res) => {
  const otherId = parseInt(req.body?.char_id, 10);
  const r = rejectFriend(req.character.id, otherId);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

router.delete('/', requireAuth, requireCharacter, (req, res) => {
  const otherId = parseInt(req.body?.char_id, 10);
  const r = removeFriend(req.character.id, otherId);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});

export default router;
