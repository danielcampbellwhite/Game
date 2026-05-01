// Synthesized sound effects via Web Audio API. No external assets; every
// blip / chime / noise is generated on the fly from oscillators and
// filtered noise. The first call lazily creates the AudioContext, which
// must happen inside a user gesture for the browser autoplay policy to
// unlock it — so the entry points in casino UIs (spin / deal buttons)
// are the natural triggers.

const KEY = 'mafia.sfxOn';

let ctx = null;

function getCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  // Safari / mobile can suspend the context when the tab loses focus.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isSfxOn() {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === '1';
}

export function setSfxOn(on) {
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
}

function play(fn) {
  if (!isSfxOn()) return;
  const c = getCtx();
  if (!c) return;
  try { fn(c); } catch { /* swallow audio failures — they're never fatal */ }
}

// ─── Primitives ───────────────────────────────────────────────────────

// One enveloped oscillator note. Gain ramps in fast then exponentially
// decays over `duration` so the click feels percussive, not buzzy.
function tone(c, freq, duration, type = 'sine', gain = 0.18, startOffset = 0) {
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Filtered noise burst — paper rustle, ball spin, reel thunk body.
function noise(c, duration, gain, filterFreq, startOffset = 0) {
  const t0 = c.currentTime + startOffset;
  const samples = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, samples, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration);
}

// ─── Public sound effects ─────────────────────────────────────────────

export const sfx = {
  // Quick high click — roulette ball passing each peg.
  click: () => play(c => tone(c, 1200, 0.04, 'square', 0.07)),
  // Reel "thunk" when a slot reel locks into place.
  reelStop: () => play(c => {
    tone(c, 220, 0.08, 'square', 0.18);
    noise(c, 0.06, 0.07, 1200);
  }),
  // Card deal — short paper-rustle.
  cardDeal: () => play(c => noise(c, 0.12, 0.13, 3200)),
  // Win — major arpeggio C5 → E5 → G5.
  win: () => play(c => {
    tone(c, 523.25, 0.12, 'sine', 0.18, 0);
    tone(c, 659.25, 0.12, 'sine', 0.18, 0.10);
    tone(c, 783.99, 0.22, 'sine', 0.20, 0.20);
  }),
  // Jackpot — cascading run + sparkly held high.
  jackpot: () => play(c => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone(c, f, 0.15, 'triangle', 0.20, i * 0.08));
    tone(c, 1567.98, 0.55, 'triangle', 0.16, notes.length * 0.08);
    tone(c, 1975.53, 0.55, 'sine',     0.12, notes.length * 0.08 + 0.05);
  }),
  // Lose — descending minor two-tone.
  lose: () => play(c => {
    tone(c, 311.13, 0.14, 'sawtooth', 0.14, 0);
    tone(c, 233.08, 0.22, 'sawtooth', 0.14, 0.13);
  }),
  // Push (tie) — single neutral note.
  push: () => play(c => tone(c, 440, 0.18, 'sine', 0.13)),
  // Roulette spin start — low whoosh.
  rouletteStart: () => play(c => noise(c, 0.30, 0.10, 600)),
  // Slots spin start — quick rising whirr.
  slotsStart: () => play(c => {
    tone(c, 110, 0.18, 'sawtooth', 0.10, 0);
    tone(c, 220, 0.18, 'sawtooth', 0.08, 0.05);
  }),
};

// Schedule a series of ticks across `duration` seconds with a density
// that slows down over time, mimicking a roulette ball decelerating.
// Returns a cleanup fn that cancels any not-yet-fired ticks.
export function scheduleRouletteTicks(duration = 3.6, count = 36) {
  const handles = [];
  for (let i = 1; i <= count; i++) {
    // Inverse cubic — ticks frequent at the start, sparse at the end.
    const t = (1 - Math.pow(1 - i / count, 1 / 3)) * duration * 1000;
    handles.push(setTimeout(() => sfx.click(), t));
  }
  return () => handles.forEach(h => clearTimeout(h));
}
