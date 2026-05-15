import { verifyToken } from '../auth.js';
import { db } from '../db.js';
import { loadCharacter, applyTick } from '../services/character.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  // Stamp activity for multiplayer presence. We touch by user_id rather
  // than character_id to avoid an extra read; characters.user_id is a
  // unique foreign key. Only effective for users who have a character.
  db.prepare('UPDATE characters SET last_active_at = ? WHERE user_id = ?').run(Date.now(), user.id);
  next();
}

export function requireCharacter(req, res, next) {
  const ch = loadCharacter(req.user.id);
  if (!ch) return res.status(404).json({ error: 'No character. Create one first.' });
  // After death, the row sits in pending_new_character until the player
  // rolls a fresh character. Block normal gameplay; the new-character
  // creation endpoint sidesteps this guard.
  if (ch.status === 'pending_new_character') {
    return res.status(409).json({ error: 'Your character has been killed. Create a new one to continue.', new_character_required: true });
  }
  applyTick(ch);
  req.character = ch;
  next();
}

export function requireFreeCharacter(req, res, next) {
  const ch = req.character;
  const now = Date.now();
  if (ch.jail_until && ch.jail_until > now) {
    return res.status(409).json({ error: 'You are in jail', jail_until: ch.jail_until });
  }
  if (ch.hospital_until && ch.hospital_until > now) {
    return res.status(409).json({ error: 'You are in hospital', hospital_until: ch.hospital_until });
  }
  if (ch.travel_until && ch.travel_until > now) {
    return res.status(409).json({ error: 'You are travelling', travel_until: ch.travel_until });
  }
  // Intra-city travel — locks the character out of everything except
  // chat (which uses requireCharacter, not requireFreeCharacter) and
  // the per-tick maintenance reads. See services/locations.js.
  if (ch.intra_travel_until && ch.intra_travel_until > now) {
    return res.status(409).json({
      error: 'You are travelling across the city',
      intra_travel_until: ch.intra_travel_until,
      intra_travel_to:    ch.intra_travel_to,
      intra_travel_mode:  ch.intra_travel_mode,
    });
  }
  next();
}
