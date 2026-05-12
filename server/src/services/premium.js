// Premium currency + account-bound items. Gold Bars (the premium
// currency, paid for with real money in Phase 2) live on the user
// account — they survive character death, retirement, and prestige.
// Premium items (Jesko, Penthouse, Gold 1911) are stored in
// user_premium_inventory and "follow" whichever character the player
// currently runs.
//
// Inline migrations — the users.premium_points column and the
// user_premium_inventory table are both idempotent. Routes that need
// premium-aware behaviour should query this service rather than
// poking the tables directly.

import { db } from '../db.js';
import { premiumItemById } from '../data-premium.js';

try { db.exec('ALTER TABLE users ADD COLUMN premium_points INTEGER NOT NULL DEFAULT 0'); } catch {}

// Premium driving — points at a row in user_premium_inventory's
// premium_id (e.g. 'premium_koenigsegg_jesko'). Mutually exclusive
// with active_vehicle_id at the UI layer; clearing one clears the
// other on equip. Inline migration so we don't touch db.js.
try { db.exec('ALTER TABLE characters ADD COLUMN active_premium_vehicle_id TEXT'); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_premium_inventory (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind        TEXT    NOT NULL,
      premium_id  TEXT    NOT NULL,
      acquired_at INTEGER NOT NULL,
      UNIQUE (user_id, kind, premium_id)
    );
    CREATE INDEX IF NOT EXISTS idx_premium_inv_user ON user_premium_inventory(user_id);
  `);
} catch {}

export function getGoldBars(userId) {
  const row = db.prepare('SELECT premium_points FROM users WHERE id = ?').get(userId);
  return row?.premium_points || 0;
}

// Issue new Gold Bars — called by the admin grant endpoint (Phase 1)
// and the Stripe fulfillment webhook (Phase 2). Returns the new balance.
export function grantGoldBars(userId, amount) {
  const n = Math.max(0, Math.floor(amount));
  if (n === 0) return getGoldBars(userId);
  db.prepare('UPDATE users SET premium_points = premium_points + ? WHERE id = ?').run(n, userId);
  return getGoldBars(userId);
}

export function getUserPremiumInventory(userId) {
  return db.prepare(
    'SELECT * FROM user_premium_inventory WHERE user_id = ? ORDER BY acquired_at DESC'
  ).all(userId);
}

export function ownsPremiumItem(userId, premiumId) {
  const r = db.prepare(
    'SELECT 1 FROM user_premium_inventory WHERE user_id = ? AND premium_id = ?'
  ).get(userId, premiumId);
  return !!r;
}

// Atomic buy: debit Gold Bars, write the user_premium_inventory row.
// Returns { ok: true, balance, item } on success or { ok: false, error }
// on failure (insufficient Gold Bars, duplicate purchase, unknown SKU).
// Wrapped in BEGIN IMMEDIATE / COMMIT so the balance check and the
// inventory write commit together — same pattern as the PvP-cash
// helper, since this project runs node:sqlite (no db.transaction()).
export function buyPremiumItem(userId, premiumId) {
  const item = premiumItemById(premiumId);
  if (!item) return { ok: false, error: 'Unknown premium item.' };
  if (ownsPremiumItem(userId, item.id)) {
    return { ok: false, error: 'You already own this premium item.' };
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT premium_points FROM users WHERE id = ?').get(userId);
    const balance = row?.premium_points || 0;
    if (balance < item.premiumPrice) {
      db.exec('ROLLBACK');
      return { ok: false, error: `Need ${item.premiumPrice} Gold Bars — you have ${balance}.` };
    }
    db.prepare('UPDATE users SET premium_points = premium_points - ? WHERE id = ?')
      .run(item.premiumPrice, userId);
    db.prepare(`
      INSERT INTO user_premium_inventory (user_id, kind, premium_id, acquired_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, item.kind, item.id, Date.now());
    db.exec('COMMIT');
    return { ok: true, balance: balance - item.premiumPrice, item };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    return { ok: false, error: 'Purchase failed — try again.' };
  }
}

// Admin gate — used by the /admin-grant endpoint to refuse non-admins
// without a separate middleware. requireAuth only loads id+username,
// so we fetch is_admin directly.
export function isAdminUser(userId) {
  const r = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return !!r?.is_admin;
}

// ── Equip / drive helpers ─────────────────────────────────────────
//
// Premium items "follow" whichever character a user is currently
// running. To use one, the active character has to point AT the
// premium item — equipped_weapon for weapons, active_premium_vehicle_id
// for cars. These helpers do the verification (you own it AND it's
// the right kind) plus the column update in one place.

export function equipPremiumWeapon(userId, charId, premiumId) {
  const item = premiumItemById(premiumId);
  if (!item || item.kind !== 'weapon') return { error: 'Not a premium weapon.' };
  if (!ownsPremiumItem(userId, premiumId)) return { error: 'You don\'t own this premium item.' };
  db.prepare(`
    UPDATE characters
       SET equipped_weapon = ?, equipped_weapon_instance = NULL
     WHERE id = ?
  `).run(premiumId, charId);
  return { ok: true, equipped_weapon: premiumId };
}

export function equipPremiumVehicle(userId, charId, premiumId) {
  const item = premiumItemById(premiumId);
  if (!item || item.kind !== 'vehicle') return { error: 'Not a premium vehicle.' };
  if (!ownsPremiumItem(userId, premiumId)) return { error: 'You don\'t own this premium item.' };
  // Clear any normal active vehicle so the player can't be "driving
  // two cars at once". The normal car stays parked (vehicles_owned
  // row is untouched, just no longer the active reference).
  db.prepare(`
    UPDATE characters
       SET active_premium_vehicle_id = ?, active_vehicle_id = NULL
     WHERE id = ?
  `).run(premiumId, charId);
  return { ok: true, active_premium_vehicle_id: premiumId };
}

export function unequipPremiumVehicle(charId) {
  db.prepare('UPDATE characters SET active_premium_vehicle_id = NULL WHERE id = ?').run(charId);
  return { ok: true };
}
