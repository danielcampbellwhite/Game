import React from 'react';
import { Link } from 'react-router-dom';

// Stylised top-down city map. Decorative SVG underneath, clickable
// pins on top — one per venue. Pin tone tells the player at a glance
// whether they're walking into something legitimate (gold) or seedy
// (red). Each pin's tooltip is its venue name; tap-to-navigate goes
// straight to the matching route.
//
// Coordinates are in 0-100 percent of the container so the layout
// scales cleanly with the map's responsive size.

const VENUES = [
  // ── Civic / financial — top-left quarter
  { to: '/bank',         name: 'Bank',           x: 22, y: 18, tone: 'gold' },
  { to: '/stocks',       name: 'Stock Broker',   x: 30, y: 27, tone: 'gold' },
  { to: '/property',     name: 'Estate Agent',   x: 18, y: 32, tone: 'gold' },
  { to: '/jail',         name: 'Jail',           x: 13, y: 14, tone: 'gold' },
  { to: '/bounties',     name: 'Bounty Board',   x: 13, y: 22, tone: 'gold' },

  // ── Medical / academic — top-right quarter
  { to: '/hospital',     name: 'Hospital',       x: 78, y: 16, tone: 'gold' },
  { to: '/shop/pharmacy',name: 'Pharmacy',       x: 70, y: 22, tone: 'gold' },
  { to: '/university',   name: 'University',     x: 86, y: 28, tone: 'gold' },
  { to: '/driving-school', name: 'Driving School', x: 78, y: 34, tone: 'gold' },

  // ── High street — middle
  { to: '/general-store',  name: 'General Store',     x: 42, y: 46, tone: 'gold' },
  { to: '/shop/coffee',    name: 'Coffee Shop',       x: 50, y: 40, tone: 'gold' },
  { to: '/shop/gift_shop', name: 'Gift Shop',         x: 58, y: 46, tone: 'gold' },
  { to: '/shop/deli',      name: 'Late-Night Deli',   x: 50, y: 52, tone: 'gold' },
  { to: '/shop/off_licence', name: 'Off-Licence',     x: 38, y: 54, tone: 'gold' },
  { to: '/gun-store',      name: 'Weapon Dealer',     x: 62, y: 54, tone: 'gold' },

  // ── Training — middle row, edges
  { to: '/gym',          name: 'Gym',            x: 18, y: 50, tone: 'gold' },
  { to: '/range',        name: 'Shooting Range', x: 82, y: 50, tone: 'gold' },

  // ── Commerce / transport — bottom-right quarter
  { to: '/dealership',   name: 'Car Dealership', x: 72, y: 70, tone: 'gold' },
  { to: '/repair',       name: 'Repair Shop',    x: 80, y: 76, tone: 'gold' },
  { to: '/travel',       name: 'Airport',        x: 88, y: 88, tone: 'gold' },
  { to: '/jobs',         name: 'Job Board',      x: 64, y: 78, tone: 'gold' },
  { to: '/shops',        name: 'Player Shops',   x: 50, y: 70, tone: 'gold' },
  { to: '/specialisations', name: 'Specialisation', x: 50, y: 82, tone: 'gold' },

  // ── Underworld — back-alley, bottom-left + far-right neon strip
  { to: '/drugs',        name: 'Drug Market',    x: 14, y: 76, tone: 'blood' },
  { to: '/chop-shop',    name: 'Chop Shop',      x: 22, y: 84, tone: 'blood' },
  { to: '/fence',        name: 'The Fence',      x: 32, y: 78, tone: 'blood' },
  { to: '/casino',       name: 'Casino',         x: 30, y: 92, tone: 'blood' },
  { to: '/bookmaker',    name: 'Bookmaker',      x: 42, y: 88, tone: 'blood' },
];

const TONE_CLASSES = {
  gold:  'bg-gold-400 ring-gold-200/60',
  blood: 'bg-blood-500 ring-blood-300/50',
};

function CityBackground() {
  // Roads (cross + ring), city blocks, a river ribbon and a green
  // park. Stroke widths and colours tuned for a noir-night feel
  // against the dark dashboard backdrop. Decorative — never trapping
  // pointer events.
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden>
      {/* asphalt ground */}
      <rect x="0" y="0" width="100" height="100" fill="#1f1d1b" />
      {/* river ribbon along the right edge */}
      <path d="M0 65 Q 25 62, 45 70 T 100 78 L 100 100 L 0 100 Z" fill="#1e3a5f" opacity="0.5" />
      {/* park / green space (top-centre) */}
      <rect x="44" y="6" width="12" height="14" rx="1.5" fill="#14542d" opacity="0.7" />
      {/* district blocks */}
      {[
        [4, 4, 22, 18],   // top-left
        [62, 4, 34, 18],  // top-right (excluding park area)
        [4, 26, 22, 18],
        [62, 26, 34, 18],
        [4, 48, 22, 18],
        [62, 48, 34, 18],
        [4, 70, 22, 24],
        [62, 70, 34, 24],
        [30, 30, 36, 14], // central downtown
        [30, 46, 36, 18],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#2a2724" stroke="#3a3631" strokeWidth="0.2" />
      ))}
      {/* roads — main cross */}
      <line x1="0" y1="44" x2="100" y2="44" stroke="#4a463f" strokeWidth="2.4" />
      <line x1="0" y1="64" x2="100" y2="64" stroke="#4a463f" strokeWidth="1.8" />
      <line x1="28" y1="0" x2="28" y2="100" stroke="#4a463f" strokeWidth="1.8" />
      <line x1="60" y1="0" x2="60" y2="100" stroke="#4a463f" strokeWidth="2.4" />
      {/* lane dashes on the main cross */}
      <line x1="0" y1="44" x2="100" y2="44" stroke="#7a766c" strokeWidth="0.18" strokeDasharray="1.4 1" />
      <line x1="60" y1="0" x2="60" y2="100" stroke="#7a766c" strokeWidth="0.18" strokeDasharray="1.4 1" />
    </svg>
  );
}

export default function CityMap() {
  return (
    <div className="relative w-full aspect-square max-w-3xl mx-auto rounded-xl border border-ink-100/10 overflow-hidden">
      <CityBackground />
      {VENUES.map(v => (
        <Link
          key={v.to}
          to={v.to}
          aria-label={v.name}
          className="absolute -translate-x-1/2 -translate-y-1/2 group"
          style={{ left: `${v.x}%`, top: `${v.y}%` }}>
          <span
            className={`block w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ring-2 transition-transform group-hover:scale-150 group-focus:scale-150 ${TONE_CLASSES[v.tone]}`}
            style={{ boxShadow: '0 0 8px rgba(0,0,0,0.6)' }}
          />
          <span
            className="absolute left-1/2 top-full -translate-x-1/2 mt-1 whitespace-nowrap text-[10px] uppercase tracking-wide bg-ink-950/95 border border-ink-100/15 text-ink-50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none transition shadow shadow-black/60 z-10">
            {v.name}
          </span>
        </Link>
      ))}
      {/* Compass rose / legend bottom-right */}
      <div className="absolute bottom-2 right-2 text-[9px] text-ink-100/55 bg-ink-950/70 border border-ink-100/10 rounded px-1.5 py-1 leading-tight">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold-400 ring-1 ring-gold-200/60" /> Around town</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blood-500 ring-1 ring-blood-300/50" /> Underworld</div>
      </div>
    </div>
  );
}
