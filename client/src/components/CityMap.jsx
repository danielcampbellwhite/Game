import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { layoutFor } from '../data/cityLayouts.js';

// Per-city stylised top-down map. The 0-100 SVG coord system is the
// same across cities; what changes is the background — water shapes,
// parks, road style, and signature landmarks come from cityLayouts.js.
//
// Pan/zoom is implemented as a single SVG <g transform="translate scale">
// wrapping both the city background AND the venue pins, so they stay
// pixel-locked to the city as the player zooms in. Drag to pan, wheel
// to zoom toward the cursor, or use the +/− buttons.

const VENUES = [
  // Civic / financial — top-left quarter
  { to: '/bank',           name: 'Bank',           x: 22, y: 18, tone: 'gold' },
  { to: '/stocks',         name: 'Stock Broker',   x: 30, y: 27, tone: 'gold' },
  { to: '/property',       name: 'Estate Agent',   x: 18, y: 32, tone: 'gold' },
  { to: '/jail',           name: 'Jail',           x: 13, y: 14, tone: 'gold' },

  // Medical / academic — top-right quarter
  { to: '/hospital',       name: 'Hospital',       x: 78, y: 16, tone: 'gold' },
  { to: '/shop/pharmacy',  name: 'Pharmacy',       x: 70, y: 22, tone: 'gold' },
  { to: '/university',     name: 'University',     x: 86, y: 28, tone: 'gold' },
  { to: '/driving-school', name: 'Driving School', x: 78, y: 34, tone: 'gold' },

  // High street — middle
  { to: '/general-store',     name: 'General Store',   x: 42, y: 46, tone: 'gold' },
  { to: '/shop/coffee',       name: 'Coffee Shop',     x: 50, y: 40, tone: 'gold' },
  { to: '/shop/gift_shop',    name: 'Gift Shop',       x: 58, y: 46, tone: 'gold' },
  { to: '/shop/deli',         name: 'Late-Night Deli', x: 50, y: 52, tone: 'gold' },
  { to: '/shop/off_licence',  name: 'Off-Licence',     x: 38, y: 54, tone: 'gold' },
  { to: '/gun-store',         name: 'Weapon Dealer',   x: 62, y: 54, tone: 'gold' },

  // Training — middle row, edges
  { to: '/gym',            name: 'Gym',            x: 18, y: 50, tone: 'gold' },
  { to: '/range',          name: 'Shooting Range', x: 82, y: 50, tone: 'gold' },

  // Commerce / transport — bottom-right quarter
  { to: '/dealership',     name: 'Car Dealership', x: 72, y: 70, tone: 'gold' },
  { to: '/repair',         name: 'Repair Shop',    x: 80, y: 76, tone: 'gold' },
  { to: '/travel',         name: 'Airport',        x: 88, y: 88, tone: 'gold' },

  // Underworld — back-alley, bottom-left
  { to: '/chop-shop',      name: 'Chop Shop',      x: 22, y: 84, tone: 'blood' },
  { to: '/fence',          name: 'The Fence',      x: 32, y: 78, tone: 'blood' },
  { to: '/casino',         name: 'Casino',         x: 30, y: 92, tone: 'blood' },
  { to: '/bookmaker',      name: 'Bookmaker',      x: 42, y: 88, tone: 'blood' },
];

const TONE_FILL  = { gold: '#facc15', blood: '#ef4444' };
const TONE_RING  = { gold: 'rgba(253,224,71,0.6)', blood: 'rgba(252,165,165,0.55)' };

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.5;

// Renders the per-city background — water, parks, road grid, landmarks.
function CityBackground({ layout }) {
  const { waters = [], parks = [], roads, customRoads = [], radialCenter, ringCenter, landmarks = [], accent = '#1f1d1b' } = layout;

  return (
    <g aria-hidden>
      {/* asphalt / ground */}
      <rect x="0" y="0" width="100" height="100" fill={accent} />

      {/* water bodies */}
      {waters.map((w, i) => {
        if (w.type === 'rect') return <rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.fill} opacity={w.opacity || 0.8} />;
        if (w.type === 'ellipse') return <ellipse key={`w${i}`} cx={w.cx} cy={w.cy} rx={w.rx} ry={w.ry} fill={w.fill} opacity={w.opacity || 0.95} />;
        return <path key={`w${i}`} d={w.d} fill={w.fill} opacity={w.opacity || 0.85} />;
      })}

      {/* parks / mountains / green */}
      {parks.map((p, i) => (
        <rect key={`p${i}`} x={p.x} y={p.y} width={p.w} height={p.h} rx="1" fill="#14542d" opacity="0.65" />
      ))}

      {/* district blocks — varies by road style. We only paint subtle
          block fills that don't overlap water or parks; coarse layout
          plus city-specific roads on top sells the silhouette. */}
      <BlocksAndRoads roads={roads} radialCenter={radialCenter} ringCenter={ringCenter} />

      {/* signature roads on top of the grid */}
      {customRoads.map((r, i) => (
        <line key={`cr${i}`} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke="#5b554b" strokeWidth={r.thick} strokeLinecap="round"
          strokeDasharray={r.dash ? '1.4 1' : undefined} />
      ))}

      {/* park labels — drawn last so they sit above their patch */}
      {parks.filter(p => p.name).map((p, i) => (
        <text key={`pl${i}`} x={p.x + p.w / 2} y={p.y + p.h / 2 + 0.5}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="2" fontWeight="500"
          fill="rgba(220,255,220,0.55)" pointerEvents="none">
          {p.name}
        </text>
      ))}

      {/* water labels */}
      {waters.filter(w => w.name).map((w, i) => {
        const cx = w.type === 'rect' ? w.x + w.w / 2 : w.type === 'ellipse' ? w.cx : 50;
        const cy = w.type === 'rect' ? w.y + w.h / 2 : w.type === 'ellipse' ? w.cy : 64;
        return (
          <text key={`wl${i}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
            fontSize="2.2" fontStyle="italic" fill="rgba(180,210,240,0.55)" pointerEvents="none">
            {w.name}
          </text>
        );
      })}

      {/* signature landmarks — small cross-marks with labels */}
      {landmarks.map((l, i) => (
        <g key={`lm${i}`} pointerEvents="none">
          <circle cx={l.x} cy={l.y} r="0.6" fill="rgba(220,200,140,0.7)" />
          <text x={l.x} y={l.y - 1.2} textAnchor="middle"
            fontSize="1.8" fill="rgba(220,200,140,0.55)">
            {l.label}
          </text>
        </g>
      ))}
    </g>
  );
}

// Cheap, readable road grid: just paint asphalt rectangles for "blocks"
// and stroke roads between. Different road archetypes change the
// pattern density and angles so each city silhouette feels different.
function BlocksAndRoads({ roads, radialCenter, ringCenter }) {
  if (roads === 'manhattan') {
    // tight N/S avenues + E/W cross streets
    const cols = [16, 24, 32, 40, 48, 56, 64, 72, 80];
    const rows = [10, 22, 34, 46, 58, 70, 82, 94];
    return (
      <g>
        {cols.map((c, i) => <line key={`c${i}`} x1={c} y1={0} x2={c} y2={100} stroke="#3a3631" strokeWidth="0.4" />)}
        {rows.map((r, i) => <line key={`r${i}`} x1={11} y1={r} x2={89} y2={r} stroke="#3a3631" strokeWidth="0.3" />)}
      </g>
    );
  }
  if (roads === 'grid') {
    const cols = [14, 28, 42, 56, 70, 84];
    const rows = [14, 28, 42, 56, 70, 84];
    return (
      <g>
        {cols.map((c, i) => <line key={`c${i}`} x1={c} y1={0} x2={c} y2={100} stroke="#3a3631" strokeWidth="0.4" />)}
        {rows.map((r, i) => <line key={`r${i}`} x1={0} y1={r} x2={100} y2={r} stroke="#3a3631" strokeWidth="0.4" />)}
      </g>
    );
  }
  if (roads === 'radial' && radialCenter) {
    const { x, y, count, length } = radialCenter;
    return (
      <g>
        {Array.from({ length: count }).map((_, i) => {
          const angle = (i / count) * Math.PI * 2;
          return (
            <line key={i}
              x1={x} y1={y}
              x2={x + Math.cos(angle) * length}
              y2={y + Math.sin(angle) * length}
              stroke="#3a3631" strokeWidth="0.4" />
          );
        })}
      </g>
    );
  }
  if (roads === 'ring' && ringCenter) {
    const { x, y, ringsAt } = ringCenter;
    const spokes = 8;
    return (
      <g>
        {ringsAt.map((r, i) => <circle key={`R${i}`} cx={x} cy={y} r={r} fill="none" stroke="#3a3631" strokeWidth="0.4" />)}
        {Array.from({ length: spokes }).map((_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          return (
            <line key={`s${i}`} x1={x} y1={y}
              x2={x + Math.cos(a) * (ringsAt[ringsAt.length - 1] + 6)}
              y2={y + Math.sin(a) * (ringsAt[ringsAt.length - 1] + 6)}
              stroke="#3a3631" strokeWidth="0.35" />
          );
        })}
      </g>
    );
  }
  if (roads === 'organic') {
    // Hand-tuned irregular streets so London/Cape Town/Rio feel less
    // tidy than gridded cities.
    const lines = [
      [4, 18, 96, 22], [6, 32, 94, 38], [10, 50, 88, 52], [4, 84, 96, 80],
      [22, 0, 26, 100], [44, 0, 40, 100], [60, 0, 64, 100], [80, 0, 76, 100],
      [10, 12, 90, 88], [10, 88, 90, 12],
    ];
    return (
      <g>
        {lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#3a3631" strokeWidth="0.35" />)}
      </g>
    );
  }
  if (roads === 'coastal') {
    // a sweeping shoreline road + a few cross-bay connectors
    return (
      <g>
        <path d="M0 38 Q 30 32 60 40 T 100 38" fill="none" stroke="#3a3631" strokeWidth="0.5" />
        <path d="M0 66 Q 30 72 60 64 T 100 66" fill="none" stroke="#3a3631" strokeWidth="0.5" />
        {[20, 40, 60, 80].map((x, i) => <line key={i} x1={x} y1={0} x2={x + (i % 2 ? 2 : -2)} y2={100} stroke="#3a3631" strokeWidth="0.3" />)}
      </g>
    );
  }
  if (roads === 'desert') {
    // sparse highway-style streets, warmer ground.
    return (
      <g>
        <line x1="0" y1="20" x2="100" y2="22" stroke="#3a3631" strokeWidth="0.4" />
        <line x1="0" y1="36" x2="100" y2="38" stroke="#3a3631" strokeWidth="0.4" />
        <line x1="30" y1="0" x2="34" y2="100" stroke="#3a3631" strokeWidth="0.35" />
        <line x1="70" y1="0" x2="68" y2="100" stroke="#3a3631" strokeWidth="0.35" />
      </g>
    );
  }
  return null;
}

export default function CityMap({ city = 'new_york' }) {
  const layout = layoutFor(city);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const lastDragMovedRef = useRef(false);
  const navigate = useNavigate();
  // viewBox state: we drive zoom by shrinking viewBox width/height,
  // pan by translating its origin. Stays at 0..100 in unzoomed coords.
  const [view, setView] = useState({ x: 0, y: 0, w: 100, h: 100 });

  // Reset view when the city changes — otherwise zoom from the old
  // city's map carries over which is jarring.
  useEffect(() => {
    setView({ x: 0, y: 0, w: 100, h: 100 });
  }, [city]);

  const zoom = 100 / view.w; // current effective zoom

  function clampView(v) {
    const w = Math.max(100 / MAX_ZOOM, Math.min(100 / MIN_ZOOM, v.w));
    const h = w; // keep square
    const x = Math.max(0, Math.min(100 - w, v.x));
    const y = Math.max(0, Math.min(100 - h, v.y));
    return { x, y, w, h };
  }

  function zoomBy(factor, origin) {
    setView(v => {
      const newW = v.w / factor;
      // Origin in 0..100 coords (defaults to view centre)
      const ox = origin?.x ?? v.x + v.w / 2;
      const oy = origin?.y ?? v.y + v.h / 2;
      // Pin the origin point so it stays under the cursor on zoom.
      const nx = ox - (ox - v.x) * (newW / v.w);
      const ny = oy - (oy - v.y) * (newW / v.h);
      return clampView({ x: nx, y: ny, w: newW, h: newW });
    });
  }

  function onWheel(e) {
    e.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const ox = view.x + ((e.clientX - r.left) / r.width)  * view.w;
    const oy = view.y + ((e.clientY - r.top)  / r.height) * view.h;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomBy(factor, { x: ox, y: oy });
  }

  function onPointerDown(e) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, view, moved: false };
    lastDragMovedRef.current = false;
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startX) / r.width  * dragRef.current.view.w;
    const dy = (e.clientY - dragRef.current.startY) / r.height * dragRef.current.view.h;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
      dragRef.current.moved = true;
      lastDragMovedRef.current = true;
    }
    setView(clampView({ ...dragRef.current.view, x: dragRef.current.view.x - dx, y: dragRef.current.view.y - dy }));
  }
  function onPointerUp(e) {
    const wrap = wrapRef.current;
    if (wrap?.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  // Pin radius scales with zoom so dots stay roughly constant in screen
  // pixels. Labels are always visible — every venue is a clickable link.
  const pinR = Math.max(0.7, 1.4 / zoom);
  const pinRing = Math.max(0.35, 0.6 / zoom);

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative w-full aspect-[16/10] max-w-4xl mx-auto rounded-xl border border-ink-100/10 overflow-hidden bg-ink-1000 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}>
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full">
          <CityBackground layout={layout} />

          {/* Venue pins live in the SAME coord space so they pan/zoom
              with the rest of the map. */}
          {VENUES.map(v => (
            <VenuePin key={v.to} v={v} pinR={pinR} pinRing={pinRing} zoom={zoom}
              onClick={() => { if (!lastDragMovedRef.current) navigate(v.to); }} />
          ))}
        </svg>

        {/* Zoom controls overlay */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg leading-none"
            aria-label="Zoom in">＋</button>
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg leading-none"
            aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, w: 100, h: 100 })}
            disabled={view.x === 0 && view.y === 0 && view.w === 100}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-xs"
            aria-label="Reset view" title="Reset view">⟲</button>
        </div>

        {/* Legend bottom-right */}
        <div className="absolute bottom-2 right-2 text-[9px] text-ink-100/55 bg-ink-950/70 border border-ink-100/10 rounded px-1.5 py-1 leading-tight pointer-events-none">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold-400 ring-1 ring-gold-200/60" /> Around town</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blood-500 ring-1 ring-blood-300/50" /> Underworld</div>
        </div>
      </div>

      <p className="text-[10px] text-ink-100/45 text-center">
        Scroll or use ＋ / − to zoom · drag to pan · tap any name to walk in.
      </p>
    </div>
  );
}

function VenuePin({ v, pinR, pinRing, zoom, onClick }) {
  const fill = TONE_FILL[v.tone];
  const ring = TONE_RING[v.tone];
  // The whole <g> is the link target — the dot, its halo, AND the
  // label below it. Black stroke around the text keeps it readable
  // against any underlying water/park/road colour.
  const labelSize = Math.max(1.6, 2.2 / zoom);
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick} role="link" aria-label={v.name}>
      <title>{v.name}</title>
      <circle cx={v.x} cy={v.y} r={pinR + pinRing} fill={ring} opacity="0.35" />
      <circle cx={v.x} cy={v.y} r={pinR} fill={fill} stroke="rgba(0,0,0,0.5)" strokeWidth={pinR * 0.15} />
      <text x={v.x} y={v.y + pinR + labelSize}
        textAnchor="middle"
        fontSize={labelSize}
        fontWeight="600"
        fill="#f5f5f4"
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={Math.max(0.3, 0.5 / zoom)}>
        {v.name}
      </text>
    </g>
  );
}
