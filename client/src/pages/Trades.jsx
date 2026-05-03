import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';

function StatusPill({ trade }) {
  if (trade.status === 'pending')
    return <span className="text-[10px] uppercase text-yellow-400"> pending</span>;
  if (trade.status === 'active')
    return <span className="text-[10px] uppercase text-money-400"> active</span>;
  return <span className="text-[10px] uppercase text-ink-100/45"> {trade.status}</span>;
}

function TradeRow({ trade, character }) {
  const other = trade.initiator?.id === character.id ? trade.recipient : trade.initiator;
  const youInitiated = trade.initiator?.id === character.id;
  return (
    <Link to={`/trades/${trade.id}`}
      className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 hover:border-blood-500/40 hover:bg-ink-900/60 transition flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium truncate">{other?.name}</span>
          <StatusPill trade={trade} />
        </div>
        <div className="text-[11px] text-ink-100/55 mt-0.5">
          {youInitiated ? 'You initiated' : 'They invited you'} · expires in <Timer until={trade.expires_at} />
        </div>
      </div>
      {trade.status === 'pending' && !youInitiated && (
        <span className="text-[10px] uppercase text-yellow-300">awaiting your accept →</span>
      )}
    </Link>
  );
}

export default function Trades() {
  const { character } = useGame();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/trades')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEventStream('trade.requested', load);
  useEventStream('trade.accepted', load);
  useEventStream('trade.cancelled', load);
  useEventStream('trade.completed', load);

  if (!data) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card title=" Trades"
        subtitle="Active and pending direct trades. Initiate a new one from any player's profile.">
        {msg && <p className="text-xs text-blood-400">{msg}</p>}
      </Card>
      {data.trades.length === 0 ? (
        <Card>
          <p className="text-xs text-ink-100/55 text-center py-6">
            No active trades. Visit a player's profile and hit Trade to open one.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {data.trades.map(t => <TradeRow key={t.id} trade={t} character={character} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
