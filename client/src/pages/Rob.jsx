import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function OutcomeBanner({ result }) {
  if (!result) return null;
  if (result.win) {
    return (
      <div className="rounded-md border border-money-500 bg-money-700/15 text-money-100 p-3">
        <div className="font-display text-lg">Robbery successful</div>
        <div className="text-xs mt-1 tabular-nums">
          Took {fmt(result.cashTaken)} · they're in hospital {result.hospitalMins} min.
        </div>
        <div className="text-[13px] mt-2 text-money-200/80 italic">
          You slipped away. There's no telling whether they got a good look at you.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-blood-500 bg-blood-700/15 text-blood-100 p-3">
      <div className="font-display text-lg">Robbery failed</div>
      <div className="text-xs mt-1">They fought you off — got away with nothing.</div>
    </div>
  );
}

export default function Rob() {
  const { id } = useParams();
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setInfo(await api.get(`/rob/info?target_id=${id}`)); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function attempt() {
    setBusy(true); setMsg(null); setResult(null);
    try {
      const r = await api.post('/rob/attempt', { target_id: parseInt(id, 10) });
      setResult(r);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!info) return <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>;
  const { target, cost, win_chance, eligibility_error } = info;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card title="Robbery"
        subtitle={`Target: ${target.name} (Lvl ${target.level})`}
        right={<Link to={`/players/${target.id}`} className="btn btn-ghost text-xs">← Back to profile</Link>}>
        <p className="text-xs text-ink-100/55">
          One roll. Asynchronous — they don't need to be online. Win and you take all
          their cash on hand and put them in hospital. Lose and you take a jail sentence.
        </p>
      </Card>

      {result && <OutcomeBanner result={result} />}
      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      <Card title="The odds">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Win chance</div>
            <div className="font-display text-2xl text-money-400 tabular-nums">{Math.round(win_chance * 100)}%</div>
            <div className="text-[12px] text-ink-100/55">Strength + Speed vs their Defence + Speed (incl. buffs).</div>
          </div>
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Energy cost</div>
            <div className="text-yellow-300 font-semibold tabular-nums">{cost.energy}</div>
            <div className="text-[12px] text-ink-100/55">you have {character?.energy ?? 0}</div>
          </div>
        </div>
      </Card>

      <Card title="Outcomes">
        <ul className="text-xs space-y-1 text-ink-100/75">
          <li><b className="text-money-400">Win</b> — take a random <b>50%–100%</b> of their cash on hand. They're hospitalised 10–30 min. <span className="text-yellow-300">50/50 chance they recognise you</span> — and you'll never know which.</li>
          <li><b className="text-blood-400">Lose</b> — they fought you off. They get notified (50/50 reveal); you walk away empty-handed.</li>
        </ul>
        <p className="text-[13px] text-ink-100/45 mt-2">
          No jail time on either outcome. 1h cooldown on you afterwards · 30m immunity for them. New characters are protected for the first <b>3 days</b> after creation. Works on online and offline targets.
        </p>
      </Card>

      {eligibility_error && (
        <Card><p className="text-xs text-blood-400">{eligibility_error}</p></Card>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={!!eligibility_error || busy} onClick={attempt}
            className="btn btn-primary text-sm">
            {busy ? '…' : 'Attempt robbery'}
          </button>
          <button onClick={() => nav(`/players/${target.id}`)} className="btn btn-ghost text-sm">Back out</button>
        </div>
      </Card>
    </div>
  );
}
