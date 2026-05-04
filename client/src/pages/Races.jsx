import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

function statusLabel(s) {
  switch (s) {
    case 'pending':   return 'Pending';
    case 'completed': return 'Done';
    case 'declined':  return 'Declined';
    case 'cancelled': return 'Cancelled';
    case 'expired':   return 'Expired';
    default:          return s;
  }
}

export default function Races() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/races')); }
  useEffect(() => { load(); }, []);
  useEventStream('race.challenged', load);
  useEventStream('race.sent', load);
  useEventStream('race.completed', load);
  useEventStream('race.declined', load);
  useEventStream('race.cancelled', load);

  async function call(action, id) {
    setBusy(`${action}-${id}`); setMsg(null);
    try {
      await api.post(`/races/${id}/${action}`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title=" Street Races" subtitle="Live PvP — challenge a player from their profile, both put up the stake, winner takes the pot. Both cars take 5–20% condition damage either way.">
        <p className="text-[11px] text-ink-100/55">
          Find a target on the <Link to="/players" className="text-blood-300 underline">Players</Link> page —
          they have to be in your city and driving an active car of the same tier as yours.
        </p>
      </Card>

      {data.incoming.length > 0 && (
        <Card title="Incoming">
          <div className="space-y-2">
            {data.incoming.map(r => (
              <RacePending key={r.id} r={r} character={character} side="opponent"
                busy={busy} onAccept={() => call('accept', r.id)} onDecline={() => call('decline', r.id)} />
            ))}
          </div>
        </Card>
      )}

      {data.outgoing.length > 0 && (
        <Card title="Sent">
          <div className="space-y-2">
            {data.outgoing.map(r => (
              <RacePending key={r.id} r={r} character={character} side="challenger"
                busy={busy} onCancel={() => call('cancel', r.id)} />
            ))}
          </div>
        </Card>
      )}

      <Card title="Recent">
        {!data.recent.length ? (
          <p className="text-xs text-ink-100/55">No races yet.</p>
        ) : (
          <div className="space-y-2">
            {data.recent.map(r => <RaceHistory key={r.id} r={r} character={character} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function RacePending({ r, character, side, busy, onAccept, onDecline, onCancel }) {
  return (
    <div className="rounded-md border border-ink-100/10 bg-ink-950/40 p-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">Tier {r.tier}</span> · stake <span className="text-money-400 tabular-nums">{fmt(r.stake)}</span>
        </div>
        <div className="text-[10px] text-ink-100/45">
          <Timer until={r.expires_at} prefix="Expires in " />
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {side === 'opponent' ? (
          <>
            <button disabled={!!busy} onClick={onAccept} className="btn btn-money text-[11px] flex-1">
              {busy === `accept-${r.id}` ? '…' : `Race for ${fmt(r.stake)}`}
            </button>
            <button disabled={!!busy} onClick={onDecline} className="btn btn-ghost text-[11px]">
              {busy === `decline-${r.id}` ? '…' : 'Decline'}
            </button>
          </>
        ) : (
          <button disabled={!!busy} onClick={onCancel} className="btn btn-ghost text-[11px] ml-auto">
            {busy === `cancel-${r.id}` ? '…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}

function RaceHistory({ r, character }) {
  const won = r.winner_id === character?.id;
  const tone = won ? 'border-money-500/40 bg-money-600/10' : r.status === 'completed' ? 'border-blood-500/30 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40';
  return (
    <div className={`rounded-md border p-3 text-xs ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`uppercase text-[10px] tracking-wide ${won ? 'text-money-300' : r.status === 'completed' ? 'text-blood-300' : 'text-ink-100/55'}`}>
            {r.status === 'completed' ? (won ? 'Won' : 'Lost') : statusLabel(r.status)}
          </span>
          <span className="text-ink-100/70 truncate">Tier {r.tier} · {fmt(r.stake)}</span>
        </div>
        {r.result?.chance != null && (
          <span className="text-[10px] text-ink-100/40 tabular-nums">{Math.round(r.result.chance * 100)}% odds</span>
        )}
      </div>
      {r.result && (
        <div className="text-[10px] text-ink-100/55 mt-1">
          {r.result.challenger?.car} ({Math.round(r.result.challenger?.condition_after)}% after) · vs ·
          {' '}{r.result.opponent?.car} ({Math.round(r.result.opponent?.condition_after)}% after)
        </div>
      )}
    </div>
  );
}
