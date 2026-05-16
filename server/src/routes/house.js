// House actions — gated to the player being physically INSIDE one of
// their own properties (current_location = 'home_<row id>'). This is
// the in-fiction "I'm at home, let me check the place" surface.
// Browsing the market and buying / selling property still lives at
// the Estate Agent in routes/properties.js.

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { propertyById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import {
  PROPERTY_MOD_SLOTS, PROPERTY_MODS, propertyModById,
  parseMods, propertyDefence, modsValue,
} from '../data-property-mods.js';

const router = Router();

// Resolve "which property am I standing inside" from the character's
// current_location slug. Returns the owned-row, the catalogue meta,
// or { error } when the slug isn't a home or doesn't belong to them.
function homeFromCurrentLocation(ch) {
  const m = /^home_(\d+)$/.exec(ch.current_location || '');
  if (!m) return { error: 'You have to be inside one of your properties.' };
  const id = parseInt(m[1], 10);
  const row = db.prepare('SELECT * FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return { error: 'That property isn\'t yours.' };
  return { row, meta: propertyById(row.property_id) };
}

// GET / — full status of the property the player is currently inside.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const h = homeFromCurrentLocation(ch);
  if (h.error) return res.status(400).json({ error: h.error });
  const { row, meta } = h;
  const mods = parseMods(row.mods_json);
  const fittedMods = Object.entries(mods).map(([slot, modId]) => {
    const mod = propertyModById(modId);
    return mod ? { slot, ...mod } : null;
  }).filter(Boolean);
  res.json({
    property: {
      id: row.id,
      property_id: row.property_id,
      name: meta?.name || 'Property',
      address: meta?.address || null,
      tier: meta?.tier || 1,
      tierLabel: meta?.tierLabel || null,
      city: row.city,
      cityName: cityById(row.city)?.name,
      bonuses: meta?.bonuses || {},
      garage:  meta?.garage  || 0,
      bookCost: meta?.cost   || 0,
      defence: propertyDefence(meta?.tier || 1, row.mods_json),
      modsValue: modsValue(row.mods_json),
    },
    fittedMods,
    slots: PROPERTY_MOD_SLOTS,
    modsCatalogue: PROPERTY_MODS,
  });
});

// POST /install-mod { mod_id } — fit or replace a mod in its slot.
// Replacing destroys the previous mod (no refund), same rule as the
// estate-agent endpoint.
router.post('/install-mod', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const h = homeFromCurrentLocation(ch);
  if (h.error) return res.status(400).json({ error: h.error });
  const { row, meta } = h;
  const mod = propertyModById(req.body?.mod_id);
  if (!mod) return res.status(400).json({ error: 'Unknown mod.' });
  if (ch.cash < mod.cost) return res.status(400).json({ error: `Need £${mod.cost.toLocaleString()}.` });
  const mods = parseMods(row.mods_json);
  mods[mod.slot] = mod.id;
  ch.cash -= mod.cost;
  db.prepare('UPDATE properties_owned SET mods_json = ? WHERE id = ?')
    .run(JSON.stringify(mods), row.id);
  writeLog(ch.id, 'property',
    `Installed ${mod.name} at ${meta?.name || 'a property'} (-£${mod.cost.toLocaleString()}).`,
    { property: row.id, mod: mod.id, cost: mod.cost });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// POST /uninstall-mod { slot } — strip a mod out (no refund).
router.post('/uninstall-mod', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const h = homeFromCurrentLocation(ch);
  if (h.error) return res.status(400).json({ error: h.error });
  const { row, meta } = h;
  const slot = req.body?.slot;
  if (!PROPERTY_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Unknown slot.' });
  const mods = parseMods(row.mods_json);
  if (!mods[slot]) return res.status(400).json({ error: 'Nothing fitted in that slot.' });
  const removedId = mods[slot];
  delete mods[slot];
  db.prepare('UPDATE properties_owned SET mods_json = ? WHERE id = ?')
    .run(JSON.stringify(mods), row.id);
  writeLog(ch.id, 'property',
    `Stripped the ${slot} mod out of ${meta?.name || 'a property'}.`,
    { property: row.id, slot, removed: removedId });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

export default router;
