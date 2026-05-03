import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  cyber:  'Cybercrime',
  gta:    'Grand Theft Auto',
  major:  'Major Scores',
};
const TIER_ORDER  = ['street', 'cyber', 'gta', 'major'];

const TIER_SUBTITLES = {
  cyber: 'Intelligence-driven jobs. Lower energy cost, payouts scale with your INT.',
  gta:   'Steal a car. The vehicle IS the prize — sell it at the Chop Shop or keep it.',
};

// Two of the player-versus-player attack types live here as crimes,
// since they're felonies and each attempt lands the attacker in jail.
// Mutual combat (live PvP knockout in Fight Club) lives elsewhere.
function PlayerCrimes({ character }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(null);   // null | 'rob' | 'murder'
  const [players, setPlayers] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadPlayers() {
    setBusy(true);
    try {
      const r = await api.get('/players/search');
      // Show only same-city targets — server tags them with same_city.
      // Cross-city targets aren't actionable (rob/murder require same city)
      // and their location is private, so listing them would just confuse.
      setPlayers(r.players.filter(p => p.same_city && p.id !== character.id));
    } finally { setBusy(false); }
  }

  function toggle(which) {
    if (open === which) { setOpen(null); return; }
    setOpen(which);
    if (!players) loadPlayers();
  }

  return (
    <Card title="Player Crimes" subtitle="Felonies against another player. Every outcome lands you in jail — no exceptions.">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <button onClick={() => toggle('rob')}
          className={`text-left rounded-lg p-3 border transition ${open === 'rob' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
          <div className="font-medium">Rob a Player</div>
          <div className="text-[11px] text-ink-100/55 mt-1">
            Mug them on the spot. Win → all their cash on hand + hospitalised. Lose → caught.
          </div>
          <div className="text-[10px] text-ink-100/40 mt-1">10 energy · 1h cooldown · single roll</div>
        </button>
        <button onClick={() => toggle('murder')}
          className={`text-left rounded-lg p-3 border transition ${open === 'murder' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
          <div className="font-medium">Attempt Murder</div>
          <div className="text-[11px] text-ink-100/55 mt-1">
            Async hit. Pick bullets if you've got a gun. Permadeath on success — but jail either way.
          </div>
          <div className="text-[10px] text-ink-100/40 mt-1">25 energy · 24h cooldown · per-bullet hit rolls</div>
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] uppercase text-ink-100/55">
              Pick a target in your city
            </span>
            <button onClick={loadPlayers} disabled={busy}
              className="btn btn-ghost text-xs">↻ Refresh</button>
          </div>
          {!players ? (
            <p className="text-xs text-ink-100/55">Loading…</p>
          ) : players.length === 0 ? (
            <p className="text-xs text-ink-100/55">Nobody else in your city right now.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {players.map(p => (
                <button key={p.id} onClick={() => nav(`/${open}/${p.id}`)}
                  className="text-left rounded-md p-2 border border-ink-100/10 bg-ink-900/40 hover:border-blood-500/40 hover:bg-ink-900/70 transition">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-[10px] uppercase text-ink-100/40">L{p.at_max_level ? '999+' : p.level}</span>
                  </div>
                  <div className="text-[10px] text-ink-100/55 mt-0.5">{p.rank}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

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

  // Heat readout — colour shifts as the player heats up. Shown right at
  // the top so players see the cost of stacking attempts before they
  // fire off another one.
  const heat = character?.heat || 0;
  const heatColor =
    heat >= 70 ? 'text-blood-400'
    : heat >= 40 ? 'text-gold-400'
    : 'text-money-400';

  return (
    <div className="space-y-4">
      <Card title="Heat" subtitle="Each crime attracts attention. High heat shaves your success chance and bumps jail risk on failure. Decays ~1/min while you lay low.">
        <div className="flex items-baseline gap-3">
          <div className={`font-display text-3xl tabular-nums ${heatColor}`}>{heat}</div>
          <div className="text-[11px] text-ink-100/55 uppercase tracking-wide">/ 100</div>
        </div>
        <div className="h-1.5 mt-2 rounded-full bg-ink-100/10 overflow-hidden">
          <div
            className={
              heat >= 70 ? 'bg-blood-500 h-full' :
              heat >= 40 ? 'bg-gold-500 h-full' :
              'bg-money-500 h-full'
            }
            style={{ width: `${Math.min(100, heat)}%` }}
          />
        </div>
      </Card>
      {last && (
        <Card title="Last attempt">
          {last.error ? <p className="text-blood-400 text-sm">{last.error}</p> : (
            <div className="text-sm">
              {last.result.success && last.result.vehicle && (
                <p className="text-money-400"> {last.crime.name} succeeded — drove off in a <b>{last.result.vehicle.maker} {last.result.vehicle.name}</b> (Tier {last.result.vehicle.tier}, book {fmt(last.result.vehicle.bookPrice)}). +{last.result.xp}xp{last.result.levels ? ` · ↑${last.result.levels} level${last.result.levels>1?'s':''}!` : ''}</p>
              )}
              {last.result.success && !last.result.vehicle && <p className="text-money-400"> {last.crime.name} succeeded — +{fmt(last.result.payout)} {last.result.dirty ? '(dirty)' : ''} +{last.result.xp}xp{last.result.levels ? ` · ↑${last.result.levels} level${last.result.levels>1?'s':''}!` : ''}</p>}
              {last.result.success === false && last.result.jailed && <p className="text-yellow-400">Caught — jailed {last.result.jail_min} min.</p>}
              {last.result.success === false && last.result.hospital && <p className="text-blue-300">Hurt — hospital {last.result.hosp_min} min.</p>}
              {last.result.success === false && last.result.escaped && <p className="text-ink-100/70">Failed but escaped clean.</p>}
              {last.result.consumed?.length > 0 && (
                <p className="text-[11px] text-ink-100/50 mt-1">
                  Used up: {last.result.consumed.map(c => `${c.qty}× ${c.name}`).join(', ')}.
                </p>
              )}
            </div>
          )}
        </Card>
      )}
      <PlayerCrimes character={character} />

      {orderedTiers.map(tier => (
        <Card key={tier} title={TIER_TITLES[tier] || tier} subtitle={TIER_SUBTITLES[tier] || null}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[tier].map(c => {
              const onCd = !c.ready;
              const reqsMet = c.requirementsMet !== false;
              const cant = c.locked || character.energy < c.energy || onCd || !reqsMet;
              return (
                <div key={c.id} className={`rounded-lg p-3 border ${c.locked ? 'border-ink-100/5 opacity-60' : onCd ? 'border-ink-100/10 opacity-70' : 'border-ink-100/10'} bg-ink-950/40`}>
                  <div className="flex justify-between items-start">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-ink-100/50">Lvl {c.level}+</div>
                  </div>
                  <div className="text-[11px] text-ink-100/60 mt-1">
                    Energy {c.energy} · {c.tier === 'gta' ? `Tier ${c.vehicleTier} car` : `${fmt(c.min)}–${fmt(c.max)}`} · {c.xp}xp · risk: {c.risk}
                  </div>
                  <div className="text-[10px] text-ink-100/40 mt-0.5">cooldown {cooldownLabel(c.cooldownSec)}</div>
                  {c.requires?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.requires.map(r => (
                        <span key={r.item_id}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${r.ok ? 'border-money-500/40 text-money-300' : 'border-blood-500/50 text-blood-300'}`}
                          title={r.consumed ? 'Single-use — destroyed on commit.' : 'Required to commit.'}>
                          {r.consumed ? '× ' : ''}{r.name} {r.have}/{r.need}
                        </span>
                      ))}
                    </div>
                  )}
                  <button disabled={cant || busyId === c.id} onClick={() => commit(c)}
                    className="btn btn-primary w-full mt-3 text-xs">
                    {busyId === c.id
                      ? '...'
                      : c.locked
                        ? 'Locked'
                        : !reqsMet
                          ? 'Need items'
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
