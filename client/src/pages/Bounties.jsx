import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

export default function Bounties() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { setData(await api.get('/bounties')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    setBusy(`cancel-${id}`); setMsg(null);
    try { await api.post(`/bounties/${id}/cancel`); await load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      <Card title=" Wanted Wall"
        subtitle="Cash on a player's head, paid out automatically to whoever murders them. Multiple bounties stack. Cancel from your own list to refund.">
        {!data.bounties.length ? (
          <p className="text-sm text-ink-100/60">Nothing on the wall right now. Anyone can post one from a player's profile.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.bounties.map(b => (
              <div key={b.id} className={`rounded-lg p-3 border ${b.you_target ? 'border-blood-500/70 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link to={`/players/${b.target.id}`} className="font-medium hover:text-blood-300 truncate">
                    {b.target.avatar ? `${b.target.avatar} ` : ''}{b.target.name}
                  </Link>
                  <span className="text-money-400 tabular-nums font-semibold">{fmt(b.amount)}</span>
                </div>
                <div className="text-[10px] text-ink-100/55 mt-0.5">
                  {b.target.rank} · placed by <Link to={`/players/${b.placer.id}`} className="hover:underline">{b.placer.name}</Link>
                  {b.you_target && <span className="text-blood-300 uppercase tracking-wide ml-2">that's you</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.mine.length > 0 && (
        <Card title="Your postings">
          <div className="space-y-2">
            {data.mine.map(b => (
              <div key={b.id} className="rounded-md border border-ink-100/10 bg-ink-950/40 p-3 text-xs flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-ink-100/70">{b.target.name}</span>
                  <span className="text-[10px] text-ink-100/45 ml-2 uppercase tracking-wide">{b.status}</span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="text-money-400 tabular-nums">{fmt(b.amount)}</span>
                  {b.status === 'open' && (
                    <button onClick={() => cancel(b.id)} disabled={!!busy} className="btn btn-ghost text-[11px]">
                      {busy === `cancel-${b.id}` ? '…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
