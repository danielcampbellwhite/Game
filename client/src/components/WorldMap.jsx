import React, { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import worldTopology from 'world-atlas/countries-110m.json';

// ── City coordinates ──────────────────────────────────────────────────
// Real lat/lng for each game city. react-simple-maps takes [lng, lat]
// (GeoJSON convention) — note the order in the Marker props below.
const CITY_COORDS = {
  new_york:    { lat: 40.7,  lng: -74.0  },
  london:      { lat: 51.5,  lng:  -0.1  },
  tokyo:       { lat: 35.7,  lng: 139.7  },
  dubai:       { lat: 25.3,  lng:  55.3  },
  liverpool:   { lat: 53.4,  lng:  -3.0  },
  miami:       { lat: 25.8,  lng: -80.2  },
  paris:       { lat: 48.9,  lng:   2.4  },
  bangkok:     { lat: 13.8,  lng: 100.5  },
  sydney:      { lat: -33.9, lng: 151.2  },
  rio:         { lat: -22.9, lng: -43.2  },
  moscow:      { lat: 55.8,  lng:  37.6  },
  cape_town:   { lat: -33.9, lng:  18.4  },
  las_vegas:   { lat: 36.2,  lng: -115.1 },
  hong_kong:   { lat: 22.3,  lng: 114.2  },
  berlin:      { lat: 52.5,  lng:  13.4  },
  mexico_city: { lat: 19.4,  lng: -99.1  },
  amsterdam:   { lat: 52.4,  lng:   4.9  },
  detroit:     { lat: 42.3,  lng: -83.0  },
  chicago:     { lat: 41.9,  lng: -87.6  },
  los_angeles: { lat: 34.1,  lng: -118.2 },
  seoul:       { lat: 37.6,  lng: 127.0  },
  shanghai:    { lat: 31.2,  lng: 121.5  },
  mumbai:      { lat: 19.1,  lng:  72.9  },
  istanbul:    { lat: 41.0,  lng:  29.0  },
  johannesburg:{ lat: -26.2, lng:  28.0  },
  monaco:      { lat: 43.7,  lng:   7.4  },
  singapore:   { lat:  1.3,  lng: 103.8  },
  manila:      { lat: 14.6,  lng: 121.0  },
  havana:      { lat: 23.1,  lng: -82.4  },
  marseille:   { lat: 43.3,  lng:   5.4  },
  naples:      { lat: 40.8,  lng:  14.3  },
  prague:      { lat: 50.1,  lng:  14.4  },
  dublin:      { lat: 53.3,  lng:  -6.3  },
  sao_paulo:   { lat: -23.6, lng: -46.6  },
};

// Style passed to every <Geography> — keep all three states identical so
// the country fill doesn't flicker when the cursor crosses borders.
const GEO_STYLE = {
  default:  { fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.5, outline: 'none' },
  hover:    { fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.5, outline: 'none' },
  pressed:  { fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.5, outline: 'none' },
};

// All city dots draw at the same base size so the visual doesn't lie
// about activity. Crowdedness is communicated via the hover tooltip.
// As the user zooms in, dots are counter-scaled so they stay roughly
// constant in screen pixels — otherwise zooming would just enlarge them
// uniformly and not actually help separate close cities like London /
// Amsterdam / Paris.
const BASE_DOT_R = 5;
const BASE_HIT_R = 12;
const DOT_STROKE = 1.5;

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.6;

export default function WorldMap({ cities, you }) {
  // Headline totals — shown beneath the map so the player can see
  // "world is alive" without scanning every dot.
  const totalPlayers = cities.reduce((n, c) => n + (c.players || 0), 0);
  const totalOnline  = cities.reduce((n, c) => n + (c.online  || 0), 0);
  const populatedCities = cities.filter(c => (c.players || 0) > 0).length;
  // hover: { id, x, y } where x/y are in container-pixel space (relative
  // to the wrapper div), used to position the absolute-positioned tip.
  const [hover, setHover] = useState(null);
  // Pan + zoom state lives here so the buttons can drive it too.
  const [position, setPosition] = useState({ coordinates: [0, 0], zoom: 1 });
  const wrapRef = useRef(null);

  function handleEnter(city) {
    return (e) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      setHover({ id: city.id, x: e.clientX - r.left, y: e.clientY - r.top });
    };
  }
  function handleLeave(city) {
    return () => setHover(h => h?.id === city.id ? null : h);
  }
  function handleMove(city) {
    return (e) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      setHover({ id: city.id, x: e.clientX - r.left, y: e.clientY - r.top });
    };
  }

  const hoverCity = hover ? cities.find(c => c.id === hover.id) : null;

  const zoomBy = (factor) => {
    setPosition(p => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.zoom * factor));
      return { ...p, zoom: next };
    });
    // Zoom changes hide the tooltip — its anchor point would shift under
    // the cursor and the displayed coords would be stale.
    setHover(null);
  };
  const reset = () => {
    setPosition({ coordinates: [0, 0], zoom: 1 });
    setHover(null);
  };

  // Counter-scale so dots and stroke widths stay roughly constant in
  // screen pixels regardless of zoom level.
  const dotR    = BASE_DOT_R / position.zoom;
  const hitR    = BASE_HIT_R / position.zoom;
  const stroke  = DOT_STROKE  / position.zoom;

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="rounded-lg overflow-hidden bg-ink-950/70 border border-ink-100/10">
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 165 }}
          width={980}
          height={460}
          style={{ width: '100%', height: 'auto', display: 'block' }}>
          <ZoomableGroup
            zoom={position.zoom}
            center={position.coordinates}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onMoveStart={() => setHover(null)}
            onMoveEnd={(pos) => setPosition(pos)}>
            <Geographies geography={worldTopology}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography key={geo.rsmKey} geography={geo} style={GEO_STYLE} />
                ))
              }
            </Geographies>

            {cities.map(city => {
              const coords = CITY_COORDS[city.id];
              if (!coords) return null;
              const isYou = city.id === you;
              const isOnline = (city.online || 0) > 0;
              const players = city.players || 0;
              const strokeColor = isYou ? '#facc15' : isOnline ? '#ef4444' : 'rgba(255,255,255,0.55)';
              const fillColor   = isYou ? 'rgba(250,204,21,0.9)' : isOnline ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.4)';
              // Label colour mirrors the dot status so a glance reads
              // "active city" vs "quiet city" without having to compare
              // against neighbouring dots.
              const labelColor = isYou ? '#fde047' : isOnline ? '#fca5a5' : 'rgba(255,255,255,0.7)';

              return (
                <Marker key={city.id} coordinates={[coords.lng, coords.lat]}>
                  {isYou && (
                    <circle r={dotR + 4 / position.zoom} fill="none" stroke={strokeColor} strokeWidth={stroke} opacity="0.6">
                      <animate attributeName="r" from={dotR + 3 / position.zoom} to={dotR + 14 / position.zoom} dur="1.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Forgiving hit target so small dots are easy to hover */}
                  <circle
                    r={hitR}
                    fill="transparent"
                    onMouseEnter={handleEnter(city)}
                    onMouseLeave={handleLeave(city)}
                    onMouseMove={handleMove(city)}
                    style={{ cursor: 'default' }}
                  />
                  <circle r={dotR} fill={fillColor} stroke={strokeColor} strokeWidth={stroke} pointerEvents="none" />
                  {players > 0 && (
                    <text
                      x={(dotR + 3) / position.zoom}
                      y={3 / position.zoom}
                      fontSize={10 / position.zoom}
                      fontWeight={600}
                      fill={labelColor}
                      // paintOrder + black halo keeps the count legible
                      // when it sits over a country fill of any colour.
                      style={{
                        pointerEvents: 'none',
                        paintOrder: 'stroke',
                        stroke: 'rgba(0,0,0,0.7)',
                        strokeWidth: 2.5 / position.zoom,
                      }}>
                      {players}
                    </text>
                  )}
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        {/* Zoom controls — overlaid on the map, top-right. */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={position.zoom >= MAX_ZOOM}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg leading-none"
            aria-label="Zoom in">＋</button>
          <button
            type="button"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={position.zoom <= MIN_ZOOM}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg leading-none"
            aria-label="Zoom out">−</button>
          <button
            type="button"
            onClick={reset}
            disabled={position.zoom === 1 && position.coordinates[0] === 0 && position.coordinates[1] === 0}
            className="w-8 h-8 rounded-md bg-ink-950/85 border border-ink-100/15 text-ink-50 hover:border-blood-500/60 hover:bg-ink-900/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-xs"
            aria-label="Reset view"
            title="Reset view">⟲</button>
        </div>
      </div>

      {hoverCity && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-blood-500/60 bg-ink-950/95 backdrop-blur px-3 py-2 shadow-lg shadow-black/60"
          style={{
            left: hover.x + 14,
            top:  hover.y + 14,
            // If we're near the right edge, flip to the left of the cursor.
            transform: hover.x > (wrapRef.current?.clientWidth || 0) - 180 ? 'translateX(calc(-100% - 28px))' : undefined,
          }}>
          <div className="text-sm font-medium text-ink-50">{hoverCity.name}</div>
          <div className="text-[11px] text-ink-100/70 tabular-nums">
            {hoverCity.players} player{hoverCity.players === 1 ? '' : 's'}
          </div>
          {(hoverCity.online || 0) > 0 && (
            <div className="text-[11px] text-money-400 tabular-nums">● {hoverCity.online} online</div>
          )}
          {hoverCity.id === you && (
            <div className="text-[10px] text-yellow-400 uppercase tracking-wide mt-0.5">You are here</div>
          )}
        </div>
      )}

      <div className="mt-3 rounded-md border border-ink-100/10 bg-ink-950/40 px-3 py-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <div className="tabular-nums">
          <span className="text-ink-100/50 uppercase text-[10px] tracking-wide mr-2">Online now</span>
          <span className="font-display text-lg text-blood-400">{totalOnline}</span>
          <span className="text-ink-100/45"> / {totalPlayers} player{totalPlayers === 1 ? '' : 's'} across {populatedCities} cit{populatedCities === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className="text-[10px] text-ink-100/40 normal-case">Numbers next to each dot are total players in that city.</div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-wide text-ink-100/55">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /> you are here
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blood-500" /> players online
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-white/40" /> quiet
        </span>
        <span className="ml-auto text-ink-100/40 normal-case tracking-normal">Scroll or use ＋ / − to zoom · drag to pan · hover a dot for details.</span>
      </div>
    </div>
  );
}
