import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import WorldMap from '../components/WorldMap.jsx';

const AROUND_TOWN = [
  { to: '/bank',       icon: '🏦', name: 'First National Bank',     blurb: 'Deposits, withdrawals, loans, hourly interest.' },
  { to: '/dealership', icon: '🏢', name: 'Premier Auto',             blurb: 'Showroom — buy any of 105 vehicles, titled and clean.' },
  { to: '/property',   icon: '🏘️', name: 'Estate Agent',             blurb: 'Flats, houses, mansions, compounds — passive bonuses.' },
  { to: '/gun-store',  icon: '🔫', name: 'Smokey\'s Gun Emporium',   blurb: 'Pistols, rifles, shotguns, snipers + ammo.' },
  { to: '/stocks',     icon: '📈', name: 'Stock Broker',             blurb: 'Live tickers — MetroBank, Titan Arms, SkyJet, Nova.' },
  { to: '/gym',        icon: '🏋️', name: 'Iron Foundry Gym',          blurb: '10 machines for strength, defence, speed — temporary buffs that decay.' },
  { to: '/range',      icon: '🎯', name: 'Linden Shooting Range',     blurb: 'Burn ammo to train accuracy. Boosts ranged hit chance, decays over time.' },
  { to: '/university', icon: '🏛️', name: 'Northbridge University',    blurb: 'Programmes that permanently raise intelligence.', hideWhen: c => c.intelligence >= (c.stat_caps?.intelligence || Infinity) },
  { to: '/general-store', icon: '🛒', name: "Murphy's General Store",   blurb: 'Odds, ends, and props. Most are mission gear; a few lift your mood.' },
  { to: '/businesses',    icon: '🏗️', name: 'Business Office',          blurb: 'Found new fronts and manage your empire.' },
  { to: '/shops',         icon: '🏪', name: 'Player Shops',             blurb: 'Browse player-run shops — or set up your own storefront.' },
  { to: '/travel',     icon: '✈️', name: 'International Airport',    blurb: 'Flights to 11 other cities — economy, business, first class.' },
  { to: '/hospital',   icon: '🏥', name: 'Saint Mary\'s Trauma Centre', blurb: 'Top up health on demand, or cover the bill for another patient.' },
  { to: '/jail',       icon: '🚓', name: 'City Holding Cells',         blurb: 'Visit the cells — bail a friend out, or risk a bust.' },
];

const UNDERWORLD = [
  { to: '/drugs',      icon: '💊', name: 'The Drug Market',          blurb: 'Buy low, fly elsewhere, sell high. Prices drift hourly.' },
  { to: '/chop-shop',  icon: '🪓', name: 'Chop Shop & Black Market', blurb: 'Move stolen vehicles fast (cheap) or via the dealer (risky).' },
  { to: '/casino',     icon: '🎰', name: 'The Lucky Crown Casino',   blurb: 'Roulette, blackjack, slots — try your luck against the house.' },
  { to: '/bookmaker',  icon: '📒', name: 'The Bookmaker',            blurb: 'Wager on football, boxing, horses and F1. ~8% house margin.' },
];

function Tile({ to, icon, name, blurb }) {
  return (
    <Link to={to}
      className="group flex gap-3 p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
      <div className="text-3xl shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-sm group-hover:text-blood-400 transition">{name}</div>
        <div className="text-[11px] text-ink-100/55 leading-snug mt-0.5">{blurb}</div>
      </div>
    </Link>
  );
}

const CITY_DATA = {
  new_york:  { emoji: '🗽', vibe: 'Concrete jungle. Big banks, big rents, bigger appetites.' },
  london:    { emoji: '🎡', vibe: 'Old money, older syndicates. The financial heart of Europe.' },
  tokyo:     { emoji: '🗼', vibe: 'Neon-lit and tightly run. Premium prices, premium pulls.' },
  dubai:     { emoji: '🏙️', vibe: 'Gold-plated playground. Demand is sky-high, so are flight prices.' },
  liverpool: { emoji: '⚓', vibe: 'Rough port city. Cheap to operate, low-key markets.' },
  miami:     { emoji: '🌴', vibe: 'Coke, sun, and Cubans. The 80s never ended.' },
  paris:     { emoji: '🗼', vibe: 'Couture on top, catacombs underneath.' },
  bangkok:   { emoji: '🛕', vibe: 'Wild markets, lax laws, bargain everything.' },
  sydney:    { emoji: '🦘', vibe: 'Far from the heat. Premium inventory, isolated traders.' },
  rio:       { emoji: '🏖️', vibe: 'Carnival energy, favela networks, cheap product.' },
  moscow:    { emoji: '☃️', vibe: 'Bratva country. Discreet money, quiet operators.' },
  cape_town: { emoji: '🦁', vibe: 'Untapped, unpredictable, undervalued.' },
  las_vegas:   { emoji: '🎲', vibe: 'Sin City. The Strip takes everything you\'ve got, and asks for more.' },
  hong_kong:   { emoji: '🐉', vibe: 'Vertical money. Triads in the shadows, banks reaching the sky.' },
  berlin:      { emoji: '🐻', vibe: 'Cold concrete and warehouse beats. Weird, gritty, alive at 4am.' },
  mexico_city: { emoji: '🌮', vibe: 'Sprawling capital. Cartel reach is long, prices are short.' },
  amsterdam:   { emoji: '🚲', vibe: 'Canals, coffee shops, and conveniently lax laws.' },
  detroit:     { emoji: '🏚️', vibe: 'Motor City ruins. Cheapest streets in the catalogue.' },
};

// Persist the world-map open/closed preference across visits. Default
// closed — the map is a "nice to have" surface; players who just want
// to dive into actions shouldn't have to scroll past it every time.
const MAP_PREF_KEY = 'mafia.cityMapOpen';
function readMapPref() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MAP_PREF_KEY) === '1';
}

export default function City() {
  const { character } = useGame();
  const [worldCities, setWorldCities] = useState(null);
  const [mapOpen, setMapOpen] = useState(readMapPref);
  useEffect(() => {
    api.get('/world/cities').then(d => setWorldCities(d)).catch(() => {});
  }, []);
  function toggleMap() {
    setMapOpen(v => {
      const next = !v;
      try { window.localStorage.setItem(MAP_PREF_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }
  if (!character) return null;
  const meta = CITY_DATA[character.city] || { emoji: '🏙️', vibe: '' };
  const cityName = character.city.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // One-line summary shown when the map is collapsed.
  const totalOnline = worldCities?.cities.reduce((n, c) => n + (c.online || 0), 0) || 0;
  const totalPlayers = worldCities?.cities.reduce((n, c) => n + (c.players || 0), 0) || 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline gap-3">
          <div className="text-4xl">{meta.emoji}</div>
          <div>
            <div className="font-display text-3xl">{cityName}</div>
            <p className="text-xs text-ink-100/60">{meta.vibe}</p>
          </div>
        </div>
      </Card>

      <Card
        title="🌍 The world"
        subtitle={mapOpen
          ? "Hover a city to see who's around. Yellow is where you stand; red dots are cities with players online."
          : worldCities
            ? `${totalPlayers} players across ${worldCities.cities.length} cities · ${totalOnline} online now`
            : 'Worldwide player activity at a glance.'}
        right={
          <button
            type="button"
            onClick={toggleMap}
            aria-expanded={mapOpen}
            className="btn btn-ghost text-xs">
            {mapOpen ? 'Hide ▲' : 'Show map ▼'}
          </button>
        }>
        {mapOpen && (
          !worldCities ? (
            <p className="text-xs text-ink-100/55">Loading…</p>
          ) : (
            <WorldMap cities={worldCities.cities} you={worldCities.you} />
          )
        )}
      </Card>

      <Card title="Around Town" subtitle="Legitimate businesses you can walk into.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AROUND_TOWN.filter(l => !l.hideWhen?.(character)).map(l => <Tile key={l.to} {...l} />)}
        </div>
      </Card>

      <Card title="The Underworld" subtitle="Quieter places. Don't bring your accountant.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {UNDERWORLD.filter(l => !l.hideWhen?.(character)).map(l => <Tile key={l.to} {...l} />)}
        </div>
      </Card>
    </div>
  );
}
