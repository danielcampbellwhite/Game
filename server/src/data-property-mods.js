// Property mods — install on a property to raise its burglary
// defence and add to its resale value. Five slots so a fully
// kitted-out mansion stacks layered defences (alarm + reinforced
// doors + cameras + guards + safe room). Stored per-property as
// JSON ({ alarm: 'alarm_pro', doors: 'doors_reinf', ... }) in the
// properties_owned.mods_json column.

export const PROPERTY_MOD_SLOTS = ['alarm', 'doors', 'cameras', 'guards', 'safe'];

export const PROPERTY_MODS = [
  // Alarm — first line of detection
  { id: 'alarm_basic',  slot: 'alarm',  name: 'Basic Alarm System',  cost: 5000,   defence: 5,  value: 4000,  blurb: 'Window/door sensors and a loud bell. Wakes the neighbours.' },
  { id: 'alarm_pro',    slot: 'alarm',  name: 'Pro Monitored Alarm', cost: 25000,  defence: 15, value: 22000, blurb: 'Direct line to a private security firm. Cars on scene in 6 minutes.' },
  { id: 'alarm_smart',  slot: 'alarm',  name: 'Smart Lockdown',      cost: 90000,  defence: 30, value: 75000, blurb: 'Auto-locking doors and silent calls to a private response team.' },
  // Doors — physical defence
  { id: 'doors_reinf',  slot: 'doors',  name: 'Reinforced Doors',    cost: 8000,   defence: 8,  value: 6500,  blurb: 'Steel core, multi-point deadbolts.' },
  { id: 'doors_bank',   slot: 'doors',  name: 'Bank-Vault Doors',    cost: 50000,  defence: 25, value: 42000, blurb: 'Eight-figure cylinder, biometric thumbprint, time delay.' },
  // Cameras — a deterrent + evidence trail
  { id: 'cameras_ring', slot: 'cameras',name: 'Doorbell Camera',     cost: 2000,   defence: 3,  value: 1500,  blurb: 'Records who came knocking. Cloud backup.' },
  { id: 'cameras_cctv', slot: 'cameras',name: 'Full CCTV',            cost: 15000,  defence: 10, value: 12000, blurb: '16 cameras, NVR, 30 days of cloud backup.' },
  { id: 'cameras_pro',  slot: 'cameras',name: 'Pro Surveillance',     cost: 65000,  defence: 20, value: 55000, blurb: 'Motion-tracking PTZ, AI face recognition, off-site monitoring.' },
  // Guards — the wetware deterrent
  { id: 'guards_dog',   slot: 'guards', name: 'Guard Dog',            cost: 12000,  defence: 12, value: 8000,  blurb: 'German Shepherd. Bites first.' },
  { id: 'guards_live',  slot: 'guards', name: 'Live-In Security',     cost: 55000,  defence: 25, value: 45000, blurb: 'Ex-military, 24/7 rotation.' },
  // Safe — protects the loot if they DO get in
  { id: 'safe_wall',    slot: 'safe',   name: 'Wall Safe',            cost: 3000,   defence: 5,  value: 2200,  blurb: 'Behind the painting. Standard combination lock.' },
  { id: 'safe_floor',   slot: 'safe',   name: 'Floor Safe',           cost: 18000,  defence: 15, value: 15000, blurb: 'Concrete-anchored. Hard to find, harder to crack.' },
  { id: 'safe_vault',   slot: 'safe',   name: 'Private Vault Room',   cost: 130000, defence: 40, value: 110000,blurb: 'Climate-controlled, bulletproof shelves, biometric entry.' },
];

export const propertyModById = id => PROPERTY_MODS.find(m => m.id === id) || null;
export function modsForSlot(slot) {
  return PROPERTY_MODS.filter(m => m.slot === slot);
}

// Base defence by tier — burglars have to clear THIS before mods
// kick in. Bigger houses have bigger walls.
export const TIER_BASE_DEFENCE = {
  1: 8, 2: 15, 3: 28, 4: 45, 5: 70,
};

export function parseMods(modsJson) {
  try { return JSON.parse(modsJson || '{}') || {}; } catch { return {}; }
}

export function propertyDefence(tier, modsJson) {
  const base = TIER_BASE_DEFENCE[tier] || 5;
  const mods = parseMods(modsJson);
  let extra = 0;
  for (const slot of PROPERTY_MOD_SLOTS) {
    const id = mods[slot];
    if (!id) continue;
    const m = propertyModById(id);
    if (m) extra += m.defence || 0;
  }
  return base + extra;
}

// Total value added to a property by its installed mods. Used to
// suggest a fair list price (base property cost + value of mods).
export function modsValue(modsJson) {
  const mods = parseMods(modsJson);
  let total = 0;
  for (const slot of PROPERTY_MOD_SLOTS) {
    const id = mods[slot];
    if (!id) continue;
    const m = propertyModById(id);
    if (m) total += m.value || 0;
  }
  return total;
}
