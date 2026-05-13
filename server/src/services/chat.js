// Live chat across three group channels (world / faction / gang) plus
// DMs (handled separately by services/dm.js — included in the widget
// UI but not in this table).
//
// Storage: every chat line lives in chat_messages with the channel +
// scope_id pair as the discriminator. World messages use scope_id=''
// (empty string, not NULL — keeps the index tight). Faction uses the
// faction slug; gang uses the gang_id as text.
//
// Retention: lazy prune to the last 200 per (channel, scope_id) on
// every insert. Keeps the table small without a cron.

import { db } from '../db.js';

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel     TEXT    NOT NULL,
      scope_id    TEXT    NOT NULL DEFAULT '',
      char_id     INTEGER NOT NULL,
      name        TEXT    NOT NULL,
      faction     TEXT,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_channel_scope_created
      ON chat_messages(channel, scope_id, created_at DESC);
  `);
} catch {}

const PER_CHANNEL_RETAIN = 200;
const MAX_BODY = 500;
// Rate limit: 10 messages / 30 seconds per character per channel.
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_MS = 30_000;
const rateBuckets = new Map(); // key=`${charId}:${channel}` -> timestamps[]

export function rateLimit(charId, channel) {
  const key = `${charId}:${channel}`;
  const now = Date.now();
  const bucket = (rateBuckets.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_COUNT) return false;
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

function sanitize(s) {
  return (s || '').toString().trim().slice(0, MAX_BODY);
}

// Insert + prune. The prune step deletes any row in (channel, scope_id)
// older than the 200th newest — kept inside the same transaction so
// nobody sees an over-sized window.
export function insertMessage(channel, scopeId, char, body) {
  const clean = sanitize(body);
  if (!clean) return { error: 'Message can\'t be empty.' };
  db.exec('BEGIN IMMEDIATE');
  try {
    const ins = db.prepare(`
      INSERT INTO chat_messages (channel, scope_id, char_id, name, faction, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(channel, scopeId || '', char.id, char.name, char.faction || null, clean, Date.now());
    // Prune oldest beyond the retention window for this scope.
    db.prepare(`
      DELETE FROM chat_messages
      WHERE channel = ? AND scope_id = ?
        AND id NOT IN (
          SELECT id FROM chat_messages
          WHERE channel = ? AND scope_id = ?
          ORDER BY id DESC LIMIT ?
        )
    `).run(channel, scopeId || '', channel, scopeId || '', PER_CHANNEL_RETAIN);
    db.exec('COMMIT');
    return { ok: true, id: ins.lastInsertRowid };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return { error: e.message };
  }
}

// Last `limit` messages for a channel/scope, oldest-first so the UI
// can append without re-sorting. `beforeId` paginates upward when the
// user scrolls past the initial window.
export function loadMessages(channel, scopeId, beforeId = null, limit = 50) {
  const safe = Math.min(100, Math.max(1, limit));
  const params = [channel, scopeId || ''];
  let where = 'channel = ? AND scope_id = ?';
  if (beforeId) { where += ' AND id < ?'; params.push(beforeId); }
  const rows = db.prepare(`
    SELECT id, channel, scope_id, char_id, name, faction, body, created_at
    FROM chat_messages
    WHERE ${where}
    ORDER BY id DESC
    LIMIT ?
  `).all(...params, safe);
  return rows.reverse();
}
