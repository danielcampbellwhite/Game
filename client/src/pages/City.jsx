import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import WorldMap from '../components/WorldMap.jsx';
import CityMap from '../components/CityMap.jsx';
import FactionBadge from '../components/FactionBadge.jsx';

// Quick links to "anywhere" services — pages you don't need to
// physically be in a specific building to use. Kept separate from
// the location tiles so the travel UX stays focused on real
// destinations.
const ANYWHERE_LINKS = [
  { to: '/stocks',     name: 'Stock Broker',    blurb: 'Live tickers. Trade from anywhere.' },
  { to: '/property',   name: 'Estate Agent',    blurb: 'Buy / browse / sell — all online.' },
  { to: '/newspaper',  name: 'The City Gazette', blurb: 'Today\'s front page and the police blotter.' },
  { to: '/travel',     name: 'Airport',         blurb: 'Flights to other cities.' },
  { to: '/shop/coffee',     name: 'Coffee Shop',     blurb: 'Espresso, energy drinks — quick energy.' },
  { to: '/shop/pharmacy',   name: 'Pharmacy',        blurb: 'First aid, painkillers, vitamins.' },
  { to: '/shop/off_licence',name: 'Off-Licence',     blurb: 'Booze and cigars.' },
  { to: '/shop/deli',       name: 'Late-Night Deli', blurb: 'Energy + a side of happiness.' },
  { to: '/shop/gift_shop',  name: 'Gift Shop',       blurb: 'Flowers, chocolates, tickets.' },
];

function fmtSecs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

function LocationTile({ loc, hasVehicle, walkMs, driveMs, busy, onTravel, onEnter }) {
  if (loc.here) {
    return (
      <div className="p-3 rounded-lg border border-money-500/40 bg-money-700/10 flex flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm text-money-300">{loc.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-money-400">You're here</span>
        </div>
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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-100/10 bg-ink-900/40 p-3">
        {travelling ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-cyan-300">
              {data.intra_travel_mode === 'drive' ? 'Driving' : 'Walking'} to {data.intra_travel_to?.replace(/_/g, ' ')}
            </div>
            <div className="text-2xl font-display mt-1 text-cyan-200 tabular-nums">
              {fmtSecs(travellingUntil - clock)}
            </div>
            <p className="text-[12px] text-ink-100/55 mt-1">Locked except for chat until you arrive.</p>
          </div>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-100/55">You are at</div>
            <div className="text-2xl font-display mt-0.5">{here?.name || 'On the streets'}</div>
            <p className="text-[12px] text-ink-100/55 mt-1">
              {data.has_vehicle ? 'Active vehicle parked nearby — driving available.' : 'No active vehicle — walking only.'}
            </p>
          </div>
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
            />
          ))}
      </div>

      <div className="pt-2">
        <div className="text-[12px] uppercase tracking-wide text-ink-100/45 mb-2">Available from anywhere</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ANYWHERE_LINKS.map(l => (
            <Link key={l.to} to={l.to}
              className="group flex p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
              <div className="min-w-0">
                <div className="font-medium text-sm group-hover:text-blood-400 transition">{l.name}</div>
                <div className="text-[13px] text-ink-100/55 leading-snug mt-0.5">{l.blurb}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const UNDERWORLD = [
  { to: '/drugs',      slug: null,        name: 'The Drug Market',          blurb: 'Sell drugs you produced in your labs. Prices drift hourly per city — bust risk scales with the size of the flip.' },
  { to: '/burglary',   slug: null,        name: 'Break and Enter',          blurb: 'Crack another player\'s home in this city. Roll your stealth against their installed defences — clean wins skim cash from their wallet.' },
  { to: '/chop-shop',  slug: 'chop_shop', name: 'Chop Shop & Black Market', blurb: 'Move stolen vehicles fast (cheap) or via the dealer (risky).' },
  { to: '/fence',      slug: 'fence',     name: 'The Fence',                blurb: 'Wash illegal cash into legal at 70% — your relationship with the local fence buys you a few extra points.' },
  { to: '/casino',     slug: 'casino',    name: 'The Lucky Crown Casino',   blurb: 'Roulette, blackjack, slots — try your luck against the house. Open afternoons through to early morning.' },
  { to: '/bookmaker',  slug: 'bookmaker', name: 'The Bookmaker',            blurb: 'Wager on football, boxing, horses and F1. ~8% house margin.' },
];

// Plain navigation tile — used for underworld features that aren't
// gated to a specific in-city building (Drug Market, Break and Enter).
function Tile({ to, name, blurb }) {
  return (
    <Link to={to}
      className="group flex p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
      <div className="min-w-0">
        <div className="font-medium text-sm group-hover:text-blood-400 transition">{name}</div>
        <div className="text-[13px] text-ink-100/55 leading-snug mt-0.5">{blurb}</div>
      </div>
    </Link>
  );
}

// Wraps the Underworld tile grid with a single /api/locations fetch
// so all the gated tiles share one travel state. Mirrors the
// Around Town pattern — tiles whose `slug` matches an in-city
// building behave like LocationTile (Walk/Drive/Enter); tiles with
// no slug are plain Link navigations.
function UnderworldTiles({ entries }) {
  const { refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState(null);
  const [clock, setClock] = useState(() => Date.now());

  async function load() {
    try { setData(await api.get('/locations')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  const travellingUntil = data?.intra_travel_until;
  useEffect(() => {
    const i = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!travellingUntil) return;
    const i = setInterval(load, 1000);
    return () => clearInterval(i);
  }, [travellingUntil]);
  const arrivedRef = React.useRef(false);
  useEffect(() => {
    if (!travellingUntil) { arrivedRef.current = false; return; }
    if (clock >= travellingUntil && !arrivedRef.current) {
      arrivedRef.current = true;
      refresh?.();
      load();
    }
  }, [clock, travellingUntil, refresh]);

  async function startTravel(slug, mode) {
    setBusy(true); setMsg(null);
    try {
      await api.post('/locations/travel', { to: slug, mode });
      await refresh?.();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  const travelling = !!(travellingUntil && travellingUntil > clock);
  const hasVehicle = !!data?.has_vehicle;

  return (
    <>
      {msg && <p className="text-xs text-blood-300 mb-2">{msg}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(e => e.slug
          ? <UnderworldLocationTile
              key={e.to}
              entry={e}
              data={data}
              busy={busy}
              travelling={travelling}
              hasVehicle={hasVehicle}
              clock={clock}
              onTravel={startTravel} />
          : <Tile key={e.to} {...e} />
        )}
      </div>
    </>
  );
}

function UnderworldLocationTile({ entry, data, busy, travelling, hasVehicle, clock, onTravel }) {
  const navigate = useNavigate();
  const here = data?.locations?.find(l => l.slug === entry.slug);
  const youAreHere = !!here?.here;
  const travellingHere = travelling && data?.intra_travel_to === entry.slug;
  const travellingUntil = data?.intra_travel_until;

  return (
    <div className={`p-3 rounded-lg border flex flex-col gap-2 transition ${
      youAreHere
        ? 'border-money-500/40 bg-money-700/10'
        : 'border-ink-100/10 bg-ink-950/40'
    }`}>
      <div className="min-w-0">
        <div className={`font-medium text-sm ${youAreHere ? 'text-money-300' : ''}`}>{entry.name}</div>
        <div className="text-[13px] text-ink-100/55 leading-snug mt-0.5">{entry.blurb}</div>
      </div>
      {youAreHere ? (
        <button onClick={() => navigate(entry.to)} className="btn btn-primary text-xs">
          Enter
        </button>
      ) : travellingHere ? (
        <div className="text-[12px] text-cyan-300 tabular-nums">
          {data?.intra_travel_mode === 'drive' ? 'Driving' : 'Walking'} over · {fmtSecs(travellingUntil - clock)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            disabled={busy || travelling}
            onClick={() => onTravel(entry.slug, 'walk')}
            className="btn btn-ghost text-[11px] py-1 disabled:opacity-40">
            Walk · {fmtSecs(data?.walk_ms ?? 45000)}
          </button>
          <button
            disabled={busy || travelling || !hasVehicle}
            onClick={() => onTravel(entry.slug, 'drive')}
            title={hasVehicle ? '' : 'Park an active vehicle first'}
            className="btn btn-primary text-[11px] py-1 disabled:opacity-40 disabled:cursor-not-allowed">
            Drive · {fmtSecs(data?.drive_ms ?? 10000)}
          </button>
        </div>
      )}
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
  { id: 'underworld', label: 'Underworld' },
];
function readTabPref() {
  if (typeof window === 'undefined') return 'map';
  const v = window.localStorage.getItem(TAB_PREF_KEY);
  return TABS.some(t => t.id === v) ? v : 'map';
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
        <Card title="City Map" subtitle="Tap a marker to walk in. Gold pins are legitimate businesses; red are the underworld.">
          <CityMap city={character.city} />
        </Card>
      )}

      {tab === 'town' && (
        <Card title="Around Town" subtitle="Pick a destination — every building is a real place now. Walking is slow; drive if you've got a vehicle.">
          <AroundTown />
        </Card>
      )}

      {tab === 'underworld' && (
        <Card title="The Underworld" subtitle="Quieter places. Don't bring your accountant. Most spots are real buildings — walk or drive over before you can do business.">
          <UnderworldTiles entries={UNDERWORLD.filter(l => !l.hideWhen?.(character))} />
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
