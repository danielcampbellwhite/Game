import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';

// Per-city map view: real lat/lng for the city centre + a default
// zoom level. The polygons themselves come from the server (which
// holds the deterministic Voronoi cells generated at build time).
const CITY_VIEWS = {
  new_york:    { center: [40.7580, -73.9855], zoom: 13 },
  los_angeles: { center: [34.0522, -118.2437], zoom: 12 },
  miami:       { center: [25.7617, -80.1918], zoom: 13 },
  kingston:    { center: [17.9970, -76.7936], zoom: 13 },
  rio:         { center: [-22.9068, -43.1729], zoom: 13 },
  london:      { center: [51.5074,  -0.1278], zoom: 13 },
  paris:       { center: [48.8566,   2.3522], zoom: 13 },
  berlin:      { center: [52.5200,  13.4050], zoom: 13 },
  moscow:      { center: [55.7558,  37.6173], zoom: 12 },
  dubai:       { center: [25.2048,  55.2708], zoom: 12 },
  tokyo:       { center: [35.6762, 139.6503], zoom: 12 },
  hong_kong:   { center: [22.3193, 114.1694], zoom: 13 },
  sydney:      { center: [-33.8688, 151.2093], zoom: 13 },
  cape_town:   { center: [-33.9249,  18.4241], zoom: 12 },
};
const DEFAULT_VIEW = { center: [40.7580, -73.9855], zoom: 13 };

// Faction → polygon paint. Matches the three real factions
// (server/src/data.js) and the FactionBadge palette mapping. Dark
// Carto basemap underneath stays readable against translucent fills.
const FACTION_COLOURS = {
  fraudster: '#facc15',  // gold
  mafia:     '#ef4444',  // blood
  cartel:    '#22c55e',  // money
};
const UNCONTROLLED = 'rgba(160,160,160,0.5)';

function fillFor(area) {
  if (!area.faction) return UNCONTROLLED;
  return FACTION_COLOURS[area.faction] || UNCONTROLLED;
}

export default function CityMap({ city = 'new_york' }) {
  const view = CITY_VIEWS[city] || DEFAULT_VIEW;
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);   // area id

  async function load() {
    try { setData(await api.get(`/areas/city/${city}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { setData(null); setSelected(null); load(); }, [city]);

  async function attempt(area) {
    setBusy(area.id); setMsg(null);
    try {
      const r = await api.post(`/areas/${area.id}/capture`, {});
      const atkLost = r.atkCasualties.length;
      const defLost = r.defCasualties.length;
      setMsg(
        (r.captured ? `Captured ${area.name}.` : `Failed to take ${area.name}.`) +
        ` Atk ${r.atkPower} vs Def ${r.defPower} (${Math.round(r.winChance * 100)}%). ` +
        `Casualties — yours: ${atkLost}, theirs: ${defLost}.`
      );
      await load();
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const selectedArea = data?.areas?.find(a => a.id === selected) || null;
  const inSameCity = character?.city === city;
  const inGang = !!character?.gang;

  return (
    <div className="space-y-2">
      <style>{`
        .leaflet-container { background:#0a0908; font-family: inherit; }
        .leaflet-control-attribution { background: rgba(10,9,8,0.7) !important; color: rgba(245,245,244,0.55) !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: rgba(245,245,244,0.75) !important; }
        .leaflet-control-zoom a {
          background: rgba(10,9,8,0.85) !important; color: #f5f5f4 !important;
          border-color: rgba(255,255,255,0.15) !important;
        }
        .leaflet-control-zoom a:hover { background: rgba(20,17,15,0.95) !important; border-color: rgba(220,38,38,0.6) !important; }
        .area-tip {
          background: rgba(10,9,8,0.92) !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          color: #f5f5f4 !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          padding: 3px 6px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important;
        }
        .area-tip::before { display:none !important; }
      `}</style>

      <div className="relative w-full aspect-square max-w-5xl mx-auto rounded-xl border border-ink-100/10 overflow-hidden bg-ink-1000">
        <MapContainer
          key={city}
          center={view.center}
          zoom={view.zoom}
          minZoom={11}
          maxZoom={16}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
          attributionControl>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains={['a', 'b', 'c', 'd']}
          />
          {(data?.areas || []).map(a => (
            <Polygon
              key={a.id}
              positions={a.polygon}
              pathOptions={{
                color: '#0a0908',
                weight: 2,
                opacity: 0.9,
                fillColor: fillFor(a),
                fillOpacity: selected === a.id ? 0.55 : 0.30,
              }}
              eventHandlers={{ click: () => setSelected(a.id) }}
            >
              <Tooltip className="area-tip" direction="top" sticky>
                {a.name}{a.faction ? ` · ${a.faction}` : ' · unclaimed'}
              </Tooltip>
            </Polygon>
          ))}
        </MapContainer>

        {/* Legend bottom-left */}
        <div className="absolute bottom-2 left-2 z-[1000] text-[11px] text-ink-100/55 bg-ink-950/80 border border-ink-100/10 rounded px-1.5 py-1 leading-tight pointer-events-none">
          <div className="font-medium uppercase tracking-wider text-ink-100/70 mb-0.5">Faction control</div>
          {Object.entries(FACTION_COLOURS).map(([f, col]) => (
            <div key={f} className="flex items-center gap-1.5 capitalize">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: col }} /> {f}
            </div>
          ))}
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-slate-400" /> unclaimed</div>
        </div>
      </div>

      {/* Hint shown until the player clicks a sector. */}
      {!selectedArea && data?.areas?.length > 0 && (
        <div className="rounded-lg border border-blood-500/30 bg-blood-700/15 p-3 text-center text-xs">
          <span className="text-blood-200 font-medium">Tap a coloured sector on the map</span>
          <span className="text-ink-100/60"> to see who controls it and attempt to take it.</span>
        </div>
      )}

      {/* Selected-area panel */}
      {selectedArea && (
        <div className="rounded-lg border border-ink-100/15 bg-ink-950/85 p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium">{selectedArea.name}</div>
            <button onClick={() => setSelected(null)} className="text-[12px] text-ink-100/50 hover:text-ink-100/85">close</button>
          </div>
          <div className="text-[13px] text-ink-100/65">
            {selectedArea.faction
              ? <>Held by <b className="text-ink-50">{selectedArea.faction}</b> faction · captured {selectedArea.captured_at ? new Date(selectedArea.captured_at).toLocaleString() : 'unknown'}</>
              : <>Currently unclaimed — walk in and plant a flag, no fight.</>}
          </div>
          {selectedArea.flipped_at && Date.now() - selectedArea.flipped_at < 24*60*60*1000 && (
            <div className="text-[13px] text-yellow-400/85"> This area has changed hands today — locked until next UTC midnight.</div>
          )}
          {!inSameCity ? (
            <p className="text-[13px] text-ink-100/45">Travel to this city to attempt capture.</p>
          ) : !inGang ? (
            <p className="text-[13px] text-ink-100/45">Join a gang to fight for territory.</p>
          ) : (
            <button onClick={() => attempt(selectedArea)} disabled={busy === selectedArea.id}
              className="btn btn-primary text-xs w-full">
              {busy === selectedArea.id ? '…' : `Attempt capture`}
            </button>
          )}
          {msg && <p className="text-[13px] text-money-300">{msg}</p>}
        </div>
      )}

      <p className="text-[12px] text-ink-100/45 text-center">
        Real streets via OpenStreetMap · scroll/pinch to zoom · drag to pan · tap a sector to see its controller and attempt capture.
      </p>
    </div>
  );
}
