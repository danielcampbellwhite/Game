import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  WEAPONS, weaponById, applyMods,
  WEAPON_MOD_CATALOGUE, WEAPON_MOD_SLOTS, weaponModById, modsForWeapon,
  VEHICLE_MOD_CATALOGUE, VEHICLE_MOD_SLOTS, vehicleModById, modsForVehicle,
  vehicleById, cityById,
} from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import {
  loadWeaponInstance, loadCharWeaponInstances,
  takeOneFromWeaponStack, returnOneToWeaponStack,
  loadVehicleRow, loadCharVehicles, decorateVehicleRow,
} from '../services/customize.js';
import { writeLog } from '../services/log.js';

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────

// Parse a "ref" into either a stock-stack reference or an instance
// reference. Format: "stock:<base_item_id>" or "instance:<id>".
function parseRef(s) {
  if (typeof s !== 'string') return null;
  const idx = s.indexOf(':');
  if (idx < 0) return null;
  const kind = s.slice(0, idx);
  const rest = s.slice(idx + 1);
  if (kind === 'stock') return { kind: 'stock', base_item_id: rest };
  if (kind === 'instance') {
    const id = parseInt(rest, 10);
    if (!Number.isFinite(id)) return null;
    return { kind: 'instance', id };
  }
  return null;
}

function decorateInstance(inst) {
  const base = weaponById(inst.base_item_id);
  const stats = base ? applyMods(base, inst.mods_json) : null;
  return {
    kind: 'instance',
    instance_id: inst.id,
    base_item_id: inst.base_item_id,
    base: base ? { id: base.id, name: base.name, maker: base.maker || null, category: base.category, ammoType: base.ammoType, dmg_base: base.dmg } : null,
    stats: stats ? { dmg: stats.dmg, accuracy: stats.accuracy, mods: stats.mods, is_modified: stats.is_modified } : null,
  };
}

function listStockWeapons(charId) {
  const rows = db.prepare("SELECT item_id, qty FROM inventory WHERE char_id = ? AND kind = 'weapon' AND qty > 0").all(charId);
  return rows.map(r => {
    const base = weaponById(r.item_id);
    if (!base) return null;
    return {
      kind: 'stock',
      base_item_id: base.id,
      qty: r.qty,
      base: { id: base.id, name: base.name, maker: base.maker || null, category: base.category, ammoType: base.ammoType, dmg_base: base.dmg },
      stats: { dmg: base.dmg, accuracy: 0, mods: [], is_modified: false },
    };
  }).filter(Boolean);
}

// ── GET /api/customize/weapons ──────────────────────────────────────
//
// All of the player's weapons, both stock stacks and modded instances,
// in a single feed. Fists are excluded (always-on, can't be modded).
router.get('/weapons', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const stocks = listStockWeapons(ch.id).filter(s => s.base_item_id !== 'fists');
  const instances = loadCharWeaponInstances(ch.id).map(decorateInstance);
  const equipped = ch.equipped_weapon_instance
    ? { kind: 'instance', id: ch.equipped_weapon_instance }
    : { kind: 'stock', base_item_id: ch.equipped_weapon };
  res.json({ stocks, instances, equipped });
});

// ── GET /api/customize/weapons/:ref ─────────────────────────────────
router.get('/weapons/:ref', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const ref = parseRef(req.params.ref);
  if (!ref) return res.status(400).json({ error: 'Bad ref.' });

  if (ref.kind === 'stock') {
    const base = weaponById(ref.base_item_id);
    if (!base) return res.status(404).json({ error: 'Unknown weapon.' });
    const row = db.prepare("SELECT qty FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(ch.id, base.id);
    if (!row || row.qty < 1) return res.status(404).json({ error: 'You do not own that.' });
    const compatible = modsForWeapon(base);
    return res.json({
      ref: req.params.ref,
      kind: 'stock',
      base_item_id: base.id,
      qty: row.qty,
      base: { id: base.id, name: base.name, maker: base.maker || null, category: base.category, ammoType: base.ammoType, dmg_base: base.dmg },
      stats: { dmg: base.dmg, accuracy: 0, mods: [], is_modified: false },
      compatible_mods: compatible,
      slots: WEAPON_MOD_SLOTS,
    });
  }

  // instance
  const inst = loadWeaponInstance(ref.id);
  if (!inst || inst.owner_id !== ch.id) return res.status(404).json({ error: 'Instance not found.' });
  const base = weaponById(inst.base_item_id);
  const compatible = modsForWeapon(base);
  return res.json({
    ref: req.params.ref,
    ...decorateInstance(inst),
    compatible_mods: compatible,
    slots: WEAPON_MOD_SLOTS,
  });
});

// ── POST /api/customize/weapons/install ─────────────────────────────
//
// Body: { ref, slot, mod_id }
//
// If ref is a stock, we promote one out of the stack into a fresh
// weapon_instance and install the mod on it. If ref is an instance,
// install (or replace) the mod on the existing one. Cost is deducted
// from the player's cash.
router.post('/weapons/install', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const ref = parseRef(req.body?.ref);
  const slot = String(req.body?.slot || '');
  const modId = String(req.body?.mod_id || '');
  if (!ref) return res.status(400).json({ error: 'Bad ref.' });
  if (!WEAPON_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Bad slot.' });
  const mod = weaponModById(modId);
  if (!mod) return res.status(400).json({ error: 'Unknown mod.' });
  if (mod.slot !== slot) return res.status(400).json({ error: 'Mod is for a different slot.' });

  // Resolve the base weapon to check compatibility, and the instance
  // we're modifying (creating one if the ref is a stock weapon).
  let baseId, instanceId, modsObj;

  if (ref.kind === 'stock') {
    const base = weaponById(ref.base_item_id);
    if (!base) return res.status(400).json({ error: 'Unknown weapon.' });
    if (!mod.compat.includes(base.category)) {
      return res.status(400).json({ error: `${mod.name} doesn't fit ${base.category}s.` });
    }
    if (ch.cash < mod.cost) return res.status(400).json({ error: `Need £${mod.cost.toLocaleString()} for the install.` });
    // Promote: remove one from the stack, create the instance.
    try { takeOneFromWeaponStack(ch.id, base.id); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const r = db.prepare(
      "INSERT INTO weapon_instances (owner_id, base_item_id, mods_json, created_at) VALUES (?, ?, ?, ?)"
    ).run(ch.id, base.id, '{}', Date.now());
    instanceId = r.lastInsertRowid;
    baseId = base.id;
    modsObj = {};
  } else {
    const inst = loadWeaponInstance(ref.id);
    if (!inst || inst.owner_id !== ch.id) return res.status(404).json({ error: 'Instance not found.' });
    const base = weaponById(inst.base_item_id);
    if (!base) return res.status(400).json({ error: 'Base weapon missing from catalogue.' });
    if (!mod.compat.includes(base.category)) {
      return res.status(400).json({ error: `${mod.name} doesn't fit ${base.category}s.` });
    }
    if (ch.cash < mod.cost) return res.status(400).json({ error: `Need £${mod.cost.toLocaleString()} for the install.` });
    instanceId = inst.id;
    baseId = base.id;
    try { modsObj = JSON.parse(inst.mods_json || '{}'); } catch { modsObj = {}; }
  }

  // Install / replace.
  modsObj[slot] = mod.id;
  ch.cash -= mod.cost;
  db.prepare('UPDATE weapon_instances SET mods_json = ? WHERE id = ?').run(JSON.stringify(modsObj), instanceId);
  saveCharacter(ch);
  writeLog(ch.id, 'craft', `🔧 Installed ${mod.emoji} ${mod.name} on your ${weaponById(baseId)?.name} for £${mod.cost.toLocaleString()}.`);

  const fresh = loadWeaponInstance(instanceId);
  res.json({
    ok: true,
    instance: decorateInstance(fresh),
    character: publicCharacter(ch),
  });
});

// ── DELETE /api/customize/weapons/instance/:id/slot/:slot ──────────
//
// Uninstall a mod (no refund). If the instance ends up with zero mods,
// it auto-demotes back to the player's weapon stack and the instance row
// is deleted.
router.delete('/weapons/instance/:id/slot/:slot', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const slot = String(req.params.slot);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id.' });
  if (!WEAPON_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Bad slot.' });

  const inst = loadWeaponInstance(id);
  if (!inst || inst.owner_id !== ch.id) return res.status(404).json({ error: 'Instance not found.' });
  let modsObj;
  try { modsObj = JSON.parse(inst.mods_json || '{}'); } catch { modsObj = {}; }
  if (!modsObj[slot]) return res.status(400).json({ error: 'No mod in that slot.' });
  delete modsObj[slot];

  const nowEmpty = Object.keys(modsObj).length === 0;
  if (nowEmpty) {
    // Demote back to stock stack — reverse of the promote step.
    returnOneToWeaponStack(ch.id, inst.base_item_id);
    if (ch.equipped_weapon_instance === id) {
      ch.equipped_weapon_instance = null;
      ch.equipped_weapon = inst.base_item_id;
      saveCharacter(ch);
    }
    db.prepare('DELETE FROM weapon_instances WHERE id = ?').run(id);
    writeLog(ch.id, 'craft', `Stripped your ${weaponById(inst.base_item_id)?.name} bare — back in the regular stack.`);
    return res.json({ ok: true, demoted: true, character: publicCharacter(ch) });
  }
  db.prepare('UPDATE weapon_instances SET mods_json = ? WHERE id = ?').run(JSON.stringify(modsObj), id);
  res.json({ ok: true, demoted: false, instance: decorateInstance(loadWeaponInstance(id)) });
});

// ── POST /api/customize/weapons/equip ───────────────────────────────
//
// Body: { ref } — equip a stock weapon ("stock:<id>") or a modded
// instance ("instance:<id>"). Stock equipping goes through the same
// code path as /inventory/equip but accepting a ref string.
router.post('/weapons/equip', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const ref = parseRef(req.body?.ref);
  if (!ref) return res.status(400).json({ error: 'Bad ref.' });

  if (ref.kind === 'stock') {
    if (ref.base_item_id !== 'fists') {
      const owned = db.prepare("SELECT id FROM inventory WHERE char_id = ? AND kind = 'weapon' AND item_id = ?").get(ch.id, ref.base_item_id);
      if (!owned) return res.status(400).json({ error: 'Not owned.' });
    }
    ch.equipped_weapon = ref.base_item_id;
    ch.equipped_weapon_instance = null;
  } else {
    const inst = loadWeaponInstance(ref.id);
    if (!inst || inst.owner_id !== ch.id) return res.status(404).json({ error: 'Instance not found.' });
    ch.equipped_weapon = inst.base_item_id;
    ch.equipped_weapon_instance = inst.id;
  }
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch) });
});

// ── Vehicles (Phase 2D) ─────────────────────────────────────────────

// GET /api/customize/vehicles — list every vehicle the player owns
// (across all cities) with its hydrated mod state.
router.get('/vehicles', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const rows = loadCharVehicles(ch.id).map(decorateVehicleRow).filter(Boolean);
  res.json({ vehicles: rows });
});

// GET /api/customize/vehicles/:id — single vehicle + compatible mods.
router.get('/vehicles/:id', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id.' });
  const row = loadVehicleRow(id);
  if (!row || row.char_id !== ch.id) return res.status(404).json({ error: 'Vehicle not found.' });
  const decorated = decorateVehicleRow(row);
  const base = vehicleById(row.vehicle_id);
  const compatible = modsForVehicle(base);
  res.json({
    vehicle: { ...decorated, cityName: cityById(decorated.city)?.name },
    compatible_mods: compatible,
    slots: VEHICLE_MOD_SLOTS,
  });
});

// POST /api/customize/vehicles/install — install/replace one mod.
router.post('/vehicles/install', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.body?.id, 10);
  const slot = String(req.body?.slot || '');
  const modId = String(req.body?.mod_id || '');
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id.' });
  if (!VEHICLE_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Bad slot.' });
  const mod = vehicleModById(modId);
  if (!mod) return res.status(400).json({ error: 'Unknown mod.' });
  if (mod.slot !== slot) return res.status(400).json({ error: 'Mod is for a different slot.' });

  const row = loadVehicleRow(id);
  if (!row || row.char_id !== ch.id) return res.status(404).json({ error: 'Vehicle not found.' });
  const base = vehicleById(row.vehicle_id);
  if (!base) return res.status(400).json({ error: 'Base vehicle missing from catalogue.' });
  if ((base.tier || 1) < (mod.min_tier || 1)) {
    return res.status(400).json({ error: `${mod.name} requires a tier ${mod.min_tier} vehicle (this is tier ${base.tier}).` });
  }
  if (ch.cash < mod.cost) return res.status(400).json({ error: `Need £${mod.cost.toLocaleString()} for the install.` });

  let modsObj;
  try { modsObj = JSON.parse(row.mods_json || '{}'); } catch { modsObj = {}; }
  modsObj[slot] = mod.id;

  ch.cash -= mod.cost;
  db.prepare('UPDATE vehicles_owned SET mods_json = ? WHERE id = ?').run(JSON.stringify(modsObj), id);
  saveCharacter(ch);
  writeLog(ch.id, 'craft', `🔧 Installed ${mod.emoji} ${mod.name} on your ${base.maker} ${base.name} for £${mod.cost.toLocaleString()}.`);

  res.json({
    ok: true,
    vehicle: decorateVehicleRow(loadVehicleRow(id)),
    character: publicCharacter(ch),
  });
});

// DELETE /api/customize/vehicles/:id/slot/:slot — uninstall one mod
// (no refund). Empty mods_json doesn't change the vehicle's row — the
// vehicle itself still exists in vehicles_owned.
router.delete('/vehicles/:id/slot/:slot', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const slot = String(req.params.slot);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id.' });
  if (!VEHICLE_MOD_SLOTS.includes(slot)) return res.status(400).json({ error: 'Bad slot.' });
  const row = loadVehicleRow(id);
  if (!row || row.char_id !== ch.id) return res.status(404).json({ error: 'Vehicle not found.' });
  let modsObj;
  try { modsObj = JSON.parse(row.mods_json || '{}'); } catch { modsObj = {}; }
  if (!modsObj[slot]) return res.status(400).json({ error: 'No mod in that slot.' });
  delete modsObj[slot];
  db.prepare('UPDATE vehicles_owned SET mods_json = ? WHERE id = ?').run(JSON.stringify(modsObj), id);
  res.json({ ok: true, vehicle: decorateVehicleRow(loadVehicleRow(id)) });
});

export default router;
