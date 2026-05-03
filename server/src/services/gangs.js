import { db } from '../db.js';
import { loadCharacterById } from './character.js';

//  Tunables 
export const FOUND_LEVEL_GATE = 10;
export const NAME_MIN = 3;
export const NAME_MAX = 32;
export const TAG_MIN  = 2;
export const TAG_MAX  = 5;
export const DESC_MAX = 280;
export const TITLE_MAX = 32;
export const CHAT_MAX = 1500;
export const CHAT_PAGE = 50;

//  War tunables 
export const WAR_DURATION_MS    = 24 * 60 * 60 * 1000;   // 24h
export const WAR_REMATCH_MS     = 48 * 60 * 60 * 1000;   // 48h between same two gangs
export const TURF_HOLD_MS       = 7  * 24 * 60 * 60 * 1000; // 7-day hold
export const SCORE_KO           = 1;
export const SCORE_MURDER       = 5;
export const TURF_CRIME_COOLDOWN_MUL = 0.8;              // -20% crime cooldown

//  Roles + permission helpers 
export const ROLES = ['recruit', 'soldier', 'officer', 'leader'];
const ROLE_RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]));
function rankOf(role) { return ROLE_RANK[role] ?? -1; }

// Can `actor` perform an action requiring `min` role on a gang?
export function hasMinRole(actorMembership, min) {
  return rankOf(actorMembership?.role) >= rankOf(min);
}

// Can `actor` act on `target` (kick, promote/demote)? Must have a strictly
// higher role; leader is untouchable.
export function outranks(actorMembership, targetMembership) {
  if (!actorMembership || !targetMembership) return false;
  if (actorMembership.gang_id !== targetMembership.gang_id) return false;
  return rankOf(actorMembership.role) > rankOf(targetMembership.role);
}

//  Loading 
export function loadGang(gangId) {
  return db.prepare('SELECT * FROM gangs WHERE id = ?').get(gangId);
}
export function loadGangByName(name) {
  return db.prepare('SELECT * FROM gangs WHERE name = ? COLLATE NOCASE').get(name);
}
export function loadGangByTag(tag) {
  return db.prepare('SELECT * FROM gangs WHERE tag = ? COLLATE NOCASE').get(tag);
}
export function loadMembership(charId) {
  return db.prepare('SELECT * FROM gang_members WHERE char_id = ?').get(charId);
}
export function loadMembers(gangId) {
  return db.prepare(`
    SELECT m.*, c.name, c.avatar, c.level, c.last_active_at, c.reputation
    FROM gang_members m JOIN characters c ON c.id = m.char_id
    WHERE m.gang_id = ?
    ORDER BY
      CASE m.role
        WHEN 'leader' THEN 0
        WHEN 'officer' THEN 1
        WHEN 'soldier' THEN 2
        WHEN 'recruit' THEN 3
        ELSE 4
      END,
      m.joined_at ASC
  `).all(gangId);
}

//  Founding 
//
// Returns { ok: true, gang } on success, or { error } on failure.
export function foundGang(founder, { name, tag, description }) {
  if (founder.level < FOUND_LEVEL_GATE) {
    return { error: `Reach level ${FOUND_LEVEL_GATE} before founding a gang.` };
  }
  if (loadMembership(founder.id)) {
    return { error: 'Leave your current gang before founding a new one.' };
  }
  const cleanName = (name || '').trim();
  const cleanTag  = (tag  || '').trim();
  if (cleanName.length < NAME_MIN || cleanName.length > NAME_MAX) {
    return { error: `Gang name must be ${NAME_MIN}–${NAME_MAX} characters.` };
  }
  if (cleanTag.length < TAG_MIN || cleanTag.length > TAG_MAX) {
    return { error: `Gang tag must be ${TAG_MIN}–${TAG_MAX} characters.` };
  }
  if (description && description.length > DESC_MAX) {
    return { error: `Description max ${DESC_MAX} chars.` };
  }
  if (loadGangByName(cleanName)) return { error: 'That gang name is taken.' };
  if (loadGangByTag(cleanTag))   return { error: 'That gang tag is taken.' };
  const now = Date.now();
  // Stamp the gang's faction from the founder. Gangs are subdivisions
  // of factions — a Mafia founder makes a Mafia gang. Unaligned founders
  // can still create a gang (faction = NULL), but it won't appear in
  // any faction's "your faction" filter until claimed.
  const r = db.prepare(`
    INSERT INTO gangs (name, tag, description, leader_id, treasury, reputation, faction, founded_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `).run(cleanName, cleanTag, description || null, founder.id, founder.faction || null, now);
  const gangId = r.lastInsertRowid;
  db.prepare(`
    INSERT INTO gang_members (char_id, gang_id, role, title, joined_at, contributed)
    VALUES (?, ?, 'leader', NULL, ?, 0)
  `).run(founder.id, gangId, now);
  return { ok: true, gang: loadGang(gangId) };
}

//  Invites 
export function pendingInvitesFor(charId) {
  return db.prepare(`
    SELECT i.*, g.name AS gang_name, g.tag AS gang_tag,
           c.name AS inviter_name, c.avatar AS inviter_avatar
    FROM gang_invites i
    JOIN gangs g ON g.id = i.gang_id
    JOIN characters c ON c.id = i.inviter_id
    WHERE i.invitee_id = ? AND i.status = 'pending'
    ORDER BY i.id DESC
  `).all(charId);
}

export function existingPendingInvite(gangId, inviteeId) {
  return db.prepare(`
    SELECT * FROM gang_invites
    WHERE gang_id = ? AND invitee_id = ? AND status = 'pending'
    LIMIT 1
  `).get(gangId, inviteeId);
}

//  Disband (leader only). Refunds treasury to leader 
export function disbandGang(gang, leader) {
  const refund = gang.treasury || 0;
  if (refund > 0) {
    leader.cash += refund;
    db.prepare('UPDATE characters SET cash = ? WHERE id = ?').run(leader.cash, leader.id);
  }
  db.prepare('DELETE FROM gangs WHERE id = ?').run(gang.id);
  // Members and chat rows are cascaded.
  return { refund };
}

//  Public payloads 
export function publicGang(gang, viewerId = null) {
  if (!gang) return null;
  const members = loadMembers(gang.id);
  return {
    id: gang.id,
    name: gang.name,
    tag: gang.tag,
    description: gang.description,
    leader_id: gang.leader_id,
    treasury: gang.treasury,
    reputation: gang.reputation,
    founded_at: gang.founded_at,
    member_count: members.length,
    members: members.map(m => ({
      char_id: m.char_id,
      name: m.name,
      avatar: m.avatar,
      level: m.level,
      role: m.role,
      title: m.title,
      reputation: m.reputation,
      contributed: m.contributed,
      joined_at: m.joined_at,
      last_active_at: m.last_active_at,
      is_self: viewerId === m.char_id,
    })),
  };
}

export function publicGangBadge(gang) {
  if (!gang) return null;
  return { id: gang.id, name: gang.name, tag: gang.tag };
}

// Convenience: given a character, return the gang badge (if any) for their
// public profile listing.
export function gangBadgeFor(charId) {
  const m = loadMembership(charId);
  if (!m) return null;
  const g = loadGang(m.gang_id);
  return publicGangBadge(g);
}

//  Wars 
//
// Lazy-expire any wars whose timer has elapsed. For each: pick winner,
// install a turf hold (or extend an existing one if the same gang wins
// again), close out the row. Idempotent and cheap — gets called from
// every war-aware reader.
export function expireFinishedWars() {
  const now = Date.now();
  const due = db.prepare(`
    SELECT * FROM gang_wars
    WHERE winner_id IS NULL AND ends_at <= ?
  `).all(now);
  if (!due.length) return;
  const updateWar = db.prepare(`
    UPDATE gang_wars SET winner_id = ?, ended_at = ? WHERE id = ?
  `);
  const upsertHold = db.prepare(`
    INSERT INTO turf_holds (city, gang_id, won_at, expires_at, from_war_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(city) DO UPDATE SET
      gang_id = excluded.gang_id,
      won_at = excluded.won_at,
      expires_at = excluded.expires_at,
      from_war_id = excluded.from_war_id
  `);
  for (const w of due) {
    let winnerId = null;
    if (w.score_a > w.score_b) winnerId = w.gang_a;
    else if (w.score_b > w.score_a) winnerId = w.gang_b;
    // Tie → winnerId stays null; no turf change.
    updateWar.run(winnerId || 0, now, w.id);
    if (winnerId) {
      upsertHold.run(w.contested_city, winnerId, now, now + TURF_HOLD_MS, w.id);
    }
  }
}

// True iff the gang is currently in a war (declarer or target, not yet
// resolved).
export function gangInActiveWar(gangId) {
  expireFinishedWars();
  return !!db.prepare(`
    SELECT 1 FROM gang_wars
    WHERE (gang_a = ? OR gang_b = ?) AND winner_id IS NULL AND ended_at IS NULL
  `).get(gangId, gangId);
}

// Active war row covering both gangs (in either direction). Null if none.
export function activeWarBetween(gangX, gangY) {
  expireFinishedWars();
  return db.prepare(`
    SELECT * FROM gang_wars
    WHERE winner_id IS NULL AND ended_at IS NULL
      AND ((gang_a = ? AND gang_b = ?) OR (gang_a = ? AND gang_b = ?))
  `).get(gangX, gangY, gangY, gangX);
}

export function activeWarFor(gangId) {
  expireFinishedWars();
  return db.prepare(`
    SELECT * FROM gang_wars
    WHERE (gang_a = ? OR gang_b = ?) AND winner_id IS NULL AND ended_at IS NULL
    LIMIT 1
  `).get(gangId, gangId);
}

export function listActiveWars() {
  expireFinishedWars();
  return db.prepare(`
    SELECT w.*,
           ga.name AS gang_a_name, ga.tag AS gang_a_tag,
           gb.name AS gang_b_name, gb.tag AS gang_b_tag
    FROM gang_wars w
    JOIN gangs ga ON ga.id = w.gang_a
    JOIN gangs gb ON gb.id = w.gang_b
    WHERE w.winner_id IS NULL AND w.ended_at IS NULL
    ORDER BY w.declared_at DESC
  `).all();
}

export function declareWar(declarerGang, targetGang, city) {
  if (!declarerGang || !targetGang) return { error: 'Gang not found.' };
  if (declarerGang.id === targetGang.id) return { error: "Can't declare war on your own gang." };
  expireFinishedWars();
  if (gangInActiveWar(declarerGang.id)) return { error: 'Your gang is already in a war.' };
  if (gangInActiveWar(targetGang.id))   return { error: 'Target gang is already in a war.' };
  // 48h rematch cooldown
  const recent = db.prepare(`
    SELECT * FROM gang_wars
    WHERE ((gang_a = ? AND gang_b = ?) OR (gang_a = ? AND gang_b = ?))
      AND ended_at IS NOT NULL
      AND ended_at > ?
    ORDER BY ended_at DESC LIMIT 1
  `).get(declarerGang.id, targetGang.id, targetGang.id, declarerGang.id, Date.now() - WAR_REMATCH_MS);
  if (recent) {
    const hrs = Math.ceil((recent.ended_at + WAR_REMATCH_MS - Date.now()) / (60 * 60 * 1000));
    return { error: `Recently fought — wait ${hrs}h to declare on them again.` };
  }
  const now = Date.now();
  const r = db.prepare(`
    INSERT INTO gang_wars (gang_a, gang_b, contested_city, declared_at, ends_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(declarerGang.id, targetGang.id, city, now, now + WAR_DURATION_MS);
  return {
    ok: true,
    war: db.prepare('SELECT * FROM gang_wars WHERE id = ?').get(r.lastInsertRowid),
  };
}

// Bump the war scoreboard. Called from PvP after a successful KO or kill
// between members of the two warring gangs in the contested city. Returns
// the updated war row, or null if no qualifying war.
export function bumpWarScoreFromAttack(attacker, victim, eventCity, kind /* 'ko' | 'murder' */) {
  if (!attacker || !victim) return null;
  const aMem = loadMembership(attacker.id);
  const vMem = loadMembership(victim.id);
  if (!aMem || !vMem) return null;
  if (aMem.gang_id === vMem.gang_id) return null;
  const war = activeWarBetween(aMem.gang_id, vMem.gang_id);
  if (!war) return null;
  if (war.contested_city !== eventCity) return null;
  const points = kind === 'murder' ? SCORE_MURDER : SCORE_KO;
  const col = aMem.gang_id === war.gang_a ? 'score_a' : 'score_b';
  db.prepare(`UPDATE gang_wars SET ${col} = ${col} + ? WHERE id = ?`).run(points, war.id);
  return db.prepare('SELECT * FROM gang_wars WHERE id = ?').get(war.id);
}

//  Turf holds 
export function listTurfHolds() {
  expireFinishedWars();
  const now = Date.now();
  // Drop any holds that have expired naturally.
  db.prepare('DELETE FROM turf_holds WHERE expires_at <= ?').run(now);
  return db.prepare(`
    SELECT t.*, g.name AS gang_name, g.tag AS gang_tag
    FROM turf_holds t JOIN gangs g ON g.id = t.gang_id
    ORDER BY t.expires_at DESC
  `).all();
}

export function turfHolderInCity(city) {
  expireFinishedWars();
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM turf_holds WHERE city = ? AND expires_at > ?
  `).get(city, now);
  return row || null;
}

// True iff `charId` is a member of the gang currently holding `city`.
// Powers the crime-cooldown discount.
export function holdsTurfPerk(charId, city) {
  const hold = turfHolderInCity(city);
  if (!hold) return false;
  const m = loadMembership(charId);
  return !!(m && m.gang_id === hold.gang_id);
}

//  Leader-death handling 
//
// Called BEFORE deleting the dead character row when a murder kills a
// leader. Promotes the most senior surviving member, or disbands if no
// members remain. Returns { newLeaderId } or { disbanded: true }.
export function handleLeaderDeath(gangId, deadLeaderId) {
  const survivors = db.prepare(`
    SELECT m.*, c.name FROM gang_members m JOIN characters c ON c.id = m.char_id
    WHERE m.gang_id = ? AND m.char_id != ?
    ORDER BY
      CASE m.role
        WHEN 'officer' THEN 0
        WHEN 'soldier' THEN 1
        WHEN 'recruit' THEN 2
        ELSE 3
      END,
      m.joined_at ASC
  `).all(gangId, deadLeaderId);
  if (!survivors.length) {
    // Treasury vanishes with the dead leader; just delete the gang.
    db.prepare('DELETE FROM gangs WHERE id = ?').run(gangId);
    return { disbanded: true };
  }
  const heir = survivors[0];
  db.prepare("UPDATE gang_members SET role = 'leader' WHERE char_id = ?").run(heir.char_id);
  db.prepare('UPDATE gangs SET leader_id = ? WHERE id = ?').run(heir.char_id, gangId);
  return { newLeaderId: heir.char_id, newLeaderName: heir.name };
}
