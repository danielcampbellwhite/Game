import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';

export default function Range() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/range')); }
  useEffect(() => { load(); }, [character?.equipped_weapon, character?.energy]);

  async function train(drill) {
    setBusy(drill.id); setMsg(null);
    try {
      await api.post('/range/train', { drill_id: drill.id });
      setMsg(`${drill.name}: +${drill.buff} accuracy.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const acc = data.buffs.accuracy;

  return (
    <div className="space-y-4">
      <Card title="🎯 Linden Shooting Range" subtitle="Train accuracy. Burn ammo for a temporary buff that boosts your hit chance with ranged weapons.">
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Accuracy</div>
            <div className="font-display text-2xl text-emerald-300">+{acc.current}</div>
            {acc.current > 0 && <div className="text-[10px] text-ink-100/50">fades in <Timer until={acc.fadesAt} /></div>}
            {acc.current === 0 && <div className="text-[10px] text-ink-100/50">no active buff</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Equipped weapon</div>
            <div className="text-sm">{data.weapon ? data.weapon.name : <span className="text-blood-400">no ranged weapon equipped</span>}</div>
            {data.weapon && <div className="text-[10px] text-ink-100/50">ammo: {data.weapon.ammoType}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Ammo on hand</div>
            <div className="text-sm tabular-nums">{data.ammoOnHand} rounds</div>
            {!data.weapon && <Link className="btn btn-ghost text-[10px] mt-1" to="/">→ Equip a gun</Link>}
          </div>
        </div>
        <p className="text-[11px] text-ink-100/50 mt-3">
          A baseline shot lands ~60% of the time — every accuracy point adds 1.3% to your hit
          chance, capped at 99%. Without practice, accuracy decays 1 point per hour.
        </p>
      </Card>

      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title="Drills">
        {!data.weapon ? (
          <p className="text-sm text-ink-100/60">Equip a ranged weapon (and bring ammo) to start drills.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.drills.map(d => {
              const noAmmo = data.ammoOnHand < d.ammo;
              const cant = character.energy < d.energy || noAmmo;
              return (
                <div key={d.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">🎯 {d.name}</div>
                    <div className="text-[10px] text-ink-100/50">{d.energy} en · {d.ammo} rounds</div>
                  </div>
                  <div className="text-[11px] text-ink-100/55 mt-1">{d.desc}</div>
                  <div className="text-[10px] uppercase text-emerald-300 tracking-wide mt-2">+{d.buff} accuracy</div>
                  <button disabled={cant || busy === d.id} className="btn btn-gold w-full text-xs mt-3"
                    onClick={() => train(d)}>
                    {busy === d.id ? '...' : noAmmo ? `Need ${d.ammo} ${data.weapon.ammoType}` : 'Train'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
