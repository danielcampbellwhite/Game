// The Fence — converts illegal money to legal money at a 70% rate,
// with a small chance of getting set up by an undercover. Lives in
// every city's underworld; replaces the previous laundering-by-
// business mechanic.

import { Router } from 'express';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const FENCE_RATE = 0.70;            // illegal £ → legal £ at 70%
const FENCE_BUST_BASE = 0.04;       // 4% base bust chance per pass
const FENCE_BUST_PER_100K = 0.01;   // +1% per £100k attempted
const FENCE_BUST_CAP = 0.30;        // never above 30%

function bustChanceFor(amount) {
  return Math.min(FENCE_BUST_CAP, FENCE_BUST_BASE + (amount / 100000) * FENCE_BUST_PER_100K);
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  res.json({
    rate: FENCE_RATE,
    illegalCash: ch.dirty_cash || 0,
    bust: {
      base: FENCE_BUST_BASE,
      per100k: FENCE_BUST_PER_100K,
      cap: FENCE_BUST_CAP,
    },
  });
});

router.post('/launder', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  if ((ch.dirty_cash || 0) < amount) return res.status(400).json({ error: 'Not enough illegal cash.' });

  const bust = bustChanceFor(amount);
  if (Math.random() < bust) {
    // Caught — money seized + jail time scaled by the size of the run.
    const jailMin = 25 + Math.floor(amount / 50000) + Math.floor(Math.random() * 20);
    ch.dirty_cash -= amount;
    applyJailSentence(ch, jailMin * 60 * 1000, `Fence was undercover — caught laundering £${amount.toLocaleString()}. ${jailMin} minutes inside.`);
    writeLog(ch.id, 'pvp', ` Fence sting — lost £${amount.toLocaleString()} illegal and jailed ${jailMin}m.`, { amount, jailMin }, true);
    saveCharacter(ch);
    return res.json({ ok: true, busted: true, jailMin, character: publicCharacter(ch) });
  }

  const legal = Math.floor(amount * FENCE_RATE);
  ch.dirty_cash -= amount;
  ch.cash += legal;
  writeLog(ch.id, 'shop', `Laundered £${amount.toLocaleString()} illegal → £${legal.toLocaleString()} legal at the fence.`, { amount, legal });
  saveCharacter(ch);
  res.json({ ok: true, legal, lost: amount - legal, character: publicCharacter(ch) });
});

export default router;
