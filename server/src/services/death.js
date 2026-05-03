import { db } from '../db.js';
import { saveCharacter } from './character.js';
import { writeLog } from './log.js';
import { sendEvent } from './events.js';
import { handleLeaderDeath, loadMembership } from './gangs.js';

// Permadeath. The character row stays in the DB but is flipped to
// `pending_new_character` status — the player has to roll a brand-new
// character (name/avatar/city) at /new-character before they can play
// again. The new character starts at level 10 with default stats and
// gets a fresh 3-day protection window from creation.
//
// Stripped here: every owned thing — bank, cash, dirty cash, inventory,
// modded weapons, vehicles, properties, businesses (NPC + player shops),
// stocks, loans, gang membership, jobs, listings, active fights/trades.
//
// Caller is responsible for the cash transfer to the killer; cash on
// hand should already be zeroed and credited before we get here.
export function softDeath(loser, killerName = null) {
  const now = Date.now();
  const lid = loser.id;

  // Gang leader handoff before clearing membership — RESTRICT FK on
  // gangs.leader_id would otherwise block.
  let succession = null;
  const m = loadMembership(lid);
  if (m) {
    const g = db.prepare('SELECT * FROM gangs WHERE id = ?').get(m.gang_id);
    if (g && g.leader_id === lid) {
      succession = handleLeaderDeath(g.id, lid);
    }
  }

  // Wipe every owned thing.
  db.prepare('DELETE FROM inventory          WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM weapon_instances   WHERE owner_id = ?').run(lid);
  db.prepare('DELETE FROM vehicles_owned     WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM properties_owned   WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM businesses_owned   WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM businesses_player  WHERE owner_id = ?').run(lid);
  db.prepare('DELETE FROM stocks_owned       WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM loans              WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM gang_members       WHERE char_id  = ?').run(lid);
  db.prepare('DELETE FROM gang_invites       WHERE invitee_id = ? OR inviter_id = ?').run(lid, lid);
  db.prepare('DELETE FROM employment         WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM jobs_held          WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM job_board_listings WHERE poster_id = ?').run(lid);
  db.prepare('DELETE FROM bookmaker_bets     WHERE char_id = ? AND settled = 0').run(lid);
  db.prepare('DELETE FROM blackjack_hands    WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM consumable_cooldowns WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM daily_missions     WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM active_fight       WHERE char_id = ?').run(lid);
  db.prepare('DELETE FROM pvp_fights         WHERE attacker_id = ? OR target_id = ?').run(lid, lid);
  db.prepare('DELETE FROM pvp_challenges     WHERE attacker_id = ? OR target_id = ?').run(lid, lid);
  // Open trades cancel rather than delete so the other side gets a clean
  // status update.
  db.prepare(`
    UPDATE trades SET status = 'cancelled', ended_at = ?
    WHERE (initiator_id = ? OR recipient_id = ?) AND status IN ('pending', 'active')
  `).run(now, lid, lid);
  db.prepare('UPDATE oc_roles SET assigned_char_id = NULL, assigned_at = NULL WHERE assigned_char_id = ?').run(lid);

  // Zero the row's volatile state but leave it intact. The actual
  // identity (name/avatar/city/stats/level) is replaced when the
  // player submits the new-character form — until then the row sits
  // in `pending_new_character` and the client redirects to /new-character.
  loser.cash = 0;
  loser.dirty_cash = 0;
  loser.bank = 0;
  loser.equipped_weapon = 'fists';
  loser.equipped_armour = 'none';
  loser.equipped_weapon_instance = null;
  loser.jail_until = null;
  loser.jail_reason = null;
  loser.hospital_until = null;
  loser.hospital_reason = null;
  loser.travel_until = null;
  loser.travel_to = null;

  saveCharacter(loser);
  db.prepare("UPDATE characters SET status = 'pending_new_character' WHERE id = ?").run(lid);

  writeLog(
    lid,
    'system',
    killerName
      ? ` Murdered by ${killerName}. Roll a new character to continue.`
      : ` Killed in action. Roll a new character to continue.`,
    { killer: killerName },
    true,
  );

  sendEvent(lid, 'character.died', { killer: killerName });
  return { succession };
}
