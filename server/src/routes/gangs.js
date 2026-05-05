import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireCharacter } from '../middleware/auth.js';
import { saveCharacter, publicCharacter, loadCharacterById } from '../services/character.js';
import { CITIES, cityById, GANG_LEVELS, gangLevelMeta, nextGangLevelMeta } from '../data.js';
import {
  foundGang, loadGang, loadMembership, loadMembers,
  pendingInvitesFor, existingPendingInvite, disbandGang,
  publicGang, publicGangBadge, hasMinRole, outranks,
  TITLE_MAX, CHAT_MAX, CHAT_PAGE,
  declareWar, activeWarFor, listActiveWars, listTurfHolds,
} from '../services/gangs.js';
import { sendEvent } from '../services/events.js';
import { writeLog } from '../services/log.js';

const router = Router();

// Push a gang.update payload to every active member of a gang. Used when
// membership/treasury/role changes happen.
function broadcastGang(gangId, type, extra = {}) {
  const members = db.prepare('SELECT char_id FROM gang_members WHERE gang_id = ?').all(gangId);
  for (const m of members) sendEvent(m.char_id, type, { gang_id: gangId, ...extra });
}

//  Discovery 

router.get('/', requireAuth, requireCharacter, (req, res) => {
  // Optional ?faction=fraudster|mafia|cartel filters to gangs of that
  // faction. ?faction=mine resolves to the caller's own faction (or
  // returns no rows if they're unaligned).
  const factionParam = (req.query.faction || '').toString();
  let factionFilter = null;
  if (factionParam === 'mine') {
    factionFilter = req.character.faction || '__none__';   // unaligned → no rows
  } else if (factionParam) {
    factionFilter = factionParam;
  }

  const sql = `
    SELECT g.*, COUNT(m.char_id) AS member_count
    FROM gangs g LEFT JOIN gang_members m ON m.gang_id = g.id
    ${factionFilter ? 'WHERE g.faction = ?' : ''}
    GROUP BY g.id
    ORDER BY member_count DESC, g.founded_at DESC
    LIMIT 50
  `;
  const rows = factionFilter
    ? db.prepare(sql).all(factionFilter)
    : db.prepare(sql).all();
  res.json({
    gangs: rows.map(g => ({
      id: g.id, name: g.name, tag: g.tag,
      description: g.description, leader_id: g.leader_id,
      faction: g.faction || null,
      member_count: g.member_count, treasury: g.treasury,
      reputation: g.reputation, founded_at: g.founded_at,
    })),
    you: publicMyMembership(req.character.id),
    your_faction: req.character.faction || null,
  });
});

router.get('/me', requireAuth, requireCharacter, (req, res) => {
  res.json({ membership: publicMyMembership(req.character.id) });
});

function publicMyMembership(charId) {
  const m = loadMembership(charId);
  if (!m) return null;
  const g = loadGang(m.gang_id);
  if (!g) return null;
  return {
    gang: { id: g.id, name: g.name, tag: g.tag },
    role: m.role,
    title: m.title,
    joined_at: m.joined_at,
    contributed: m.contributed,
  };
}

router.get('/invites', requireAuth, requireCharacter, (req, res) => {
  res.json({ invites: pendingInvitesFor(req.character.id) });
});

router.get('/:id', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad gang id' });
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found' });
  const me = loadMembership(req.character.id);
  res.json({
    gang: publicGang(g, req.character.id),
    you: { is_member: me?.gang_id === id, role: me?.gang_id === id ? me.role : null, title: me?.gang_id === id ? me.title : null },
  });
});

//  Founding / disbanding 

router.post('/', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const { name, tag, description } = req.body || {};
  const result = foundGang(ch, { name, tag, description });
  if (result.error) return res.status(400).json({ error: result.error });
  writeLog(ch.id, 'gang', `Founded gang "${result.gang.name}" [${result.gang.tag}].`, { gang_id: result.gang.id });
  res.json({
    ok: true,
    gang: publicGang(result.gang, ch.id),
    membership: publicMyMembership(ch.id),
    character: publicCharacter(ch),
  });
});

router.post('/:id/disband', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found' });
  if (g.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can disband.' });
  const result = disbandGang(g, ch);
  // Notify every former member (including the leader) — they'll see their
  // membership cleared on next /gangs/me.
  broadcastGang(g.id, 'gang.disbanded', { name: g.name, tag: g.tag });
  writeLog(ch.id, 'gang', `Disbanded gang "${g.name}" — refunded £${(result.refund || 0).toLocaleString()}.`);
  res.json({ ok: true, refund: result.refund, character: publicCharacter(ch) });
});

//  Invites 

router.post('/:id/invite', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body?.target_id, 10);
  if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Bad target_id' });
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (!hasMinRole(my, 'officer')) return res.status(403).json({ error: 'Officers and the leader can invite.' });

  if (targetId === ch.id) return res.status(400).json({ error: "Can't invite yourself." });
  const target = loadCharacterById(targetId);
  if (!target) return res.status(404).json({ error: 'Player not found.' });
  if (loadMembership(targetId)) return res.status(409).json({ error: 'Player is already in a gang.' });
  if (existingPendingInvite(id, targetId)) return res.status(409).json({ error: 'They already have a pending invite.' });

  const r = db.prepare(`
    INSERT INTO gang_invites (gang_id, invitee_id, inviter_id, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(id, targetId, ch.id, Date.now());
  sendEvent(targetId, 'gang.invite', {
    invite_id: r.lastInsertRowid,
    gang: { id: g.id, name: g.name, tag: g.tag },
    inviter: { id: ch.id, name: ch.name, avatar: ch.avatar },
  });
  writeLog(ch.id, 'gang', `Invited ${target.name} to "${g.name}".`, { gang_id: g.id, invitee: target.id });
  res.json({ ok: true, invite_id: r.lastInsertRowid });
});

router.post('/invites/:id/accept', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const inv = db.prepare('SELECT * FROM gang_invites WHERE id = ?').get(id);
  if (!inv || inv.invitee_id !== ch.id) return res.status(404).json({ error: 'Invite not found.' });
  if (inv.status !== 'pending') return res.status(409).json({ error: 'Invite no longer pending.' });
  if (loadMembership(ch.id)) return res.status(409).json({ error: 'You are already in a gang.' });
  const g = loadGang(inv.gang_id);
  if (!g) return res.status(404).json({ error: 'Gang no longer exists.' });
  // Hard cap on gang size.
  const MAX_GANG_MEMBERS = 30;
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM gang_members WHERE gang_id = ?').get(g.id).n;
  if (memberCount >= MAX_GANG_MEMBERS) {
    return res.status(409).json({ error: `That gang is full (${MAX_GANG_MEMBERS}/${MAX_GANG_MEMBERS}).` });
  }

  const now = Date.now();
  db.prepare('UPDATE gang_invites SET status = \'accepted\' WHERE id = ?').run(id);
  // Cancel all other pending invites for this player.
  db.prepare(`
    UPDATE gang_invites SET status = 'cancelled'
    WHERE invitee_id = ? AND status = 'pending' AND id != ?
  `).run(ch.id, id);
  db.prepare(`
    INSERT INTO gang_members (char_id, gang_id, role, title, joined_at, contributed)
    VALUES (?, ?, 'recruit', NULL, ?, 0)
  `).run(ch.id, g.id, now);
  broadcastGang(g.id, 'gang.member.joined', { char_id: ch.id, name: ch.name });
  writeLog(ch.id, 'gang', `Joined "${g.name}" [${g.tag}].`, { gang_id: g.id });
  res.json({ ok: true, gang: publicGang(loadGang(g.id), ch.id), membership: publicMyMembership(ch.id) });
});

router.post('/invites/:id/decline', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const inv = db.prepare('SELECT * FROM gang_invites WHERE id = ?').get(id);
  if (!inv || inv.invitee_id !== ch.id) return res.status(404).json({ error: 'Invite not found.' });
  if (inv.status !== 'pending') return res.status(409).json({ error: 'Invite no longer pending.' });
  db.prepare('UPDATE gang_invites SET status = \'declined\' WHERE id = ?').run(id);
  sendEvent(inv.inviter_id, 'gang.invite.declined', { invite_id: id, by: { id: ch.id, name: ch.name } });
  res.json({ ok: true });
});

//  Leave / kick / promote / title 

router.post('/:id/leave', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  if (g.leader_id === ch.id) {
    return res.status(400).json({ error: 'Promote another member to leader before leaving, or disband the gang.' });
  }
  db.prepare('DELETE FROM gang_members WHERE char_id = ?').run(ch.id);
  broadcastGang(g.id, 'gang.member.left', { char_id: ch.id, name: ch.name });
  writeLog(ch.id, 'gang', `Left "${g.name}".`, { gang_id: g.id });
  res.json({ ok: true });
});

router.post('/:id/kick', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body?.target_id, 10);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (targetId === ch.id) return res.status(400).json({ error: "Can't kick yourself — leave instead." });
  const target = loadMembership(targetId);
  if (!target || target.gang_id !== id) return res.status(404).json({ error: 'Target is not a member.' });
  if (!outranks(my, target)) return res.status(403).json({ error: 'You can only kick members below your rank.' });
  db.prepare('DELETE FROM gang_members WHERE char_id = ?').run(targetId);
  const targetCh = loadCharacterById(targetId);
  broadcastGang(g.id, 'gang.member.kicked', { char_id: targetId, name: targetCh?.name });
  sendEvent(targetId, 'gang.kicked', { gang: { id: g.id, name: g.name, tag: g.tag } });
  writeLog(ch.id, 'gang', `Kicked ${targetCh?.name || targetId} from "${g.name}".`, { gang_id: g.id });
  res.json({ ok: true });
});

router.post('/:id/promote', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body?.target_id, 10);
  const role = req.body?.role;
  if (!['recruit', 'soldier', 'officer', 'leader'].includes(role)) return res.status(400).json({ error: 'Bad role.' });
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (g.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can change roles.' });
  const target = loadMembership(targetId);
  if (!target || target.gang_id !== id) return res.status(404).json({ error: 'Target is not a member.' });
  if (targetId === ch.id) return res.status(400).json({ error: "Can't change your own role." });

  if (role === 'leader') {
    // Hand off leadership: target becomes leader, old leader demoted to officer.
    db.prepare('UPDATE gangs SET leader_id = ? WHERE id = ?').run(targetId, g.id);
    db.prepare("UPDATE gang_members SET role = 'leader' WHERE char_id = ?").run(targetId);
    db.prepare("UPDATE gang_members SET role = 'officer' WHERE char_id = ?").run(ch.id);
    broadcastGang(g.id, 'gang.leader_changed', { new_leader_id: targetId });
    writeLog(ch.id, 'gang', `Handed leadership of "${g.name}" to ${loadCharacterById(targetId)?.name}.`, { gang_id: g.id });
    return res.json({ ok: true });
  }

  db.prepare('UPDATE gang_members SET role = ? WHERE char_id = ?').run(role, targetId);
  broadcastGang(g.id, 'gang.role_changed', { char_id: targetId, role });
  writeLog(ch.id, 'gang', `Set ${loadCharacterById(targetId)?.name}'s role to ${role}.`, { gang_id: g.id });
  res.json({ ok: true });
});

router.post('/:id/title', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const targetId = parseInt(req.body?.target_id, 10);
  const title = (req.body?.title || '').toString().trim();
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (!hasMinRole(my, 'officer')) return res.status(403).json({ error: 'Officers and the leader can set titles.' });
  if (title.length > TITLE_MAX) return res.status(400).json({ error: `Max ${TITLE_MAX} chars.` });
  const target = loadMembership(targetId);
  if (!target || target.gang_id !== id) return res.status(404).json({ error: 'Target is not a member.' });
  db.prepare('UPDATE gang_members SET title = ? WHERE char_id = ?').run(title || null, targetId);
  broadcastGang(g.id, 'gang.title_changed', { char_id: targetId, title: title || null });
  res.json({ ok: true });
});

//  Treasury 

router.post('/:id/deposit', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (ch.cash < amount) return res.status(400).json({ error: 'Not enough cash.' });
  ch.cash -= amount;
  db.prepare('UPDATE gangs SET treasury = treasury + ? WHERE id = ?').run(amount, g.id);
  db.prepare('UPDATE gang_members SET contributed = contributed + ? WHERE char_id = ?').run(amount, ch.id);
  saveCharacter(ch);
  broadcastGang(g.id, 'gang.treasury', { delta: amount, by: { id: ch.id, name: ch.name } });
  writeLog(ch.id, 'gang', `Deposited £${amount.toLocaleString()} into "${g.name}".`, { gang_id: g.id });
  res.json({ ok: true, character: publicCharacter(ch), gang: publicGang(loadGang(g.id), ch.id) });
});

router.post('/:id/withdraw', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const amount = Math.max(1, parseInt(req.body?.amount, 10) || 0);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  if (!hasMinRole(my, 'officer')) return res.status(403).json({ error: 'Officers and the leader can withdraw.' });
  if ((g.treasury || 0) < amount) return res.status(400).json({ error: 'Treasury too small.' });
  db.prepare('UPDATE gangs SET treasury = treasury - ? WHERE id = ?').run(amount, g.id);
  ch.cash += amount;
  saveCharacter(ch);
  broadcastGang(g.id, 'gang.treasury', { delta: -amount, by: { id: ch.id, name: ch.name } });
  writeLog(ch.id, 'gang', `Withdrew £${amount.toLocaleString()} from "${g.name}".`, { gang_id: g.id });
  res.json({ ok: true, character: publicCharacter(ch), gang: publicGang(loadGang(g.id), ch.id) });
});

//  Wars + turf 

router.get('/wars/active', requireAuth, requireCharacter, (req, res) => {
  res.json({
    wars: listActiveWars().map(w => ({
      id: w.id,
      gang_a: { id: w.gang_a, name: w.gang_a_name, tag: w.gang_a_tag },
      gang_b: { id: w.gang_b, name: w.gang_b_name, tag: w.gang_b_tag },
      contested_city: w.contested_city,
      contested_city_name: cityById(w.contested_city)?.name || w.contested_city,
      score_a: w.score_a,
      score_b: w.score_b,
      declared_at: w.declared_at,
      ends_at: w.ends_at,
    })),
  });
});

router.post('/:id/declare-war', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const targetGangId = parseInt(req.body?.target_gang_id, 10);
  const city = (req.body?.city || '').toString();
  if (!Number.isFinite(targetGangId)) return res.status(400).json({ error: 'Bad target_gang_id' });
  if (!cityById(city)) return res.status(400).json({ error: 'Bad city' });
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  if (g.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can declare war.' });
  const target = loadGang(targetGangId);
  if (!target) return res.status(404).json({ error: 'Target gang not found.' });
  const result = declareWar(g, target, city);
  if (result.error) return res.status(400).json({ error: result.error });
  // Notify both gangs.
  broadcastGang(g.id, 'gang.war.declared', { war_id: result.war.id, against: { id: target.id, name: target.name, tag: target.tag }, city });
  broadcastGang(target.id, 'gang.war.declared', { war_id: result.war.id, against: { id: g.id, name: g.name, tag: g.tag }, city });
  writeLog(ch.id, 'gang', `Declared war on "${target.name}" — contested city: ${cityById(city)?.name || city}.`, { war_id: result.war.id });
  res.json({ ok: true, war: result.war });
});

router.get('/:id/war', requireAuth, requireCharacter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const w = activeWarFor(id);
  res.json({ war: w ? {
    id: w.id, gang_a: w.gang_a, gang_b: w.gang_b,
    contested_city: w.contested_city,
    contested_city_name: cityById(w.contested_city)?.name || w.contested_city,
    score_a: w.score_a, score_b: w.score_b,
    declared_at: w.declared_at, ends_at: w.ends_at,
    you_role: id === w.gang_a ? 'a' : 'b',
  } : null });
});

//  Gang chat 

router.get('/:id/chat', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  const rows = before
    ? db.prepare(`
        SELECT m.id, m.sender_id, m.body, m.created_at, c.name AS sender_name, c.avatar AS sender_avatar
        FROM gang_messages m JOIN characters c ON c.id = m.sender_id
        WHERE m.gang_id = ? AND m.id < ?
        ORDER BY m.id DESC LIMIT ?
      `).all(id, before, CHAT_PAGE)
    : db.prepare(`
        SELECT m.id, m.sender_id, m.body, m.created_at, c.name AS sender_name, c.avatar AS sender_avatar
        FROM gang_messages m JOIN characters c ON c.id = m.sender_id
        WHERE m.gang_id = ?
        ORDER BY m.id DESC LIMIT ?
      `).all(id, CHAT_PAGE);
  res.json({ messages: rows.reverse().map(r => ({ ...r, mine: r.sender_id === ch.id })) });
});

router.post('/:id/chat', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const body = (req.body?.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Empty message.' });
  if (body.length > CHAT_MAX) return res.status(400).json({ error: `Max ${CHAT_MAX} chars.` });
  const my = loadMembership(ch.id);
  if (!my || my.gang_id !== id) return res.status(403).json({ error: 'Not in this gang.' });
  const r = db.prepare(`
    INSERT INTO gang_messages (gang_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)
  `).run(id, ch.id, body, Date.now());
  const msg = {
    id: r.lastInsertRowid, sender_id: ch.id, body,
    created_at: Date.now(), sender_name: ch.name, sender_avatar: ch.avatar,
  };
  broadcastGang(id, 'gang.chat', { message: msg });
  res.json({ ok: true, message: { ...msg, mine: true } });
});

// Leader sets the % of every member's successful crime payout that
// gets diverted into the gang treasury. 0-15%. Members keep the rest.
router.post('/:id/cut', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  if (g.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can set the cut.' });
  let pct = parseFloat(req.body?.pct);
  if (!Number.isFinite(pct)) return res.status(400).json({ error: 'pct required (0-0.15).' });
  pct = Math.max(0, Math.min(0.15, pct));
  db.prepare('UPDATE gangs SET crime_cut_pct = ? WHERE id = ?').run(pct, id);
  writeLog(ch.id, 'gang', `Set the gang treasury cut to ${Math.round(pct * 100)}%.`);
  broadcastGang(id, 'gang.cut', { pct });
  res.json({ ok: true });
});

// Spend treasury to climb the gang-level ladder. Costs and perks live
// in data.js (GANG_LEVELS). Leader-only.
router.post('/:id/upgrade', requireAuth, requireCharacter, (req, res) => {
  const ch = req.character;
  const id = parseInt(req.params.id, 10);
  const g = loadGang(id);
  if (!g) return res.status(404).json({ error: 'Gang not found.' });
  if (g.leader_id !== ch.id) return res.status(403).json({ error: 'Only the leader can upgrade.' });
  const next = nextGangLevelMeta(g.level || 1);
  if (!next) return res.status(409).json({ error: 'Gang is already at the top tier.' });
  if ((g.treasury || 0) < next.cost) {
    return res.status(400).json({ error: `Treasury too small — need £${next.cost.toLocaleString()}.` });
  }
  db.prepare('UPDATE gangs SET treasury = treasury - ?, level = ? WHERE id = ?')
    .run(next.cost, next.level, id);
  writeLog(ch.id, 'gang', `Upgraded the gang to level ${next.level} — ${next.perk}`);
  broadcastGang(id, 'gang.level', { level: next.level, perk: next.perk });
  res.json({ ok: true, level: next.level });
});

router.get('/:id/levels', requireAuth, requireCharacter, (req, res) => {
  res.json({ levels: GANG_LEVELS });
});

export default router;
