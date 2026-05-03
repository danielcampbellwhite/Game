import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

// Mirrors the server formula in routes/jail.js so costs tick down live.
function computeCosts(character) {
  const now = Date.now();
  const remaining = character?.jail_until && character.jail_until > now
    ? character.jail_until - now
    : 0;
  if (remaining <= 0) return { remaining: 0, lawyer: 0, bribe: 0 };
  const seconds = Math.floor(remaining / 1000);
  return {
    remaining,
    lawyer: Math.max(500,  seconds * 5),
    bribe:  Math.max(2000, seconds * 25),
  };
}

function cityName(id) {
  return (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

//  Visiting hours: list of jailed players in your city 
function VisitingHours({ character, refreshChar }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);   // `${id}-bail` | `${id}-bust`
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/incarceration')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function refresh() { await Promise.all([refreshChar(), load()]); }

  async function bail(p) {
    setBusy(`${p.id}-bail`);
    try {
      const r = await api.post(`/incarceration/${p.id}/bail`);
      setMsg(`Posted bail for ${p.name} — ${fmt(r.cost)}.`);
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  async function bust(p) {
    setBusy(`${p.id}-bust`);
    try {
      const r = await api.post(`/incarceration/${p.id}/bust`);
      setMsg(r.success
        ? ` Busted ${p.name} out — clean getaway.`
        : ` Caught trying to bust ${p.name} out — you've been jailed.`);
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  return (
    <Card title=" Visiting hours"
      subtitle={`Players locked up in ${cityName(character.city)} right now. Bail them out for cash, or roll the dice on a bust.`}
      right={<button onClick={load} className="btn btn-ghost text-xs">↻ Refresh</button>}>
      <p className="text-[11px] text-ink-100/45 mb-3">
        <b>Bail</b> always works — pay their way out. <b>Bust</b> is free, but only
        succeeds <b>{data?.bust_chance_pct ?? '…'}%</b> of the time (scales with intelligence).
        Fail and you'll take their cell.
      </p>

      {msg && <p className="text-xs text-money-400 mb-3">{msg}</p>}

      {!data ? (
        <p className="text-xs text-ink-100/55">Loading…</p>
      ) : data.jail.length === 0 ? (
        <p className="text-xs text-ink-100/55 text-center py-6">Nobody is locked up in {cityName(character.city)} right now.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.jail.map(p => {
            const canBail = (character?.cash || 0) >= p.bail_cost;
            return (
              <div key={p.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/players/${p.id}`} className="flex items-center gap-2 min-w-0 hover:underline">
                    <span className="min-w-0">
                      <span className="font-medium truncate">{p.name}</span>
                      <span className="ml-2 text-[10px] uppercase text-ink-100/40">L{p.level}</span>
                      {p.gang && <span className="ml-2 text-[10px] text-blood-400">[{p.gang.tag}]</span>}
                      <span className="block text-[11px] text-ink-100/55">{p.rank}</span>
                    </span>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase text-ink-100/50">Sentence</div>
                    <div className="font-display text-sm text-yellow-300">
                      <Timer until={p.jail_until} onExpire={refresh} />
                    </div>
                  </div>
                </div>
                {p.jail_reason && (
                  <p className="text-[11px] text-ink-100/55 italic">{p.jail_reason}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={!!busy || !canBail}
                    onClick={() => bail(p)}
                    className="btn text-xs"
                    title={canBail ? `Pay ${fmt(p.bail_cost)} to spring them.` : 'Not enough cash.'}>
                    {busy === `${p.id}-bail` ? '…' : `Bail · ${fmt(p.bail_cost)}`}
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => bust(p)}
                    className="btn btn-primary text-xs"
                    title={`Free, but ${data.bust_chance_pct}% chance of success — fail and you'll be jailed.`}>
                    {busy === `${p.id}-bust` ? '…' : `Bust · ${data.bust_chance_pct}%`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Jail() {
  const { character, refresh } = useGame();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  // 1-second tick to keep self-action costs ticking down without polling.
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function act(action) {
    setBusy(action); setMsg(null);
    try {
      await api.post(`/jail/${action}`);
      setMsg(action === 'lawyer' ? 'Lawyer hired — sentence cut in half.' : 'Bribe attempted.');
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const { remaining, lawyer, bribe } = computeCosts(character);
  const inJail = remaining > 0;

  // Free citizen — show the visiting-hours list.
  if (!inJail) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Card title=" City Holding Cells" subtitle="You're a free citizen — for now. While you're out, you can visit the cells and help others get out too.">
          <Link to="/" className="btn btn-ghost w-full text-xs">← Back to dashboard</Link>
        </Card>
        <VisitingHours character={character} refreshChar={refresh} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card title=" City Holding Cells" subtitle="You've been arrested. Sit it out, or move money to get out faster.">
        <div className="bg-yellow-700/15 border border-yellow-500/30 rounded-md p-3 text-sm">
          <div className="font-medium text-yellow-300"> Locked up</div>
          {character.jail_reason && (
            <p className="text-ink-100/85 text-sm mt-1">{character.jail_reason}</p>
          )}
          <p className="text-ink-100/70 text-xs mt-2">
            Crimes, jobs, travel, training, gambling — all on hold while you're behind
            bars. Hire a solicitor to halve your time, bribe a guard for a chance to
            walk free, or just wait it out. Both fees shrink as your sentence does.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Sentence remaining</div>
            <div className="font-display text-2xl">
              <Timer until={character.jail_until} onExpire={refresh} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Status</div>
            <div className="font-display text-2xl text-yellow-300">Detained</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <button disabled={busy || character.cash < lawyer} className="btn"
            onClick={() => act('lawyer')}>
            {busy === 'lawyer' ? '...' : `Hire lawyer — ${fmt(lawyer)}`}
            <div className="text-[10px] opacity-70">cuts sentence in half</div>
          </button>
          <button disabled={busy || character.cash < bribe} className="btn btn-primary"
            onClick={() => act('bribe')}>
            {busy === 'bribe' ? '...' : `Bribe guard — ${fmt(bribe)}`}
            <div className="text-[10px] opacity-70">90% chance to walk · 10% sentence doubles</div>
          </button>
        </div>

        {(character.cash < lawyer) && (
          <p className="text-blood-400 text-[11px] mt-2">
            Not enough cash for either option — you'll have to wait it out.
          </p>
        )}

        {msg && <p className="text-xs text-money-400 mt-2">{msg}</p>}
      </Card>
    </div>
  );
}
