// Crime sound effects. Each crime maps to one of 8 sound "families" so
// we don't need a unique recording per crime — the muscle memory of
// "tyre-screech = good GTA" or "siren = caught" reads cleaner than 30
// distinct clips ever would.
//
// Each family has TWO ways to play:
//
//   1. A real audio file at /sounds/<family>.mp3 (preferred when present)
//   2. A Web Audio synthesised approximation (always available)
//
// Drop an MP3 into `client/public/sounds/<family>.mp3` and it auto-takes
// over — no code change required. Until then, the synth versions ship.
//
// Mute state persists across reloads via localStorage. The Web Audio
// context is lazily created and resumed on first play so the autoplay
// policy doesn't bite — by the time a player commits a crime they've
// already clicked plenty.
//
// Recommended drop-in audio sources (all CC0 / royalty-free):
//   - https://pixabay.com/sound-effects/ (no attribution required)
//   - https://mixkit.co/free-sound-effects/ (no attribution required)
//   - https://freesound.org/ (license per sound — check before use)

const STORAGE_KEY = 'mafia-life:sound-muted';

let muted = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
})();

const muteListeners = new Set();
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  try {
    if (muted) localStorage.setItem(STORAGE_KEY, '1');
    else       localStorage.removeItem(STORAGE_KEY);
  } catch {}
  muteListeners.forEach(fn => { try { fn(muted); } catch {} });
}
export function toggleMuted() { setMuted(!muted); return muted; }
export function onMuteChange(fn) {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

// Lazy Web Audio context — browsers suspend it until a user gesture,
// so we resume on every play attempt.
let _ctx = null;
function getCtx() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!_ctx) _ctx = new Ctor();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  } catch { return null; }
}

// ── Synth approximations ────────────────────────────────────
//
// Each one is a short (≤1s) burst built from Web Audio primitives. They
// don't sound *good* — they sound like sound effects from a placeholder
// game. The real value is the wiring + family taxonomy; swap MP3s in
// when you have them.

function synthGetaway(ctx) {
  // Tyre screech — descending sawtooth + bandpass for the squeal
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.55);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.65);
}

function synthPanic(ctx) {
  // Chaotic street panic — bandpassed noise burst
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.45);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.6));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 700;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}

function synthCyber(ctx) {
  // Rapid keystrokes — short square-wave clicks
  const now = ctx.currentTime;
  for (let i = 0; i < 14; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1700 + Math.random() * 600;
    const gain = ctx.createGain();
    const t = now + i * 0.04 + Math.random() * 0.01;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }
}

function synthGunshot(ctx) {
  // Sharp noise burst with hard exponential decay
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.2);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  const gain = ctx.createGain();
  gain.gain.value = 0.45;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}

function synthSiren(ctx) {
  // Two-tone alarm — louder, longer than the notification chime
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(820, now);
  osc.frequency.setValueAtTime(620, now + 0.2);
  osc.frequency.setValueAtTime(820, now + 0.4);
  osc.frequency.setValueAtTime(620, now + 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.9);
}

function synthKo(ctx) {
  // Low thud — sub-bass with a quick decay
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

function synthCash(ctx) {
  // Bright bell arpeggio (B5 → E6 → G6)
  const now = ctx.currentTime;
  const notes = [988, 1318, 1568];
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    const gain = ctx.createGain();
    const t = now + i * 0.06;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

function synthFail(ctx) {
  // Sad descending tritone (A4 → E4 → A3)
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.setValueAtTime(330, now + 0.18);
  osc.frequency.setValueAtTime(220, now + 0.36);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.6);
}

const FAMILIES = {
  getaway: synthGetaway,
  panic:   synthPanic,
  cyber:   synthCyber,
  gunshot: synthGunshot,
  siren:   synthSiren,
  ko:      synthKo,
  cash:    synthCash,
  fail:    synthFail,
};

// ── MP3 override loader ────────────────────────────────────
//
// Tries /sounds/<family>.mp3 the first time a family plays. Caches the
// decoded buffer on success, marks the family as "tried" on failure so
// we don't keep refetching. Browser will log a 404 the first time per
// family-without-file — that's fine and self-correcting once you drop
// real audio in.
const buffers = {};        // family -> AudioBuffer
const triedLoad = new Set();
function tryLoadFamilyFile(family) {
  if (triedLoad.has(family)) return;
  triedLoad.add(family);
  fetch(`/sounds/${family}.mp3`)
    .then(r => {
      if (!r.ok) return null;
      return r.arrayBuffer();
    })
    .then(data => {
      if (!data) return;
      const ctx = getCtx();
      if (!ctx) return;
      // decodeAudioData uses promises on modern browsers, callbacks on
      // ancient ones. We use the promise form.
      ctx.decodeAudioData(data).then(buf => { buffers[family] = buf; });
    })
    .catch(() => { /* leave undefined — synth fallback */ });
}

function playBuffer(ctx, buf) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  src.connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime);
}

// ── Crime → family mapping ───────────────────────────────────
//
// Source of truth lives client-side so we don't have to add a `sound`
// field to every entry in server/src/data.js. Add new crimes here when
// they land in the catalogue.
const CRIME_TO_FAMILY = {
  // Street — commotion / running away
  mugging:       'panic',
  pickpocket:    'panic',
  shoplift:      'panic',
  snatch_grab:   'panic',
  bike_theft:    'panic',
  atm_skim:      'panic',
  cat_converter: 'panic',
  scam:          'panic',
  breakin:       'panic',
  loan_collect:  'panic',
  store_holdup:  'gunshot',  // armed holdup — gun fits

  // Cyber — keystrokes / glitch
  phishing:       'cyber',
  social_eng:     'cyber',
  card_fraud:     'cyber',
  darkweb:        'cyber',
  ransomware:     'cyber',
  sim_swap:       'cyber',
  crypto_drain:   'cyber',
  ddos_ext:       'cyber',
  botnet_rental:  'cyber',

  // Major — gunshot drama
  jewellery:     'gunshot',
  bank_rob:      'gunshot',
  smuggle:       'gunshot',
  art_heist:     'gunshot',
  casino_score:  'gunshot',
  cargo_hijack:  'gunshot',
  cyber_bank:    'cyber',     // it's a hack — keep it on the cyber family

  // GTA — tyre screech
  gta_beater:    'getaway',
  gta_compact:   'getaway',
  gta_hothatch:  'getaway',
  gta_premium:   'getaway',
  gta_luxury:    'getaway',
  gta_exotic:    'getaway',
  gta_hyper:     'getaway',
};

function familyForCrime(crimeId, tier) {
  if (CRIME_TO_FAMILY[crimeId]) return CRIME_TO_FAMILY[crimeId];
  // Tier fallback — covers any crime added to data.js without a mapping.
  if (tier === 'gta')    return 'getaway';
  if (tier === 'cyber')  return 'cyber';
  if (tier === 'major')  return 'gunshot';
  return 'panic';   // street + anything else
}

function playFamily(family) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Try to upgrade to real audio in the background; falls back to synth
  // for this call regardless.
  tryLoadFamilyFile(family);
  if (buffers[family]) {
    playBuffer(ctx, buffers[family]);
    return;
  }
  const synth = FAMILIES[family];
  if (synth) synth(ctx);
}

// ── Public API ────────────────────────────────────────────
//
// `result` is the JSON body from POST /api/crimes/commit. Picks the
// right family based on outcome:
//   - failed + jailed  → siren
//   - failed + chase   → no sound here, PoliceChase modal owns the moment
//   - failed + hospital → ko
//   - failed + escaped → fail
//   - succeeded        → crime-specific family
export function playCrimeSound(crimeId, tier, result) {
  if (!result) return;
  if (result.success === false) {
    if (result.chase)    return;            // chase mini-game has its own beat
    if (result.jailed)   return playFamily('siren');
    if (result.hospital) return playFamily('ko');
    return playFamily('fail');
  }
  if (result.success === true) {
    return playFamily(familyForCrime(crimeId, tier));
  }
}

// Exported for diagnostics / future use cases.
export { playFamily };
