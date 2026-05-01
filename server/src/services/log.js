import { db } from '../db.js';

// `notify=true` flags this log row to surface in the notifications bell.
// Use it for "things that happened to you" (raids, busts, fired, bet
// settled, hospital expired) — not user-initiated routine actions.
export function writeLog(charId, type, message, meta = null, notify = false) {
  db.prepare(
    'INSERT INTO log (char_id, type, message, meta_json, created_at, notify) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(charId, type, message, meta ? JSON.stringify(meta) : null, Date.now(), notify ? 1 : 0);
}

export function recentLog(charId, limit = 30) {
  const rows = db.prepare(
    'SELECT id, type, message, meta_json, created_at FROM log WHERE char_id = ? ORDER BY id DESC LIMIT ?'
  ).all(charId, limit);
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    message: r.message,
    meta: r.meta_json ? JSON.parse(r.meta_json) : null,
    created_at: r.created_at,
  }));
}
