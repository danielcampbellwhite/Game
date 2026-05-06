import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';

// Cosmetic prettifier — "new_york" → "New York".
function cityLabel(slug) {
  return (slug || '').split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

export default function Wars() {
  const { character } = useGame();
  const [areas, setAreas] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try { const r = await api.get('/areas'); setAreas(r.areas || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  if (!character) return null;
  const myGangId = character.gang?.id;

  // Group every area by city, separating "ours" from "theirs" so each
  // city card can advertise both presence and active resistance.
  const byCity = (areas || []).reduce((m, a) => {
    if (!m[a.city]) m[a.city] = { ours: [], theirs: [], total: 0 };
    m[a.city].total += 1;
    if (myGangId && a.gang_id === myGangId) m[a.city].ours.push(a);
    else if (a.gang_id) m[a.city].theirs.push(a);
    return m;
  }, {});

  // The user only wants cities where their gang has at least one
  // sector — these are the "live theatres of war".
  const activeCities = Object.entries(byCity)
    .filter(([, d]) => d.ours.length > 0)
    .sort(([, a], [, b]) => b.ours.length - a.ours.length);

  return (
    <div className="space-y-4">
      <Card title=" Turf Wars"
        subtitle="Cities where your gang holds territory. Click through to the city map to defend, attack neighbouring sectors, or push deeper.">
        {err && <p className="text-xs text-blood-400">{err}</p>}
        {!myGangId ? (
          <p className="text-sm text-ink-100/65">
            You're not in a gang. <Link to="/gangs" className="text-blood-300 underline">Join one</Link> to start fighting for territory on the city maps.
          </p>
        ) : !areas ? (
          <p className="text-sm text-ink-100/55">Loading…</p>
        ) : activeCities.length === 0 ? (
          <p className="text-sm text-ink-100/65">
            Your gang doesn't hold any sectors yet. Open the <Link to="/city" className="text-blood-300 underline">city map</Link> and plant a flag on an unclaimed area.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-100/50">
              {activeCities.length} active theatre{activeCities.length === 1 ? '' : 's'} ·
              {' '}{activeCities.reduce((n, [, d]) => n + d.ours.length, 0)} sector{activeCities.reduce((n, [, d]) => n + d.ours.length, 0) === 1 ? '' : 's'} controlled
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {activeCities.map(([cityId, d]) => (
                <CityWarCard key={cityId} cityId={cityId} d={d} hereNow={character.city === cityId} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function CityWarCard({ cityId, d, hereNow }) {
  const contested = d.theirs.length;
  const yours = d.ours.length;
  const ratio = Math.round((yours / d.total) * 100);
  return (
    <Link to="/city" state={{ tab: 'map' }}
      className="block rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium">{cityLabel(cityId)}</div>
        {hereNow && <span className="text-[12px] uppercase tracking-wide text-money-300">You're here</span>}
      </div>
      <div className="text-[13px] text-ink-100/65 mt-1">
        Holding <b className="text-money-400">{yours}</b> of <b>{d.total}</b> sectors
        <span className="text-ink-100/45"> ({ratio}%)</span>
      </div>
      {contested > 0 ? (
        <div className="text-[13px] text-blood-300 mt-1">
           {contested} rival sector{contested === 1 ? '' : 's'} in this city — actively contested
        </div>
      ) : (
        <div className="text-[13px] text-ink-100/45 mt-1">No rival presence here. Hold the line.</div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {d.ours.slice(0, 6).map(a => (
          <span key={a.id} className="text-[12px] uppercase tracking-wide rounded-sm bg-money-600/15 border border-money-500/40 text-money-300 px-1.5 py-0.5">
            {a.name}
          </span>
        ))}
        {d.ours.length > 6 && (
          <span className="text-[12px] text-ink-100/45 self-center">+{d.ours.length - 6} more</span>
        )}
      </div>
    </Link>
  );
}
