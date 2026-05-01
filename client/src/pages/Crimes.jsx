import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

function cooldownLabel(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

const TIER_TITLES = {
  street: 'Street Crimes',
  cyber:  '💻 Cybercrime',
  gta:    '🚗 Grand Theft Auto',
  major:  'Major Scores',
};
const TIER_ORDER  = ['street', 'cyber', 'gta', 'major'];

const TIER_SUBTITLES = {
  cyber: 'Intelligence-driven jobs. Lower energy cost, payouts scale with your INT.',
  gta:   'Steal a car. The vehicle IS the prize — sell it at the Chop Shop or keep it.',
};

export default function Crimes() {
  const { character, refresh, updateFromResponse } = useGame();
  const [list, setList] = useState([]);
  const [last, setLast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() { const d = await api.get('/crimes'); setList(d.crimes); }
  useEffect(() => { load(); }, []);

  async function commit(crime) {
    setBusyId(crime.id);
    try {
      const r = await api.post('/crimes/commit', { crime_id: crime.id });
      updateFromResponse(r);
      setLast({ crime, result: r });
      await refresh();
      await load();
    } catch (e) { setLast({ crime, error: e.message }); }
    finally {
      setBusyId(null);
      // Scroll to top so the result card is visible regardless of which
      // crime tier the player clicked from.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const grouped = list.reduce((m, c) => ((m[c.tier] = m[c.tier] || []).push(c), m), {});
  const orderedTiers = TIER_ORDER.filter(t => grouped[t]);

  return (
    <div className="space-y-4">
      {last && (
        <Card title="Last attempt">
          {last.error ? <p className="text-blood-400 text-sm">{last.error}</p> : (
            <div className="text-sm">
              {last.result.success && last.result.vehicle && (
                <p className="text-money-400">✅ {last.crime.name} succeeded — drove off in a <b>{last.result.vehicle.maker} {last.result.vehicle.name}</b> (Tier {last.result.vehicle.tier}, book {fmt(last.result.vehicle.bookPrice)}). +{last.result.xp}xp{last.result.levels ? ` · ↑${last.result.levels} level${last.result.levels>1?'s':''}!` : ''}</p>
              )}
              {last.result.success && !last.result.vehicle && <p className="text-money-400">✅ {last.crime.name} succeeded — +{fmt(last.result.payout)} {last.result.dirty ? '(dirty)' : ''} +{last.result.xp}xp{last.result.levels ? ` · ↑${last.result.levels} level${last.result.levels>1?'s':''}!` : ''}</p>}
              {last.result.success === false && last.result.jailed && <p className="text-yellow-400">🚓 Caught — jailed {last.result.jail_min} min.</p>}
              {last.result.success === false && last.result.hospital && <p className="text-blue-300">🏥 Hurt — hospital {last.result.hosp_min} min.</p>}
              {last.result.success === false && last.result.escaped && <p className="text-ink-100/70">💨 Failed but escaped clean.</p>}
            </div>
          )}
        </Card>
      )}
      {orderedTiers.map(tier => (
        <Card key={tier} title={TIER_TITLES[tier] || tier} subtitle={TIER_SUBTITLES[tier] || null}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[tier].map(c => {
              const onCd = !c.ready;
              const cant = c.locked || character.energy < c.energy || character.nerve < c.nerve || onCd;
              return (
                <div key={c.id} className={`rounded-lg p-3 border ${c.locked ? 'border-ink-100/5 opacity-60' : onCd ? 'border-ink-100/10 opacity-70' : 'border-ink-100/10'} bg-ink-950/40`}>
                  <div className="flex justify-between items-start">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-ink-100/50">Lvl {c.level}+</div>
                  </div>
                  <div className="text-[11px] text-ink-100/60 mt-1">
                    Energy {c.energy}{c.nerve ? ` · Nerve ${c.nerve}` : ''} · {c.tier === 'gta' ? `Tier ${c.vehicleTier} car` : `${fmt(c.min)}–${fmt(c.max)}`} · {c.xp}xp · risk: {c.risk}
                  </div>
                  <div className="text-[10px] text-ink-100/40 mt-0.5">cooldown {cooldownLabel(c.cooldownSec)}</div>
                  <button disabled={cant || busyId === c.id} onClick={() => commit(c)}
                    className="btn btn-primary w-full mt-3 text-xs">
                    {busyId === c.id
                      ? '...'
                      : c.locked
                        ? 'Locked'
                        : onCd
                          ? <>Ready in <Timer until={c.cooldownUntil} onExpire={load} /></>
                          : 'Attempt'}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
