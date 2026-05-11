import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

// Break-and-enter against another player's home. Server runs the
// stealth-vs-defence roll (see routes/burglary.js); this page lays
// out targets in the player's current city, shows your raw stealth
// score, and lets you pick a mark.

function OddsHint({ stealth, defence }) {
  // Best-case stealth (player rolls top of the +0..+25 luck band)
  // vs defence — lets the player gauge whether a target is even
  // possible.
  const best = stealth + 25;
  if (best <= defence) return <span className="text-blood-300">No realistic shot</span>;
  const worst = stealth;
  if (worst > defence) return <span className="text-money-300">Soft target</span>;
  return <span className="text-yellow-300">Coin-flip range</span>;
}

export default function Burglary() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/burglary/targets')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [character?.city, character?.energy]);

  async function attempt(t) {
    setBusy(t.instance_id); setMsg(null);
    try {
      const r = await api.post('/burglary/attempt', { instance_id: t.instance_id });
      if (r.success) {
        setMsg(` Walked off with £${r.take.toLocaleString()} from ${r.property_name} (${r.owner_name}). Stealth ${r.stealth} vs ${r.defence}.`);
      } else if (r.jailed) {
        setMsg(` Tripped the alarm. Jailed ${r.jail_min}m. Stealth ${r.stealth} vs ${r.defence}.`);
      } else if (r.hospital) {
        setMsg(` Security caught up. Hospital ${r.hosp_min}m. Stealth ${r.stealth} vs ${r.defence}.`);
      } else {
        setMsg(`Bailed clean. Stealth ${r.stealth} vs ${r.defence}.`);
      }
      await refresh(); await load();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  const onCd = Date.now() < (data.cooldownUntil || 0);
  const cantAfford = (character?.energy || 0) < data.energyCost;
  const targets = data.targets || [];

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-sm whitespace-pre-line">{msg}</p></Card>}

      <Card title="Break and Enter"
        subtitle={`Pick a target in your city. ${data.energyCost} energy per attempt, 1h cooldown. Stealth roll: (INT + SPD) ÷ 2 + luck vs the property's defence (tier base + installed mods). Success skims cash from the owner's wallet.`}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          <span className="text-ink-100/55">Your base stealth:</span>
          <span className="text-money-300 font-medium tabular-nums">{data.yourStealth}</span>
          <span className="text-ink-100/55">(plus 0–25 luck per attempt)</span>
        </div>
        {onCd && (
          <div className="text-[13px] text-yellow-300 mt-2">
            Cooling off — next attempt in <Timer until={data.cooldownUntil} onExpire={load} />
          </div>
        )}
        {cantAfford && !onCd && (
          <div className="text-[13px] text-blood-300 mt-2">
            Need {data.energyCost} energy to attempt.
          </div>
        )}
      </Card>

      <Card title="Targets" subtitle={targets.length === 0
          ? 'No player-owned properties in this city to crack.'
          : `${targets.length} owner${targets.length === 1 ? '' : 's'} home in this city. Ranked by their wallet — fattest cash on top.`}>
        {targets.length === 0 ? (
          <p className="text-xs text-ink-100/55">
            Try a bigger city, or wait for someone to put roots down here. You could also{' '}
            <Link to="/travel" className="text-blood-300 hover:underline">travel elsewhere</Link>.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {targets.map(t => {
              const myBest = data.yourStealth + 25;
              return (
                <div key={t.instance_id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                  <div className="flex justify-between items-baseline gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{t.property.name}</div>
                      <div className="text-[12px] text-ink-100/45 truncate">{t.property.address}</div>
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-100/45 shrink-0">
                      Tier {t.property.tier}
                    </div>
                  </div>
                  <div className="text-[13px] text-ink-100/65 mt-1">
                    Owned by{' '}
                    <Link to={`/players/${t.owner.id}`} className="text-blood-300 hover:underline">
                      {t.owner.name}
                    </Link>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-2">
                    <span className="text-[13px]">Defence <b className="text-blood-300">{t.defence}</b></span>
                    <OddsHint stealth={data.yourStealth} defence={t.defence} />
                  </div>
                  {t.installedSlots > 0 && (
                    <div className="text-[11px] text-ink-100/45 mt-0.5">
                      {t.installedSlots} mod{t.installedSlots === 1 ? '' : 's'} installed
                    </div>
                  )}
                  <button
                    disabled={onCd || cantAfford || busy === t.instance_id}
                    onClick={() => attempt(t)}
                    className="btn btn-primary w-full text-xs mt-3">
                    {busy === t.instance_id
                      ? '…'
                      : onCd
                        ? 'On cooldown'
                        : cantAfford
                          ? 'Not enough energy'
                          : 'Break in'}
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
