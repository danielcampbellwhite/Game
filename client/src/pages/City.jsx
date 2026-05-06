import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import WorldMap from '../components/WorldMap.jsx';
import CityMap from '../components/CityMap.jsx';
import FactionBadge from '../components/FactionBadge.jsx';

const AROUND_TOWN = [
  { to: '/bank',       icon: '', name: 'Bank',                     blurb: 'Deposits, withdrawals, loans, hourly interest.' },
  { to: '/dealership', icon: '', name: 'Car Dealership',           blurb: 'Showroom — buy any of 105 vehicles, titled and clean.' },
  { to: '/repair',     icon: '', name: 'Repair Shop',               blurb: 'Patch up your active car — cost scales with damage and book value.' },
  { to: '/property',   icon: '', name: 'Estate Agent',             blurb: 'Flats, houses, mansions, compounds — passive bonuses.' },
  { to: '/gun-store',  icon: '', name: 'Weapon Dealer',            blurb: 'Pistols, rifles, shotguns, snipers + ammo.' },
  { to: '/stocks',     icon: '', name: 'Stock Broker',             blurb: 'Live tickers — MetroBank, Titan Arms, SkyJet, Nova.' },
  { to: '/gym',        icon: '', name: 'Gym',                      blurb: '10 machines for strength, defence, speed — temporary buffs that decay.' },
  { to: '/range',      icon: '', name: 'Shooting Range',           blurb: 'Burn ammo to train accuracy. Boosts ranged hit chance, decays over time.' },
  { to: '/university', icon: '', name: 'University',               blurb: 'Programmes that permanently raise intelligence.', hideWhen: c => c.intelligence >= (c.stat_caps?.intelligence || Infinity) },
  { to: '/driving-school', icon: '', name: 'Driving School',       blurb: 'Train your driving skill — boosts race odds and lessens car wear.', hideWhen: c => (c.driving || 1) >= (c.stat_caps?.driving || Infinity) },
  { to: '/general-store', icon: '', name: 'General Store',         blurb: 'Odds, ends, and props. Most are mission gear; a few lift your mood.' },
  { to: '/shop/coffee',     icon: '', name: 'Coffee Shop',           blurb: 'Espresso, energy drinks, pre-workout — quick energy refuels.' },
  { to: '/shop/pharmacy',   icon: '', name: 'Pharmacy',              blurb: 'First aid, painkillers, vitamins — patch up between runs.' },
  { to: '/shop/off_licence',icon: '', name: 'Off-Licence',           blurb: 'Booze and cigars — nerve, happiness, sometimes a health hit.' },
  { to: '/shop/deli',       icon: '', name: 'Late-Night Deli',       blurb: 'Sandwiches, pizza, sushi — energy and a side of happiness.' },
  { to: '/shop/gift_shop',  icon: '', name: 'Gift Shop',             blurb: 'Flowers, chocolates, tickets. For when somebody needs cheering up.' },
  { to: '/travel',     icon: '', name: 'Airport',                  blurb: 'Flights to 11 other cities — economy, business, first class.' },
  { to: '/hospital',   icon: '', name: 'Hospital',                 blurb: 'Top up health on demand, or cover the bill for another patient.' },
  { to: '/jail',       icon: '', name: 'Jail',                     blurb: 'Visit the cells — bail a friend out, or risk a bust.' },
];

const UNDERWORLD = [
  { to: '/drugs',      icon: '', name: 'The Drug Market',          blurb: 'Sell drugs you produced in your labs. Prices drift hourly per city — bust risk scales with the size of the flip.' },
  { to: '/chop-shop',  icon: '', name: 'Chop Shop & Black Market', blurb: 'Move stolen vehicles fast (cheap) or via the dealer (risky).' },
  { to: '/fence',      icon: '', name: 'The Fence',                blurb: 'Wash illegal cash into legal at 70% — sting risk if you push it.' },
  { to: '/casino',     icon: '', name: 'The Lucky Crown Casino',   blurb: 'Roulette, blackjack, slots — try your luck against the house.' },
  { to: '/bookmaker',  icon: '', name: 'The Bookmaker',            blurb: 'Wager on football, boxing, horses and F1. ~8% house margin.' },
];

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

// Renders the area-control summary for the player's current city.
// One row per polygon area; shows current controlling faction +
// gang and a button to attempt capture. The map view at /city ?
// tab=map overlays the same data on real OSM streets.
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

// Persist the active tab across visits. Default to "town" — the
// Persist the active tab across visits. City Map opens by default —
// the visual map is the most compact way to spot every venue at a
// glance; the text grids stay around for accessibility / quick scan.
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

  // World-map header summary (used in the World tab).
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
          // Faction headcount in your current city — quick read on who
          // dominates the streets you're walking.
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
        <Card title="Around Town" subtitle="Legitimate businesses you can walk into.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AROUND_TOWN.filter(l => !l.hideWhen?.(character)).map(l => <Tile key={l.to} {...l} />)}
          </div>
        </Card>
      )}

      {tab === 'underworld' && (
        <Card title="The Underworld" subtitle="Quieter places. Don't bring your accountant.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {UNDERWORLD.filter(l => !l.hideWhen?.(character)).map(l => <Tile key={l.to} {...l} />)}
          </div>
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
