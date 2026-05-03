import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { ORGANISED_CRIMES, orgCrimeById } from '../data.js';
import { loadCharacterById, publicCharacter, publicProfileFor } from '../services/character.js';
import { gangBadgeFor } from '../services/gangs.js';
import {
  createPlan, loadPlan, loadRoles, activePlansFor, isInActivePlan,
  publicPlan, inviteToRole, assignRole, leaveRole, cancelPlan, executePlan,
} from '../services/oc.js';
import { sendEvent } from '../services/events.js';

const router = Router();

// Build a resolver closed over the viewer's city so publicPlan's call
// of resolver(member, viewerId) carries the same_city flag through.
function makeProfileResolver(viewerCity) {
  return (member, viewerId) => publicProfileFor(member, viewerId, gangBadgeFor, viewerCity);
}

function broadcastPlan(planId, type, extra = {}) {
  const rows = db.prepare(`
    SELECT DISTINCT char_id FROM (
      SELECT leader_id AS char_id FROM oc_plans WHERE id = ?
      UNION
      SELECT assigned_char_id AS char_id FROM oc_roles WHERE plan_id = ? AND assigned_char_id IS NOT NULL
    )
  `).all(planId, planId);
  for (const r of rows) sendEvent(r.char_id, type, { plan_id: planId, ...extra });
}

// ── Catalogue + index ─────────────────────────────────────────────────

router.get('/crimes', requireAuth, requireCharacter, (req, res) => {
  res.json({ crimes: ORGANISED_CRIMES });
});

router.get('/plans/active', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const plans = activePlansFor(ch.id);
  res.json({
    plans: plans.map(p => publicPlan(p, ch.id, makeProfileResolver(req.character.city))),
  });
});

router.get('/plans/:id', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  res.json({ plan: publicPlan(p, req.character.id, makeProfileResolver(req.character.city)) });
});

// ── Create / cancel ───────────────────────────────────────────────────

router.post('/plans', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const result = createPlan(ch, req.body?.crime_id);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, plan: publicPlan(result.plan, ch.id, makeProfileResolver(req.character.city)) });
});

router.post('/plans/:id/cancel', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  if (p.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can cancel.' });
  if (!['recruiting', 'ready'].includes(p.status)) return res.status(409).json({ error: 'Plan already finalised.' });
  cancelPlan(p);
  broadcastPlan(p.id, 'oc.cancelled', { by: { id: ch.id, name: ch.name } });
  res.json({ ok: true });
});

// ── Invite / accept / decline / leave ─────────────────────────────────

router.post('/plans/:id/invite', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const roleId = req.body?.role_id;
  const targetId = parseInt(req.body?.target_id, 10);
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  if (p.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can invite.' });
  const target = loadCharacterById(targetId);
  const result = inviteToRole(p, roleId, target);
  if (result.error) return res.status(400).json({ error: result.error });
  // The invite is a transient SSE notification — we don't persist it. The
  // role row is still empty until the player accepts.
  sendEvent(target.id, 'oc.invite', {
    plan_id: p.id,
    role_id: roleId,
    crime: orgCrimeById(p.crime_id),
    inviter: { id: ch.id, name: ch.name, avatar: ch.avatar },
  });
  res.json({ ok: true });
});

router.post('/plans/:id/accept', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const roleId = req.body?.role_id;
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  if (p.status !== 'recruiting') return res.status(409).json({ error: 'Plan no longer recruiting.' });
  // Re-validate eligibility for the role
  const crime = orgCrimeById(p.crime_id);
  const def = crime?.roles.find(r => r.id === roleId);
  if (!def) return res.status(400).json({ error: 'Bad role id.' });
  if (def.id === crime.roles[0].id) return res.status(400).json({ error: "Leader role can't be reassigned." });
  if (ch.level < crime.levelGate) return res.status(403).json({ error: `Requires level ${crime.levelGate}.` });
  if ((ch[def.stat] || 0) < def.min) return res.status(403).json({ error: `Need ${def.stat} ≥ ${def.min}.` });
  if (isInActivePlan(ch.id)) return res.status(409).json({ error: "You're already on a heist." });
  const r = assignRole(p, roleId, ch.id);
  if (r.error) return res.status(409).json({ error: r.error });
  broadcastPlan(p.id, 'oc.role_filled', { role_id: roleId, char: { id: ch.id, name: ch.name, avatar: ch.avatar } });
  res.json({ ok: true, plan: publicPlan(loadPlan(p.id), ch.id, makeProfileResolver(req.character.city)) });
});

router.post('/plans/:id/leave', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  if (p.status !== 'recruiting' && p.status !== 'ready') return res.status(409).json({ error: 'Plan already finalised.' });
  const r = leaveRole(p, ch.id);
  if (r.error) return res.status(400).json({ error: r.error });
  broadcastPlan(p.id, 'oc.role_left', { role_id: r.role_id, char_id: ch.id });
  res.json({ ok: true });
});

// ── Execute ───────────────────────────────────────────────────────────

router.post('/plans/:id/execute', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const p = loadPlan(id);
  if (!p) return res.status(404).json({ error: 'Plan not found.' });
  if (p.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can execute.' });
  const result = executePlan(p);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, result: result.result, character: publicCharacter(loadCharacterById(ch.id)) });
});

export default router;
