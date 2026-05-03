// Apply a faction's starting perks to a fresh character. Called once
// from /character/create and /character/new-character right after the
// row is inserted with default vitals/equipment. Idempotent for safety
// but in practice only ever called per-character at creation time.

import { db } from '../db.js';
import { factionById, STAT_CAPS } from '../data.js';

const STAT_KEYS = ['strength', 'defence', 'speed', 'intelligence'];

export function applyFactionPerks(charId, factionId) {
  const fac = factionById(factionId);
  const perks = fac?.perks;
  if (!perks) return;

  // Stat deltas — clamped to [1, STAT_CAPS[stat]]. Negatives bite when
  // the player invested allocation points; the floor of 1 means they
  // can't be debuffed below the schema default.
  if (perks.stats) {
    const ch = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
    if (ch) {
      const updates = {};
      for (const stat of STAT_KEYS) {
        const delta = perks.stats[stat];
        if (delta == null) continue;
        const cap = STAT_CAPS[stat] || 999;
        updates[stat] = Math.max(1, Math.min(cap, (ch[stat] || 1) + delta));
      }
      if (Object.keys(updates).length) {
        const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const vals = Object.values(updates);
        db.prepare(`UPDATE characters SET ${set} WHERE id = ?`).run(...vals, charId);
      }
    }
  }

  // Cash bonuses (clean and dirty independently). Adds to whatever the
  // /create handler already seeded (default £500 clean).
  if (perks.cash) {
    db.prepare('UPDATE characters SET cash = cash + ? WHERE id = ?').run(perks.cash, charId);
  }
  if (perks.dirty_cash) {
    db.prepare('UPDATE characters SET dirty_cash = dirty_cash + ? WHERE id = ?').run(perks.dirty_cash, charId);
  }

  // Starting items — weapons/armour/drugs/misc. ON CONFLICT lets the
  // helper be safely re-run without duplicating rows.
  for (const item of perks.items || []) {
    db.prepare(`
      INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, ?, ?, ?)
      ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
    `).run(charId, item.kind, item.item_id, item.qty);
  }

  // Auto-equip a starting weapon (e.g. Mafia → switchblade). Caller is
  // expected to also ensure the weapon is in inventory above.
  if (perks.equip_weapon) {
    db.prepare('UPDATE characters SET equipped_weapon = ? WHERE id = ?').run(perks.equip_weapon, charId);
  }
}
