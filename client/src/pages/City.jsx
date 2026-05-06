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
        <div className="text-[11px] text-ink-100/55 leading-snug mt-0.5">{blurb}</div>
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
  paris:       { emoji: '', vibe: 'Couture on top, catacombs underneath.' },
  berlin:      { emoji: '', vibe: 'Cold concrete and warehouse beats. Weird, gritty, alive at 4am.' },
  moscow:      { emoji: '', vibe: 'Bratva country. Discreet money, quiet operators.' },
  dubai:       { emoji: '', vibe: 'Gold-plated playground. Demand is sky-high, so are flight prices.' },
  tokyo:       { emoji: '', vibe: 'Neon-lit and tightly run. Premium prices, premium pulls.' },
  hong_kong:   { emoji: '', vibe: 'Vertical money. Triads in the shadows, banks reaching the sky.' },
  sydney:      { emoji: '', vibe: 'Far from the heat. Premium inventory, isolated traders.' },
  cape_town:   { emoji: '', vibe: 'Untapped, unpredictable, undervalued.' },
};

// Card showing the city's flagship territory — current holder, capture
// button (gated to officers/leaders of an aligned gang), and a hint
// about the bonus while held. Lives on the City page so it's the first
// thing players see when they land somewhere.
function TerritoryCard({ characterCity, characterFaction }) {
  const [terrs, setTerrs] = useState(null);
  const [you, setYou] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const r = await api.get(`/territories`);
      setTerrs(r.territories.filter(t => t.city === characterCity));
      setYou(r.you);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [characterCity]);

  async function attempt(t) {
    setBusy(t.id); setMsg(null);
    try {
      const r = await api.post(`/territories/${t.id}/capture`, {});
      setMsg(r.captured ? `Captured ${t.name}.` : `Failed — ${t.name} held.`);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!terrs) return null;
  if (terrs.length === 0) return null;

  // Officer/leader of an aligned gang can attempt; otherwise show why.
  const inGang = !!you?.gang;
  const role = you?.gang?.role;   // server returns row from gang_members JOIN
  const canAttack = inGang
    && (you.gang.faction)
    && (role === 'leader' || role === 'officer' || // we don't actually return role on /territories yet — leave permissive client-side; server still gates
        true);

  return (
    <Card title="City Territories"
      subtitle="Three locations per city. Hold them and faction members operating here earn the matching bonus.">
      <div className="grid sm:grid-cols-3 gap-3">
        {terrs.map(t => (
          <div key={t.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 flex flex-col">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{t.name}</span>
              {t.faction
                ? <FactionBadge faction={t.faction} />
                : <span className="text-[10px] uppercase tracking-wide text-ink-100/45">Unclaimed</span>}
            </div>
            <p className="text-[11px] text-ink-100/55 mt-1 flex-1">{t.blurb}</p>
            {t.bonus && (
              <div className="text-[10px] uppercase tracking-wide text-money-400 mt-2">
                +{Math.round(t.bonus.pct * 100)}% {bonusLabel(t.bonus.type)}
              </div>
            )}
            <div className="text-[11px] text-ink-100/55 mt-1">
              {t.gang
                ? <>Held by <Link to={`/gangs/${t.gang.id}`} className="text-blood-300 hover:underline">{t.gang.name} <span className="text-ink-100/45">[{t.gang.tag}]</span></Link></>
                : <span className="italic text-ink-100/40">Unclaimed.</span>}
            </div>
            {inGang ? (
              <button
                onClick={() => attempt(t)}
                disabled={busy === t.id}
                className="btn btn-primary text-xs w-full mt-3">
                {busy === t.id ? '…' : t.gang?.id === you.gang.id ? 'Already yours' : 'Attempt capture'}
              </button>
            ) : (
              <p className="text-[11px] text-ink-100/40 mt-3">Join a gang to fight for it.</p>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="text-xs mt-2 text-money-400">{msg}</p>}
    </Card>
  );
}

function bonusLabel(type) {
  switch (type) {
    case 'crime_cash': return 'crime cash';
    case 'gambling':   return 'gambling winnings';
    case 'business':   return 'business income';
    default:           return type;
  }
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
            <div className="mt-3 pt-3 border-t border-ink-100/10 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
              <span className="text-ink-100/50 uppercase text-[10px] tracking-wide">Factions in city</span>
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
