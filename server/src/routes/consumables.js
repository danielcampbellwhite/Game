import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { CONSUMABLES, CONSUMABLE_CATS, consumableById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { applyVitalEffects, effectsToText } from '../services/vitals.js';
import { writeLog } from '../services/log.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const cooldowns = db.prepare('SELECT item_id, used_at FROM consumable_cooldowns WHERE char_id = ?').all(ch.id);
  const cdMap = Object.fromEntries(cooldowns.map(c => [c.item_id, c.used_at]));
  const items = CONSUMABLES.map(c => {
    const used = cdMap[c.id] || 0;
    const readyAt = used + c.cooldownMin * 60 * 1000;
    return { ...c, readyAt, ready: Date.now() >= readyAt };
  });
  res.json({ items, categories: CONSUMABLE_CATS });
});

router.post('/use', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const item = consumableById(req.body?.item_id);
  if (!item) return res.status(400).json({ error: 'Unknown item' });
  if (ch.cash < item.cost) return res.status(400).json({ error: `Need £${item.cost}` });

  const now = Date.now();
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?').get(ch.id, item.id);
  if (cd) {
    const readyAt = cd.used_at + item.cooldownMin * 60 * 1000;
    if (now < readyAt) return res.status(429).json({ error: 'On cooldown', readyAt });
  }

  ch.cash -= item.cost;
  const applied = applyVitalEffects(ch, item.effects);

  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, item.id, now);

  writeLog(ch.id, 'consume', `${item.emoji} ${item.name} — ${effectsToText(applied)} (-£${item.cost}).`, { item: item.id });
  saveCharacter(ch);
  res.json({ ok: true, applied, character: publicCharacter(ch) });
});

export default router;
