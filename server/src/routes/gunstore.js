import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { WEAPONS, ARMOUR, AMMO, WEAPON_CATEGORIES, cityById } from '../data.js';

const router = Router();

router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const cityMul = cityById(ch.city)?.businessMul || 1.0;
  res.json({
    cityName: cityById(ch.city)?.name,
    weapons: WEAPONS.filter(w => w.cost > 0).map(w => ({
      ...w,
      locked: ch.level < w.level,
      cost: Math.floor(w.cost * cityMul),
    })),
    weaponCategories: WEAPON_CATEGORIES,
    armours: ARMOUR.filter(a => a.cost > 0).map(a => ({ ...a, locked: ch.level < a.level, cost: Math.floor(a.cost * cityMul) })),
    ammo:    AMMO.map(a => ({ ...a, packCost: a.cost * a.packSize })),
  });
});

export default router;
