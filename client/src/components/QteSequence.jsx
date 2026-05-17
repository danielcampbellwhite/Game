import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

// Generic arrow-sequence QTE modal. Used by:
//  - police chase (routes/chases.js)  — currently still has its own
//    component but should migrate
//  - jail escape (routes/jailbreak.js)
//  - any future QTE that follows the "tap N glyphs in order against
//    a countdown" pattern.
//
// Server state lives wherever the caller wants — the modal doesn't
// care. It calls the endpoints passed in `endpoints` to begin
// (ack the tutorial) and resolve (submit inputs / give up).
//
// `data` shape is the same as the chase: { sequence, expiresAt,
// durationMs, tutorial }. Any QTE-specific bits (jailMin, payout,
// etc) come back from the resolve response and get rendered by the
// caller-supplied `renderResult` callback.

const GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

export default function QteSequence({
  data: initialData,           // { sequence, expiresAt, durationMs, tutorial }
  endpoints,                   // { begin, resolve, giveUp }
  // Theme / copy
  title = 'Mini-game',
  subtitle = 'Match the sequence.',
  tagline = '',                // appears just under the subtitle (e.g. "Miss it and the cuffs go on for 4m.")
  accent = 'blood',            // tailwind colour family for the header strip
  tutorialNodes = null,        // ReactNode shown in the tutorial overlay before they hit Continue
  giveUpLabel = null,          // e.g. "Give up · take 6m". null hides the button.
  renderResult,                // (result) => ReactNode — caller controls the resolved state body
  // Callbacks
  onResolved,                  // (result) => void  — fires after server resolve returns
  onClose,                     // close the modal
}) {
  const [data, setData]         = useState(initialData);
  const [inputs, setInputs]     = useState([]);
  const [now, setNow]           = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult]     = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => { setData(initialData); }, [initialData]);

  // Visible countdown — paused while the tutorial overlay is up.
  useEffect(() => {
    if (data.tutorial) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [data.tutorial]);

  const remainingMs = Math.max(0, data.expiresAt - now);
  const fracLeft = remainingMs / data.durationMs;

  // Auto-submit on full sequence or timer expiry. Single-fire guard.
  useEffect(() => {
    if (data.tutorial || submittedRef.current || result) return;
    if (inputs.length >= data.sequence.length) submit();
    else if (remainingMs <= 0) submit();
  }, [inputs, remainingMs, data.tutorial]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const r = await api.post(endpoints.resolve, { inputs });
      setResult(r);
      onResolved?.(r);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function giveUp() {
    if (submittedRef.current || !endpoints.giveUp) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const r = await api.post(endpoints.giveUp);
      setResult({ ...r, gaveUp: true });
      onResolved?.(r);
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setSubmitting(false); }
  }

  async function startTimer() {
    if (!endpoints.begin || starting) return;
    setStarting(true);
    try {
      const r = await api.post(endpoints.begin);
      // The server returns either { jailbreak }, { chase }, { hotwire }
      // or a generic { qte } shape depending on the QTE flavour.
      // Inspect any of them for the next sequence + expiresAt.
      const next = r?.jailbreak || r?.chase || r?.hotwire || r?.qte || null;
      if (next) setData(next);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally { setStarting(false); }
  }

  function press(arrow) {
    if (result || data.tutorial) return;
    if (inputs.length >= data.sequence.length) return;
    setInputs(prev => [...prev, arrow]);
  }

  useEffect(() => {
    if (result || data.tutorial) return;
    function onKey(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const a = map[e.key];
      if (!a) return;
      e.preventDefault();
      press(a);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, inputs.length, data.tutorial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tailwind purges classes it can't see literally — preset the
  // accent palettes here so JIT picks them up.
  const ACCENTS = {
    blood:  { border: 'border-blood-500',  headerBg: 'bg-blood-700/30 border-b-blood-500/40',  text: 'text-blood-300'  },
    yellow: { border: 'border-yellow-500', headerBg: 'bg-yellow-700/30 border-b-yellow-500/40', text: 'text-yellow-300' },
    cyan:   { border: 'border-cyan-500',   headerBg: 'bg-cyan-700/30 border-b-cyan-500/40',    text: 'text-cyan-300'   },
    gold:   { border: 'border-gold-500',   headerBg: 'bg-gold-700/30 border-b-gold-500/40',    text: 'text-gold-300'   },
  };
  const a = ACCENTS[accent] || ACCENTS.blood;

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur flex items-center justify-center p-4">
      <div className={`max-w-md w-full bg-ink-950 border-2 rounded-xl shadow-xl shadow-black/80 overflow-hidden ${a.border}`}>
        <div className={`px-4 py-3 text-center border-b ${a.headerBg}`}>
          <div className={`text-[12px] uppercase tracking-widest ${a.text}`}>{title}</div>
          <div className="font-display text-2xl mt-0.5">{subtitle}</div>
          {tagline && <p className="text-[12px] text-ink-100/65 mt-1">{tagline}</p>}
        </div>

        {data.tutorial ? (
          <div className="p-4 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-yellow-300 mb-1">First-time tutorial</div>
              {tutorialNodes}
            </div>
            <p className="text-[11px] text-ink-100/45">
              This tutorial only shows once — future attempts skip straight to the timer.
            </p>
            <button
              onClick={startTimer}
              disabled={starting}
              className="btn btn-primary text-sm w-full mt-1 disabled:opacity-60">
              {starting ? 'Starting…' : 'Continue — begin'}
            </button>
          </div>
        ) : !result ? (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-100/55 mb-2">Read these in order</div>
              <div className="flex justify-center gap-2 font-display text-3xl flex-wrap">
                {data.sequence.map((s, i) => (
                  <span key={i} className={`w-10 h-10 flex items-center justify-center rounded-md border ${
                    i < inputs.length
                      ? (inputs[i] === s ? 'border-money-500/70 bg-money-600/15 text-money-300'
                                          : 'border-blood-500/70 bg-blood-700/15 text-blood-300 line-through')
                      : 'border-ink-100/15 bg-ink-900/60 text-ink-100/85'
                  }`}>{GLYPH[s]}</span>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] tabular-nums">
                <span className="text-ink-100/55">
                  Hits: {inputs.filter((v, i) => v === data.sequence[i]).length}/{data.sequence.length}
                </span>
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

            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto select-none">
              <div />
              <button onClick={() => press('up')}    className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.up}</button>
              <div />
              <button onClick={() => press('left')}  className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.left}</button>
              <button onClick={() => press('down')}  className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.down}</button>
              <button onClick={() => press('right')} className="btn btn-ghost text-2xl py-3 active:scale-95 transition">{GLYPH.right}</button>
            </div>

            <p className="text-[11px] text-ink-100/40 text-center">Tip: arrow keys work too.</p>

            {giveUpLabel && (
              <button onClick={giveUp} disabled={submitting}
                className="btn btn-ghost text-xs w-full opacity-70">
                {giveUpLabel}
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3 text-center">
            {renderResult ? renderResult(result) : (
              <div className="font-display text-2xl text-ink-100/80">Resolved.</div>
            )}
            <button onClick={onClose} className="btn btn-primary text-xs w-full mt-2">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
