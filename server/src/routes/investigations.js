import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  getActiveInvestigation,
  getPendingTrial,
  recordWeight,
  listConvictions,
  courtChanceFor,
  HEAT_TO_TRIGGER,
} from '../services/investigations.js';
import { effectiveHeat } from '../services/heat.js';

const router = Router();

// Read-only investigation + criminal-record dashboard data.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const inv = getActiveInvestigation(ch.id);
  const trial = getPendingTrial(ch.id);
  const convictions = listConvictions(ch.id);
  const weight = recordWeight(ch.id);
  const heat = effectiveHeat(ch);
  res.json({
    investigation: inv ? {
      detective: inv.detective_name,
      // courtChance = probability that the next FAILED crime files
      // charges. 0 when heat <= HEAT_TO_TRIGGER, ramps at 1.5%/heat
      // point, caps at 1.0. The banner shows this directly.
      courtChance: courtChanceFor(heat),
      heat: Math.round(heat),
      heatThreshold: HEAT_TO_TRIGGER,
      startedAt: inv.started_at,
    } : null,
    pendingTrial: trial ? {
      detective: trial.detective_name,
      baseJailMin: trial.base_jail_min,
      lawyerCount: trial.lawyer_count || 0,
      bribed: !!trial.bribed,
      effectiveEvidence: trial.effective_evidence,
      filedAt: trial.filed_at,
    } : null,
    record: {
      weight,
      bandLabel:
        weight >= 5 ? 'Habitual' :
        weight >= 3 ? 'Repeat offender' :
        weight > 0 ? 'On file' : 'Clean',
      convictions: convictions.map(c => ({
        id: c.id,
        tier: c.crime_tier,
        jailMin: c.jail_min,
        convictedAt: c.convicted_at,
        detective: c.detective_name,
      })),
    },
  });
});

export default router;
