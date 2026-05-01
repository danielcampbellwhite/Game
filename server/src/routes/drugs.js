import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { DRUGS, DRUG_USE_EFFECTS, drugById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { applyVitalEffects, effectsToText } from '../services/vitals.js';
import { bumpMission } from '../services/missions.js';
import { writeLog } from '../services/log.js';
import { getDrugMarketForCity, getDrugPrice } from '../services/market.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const market = getDrugMarketForCity(ch.city);
  const inventory = db.prepare('SELECT item_id as id, qty FROM inventory WHERE char_id = ? AND kind = ?').all(ch.id, 'drug');
  // include cooldowns for "use my own stash"
  const cds = db.prepare("SELECT item_id, used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id LIKE 'drug_%'").all(ch.id);
  const cdMap = Object.fromEntries(cds.map(r => [r.item_id.replace(/^drug_/, ''), r.used_at]));
  const useEffects = Object.fromEntries(Object.entries(DRUG_USE_EFFECTS).map(([id, def]) => {
    const used = cdMap[id] || 0;
    const readyAt = used + def.cooldownMin * 60 * 1000;
    return [id, { ...def, readyAt, ready: Date.now() >= readyAt }];
  }));
  res.json({ market, inventory, city: ch.city, useEffects });
});

router.post('/buy', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const drug = drugById(req.body?.drug_id);
  const qty = Math.max(1, parseInt(req.body?.qty || 0, 10));
  if (!drug) return res.status(400).json({ error: 'Unknown drug' });
  if (ch.level < drug.levelGate) return res.status(403).json({ error: `Requires level ${drug.levelGate}` });
  const price = getDrugPrice(ch.city, drug.id);
  const cost = price * qty;
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost}` });
  ch.cash -= cost;
  db.prepare(`
    INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, 'drug', ?, ?)
    ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
  `).run(ch.id, drug.id, qty);
  writeLog(ch.id, 'drugs', `Bought ${qty} ${drug.name} @ £${price} (-£${cost}).`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/sell', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const drug = drugById(req.body?.drug_id);
  const qty = Math.max(1, parseInt(req.body?.qty || 0, 10));
  if (!drug) return res.status(400).json({ error: 'Unknown drug' });
  const inv = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'drug', drug.id);
  if (!inv || inv.qty < qty) return res.status(400).json({ error: 'Not enough stock' });
  const price = getDrugPrice(ch.city, drug.id);
  const earn = price * qty;
  ch.dirty_cash += earn;
  if (inv.qty === qty) {
    db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').run(ch.id, 'drug', drug.id);
  } else {
    db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?').run(qty, ch.id, 'drug', drug.id);
  }
  bumpMission(ch, 'drug_sale', qty, { drug: drug.id });
  writeLog(ch.id, 'drugs', `Sold ${qty} ${drug.name} @ £${price} (+£${earn} dirty).`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/use', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const drug = drugById(req.body?.drug_id);
  if (!drug) return res.status(400).json({ error: 'Unknown drug' });
  const def = DRUG_USE_EFFECTS[drug.id];
  if (!def) return res.status(400).json({ error: 'Cannot use that' });
  const inv = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'drug', drug.id);
  if (!inv || inv.qty < 1) return res.status(400).json({ error: 'No stash to use' });

  const cdKey = `drug_${drug.id}`;
  const now = Date.now();
  const cd = db.prepare('SELECT used_at FROM consumable_cooldowns WHERE char_id = ? AND item_id = ?').get(ch.id, cdKey);
  if (cd) {
    const readyAt = cd.used_at + def.cooldownMin * 60 * 1000;
    if (now < readyAt) return res.status(429).json({ error: 'On cooldown', readyAt });
  }

  // consume one unit
  if (inv.qty === 1) {
    db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').run(ch.id, 'drug', drug.id);
  } else {
    db.prepare('UPDATE inventory SET qty = qty - 1 WHERE char_id = ? AND kind = ? AND item_id = ?').run(ch.id, 'drug', drug.id);
  }

  const applied = applyVitalEffects(ch, def.effects);
  db.prepare(`
    INSERT INTO consumable_cooldowns (char_id, item_id, used_at) VALUES (?, ?, ?)
    ON CONFLICT(char_id, item_id) DO UPDATE SET used_at = excluded.used_at
  `).run(ch.id, cdKey, now);

  writeLog(ch.id, 'consume', `Used 1 ${drug.name} from stash — ${effectsToText(applied)}.`, { drug: drug.id });
  saveCharacter(ch);
  res.json({ ok: true, applied, character: publicCharacter(ch) });
});

export default router;
