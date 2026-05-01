import { db } from '../db.js';

// Threads are keyed by (lo, hi) where lo = min(a, b). Lookup-or-create
// returns the canonical thread row for a pair of character ids.
export function findOrCreateThread(charA, charB) {
  if (charA === charB) throw new Error('cannot create a thread with yourself');
  const lo = Math.min(charA, charB);
  const hi = Math.max(charA, charB);
  let row = db.prepare('SELECT * FROM dm_threads WHERE char_lo = ? AND char_hi = ?').get(lo, hi);
  if (row) return row;
  const now = Date.now();
  const r = db.prepare(
    'INSERT INTO dm_threads (char_lo, char_hi, last_message_at) VALUES (?, ?, ?)'
  ).run(lo, hi, now);
  return db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(r.lastInsertRowid);
}

export function loadThread(threadId) {
  return db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
}

// The other party in a thread, given which side is asking.
export function otherParty(thread, viewerId) {
  return thread.char_lo === viewerId ? thread.char_hi : thread.char_lo;
}

// Either side has blocked the other? Returns the blocker_id if so.
export function blockBetween(charA, charB) {
  const row = db.prepare(`
    SELECT blocker_id FROM dm_blocks
    WHERE (blocker_id = ? AND blocked_id = ?)
       OR (blocker_id = ? AND blocked_id = ?)
    LIMIT 1
  `).get(charA, charB, charB, charA);
  return row?.blocker_id || null;
}

// Insert a message and update the thread's last_message_at. Returns the
// new row.
export function insertMessage(threadId, senderId, body) {
  const now = Date.now();
  const r = db.prepare(
    'INSERT INTO dm_messages (thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)'
  ).run(threadId, senderId, body, now);
  db.prepare('UPDATE dm_threads SET last_message_at = ? WHERE id = ?').run(now, threadId);
  // Sender has implicitly read up to and including their own message.
  db.prepare(`
    INSERT INTO dm_reads (thread_id, char_id, read_up_to) VALUES (?, ?, ?)
    ON CONFLICT(thread_id, char_id) DO UPDATE SET read_up_to = excluded.read_up_to
  `).run(threadId, senderId, r.lastInsertRowid);
  return db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(r.lastInsertRowid);
}

// List threads for a character with last-message preview + unread count.
export function listThreads(charId) {
  const rows = db.prepare(`
    SELECT t.id, t.char_lo, t.char_hi, t.last_message_at,
           c.id AS other_id, c.name AS other_name, c.avatar AS other_avatar,
           c.last_active_at AS other_last_active
    FROM dm_threads t
    JOIN characters c
      ON c.id = CASE WHEN t.char_lo = ? THEN t.char_hi ELSE t.char_lo END
    WHERE t.char_lo = ? OR t.char_hi = ?
    ORDER BY t.last_message_at DESC
  `).all(charId, charId, charId);
  const lastMsgStmt = db.prepare(
    'SELECT id, sender_id, body, created_at FROM dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1'
  );
  const readPtrStmt = db.prepare(
    'SELECT read_up_to FROM dm_reads WHERE thread_id = ? AND char_id = ?'
  );
  const unreadStmt = db.prepare(
    'SELECT COUNT(*) AS c FROM dm_messages WHERE thread_id = ? AND sender_id != ? AND id > ?'
  );
  return rows.map(r => {
    const last = lastMsgStmt.get(r.id);
    const ptr = readPtrStmt.get(r.id, charId);
    const unread = unreadStmt.get(r.id, charId, ptr?.read_up_to || 0).c;
    return {
      thread_id: r.id,
      other: { id: r.other_id, name: r.other_name, avatar: r.other_avatar, last_active_at: r.other_last_active },
      last_message: last ? { ...last, mine: last.sender_id === charId } : null,
      last_message_at: r.last_message_at,
      unread,
    };
  });
}

// Unread count across all threads — feeds the bell badge.
export function totalUnread(charId) {
  const r = db.prepare(`
    SELECT COUNT(*) AS c
    FROM dm_messages m
    JOIN dm_threads t ON t.id = m.thread_id
    LEFT JOIN dm_reads r ON r.thread_id = m.thread_id AND r.char_id = ?
    WHERE (t.char_lo = ? OR t.char_hi = ?)
      AND m.sender_id != ?
      AND m.id > COALESCE(r.read_up_to, 0)
  `).get(charId, charId, charId, charId);
  return r?.c || 0;
}

// Page through messages newest-first; the client reverses for display.
export function loadMessages(threadId, beforeId = null, limit = 50) {
  const lim = Math.min(200, Math.max(1, limit));
  if (beforeId) {
    return db.prepare(`
      SELECT id, sender_id, body, created_at
      FROM dm_messages
      WHERE thread_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `).all(threadId, beforeId, lim);
  }
  return db.prepare(`
    SELECT id, sender_id, body, created_at
    FROM dm_messages
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(threadId, lim);
}

export function markRead(threadId, charId, upToId = null) {
  const target = upToId
    ?? db.prepare('SELECT MAX(id) AS m FROM dm_messages WHERE thread_id = ?').get(threadId)?.m
    ?? 0;
  db.prepare(`
    INSERT INTO dm_reads (thread_id, char_id, read_up_to) VALUES (?, ?, ?)
    ON CONFLICT(thread_id, char_id) DO UPDATE SET
      read_up_to = MAX(dm_reads.read_up_to, excluded.read_up_to)
  `).run(threadId, charId, target);
  return target;
}
