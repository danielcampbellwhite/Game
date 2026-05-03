import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

const TIER_STYLE = {
  easy: { label: 'Easy',   color: 'text-money-400',  bar: 'bg-money-500'  },
  med:  { label: 'Medium', color: 'text-yellow-400', bar: 'bg-yellow-500' },
  hard: { label: 'Hard',   color: 'text-blood-400',  bar: 'bg-blood-500'  },
};

export default function Missions() {
  const { refresh, updateFromResponse } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/missions')); }
  useEffect(() => { load(); }, []);

  async function claim(missionId) {
    setBusy(missionId); setMsg(null);
    try {
      const r = await api.post('/missions/claim', { mission_id: missionId });
      updateFromResponse(r);
      const lvlPart = r.levels > 0 ? ` — LEVEL UP ×${r.levels}!` : '';
      setMsg(`+${r.xp}xp +£${r.cash.toLocaleString()}${lvlPart}`);
      await refresh();
      await load();
    } catch (e) {
      setMsg(e.message);
    } finally { setBusy(null); }
  }

  if (!data) return null;
  const allDone = data.missions.every(m => m.claimed);

  return (
    <div className="space-y-4">
      <Card title=" Daily Missions"
        subtitle="Three rolls every UTC midnight. Knock them out for a big XP bump."
        right={
          <div className="text-right text-[11px] text-ink-100/60">
            <div>Resets in</div>
            <div className="text-money-400 font-mono">
              <Timer until={data.resets_at} onExpire={load} />
            </div>
          </div>
        }>
        {msg && <p className="text-xs text-money-400 mt-1">{msg}</p>}
        {allDone && <p className="text-xs text-ink-100/60 mt-1">All cleared today — come back after the reset.</p>}
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.missions.map(m => {
          const style = TIER_STYLE[m.tier] || TIER_STYLE.easy;
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          return (
            <Card key={m.id}>
              <div className="flex items-baseline justify-between">
                <div className="font-medium text-base">{m.emoji} {m.name}</div>
                <span className={`text-[10px] uppercase tracking-wide ${style.color}`}>{style.label}</span>
              </div>
              <p className="text-xs text-ink-100/70 mt-1">{m.desc}</p>

              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-ink-100/60 mb-1">
                  <span>Progress</span>
                  <span className="tabular-nums">{m.progress} / {m.target}</span>
                </div>
                <div className="h-2 rounded-full bg-ink-100/10 overflow-hidden">
                  <div className={`h-full ${style.bar} transition-all`} style={{ width: `${pct}%` }}/>
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between text-xs">
                <div className="text-ink-100/60">
                  Reward: <span className="text-money-400">+{m.reward_xp}xp</span>
                  <span className="text-ink-100/40"> · </span>
                  <span className="text-gold-400">{fmt(m.reward_cash)}</span>
                </div>
              </div>

              {m.claimed ? (
                <div className="mt-3 text-center text-xs text-ink-100/40 italic">claimed</div>
              ) : m.complete ? (
                <button
                  disabled={busy === m.id}
                  onClick={() => claim(m.id)}
                  className="btn btn-money w-full text-xs mt-3">
                  {busy === m.id ? '...' : 'Claim reward'}
                </button>
              ) : (
                <div className="mt-3 text-[11px] text-ink-100/40 text-center">In progress…</div>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <p className="text-[11px] text-ink-100/60">
          Some missions need props from the <Link to="/general-store" className="underline text-money-400">General Store</Link>.
          Buy them, then use them from your inventory there.
        </p>
      </Card>
    </div>
  );
}
