import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function OutcomeBanner({ result }) {
  if (!result) return null;
  const { outcome, hits, strikes, totalDamage, bulletsUsed, cashTaken } = result;
  const palette = outcome === 'kill'
    ? 'border-blood-500 bg-blood-700/20 text-blood-100'
    : outcome === 'severe_wound'
      ? 'border-yellow-500 bg-yellow-700/20 text-yellow-100'
      : outcome === 'wound'
        ? 'border-yellow-700 bg-yellow-900/20 text-yellow-200'
        : 'border-ink-100/30 bg-ink-900 text-ink-100';
  const headline = {
    kill:         'Murder confirmed.',
    severe_wound: 'Critical wounding.',
    wound:        'Wound inflicted.',
    miss:         'Attempt failed.',
  }[outcome];
  return (
    <div className={`rounded-md border p-3 ${palette}`}>
      <div className="font-display text-lg">{headline}</div>
      <div className="text-xs mt-1 tabular-nums">
        Hits {hits}/{strikes} · damage {totalDamage}{bulletsUsed > 0 ? ` · ${bulletsUsed} bullets used` : ''}
      </div>
      {cashTaken > 0 && (
        <div className="text-[13px] mt-1">Took {fmt(cashTaken)}.</div>
      )}
    </div>
  );
}

export default function Murder() {
  const { id } = useParams();
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [bullets, setBullets] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const r = await api.get(`/murder/info?target_id=${id}`);
      setInfo(r);
      // Default to firing a small initial salvo so the gunner doesn't
      // accidentally fire 60 rounds in their first murder attempt.
      if (r.weapon?.ammoType) {
        const startBullets = Math.min(r.ammo.on_hand, 10);
        setBullets(startBullets);
      }
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function attempt() {
    setBusy(true); setMsg(null); setResult(null);
    try {
      const r = await api.post('/murder/attempt', { target_id: parseInt(id, 10), bullets });
      setResult(r);
      await refresh();
      // Reload info — the cooldown will now be active and the response
      // will show eligibility_error.
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!info) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const { target, weapon, ammo, cost, eligibility_error } = info;
  const isGun = !!weapon?.ammoType;
  const maxBullets = Math.min(cost.max_bullets, ammo.on_hand || 0);
  const canAttempt = !eligibility_error && (!isGun || (bullets >= 1 && bullets <= maxBullets));

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card title="Murder attempt"
        subtitle={`Target: ${target.name} (Lvl ${target.level})`}
        right={<Link to={`/players/${target.id}`} className="btn btn-ghost text-xs">← Back to profile</Link>}>
        <p className="text-xs text-ink-100/55">
          Asynchronous — works whether they're online or offline. They get notified the
          moment it's over. <b>No jail time</b> on any outcome — your only friction is
          ammo, energy, and a 12h cooldown.
        </p>
      </Card>

      {result && <OutcomeBanner result={result} />}

      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      <Card title="Your loadout">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Equipped weapon</div>
            <div className="font-medium">{weapon?.name || 'Fists'}</div>
            <div className="text-[13px] text-ink-100/60">
              {weapon?.maker && `${weapon.maker} · `}
              DMG {weapon?.dmg ?? 4}{isGun ? ` · ${weapon.ammoType}` : ' · melee'}
            </div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Energy cost</div>
            <div className="text-yellow-300 font-semibold tabular-nums">{cost.energy}</div>
            <div className="text-[13px] text-ink-100/60">you have {character?.energy ?? 0}</div>
          </div>
        </div>

        {isGun && (
          <div className="mt-4 border-t border-ink-100/10 pt-3 space-y-2">
            <div className="text-[12px] uppercase text-ink-100/55">Bullets to use</div>
            <div className="flex items-center gap-3">
              <input type="number" min="0" max={maxBullets} value={bullets}
                onChange={e => setBullets(Math.max(0, Math.min(maxBullets, parseInt(e.target.value, 10) || 0)))}
                disabled={busy || maxBullets === 0}
                className="w-24 text-center" />
              <input type="range" min="0" max={maxBullets || 1} value={bullets}
                onChange={e => setBullets(parseInt(e.target.value, 10) || 0)}
                disabled={busy || maxBullets === 0}
                className="flex-1" />
              <span className="text-[13px] text-ink-100/55 tabular-nums">/ {ammo.on_hand} on hand</span>
            </div>
            <p className="text-[13px] text-ink-100/55">
              Each round is a separate hit roll. More bullets = more chances to land damage,
              but also more rounds spent if you miss. Min hit chance ≈ 5%, max ≈ 85%.
              Bullets are consumed regardless of outcome.
            </p>
            {maxBullets === 0 && (
              <p className="text-[13px] text-blood-400">No {weapon.ammoType} rounds in your inventory. Buy ammo at the Gun Store first.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Outcomes" subtitle="Roll resolves immediately on commit. There's no live combat — they don't fight back.">
        <ul className="text-xs space-y-1 text-ink-100/75">
          <li><b className="text-blood-400">Kill</b> — total damage ≥ 100% of their max HP. Permadeath: they have to roll a new character at level 10. You take <b>100%</b> of their cash on hand.</li>
          <li><b className="text-yellow-300">Critical wound</b> — ≥ 50% of max HP. They get hospitalised 60–180 min. You take 10% of their cash.</li>
          <li><b className="text-yellow-200">Wound</b> — ≥ 20% of max HP. Hospital 15–45 min. No cash transfer.</li>
          <li><b>Miss</b> — they get notified, ammo + energy spent, you walk away.</li>
        </ul>
        <p className="text-[13px] text-ink-100/45 mt-2">
          12h cooldown on you afterwards; 12h immunity for them. New characters are protected for the first <b>3 days</b> after creation.
        </p>
      </Card>

      {eligibility_error && (
        <Card><p className="text-xs text-blood-400">{eligibility_error}</p></Card>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!canAttempt || busy}
            onClick={attempt}
            className="btn btn-primary text-sm"
            style={{ background: canAttempt ? undefined : undefined }}>
            {busy ? '…' : isGun ? `Fire ${bullets} round${bullets === 1 ? '' : 's'}` : 'Strike'}
          </button>
          <button onClick={() => nav(`/players/${target.id}`)}
            className="btn btn-ghost text-sm">Back out</button>
        </div>
      </Card>
    </div>
  );
}
