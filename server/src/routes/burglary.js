// Burglary — break into another player's property in your current
// city. Roll attacker's stealth (intel + speed + a little luck)
// against the property's combined defence (tier baseline + installed
// mods, see data-property-mods.js). Success skims cash off the
// owner; failure rolls jail / hospital / clean escape.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { propertyById, cityById } from '../data.js';
import { propertyDefence, modsValue, parseMods } from '../data-property-mods.js';
import { saveCharacter, awardXp, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { sendEvent } from '../services/events.js';
import { addHeat } from '../services/heat.js';

const router = Router();

const ENERGY_COST       = 12;
const COOLDOWN_MS       = 60 * 60 * 1000;  // 1h between any two attempts
const HEAT_PER_ATTEMPT  = 10;
const MAX_LOOT          = 25_000;
const MIN_LOOT          = 500;

// Inline migration — single row per attacker so we can rate-limit
// attempts cleanly.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS burglary_cooldowns (
      char_id         INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      last_attempt_at INTEGER NOT NULL
    );
  `);
} catch {}

function cooldownFor(charId) {
  const row = db.prepare('SELECT last_attempt_at FROM burglary_cooldowns WHERE char_id = ?').get(charId);
  if (!row) return 0;
  return row.last_attempt_at + COOLDOWN_MS;
}
function stampCooldown(charId, now) {
  db.prepare(`
    INSERT INTO burglary_cooldowns (char_id, last_attempt_at) VALUES (?, ?)
    ON CONFLICT(char_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at
  `).run(charId, now);
}

// Stealth score for a would-be burglar. Higher intel + speed reads,
// plus a small random factor so the same player doesn't see exactly
// the same odds turn after turn.
function stealthFor(ch) {
  return Math.round((ch.intelligence + ch.speed) * 0.5 + Math.random() * 25);
}

router.get('/targets', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  // List player-owned properties in the same city, owner alive +
  // free (jailed / hospitalised / in transit owners aren't home).
  const now = Date.now();
  const rows = db.prepare(`
    SELECT po.id AS instance_id, po.char_id AS owner_id, po.property_id, po.city, po.mods_json,
           c.name AS owner_name, c.cash AS owner_cash
    FROM properties_owned po
    JOIN characters c ON c.id = po.char_id
    WHERE po.city = ? AND po.char_id != ?
      AND COALESCE(c.status, 'alive') = 'alive'
    ORDER BY c.cash DESC LIMIT 40
  `).all(ch.city, ch.id);
  const targets = rows.map(r => {
    const meta = propertyById(r.property_id);
    if (!meta || meta.tier == null) return null;
    const defence = propertyDefence(meta.tier, r.mods_json);
    return {
      instance_id: r.instance_id,
      owner: { id: r.owner_id, name: r.owner_name },
      property: {
        name: meta.name,
        address: meta.address,
        tier: meta.tier,
        tierLabel: meta.tierLabel,
      },
      defence,
      modsValue: modsValue(r.mods_json),
      installedSlots: Object.keys(parseMods(r.mods_json)).length,
    };
  }).filter(Boolean);

  res.json({
    targets,
    yourStealth: Math.round((ch.intelligence + ch.speed) * 0.5),
    cooldownUntil: cooldownFor(ch.id),
    energyCost: ENERGY_COST,
  });
});

router.post('/attempt', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.body?.instance_id, 10);
  if (!id) return res.status(400).json({ error: 'Missing target.' });
  const target = db.prepare(`
    SELECT po.*, c.name AS owner_name, c.cash AS owner_cash, c.status AS owner_status
    FROM properties_owned po
    JOIN characters c ON c.id = po.char_id
    WHERE po.id = ?
  `).get(id);
  if (!target) return res.status(404).json({ error: 'Property not found.' });
  if (target.char_id === ch.id) return res.status(400).json({ error: "You can't burgle your own property." });
  if (target.city !== ch.city) return res.status(403).json({ error: `Must be in ${cityById(target.city)?.name} to attempt.` });
  if ((target.owner_status || 'alive') !== 'alive') return res.status(409).json({ error: "The owner's no longer in residence." });
  if (ch.energy < ENERGY_COST) return res.status(400).json({ error: `Need ${ENERGY_COST} energy.` });

  const now = Date.now();
  const readyAt = cooldownFor(ch.id);
  if (now < readyAt) {
    return res.status(429).json({
      error: 'Too soon — the cops would notice another job this close together.',
      cooldownUntil: readyAt,
    });
  }

  const meta = propertyById(target.property_id);
  if (!meta) return res.status(400).json({ error: 'Property catalogue missing.' });

  ch.energy -= ENERGY_COST;
  const defence = propertyDefence(meta.tier, target.mods_json);
  const stealth = stealthFor(ch);
  const succeeded = stealth > defence;

  stampCooldown(ch.id, now);

  let result;
  if (succeeded) {
    // Take 3–8% of victim's liquid cash, capped at MAX_LOOT to stop a
    // single break-in from emptying a whale's wallet. The MIN_LOOT
    // floor only applies up to whatever the victim actually has —
    // otherwise burgling a broke alt would mint cash from nothing
    // (see burglary mint exploit). The burglar's payout is always
    // exactly what the victim loses.
    const pct = 0.03 + Math.random() * 0.05;
    const ownerCash = Math.max(0, target.owner_cash || 0);
    const rawTake = Math.floor(ownerCash * pct);
    const take = Math.min(MAX_LOOT, ownerCash, Math.max(MIN_LOOT, rawTake));
    db.prepare('UPDATE characters SET cash = MAX(0, cash - ?) WHERE id = ?').run(take, target.char_id);
    ch.cash += take;
    // XP / rep / happiness only when there was real cash to take —
    // otherwise burgling a string of broke alts becomes a passive
    // XP/rep farm even with the cash payout gated.
    const xp = take > 0 ? 80 + Math.floor(meta.tier * 30) : 0;
    if (xp > 0) awardXp(ch, xp);
    if (take > 0) {
      ch.reputation += 12;
      ch.happiness = Math.min(100, ch.happiness + 2);
    }
    writeLog(ch.id, 'crime',
      `Broke into ${meta.name} (${target.owner_name}) — took £${take.toLocaleString()} (stealth ${stealth} vs def ${defence}, +${xp}xp).`,
      { burglary: true, target: target.char_id, take, xp });
    writeLog(target.char_id, 'crime',
      ` ${meta.name} was broken into — £${take.toLocaleString()} taken.`,
      { burglar: ch.id, take, instance_id: id }, true);
    sendEvent(target.char_id, 'burglary', { burglar: ch.name, take, property: meta.name });
    result = { ok: true, success: true, take, xp, stealth, defence, owner_name: target.owner_name, property_name: meta.name };
  } else {
    // Failure: 35% jail, 25% hospital, 40% escape clean.
    const consequence = Math.random();
    if (consequence < 0.35) {
      const mins = 15 + Math.floor(Math.random() * 25);
      const msg = `Tripped the alarm at ${meta.name}. Caught and jailed ${mins}m.`;
      applyJailSentence(ch, mins * 60 * 1000, msg);
      writeLog(ch.id, 'crime', msg, { jail_min: mins, burglary: true }, true);
      writeLog(target.char_id, 'crime',
        ` ${meta.name} attempted break-in — alarm tripped, burglar arrested.`,
        { burglar: ch.id, instance_id: id }, true);
      sendEvent(target.char_id, 'burglary', { foiled: true, burglar: ch.name, property: meta.name });
      result = { ok: true, success: false, jailed: true, jail_min: mins, stealth, defence };
    } else if (consequence < 0.60) {
      const mins = 10 + Math.floor(Math.random() * 15);
      ch.hospital_until = now + mins * 60 * 1000;
      ch.health = Math.max(1, Math.floor(ch.health * 0.4));
      ch.hospital_reason = `Roughed up by security at ${meta.name}.`;
      writeLog(ch.id, 'crime',
        `Security at ${meta.name} put you on a stretcher. Hospital ${mins}m.`,
        { hosp_min: mins, burglary: true }, true);
      writeLog(target.char_id, 'crime',
        ` ${meta.name} attempted break-in — guards saw them off.`,
        { burglar: ch.id, instance_id: id }, true);
      result = { ok: true, success: false, hospital: true, hosp_min: mins, stealth, defence };
    } else {
      ch.happiness = Math.max(0, ch.happiness - 1);
      writeLog(ch.id, 'crime', `Bailed mid-break at ${meta.name}. Got out clean.`, { burglary: true });
      result = { ok: true, success: false, escaped: true, stealth, defence };
    }
  }

  addHeat(ch, HEAT_PER_ATTEMPT);
  saveCharacter(ch);
  res.json({ ...result, cooldownUntil: now + COOLDOWN_MS, character: publicCharacter(ch) });
});

export default router;
