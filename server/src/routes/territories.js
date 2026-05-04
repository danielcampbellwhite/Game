// Territory control endpoints.
//
//   GET  /api/territories            — full board
//   GET  /api/territories/city/:id   — single city's locations
//   POST /api/territories/:id/capture — attempt capture (officer/leader only)

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter, requireFreeCharacter } from '../middleware/auth.js';
import { listTerritories, getTerritory, capture, ENERGY_COST, CAPTURE_COOLDOWN_MS } from '../services/territories.js';
import { saveCharacter, publicCharacter } from '../services/character.js';
import { writeLog } from '../services/log.js';
import { territoryById } from '../data.js';

const router = Router();

// Lookup the caller's gang membership row (with the gang's faction).
// Returns null if the player isn't in a gang.
function loadMembership(charId) {
  return db.prepare(`
    SELECT m.role, g.id, g.name, g.tag, g.faction
    FROM gang_members m JOIN gangs g ON g.id = m.gang_id
    WHERE m.char_id = ?
  `).get(charId);
}

router.get('/', requireAuth, requireCharacter, (req, res) => {
  res.json({
    territories: listTerritories(),
    you: {
      city: req.character.city,
      faction: req.character.faction,
      gang: loadMembership(req.character.id) || null,
    },
  });
});

router.get('/city/:cityId', requireAuth, requireCharacter, (req, res) => {
  res.json({ territories: listTerritories(req.params.cityId) });
});

router.post('/:locationId/capture', requireAuth, requireCharacter, requireFreeCharacter, (req, res) => {
  const ch = req.character;
  const locationId = req.params.locationId;
  const meta = territoryById(locationId);
  if (!meta) return res.status(404).json({ error: 'Unknown location.' });

  const mem = loadMembership(ch.id);
  if (!mem) return res.status(403).json({ error: 'You\'re not in a gang.' });
  if (mem.role !== 'leader' && mem.role !== 'officer') {
    return res.status(403).json({ error: 'Only the gang leader or an officer can attack territory.' });
  }

  const result = capture(ch, mem, locationId);
  if (result.error) return res.status(400).json({ error: result.error });

  // Persist energy + write a flavour log line that reflects the
  // actual outcome (capture / lost-and-walked / lost-and-hospital /
  // lost-and-jailed). All notify-flagged so the player sees it in
  // the bell.
  saveCharacter(ch);
  let logMsg;
  if (result.captured) {
    logMsg = `Captured "${meta.name}" for ${mem.name}.`;
  } else if (result.failOutcome === 'hospital') {
    logMsg = `Beaten back trying to take "${meta.name}" — hospitalised ${result.consequenceMins}m.`;
  } else if (result.failOutcome === 'jail') {
    logMsg = `Caught attacking "${meta.name}" — jailed ${result.consequenceMins}m.`;
  } else {
    logMsg = `Failed to take "${meta.name}". Defenders held the line.`;
  }
  writeLog(
    ch.id,
    'gang',
    logMsg,
    {
      location: locationId,
      captured: result.captured,
      failOutcome: result.failOutcome,
      consequenceMins: result.consequenceMins,
    },
    true,
  );
  res.json({
    ok: true,
    captured: result.captured,
    detail: result.detail,
    failOutcome: result.failOutcome,
    consequenceMins: result.consequenceMins,
    territory: result.territory,
    character: publicCharacter(ch),
  });
});

router.get('/_meta', (_req, res) => {
  res.json({ energy_cost: ENERGY_COST, cooldown_ms: CAPTURE_COOLDOWN_MS });
});

export default router;
