import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card.jsx';
import { PATCHES } from '../data/patches.js';

// Public patch-notes page — no auth required. Wired in App.jsx as
// /patches outside the Protected wrapper.

function formatDate(d) {
  // Render YYYY-MM-DD as e.g. "5 May 2026" without dragging in a date lib.
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[m - 1]} ${y}`;
}

export default function Patches() {
  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="text-center">
        <Link to="/" className="relative inline-block pb-3 hover:opacity-90 transition">
          <span className="font-display text-4xl text-blood-500 leading-none tracking-wide">MAFIA LIFE</span>
          <span
            aria-hidden
            className="font-cursive text-gold-400/95 text-2xl leading-none absolute -bottom-1 right-0 -translate-y-1 select-none pointer-events-none whitespace-nowrap"
            style={{ textShadow: '0 1px 0 rgba(0,0,0,0.55)' }}>
            Criminal Empire
          </span>
        </Link>
        <p className="text-xs text-ink-100/55 mt-6 uppercase tracking-[0.25em]">Patches & Updates</p>
      </div>

      {PATCHES.map((p, i) => (
        <Card key={p.version + p.date}
          title={p.title}
          subtitle={
            <span className="text-[13px] tabular-nums">
              v{p.version} · {formatDate(p.date)}
              {i === 0 && <span className="ml-2 text-money-400 uppercase tracking-wide">latest</span>}
            </span>
          }>
          <div className="space-y-4">
            {(p.sections || [{ notes: p.notes || [] }]).map((s, si) => (
              <div key={si}>
                {s.heading && (
                  <div className="text-[12px] uppercase tracking-wide text-ink-100/55 mb-1">{s.heading}</div>
                )}
                <ul className="space-y-1.5 text-sm text-ink-100/80">
                  {(s.notes || []).map((n, ni) => (
                    <li key={ni} className="flex gap-2">
                      <span className="text-blood-400 shrink-0">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div className="text-center text-[13px] text-ink-100/40">
        <Link to="/" className="hover:text-blood-300 transition">← Back to MAFIA LIFE</Link>
      </div>
    </div>
  );
}
