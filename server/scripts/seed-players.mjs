import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const db = new DatabaseSync('C:/Claude/Games/mafia/data/mafia.sqlite');
db.exec('PRAGMA foreign_keys = ON');

// ── Wipe ─────────────────────────────────────────────────────────────
db.exec('BEGIN');
try {
  // gangs.leader_id is ON DELETE RESTRICT, so wipe gangs first.
  db.exec('DELETE FROM gangs');
  db.exec('DELETE FROM users');             // cascades to characters → ~all the rest
  db.exec('DELETE FROM bookmaker_events');
  db.exec('DELETE FROM bookmaker_bets');
  db.exec('DELETE FROM stock_market');      // re-seeds on next access
  db.exec('DELETE FROM stock_history');
  db.exec('DELETE FROM drug_market');
  db.exec('DELETE FROM sqlite_sequence');   // reset autoincrements
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }

console.log('Wiped. Seeding 100 players...');

// ── Random-name generator ────────────────────────────────────────────
const FIRST = [
  'Vinnie','Tony','Sal','Mickey','Frankie','Ricky','Joey','Eddie','Lou','Rocco',
  'Carmine','Nico','Sergio','Dante','Marco','Bruno','Angelo','Enzo','Gino','Paulie',
  'Big Sam','Fat Tony','Slim Jim','Knuckles','Razor','Snake','Ace','Bones','Spider','Ghost',
  'Vito','Sonny','Frank','Charlie','Lefty','Crazy Joe','Lucky','Tiny','Doc','Scarface',
  'The Boss','Whitey','Stinger','Bullet','Hatchet','Switch','Sticks','Cash','Diamond','King',
  'Mr Black','Mr Blue','Mr Pink','Sister Mary','Lady Vee','Mama Rosa','Crystal','Velvet',
  'Yuri','Boris','Igor','Dmitri','Anatoly','Mikhail','Vlad','Sergei','Ivan','Sasha',
  'Kenji','Hiroshi','Takeshi','Akira','Daisuke','Kaito','Ryu','Goro','Saburo','Tatsu',
  'Diego','Hector','Carlos','Miguel','Pablo','Ramon','Tito','Esteban','Rafa','Manny',
  'Killian','Declan','Brendan','Seamus','Padraic','Liam','Connor','Finn','Cathal','Eamon',
];
const LAST = [
  'the Razor','Two Times','One Eye','the Hammer','Greentooth','the Snake','Cold Hand',
  'the Wolf','Skyfall','the Saint','Hard-times','Iron-fist','Goldfinger','the Knife',
  'No-name','the Quiet','Big-deal','Last Call','Heart-stopper','Killjoy','Ghosthand',
  'Two-finger','Black-eye','the Vault','Dead-eye','Smiley','Slick','Fast-talk',
  'Lucky','Sideways','the Hatchet','Shotgun','the Phantom','the Cleaner','Gravedigger',
  'the Rat','the Bull','the Cat','the Fox','the Hawk','the Jackal','the Crow','the Bear',
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randName(used) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = Math.random() < 0.55 ? `${pick(FIRST)} ${pick(LAST)}` : pick(FIRST);
    if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name; }
  }
  let i = 1;
  while (used.has(`anon ${i}`)) i++;
  used.add(`anon ${i}`);
  return `Anon ${i}`;
}

const CITIES = [
  'new_york','los_angeles','miami','rio',
  'london','paris','berlin','moscow',
  'dubai',
  'tokyo','hong_kong','bangkok','mumbai',
  'cape_town',
];
const AVATARS = ['🕴️','🤵','🥷','🕵️','🧔','👮','💂','👤','💀','🎩','🤴','👴'];

// All seeded players share a hash for "password" so you can log in as any
// of them for testing. Cost 8 keeps seeding quick.
const sharedHash = bcrypt.hashSync('password', 8);
const now = Date.now();

const insertUser = db.prepare(
  'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
);
const insertChar = db.prepare(`
  INSERT INTO characters (
    user_id, name, avatar, city,
    level, xp,
    energy, max_energy, nerve, max_nerve, health, max_health,
    happiness,
    strength, defence, speed, intelligence,
    reputation, cash, bank, dirty_cash,
    jail_until, jail_reason, hospital_until, hospital_reason,
    last_tick, last_health_tick, bank_last_interest,
    equipped_weapon, equipped_armour, prestige,
    last_active_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const usedNames = new Set();
const usedUsernames = new Set();
const stats = { jailed: 0, hospitalised: 0, online: 0 };

db.exec('BEGIN');
for (let i = 1; i <= 100; i++) {
  let username;
  do { username = `player_${rand(1000, 99999)}`; } while (usedUsernames.has(username));
  usedUsernames.add(username);

  const u = insertUser.run(username, sharedHash, now);
  const userId = u.lastInsertRowid;

  const name = randName(usedNames);
  const avatar = pick(AVATARS);
  const city = pick(CITIES);
  const level = rand(1, 60);

  // Stats roughly scale with level + some noise.
  const statBase = Math.floor(level * 0.7);
  const strength = statBase + rand(0, 10);
  const defence  = statBase + rand(0, 10);
  const speed    = statBase + rand(0, 10);
  const intelligence = statBase + rand(0, 10);

  const maxEnergy = 100 + 5 * (level - 1);
  const maxNerve  = 10 + Math.floor(level / 5);
  const maxHealth = 100 + 5 * (level - 1);

  const cash = rand(500, 250000);
  const bank = rand(0, 1500000);
  const reputation = rand(0, 5000);

  // Some in jail / hospital so the Down & Out surfaces have data.
  let jailUntil = null, jailReason = null, hospitalUntil = null, hospitalReason = null;
  const roll = Math.random();
  if (roll < 0.10) {
    jailUntil = now + rand(60, 60 * 60) * 1000;
    jailReason = 'Picked up on a botched mugging.';
    stats.jailed++;
  } else if (roll < 0.18) {
    hospitalUntil = now + rand(60, 30 * 60) * 1000;
    hospitalReason = 'Patched up after a fight in the alley.';
    stats.hospitalised++;
  }

  // last_active scattered across last 7 days, ~10% counted as "online".
  let lastActive;
  if (Math.random() < 0.10) {
    lastActive = now - rand(0, 30) * 1000;
    stats.online++;
  } else {
    lastActive = now - rand(60, 7 * 24 * 3600) * 1000;
  }

  insertChar.run(
    userId, name, avatar, city,
    level, 0,
    maxEnergy, maxEnergy, maxNerve, maxNerve, maxHealth, maxHealth,
    rand(40, 90),
    strength, defence, speed, intelligence,
    reputation, cash, bank, rand(0, 50000),
    jailUntil, jailReason, hospitalUntil, hospitalReason,
    now, now, now,
    'fists', 'none', 0,
    lastActive, now,
  );
}
db.exec('COMMIT');

console.log(`Seeded 100 players. ${JSON.stringify(stats)}`);
console.log('Shared login password for every seeded account: "password"');
