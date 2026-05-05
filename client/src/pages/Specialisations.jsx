import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';

const PALETTE_TONE = {
  gold:  { border: 'border-gold-400/40',  text: 'text-gold-300',  bg: 'bg-gold-500/10' },
  blood: { border: 'border-blood-500/40', text: 'text-blood-300', bg: 'bg-blood-700/10' },
  money: { border: 'border-money-500/40', text: 'text-money-300', bg: 'bg-money-600/10' },
};

export default function Specialisations() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/specialisations')); }
  useEffect(() => { load(); }, [character?.specialisation, character?.level]);

  async function choose(path) {
    setBusy(path.id); setMsg(null);
    try {
      await api.post('/specialisations/choose', { path: path.id });
      setMsg(`You're a ${path.name} now. Locked in for the life of this character.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const chosen = data.chosen;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-money-300">{msg}</p></Card>}

      <Card title=" Specialisation"
        subtitle="Pick a path at level 25 — locks in for the life of the character. Five passive nodes per path, auto-unlocked at levels 25 / 35 / 50 / 65 / 80. Resets on retirement.">
        {!chosen && !data.canChoose && (
          <p className="text-xs text-ink-100/65">
            Reach level <span className="text-ink-50">{data.unlockLevel}</span> to choose your path.
          </p>
        )}
        {!chosen && data.canChoose && (
          <p className="text-xs text-yellow-300">
            Pick a path below — once chosen, you can't switch until you retire and start a new prestige cycle.
          </p>
        )}
        {chosen && (
          <p className="text-xs text-ink-100/65">
            Currently a <span className={`font-medium ${PALETTE_TONE[data.paths.find(p => p.id === chosen)?.palette]?.text || 'text-ink-50'}`}>
              {data.paths.find(p => p.id === chosen)?.name}
            </span>. Higher-level nodes unlock as you climb back to the cap.
          </p>
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        {data.paths.map(p => {
          const tone = PALETTE_TONE[p.palette] || PALETTE_TONE.gold;
          const isMe = chosen === p.id;
          const offered = !chosen && data.canChoose;
          return (
            <Card key={p.id} className={isMe ? `${tone.border} ${tone.bg}` : ''}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className={`font-display text-xl ${tone.text}`}>{p.name}</h3>
                {isMe && <span className="text-[10px] uppercase tracking-wide text-money-300">your path</span>}
              </div>
              <p className="text-[11px] text-ink-100/60 mb-3">{p.blurb}</p>
              <ul className="space-y-2">
                {p.nodes.map(n => {
                  const unlocked = isMe && (character?.level || 1) >= n.level;
                  return (
                    <li key={n.level} className={`rounded-md border p-2 text-[11px] ${unlocked ? `${tone.border} ${tone.bg}` : 'border-ink-100/10 bg-ink-950/40 opacity-70'}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-ink-50">{n.name}</span>
                        {unlocked
                          ? <span className={`text-[9px] uppercase tracking-wide ${tone.text}`}>active</span>
                          : <LockBadge level={n.level} />}
                      </div>
                      <p className="text-ink-100/65 mt-0.5">{n.blurb}</p>
                    </li>
                  );
                })}
              </ul>
              {offered && (
                <button onClick={() => choose(p)} disabled={!!busy}
                  className="btn btn-primary w-full text-xs mt-3">
                  {busy === p.id ? '…' : `Become a ${p.name}`}
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
