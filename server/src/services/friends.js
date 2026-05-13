// Character-to-character friendships. A friendship dies when either
// character is permadeathed / retired — by design, since friendships
// are between PLAYERS' active characters, and a new character starts
// social ties from zero.
//
// Schema is symmetric: every row stores the lower char_id in `char_lo`
// and the higher in `char_hi` so each pair has exactly one row. We
// keep `requested_by` for the UI (so the recipient can see "X added
// you" rather than the request feeling anonymous).

import { db } from '../db.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      char_lo       INTEGER NOT NULL,
      char_hi       INTEGER NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      requested_by  INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      accepted_at   INTEGER,
      UNIQUE (char_lo, char_hi)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_char_lo ON friendships(char_lo);
    CREATE INDEX IF NOT EXISTS idx_friend_char_hi ON friendships(char_hi);
  `);
} catch {}

function pair(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { lo, hi };
}

export function friendshipBetween(a, b) {
  const { lo, hi } = pair(a, b);
  return db.prepare(
    'SELECT * FROM friendships WHERE char_lo = ? AND char_hi = ?'
  ).get(lo, hi);
}

// Returns 'none' | 'pending_in' | 'pending_out' | 'accepted'. The
// directional values matter for the UI ("Accept request" vs "Cancel
// request" buttons).
export function statusFor(viewerCharId, otherCharId) {
  const f = friendshipBetween(viewerCharId, otherCharId);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'accepted';
  return f.requested_by === viewerCharId ? 'pending_out' : 'pending_in';
}

export function requestFriend(fromCharId, toCharId) {
  if (fromCharId === toCharId) return { error: 'You already get along great.' };
  const existing = friendshipBetween(fromCharId, toCharId);
  if (existing) {
    if (existing.status === 'accepted') return { error: 'Already friends.' };
    if (existing.requested_by === fromCharId) return { error: 'Request already sent.' };
    // Other side already requested us — auto-accept on a second outgoing.
    return acceptFriend(fromCharId, toCharId);
  }
  const { lo, hi } = pair(fromCharId, toCharId);
  const now = Date.now();
  db.prepare(`
    INSERT INTO friendships (char_lo, char_hi, status, requested_by, created_at)
    VALUES (?, ?, 'pending', ?, ?)
  `).run(lo, hi, fromCharId, now);
  return { ok: true, status: 'pending_out' };
}

export function acceptFriend(viewerCharId, otherCharId) {
  const f = friendshipBetween(viewerCharId, otherCharId);
  if (!f) return { error: 'No pending request.' };
  if (f.status === 'accepted') return { error: 'Already friends.' };
  if (f.requested_by === viewerCharId) return { error: 'Wait for them to accept — you sent the request.' };
  db.prepare(
    `UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE id = ?`
  ).run(Date.now(), f.id);
  return { ok: true, status: 'accepted' };
}

export function rejectFriend(viewerCharId, otherCharId) {
  const f = friendshipBetween(viewerCharId, otherCharId);
  if (!f) return { error: 'No pending request.' };
  if (f.status !== 'pending') return { error: 'No pending request.' };
  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  return { ok: true, status: 'none' };
}

export function removeFriend(viewerCharId, otherCharId) {
  const f = friendshipBetween(viewerCharId, otherCharId);
  if (!f) return { error: 'Not friends.' };
  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  return { ok: true, status: 'none' };
}

// Helpers used by the /api/friends route. Returns plain rows; the
// route layer joins with character info (name, avatar, faction, etc).
export function listAccepted(charId) {
  return db.prepare(`
    SELECT *, CASE WHEN char_lo = ? THEN char_hi ELSE char_lo END AS other_id
    FROM friendships
    WHERE status = 'accepted' AND (char_lo = ? OR char_hi = ?)
    ORDER BY accepted_at DESC
  `).all(charId, charId, charId);
}

export function listIncoming(charId) {
  return db.prepare(`
    SELECT *, CASE WHEN char_lo = ? THEN char_hi ELSE char_lo END AS other_id
    FROM friendships
    WHERE status = 'pending' AND requested_by != ?
      AND (char_lo = ? OR char_hi = ?)
    ORDER BY created_at DESC
  `).all(charId, charId, charId, charId);
}

export function listOutgoing(charId) {
  return db.prepare(`
    SELECT *, CASE WHEN char_lo = ? THEN char_hi ELSE char_lo END AS other_id
    FROM friendships
    WHERE status = 'pending' AND requested_by = ?
      AND (char_lo = ? OR char_hi = ?)
    ORDER BY created_at DESC
  `).all(charId, charId, charId, charId);
}

// One-shot counter for the nav badge. Pending INCOMING only — outgoing
// doesn't need a badge since the user knows they sent it.
export function pendingIncomingCount(charId) {
  const r = db.prepare(`
    SELECT COUNT(*) AS n FROM friendships
    WHERE status = 'pending' AND requested_by != ?
      AND (char_lo = ? OR char_hi = ?)
  `).get(charId, charId, charId);
  return r?.n || 0;
}
