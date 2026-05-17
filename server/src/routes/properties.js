import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { PROPERTIES, propertyById, cityById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import {
  PROPERTY_MOD_SLOTS,
  PROPERTY_MODS,
  propertyModById,
  parseMods,
  propertyDefence,
  modsValue,
} from '../data-property-mods.js';
import { HANGAR_PURCHASE_COST, loadHangar, buyHangar, hangarSummary } from '../services/hangar.js';

// Inline migration so we don't have to touch db.js. Adds the mods
// blob (slot → mod id) and the for-sale price column to the existing
// properties_owned table. Idempotent.
try { db.exec("ALTER TABLE properties_owned ADD COLUMN mods_json TEXT NOT NULL DEFAULT '{}'"); } catch {}
try { db.exec('ALTER TABLE properties_owned ADD COLUMN for_sale_price INTEGER'); } catch {}
try { db.exec('ALTER TABLE properties_owned ADD COLUMN listed_at INTEGER'); } catch {}

const router = Router();

// Tax skim on player-to-player property sales — same 5% sink the
// shop and trade systems use.
const SALE_TAX_PCT = 0.05;

function enrichRow(row) {
  const meta = propertyById(row.property_id);
  if (!meta) return null;
  const def = propertyDefence(meta.tier || 1, row.mods_json);
  return {
    ...row,
    name: meta.name,
    address: meta.address,
    tier: meta.tier,
    tierLabel: meta.tierLabel,
    bonuses: meta.bonuses,
    garage: meta.garage,
    bookCost: meta.cost,
    cityName: cityById(row.city)?.name,
    mods: parseMods(row.mods_json),
    defence: def,
    modsValue: modsValue(row.mods_json),
  };
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const ownedRows = db.prepare('SELECT * FROM properties_owned WHERE char_id = ?').all(ch.id);
  const owned = ownedRows.map(enrichRow).filter(Boolean);
  const ownedIds = new Set(owned.map(p => p.property_id));

  // Estate-agent listings (developer-set catalogue, same city).
  const forSale = PROPERTIES
    .filter(p => p.city === ch.city && !ownedIds.has(p.id))
    .map(p => ({
      ...p,
      cityName: cityById(p.city)?.name,
      locked: ch.level < (p.levelGate || 1),
    }));

  // Player-to-player marketplace — owned-by-others in the player's
  // current city, listed at a price. The 'instance' id is the
  // properties_owned row id; that's what the buy endpoint references.
  const marketRows = db.prepare(`
    SELECT po.id AS instance_id, po.char_id AS seller_id, po.property_id, po.city,
           po.mods_json, po.for_sale_price, po.listed_at,
           c.name AS seller_name
    FROM properties_owned po
    JOIN characters c ON c.id = po.char_id
    WHERE po.city = ? AND po.for_sale_price IS NOT NULL AND po.char_id != ?
    ORDER BY po.listed_at DESC LIMIT 50
  `).all(ch.city, ch.id);
  const market = marketRows.map(r => {
    const enriched = enrichRow(r);
    return enriched && {
      instance_id: r.instance_id,
      seller: { id: r.seller_id, name: r.seller_name },
      property: enriched,
      price: r.for_sale_price,
      listed_at: r.listed_at,
    };
  }).filter(Boolean);

  // Hangars are commercial real estate at the city's airport. The
  // estate agent handles the title; ongoing operations (slot
  // upgrades, refuel, take-off) still live at /api/hangar.
  const hangarHere = loadHangar(ch.id, ch.city) ? hangarSummary(ch.id, ch.city) : null;

  res.json({
    owned, forSale, market,
    currentCity: ch.city, currentCityName: cityById(ch.city)?.name,
    modSlots: PROPERTY_MOD_SLOTS,
    modsCatalogue: PROPERTY_MODS,
    hangar: {
      owned_here: hangarHere,                        // null when the player doesn't own one in this city
      purchase_cost: HANGAR_PURCHASE_COST,
    },
  });
});

// POST /buy-hangar — title transfer for a base hangar in the player's
// current city. Delegates to buyHangar() which already enforces the
// "one per city" + cash gates. Slot upgrades and flight ops still
// happen via /api/hangar.
router.post('/buy-hangar', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const r = buyHangar(ch);
  if (r.error) return res.status(400).json({ error: r.error });
  writeLog(ch.id, 'property',
    ` Bought a hangar at ${cityById(ch.city)?.name} airport — £${r.cost.toLocaleString()}.`,
    { city: ch.city, cost: r.cost }, true);
  saveCharacter(ch);
  res.json({ ok: true, cost: r.cost, hangar: hangarSummary(ch.id, ch.city), character: publicCharacter(ch) });
});

router.post('/buy', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const prop = propertyById(req.body?.property_id);
  if (!prop) return res.status(400).json({ error: 'Unknown property' });
  if (!prop.city) return res.status(400).json({ error: 'Legacy property — no longer for sale.' });
  if (prop.city !== ch.city) {
    return res.status(403).json({ error: `Must be in ${cityById(prop.city)?.name} to view this property.` });
  }
  const gate = prop.levelGate || 1;
  if (ch.level < gate) {
    return res.status(403).json({ error: `${prop.tierLabel || 'Tier ' + prop.tier} properties unlock at level ${gate}.` });
  }
  const exists = db.prepare('SELECT id FROM properties_owned WHERE char_id = ? AND property_id = ?')
    .get(ch.id, prop.id);
  if (exists) return res.status(409).json({ error: 'Already owned' });
  if (ch.cash < prop.cost) return res.status(400).json({ error: `Need £${prop.cost.toLocaleString()}` });
  ch.cash -= prop.cost;
  db.prepare(`INSERT INTO properties_owned (char_id, property_id, city, mods_json) VALUES (?, ?, ?, '{}')`)
    .run(ch.id, prop.id, prop.city);
  writeLog(ch.id, 'property', `Bought ${prop.name} (${prop.address}) in ${cityById(prop.city)?.name} for £${prop.cost.toLocaleString()}.`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Install (or replace) a mod in one slot of an owned property.
// Replacing destroys the previous mod — no refund. Player must be
// physically in the property's city to commission the work.
router.post('/:instanceId/install-mod', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.instanceId, 10);
  const row = db.prepare('SELECT * FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  if (row.city !== ch.city) return res.status(403).json({ error: "Must be in the property's city to install mods." });
  const mod = propertyModById(req.body?.mod_id);
  if (!mod) return res.status(400).json({ error: 'Unknown mod.' });
  if (ch.cash < mod.cost) return res.status(400).json({ error: `Need £${mod.cost.toLocaleString()}.` });

  const mods = parseMods(row.mods_json);
  mods[mod.slot] = mod.id;
  ch.cash -= mod.cost;
  db.prepare('UPDATE properties_owned SET mods_json = ? WHERE id = ?')
    .run(JSON.stringify(mods), id);
  const meta = propertyById(row.property_id);
  writeLog(ch.id, 'property', `Installed ${mod.name} at ${meta?.name || 'a property'} (-£${mod.cost.toLocaleString()}).`);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// Uninstall (no refund — mods come out destroyed).
router.post('/:instanceId/uninstall-mod', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.instanceId, 10);
  const slot = req.body?.slot;
  if (!PROPERTY_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Unknown slot.' });
  const row = db.prepare('SELECT * FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  const mods = parseMods(row.mods_json);
  if (!mods[slot]) return res.status(400).json({ error: 'Nothing installed in that slot.' });
  delete mods[slot];
  db.prepare('UPDATE properties_owned SET mods_json = ? WHERE id = ?').run(JSON.stringify(mods), id);
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// List for sale at a custom price (or update an existing listing).
// Listed properties show up on /properties marketplace block for
// other players in the same city.
router.post('/:instanceId/list', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.instanceId, 10);
  const price = Math.max(1, parseInt(req.body?.price, 10) || 0);
  const row = db.prepare('SELECT * FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  db.prepare('UPDATE properties_owned SET for_sale_price = ?, listed_at = ? WHERE id = ?')
    .run(price, Date.now(), id);
  res.json({ ok: true });
});

router.post('/:instanceId/unlist', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.instanceId, 10);
  const row = db.prepare('SELECT id FROM properties_owned WHERE id = ? AND char_id = ?').get(id, ch.id);
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  db.prepare('UPDATE properties_owned SET for_sale_price = NULL, listed_at = NULL WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Buy a listed property from another player. Buyer must be in the
// city; their cash covers the asking price; a 5% sales tax is
// skimmed off what the seller receives. Mods transfer with the
// property. Other-side notification goes via writeLog (no SSE —
// async, owner sees it next time they load their dashboard).
router.post('/:instanceId/buy-from-player', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.instanceId, 10);
  const row = db.prepare('SELECT * FROM properties_owned WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Listing not found.' });
  if (row.for_sale_price == null) return res.status(409).json({ error: 'No longer for sale.' });
  if (row.char_id === ch.id) return res.status(400).json({ error: "You can't buy your own listing." });
  if (row.city !== ch.city) return res.status(403).json({ error: `Must be in ${cityById(row.city)?.name} to view this property.` });
  const meta = propertyById(row.property_id);
  if (!meta) return res.status(400).json({ error: 'Property catalogue missing.' });
  const gate = meta.levelGate || 1;
  if (ch.level < gate) return res.status(403).json({ error: `${meta.tierLabel || 'Tier ' + meta.tier} properties unlock at level ${gate}.` });
  const owned = db.prepare('SELECT id FROM properties_owned WHERE char_id = ? AND property_id = ?').get(ch.id, row.property_id);
  if (owned) return res.status(409).json({ error: 'You already own that property.' });
  const price = row.for_sale_price;
  if (ch.cash < price) return res.status(400).json({ error: `Need £${price.toLocaleString()}.` });

  const tax = Math.floor(price * SALE_TAX_PCT);
  const sellerGets = price - tax;

  ch.cash -= price;
  db.prepare('UPDATE characters SET cash = cash + ? WHERE id = ?').run(sellerGets, row.char_id);
  db.prepare('UPDATE properties_owned SET char_id = ?, for_sale_price = NULL, listed_at = NULL WHERE id = ?')
    .run(ch.id, id);
  writeLog(ch.id, 'property',
    `Bought ${meta.name} from another player for £${price.toLocaleString()}.`,
    { instance_id: id, price, seller_id: row.char_id });
  writeLog(row.char_id, 'property',
    `Sold ${meta.name} to a buyer for £${price.toLocaleString()} (£${sellerGets.toLocaleString()} after 5% tax).`,
    { instance_id: id, price, sellerGets, buyer_id: ch.id }, true);
  saveCharacter(ch);
  res.json({ ok: true, sellerGets, tax, character: publicCharacter(ch) });
});

export default router;
