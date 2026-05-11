// The Fence — converts illegal money to legal money at a base 70%
// rate, modified by the Cleaner specialisation perk AND the player's
// relationship with their city's named fence NPC. Replaces the old
// laundering-by-business mechanic. Lives in every city's underworld.

import { Router } from 'express';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { specPerk } from '../data.js';
import { fenceFor } from '../data-npcs.js';
import { relationshipFor, bumpScore } from '../services/npcs.js';

const router = Router();

const FENCE_RATE = 0.70;
const FENCE_BUST_BASE = 0.04;
const FENCE_BUST_PER_100K = 0.01;
const FENCE_BUST_CAP = 0.30;

function bustChanceFor(amount) {
  return Math.min(FENCE_BUST_CAP, FENCE_BUST_BASE + (amount / 100000) * FENCE_BUST_PER_100K);
}

// Effective rate combines: base rate + Cleaner perk + NPC trust
// bonus (capped at +5%). Capped at 0.99 so the fence never loses
// money on a deal.
function effectiveRate(ch) {
  const npc = fenceFor(ch.city);
  const rel = npc ? relationshipFor(ch.id, npc.id) : null;
  const npcBonus = rel ? rel.band.bonus : 0;
  const perk = specPerk(ch, 'fence_rate_bonus');
  return {
    rate: Math.min(0.99, FENCE_RATE + perk + npcBonus),
    npc, rel, perk, npcBonus,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { rate, npc, rel, perk, npcBonus } = effectiveRate(ch);
  res.json({
    rate,
    illegalCash: ch.dirty_cash || 0,
    bust: {
      base: FENCE_BUST_BASE,
      per100k: FENCE_BUST_PER_100K,
      cap: FENCE_BUST_CAP,
    },
    npc: npc ? {
      id:    npc.id,
      name:  npc.name,
      blurb: npc.blurb,
      city:  npc.city,
      score: rel?.score || 0,
      band:  rel?.band  || { tier: 'stranger', label: 'Stranger', bonus: 0 },
    } : null,
    bonuses: {
      base:    FENCE_RATE,
      perkPct: Math.round(perk * 100),
      npcPct:  Math.round(npcBonus * 100),
    },
  });
});

router.post('/launder', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  if ((ch.dirty_cash || 0) < amount) return res.status(400).json({ error: 'Not enough illegal cash.' });

  const bust = bustChanceFor(amount);
  if (Math.random() < bust) {
    const jailMin = 25 + Math.floor(amount / 50000) + Math.floor(Math.random() * 20);
    ch.dirty_cash -= amount;
    applyJailSentence(ch, jailMin * 60 * 1000, `Fence was undercover — caught laundering £${amount.toLocaleString()}. ${jailMin} minutes inside.`);
    writeLog(ch.id, 'pvp', ` Fence sting — lost £${amount.toLocaleString()} illegal and jailed ${jailMin}m.`, { amount, jailMin }, true);
    saveCharacter(ch);
    return res.json({ ok: true, busted: true, jailMin, character: publicCharacter(ch) });
  }

  const { rate, npc } = effectiveRate(ch);
  const legal = Math.floor(amount * rate);
  ch.dirty_cash -= amount;
  ch.cash += legal;

  // Successful pass = +1 with the city's fence. Tightens the
  // relationship and slowly nudges the bonus band up. Quietly
  // ignored if no NPC is configured for this city.
  let newScore = null;
  if (npc) newScore = bumpScore(ch.id, npc.id, 1);

  writeLog(ch.id, 'shop',
    `Laundered £${amount.toLocaleString()} illegal → £${legal.toLocaleString()} legal${npc ? ` (${npc.name})` : ''}.`,
    { amount, legal, npc: npc?.id, npcScore: newScore });
  saveCharacter(ch);
  res.json({ ok: true, legal, lost: amount - legal, rate, newScore, character: publicCharacter(ch) });
});

export default router;
