import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

function EventCard({ event, onBet, busy, character }) {
  const [outcome, setOutcome] = useState(null);
  const [amount, setAmount] = useState(50);
  const closing = event.resolves_at - 60_000; // disable last 60s
  const closed = Date.now() >= event.resolves_at;

  return (
    <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-100/45">{event.sport}</div>
          <div className="font-medium leading-tight">{event.name}</div>
          <div className="text-[11px] text-ink-100/55 mt-0.5">{event.description}</div>
        </div>
        <div className="text-right text-[10px] text-ink-100/55 whitespace-nowrap">
          Closes in<br/>
          <span className="text-ink-100/85"><Timer until={event.resolves_at} /></span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        {event.outcomes.map(o => (
          <button key={o.id}
            onClick={() => setOutcome(o.id)}
            className={`rounded-md border px-3 py-2 text-left text-xs ${outcome === o.id ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/40'}`}>
            <div className="truncate">{o.name}</div>
            <div className="text-[10px] text-gold-400 tabular-nums mt-0.5">@ {o.odds.toFixed(2)}</div>
          </button>
        ))}
      </div>

      {outcome && !closed && (
        <div className="flex gap-2 mt-3">
          <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Stake" className="flex-1" />
          <button disabled={busy || !amount || character.cash < amount}
            className="btn btn-gold"
            onClick={() => { onBet(event.id, outcome, Number(amount)); setOutcome(null); }}>
            Bet {fmt(Number(amount) || 0)}
          </button>
        </div>
      )}
      {closed && <p className="text-[11px] text-blood-400 mt-2">Betting closed.</p>}
    </div>
  );
}

export default function Bookmaker() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/bookmaker')); }
  useEffect(() => {
    load();
    // Poll every 30s so settled bets/new events appear
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  async function bet(event_id, outcome, amount) {
    setBusy(true); setMsg(null);
    try {
      await api.post('/bookmaker/bet', { event_id, outcome, amount });
      setMsg(`Bet placed: ${fmt(amount)}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return null;
  const open = data.myBets.filter(b => !b.settled);
  const settled = data.myBets.filter(b => b.settled).slice(0, 8);

  return (
    <div className="space-y-4">
      <Card title=" The Bookmaker" subtitle="Place wagers on auto-generated sporting events. Odds carry an ~8% house margin — pick well.">
        {msg && <p className="text-xs">{msg}</p>}
      </Card>

      {!!open.length && (
        <Card title={`Your open bets (${open.length})`}>
          <ul className="space-y-1">
            {open.map(b => (
              <li key={b.id} className="text-xs flex justify-between gap-2">
                <span className="truncate">
                  <b>{b.pickName}</b> <span className="text-ink-100/45">in</span> {b.event_name}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {fmt(b.amount)} @ {b.odds.toFixed(2)} → <span className="text-money-400">{fmt(b.potential)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Live markets" subtitle={`${data.events.length} events open for betting.`}>
        <div className="grid md:grid-cols-2 gap-3">
          {data.events.map(ev => (
            <EventCard key={ev.id} event={ev} onBet={bet} busy={busy} character={character} />
          ))}
        </div>
      </Card>

      {!!settled.length && (
        <Card title="Recent results">
          <ul className="space-y-1">
            {settled.map(b => (
              <li key={b.id} className="text-xs flex justify-between gap-2">
                <span className="truncate">
                  <b>{b.pickName}</b> <span className="text-ink-100/45">in</span> {b.event_name}
                </span>
                <span className={`tabular-nums whitespace-nowrap ${b.won ? 'text-money-400' : 'text-blood-400'}`}>
                  {b.won ? `+${fmt(b.payout)}` : `−${fmt(b.amount)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
