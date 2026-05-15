import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { saveLoadout, listLoadouts, getLoadout, applyLoadout, deleteLoadout } from '../services/loadouts.js';

const router = Router();

// GET /api/loadouts — list of saved loadouts (most recent first).
router.get('/', requireAuth, requireCharacter, (req, res) => {
  res.json({ loadouts: listLoadouts(req.character.id) });
});

// POST /api/loadouts { name } — snapshot the current state.
router.post('/', requireAuth, requireCharacter, (req, res) => {
  const r = saveLoadout(req.character, req.body?.name);
  if (r.error) return res.status(400).json({ error: r.error });
  const fresh = getLoadout(req.character.id, r.id);
  writeLog(req.character.id, 'system', `${r.updated ? 'Updated' : 'Saved'} loadout: ${fresh.name}.`);
  res.json({ ok: true, loadout: fresh });
});

// POST /api/loadouts/:id/apply — equip the saved weapon/armour and
// activate the saved vehicle if still possible.
router.post('/:id/apply', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad loadout id.' });
  const ch = req.character;
  const r = applyLoadout(ch, id);
  if (r.error) return res.status(404).json({ error: r.error });
  saveCharacter(ch);
  // Friendly log so the activity feed shows the swap.
  if (r.applied.length > 0) {
    const parts = r.applied.map(a => a.name).join(', ');
    writeLog(ch.id, 'system', `Applied loadout — ${parts}.`);
  }
  res.json({ ok: true, applied: r.applied, skipped: r.skipped, character: publicCharacter(ch) });
});

// DELETE /api/loadouts/:id
router.delete('/:id', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad loadout id.' });
  const r = deleteLoadout(req.character.id, id);
  if (!r.ok) return res.status(404).json({ error: 'Loadout not found.' });
  res.json({ ok: true });
});

export default router;
