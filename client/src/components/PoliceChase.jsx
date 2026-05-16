import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

// Modal mini-game shown when a GTA crime rolls into the 'jail'
// failure outcome. Players have 5s to tap a 5-arrow sequence; the
// server scores in-order matches + a driving-stat bonus and decides
// whether the chase ends in an escape or jail. See routes/chases.js.

const GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

export default function PoliceChase({ chase: initialChase, onResolved, onClose }) {
  // Local copy so the tutorial-ack POST can mutate expires_at /
  // tutorial flag without re-mounting the modal.
  const [chase, setChase] = useState(initialChase);
  const [inputs, setInputs] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [starting, setStarting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => { setChase(initialChase); }, [initialChase]);

  // 10× ticker drives the visible countdown bar. Skipped while the
  // tutorial overlay is up — there's nothing to count down yet.
  useEffect(() => {
    if (chase.tutorial) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [chase.tutorial]);

  const remainingMs = Math.max(0, chase.expiresAt - now);
  const fracLeft = remainingMs / chase.durationMs;

  // Submit when the sequence is full or time expires. Guard with a
  // ref so we only POST once even if both conditions fire together.
  // Skipped during the tutorial overlay (timer isn't running).
  useEffect(() => {
    if (chase.tutorial || submittedRef.current || result) return;
    if (inputs.length >= chase.sequence.length) submit();
    else if (remainingMs <= 0) submit();
  }, [inputs, remainingMs, chase.tutorial]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startChaseTimer() {
    if (starting) return;
    setStarting(true);
    try {
      const r = await api.post('/chases/begin');
      if (r?.chase) setChase(r.chase);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setStarting(false);
    }
  }

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const r = await api.post('/chases/resolve', { inputs });
      setResult(r);
      onResolved?.(r);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function giveUp() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const r = await api.post('/chases/give-up');
      setResult({ ...r, gaveUp: true });
      onResolved?.(r);
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setSubmitting(false); }
  }

  function press(arrow) {
    if (result || inputs.length >= chase.sequence.length) return;
    setInputs(prev => [...prev, arrow]);
  }

  // Keyboard support — arrow keys map to the four directions. Off
  // during the tutorial so a stray Enter doesn't fire press().
  useEffect(() => {
    if (result || chase.tutorial) return;
    function onKey(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const a = map[e.key];
      if (!a) return;
      e.preventDefault();
      press(a);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, inputs.length, chase.tutorial]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-ink-950 border-2 border-blood-500 rounded-xl shadow-xl shadow-black/80 overflow-hidden">
        <div className="bg-blood-700/30 border-b border-blood-500/40 px-4 py-3 text-center">
          <div className="text-[12px] uppercase tracking-widest text-blood-300">Police Chase</div>
          <div className="font-display text-2xl mt-0.5">Floor it.</div>
          <p className="text-[12px] text-ink-100/65 mt-1">
            Match the sequence before the timer runs out. Miss it and the cuffs go on for <b>{chase.jailMin}m</b>.
          </p>
        </div>

        {chase.tutorial ? (
          // One-time tutorial overlay. Pauses everything (no timer,
          // no key bindings, no dpad) until the player hits Continue,
          // which POSTs /chases/begin to write the real expires_at.
          <div className="p-4 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-yellow-300 mb-1">First-time tutorial</div>
              <p className="text-[13px] text-ink-100/85 leading-snug">
                You've boosted a car and the cops are on you. This mini-game decides whether you slip them.
              </p>
            </div>
            <ul className="text-[13px] text-ink-100/75 space-y-1.5 list-disc pl-5">
              <li>Read the five arrows above the dpad — you'll have to tap them <b>in the same order</b>.</li>
              <li>The countdown is <b>{Math.round((chase.durationMs || 5000) / 1000)} seconds</b>. Misses still let you submit, but with worse odds.</li>
              <li>Match more arrows = better chance to escape. Your <b>driving</b> stat helps too (up to +20%).</li>
              <li>Fail and you do <b>{chase.jailMin}m</b> behind bars. Give up at any time to skip the attempt.</li>
              <li>Tip: <b>arrow keys</b> work on desktop.</li>
            </ul>
            <p className="text-[11px] text-ink-100/45">
              This tutorial only shows once — future chases will start the timer immediately.
            </p>
            <button
              onClick={startChaseTimer}
              disabled={starting}
              className="btn btn-primary text-sm w-full mt-1 disabled:opacity-60">
              {starting ? 'Starting…' : 'Continue — start the chase'}
            </button>
          </div>
        ) : !result ? (
          <div className="p-4 space-y-4">
            {/* Target sequence */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-100/55 mb-2">Read these in order</div>
              <div className="flex justify-center gap-3 font-display text-4xl">
                {chase.sequence.map((s, i) => (
                  <span key={i} className={`w-12 h-12 flex items-center justify-center rounded-md border ${
                    i < inputs.length
                      ? (inputs[i] === s ? 'border-money-500/70 bg-money-600/15 text-money-300'
                                          : 'border-blood-500/70 bg-blood-700/15 text-blood-300 line-through')
                      : 'border-ink-100/15 bg-ink-900/60 text-ink-100/85'
                  }`}>{GLYPH[s]}</span>
                ))}
              </div>
            </div>

            {/* Countdown bar */}
            <div>
              <div className="flex justify-between text-[11px] tabular-nums">
                <span className="text-ink-100/55">Hits: {inputs.filter((v, i) => v === chase.sequence[i]).length}/{chase.sequence.length}</span>
                <span className={fracLeft > 0.4 ? 'text-money-300' : fracLeft > 0.15 ? 'text-yellow-300' : 'text-blood-300'}>
                  {(remainingMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="h-1.5 mt-1 rounded-full bg-ink-100/10 overflow-hidden">
                <div
                  className={fracLeft > 0.4 ? 'bg-money-500 h-full' : fracLeft > 0.15 ? 'bg-yellow-400 h-full' : 'bg-blood-500 h-full'}
                  style={{ width: `${fracLeft * 100}%`, transition: 'width 120ms linear' }} />
              </div>
            </div>

            {/* D-pad */}
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto select-none">
              <div />
              <button onClick={() => press('up')}    className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.up}</button>
              <div />
              <button onClick={() => press('left')}  className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.left}</button>
              <button onClick={() => press('down')}  className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.down}</button>
              <button onClick={() => press('right')} className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.right}</button>
            </div>

            <p className="text-[11px] text-ink-100/40 text-center">
              Tip: arrow keys work too.
            </p>

            <button onClick={giveUp} disabled={submitting}
              className="btn btn-ghost text-xs w-full opacity-70">
              Give up · take {chase.jailMin}m
            </button>
          </div>
        ) : (
          // Resolved state — either escape, jail, or expired.
          <div className="p-4 space-y-3 text-center">
            {result.escaped ? (
              <>
                <div className="font-display text-3xl text-money-300">CLEAR.</div>
                <p className="text-[13px] text-ink-100/75">
                  Outran them. {result.correct}/{result.length} on the sequence · {Math.round(result.escapeChance * 100)}% odds.
                </p>
              </>
            ) : result.gaveUp ? (
              <>
                <div className="font-display text-2xl text-yellow-300">Hands up.</div>
                <p className="text-[13px] text-ink-100/75">
                  Pulled over without a fight. {result.jailMin}m inside.
                </p>
              </>
            ) : result.expired ? (
              <>
                <div className="font-display text-2xl text-blood-300">Out of time.</div>
                <p className="text-[13px] text-ink-100/75">
                  Sirens caught up. {result.jailMin}m inside.
                </p>
              </>
            ) : result.error ? (
              <>
                <div className="font-display text-2xl text-blood-300">Server error</div>
                <p className="text-[13px] text-ink-100/75">{result.error}</p>
              </>
            ) : (
              <>
                <div className="font-display text-3xl text-blood-300">CAUGHT.</div>
                <p className="text-[13px] text-ink-100/75">
                  {result.correct}/{result.length} hits, {Math.round(result.escapeChance * 100)}% odds. {result.jailMin}m inside.
                </p>
              </>
            )}
            <button onClick={onClose} className="btn btn-primary text-xs w-full mt-2">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
