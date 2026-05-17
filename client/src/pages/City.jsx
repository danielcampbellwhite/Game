import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import WorldMap from '../components/WorldMap.jsx';
import CityMap from '../components/CityMap.jsx';
import FactionBadge from '../components/FactionBadge.jsx';

function fmtSecs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

function LocationTile({ loc, hasVehicle, walkMs, driveMs, busy, onTravel, onEnter, travel }) {
  // En-route state — this tile IS the destination. Show a live
  // countdown, the mode (walk/drive), a progress bar, and dim the
  // travel buttons (they're no-ops while a journey is in flight).
  if (travel?.active) {
    const totalMs = travel.mode === 'drive' ? driveMs : walkMs;
    const elapsed = Math.max(0, totalMs - travel.msLeft);
    const pct = totalMs > 0 ? Math.max(0, Math.min(100, (elapsed / totalMs) * 100)) : 0;
    const verb = travel.mode === 'drive' ? 'Driving' : 'Walking';
    return (
      <div className="p-3 rounded-lg border border-cyan-500/50 bg-cyan-900/15 flex flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm text-cyan-200">{loc.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-cyan-300">{verb}</span>
        </div>
        {loc.desc && <div className="text-[13px] text-ink-100/55 leading-snug mt-1">{loc.desc}</div>}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-[12px] uppercase tracking-wide text-cyan-300">Arriving in</span>
          <span className="text-xl font-display text-cyan-200 tabular-nums">{fmtSecs(travel.msLeft)}</span>
        </div>
        <div className="mt-1.5 h-[3px] rounded-full bg-cyan-900/40 overflow-hidden">
          <div className="h-full bg-cyan-400 transition-[width] duration-500" style={{ width: pct + '%' }} />
        </div>
      </div>
    );
  }

  if (loc.here) {
    return (
      <div className="p-3 rounded-lg border border-money-500/40 bg-money-700/10 flex flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm text-money-300">{loc.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-money-400">You're here</span>
        </div>
        {loc.desc && <div className="text-[13px] text-ink-100/65 leading-snug mt-1">{loc.desc}</div>}
        {loc.gated && (
          <button onClick={() => onEnter(loc)} className="btn btn-primary text-xs mt-2 w-full">
            Enter {loc.name}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-sm">{loc.name}</span>
      </div>
      {loc.desc && <div className="text-[13px] text-ink-100/55 leading-snug mt-1">{loc.desc}</div>}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <button
          disabled={busy}
          onClick={() => onTravel(loc, 'walk')}
          className="btn btn-ghost text-[11px] py-1">
          Walk · {fmtSecs(walkMs)}
        </button>
        <button
          disabled={busy || !hasVehicle}
          onClick={() => onTravel(loc, 'drive')}
          title={hasVehicle ? '' : 'Park an active vehicle first'}
          className="btn btn-primary text-[11px] py-1 disabled:opacity-40 disabled:cursor-not-allowed">
          Drive · {fmtSecs(driveMs)}
        </button>
      </div>
    </div>
  );
}

function AroundTown() {
  const { refresh } = useGame();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState(null);
  const [clock, setClock] = useState(() => Date.now());

  async function load() {
    try { setData(await api.get('/locations')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  // While travelling, poll fast so the countdown looks live and we
  // catch arrival immediately. Otherwise idle.
  useEffect(() => {
    const i = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  const travellingUntil = data?.intra_travel_until;
  useEffect(() => {
    if (!travellingUntil) return;
    const i = setInterval(load, 1000);
    return () => clearInterval(i);
  }, [travellingUntil]);
  // On arrival flip-over, pull fresh character + locations.
  const arrivedRef = React.useRef(false);
  useEffect(() => {
    if (!travellingUntil) { arrivedRef.current = false; return; }
    if (clock >= travellingUntil && !arrivedRef.current) {
      arrivedRef.current = true;
      refresh?.();
      load();
    }
  }, [clock, travellingUntil, refresh]);

  async function startTravel(loc, mode) {
    setBusy(true); setMsg(null);
    try {
      await api.post('/locations/travel', { to: loc.slug, mode });
      await refresh?.();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }
  function enter(loc) { navigate(loc.route); }

  if (!data) return <p className="text-xs text-ink-100/55">Loading…</p>;

  const travelling = travellingUntil && travellingUntil > clock;
  const here = data.locations.find(l => l.here);

  // Live countdown to the destination, shared with the tile so it
  // ticks every 500ms without forcing every other tile to re-render.
  const travelMsLeft = travelling ? Math.max(0, travellingUntil - clock) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-100/10 bg-ink-900/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-ink-100/55">
            {travelling ? 'En route to' : 'You are at'}
          </div>
          {travelling ? (() => {
            const dest = data.locations.find(l => l.slug === data.intra_travel_to);
            const destName = dest?.name || (data.intra_travel_to || '').replace(/_/g, ' ');
            const verb = data.intra_travel_mode === 'drive' ? 'Driving' : 'Walking';
            const secs = Math.max(0, Math.ceil(travelMsLeft / 1000));
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            const clockTxt = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
            return (
              <>
                <div className="text-2xl font-display mt-0.5 text-cyan-200">{destName}</div>
                <p className="text-[12px] text-ink-100/55 mt-1">
                  {verb} · {clockTxt} to go · locked except for chat until you arrive.
                </p>
              </>
            );
          })() : (
            <>
              <div className="text-2xl font-display mt-0.5">{here?.name || 'On the streets'}</div>
              <p className="text-[12px] text-ink-100/55 mt-1">
                {data.has_vehicle ? 'Active vehicle parked nearby — driving available.' : 'No active vehicle — walking only.'}
              </p>
            </>
          )}
        </div>
        {!travelling && here?.gated && (
          <button
            onClick={() => enter(here)}
            className="btn btn-primary text-xs whitespace-nowrap shrink-0 w-full sm:w-auto">
            Enter {here.name} →
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-blood-300">{msg}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.locations
          .filter(l => l.slug !== 'streets')
          .map(loc => (
            <LocationTile
              key={loc.slug}
              loc={loc}
              hasVehicle={data.has_vehicle}
              walkMs={data.walk_ms}
              driveMs={data.drive_ms}
              busy={busy || !!travelling}
              onTravel={startTravel}
              onEnter={enter}
              travel={travelling && data.intra_travel_to === loc.slug
                ? { active: true, mode: data.intra_travel_mode, msLeft: travelMsLeft }
                : null}
            />
          ))}
      </div>
    </div>
  );
}


const CITY_DATA = {
  new_york:    { emoji: '', vibe: 'Concrete jungle. Big banks, big rents, bigger appetites.' },
  los_angeles: { emoji: '', vibe: 'Sun-bleached deals and Hollywood smiles. Everyone\'s working an angle.' },
  miami:       { emoji: '', vibe: 'Coke, sun, and Cubans. The 80s never ended.' },
  kingston:    { emoji: '', vibe: 'Reggae, rum, and ganja. Easy product, easygoing law.' },
  rio:         { emoji: '', vibe: 'Carnival energy, favela networks, cheap product.' },
  london:      { emoji: '', vibe: 'Old money, older syndicates. The financial heart of Europe.' },
  liverpool:   { emoji: '', vibe: 'Dockside firms and Scally networks. Cheap, scrappy, well-connected.' },
  paris:       { emoji: '', vibe: 'Couture on top, catacombs underneath.' },
  berlin:      { emoji: '', vibe: 'Cold concrete and warehouse beats. Weird, gritty, alive at 4am.' },
  moscow:      { emoji: '', vibe: 'Bratva country. Discreet money, quiet operators.' },
  dubai:       { emoji: '', vibe: 'Gold-plated playground. Demand is sky-high, so are flight prices.' },
  tokyo:       { emoji: '', vibe: 'Neon-lit and tightly run. Premium prices, premium pulls.' },
  hong_kong:   { emoji: '', vibe: 'Vertical money. Triads in the shadows, banks reaching the sky.' },
  sydney:      { emoji: '', vibe: 'Far from the heat. Premium inventory, isolated traders.' },
  cape_town:   { emoji: '', vibe: 'Untapped, unpredictable, undervalued.' },
};

function TerritoryCard({ characterCity, characterFaction }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get(`/areas/city/${characterCity}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [characterCity]);

  async function attempt(area) {
    setBusy(area.id); setMsg(null);
    try {
      const r = await api.post(`/areas/${area.id}/capture`, {});
      const atkLost = r.atkCasualties.length;
      const defLost = r.defCasualties.length;
      setMsg(
        (r.captured ? ` Captured ${area.name}.` : `Failed to take ${area.name}.`) +
        ` Atk ${r.atkPower} vs Def ${r.defPower} (${Math.round(r.winChance * 100)}%).` +
        ` Casualties — your side: ${atkLost}, enemy: ${defLost}.`
      );
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <Card title={`Areas in ${characterCity.replace(/_/g, ' ')}`}
      subtitle={`${data.total} sectors. Each area you hold gives your faction +5% on crimes, business and casino payouts in this city.`}>
      {data.yourFactionHolds > 0 && (
        <p className="text-xs text-money-300 mb-3">
          Your faction controls <b>{data.yourFactionHolds} / {data.total}</b> sectors here ({Math.round(data.yourFactionHolds * 5)}% bonus).
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {data.areas.map(a => (
          <div key={a.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 flex flex-col">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-sm">{a.name}</span>
              {a.faction
                ? <FactionBadge faction={a.faction} />
                : <span className="text-[12px] uppercase tracking-wide text-ink-100/45">Unclaimed</span>}
            </div>
            {a.flipped_at && Date.now() - a.flipped_at < 24*60*60*1000 && (
              <div className="text-[12px] text-yellow-400/85 mt-1"> Locked until UTC midnight</div>
            )}
            <button
              onClick={() => attempt(a)}
              disabled={busy === a.id}
              className="btn btn-primary text-xs w-full mt-3">
              {busy === a.id ? '…' : 'Attempt capture'}
            </button>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs mt-3 text-money-300 whitespace-pre-line">{msg}</p>}
    </Card>
  );
}

const TAB_PREF_KEY = 'mafia.cityTab';
const TABS = [
  { id: 'world',      label: 'World Map' },
  { id: 'map',        label: 'City Map' },
  { id: 'territory',  label: 'Territories' },
  { id: 'town',       label: 'Around Town' },
];
function readTabPref() {
  if (typeof window === 'undefined') return 'town';
  const v = window.localStorage.getItem(TAB_PREF_KEY);
  return TABS.some(t => t.id === v) ? v : 'town';
}

export default function City() {
  const { character } = useGame();
  const [worldCities, setWorldCities] = useState(null);
  const [tab, setTab] = useState(readTabPref);
  useEffect(() => {
    try { window.localStorage.setItem(TAB_PREF_KEY, tab); } catch {}
  }, [tab]);
  useEffect(() => {
    api.get('/world/cities').then(d => setWorldCities(d)).catch(() => {});
  }, []);
  if (!character) return null;
  const meta = CITY_DATA[character.city] || { emoji: '', vibe: '' };
  const cityName = character.city.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const totalOnline = worldCities?.cities.reduce((n, c) => n + (c.online || 0), 0) || 0;
  const totalPlayers = worldCities?.cities.reduce((n, c) => n + (c.players || 0), 0) || 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex-1 min-w-0">
          <div className="font-display text-3xl">{cityName}</div>
          <p className="text-xs text-ink-100/60">{meta.vibe}</p>
        </div>
        {(() => {
          const here = worldCities?.cities.find(c => c.id === character.city);
          if (!here) return null;
          const f = here.factions || {};
          const total = (f.fraudster || 0) + (f.mafia || 0) + (f.cartel || 0);
          if (total === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-ink-100/10 flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
              <span className="text-ink-100/50 uppercase text-[12px] tracking-wide">Factions in city</span>
              <span className="text-gold-400">Fraudster <b>{f.fraudster || 0}</b></span>
              <span className="text-blood-400">Mafia <b>{f.mafia || 0}</b></span>
              <span className="text-money-400">Cartel <b>{f.cartel || 0}</b></span>
            </div>
          );
        })()}
      </Card>

      <div className="flex flex-wrap gap-1 -mt-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`px-3 py-1.5 text-xs rounded-md transition ${
              tab === t.id
                ? 'bg-blood-700 text-white'
                : 'bg-ink-900/60 text-ink-100/70 hover:bg-ink-800/70'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <Card title="City Map" subtitle="Faction control of city areas. Switch to Around Town to walk into the buildings themselves.">
          <CityMap city={character.city} />
        </Card>
      )}

      {tab === 'town' && (
        <Card title="Around Town" subtitle="Pick a destination — every building is a real place now. Walking is slow; drive if you've got a vehicle.">
          <AroundTown />
        </Card>
      )}

      {tab === 'territory' && (
        <TerritoryCard characterCity={character.city} characterFaction={character.faction} />
      )}

      {tab === 'world' && (
        <Card
          title=" The world"
          subtitle={
            worldCities
              ? `${totalPlayers} players across ${worldCities.cities.length} cities · ${totalOnline} online now`
              : 'Worldwide player activity at a glance.'
          }>
          {!worldCities
            ? <p className="text-xs text-ink-100/55">Loading…</p>
            : <WorldMap cities={worldCities.cities} you={worldCities.you} />}
        </Card>
      )}
    </div>
  );
}
