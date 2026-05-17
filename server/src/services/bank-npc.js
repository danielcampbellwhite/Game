// "First National" — an NPC character that exists solely to send
// official-looking DMs to players. Right now its only job is the
// forgot-PIN reminder, but anything that should look like it came
// from the bank goes through here.
//
// We carve out a dedicated system user + character row on first call
// and memoise the character id. The row is otherwise inert: it never
// logs in, never owns property, never moves city.

import { db } from '../db.js';
import { findOrCreateThread, insertMessage } from './dm.js';
import { sendEvent } from './events.js';

const BANK_NPC_USERNAME = '__bank_npc__';
const BANK_NPC_NAME     = 'First National';
let cachedId = null;

export function getOrCreateBankNpcId() {
  if (cachedId) return cachedId;
  // Look up first — common path after the first run.
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(BANK_NPC_USERNAME);
  if (existingUser) {
    const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(existingUser.id);
    if (ch) { cachedId = ch.id; return cachedId; }
  }
  // Create user (idempotent on the unique username) + character.
  const now = Date.now();
  let userId;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    const u = db.prepare(
      'INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(BANK_NPC_USERNAME, 'noreply@firstnational.local', '!disabled!', now);
    userId = u.lastInsertRowid;
  }
  const c = db.prepare(`
    INSERT INTO characters (
      user_id, name, avatar, city, faction, gender,
      strength, defence, speed, intelligence,
      last_tick, last_health_tick, bank_last_interest,
      equipped_weapon, equipped_armour, created_at,
      status
    ) VALUES (?, ?, '', 'london', 'civilian', 'unspecified', 1, 1, 1, 1, ?, ?, ?, 'fists', 'none', ?, 'alive')
  `).run(userId, BANK_NPC_NAME, now, now, now, now);
  cachedId = c.lastInsertRowid;
  return cachedId;
}

// Send a DM from the Bank NPC to a specific character. Same plumbing
// real player DMs use, so the recipient sees it in the same Messages
// thread list and gets the unread badge bump.
export function sendBankDm(toCharId, body) {
  const bankId = getOrCreateBankNpcId();
  if (bankId === toCharId) return;
  const thread = findOrCreateThread(bankId, toCharId);
  const msg = insertMessage(thread.id, bankId, body);
  // Mirror the SSE that routes/messages.js emits on a normal send so
  // the unread badge updates in real time on the recipient's phone.
  try {
    sendEvent(toCharId, 'dm.received', { thread_id: thread.id, message: msg });
    sendEvent(toCharId, 'dm.unread', { delta: 1 });
  } catch {}
  return msg;
}
