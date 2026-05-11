import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Daily noir-styled front page summarising the last 24h of a city's
// activity. All copy comes from the server (see routes/newspaper.js)
// so the client is mostly layout + flavour styling.

const FACTION_COLOURS = {
  fraudster: 'text-gold-400',
  mafia:     'text-blood-400',
  cartel:    'text-money-400',
  unclaimed: 'text-ink-100/45',
};

function relativeTime(ts) {
  const dt = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (dt < 60)    return `${dt}s ago`;
  if (dt < 3600)  return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}

export default function Newspaper() {
  const { character } = useGame();
  const [data, setData] = useState(null);
  const [city, setCity] = useState(null);

  async function load(targetCity) {
    const q = targetCity ? `?city=${encodeURIComponent(targetCity)}` : '';
    setData(await api.get(`/newspaper${q}`));
  }
  useEffect(() => { load(city); }, [city]);
  useEffect(() => { if (!city && character?.city) setCity(character.city); }, [character?.city]);

  if (!data) return null;

  const localHH = String(data.localTime.hour).padStart(2, '0');
  const localMM = String(data.localTime.minute).padStart(2, '0');

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card>
        <div className="text-center border-b border-ink-100/15 pb-3 mb-3">
          <div className="font-display text-3xl sm:text-5xl tracking-wider uppercase">The {data.cityName} Gazette</div>
          <div className="text-[12px] text-ink-100/55 mt-1 flex justify-center flex-wrap gap-x-3">
            <span>{data.date}</span>
            <span>· {data.weather}</span>
            <span>· Local time {localHH}:{localMM} ({data.localTime.bucketLabel})</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3 text-[12px]">
            {data.citiesAvailable.map(c => (
              <button key={c.id}
                onClick={() => setCity(c.id)}
                className={`uppercase tracking-wider px-2 py-0.5 rounded ${
                  c.id === data.city
                    ? 'bg-blood-700 text-white'
                    : 'text-ink-100/55 hover:text-ink-100/85'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        <Card title="Front Page" subtitle="The day's notable activity." className="md:col-span-2">
          {data.headlines.length === 0 ? (
            <p className="text-xs text-ink-100/55">A quiet day on the streets.</p>
          ) : (
            <div className="space-y-2">
              {data.headlines.map((h, i) => (
                <div key={i} className="border-l-2 border-blood-500/40 pl-3 py-1">
                  <div className="text-[10px] uppercase tracking-wider text-ink-100/45">
                    {h.type === 'crime' ? 'Crime' : h.type === 'turf' ? 'Turf' : h.type === 'casino' ? 'Vice' : 'Wire'}
                    <span className="ml-2 text-ink-100/35">{relativeTime(h.when)}</span>
                  </div>
                  <div className="text-sm text-ink-100/85 mt-0.5">{h.text}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card title="Top Earners" subtitle="By gross take, 24h.">
            {data.earners.length === 0
              ? <p className="text-xs text-ink-100/55">No major scores reported.</p>
              : (
                <ol className="space-y-1">
                  {data.earners.map((e, i) => (
                    <li key={i} className="flex justify-between text-[13px]">
                      <span className="truncate text-ink-100/85">{i + 1}. {e.name}</span>
                      <span className="text-money-400 tabular-nums shrink-0">{fmt(e.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
          </Card>

          <Card title="Turf Control" subtitle={`${data.turf.total} sectors`}>
            <div className="space-y-1 text-[13px]">
              {Object.entries(data.turf.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([fid, n]) => {
                  const pct = Math.round((n / data.turf.total) * 100);
                  return (
                    <div key={fid}>
                      <div className="flex justify-between">
                        <span className={`capitalize ${FACTION_COLOURS[fid] || 'text-ink-100/70'}`}>{fid}</span>
                        <span className="text-ink-100/55 tabular-nums">{n}/{data.turf.total} · {pct}%</span>
                      </div>
                      <div className="h-1 rounded bg-ink-100/10 overflow-hidden mt-0.5">
                        <div className={`h-full ${
                          fid === 'fraudster' ? 'bg-gold-400'
                          : fid === 'mafia'   ? 'bg-blood-500'
                          : fid === 'cartel'  ? 'bg-money-500'
                          : 'bg-slate-400'
                        }`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
            <Link to="/city" className="block text-[11px] text-blood-300 hover:underline mt-2">View the map →</Link>
          </Card>

          <Card title="Police Blotter" subtitle="Last 24h.">
            <div className="text-[13px] space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-100/70">Arrests</span>
                <span className="text-yellow-400 tabular-nums">{data.blotter.jailings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-100/70">Hospitalised</span>
                <span className="text-blue-300 tabular-nums">{data.blotter.hospital}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
