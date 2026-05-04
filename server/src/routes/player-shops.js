import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  SHOP_FOUNDING_COST, SHOP_SALES_TAX_PCT, WHOLESALE_PRICE_PCT,
  PLAYER_BIZ_PER_CITY_MAX, SHOP_NAME_MIN, SHOP_NAME_MAX, SHOP_DESC_MAX,
  wholesaleCatalogue,
  miscItemById, weaponById, armourById, ammoById, drugById, cityById,
  vehicleById, applyMods, applyVehicleMods,
} from '../data.js';
import { loadWeaponInstance, loadVehicleRow } from '../services/customize.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';

const router = Router();

//  Helpers 
function loadShopById(id) {
  return db.prepare('SELECT * FROM businesses_player WHERE id = ?').get(id);
}
function listingsFor(businessId) {
  return db.prepare('SELECT * FROM shop_listings WHERE business_id = ? ORDER BY id ASC').all(businessId);
}
// Resolve catalogue metadata for any inventory-listable kind. Each kind
// has its own static data table and slightly different shape — we
// normalise to a common { name, emoji, sub } here for the client.
//
// For per-instance kinds (weapon_instance, vehicle), `idOrInstance` can
// be either a numeric instance id (for a fresh lookup) or a full row
// (used by decorateListing to avoid a second DB hit). Anything else =
// catalogue id (string).
function lookupItem(kind, itemId, instanceId = null) {
  if (kind === 'misc') {
    const m = miscItemById(itemId);
    if (!m) return null;
    return {
      name: m.name,
      emoji: m.emoji || '',
      sub: m.desc || '',
      // Surface vital effects so the storefront can show what each
      // item does when used (e.g. "+10 energy"). Wholesale stockers
      // already see effects via /wholesale-catalogue; this puts the
      // same info on the buyer side.
      effects: m.effects || null,
    };
  }
  if (kind === 'weapon') {
    const w = weaponById(itemId);
    return w ? {
      name: w.name,
      emoji: '',
      sub: `${w.maker ? w.maker + ' · ' : ''}DMG ${w.dmg}${w.ammoType ? ` · ${w.ammoType}` : ' · melee'}`,
    } : null;
  }
  if (kind === 'armour') {
    const a = armourById(itemId);
    return a ? { name: a.name, emoji: '', sub: `DEF ${a.def}` } : null;
  }
  if (kind === 'ammo') {
    const a = ammoById(itemId);
    return a ? { name: a.name, emoji: '', sub: `${a.cost}/round base` } : null;
  }
  if (kind === 'drug') {
    const d = drugById(itemId);
    return d ? { name: d.name, emoji: '', sub: `level ${d.levelGate}+` } : null;
  }
  if (kind === 'weapon_instance') {
    const inst = loadWeaponInstance(instanceId);
    if (!inst) return null;
    const base = weaponById(inst.base_item_id);
    if (!base) return null;
    const stats = applyMods(base, inst.mods_json);
    const modList = stats.mods.map(m => m.name).join(', ');
    return {
      name: base.name,
      emoji: '',
      sub: ` ${base.maker || ''} · DMG ${stats.dmg}${stats.accuracy ? ` · +${stats.accuracy} acc` : ''}${modList ? ` · ${modList}` : ''}`,
      extra: { mods: stats.mods, dmg: stats.dmg, accuracy: stats.accuracy, ammoType: base.ammoType, category: base.category, maker: base.maker || null },
    };
  }
  if (kind === 'vehicle') {
    const row = loadVehicleRow(instanceId);
    if (!row) return null;
    const base = vehicleById(row.vehicle_id);
    if (!base) return null;
    const stats = applyVehicleMods(base, row.mods_json);
    const modList = stats.mods.map(m => m.name).join(', ');
    return {
      name: `${base.maker} ${base.name}`,
      emoji: '',
      sub: `Tier ${base.tier}${stats.is_modified ? ' ·  modded' : ''}${modList ? ` · ${modList}` : ''}`,
      extra: { mods: stats.mods, power: stats.power, handling: stats.handling, tier: base.tier, maker: base.maker, model: base.name, book_price: stats.bookPrice },
    };
  }
  return null;
}

function decorateListing(row) {
  const meta = lookupItem(row.kind, row.item_id, row.instance_id) || { name: row.item_id, emoji: '', sub: '' };
  return {
    id: row.id,
    kind: row.kind,
    item_id: row.item_id,
    instance_id: row.instance_id || null,
    qty: row.qty,
    price_each: row.price_each,
    source: row.source,
    name: meta.name,
    emoji: meta.emoji,
    desc: meta.sub,
    effects: meta.effects || null,
    extra: meta.extra || null,
  };
}

// Stack-based kinds — qty in inventory rows.
const STACK_KINDS = new Set(['misc', 'weapon', 'armour', 'ammo', 'drug']);
// Per-instance kinds — qty always 1, references a specific row.
const INSTANCE_KINDS = new Set(['weapon_instance', 'vehicle']);
const SELLABLE_KINDS = new Set([...STACK_KINDS, ...INSTANCE_KINDS]);
function publicShop(shop, options = {}) {
  return {
    id: shop.id,
    owner_id: shop.owner_id,
    city: shop.city,
    cityName: cityById(shop.city)?.name,
    type: shop.type,
    name: shop.name,
    description: shop.description || null,
    created_at: shop.created_at,
    sales_cash:    options.viewer_is_owner ? shop.sales_cash    : null,
    total_revenue: options.viewer_is_owner ? shop.total_revenue : null,
    total_tax_paid:options.viewer_is_owner ? shop.total_tax_paid: null,
  };
}
function shopOwnerName(ownerId) {
  return db.prepare('SELECT name, avatar FROM characters WHERE id = ?').get(ownerId);
}

// Stack-or-insert: if there's already a listing for the same business +
// kind + item_id, add to its qty and update price_each / listed_at.
// Otherwise insert a new row. Returns the existing-or-new listing row.
function upsertListing({ businessId, kind, itemId, source, addQty, priceEach }) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT * FROM shop_listings WHERE business_id = ? AND kind = ? AND item_id = ?'
  ).get(businessId, kind, itemId);
  if (existing) {
    db.prepare(
      'UPDATE shop_listings SET qty = qty + ?, price_each = ?, listed_at = ? WHERE id = ?'
    ).run(addQty, priceEach, now, existing.id);
    return db.prepare('SELECT * FROM shop_listings WHERE id = ?').get(existing.id);
  }
  const result = db.prepare(`
    INSERT INTO shop_listings (business_id, kind, item_id, source, qty, price_each, listed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(businessId, kind, itemId, source, addQty, priceEach, now);
  return db.prepare('SELECT * FROM shop_listings WHERE id = ?').get(result.lastInsertRowid);
}

//  GET /api/player-shops/wholesale-catalogue 
router.get('/wholesale-catalogue', requireAuth, requireCharacter, (_req, res) => {
  res.json({ items: wholesaleCatalogue(), wholesale_pct: WHOLESALE_PRICE_PCT });
});

//  GET /api/player-shops/in/:city 
router.get('/in/:city', requireAuth, requireCharacter, (req, res) => {
  const city = req.params.city;
  if (!cityById(city)) return res.status(400).json({ error: 'Unknown city' });
  const rows = db.prepare(`
    SELECT * FROM businesses_player
    WHERE city = ?
    ORDER BY created_at DESC
  `).all(city);
  const decorated = rows.map(r => {
    const owner = shopOwnerName(r.owner_id);
    return {
      ...publicShop(r, { viewer_is_owner: r.owner_id === req.character.id }),
      owner: owner ? { id: r.owner_id, name: owner.name, avatar: owner.avatar } : null,
      listing_count: db.prepare('SELECT COUNT(*) as n FROM shop_listings WHERE business_id = ?').get(r.id).n,
    };
  });
  res.json({ city, cityName: cityById(city)?.name, shops: decorated });
});

//  GET /api/player-shops/mine 
router.get('/mine', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const rows = db.prepare(`
    SELECT * FROM businesses_player
    WHERE owner_id = ?
    ORDER BY created_at DESC
  `).all(ch.id);
  const decorated = rows.map(r => ({
    ...publicShop(r, { viewer_is_owner: true }),
    listing_count: db.prepare('SELECT COUNT(*) as n FROM shop_listings WHERE business_id = ?').get(r.id).n,
  }));
  res.json({ shops: decorated, max_per_city: PLAYER_BIZ_PER_CITY_MAX });
});

//  GET /api/player-shops/:id 
router.get('/:id', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const shop = loadShopById(id);
  if (!shop) return res.status(404).json({ error: 'Shop not found.' });
  const owner = shopOwnerName(shop.owner_id);
  const isOwner = shop.owner_id === req.character.id;
  res.json({
    shop: {
      ...publicShop(shop, { viewer_is_owner: isOwner }),
      owner: owner ? { id: shop.owner_id, name: owner.name, avatar: owner.avatar } : null,
    },
    listings: listingsFor(shop.id).map(decorateListing),
    is_owner: isOwner,
    sales_tax_pct: SHOP_SALES_TAX_PCT,
  });
});

// Validates a shop name. Pass `excludeId` to allow keeping the same name
// during an edit. Returns null on success, or an error string.
function validateShopName(name, excludeId = null) {
  const trimmed = (name || '').trim();
  if (trimmed.length < SHOP_NAME_MIN || trimmed.length > SHOP_NAME_MAX) {
    return { error: `Name must be ${SHOP_NAME_MIN}-${SHOP_NAME_MAX} characters.` };
  }
  const taken = excludeId
    ? db.prepare('SELECT id FROM businesses_player WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmed, excludeId)
    : db.prepare('SELECT id FROM businesses_player WHERE name = ? COLLATE NOCASE').get(trimmed);
  if (taken) return { error: 'That name is taken — pick another.' };
  return { trimmed };
}

//  POST /api/player-shops — found a shop 
router.post('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { name, description } = req.body || {};

  const v = validateShopName(name);
  if (v.error) return res.status(400).json({ error: v.error });
  const trimmed = v.trimmed;
  const desc = description ? String(description).trim().slice(0, SHOP_DESC_MAX) : null;

  if (ch.cash < SHOP_FOUNDING_COST) {
    return res.status(400).json({ error: `Need £${SHOP_FOUNDING_COST.toLocaleString()} to set up.` });
  }
  const inCity = db.prepare(
    'SELECT COUNT(*) as n FROM businesses_player WHERE owner_id = ? AND city = ?'
  ).get(ch.id, ch.city).n;
  if (inCity >= PLAYER_BIZ_PER_CITY_MAX) {
    return res.status(409).json({ error: `You already have ${PLAYER_BIZ_PER_CITY_MAX} businesses in this city.` });
  }

  ch.cash -= SHOP_FOUNDING_COST;
  const now = Date.now();
  // tier/outgoings_cash columns survive in the schema but are no longer
  // meaningful — we set them to fixed defaults so the row remains valid.
  const result = db.prepare(`
    INSERT INTO businesses_player (
      owner_id, city, type, name, description, tier,
      outgoings_cash, sales_cash, total_revenue, total_rent_paid, total_tax_paid,
      status, last_rent_at, created_at, config_json
    ) VALUES (?, ?, 'shop', ?, ?, 'standard', 0, 0, 0, 0, 0, 'active', ?, ?, '{}')
  `).run(ch.id, ch.city, trimmed, desc, now, now);

  writeLog(ch.id, 'business', ` Founded "${trimmed}" in ${cityById(ch.city)?.name} for £${SHOP_FOUNDING_COST.toLocaleString()}.`);
  saveCharacter(ch);

  const shop = loadShopById(result.lastInsertRowid);
  res.json({
    ok: true,
    shop: publicShop(shop, { viewer_is_owner: true }),
    character: publicCharacter(ch),
  });
});

//  PATCH /api/player-shops/:id — edit name + description 
//
// Owner-only. Accepts any subset of `name` / `description`; fields not
// supplied are left alone. Pass `description: ""` to clear the
// description.
router.patch('/:id', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });

  const updates = {};
  if (req.body?.name != null) {
    const v = validateShopName(req.body.name, id);
    if (v.error) return res.status(400).json({ error: v.error });
    updates.name = v.trimmed;
  }
  if (req.body?.description != null) {
    const d = String(req.body.description).trim();
    if (d.length > SHOP_DESC_MAX) {
      return res.status(400).json({ error: `Description must be ${SHOP_DESC_MAX} characters or fewer.` });
    }
    updates.description = d.length === 0 ? null : d;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update.' });

  const cols = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(updates);
  db.prepare(`UPDATE businesses_player SET ${cols} WHERE id = ?`).run(...vals, id);

  const fresh = loadShopById(id);
  if (updates.name && updates.name !== shop.name) {
    writeLog(ch.id, 'business', `Renamed "${shop.name}" → "${updates.name}".`);
  }
  res.json({ ok: true, shop: publicShop(fresh, { viewer_is_owner: true }) });
});

//  POST /api/player-shops/:id/withdraw 
router.post('/:id/withdraw', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });
  if ((shop.sales_cash || 0) < amount) return res.status(400).json({ error: 'Not enough in the till.' });

  ch.cash += amount;
  db.prepare('UPDATE businesses_player SET sales_cash = sales_cash - ? WHERE id = ?').run(amount, id);
  saveCharacter(ch);
  writeLog(ch.id, 'business', `Withdrew £${amount.toLocaleString()} from "${shop.name}".`);
  res.json({ ok: true, shop: publicShop(loadShopById(id), { viewer_is_owner: true }), character: publicCharacter(ch) });
});

//  POST /api/player-shops/:id/close 
router.post('/:id/close', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });

  // Owner-listed stock returns to inventory. Wholesale stock is dumped
  // (already a sunk cost). Sales-pot cash refunds to the owner's wallet.
  // Per-instance kinds (weapon_instance, vehicle): ownership never moved
  // off the owner during listing, so just deleting the listing rows is
  // enough — handled by the cascading DELETE below.
  const listings = listingsFor(id);
  for (const l of listings) {
    if (l.source === 'inventory' && STACK_KINDS.has(l.kind)) {
      db.prepare(`
        INSERT INTO inventory (char_id, kind, item_id, qty)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
      `).run(ch.id, l.kind, l.item_id, l.qty);
    }
  }
  const refund = shop.sales_cash || 0;
  if (refund > 0) ch.cash += refund;
  db.prepare('DELETE FROM businesses_player WHERE id = ?').run(id);
  saveCharacter(ch);
  writeLog(ch.id, 'business', `Closed "${shop.name}". Recovered £${refund.toLocaleString()} from the till.`);
  res.json({ ok: true, refund, character: publicCharacter(ch) });
});

//  POST /api/player-shops/:id/listings/wholesale 
// Buy from wholesaler at wholesale price × qty (paid from owner cash).
// Stacks into the existing listing for the same item if there is one;
// otherwise creates a new listing. Latest retail price always wins.
router.post('/:id/listings/wholesale', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const { item_id, qty: rawQty, retail_price: rawPrice } = req.body || {};
  const qty = Math.max(1, parseInt(rawQty, 10) || 0);
  const retail = Math.max(1, parseInt(rawPrice, 10) || 0);
  if (!qty || !retail) return res.status(400).json({ error: 'qty and retail_price are required.' });

  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });

  const cat = wholesaleCatalogue();
  const item = cat.find(c => c.id === item_id);
  if (!item) return res.status(400).json({ error: 'Item not in wholesale catalogue.' });
  const totalCost = item.wholesale_cost * qty;
  if (ch.cash < totalCost) return res.status(400).json({ error: `Need £${totalCost.toLocaleString()} to buy ${qty}× ${item.name}.` });

  ch.cash -= totalCost;
  upsertListing({
    businessId: id, kind: 'misc', itemId: item.id,
    source: 'wholesale', addQty: qty, priceEach: retail,
  });
  saveCharacter(ch);
  writeLog(ch.id, 'business', `Stocked ${qty}× ${item.emoji} ${item.name} at "${shop.name}" — £${totalCost.toLocaleString()} wholesale.`);
  res.json({
    ok: true,
    listings: listingsFor(id).map(decorateListing),
    shop: publicShop(loadShopById(id), { viewer_is_owner: true }),
    character: publicCharacter(ch),
  });
});

//  POST /api/player-shops/:id/listings/inventory 
//
// Move an item the owner already holds in their personal inventory
// into the shop as a listing at their chosen retail price. The qty is
// transferred (not copied), so it disappears from inventory until the
// listing is sold (cash flows to the till) or delisted (item returns).
// Stacks with any existing listing of the same item — latest retail
// price wins, same as the wholesale path.
router.post('/:id/listings/inventory', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const { kind, item_id, instance_id: rawInstanceId, qty: rawQty, retail_price: rawPrice } = req.body || {};
  const retail = Math.max(1, parseInt(rawPrice, 10) || 0);
  if (!retail) return res.status(400).json({ error: 'retail_price is required.' });

  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });

  if (!SELLABLE_KINDS.has(kind)) {
    return res.status(400).json({ error: `Items of kind "${kind}" can't be listed in shops yet.` });
  }

  //  Per-instance branch (weapon_instance, vehicle) 
  if (INSTANCE_KINDS.has(kind)) {
    const instanceId = parseInt(rawInstanceId, 10);
    if (!Number.isFinite(instanceId)) return res.status(400).json({ error: 'instance_id required.' });

    if (kind === 'weapon_instance') {
      const inst = loadWeaponInstance(instanceId);
      if (!inst || inst.owner_id !== ch.id) return res.status(404).json({ error: 'Weapon instance not found.' });
      const already = db.prepare("SELECT id FROM shop_listings WHERE kind = 'weapon_instance' AND instance_id = ?").get(instanceId);
      if (already) return res.status(409).json({ error: 'Already listed in a shop.' });
      // Auto-unequip if it's the equipped instance.
      if (ch.equipped_weapon_instance === instanceId) {
        ch.equipped_weapon_instance = null;
        ch.equipped_weapon = 'fists';
        saveCharacter(ch);
      }
      db.prepare(`
        INSERT INTO shop_listings (business_id, kind, item_id, instance_id, source, qty, price_each, listed_at)
        VALUES (?, 'weapon_instance', ?, ?, 'inventory', 1, ?, ?)
      `).run(id, inst.base_item_id, instanceId, retail, Date.now());
    } else { // vehicle
      const row = loadVehicleRow(instanceId);
      if (!row || row.char_id !== ch.id) return res.status(404).json({ error: 'Vehicle not found.' });
      if (ch.active_vehicle_id === instanceId) {
        return res.status(400).json({ error: 'Store your car in a garage before listing it.' });
      }
      if (row.shipping_until && row.shipping_until > Date.now()) {
        return res.status(400).json({ error: 'That car is still in transit — wait for it to arrive.' });
      }
      const already = db.prepare("SELECT id FROM shop_listings WHERE kind = 'vehicle' AND instance_id = ?").get(instanceId);
      if (already) return res.status(409).json({ error: 'Already listed in a shop.' });
      db.prepare(`
        INSERT INTO shop_listings (business_id, kind, item_id, instance_id, source, qty, price_each, listed_at)
        VALUES (?, 'vehicle', ?, ?, 'inventory', 1, ?, ?)
      `).run(id, row.vehicle_id, instanceId, retail, Date.now());
    }

    const meta = lookupItem(kind, item_id, instanceId);
    writeLog(ch.id, 'business', `Listed ${meta?.emoji || ''} ${meta?.name || ''} at "${shop.name}" — £${retail.toLocaleString()}.`);
    return res.json({
      ok: true,
      listings: listingsFor(id).map(decorateListing),
      shop: publicShop(loadShopById(id), { viewer_is_owner: true }),
      character: publicCharacter(ch),
    });
  }

  //  Stack branch (misc, weapon, armour, ammo, drug) 
  const qty = Math.max(1, parseInt(rawQty, 10) || 0);
  if (!qty) return res.status(400).json({ error: 'qty is required.' });
  if (!lookupItem(kind, item_id)) {
    return res.status(400).json({ error: 'Unknown item.' });
  }

  const row = db.prepare(
    'SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?'
  ).get(ch.id, kind, item_id);
  if (!row || row.qty < qty) {
    return res.status(400).json({ error: `You only have ${row?.qty || 0} of that to list.` });
  }

  if (row.qty === qty) {
    db.prepare('DELETE FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').run(ch.id, kind, item_id);
  } else {
    db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?').run(qty, ch.id, kind, item_id);
  }

  if (kind === 'weapon' && ch.equipped_weapon === item_id && !ch.equipped_weapon_instance) {
    const remaining = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(ch.id, item_id);
    if (!remaining || remaining.qty <= 0) {
      ch.equipped_weapon = 'fists';
      saveCharacter(ch);
      writeLog(ch.id, 'equip', `Unequipped — sold the last of your ${lookupItem('weapon', item_id)?.name}. Back to fists.`);
    }
  } else if (kind === 'armour' && ch.equipped_armour === item_id) {
    const remaining = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'armour' AND item_id = ?").get(ch.id, item_id);
    if (!remaining || remaining.qty <= 0) {
      ch.equipped_armour = 'none';
      saveCharacter(ch);
      writeLog(ch.id, 'equip', `Unequipped — sold the last of your ${lookupItem('armour', item_id)?.name}. No armour.`);
    }
  }

  upsertListing({
    businessId: id, kind, itemId: item_id,
    source: 'inventory', addQty: qty, priceEach: retail,
  });

  const meta = lookupItem(kind, item_id);
  const itemLabel = `${meta?.emoji || ''} ${meta?.name || item_id}`.trim();
  writeLog(ch.id, 'business', `Listed ${qty}× ${itemLabel} from inventory at "${shop.name}" — £${retail.toLocaleString()} each.`);
  res.json({
    ok: true,
    listings: listingsFor(id).map(decorateListing),
    shop: publicShop(loadShopById(id), { viewer_is_owner: true }),
    character: publicCharacter(ch),
  });
});

//  GET /api/player-shops/:id/listable-inventory 
// Surfaces the owner's misc-item inventory in a shape the client can
// build the "List from inventory" picker from. Filters out anything
// already at qty 0 and items that aren't shop-eligible (none for misc
// in Phase 1; future phases can flag e.g. soulbound items).
router.get('/:id/listable-inventory', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });

  const placeholders = [...STACK_KINDS].map(() => '?').join(',');
  const stackRows = db.prepare(
    `SELECT kind, item_id, qty FROM inventory WHERE char_id = ? AND kind IN (${placeholders}) AND qty > 0 ORDER BY kind, item_id`
  ).all(ch.id, ...STACK_KINDS);

  const baseCost = (kind, id) => {
    if (kind === 'misc')   return miscItemById(id)?.cost || null;
    if (kind === 'weapon') return weaponById(id)?.cost || null;
    if (kind === 'armour') return armourById(id)?.cost || null;
    if (kind === 'ammo')   return ammoById(id)?.cost || null;
    if (kind === 'drug')   return drugById(id)?.base || null;
    return null;
  };

  const stackItems = stackRows.map(r => {
    const meta = lookupItem(r.kind, r.item_id);
    if (!meta) return null;
    const equipped = (r.kind === 'weapon' && ch.equipped_weapon === r.item_id)
                  || (r.kind === 'armour' && ch.equipped_armour === r.item_id);
    return {
      kind: r.kind,
      item_id: r.item_id,
      instance_id: null,
      qty: r.qty,
      name: meta.name,
      emoji: meta.emoji,
      sub: meta.sub,
      base_cost: baseCost(r.kind, r.item_id),
      equipped,
    };
  }).filter(Boolean);

  // Per-instance kinds: weapon_instances + vehicles_owned. Filter out
  // any that are already listed in some shop (no double-listing).
  const listedWeaponInstances = new Set(db.prepare(
    "SELECT instance_id FROM shop_listings WHERE kind = 'weapon_instance'"
  ).all().map(r => r.instance_id));
  const listedVehicles = new Set(db.prepare(
    "SELECT instance_id FROM shop_listings WHERE kind = 'vehicle'"
  ).all().map(r => r.instance_id));

  const weaponInstances = db.prepare('SELECT * FROM weapon_instances WHERE owner_id = ?').all(ch.id)
    .filter(inst => !listedWeaponInstances.has(inst.id))
    .map(inst => {
      const meta = lookupItem('weapon_instance', null, inst.id);
      if (!meta) return null;
      const base = weaponById(inst.base_item_id);
      return {
        kind: 'weapon_instance',
        instance_id: inst.id,
        item_id: inst.base_item_id,
        qty: 1,
        name: meta.name,
        emoji: meta.emoji,
        sub: meta.sub,
        base_cost: base?.cost || null,
        equipped: ch.equipped_weapon_instance === inst.id,
      };
    }).filter(Boolean);

  const vehicles = db.prepare('SELECT * FROM vehicles_owned WHERE char_id = ?').all(ch.id)
    .filter(row => !listedVehicles.has(row.id))
    .map(row => {
      const meta = lookupItem('vehicle', null, row.id);
      if (!meta) return null;
      const base = vehicleById(row.vehicle_id);
      return {
        kind: 'vehicle',
        instance_id: row.id,
        item_id: row.vehicle_id,
        qty: 1,
        name: meta.name,
        emoji: meta.emoji,
        sub: meta.sub,
        base_cost: meta.extra?.book_price || base?.bookPrice || null,
      };
    }).filter(Boolean);

  res.json({ items: [...stackItems, ...weaponInstances, ...vehicles] });
});

//  DELETE /api/player-shops/:id/listings/:listingId 
// Wholesale listings: stock destroyed (no refund). Inventory-sourced:
// stock is returned to the owner's inventory.
router.delete('/:id/listings/:listingId', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const lid = parseInt(req.params.listingId, 10);
  const shop = loadShopById(id);
  if (!shop || shop.owner_id !== ch.id) return res.status(404).json({ error: 'Shop not found.' });
  const listing = db.prepare('SELECT * FROM shop_listings WHERE id = ? AND business_id = ?').get(lid, id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });

  if (listing.source === 'inventory' && STACK_KINDS.has(listing.kind)) {
    db.prepare(`
      INSERT INTO inventory (char_id, kind, item_id, qty)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
    `).run(ch.id, listing.kind, listing.item_id, listing.qty);
  }
  // Per-instance kinds: ownership stayed with the seller while listed,
  // so delisting just removes the listing row — no transfer needed.
  db.prepare('DELETE FROM shop_listings WHERE id = ?').run(lid);
  res.json({ ok: true, listings: listingsFor(id).map(decorateListing) });
});

//  POST /api/player-shops/:id/buy/:listingId 
router.post('/:id/buy/:listingId', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const lid = parseInt(req.params.listingId, 10);
  const qty = Math.max(1, parseInt(req.body?.qty, 10) || 1);

  const shop = loadShopById(id);
  if (!shop) return res.status(404).json({ error: 'Shop not found.' });
  if (shop.owner_id === ch.id) return res.status(400).json({ error: "You can't buy from your own shop." });
  if (shop.city !== ch.city) return res.status(400).json({ error: `You must be in ${cityById(shop.city)?.name} to buy here.` });

  const listing = db.prepare('SELECT * FROM shop_listings WHERE id = ? AND business_id = ?').get(lid, id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (qty > listing.qty) return res.status(400).json({ error: `Only ${listing.qty} in stock.` });

  const total = listing.price_each * qty;
  if (ch.cash < total) return res.status(400).json({ error: `Need £${total.toLocaleString()}.` });

  const tax = Math.floor(total * SHOP_SALES_TAX_PCT);
  const sellerCut = total - tax;

  ch.cash -= total;
  if (STACK_KINDS.has(listing.kind)) {
    db.prepare(`
      INSERT INTO inventory (char_id, kind, item_id, qty)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(char_id, kind, item_id) DO UPDATE SET qty = qty + excluded.qty
    `).run(ch.id, listing.kind, listing.item_id, qty);
  } else if (listing.kind === 'weapon_instance') {
    db.prepare('UPDATE weapon_instances SET owner_id = ? WHERE id = ?').run(ch.id, listing.instance_id);
  } else if (listing.kind === 'vehicle') {
    // Vehicles change ownership AND city (the buyer takes possession in
    // their city, since they're physically here to buy it).
    db.prepare('UPDATE vehicles_owned SET char_id = ?, city = ? WHERE id = ?').run(ch.id, ch.city, listing.instance_id);
  }
  if (qty >= listing.qty) {
    db.prepare('DELETE FROM shop_listings WHERE id = ?').run(lid);
  } else {
    db.prepare('UPDATE shop_listings SET qty = qty - ? WHERE id = ?').run(qty, lid);
  }
  db.prepare(`
    UPDATE businesses_player
    SET sales_cash = sales_cash + ?,
        total_revenue = total_revenue + ?,
        total_tax_paid = total_tax_paid + ?
    WHERE id = ?
  `).run(sellerCut, total, tax, id);

  const meta = lookupItem(listing.kind, listing.item_id, listing.instance_id);
  const itemLabel = `${meta?.emoji || ''} ${meta?.name || listing.item_id}`.trim();
  writeLog(ch.id, 'shop', `Bought ${qty}× ${itemLabel} from "${shop.name}" for £${total.toLocaleString()}.`);
  writeLog(shop.owner_id, 'business', `Sold ${qty}× ${itemLabel} at "${shop.name}" — £${sellerCut.toLocaleString()} into till (5% tax).`, { biz: shop.id }, true);

  saveCharacter(ch);
  res.json({
    ok: true,
    paid: total,
    seller_cut: sellerCut,
    tax,
    character: publicCharacter(ch),
  });
});

export default router;
