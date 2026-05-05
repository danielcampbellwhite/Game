import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { BUSINESSES, businessById, cityById, computeBusiness } from '../data.js';
import { saveCharacter, publicCharacter, applyJailSentence } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { factionBonusMul } from '../services/territories.js';

const router = Router();

const COLLECT_CAP_HOURS = 24;

// Hourly value of a level-N upgraded version of a founded business.
function decoratedHourly(template, sliders, level, city) {
  const { hourly } = computeBusiness(template, sliders.scale, sliders.risk, sliders.quality, city);
  return Math.floor(hourly * (1 + 0.15 * (level - 1)));
}

// Hours since last collect, capped at COLLECT_CAP_HOURS so an
// abandoned business doesn't print money/drugs forever.
function elapsedHours(row) {
  const elapsedMs = Date.now() - row.last_collected;
  const cappedMs = Math.min(elapsedMs, COLLECT_CAP_HOURS * 60 * 60 * 1000);
  return cappedMs / (60 * 60 * 1000);
}

function pendingFor(row) {
  const template = businessById(row.business_id);
  if (!template || template.produces) return 0;   // drug producers pay drugs, not cash
  return Math.floor(decoratedHourly(template, row, row.level, row.city) * elapsedHours(row));
}

// Drug producers — returns null for non-producers, or { drug, qty }
// when the template defines a `produces` field.
function pendingDrugFor(row) {
  const template = businessById(row.business_id);
  if (!template?.produces) return null;
  const perHour = template.produces.perHour * (1 + 0.15 * (row.level - 1));
  const qty = Math.floor(perHour * elapsedHours(row));
  return { drug: template.produces.drug, qty };
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
    hourly: template.produces ? 0 : Math.floor(stats.hourly * (1 + 0.15 * (row.level - 1))),
    upgradeCost: Math.floor(stats.upgradeCost * row.level * 1.4),
    raidChance: stats.raidChance,
    pending: pendingFor(row),
    pendingDrug: pendingDrugFor(row),
    produces: template.produces ? {
      drug: template.produces.drug,
      perHour: template.produces.perHour * (1 + 0.15 * (row.level - 1)),
    } : null,
    last_collected: row.last_collected,
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
  const drugYield = pendingDrugFor(row);
  if (!template.produces && earnings <= 0) return res.status(400).json({ error: 'Nothing to collect yet' });
  if (template.produces && (!drugYield || drugYield.qty <= 0)) return res.status(400).json({ error: 'Nothing to collect yet' });

  // Raid roll. Quality reduces it; risk slider raises it.
  const raid = template.illegal && Math.random() < stats.raidChance;
  const businessName = row.custom_name || template.name;

  if (raid) {
    // Confiscation: the business is destroyed. Pending take is lost,
    // build cost is gone, and the row is removed. 40% chance the
    // player also catches a sentence.
    db.prepare('DELETE FROM businesses_owned WHERE id = ?').run(row.id);
    let jailMin = 0;
    if (Math.random() < 0.4) {
      jailMin = 10 + Math.floor(Math.random() * 35);
      applyJailSentence(ch, jailMin * 60 * 1000, `Police raided "${businessName}" while you were on site — sentenced to ${jailMin} minutes.`);
    }
    const lostNote = template.produces
      ? `${drugYield.qty} ${drugYield.drug}`
      : `£${earnings.toLocaleString()}`;
    writeLog(
      ch.id,
      'business',
      ` RAID at "${businessName}" — business confiscated, lost ${lostNote} pending${jailMin ? `, jailed ${jailMin}m` : ''}.`,
      { biz: row.id, lost: earnings, drugLost: drugYield, jailMin, confiscated: true },
      true,
    );
    saveCharacter(ch);
    return res.json({ ok: true, raided: true, confiscated: true, lost: earnings, drugLost: drugYield, jailMin, character: publicCharacter(ch) });
  }

  // ── Drug-producing business: deposit drug units into inventory ──
  if (template.produces) {
    db.prepare(`
      INSERT INTO inventory (char_id, kind, item_id, qty) VALUES (?, 'drug', ?, ?)
      ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
    `).run(ch.id, drugYield.drug, drugYield.qty);
    db.prepare('UPDATE businesses_owned SET last_collected = ? WHERE id = ?').run(Date.now(), row.id);
    writeLog(ch.id, 'business', `Collected ${drugYield.qty} ${drugYield.drug} from "${businessName}".`, { biz: row.id, drug: drugYield.drug, qty: drugYield.qty });
    saveCharacter(ch);
    return res.json({ ok: true, drug: drugYield, character: publicCharacter(ch) });
  }

  // ── Cash-producing business: standard payout ──
  // Faction-controlled business territory in the city where the
  // business operates → bonus on the collected earnings.
  const bizMul = factionBonusMul(ch.faction, row.city, 'business');
  const finalEarnings = Math.floor(earnings * bizMul);
  if (template.illegal) ch.dirty_cash += finalEarnings;
  else ch.cash += finalEarnings;
  db.prepare('UPDATE businesses_owned SET last_collected = ? WHERE id = ?').run(Date.now(), row.id);
  writeLog(ch.id, 'business', `Collected £${finalEarnings.toLocaleString()} from "${businessName}"${template.illegal ? ' (illegal)' : ''}${bizMul > 1 ? ` (turf +${Math.round((bizMul - 1) * 100)}%)` : ''}.`);
  saveCharacter(ch);
  res.json({ ok: true, earnings, character: publicCharacter(ch) });
});

export default router;
