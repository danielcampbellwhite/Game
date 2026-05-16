import React, { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, Line } from 'react-simple-maps';
import worldTopology from 'world-atlas/countries-110m.json';

// Live travel progress display — world map with origin + destination
// city markers, a dashed great-circle-style line between them, and
// an icon (plane / heli / car) that slides along the line in
// real time as the player flies / drives between cities.
//
// Coords are duplicated from WorldMap.jsx — we don't import to avoid
// pulling unused chrome (tooltips, zoom controls etc).

const CITY_COORDS = {
  new_york:    { lat: 40.7,  lng:  -74.0 },
  los_angeles: { lat: 34.1,  lng: -118.2 },
  miami:       { lat: 25.8,  lng:  -80.2 },
  kingston:    { lat: 18.0,  lng:  -76.8 },
  rio:         { lat: -22.9, lng:  -43.2 },
  london:      { lat: 51.5,  lng:   -0.1 },
  liverpool:   { lat: 53.4,  lng:   -3.0 },
  paris:       { lat: 48.9,  lng:    2.4 },
  berlin:      { lat: 52.5,  lng:   13.4 },
  moscow:      { lat: 55.8,  lng:   37.6 },
  dubai:       { lat: 25.3,  lng:   55.3 },
  tokyo:       { lat: 35.7,  lng:  139.7 },
  hong_kong:   { lat: 22.3,  lng:  114.2 },
  sydney:      { lat: -33.9, lng:  151.2 },
  cape_town:   { lat: -33.9, lng:   18.4 },
};

const GEO_STYLE = {
  default:  { fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 0.5, outline: 'none' },
  hover:    { fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 0.5, outline: 'none' },
  pressed:  { fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 0.5, outline: 'none' },
};

function lerp(a, b, t) { return a + (b - a) * t; }

// Mode-specific SVG icon for the moving marker. Plane is the
// default for inter-city flights; car for drives; helicopter for
// the hangar 'fly' endpoint when the aircraft is a heli.
function MovingIcon({ mode }) {
  if (mode === 'car') {
    return (
      <g transform="translate(-7,-4)">
        <rect x="0" y="0" width="14" height="8" rx="2" fill="#fbbf24" />
        <rect x="2" y="-2" width="10" height="4" rx="1.5" fill="#fbbf24" />
        <circle cx="3" cy="8" r="2" fill="#0a0a0a" />
        <circle cx="11" cy="8" r="2" fill="#0a0a0a" />
      </g>
    );
  }
  if (mode === 'helicopter') {
    return (
      <g>
        <rect x="-9" y="-2" width="18" height="0.6" fill="#fbbf24" />
        <ellipse cx="0" cy="2" rx="6" ry="3.5" fill="#fbbf24" />
        <rect x="-1" y="5" width="2" height="3" fill="#fbbf24" />
        <rect x="-5" y="7.5" width="10" height="0.6" fill="#fbbf24" />
      </g>
    );
  }
  // plane (default)
  return (
    <g transform="rotate(0)">
      <path
        d="M -10 0 L 6 -2 L 8 -6 L 11 -6 L 9 -1 L 12 -1 L 14 0 L 12 1 L 9 1 L 11 6 L 8 6 L 6 2 L -10 0 Z"
        fill="#fbbf24" stroke="#1a1815" strokeWidth="0.4" />
    </g>
  );
}

// Compute the rotation angle (degrees) the moving icon should sit at
// so it points from origin → destination. Map projection is roughly
// equirectangular, so straight pixel-angle is acceptable here.
function bearingDeg(from, to) {
  const dx = to.lng - from.lng;
  const dy = -(to.lat - from.lat); // svg y inverted vs lat
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Public component. Accepts:
//   fromCity, toCity  — city ids (keys of CITY_COORDS)
//   startedAt, until  — ms timestamps from character.travel_*
//   mode              — 'plane' | 'helicopter' | 'car'
//   label             — copy in the header strip
export default function TravelMap({ fromCity, toCity, startedAt, until, mode = 'plane', label }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [until]);

  const from = CITY_COORDS[fromCity];
  const to   = CITY_COORDS[toCity];
  if (!from || !to) return null;

  const start    = startedAt || (until ? until - 60_000 : now);
  const duration = Math.max(1, until - start);
  const elapsed  = Math.max(0, Math.min(duration, now - start));
  const t        = elapsed / duration;
  const cur      = { lng: lerp(from.lng, to.lng, t), lat: lerp(from.lat, to.lat, t) };
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));

  const angle = bearingDeg(from, to);

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-ink-950/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-cyan-500/30 bg-cyan-900/20 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">{label || 'En route'}</div>
          <div className="text-sm text-ink-100/85 mt-0.5">
            {prettyCity(fromCity)} → {prettyCity(toCity)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl text-cyan-200 tabular-nums">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </div>
          <div className="text-[11px] text-ink-100/55 tabular-nums">{Math.round(t * 100)}% there</div>
        </div>
      </div>

      <div className="relative" style={{ background: '#0a0908' }}>
        <ComposableMap
          projectionConfig={{ scale: 140 }}
          width={800} height={360}
          style={{ width: '100%', height: 'auto' }}>
          <Geographies geography={worldTopology}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography key={geo.rsmKey} geography={geo} style={GEO_STYLE} />
              ))
            }
          </Geographies>

          {/* Dashed route line — origin → destination */}
          <Line
            from={[from.lng, from.lat]}
            to={[to.lng, to.lat]}
            stroke="rgba(34,211,238,0.7)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinecap="round"
          />

          {/* Origin marker */}
          <Marker coordinates={[from.lng, from.lat]}>
            <circle r="4" fill="rgba(34,211,238,0.95)" stroke="#0a0908" strokeWidth="1" />
            <text
              y="-8" textAnchor="middle" fontSize="9"
              fill="#67e8f9" stroke="#0a0908" strokeWidth="2" paintOrder="stroke">
              {prettyCity(fromCity)}
            </text>
          </Marker>

          {/* Destination marker */}
          <Marker coordinates={[to.lng, to.lat]}>
            <circle r="5" fill="#fbbf24" stroke="#0a0908" strokeWidth="1" />
            <text
              y="-9" textAnchor="middle" fontSize="9" fontWeight="bold"
              fill="#fde68a" stroke="#0a0908" strokeWidth="2" paintOrder="stroke">
              {prettyCity(toCity)}
            </text>
          </Marker>

          {/* The moving icon — interpolated lat/lng. Rotation aligns
              it along the route bearing so the plane points where
              it's going. */}
          <Marker coordinates={[cur.lng, cur.lat]}>
            <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '0 0' }}>
              <MovingIcon mode={mode} />
            </g>
          </Marker>
        </ComposableMap>
      </div>
    </div>
  );
}

function prettyCity(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
