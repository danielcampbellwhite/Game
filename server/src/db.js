import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { propertyById, vehicleById } from './data.js';

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
      email TEXT,
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

    --  Multiplayer: direct messages 
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

    --  Multiplayer: PvP knockouts 
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

    --  Multiplayer: gangs 
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

    --  Turf wars 
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

    --  Organised crimes (heists) 
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

    --  Weapon customisation (Phase 2) 
    -- One row per modified weapon. Stock (unmodified) weapons stay in
    -- the aggregated inventory rows; the first time a player installs
    -- a mod we promote one instance out of the stack into a row here.
    -- mods_json maps slot → mod id, e.g. { barrel: "barrel_pistol_long" }.
    CREATE TABLE IF NOT EXISTS weapon_instances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      base_item_id TEXT   NOT NULL,
      mods_json   TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_weapon_instances_owner ON weapon_instances(owner_id);

    --  Player-run Businesses (Phase 1: shops) 
    -- Player-founded businesses, city-locked. Two-pot cash model:
    -- outgoings_cash pays rent, sales_cash accumulates revenue.
    -- 30% of founding cost auto-seeds the outgoings pot. Owner tops up
    -- outgoings from their wallet; withdraws sales to it.
    --
    -- type   — 'shop' for now (more types in later phases: casino…)
    -- tier   — 'small' / 'medium' / 'large' — drives slots + rent
    -- status — 'active' / 'inactive' (rent unpaid) / 'closed'
    -- config_json — type-specific knobs (casino stakes etc.)
    CREATE TABLE IF NOT EXISTS businesses_player (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id        INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      city            TEXT    NOT NULL,
      type            TEXT    NOT NULL,
      name            TEXT    NOT NULL,
      description     TEXT,
      tier            TEXT    NOT NULL,
      outgoings_cash  INTEGER NOT NULL DEFAULT 0,
      sales_cash      INTEGER NOT NULL DEFAULT 0,
      total_revenue   INTEGER NOT NULL DEFAULT 0,
      total_rent_paid INTEGER NOT NULL DEFAULT 0,
      total_tax_paid  INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'active',
      inactive_since  INTEGER,
      last_rent_at    INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      config_json     TEXT    NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_pbiz_city ON businesses_player(city, status);
    CREATE INDEX IF NOT EXISTS idx_pbiz_owner ON businesses_player(owner_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pbiz_name_unique ON businesses_player(name COLLATE NOCASE);

    --  Player ↔ player trades 
    -- A direct trade between two players. Each side has an offer JSON
    -- with shape { items: [{kind, item_id, qty}], cash }.
    -- Confirmation is per-side; editing your own offer auto-resets BOTH
    -- confirmation locks so neither player can get sneaked. Atomic swap
    -- happens in /complete.
    --
    -- status:
    --   pending   — initiator created, recipient hasn't accepted yet
    --   active    — recipient accepted; both can edit / confirm
    --   completed — atomic swap succeeded
    --   cancelled — either side declined / cancelled
    --   expired   — auto-cancelled after idle timeout
    CREATE TABLE IF NOT EXISTS trades (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      initiator_id          INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      recipient_id          INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      status                TEXT    NOT NULL DEFAULT 'pending',
      initiator_offer_json  TEXT    NOT NULL DEFAULT '{"items":[],"cash":0}',
      recipient_offer_json  TEXT    NOT NULL DEFAULT '{"items":[],"cash":0}',
      initiator_confirmed   INTEGER NOT NULL DEFAULT 0,
      recipient_confirmed   INTEGER NOT NULL DEFAULT 0,
      created_at            INTEGER NOT NULL,
      last_active_at        INTEGER NOT NULL,
      ended_at              INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_trades_initiator_status ON trades(initiator_id, status);
    CREATE INDEX IF NOT EXISTS idx_trades_recipient_status ON trades(recipient_id, status);

    --  Street races
    -- Live PvP race request. Challenger picks a tier and a stake; the
    -- opponent has a short window to accept. On accept the server rolls
    -- the winner deterministically (using car stats + driving skill +
    -- some variance), settles cash both ways, and chips condition off
    -- both cars.
    --
    -- status:
    --   pending   — challenge sent, awaiting response
    --   completed — opponent accepted; winner_id set
    --   declined  — opponent declined
    --   cancelled — challenger pulled before accept
    --   expired   — auto-cancelled after expires_at
    CREATE TABLE IF NOT EXISTS races (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      opponent_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      tier          INTEGER NOT NULL,
      stake         INTEGER NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      city          TEXT    NOT NULL,
      winner_id     INTEGER,
      result_json   TEXT,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      ended_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_races_status ON races(status);
    CREATE INDEX IF NOT EXISTS idx_races_opponent ON races(opponent_id, status);
    CREATE INDEX IF NOT EXISTS idx_races_challenger ON races(challenger_id, status);

    CREATE TABLE IF NOT EXISTS trade_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id    INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      sender_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      body        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trade_messages_trade ON trade_messages(trade_id, id);

    -- One shop listing = one offer line. qty represents stack size for
    -- non-unique items (later: per-instance modified items will live
    -- under a separate item_instances table referenced by id).
    --
    -- kind         — 'misc' for now (next phase adds 'weapon'/'vehicle'/...)
    -- source       — 'wholesale' (bought from wholesaler at retail-set
    --                price) or 'inventory' (owner moved their own item in)
    CREATE TABLE IF NOT EXISTS shop_listings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses_player(id) ON DELETE CASCADE,
      kind        TEXT    NOT NULL,
      item_id     TEXT    NOT NULL,
      source      TEXT    NOT NULL,
      qty         INTEGER NOT NULL,
      price_each  INTEGER NOT NULL,
      listed_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listing_biz ON shop_listings(business_id);

    --  Player-driven Job Board 
    -- A newspaper-style classifieds board, scoped to one city per ad.
    -- The server holds no contract / no escrow — it's pure connective
    -- tissue: posters describe the gig + price; takers reach out via DM
    -- and the two settle privately (bank transfer, etc.). The 7-day
    -- expiry keeps the board feeling current without a cron.
    CREATE TABLE IF NOT EXISTS job_board_listings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      poster_id   INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      city        TEXT    NOT NULL,
      category    TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      body        TEXT    NOT NULL,
      rate_text   TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_board_city_active ON job_board_listings(city, expires_at);
    CREATE INDEX IF NOT EXISTS idx_job_board_poster ON job_board_listings(poster_id);
  `);

  // Migrations for columns added after the initial schema. Each is wrapped in
  // try/catch because SQLite has no `ADD COLUMN IF NOT EXISTS`.
  const addColumnIfMissing = (table, col, decl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  };
  addColumnIfMissing('users', 'email', 'TEXT');
  // Intra-city location + active journey. `current_location` is the
  // slug from services/locations.js LOCATIONS; NULL is treated as
  // 'streets' (the default hub). The three intra_travel_* fields
  // mirror travel_until / travel_to for intercity flights but are a
  // separate axis so a flight and a walk can't be active at once.
  addColumnIfMissing('characters', 'current_location',   'TEXT');
  addColumnIfMissing('characters', 'intra_travel_until', 'INTEGER');
  addColumnIfMissing('characters', 'intra_travel_to',    'TEXT');
  addColumnIfMissing('characters', 'intra_travel_mode',  'TEXT');
  // Stamped the first time the one-time weight migration completes for
  // this character (see services/weight.js). NULL means "needs migrate"
  // and applyTick will run it lazily.
  addColumnIfMissing('characters', 'weight_migrated_at', 'INTEGER');
  // Equipped clothing — JSON map of slot → item_id, e.g.
  // {"hat":"snapback_red","top":"hoodie_blood","accessory":"rolex_submariner"}.
  // Catalog + slot list live in data-clothing.js. NULL = nothing
  // equipped, treated as {} by services/clothing.js.
  addColumnIfMissing('characters', 'equipped_clothing', 'TEXT');
  // Set to 1 the first time the player resolves a police chase. Used
  // by the chase mini-game to show a one-time tutorial overlay with
  // the countdown paused. NULL = never seen, 1 = seen.
  addColumnIfMissing('characters', 'chase_tutorial_seen', 'INTEGER');

  // Clothing owned — one row per (character, clothing item). Items are
  // non-stackable cosmetics, so qty is implicit at 1.
  db.exec(`
    CREATE TABLE IF NOT EXISTS clothing_owned (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_id     TEXT    NOT NULL,
      acquired_at INTEGER NOT NULL,
      UNIQUE(char_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clothing_char ON clothing_owned(char_id);
  `);

  // One-off cleanup: the Job Board used to be a physical in-city
  // location (job_board). It's now a regular nav item accessible
  // from anywhere, so anyone whose persisted current_location is
  // 'job_board' gets snapped back to 'streets'. Safe to re-run on
  // every boot.
  db.prepare("UPDATE characters SET current_location = 'streets' WHERE current_location = 'job_board'").run();
  // Same: Newsstand was retired in favour of a Dashboard newspaper
  // card. Snap anyone stranded at the slug back to the streets.
  db.prepare("UPDATE characters SET current_location = 'streets' WHERE current_location = 'newsstand'").run();

  // Stash table — extra inventory held outside the player's pocket.
  // Personal items continue to live in the existing `inventory` table.
  // Rows here are scoped by (container, city, vehicle_id) so a NY
  // house stash is distinct from a Tokyo house stash, and each
  // vehicle's cargo is keyed to that specific car.
  //
  // Two-step setup to handle the in-place migration from 0.9.12's
  // schema (no vehicle_id column): CREATE IF NOT EXISTS lays down
  // the new shape for fresh DBs; the migration block below rebuilds
  // the table when an older shape is detected.
  db.exec(`
    CREATE TABLE IF NOT EXISTS stash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      container  TEXT    NOT NULL,
      city       TEXT,
      vehicle_id INTEGER REFERENCES vehicles_owned(id) ON DELETE CASCADE,
      kind       TEXT    NOT NULL,
      item_id    TEXT    NOT NULL,
      qty        INTEGER NOT NULL DEFAULT 1,
      ammo       INTEGER NOT NULL DEFAULT 0,
      UNIQUE(char_id, container, city, vehicle_id, kind, item_id)
    );
  `);
  // Schema migration: stash table shipped in 0.9.12 without a
  // vehicle_id column. If the existing table predates this commit,
  // rebuild it with the new schema. SQLite can't ALTER a UNIQUE so
  // we copy through a temp table.
  {
    const cols = db.prepare('PRAGMA table_info(stash)').all().map(r => r.name);
    if (!cols.includes('vehicle_id')) {
      db.exec(`
        ALTER TABLE stash RENAME TO stash_old;
        CREATE TABLE stash (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          char_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          container  TEXT    NOT NULL,
          city       TEXT,
          vehicle_id INTEGER REFERENCES vehicles_owned(id) ON DELETE CASCADE,
          kind       TEXT    NOT NULL,
          item_id    TEXT    NOT NULL,
          qty        INTEGER NOT NULL DEFAULT 1,
          ammo       INTEGER NOT NULL DEFAULT 0,
          UNIQUE(char_id, container, city, vehicle_id, kind, item_id)
        );
        INSERT INTO stash (id, char_id, container, city, vehicle_id, kind, item_id, qty, ammo)
          SELECT id, char_id, container, city, NULL, kind, item_id, qty, ammo FROM stash_old;
        DROP TABLE stash_old;
      `);
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stash_char    ON stash(char_id);
    CREATE INDEX IF NOT EXISTS idx_stash_house   ON stash(char_id, container, city);
    CREATE INDEX IF NOT EXISTS idx_stash_vehicle ON stash(char_id, container, vehicle_id);
  `);
  // Admin/god flag. The very first user to call /api/admin/promote-self
  // (gated by ADMIN_TOKEN) is granted admin; thereafter the flag is the
  // source of truth and ADMIN_TOKEN is only needed for re-bootstrap.
  addColumnIfMissing('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  // Faction allegiance — picked at character creation, locked for the
  // life of the character. NULL means legacy/unaligned (existing chars
  // before this migration); an admin or a future "pick faction" prompt
  // can assign one later.
  addColumnIfMissing('characters', 'faction', 'TEXT');
  // Gender — picked at creation. NULL means legacy/unset (existing
  // pre-migration rows). New characters are required to pick one.
  addColumnIfMissing('characters', 'gender', 'TEXT');
  // Gang faction allegiance — gangs are sub-divisions of a faction.
  // Stamped from the founder's faction at creation; backfill below
  // copies it from the leader's character row for existing gangs.
  addColumnIfMissing('gangs', 'faction', 'TEXT');
  // One-time backfill: any gang without a faction inherits its leader's.
  // Idempotent — the WHERE filters out anything already populated.
  try {
    db.exec(`
      UPDATE gangs SET faction = (
        SELECT c.faction FROM characters c WHERE c.id = gangs.leader_id
      )
      WHERE faction IS NULL
    `);
  } catch {}

  // ── Territories — fine-grained, per-location gang ownership ──────
  // Distinct from `turf_holds` (whole-city holds won via gang_wars).
  // Each row is a sub-location inside a city; gang_id is NULL when the
  // location is unclaimed. `faction` is denormalized from gang.faction
  // at capture time so we can apply faction-wide bonuses without a JOIN.
  db.exec(`
    CREATE TABLE IF NOT EXISTS territories (
      city            TEXT    NOT NULL,
      location_id     TEXT    NOT NULL,
      gang_id         INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
      faction         TEXT,
      captured_at     INTEGER,
      last_attempt_at INTEGER,
      PRIMARY KEY (city, location_id)
    );
    CREATE INDEX IF NOT EXISTS idx_territories_gang    ON territories(gang_id);
    CREATE INDEX IF NOT EXISTS idx_territories_faction ON territories(city, faction);

    -- Voronoi-style polygon areas — gang-vs-gang turf war units that
    -- replace the named-slot territories above. Each row is one area
    -- (e.g. "ny_a3"); gang_id is NULL when uncontrolled. flipped_at
    -- locks the area until next UTC midnight after a successful flip,
    -- enforcing one ownership change per area per day.
    CREATE TABLE IF NOT EXISTS city_areas (
      area_id         TEXT    PRIMARY KEY,
      city            TEXT    NOT NULL,
      gang_id         INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
      faction         TEXT,
      captured_at     INTEGER,
      flipped_at      INTEGER,
      last_attempt_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_city_areas_gang    ON city_areas(gang_id);
    CREATE INDEX IF NOT EXISTS idx_city_areas_faction ON city_areas(city, faction);

    -- Flight tickets — every 10 UTC minutes a flight to each
    -- destination departs. Buying a ticket reserves a seat on the
    -- next departure for that (from, to) route at the player's
    -- chosen class. status flips to 'boarded' on a successful board
    -- (player goes into transit), or 'missed' on a lazy cleanup pass
    -- when departs_at has elapsed without boarding.
    CREATE TABLE IF NOT EXISTS flight_tickets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      from_city    TEXT    NOT NULL,
      to_city      TEXT    NOT NULL,
      class        TEXT    NOT NULL,
      cost         INTEGER NOT NULL,
      departs_at   INTEGER NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'booked',
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flight_tickets_char ON flight_tickets(char_id, status);
  `);
  // Police heat — accumulates with each crime, decays passively over
  // time. 0 means clean; high heat shrinks success chances and bumps
  // jail-on-fail probability. Stored as a snapshot value plus the
  // timestamp it was taken; current heat = stored - elapsed minutes,
  // floored at 0. See services/heat.js.
  addColumnIfMissing('characters', 'heat',            'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('characters', 'heat_updated_at', 'INTEGER');
  // Phase 2: equipped weapon can now be a per-instance modded weapon.
  // When this column is non-null, it overrides the stock equipped_weapon
  // catalogue id for combat purposes.
  addColumnIfMissing('characters', 'equipped_weapon_instance', 'INTEGER REFERENCES weapon_instances(id) ON DELETE SET NULL');
  // The car the player is currently driving. NULL when they're on foot.
  // FK to vehicles_owned with ON DELETE SET NULL so chopping/selling the
  // active car simply leaves the character on foot. Game rules: you can
  // only attempt a GTA crime when this is null; flying out of a city
  // requires storing your active car in a local garage first; selling
  // (any outlet) targets the active car.
  addColumnIfMissing('characters', 'active_vehicle_id', 'INTEGER REFERENCES vehicles_owned(id) ON DELETE SET NULL');
  // Permanent driving skill — trained at the Driving School. Affects
  // street-race win odds and reduces the condition penalty when
  // driving between cities. Capped via STAT_CAPS.driving.
  addColumnIfMissing('characters', 'driving', 'INTEGER NOT NULL DEFAULT 1');
  // The duration of the *current* jail sentence in ms, recorded when
  // the sentence was first applied. Used by the failed-escape penalty
  // to double the *original* sentence rather than just the remaining
  // time. Cleared (alongside jail_until) when the player walks out.
  addColumnIfMissing('characters', 'jail_sentence_ms', 'INTEGER');
  // Optional player-uploaded profile picture, stored as a data URL
  // (data:image/<type>;base64,<...>). Falls back to ch.avatar (emoji)
  // when null. Resizing/compression happens on the client so rows stay
  // small (target ≤ 50KB per upload).
  addColumnIfMissing('characters', 'avatar_image', 'TEXT');
  // Specialisation path id (wheelman / cleaner / boss / hacker).
  // Picked at level 25, locked in for the life of the character;
  // cleared on retire/prestige. Nodes auto-unlock by level so we
  // don't need per-node state — see SPECIALISATIONS in data.js.
  addColumnIfMissing('characters', 'specialisation', 'TEXT');
  // Gang tier + treasury cut. crime_cut_pct is the leader-set fraction
  // of every member's successful crime payout that gets diverted into
  // the gang treasury (0-0.15). level controls the perk catalogue —
  // see GANG_LEVELS in data.js. Both default to safe values so legacy
  // gangs keep working before a leader configures them.
  addColumnIfMissing('gangs', 'crime_cut_pct', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('gangs', 'level',         'INTEGER NOT NULL DEFAULT 1');
  // Running tally of successful crimes per faction. Used to derive a
  // "faction reputation" — each faction's share of total criminal
  // activity, normalised so all three sum to 100%.
  db.exec(`
    CREATE TABLE IF NOT EXISTS faction_stats (
      faction_id        TEXT PRIMARY KEY,
      crimes_committed  INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Wanted-dead bounties. Anyone can post cash on another player's
  // head; the amount is held in escrow and paid out automatically to
  // whoever murders the target while the bounty is open. Multiple
  // bounties can stack on one target.
  //
  // status:
  //   open       — pending, wallet has the cash on lockup
  //   claimed    — the target was murdered; collector_id holds the killer
  //   cancelled  — placer pulled the bounty; cash refunded
  db.exec(`
    CREATE TABLE IF NOT EXISTS bounties (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      placer_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      target_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      amount       INTEGER NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'open',
      collector_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      placed_at    INTEGER NOT NULL,
      ended_at     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_bounties_target_status ON bounties(target_id, status);
    CREATE INDEX IF NOT EXISTS idx_bounties_placer_status ON bounties(placer_id, status);
  `);

  // Daily contracts. One per character per UTC day. Wraps a randomly-
  // selected major/cyber crime, locks it to a single city, and awards
  // 3× payout on success. Burns regardless of outcome.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_contracts (
      char_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      day_key    TEXT    NOT NULL,
      crime_id   TEXT    NOT NULL,
      city       TEXT    NOT NULL,
      payout_mul REAL    NOT NULL DEFAULT 3.0,
      status     TEXT    NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      ended_at   INTEGER,
      PRIMARY KEY (char_id, day_key)
    );
  `);
  // Phase 2: next-of-kin death model. 'alive' is the default; 'pending_heir'
  // means the character has been killed and is waiting for the player to
  // create their heir (name/avatar/city) before the row revives.
  addColumnIfMissing('characters', 'status', "TEXT NOT NULL DEFAULT 'alive'");
  // Phase 2D: vehicles can be customized in place (already per-instance
  // rows). mods_json is the same shape as weapon_instances.mods_json.
  addColumnIfMissing('vehicles_owned', 'mods_json', "TEXT NOT NULL DEFAULT '{}'");
  // Condition is a 0-100 percentage that decays as the player drives
  // the car between cities. New cars from the dealer start at 100;
  // stolen cars start at 75-100 (rolled at theft time). Selling/repair
  // costs scale with this value.
  addColumnIfMissing('vehicles_owned', 'condition', 'REAL NOT NULL DEFAULT 100');
  // Set when a car is in transit between cities (paid shipping).
  // shipping_until > now ⇒ car is locked: can't be equipped, listed,
  // or re-shipped. The row's `city` already points at the destination
  // so its garage slot is reserved on arrival; the lock just gates use.
  addColumnIfMissing('vehicles_owned', 'shipping_until', 'INTEGER');
  // Phase 2F: shop listings can now reference per-instance items
  // (weapon_instances row or vehicles_owned row). instance_id is null
  // for stacked items (misc/weapon/armour/ammo/drug); set when kind is
  // 'weapon_instance' or 'vehicle'.
  addColumnIfMissing('shop_listings', 'instance_id', 'INTEGER');
  addColumnIfMissing('businesses_player', 'description', 'TEXT');
  // Case-insensitive unique on email — only enforced when set, since the
  // column is nullable for any pre-migration accounts.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL');
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

  //  City roster cull (2026-05): 34 → 14 
  // Any data row still pointing at a dropped city gets remapped to its
  // nearest geographic / thematic kept neighbour so we don't orphan
  // characters, vehicles, properties, businesses, gangs, jobs, or
  // travel destinations. Idempotent — once no rows match the dropped
  // ids on the left, the UPDATE is a no-op.
  const CITY_REMAP = {
    liverpool:    'london',
    las_vegas:    'miami',
    mexico_city:  'miami',
    amsterdam:    'berlin',
    detroit:      'new_york',
    chicago:      'new_york',
    seoul:        'tokyo',
    shanghai:     'hong_kong',
    istanbul:     'dubai',
    johannesburg: 'cape_town',
    monaco:       'paris',
    singapore:    'hong_kong',
    manila:       'sydney',
    havana:       'kingston',
    marseille:    'paris',
    naples:       'paris',
    prague:       'berlin',
    dublin:       'london',
    sao_paulo:    'rio',
    // 2026-05 swap: Mumbai/Bangkok dropped, Sydney (Oceania) and
    // Kingston (Caribbean) added in their place.
    mumbai:       'sydney',
    bangkok:      'kingston',
  };
  // (table, column) pairs to remap. Each is wrapped in try/catch so a
  // missing table on a fresh deploy doesn't crash startup.
  const cityCols = [
    ['characters',         'city'],
    ['characters',         'travel_to'],
    ['businesses_owned',   'city'],
    ['businesses_player',  'city'],
    ['properties_owned',   'city'],
    ['vehicles_owned',     'city'],
    ['gangs',              'city'],
    ['gang_wars',          'contested_city'],
    ['job_board_listings', 'city'],
  ];
  for (const [from, to] of Object.entries(CITY_REMAP)) {
    for (const [table, col] of cityCols) {
      try { db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(to, from); }
      catch { /* table may not exist yet on first deploy */ }
    }
  }
  // Drug-market prices and turf holds are city-keyed and don't merge
  // sensibly. Drop the orphan rows; drug prices regenerate on the next
  // tick, turf for non-existent cities is meaningless.
  const droppedCities = Object.keys(CITY_REMAP);
  const placeholders = droppedCities.map(() => '?').join(',');
  try { db.prepare(`DELETE FROM drug_market WHERE city IN (${placeholders})`).run(...droppedCities); } catch {}
  try { db.prepare(`DELETE FROM turf_holds  WHERE city IN (${placeholders})`).run(...droppedCities); } catch {}

  // Garage capacity migration: each property has a `garage` stat now,
  // and per-city vehicle counts are capped at the sum of those stats.
  // For pre-migration characters who already have more cars in a city
  // than its garage holds, auto-chop the excess at 15% of book price
  // (lowest-tier first to keep the better cars). Runs every startup
  // but is a no-op once everyone is in compliance, since dealership
  // buys and GTA crimes now respect the cap going forward.
  try {
    const overages = db.prepare(`
      SELECT char_id, city, COUNT(*) AS used
      FROM vehicles_owned WHERE city IS NOT NULL
      GROUP BY char_id, city
    `).all();
    for (const { char_id, city, used } of overages) {
      const props = db.prepare(
        'SELECT property_id FROM properties_owned WHERE char_id = ? AND city = ?'
      ).all(char_id, city);
      let capacity = 0;
      for (const p of props) capacity += propertyById(p.property_id)?.garage || 0;
      if (used <= capacity) continue;
      const excess = used - capacity;
      // Pick the cheapest cars (by tier ascending, then oldest) to chop.
      const cars = db.prepare(
        'SELECT id, vehicle_id FROM vehicles_owned WHERE char_id = ? AND city = ? ORDER BY acquired_at ASC'
      ).all(char_id, city);
      cars.sort((a, b) => {
        const ta = vehicleById(a.vehicle_id)?.tier || 0;
        const tb = vehicleById(b.vehicle_id)?.tier || 0;
        return ta - tb;
      });
      const toChop = cars.slice(0, excess);
      let payout = 0;
      for (const c of toChop) {
        const v = vehicleById(c.vehicle_id);
        if (v) payout += Math.floor(v.bookPrice * 0.15);
      }
      const ids = toChop.map(c => c.id);
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM vehicles_owned WHERE id IN (${ph})`).run(...ids);
      if (payout > 0) {
        db.prepare('UPDATE characters SET cash = cash + ? WHERE id = ?').run(payout, char_id);
      }
    }
  } catch (e) {
    // Migration is best-effort: a fresh DB without these tables yet
    // will throw and we just skip.
  }
}
