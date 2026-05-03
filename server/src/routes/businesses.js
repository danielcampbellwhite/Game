import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { BUSINESSES, businessById, cityById, computeBusiness } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

const COLLECT_CAP_HOURS = 24;

// Hourly value of a level-N upgraded version of a founded business.
function decoratedHourly(template, sliders, level, city) {
  const { hourly } = computeBusiness(template, sliders.scale, sliders.risk, sliders.quality, city);
  return Math.floor(hourly * (1 + 0.15 * (level - 1)));
}

function pendingFor(row) {
  const template = businessById(row.business_id);
  if (!template) return 0;
  const elapsedMs = Date.now() - row.last_collected;
  const cappedMs = Math.min(elapsedMs, COLLECT_CAP_HOURS * 60 * 60 * 1000);
  const hours = cappedMs / (60 * 60 * 1000);
  return Math.floor(decoratedHourly(template, row, row.level, row.city) * hours);
}

function decorateOwned(row) {
  const template = businessById(row.business_id);
  if (!template) return null;
  const stats = computeBusiness(template, row.scale, row.risk, row.quality, row.city);
  return {
    id: row.id,
    template_id: row.business_id,
    template_name: template.name,
    emoji: template.emoji,
    name: row.custom_name || template.name,
    illegal: template.illegal,
    level: row.level,
    city: row.city,
    cityName: cityById(row.city)?.name,
    scale: row.scale,
    risk: row.risk,
    quality: row.quality,
    hourly: Math.floor(stats.hourly * (1 + 0.15 * (row.level - 1))),
    upgradeCost: Math.floor(stats.upgradeCost * row.level * 1.4),
    raidChance: stats.raidChance,
    pending: pendingFor(row),
    last_collected: row.last_collected,
    launderRate: template.launderRate || null,
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const owned = db.prepare('SELECT * FROM businesses_owned WHERE char_id = ?').all(ch.id)
    .map(decorateOwned).filter(Boolean);
  // Available templates in the current city, gated by level
  const templates = BUSINESSES.filter(t => ch.level >= t.levelGate).map(t => ({ ...t, city: ch.city }));
  res.json({ owned, templates, currentCity: ch.city, currentCityName: cityById(ch.city)?.name });
});

router.post('/preview', requireAuth, requireCharacter, (req, res) => {
  const { template_id, scale = 1, risk = 1, quality = 1 } = req.body || {};
  const t = businessById(template_id);
  if (!t) return res.status(400).json({ error: 'Unknown template' });
  const ch = req.character;
  if (ch.level < t.levelGate) return res.status(403).json({ error: `Requires level ${t.levelGate}` });
  res.json(computeBusiness(t, scale, risk, quality, ch.city));
});

router.post('/found', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { template_id, name, scale = 1, risk = 1, quality = 1 } = req.body || {};
  const t = businessById(template_id);
  if (!t) return res.status(400).json({ error: 'Unknown template' });
  if (ch.level < t.levelGate) return res.status(403).json({ error: `Requires level ${t.levelGate}` });

  const trimmedName = (name || '').trim();
  if (trimmedName.length < 2 || trimmedName.length > 32) {
    return res.status(400).json({ error: 'Name must be 2-32 characters' });
  }

  const stats = computeBusiness(t, scale, risk, quality, ch.city);
  if (ch.cash < stats.cost) return res.status(400).json({ error: `Need £${stats.cost.toLocaleString()}` });

  // One of each template per city per character (keeps "city portfolio" meaningful).
  const exists = db.prepare('SELECT id FROM businesses_owned WHERE char_id = ? AND business_id = ? AND city = ?')
    .get(ch.id, t.id, ch.city);
  if (exists) return res.status(409).json({ error: 'You already own a ' + t.name + ' in this city' });

  ch.cash -= stats.cost;
  db.prepare(`
    INSERT INTO businesses_owned (char_id, business_id, city, level, last_collected, custom_name, scale, risk, quality)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(ch.id, t.id, ch.city, Date.now(), trimmedName, scale, risk, quality);

  writeLog(ch.id, 'business', `Founded "${trimmedName}" — ${t.name} in ${cityById(ch.city)?.name} for £${stats.cost.toLocaleString()}.`, { template: t.id, scale, risk, quality });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/upgrade', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = req.body?.id;
  const row = db.prepare('SELECT * FROM businesses_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Not owned' });
  const template = businessById(row.business_id);
  if (!template) return res.status(404).json({ error: 'Template missing' });
  if (row.level >= 10) return res.status(400).json({ error: 'Max level' });
  const stats = computeBusiness(template, row.scale, row.risk, row.quality, row.city);
  const cost = Math.floor(stats.upgradeCost * row.level * 1.4);
  if (ch.cash < cost) return res.status(400).json({ error: `Need £${cost.toLocaleString()}` });
  ch.cash -= cost;
  db.prepare('UPDATE businesses_owned SET level = level + 1 WHERE id = ?').run(row.id);
  const name = row.custom_name || template.name;
  writeLog(ch.id, 'business', `Upgraded "${name}" to lvl ${row.level + 1} for £${cost.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

router.post('/collect', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = req.body?.id;
  const row = db.prepare('SELECT * FROM businesses_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Not owned' });
  const template = businessById(row.business_id);
  if (!template) return res.status(404).json({ error: 'Template missing' });
  const stats = computeBusiness(template, row.scale, row.risk, row.quality, row.city);
  const earnings = pendingFor(row);
  if (earnings <= 0) return res.status(400).json({ error: 'Nothing to collect yet' });

  // Raid roll. Quality reduces it; risk slider raises it.
  const raid = template.illegal && Math.random() < stats.raidChance;
  const businessName = row.custom_name || template.name;

  if (raid) {
    // Confiscation: the business is destroyed. Pending earnings are lost,
    // build cost is gone, and the row is removed. There's a 40% chance
    // the player also catches a sentence on the way out.
    db.prepare('DELETE FROM businesses_owned WHERE id = ?').run(row.id);
    let jailMin = 0;
    if (Math.random() < 0.4) {
      jailMin = 10 + Math.floor(Math.random() * 35);
      ch.jail_until = Date.now() + jailMin * 60 * 1000;
      ch.jail_reason = `Police raided "${businessName}" while you were on site — sentenced to ${jailMin} minutes.`;
    }
    writeLog(
      ch.id,
      'business',
      ` RAID at "${businessName}" — business confiscated, lost £${earnings.toLocaleString()} pending${jailMin ? `, jailed ${jailMin}m` : ''}.`,
      { biz: row.id, lost: earnings, jailMin, confiscated: true },
      true,
    );
    saveCharacter(ch);
    return res.json({ ok: true, raided: true, confiscated: true, lost: earnings, jailMin, character: publicCharacter(ch) });
  }

  if (template.illegal) ch.dirty_cash += earnings;
  else ch.cash += earnings;
  db.prepare('UPDATE businesses_owned SET last_collected = ? WHERE id = ?').run(Date.now(), row.id);
  writeLog(ch.id, 'business', `Collected £${earnings.toLocaleString()} from "${businessName}"${template.illegal ? ' (dirty)' : ''}.`);
  saveCharacter(ch);
  res.json({ ok: true, earnings, character: publicCharacter(ch) });
});

router.post('/launder', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const amount = Math.max(1, parseInt(req.body?.amount || 0, 10));
  const owned = db.prepare('SELECT * FROM businesses_owned WHERE char_id = ?').all(ch.id);
  const launderable = owned.map(o => ({ ...o, template: businessById(o.business_id) }))
    .filter(o => o.template?.launderRate);
  if (!launderable.length) return res.status(403).json({ error: 'Need a car wash, nightclub, or casino to launder.' });
  if (ch.dirty_cash < amount) return res.status(400).json({ error: 'Not enough dirty cash' });
  // Use the highest launder rate among owned fronts.
  const best = launderable.reduce((a, b) => a.template.launderRate > b.template.launderRate ? a : b);
  const clean = Math.floor(amount * best.template.launderRate);
  ch.dirty_cash -= amount;
  ch.cash += clean;
  const fname = best.custom_name || best.template.name;
  writeLog(ch.id, 'launder', `Laundered £${amount.toLocaleString()} dirty → £${clean.toLocaleString()} clean via "${fname}".`);
  saveCharacter(ch);
  res.json({ ok: true, clean, lost: amount - clean, character: publicCharacter(ch) });
});

export default router;
