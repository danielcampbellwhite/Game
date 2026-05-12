import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import LockBadge from '../components/LockBadge.jsx';
import PoliceChase from '../components/PoliceChase.jsx';
import { fmt } from '../components/Money.jsx';
import { playCrimeSound } from '../services/sounds.js';

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
  gta:   'Steal a car. The vehicle IS the prize — sell it at the Chop Shop or keep it. Caught? You\'ll get a chance to outrun the cops.',
};

function PlayerCrimes({ character }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(null);
  const [players, setPlayers] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadPlayers() {
    setBusy(true);
    try {
      const r = await api.get('/players/search');
      setPlayers(r.players.filter(p => p.same_city && p.id !== character.id));
    } finally { setBusy(false); }
  }

  function toggle(which) {
    if (open === which) { setOpen(null); return; }
    setOpen(which);
    if (!players) loadPlayers();
  }

  return (
    <Card title="Player Crimes" subtitle="Felonies against another player. Every outcome lands you in jail — no exceptions." collapsible>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <button onClick={() => toggle('rob')}
          className={`text-left rounded-lg p-3 border transition ${open === 'rob' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
          <div className="font-medium">Rob a Player</div>
          <div className="text-[13px] text-ink-100/55 mt-1">
            Mug them on the spot. Win → all their cash on hand + hospitalised. Lose → caught.
          </div>
          <div className="text-[12px] text-ink-100/40 mt-1">10 energy · 1h cooldown · single roll</div>
        </button>
        <button onClick={() => toggle('murder')}
          className={`text-left rounded-lg p-3 border transition ${open === 'murder' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
          <div className="font-medium">Attempt Murder</div>
          <div className="text-[13px] text-ink-100/55 mt-1">
            Async hit. Pick bullets if you've got a gun. Permadeath on success — but jail either way.
          </div>
          <div className="text-[12px] text-ink-100/40 mt-1">25 energy · 24h cooldown · per-bullet hit rolls</div>
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[12px] uppercase text-ink-100/55">
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
                    <span className="text-[12px] uppercase text-ink-100/40">L{p.level}</span>
                  </div>
                  <div className="text-[12px] text-ink-100/55 mt-0.5">{p.rank}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DailyContractBanner({ character, onChange }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get('/contracts')); }
    catch { /* swallow — banner is optional */ }
  }
  useEffect(() => { load(); }, []);

  async function attempt() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/contracts/attempt');
      setMsg(r.success
        ? `+${fmt(r.payout)} (3× tip) — contract done.`
        : `Job blew up — ${r.jailMin}m inside.`);
      await load();
      await onChange?.();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!data?.contract) return null;
  const c = data.contract;
  const inCity = character?.city === c.city;
  const closed = c.status !== 'open';
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="text-2xl shrink-0"></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-[12px] uppercase tracking-wide text-yellow-300">Daily Contract · Anonymous tip</span>
            {closed && <span className="text-[12px] uppercase tracking-wide text-ink-100/45">{c.status}</span>}
          </div>
          <div className="font-medium mt-0.5">{c.crime.name} · <span className="text-ink-100/55">{c.cityName}</span></div>
          <div className="text-[13px] text-ink-100/65 mt-0.5">
            {fmt(c.minPayout)}–{fmt(c.maxPayout)} (3× normal) · {c.crime.energy} energy · risk {c.crime.risk}
          </div>
          {msg && <p className="text-[13px] text-money-300 mt-1">{msg}</p>}
          {!closed && (
            <button onClick={attempt}
              disabled={busy || !inCity || (character?.energy || 0) < c.crime.energy}
              className="btn btn-money text-xs mt-2"
              title={!inCity ? `Travel to ${c.cityName} first` : 'Take the job'}>
              {busy ? '…' : !inCity ? `Travel to ${c.cityName} first` : `Take the job — ${fmt(c.minPayout)}–${fmt(c.maxPayout)}`}
            </button>
          )}
          {closed && <p className="text-[13px] text-ink-100/45 mt-1">A new tip arrives at midnight UTC.</p>}
        </div>
      </div>
    </Card>
  );
}

function CrimeResult({ last, crimeId }) {
  if (!last || last.crime.id !== crimeId) return null;
  if (last.error) {
    return (
      <div className="mt-3 rounded-md border-2 border-blood-500/70 bg-blood-700/25 p-2.5 text-center">
        <div className="text-[12px] uppercase tracking-wider text-blood-300">Error</div>
        <div className="text-sm font-semibold text-blood-200 mt-0.5">{last.error}</div>
      </div>
    );
  }
  const r = last.result;

  let tone, label, headline;
  if (r.success && r.vehicle) {
    tone = 'money';
    label = 'Stolen';
    headline = `${r.vehicle.maker} ${r.vehicle.name} (T${r.vehicle.tier}, book ${fmt(r.vehicle.bookPrice)})`;
  } else if (r.success) {
    tone = 'money';
    label = 'Score';
    headline = `+${fmt(r.payout)}${r.dirty ? ' (dirty)' : ''}`;
  } else if (r.chase) {
    tone = 'blood';
    label = 'On the run';
    headline = `Police chase — outrun them or do ${r.chase.jailMin}m.`;
  } else if (r.jailed) {
    tone = 'gold';
    label = 'Caught';
    headline = `Jailed ${r.jail_min}m`;
  } else if (r.hospital) {
    tone = 'blue';
    label = 'Hurt';
    headline = `Hospital ${r.hosp_min}m`;
  } else {
    tone = 'ghost';
    label = 'Failed';
    headline = 'Walked away clean';
  }
  const TONE = {
    money: { border: 'border-money-500/70', bg: 'bg-money-600/20', label: 'text-money-300', text: 'text-money-100' },
    gold:  { border: 'border-yellow-500/70', bg: 'bg-yellow-700/20', label: 'text-yellow-300', text: 'text-yellow-100' },
    blue:  { border: 'border-blue-400/70',  bg: 'bg-blue-700/20',  label: 'text-blue-300',  text: 'text-blue-100' },
    blood: { border: 'border-blood-500/70', bg: 'bg-blood-700/25', label: 'text-blood-300', text: 'text-blood-100' },
    ghost: { border: 'border-ink-100/40',   bg: 'bg-ink-900/60',   label: 'text-ink-100/65', text: 'text-ink-100/90' },
  }[tone];

  return (
    <div className={`mt-3 rounded-md border-2 ${TONE.border} ${TONE.bg} p-2.5 text-center`}>
      <div className={`text-[12px] uppercase tracking-wider ${TONE.label}`}>{label}</div>
      <div className={`text-sm font-bold ${TONE.text} mt-0.5`}>{headline}</div>
      {(r.xp || r.levels) && !r.chase && (
        <div className="text-[13px] text-ink-100/70 mt-0.5">
          +{r.xp}xp{r.levels ? ` · ↑${r.levels} lvl${r.levels > 1 ? 's' : ''}!` : ''}
        </div>
      )}
      {r.consumed?.length > 0 && (
        <div className="text-[12px] text-ink-100/55 mt-0.5">
          Used: {r.consumed.map(c => `${c.qty}× ${c.name}`).join(', ')}.
        </div>
      )}
    </div>
  );
}

export default function Crimes() {
  const { character, refresh, updateFromResponse } = useGame();
  const [list, setList] = useState([]);
  const [last, setLast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Police-chase mini-game state. Populated either by a /crimes/commit
  // response that returned a `chase`, or by a GET /chases on mount
  // (covers refresh-during-chase).
  const [chase, setChase] = useState(null);

  async function load() { const d = await api.get('/crimes'); setList(d.crimes); }
  async function loadChase() {
    try {
      const r = await api.get('/chases');
      if (r.chase) setChase(r.chase);
    } catch { /* no active chase */ }
  }
  useEffect(() => { load(); loadChase(); }, []);

  async function commit(crime) {
    setBusyId(crime.id);
    try {
      const r = await api.post('/crimes/commit', { crime_id: crime.id });
      // Audio first so the moment lands before the page re-renders.
      // Failure → siren/ko/fail; success → crime-specific family
      // (getaway / cyber / gunshot / panic). PoliceChase mini-game
      // suppresses its own sound by passing through r.chase.
      playCrimeSound(crime.id, crime.tier, r);
      updateFromResponse(r);
      setLast({ crime, result: r });
      if (r.chase) setChase(r.chase);
      await refresh();
      await load();
    } catch (e) { setLast({ crime, error: e.message }); }
    finally { setBusyId(null); }
  }

  const grouped = list.reduce((m, c) => ((m[c.tier] = m[c.tier] || []).push(c), m), {});
  const orderedTiers = TIER_ORDER.filter(t => grouped[t]);

  const heat = character?.heat || 0;
  const heatColor =
    heat >= 70 ? 'text-blood-400'
    : heat >= 40 ? 'text-gold-400'
    : 'text-money-400';

  return (
    <div className="space-y-4">
      {chase && (
        <PoliceChase
          chase={chase}
          onResolved={async () => { await refresh(); await load(); }}
          onClose={() => setChase(null)}
        />
      )}
      <DailyContractBanner character={character} onChange={async () => { await refresh(); }} />
      <Card title="Heat" subtitle="Each crime attracts attention. High heat shaves your success chance and bumps jail risk on failure. Decays ~1/min while you lay low.">
        <div className="flex items-baseline gap-3">
          <div className={`font-display text-3xl tabular-nums ${heatColor}`}>{heat}</div>
          <div className="text-[13px] text-ink-100/55 uppercase tracking-wide">/ 100</div>
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
      <PlayerCrimes character={character} />

      <Card title="Multiplayer Crimes (Heists)"
        subtitle="Crew-led organised crime. Bigger payouts than anything you can pull alone — but you need bodies and the right stat profile in each seat."
        collapsible>
        <ul className="text-xs space-y-1 text-ink-100/75 list-disc pl-5">
          <li><b className="text-blood-300">Pick a heist</b> from the catalogue (jewellery store, bank vault, casino, etc.). Each defines named roles — Driver, Hacker, Muscle, Lookout — with a minimum stat requirement per seat.</li>
          <li><b className="text-blood-300">Recruit your crew.</b> As leader, invite players to fill each role. Their stats must clear the role's minimum or they can't accept.</li>
          <li><b className="text-blood-300">Execute.</b> Once every seat is filled, the leader pulls the trigger. The roll factors in every member's relevant stat plus the role weights.</li>
          <li><b className="text-blood-300">Split the take.</b> Success → the payout splits across the crew. Failure → everyone shares the heat (and possibly jail time).</li>
        </ul>
        <p className="text-[13px] text-ink-100/45 mt-2">
          Heists are async — crew members don't all need to be online at the same time. Once a role is accepted, the seat is locked until execution or cancellation.
        </p>
        <Link to="/oc" className="btn btn-primary text-xs w-full mt-3 block text-center">
          Open heist board →
        </Link>
      </Card>

      {orderedTiers.map(tier => (
        <Card key={tier} title={TIER_TITLES[tier] || tier} subtitle={TIER_SUBTITLES[tier] || null} collapsible>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[tier].map(c => {
              const onCd = !c.ready;
              const reqsMet = c.requirementsMet !== false;
              const gtaBlocked = c.tier === 'gta' && !!character?.active_vehicle_id;
              const cant = c.locked || character.energy < c.energy || onCd || !reqsMet || gtaBlocked;
              return (
                <div key={c.id} className={`rounded-lg p-3 border bg-ink-950/40 ${c.locked ? 'border-ink-100/5 opacity-50 grayscale' : onCd ? 'border-ink-100/10 opacity-70' : 'border-ink-100/10'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-medium">{c.name}</div>
                    {c.locked
                      ? <LockBadge level={c.level} />
                      : <div className="text-[12px] text-ink-100/50">Lvl {c.level}+</div>}
                  </div>
                  <div className="text-[13px] text-ink-100/60 mt-1">
                    Energy {c.energy} · {c.tier === 'gta' ? `Tier ${c.vehicleTier} car` : `${fmt(c.min)}–${fmt(c.max)}`} · {c.xp}xp · risk: {c.risk}
                  </div>
                  <div className="text-[12px] text-ink-100/40 mt-0.5">cooldown {cooldownLabel(c.cooldownSec)}</div>
                  {c.requires?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.requires.map(r => (
                        <span key={r.item_id}
                          className={`text-[12px] px-1.5 py-0.5 rounded border ${r.ok ? 'border-money-500/40 text-money-300' : 'border-blood-500/50 text-blood-300'}`}
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
                        : gtaBlocked
                          ? 'Drop your car first'
                          : !reqsMet
                            ? 'Need items'
                            : onCd
                              ? <>Ready in <Timer until={c.cooldownUntil} onExpire={load} /></>
                              : 'Attempt'}
                  </button>
                  <CrimeResult last={last} crimeId={c.id} />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
