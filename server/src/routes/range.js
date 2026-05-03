import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { RANGE_DRILLS, weaponById } from '../data.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { applyTrainingBuffs, buffSnapshot } from '../services/buffs.js';
import { writeLog } from '../services/log.js';

const router = Router();

const drillById = id => RANGE_DRILLS.find(d => d.id === id);

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const weapon = weaponById(ch.equipped_weapon || 'fists');
  const ranged = !!weapon?.ammoType;
  const ammoRow = ranged
    ? db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'ammo', weapon.ammoType)
    : null;
  res.json({
    drills: RANGE_DRILLS,
    buffs: buffSnapshot(ch),
    weapon: ranged ? { id: weapon.id, name: weapon.name, ammoType: weapon.ammoType } : null,
    ammoOnHand: ammoRow?.qty || 0,
  });
});

router.post('/train', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const drill = drillById(req.body?.drill_id);
  if (!drill) return res.status(400).json({ error: 'Unknown drill' });
  const weapon = weaponById(ch.equipped_weapon || 'fists');
  if (!weapon?.ammoType) {
    return res.status(400).json({ error: 'Equip a ranged weapon first.' });
  }
  if (ch.energy < drill.energy) return res.status(400).json({ error: 'Not enough energy' });

  const ammoRow = db.prepare('SELECT qty FROM inventory WHERE char_id = ? AND kind = ? AND item_id = ?').get(ch.id, 'ammo', weapon.ammoType);
  if (!ammoRow || ammoRow.qty < drill.ammo) {
    return res.status(400).json({ error: `Need ${drill.ammo} rounds of ${weapon.ammoType}` });
  }

  ch.energy -= drill.energy;
  db.prepare('UPDATE inventory SET qty = qty - ? WHERE char_id = ? AND kind = ? AND item_id = ?')
    .run(drill.ammo, ch.id, 'ammo', weapon.ammoType);

  applyTrainingBuffs(ch, { accuracy: drill.buff });
  ch.happiness = Math.min(100, ch.happiness + 1);

  writeLog(ch.id, 'training', ` ${drill.name} — fired ${drill.ammo} rounds of ${weapon.ammoType}, +${drill.buff} accuracy.`, { drill: drill.id, ammo: drill.ammo });
  saveCharacter(ch);
  res.json({ ok: true, character: publicCharacter(ch), buffs: buffSnapshot(ch) });
});

export default router;
