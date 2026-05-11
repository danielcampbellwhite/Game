import { Router } from 'express';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import {
  getActiveInvestigation,
  getPendingTrial,
  recordWeight,
  listConvictions,
  EVIDENCE_TO_FILE,
} from '../services/investigations.js';

const router = Router();

// Read-only investigation + criminal-record dashboard data.
router.get('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const inv = getActiveInvestigation(ch.id);
  const trial = getPendingTrial(ch.id);
  const convictions = listConvictions(ch.id);
  const weight = recordWeight(ch.id);
  res.json({
    investigation: inv ? {
      detective: inv.detective_name,
      evidence: inv.evidence,
      threshold: EVIDENCE_TO_FILE,
      progress: Math.min(1, inv.evidence / EVIDENCE_TO_FILE),
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
