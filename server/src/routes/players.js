import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { publicProfileFor, loadCharacterById } from '../services/character.js';
import { gangBadgeFor } from '../services/gangs.js';
import { murderEligibility } from '../services/pvp.js';
import { weaponById, armourById, vehicleById, cityById, propertyById, businessById, computeBusiness } from '../data.js';

const router = Router();

// GET /api/players/search?q=...&limit=20
//
// Returns up to N matching characters by name (case-insensitive prefix +
// substring match, prefix preferred). Excludes the caller. Always includes
// online status so the client can label results without a second round-trip.
//
// Empty query → most recently active players (online surface first, then
// offline by last-active). This lets the page double as a browseable
// directory rather than purely an "online now" list.
router.get('/search', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  if (q.length === 0) {
    const rows = db.prepare(`
      SELECT * FROM characters
      WHERE id != ?
      ORDER BY last_active_at DESC NULLS LAST, id DESC
      LIMIT ?
    `).all(ch.id, limit);
    return res.json({ players: rows.map(r => publicProfileFor(r, ch.id, gangBadgeFor, ch.city)) });
  }
  if (q.length < 2) return res.status(400).json({ error: 'Search at least 2 characters' });
  const like = q.replace(/[%_]/g, '\\$&') + '%';
  const subLike = '%' + q.replace(/[%_]/g, '\\$&') + '%';
  const rows = db.prepare(`
    SELECT *
    FROM characters
    WHERE id != ? AND (name LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
    ORDER BY
      (name LIKE ? ESCAPE '\\') DESC,
      last_active_at DESC NULLS LAST
    LIMIT ?
  `).all(ch.id, like, subLike, like, limit);
  res.json({ players: rows.map(r => publicProfileFor(r, ch.id, gangBadgeFor, ch.city)) });
});

router.get('/:id', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const target = loadCharacterById(id);
  if (!target) return res.status(404).json({ error: 'Player not found' });
  // Tell the caller whether this player has them blocked — useful for
  // disabling the Message button without a separate round-trip.
  const blocked = db.prepare(
    'SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(target.id, req.character.id);
  const youBlocked = db.prepare(
    'SELECT 1 FROM dm_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(req.character.id, target.id);

  //  Public loadout / holdings 
  // What this player has equipped right now, plus rounds remaining for
  // the equipped weapon's ammo type. Mirrors /api/inventory for self.
  const w = target.equipped_weapon ? weaponById(target.equipped_weapon) : null;
  const a = target.equipped_armour ? armourById(target.equipped_armour) : null;
  const ammoLeft = w?.ammoType
    ? (db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'ammo' AND item_id = ?")
        .get(target.id, w.ammoType)?.qty || 0)
    : null;
  const loadout = {
    weapon: w ? { id: w.id, name: w.name, maker: w.maker || null, dmg: w.dmg, category: w.category, ammoType: w.ammoType || null } : null,
    weapon_ammo: ammoLeft,
    armour: a ? { id: a.id, name: a.name, def: a.def } : null,
  };

  // Vehicles, properties, businesses — only public surface fields, no
  // hourly raid timers / collection state from the businesses table.
  const garage = db.prepare('SELECT * FROM vehicles_owned WHERE char_id = ? ORDER BY id DESC')
    .all(target.id)
    .map(r => {
      const v = vehicleById(r.vehicle_id);
      if (!v) return null;
      return {
        id: r.id, vehicle_id: v.id, name: v.name, maker: v.maker, tier: v.tier,
        bookPrice: v.bookPrice, acquired_via: r.acquired_via,
        city: r.city, cityName: cityById(r.city)?.name,
      };
    }).filter(Boolean);

  const properties = db.prepare('SELECT * FROM properties_owned WHERE char_id = ? ORDER BY id DESC')
    .all(target.id)
    .map(r => {
      const p = propertyById(r.property_id);
      if (!p) return null;
      return {
        id: r.id, property_id: p.id, name: p.name, address: p.address || null,
        cost: p.cost, city: r.city, cityName: cityById(r.city)?.name,
      };
    }).filter(Boolean);

  const businesses = db.prepare('SELECT * FROM businesses_owned WHERE char_id = ? ORDER BY id DESC')
    .all(target.id)
    .map(r => {
      const t = businessById(r.business_id);
      if (!t) return null;
      const stats = computeBusiness(t, r.scale, r.risk, r.quality, r.city);
      return {
        id: r.id,
        template_id: t.id,
        template_name: t.name,
        emoji: t.emoji,
        name: r.custom_name || t.name,
        illegal: !!t.illegal,
        level: r.level,
        city: r.city,
        cityName: cityById(r.city)?.name,
        hourly: Math.floor(stats.hourly * (1 + 0.15 * (r.level - 1))),
      };
    }).filter(Boolean);

  res.json({
    profile: publicProfileFor(target, req.character.id, gangBadgeFor, req.character.city),
    blocks_you: !!blocked,
    you_block: !!youBlocked,
    // Murder is gated to opposing-gang members during an active war in the
    // contested city. Surface the result here so the client can hide the
    // Murder button when it would always fail.
    murder_eligible: !murderEligibility(req.character, target),
    loadout,
    garage,
    properties,
    businesses,
  });
});

export default router;
