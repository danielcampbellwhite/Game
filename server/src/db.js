import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR is overridable so deploys (Railway volume, Fly volume, a host
// bind mount) can point the DB at a persistent path. Default is the
// repo-local ./data which is what `npm run dev` uses.
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'mafia.sqlite');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      city TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 100,
      max_energy INTEGER NOT NULL DEFAULT 100,
      nerve INTEGER NOT NULL DEFAULT 10,
      max_nerve INTEGER NOT NULL DEFAULT 10,
      health INTEGER NOT NULL DEFAULT 100,
      max_health INTEGER NOT NULL DEFAULT 100,
      happiness INTEGER NOT NULL DEFAULT 50,
      strength INTEGER NOT NULL DEFAULT 1,
      defence INTEGER NOT NULL DEFAULT 1,
      speed INTEGER NOT NULL DEFAULT 1,
      intelligence INTEGER NOT NULL DEFAULT 1,
      reputation INTEGER NOT NULL DEFAULT 0,
      cash INTEGER NOT NULL DEFAULT 500,
      bank INTEGER NOT NULL DEFAULT 0,
      dirty_cash INTEGER NOT NULL DEFAULT 0,
      jail_until INTEGER,
      hospital_until INTEGER,
      travel_until INTEGER,
      travel_to TEXT,
      last_tick INTEGER NOT NULL,
      last_daily INTEGER,
      login_streak INTEGER NOT NULL DEFAULT 0,
      bank_last_interest INTEGER NOT NULL,
      equipped_weapon TEXT,
      equipped_armour TEXT,
      prestige INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      ammo INTEGER NOT NULL DEFAULT 0,
      UNIQUE(char_id, kind, item_id)
    );

    CREATE TABLE IF NOT EXISTS businesses_owned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      business_id TEXT NOT NULL,
      city TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      last_collected INTEGER NOT NULL,
      UNIQUE(char_id, business_id, city)
    );

    CREATE TABLE IF NOT EXISTS properties_owned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL,
      city TEXT NOT NULL,
      UNIQUE(char_id, property_id, city)
    );

    CREATE TABLE IF NOT EXISTS stocks_owned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      stock_id TEXT NOT NULL,
      shares INTEGER NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      UNIQUE(char_id, stock_id)
    );

    CREATE TABLE IF NOT EXISTS stock_market (
      stock_id TEXT PRIMARY KEY,
      price REAL NOT NULL,
      trend REAL NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL,
      trend_until INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_history (
      stock_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (stock_id, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_history_ts ON stock_history(stock_id, ts);

    CREATE TABLE IF NOT EXISTS drug_market (
      city TEXT NOT NULL,
      drug_id TEXT NOT NULL,
      price REAL NOT NULL,
      last_updated INTEGER NOT NULL,
      PRIMARY KEY (city, drug_id)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      principal INTEGER NOT NULL,
      rate REAL NOT NULL,
      due_at INTEGER NOT NULL,
      taken_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs_held (
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      last_worked INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (char_id, job_id)
    );

    -- Permanent employment: one active job per character. Hourly pay accrues
    -- continuously (capped 24h pending). Daily check-in required or fired.
    CREATE TABLE IF NOT EXISTS employment (
      char_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      hired_at INTEGER NOT NULL,
      last_paid_at INTEGER NOT NULL,
      last_checkin_at INTEGER NOT NULL,
      total_earned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_log_char ON log(char_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS consumable_cooldowns (
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      used_at INTEGER NOT NULL,
      PRIMARY KEY (char_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS vehicles_owned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      vehicle_id TEXT NOT NULL,
      acquired_via TEXT NOT NULL,
      city TEXT NOT NULL,
      acquired_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_char ON vehicles_owned(char_id);

    CREATE TABLE IF NOT EXISTS blackjack_hands (
      char_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      bet INTEGER NOT NULL,
      player_cards TEXT NOT NULL,
      dealer_cards TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      message TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmaker_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sport TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      outcomes_json TEXT NOT NULL,
      resolves_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_outcome TEXT,
      resolved_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_events_active ON bookmaker_events(resolved_outcome, resolves_at);

    CREATE TABLE IF NOT EXISTS bookmaker_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES bookmaker_events(id) ON DELETE CASCADE,
      outcome TEXT NOT NULL,
      amount INTEGER NOT NULL,
      odds_at_bet REAL NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      won INTEGER,
      payout INTEGER,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_bets_char ON bookmaker_bets(char_id, settled, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bets_event ON bookmaker_bets(event_id, settled);

    -- Active turn-based fight. One row per character; row exists only while
    -- a fight is in progress. Cleared on win/KO/flee. log_json is an
    -- append-only JSON array of round entries surfaced to the UI.
    CREATE TABLE IF NOT EXISTS active_fight (
      char_id      INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      enemy_id     TEXT    NOT NULL,
      player_hp    INTEGER NOT NULL,
      enemy_hp     INTEGER NOT NULL,
      enemy_max_hp INTEGER NOT NULL,
      round        INTEGER NOT NULL DEFAULT 1,
      log_json     TEXT    NOT NULL DEFAULT '[]',
      used_ammo    INTEGER NOT NULL DEFAULT 0,
      started_at   INTEGER NOT NULL
    );

    -- Daily missions: three rows per character per UTC day. rolled_day is a
    -- 'YYYY-MM-DD' string in UTC; on the first /api/missions GET of a new
    -- day, the prior day's rows are deleted and three fresh ones rolled.
    CREATE TABLE IF NOT EXISTS daily_missions (
      char_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      mission_id  TEXT    NOT NULL,
      progress    INTEGER NOT NULL DEFAULT 0,
      target      INTEGER NOT NULL,
      reward_xp   INTEGER NOT NULL,
      reward_cash INTEGER NOT NULL,
      claimed     INTEGER NOT NULL DEFAULT 0,
      rolled_day  TEXT    NOT NULL,
      PRIMARY KEY (char_id, mission_id)
    );

    -- ── Multiplayer: direct messages ──────────────────────────────────
    -- One row per pair of players who have ever chatted. char_lo < char_hi
    -- so the pair has a single canonical row regardless of which side
    -- spoke first. last_message_at lets us order the thread list cheaply.
    CREATE TABLE IF NOT EXISTS dm_threads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      char_lo         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      char_hi         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      last_message_at INTEGER NOT NULL,
      UNIQUE (char_lo, char_hi)
    );
    CREATE INDEX IF NOT EXISTS idx_dm_threads_lo ON dm_threads(char_lo, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dm_threads_hi ON dm_threads(char_hi, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS dm_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id   INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
      sender_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id, id);

    -- Per-side read pointer: each character's most recent message id seen
    -- on a thread. Unread count = COUNT(messages.id > read_up_to AND sender != self).
    CREATE TABLE IF NOT EXISTS dm_reads (
      thread_id   INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
      char_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      read_up_to  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (thread_id, char_id)
    );

    CREATE TABLE IF NOT EXISTS dm_blocks (
      blocker_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      blocked_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    -- ── Multiplayer: PvP knockouts ────────────────────────────────────
    -- Challenge handshake: attacker creates a row; target accepts/declines
    -- inside expires_at or it's auto-expired. status transitions:
    --   pending → accepted (deleted on conversion to pvp_fights row)
    --   pending → declined / expired (kept as audit row briefly)
    CREATE TABLE IF NOT EXISTS pvp_challenges (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      target_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pvp_challenges_target ON pvp_challenges(target_id, status);
    CREATE INDEX IF NOT EXISTS idx_pvp_challenges_attacker ON pvp_challenges(attacker_id, status);

    -- Active PvP fight. Each character can be in at most one (enforced by
    -- the unique indexes below). Turn alternates; turn_deadline triggers
    -- a lazy auto-flee on the next /pvp/state or /pvp/attack call from
    -- either side after expiry.
    CREATE TABLE IF NOT EXISTS pvp_fights (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      target_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      attacker_hp     INTEGER NOT NULL,
      target_hp       INTEGER NOT NULL,
      attacker_max_hp INTEGER NOT NULL,
      target_max_hp   INTEGER NOT NULL,
      turn            TEXT NOT NULL DEFAULT 'attacker',
      round           INTEGER NOT NULL DEFAULT 1,
      log_json        TEXT NOT NULL DEFAULT '[]',
      turn_deadline   INTEGER NOT NULL,
      city            TEXT NOT NULL,
      created_at      INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_fights_attacker ON pvp_fights(attacker_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_fights_target   ON pvp_fights(target_id);

    -- ── Multiplayer: gangs ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS gangs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      tag         TEXT    NOT NULL,
      description TEXT,
      leader_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
      treasury    INTEGER NOT NULL DEFAULT 0,
      reputation  INTEGER NOT NULL DEFAULT 0,
      founded_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gangs_name_unique ON gangs(name COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gangs_tag_unique  ON gangs(tag  COLLATE NOCASE);

    -- One gang per character — char_id is the primary key. role drives
    -- permissions; title is purely cosmetic. contributed tracks the
    -- running total this member has paid into the treasury.
    CREATE TABLE IF NOT EXISTS gang_members (
      char_id     INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      gang_id     INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      role        TEXT    NOT NULL DEFAULT 'recruit',
      title       TEXT,
      joined_at   INTEGER NOT NULL,
      contributed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_gang_members_gang ON gang_members(gang_id, role);

    -- Open invites. status: pending / accepted / declined / cancelled.
    -- Once accepted/declined, kept briefly for audit then can be expired.
    CREATE TABLE IF NOT EXISTS gang_invites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      gang_id     INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      invitee_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      inviter_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gang_invites_invitee ON gang_invites(invitee_id, status);
    CREATE INDEX IF NOT EXISTS idx_gang_invites_gang    ON gang_invites(gang_id, status);

    -- Gang chat. No per-member read pointer for v1 — gang chat is a feed,
    -- not a notifications surface. We just paginate latest first.
    CREATE TABLE IF NOT EXISTS gang_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      gang_id     INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      sender_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gang_messages_gang ON gang_messages(gang_id, id);

    -- ── Turf wars ─────────────────────────────────────────────────────
    -- gang_a is the declarer, gang_b the target. Active while winner_id
    -- IS NULL AND ended_at IS NULL. Lazy-expired by services/gangs.js
    -- whenever any war-aware route runs.
    CREATE TABLE IF NOT EXISTS gang_wars (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      gang_a          INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      gang_b          INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      contested_city  TEXT    NOT NULL,
      declared_at     INTEGER NOT NULL,
      ends_at         INTEGER NOT NULL,
      score_a         INTEGER NOT NULL DEFAULT 0,
      score_b         INTEGER NOT NULL DEFAULT 0,
      winner_id       INTEGER,
      ended_at        INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_wars_active_a ON gang_wars(gang_a, ended_at);
    CREATE INDEX IF NOT EXISTS idx_wars_active_b ON gang_wars(gang_b, ended_at);

    -- One row per held city. Replaced on each new winner.
    CREATE TABLE IF NOT EXISTS turf_holds (
      city        TEXT    PRIMARY KEY,
      gang_id     INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
      won_at      INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      from_war_id INTEGER REFERENCES gang_wars(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_turf_holds_gang ON turf_holds(gang_id);

    -- ── Organised crimes (heists) ────────────────────────────────────
    -- Plan rows live until the heist is executed or cancelled. status:
    --   recruiting → ready (all roles filled) → complete | failed | cancelled
    CREATE TABLE IF NOT EXISTS oc_plans (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      crime_id     TEXT    NOT NULL,
      leader_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'recruiting',
      created_at   INTEGER NOT NULL,
      executed_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_oc_plans_leader ON oc_plans(leader_id, status);

    -- One row per role per plan. assigned_char_id NULL while the role is
    -- open; otherwise points at the player committed to it.
    CREATE TABLE IF NOT EXISTS oc_roles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id           INTEGER NOT NULL REFERENCES oc_plans(id) ON DELETE CASCADE,
      role_id           TEXT    NOT NULL,
      assigned_char_id  INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      assigned_at       INTEGER,
      UNIQUE (plan_id, role_id)
    );
    CREATE INDEX IF NOT EXISTS idx_oc_roles_plan ON oc_roles(plan_id);
    CREATE INDEX IF NOT EXISTS idx_oc_roles_assigned ON oc_roles(assigned_char_id);

    -- Permanent audit row when a plan executes. Useful for the "Recent
    -- heists" feed and post-mortem inspection.
    CREATE TABLE IF NOT EXISTS oc_results (
      plan_id          INTEGER PRIMARY KEY REFERENCES oc_plans(id) ON DELETE CASCADE,
      success          INTEGER NOT NULL,
      payout_total     INTEGER NOT NULL,
      payout_split_json TEXT  NOT NULL,
      log_json         TEXT   NOT NULL DEFAULT '[]',
      executed_at      INTEGER NOT NULL
    );
  `);

  // Migrations for columns added after the initial schema. Each is wrapped in
  // try/catch because SQLite has no `ADD COLUMN IF NOT EXISTS`.
  const addColumnIfMissing = (table, col, decl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  };
  addColumnIfMissing('characters', 'last_health_tick', 'INTEGER');
  addColumnIfMissing('businesses_owned', 'custom_name', 'TEXT');
  addColumnIfMissing('businesses_owned', 'scale',       'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('businesses_owned', 'risk',        'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('businesses_owned', 'quality',     'INTEGER NOT NULL DEFAULT 1');

  // Temporary stat buffs from gym/range training. *_at is the timestamp of
  // the most recent training; the effective buff decays linearly at 1 point
  // per hour from that point. See services/buffs.js.
  for (const stat of ['strength', 'defence', 'speed', 'accuracy']) {
    addColumnIfMissing('characters', `${stat}_buff`,    'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('characters', `${stat}_buff_at`, 'INTEGER');
  }
  // Hidden gym-progress accumulators. Each gym session adds a fraction;
  // every full point ticks up the base stat permanently.
  for (const stat of ['strength', 'defence', 'speed']) {
    addColumnIfMissing('characters', `${stat}_progress`, 'REAL NOT NULL DEFAULT 0');
  }
  // Notifications: we mark certain log rows as "notify" so the bell can
  // surface them. last_log_seen_at on the character drives the unread badge.
  addColumnIfMissing('log',        'notify',           'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('characters', 'last_log_seen_at', 'INTEGER');

  // Employment: shift-based pay model
  addColumnIfMissing('employment', 'pending_pay',            'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('employment', 'last_checkin_shift_end', 'INTEGER');

  // Flavour text for "why am I here?" surfaces on the Jail / Hospital pages.
  // Set whenever something bumps jail_until / hospital_until; cleared when
  // the timer expires or the player buys an early discharge.
  addColumnIfMissing('characters', 'jail_reason',     'TEXT');
  addColumnIfMissing('characters', 'hospital_reason', 'TEXT');

  // Multiplayer presence — touched by requireAuth on every authed request.
  // "Online" is derived as (now - last_active_at) < 60_000 in publicProfileFor.
  addColumnIfMissing('characters', 'last_active_at', 'INTEGER');

  // PvP fights gain a mode column to differentiate KO ('knockout') from
  // permadeath ('murder'). pvp_challenges mirrors so both sides see it.
  addColumnIfMissing('pvp_fights',     'mode', "TEXT NOT NULL DEFAULT 'knockout'");
  addColumnIfMissing('pvp_challenges', 'mode', "TEXT NOT NULL DEFAULT 'knockout'");

  // Multiplayer requires globally-unique character names. Existing rows that
  // happen to collide get a `#<id>` suffix so they keep working; the unique
  // index is created afterwards. We use COLLATE NOCASE so "Boss Man" and
  // "boss man" are treated as the same name.
  const dupes = db.prepare(`
    SELECT name COLLATE NOCASE AS lower_name, MIN(id) AS keeper
    FROM characters
    GROUP BY name COLLATE NOCASE
    HAVING COUNT(*) > 1
  `).all();
  for (const d of dupes) {
    const collisions = db.prepare(
      `SELECT id, name FROM characters WHERE name COLLATE NOCASE = ? AND id != ?`
    ).all(d.lower_name, d.keeper);
    for (const row of collisions) {
      const suffixed = `${row.name}#${row.id}`;
      db.prepare('UPDATE characters SET name = ? WHERE id = ?').run(suffixed, row.id);
    }
  }
  // Now safe to enforce uniqueness. CREATE INDEX IF NOT EXISTS is idempotent.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_name_unique ON characters(name COLLATE NOCASE)');

  // Rename old generic weapon IDs to specific real-world replacements so
  // existing characters keep functioning when the catalogue is rewritten.
  const weaponRenames = {
    pistol:  'beretta_92fs',
    shotgun: 'remington_870',
    rifle:   'm4a1',
    sniper:  'barrett_m82',
  };
  for (const [oldId, newId] of Object.entries(weaponRenames)) {
    db.prepare('UPDATE characters SET equipped_weapon = ? WHERE equipped_weapon = ?').run(newId, oldId);
    // UPDATE OR IGNORE skips rows that would violate the inventory unique
    // constraint (i.e., the player already owns the new ID); a follow-up
    // DELETE removes any stale legacy rows.
    db.prepare("UPDATE OR IGNORE inventory SET item_id = ? WHERE kind = 'weapon' AND item_id = ?").run(newId, oldId);
    db.prepare("DELETE FROM inventory WHERE kind = 'weapon' AND item_id = ?").run(oldId);
  }
}
