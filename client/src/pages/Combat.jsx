import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const KIND_STYLE = {
  hit:   'text-ink-100/80',
  miss:  'text-ink-100/45 italic',
  dodge: 'text-cyan-300 italic',
  crit:  'text-money-400 font-semibold',
  block: 'text-blue-300',
};

function HpBar({ label, hp, max, side = 'player' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const bar = side === 'player'
    ? (pct > 50 ? 'bg-money-500' : pct > 25 ? 'bg-yellow-500' : 'bg-blood-500')
    : 'bg-blood-500';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-100/60">{hp} / {max}</span>
      </div>
      <div className="h-3 rounded-full bg-ink-100/10 overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// PvP-only section. Pulls recent players from /api/players/search?q= (no
// query → recently-active list), filters to the caller's city since
// PvP is same-city only. Hitting Challenge fires the existing
// /api/pvp/challenge handshake; once the target accepts, the server
// pushes a `pvp.fight_started` SSE we listen for to navigate to the
// turn-based fight page.
function PvpChallengeSection({ character }) {
  const nav = useNavigate();
  const [players, setPlayers] = useState(null);
  const [busy, setBusy] = useState(null);     // 'load' | `chal-${id}`
  const [pendingId, setPendingId] = useState(null);  // outgoing challenge id
  const [pendingTargetName, setPendingTargetName] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    setBusy('load');
    try {
      const r = await api.get('/players/search');
      // Same-city only; hide self.
      setPlayers(r.players.filter(p => p.same_city && p.id !== character.id));
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  useEffect(() => { if (character?.city) load(); }, [character?.city]);

  // When the recipient accepts, the server pushes pvp.fight_started to
  // both sides — that's our cue to jump to the fight page.
  useEventStream('pvp.fight_started', () => nav('/pvp/fight'));
  useEventStream('pvp.declined', (p) => {
    if (p?.challenge_id === pendingId) {
      setMsg(`${pendingTargetName || 'Target'} declined.`);
      setPendingId(null);
      setPendingTargetName(null);
    }
  });

  async function challenge(p) {
    setBusy('chal-' + p.id); setMsg(null);
    try {
      const r = await api.post('/pvp/challenge', { target_id: p.id, mode: 'knockout' });
      setPendingId(r.challenge?.id ?? null);
      setPendingTargetName(p.name);
      setMsg(`Challenge sent to ${p.name}. They have 60s to accept.`);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!players) {
    return <Card title=" Challenge a player" subtitle="Loading nearby fighters…" />;
  }

  return (
    <Card title=" Challenge a player"
      subtitle={`Online and offline players currently in ${character.city.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}. PvP fights are turn-based — same combat engine as the NPC fights, but both sides take alternating turns.`}
      right={<button onClick={load} disabled={busy === 'load'} className="btn btn-ghost text-xs">↻ Refresh</button>}>
      {pendingId && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-700/10 p-2 mb-3 text-xs text-yellow-300">
           Waiting for {pendingTargetName} to accept… you'll be taken to the fight if they accept (60s window).
        </div>
      )}
      {msg && <p className="text-xs text-money-400 mb-2">{msg}</p>}
      {players.length === 0 ? (
        <p className="text-xs text-ink-100/55 text-center py-4">
          Nobody else in your city right now. Try Travel to find a more active scene.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {players.map(p => (
            <div key={p.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <Link to={`/players/${p.id}`} className="font-medium truncate hover:underline">{p.name}</Link>
                  <span className="text-[10px] uppercase text-ink-100/45">L{p.at_max_level ? '999+' : p.level}</span>
                </div>
                {p.online
                  ? <span className="text-[10px] uppercase text-money-400"> online</span>
                  : <span className="text-[10px] text-ink-100/45">{timeAgo(p.last_active_at)}</span>}
              </div>
              <div className="text-[11px] text-ink-100/55 mt-1">{p.rank}</div>
              <button
                disabled={busy === 'chal-' + p.id || pendingId != null}
                onClick={() => challenge(p)}
                className="btn btn-primary text-xs w-full mt-2">
                {busy === 'chal-' + p.id ? '…' : pendingId != null ? 'Pending challenge…' : ' Challenge'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Combat() {
  const { character, refresh, updateFromResponse } = useGame();
  const [data, setData] = useState(null);   // { fight, moves } from /state
  const [targets, setTargets] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [summary, setSummary] = useState(null);
  useScrollOnMessage(msg);
  useScrollOnMessage(summary);
  const logRef = useRef(null);

  async function loadState() {
    const s = await api.get('/combat/state');
    setData(s);
  }
  async function loadTargets() {
    const t = await api.get('/combat/targets');
    setTargets(t.targets);
    setData(prev => ({ ...(prev || {}), moves: t.moves }));
  }
  useEffect(() => { (async () => { await loadState(); await loadTargets(); })(); }, []);

  // Auto-scroll the log to the newest entry whenever it updates.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [data?.fight?.log?.length]);

  async function start(t) {
    setBusy('start-' + t.id); setMsg(null); setSummary(null);
    try {
      const r = await api.post('/combat/start', { enemy_id: t.id });
      updateFromResponse(r);
      setData(prev => ({ ...prev, fight: r.fight }));
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function attack(moveId) {
    setBusy('atk-' + moveId); setMsg(null);
    try {
      const r = await api.post('/combat/attack', { move_id: moveId });
      updateFromResponse(r);
      if (r.ended) {
        setSummary(r.summary);
        setData(prev => ({ ...prev, fight: null }));
        await loadTargets();
      } else {
        setData(prev => ({ ...prev, fight: r.fight }));
      }
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function flee() {
    setBusy('flee'); setMsg(null);
    try {
      const r = await api.post('/combat/flee');
      updateFromResponse(r);
      setData(prev => ({ ...prev, fight: null }));
      setSummary({ fled: true, repLoss: r.repLoss });
      await refresh();
      await loadTargets();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const moves = data.moves || [];
  const fight = data.fight;

  //  Active fight UI 
  if (fight) {
    return (
      <div className="space-y-4">
        <Card title={` Fighting ${fight.enemy_name}`} subtitle={`Level ${fight.enemy_level} · Round ${fight.round}`}>
          <div className="grid sm:grid-cols-2 gap-4">
            <HpBar label={`You (${character?.name})`} hp={fight.player_hp} max={fight.player_max_hp} side="player" />
            <HpBar label={fight.enemy_name} hp={fight.enemy_hp} max={fight.enemy_max_hp} side="enemy" />
          </div>
          {msg && <p className="text-xs text-blood-400 mt-3">{msg}</p>}
        </Card>

        <Card title="Pick your move">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {moves.map(m => {
              const id = 'atk-' + m.id;
              return (
                <button
                  key={m.id}
                  disabled={busy != null}
                  onClick={() => attack(m.id)}
                  className={`rounded-lg p-3 text-left border transition ${m.defensive ? 'border-blue-500/30 bg-blue-700/10 hover:border-blue-400' : 'border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40'}`}>
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
            {fight.log.length === 0 && <p className="text-ink-100/45">Throw the first punch.</p>}
            {fight.log.map((entry, i) => (
              <div key={i} className={`flex gap-2 ${KIND_STYLE[entry.kind] || 'text-ink-100/80'}`}>
                <span className="text-[10px] tabular-nums text-ink-100/40 shrink-0 w-8">R{entry.round}</span>
                <span className="flex-1">{entry.text}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <button
            disabled={busy != null}
            onClick={flee}
            className="btn btn-ghost text-xs">
            {busy === 'flee' ? '…' : 'Flee fight'}
          </button>
        </div>
      </div>
    );
  }

  //  Out-of-fight UI: target list + last summary 
  return (
    <div className="space-y-4">
      {summary && (
        <Card>
          {summary.fled ? (
            <p className="text-sm text-yellow-400"> You bailed.{summary.repLoss ? ` -${summary.repLoss} reputation.` : ''}</p>
          ) : summary.playerWon ? (
            <p className="text-sm text-money-400">
               Win! +{fmt(summary.payout)} +{summary.xp}xp{summary.levels > 0 ? ` · LEVEL UP ×${summary.levels}` : ''}
            </p>
          ) : (
            <p className="text-sm text-blood-400">
               KO'd. Hospitalised for {summary.hospital_min} min · -£{summary.cash_lost?.toLocaleString()}.
            </p>
          )}
        </Card>
      )}

      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      <Card title=" Fight Club" subtitle="Bare-knuckle, no weapons. Strength scales damage; speed boosts crit chance and dodge. Engaging costs 8 energy.">
        <div className="grid sm:grid-cols-2 gap-3">
          {targets.map(t => (
            <div key={t.id} className={`rounded-lg p-3 border bg-ink-950/40 ${t.locked ? 'opacity-50 border-ink-100/5' : t.recommended ? 'border-money-500/40' : 'border-ink-100/10'}`}>
              <div className="flex justify-between">
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] text-ink-100/50">Lvl {t.level}</div>
              </div>
              <div className="text-[11px] text-ink-100/60 mt-1">
                STR {t.str} · DEF {t.def} · SPD {t.spd} · HP {t.hp} · loot {fmt(t.loot[0])}–{fmt(t.loot[1])}
              </div>
              <button
                disabled={t.locked || busy === 'start-' + t.id}
                onClick={() => start(t)}
                className="btn btn-primary w-full text-xs mt-3">
                {busy === 'start-' + t.id ? '…' : t.locked ? 'Too tough' : 'Engage (8 energy)'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {character && <PvpChallengeSection character={character} />}
    </div>
  );
}
