import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { fmt } from '../components/Money.jsx';
import Card from '../components/Card.jsx';

const KIND_STYLE = {
  hit:   'text-ink-100/85',
  miss:  'text-ink-100/45 italic',
  dodge: 'text-cyan-300 italic',
  crit:  'text-money-400 font-semibold',
  block: 'text-blue-300',
};

function HpBar({ label, hp, max, side }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const color = side === 'you'
    ? (pct > 50 ? 'bg-money-500' : pct > 25 ? 'bg-yellow-500' : 'bg-blood-500')
    : 'bg-blood-500';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-100/60">{hp} / {max}</span>
      </div>
      <div className="h-3 rounded-full bg-ink-100/10 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

function turnTimerLeft(deadline) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function PvpFight() {
  const { refresh, character } = useGame();
  const nav = useNavigate();
  const [fight, setFight] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const logRef = useRef(null);
  const [, tickForce] = useState(0);

  async function loadState() {
    try {
      const s = await api.get('/pvp/state');
      if (s.fight) {
        setFight(s.fight);
      } else {
        setFight(null);
      }
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { loadState(); }, []);

  // Live updates via SSE.
  useEventStream('pvp.turn', (p) => {
    if (p?.fight) setFight(p.fight);
  });
  useEventStream('pvp.fight_started', (p) => {
    if (p?.fight) setFight(p.fight);
    setSummary(null);
  });
  useEventStream('pvp.ended', (p) => {
    const s = p?.summary || { outcome: 'unknown' };
    // Murder loss → character is gone server-side. Stash a banner for the
    // /create page so the player understands why they're being kicked back
    // to character creation; the next refresh() will 404 and the protected
    // route will redirect.
    if (s.mode === 'murder' && s.loser_id === character?.id) {
      try {
        sessionStorage.setItem('pvp_death_summary', JSON.stringify({
          loser_name: s.loser_name,
          winner_id: s.winner_id,
          cash_taken: s.cash_taken,
          ts: Date.now(),
        }));
      } catch {}
    }
    setSummary(s);
    setFight(null);
    refresh();
  });

  // 1Hz tick so the turn-deadline countdown updates.
  useEffect(() => {
    const id = setInterval(() => tickForce(v => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll the log to newest entry.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [fight?.log?.length]);

  async function attack(moveId) {
    setBusy('atk-' + moveId); setError(null);
    try {
      const r = await api.post('/pvp/attack', { move_id: moveId });
      if (r.ended) {
        setSummary(r.summary);
        setFight(null);
        await refresh();
      } else if (r.fight) {
        setFight(r.fight);
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function flee() {
    setBusy('flee'); setError(null);
    try {
      const r = await api.post('/pvp/flee');
      setSummary(r.summary);
      setFight(null);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  // ── No fight: show summary or a stub ────────────────────────────────
  if (!fight) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {summary && (
          <Card>
            {summary.outcome === 'attacker_won' || summary.outcome === 'target_won' ? (
              summary.winner_id === character?.id ? (
                <p className="text-sm text-money-400">
                  🏆 You knocked them out!{' '}
                  +{fmt(summary.cash_taken)} taken
                  · +{summary.xp}xp
                  {summary.levels > 0 ? ` · LEVEL UP ×${summary.levels}` : ''}
                </p>
              ) : (
                <p className="text-sm text-blood-400">
                  💀 You got KO'd. Hospital {summary.hosp_min} min · -£{summary.cash_taken?.toLocaleString()}.
                </p>
              )
            ) : (
              <p className="text-sm text-yellow-400">🏃 Fight ended — bailed out.</p>
            )}
          </Card>
        )}
        <Card>
          <p className="text-sm text-ink-100/70">No active PvP fight.</p>
          <button onClick={() => nav('/players')} className="btn btn-ghost text-xs mt-3">← Back to Players</button>
        </Card>
      </div>
    );
  }

  // ── Live fight ──────────────────────────────────────────────────────
  const turnLeft = turnTimerLeft(fight.turn_deadline);
  const isYourTurn = fight.your_turn;
  const moves = fight.moves || [];

  return (
    <div className="space-y-4">
      <Card title={`${fight.mode === 'murder' ? '☠️ MURDER' : '⚔ Fight'} — ${fight.opponent?.name}`} subtitle={`Round ${fight.round} · ${fight.opponent?.online ? 'online' : 'offline'}${fight.mode === 'murder' ? ' · Permadeath on KO' : ''}`}>
        {fight.mode === 'murder' && (
          <div className="bg-blood-700/20 border border-blood-500/40 rounded-md p-2 text-xs mb-3">
            ☠️ This is a war murder fight. The loser's character is permanently deleted — all cash on hand goes to the winner.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <HpBar label={`You (${fight.you.name})`} hp={fight.you.hp} max={fight.you.max_hp} side="you" />
          <HpBar label={fight.opponent?.name || 'Opponent'} hp={fight.opponent_hp} max={fight.opponent_max_hp} side="enemy" />
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className={`text-xs uppercase tracking-wide ${isYourTurn ? 'text-money-400' : 'text-ink-100/55'}`}>
            {isYourTurn ? 'Your turn — pick a move' : `Waiting for ${fight.opponent?.name}…`}
          </span>
          <span className="text-[11px] tabular-nums text-ink-100/60">{turnLeft}s</span>
        </div>
        {error && <p className="text-xs text-blood-400 mt-2">{error}</p>}
      </Card>

      <Card title="Moves">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {moves.map(m => {
            const id = 'atk-' + m.id;
            return (
              <button
                key={m.id}
                disabled={!isYourTurn || busy != null}
                onClick={() => attack(m.id)}
                className={`rounded-lg p-3 text-left border transition disabled:opacity-50 disabled:cursor-not-allowed ${m.defensive ? 'border-blue-500/30 bg-blue-700/10 hover:border-blue-400' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{m.emoji} {m.name}</span>
                  {!m.defensive && (
                    <span className="text-[10px] text-ink-100/50 tabular-nums">×{m.dmgMul}</span>
                  )}
                </div>
                <div className="text-[10px] text-ink-100/55 mt-1 leading-snug">{m.desc}</div>
                {!m.defensive && (
                  <div className="mt-2 flex justify-between text-[10px] tabular-nums">
                    <span className="text-money-400">hit {Math.round(m.hit * 100)}%</span>
                    <span className="text-yellow-400">crit {Math.round(m.crit * 100)}%</span>
                  </div>
                )}
                {busy === id && <div className="text-[10px] text-ink-100/60 mt-1">…</div>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Round log">
        <div ref={logRef} className="text-xs space-y-1 max-h-72 overflow-y-auto scrollbar pr-2">
          {fight.log.length === 0 && <p className="text-ink-100/45">Pick a move and throw the first punch.</p>}
          {fight.log.map((entry, i) => (
            <div key={i} className={`flex gap-2 ${KIND_STYLE[entry.kind] || 'text-ink-100/80'}`}>
              <span className="text-[10px] tabular-nums text-ink-100/40 shrink-0 w-8">R{entry.round}</span>
              <span className="flex-1">{entry.text}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <button disabled={busy != null} onClick={flee} className="btn btn-ghost text-xs">
          {busy === 'flee' ? '…' : 'Flee fight'}
        </button>
      </div>
    </div>
  );
}
