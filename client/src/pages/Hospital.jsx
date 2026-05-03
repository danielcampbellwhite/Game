import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

// Mirrors the server formula in routes/hospital.js so the displayed cost
// can tick down live without polling.
function computeTreatCost(info, character) {
  if (!info) return 0;
  const now = Date.now();
  if (info.hospital_until && info.hospital_until > now) {
    const remaining = info.hospital_until - now;
    return Math.max(1000, Math.floor(remaining / 1000) * 10);
  }
  if (character?.health < character?.max_health) {
    return (character.max_health - character.health) * 50;
  }
  return 0;
}

function cityName(id) {
  return (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

//  Other patients in your city — pay their bills 
function OtherPatients({ character, refreshChar }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);   // patient id mid-action
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try { setData(await api.get('/incarceration')); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function refresh() { await Promise.all([refreshChar(), load()]); }

  async function pay(p) {
    setBusy(p.id);
    try {
      const r = await api.post(`/incarceration/${p.id}/pay-hospital`);
      setMsg(`Paid ${p.name}'s bill — ${fmt(r.cost)}.`);
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  return (
    <Card title="Other patients"
      subtitle={`Players admitted in ${cityName(character.city)}. Cover their bill and they walk out at full health.`}
      right={<button onClick={load} className="btn btn-ghost text-xs">↻ Refresh</button>}>
      {msg && <p className="text-xs text-money-400 mb-3">{msg}</p>}

      {!data ? (
        <p className="text-xs text-ink-100/55">Loading…</p>
      ) : data.hospital.length === 0 ? (
        <p className="text-xs text-ink-100/55 text-center py-6">Nobody's in hospital in {cityName(character.city)} right now.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.hospital.map(p => {
            const canPay = (character?.cash || 0) >= p.pay_cost;
            return (
              <div key={p.id} className="rounded-lg border border-ink-100/10 bg-ink-950/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/players/${p.id}`} className="flex items-center gap-2 min-w-0 hover:underline">
                    <span className="min-w-0">
                      <span className="font-medium truncate">{p.name}</span>
                      <span className="ml-2 text-[10px] uppercase text-ink-100/40">L{p.level}</span>
                      {p.gang && <span className="ml-2 text-[10px] text-blood-400">[{p.gang.tag}]</span>}
                      <span className="block text-[11px] text-ink-100/55">{p.rank}</span>
                    </span>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase text-ink-100/50">Discharge in</div>
                    <div className="font-display text-sm text-blue-300">
                      <Timer until={p.hospital_until} onExpire={refresh} />
                    </div>
                  </div>
                </div>
                {p.hospital_reason && (
                  <p className="text-[11px] text-ink-100/55 italic">{p.hospital_reason}</p>
                )}
                <button
                  disabled={busy === p.id || !canPay}
                  onClick={() => pay(p)}
                  className="btn btn-money text-xs w-full"
                  title={canPay ? `Pay ${fmt(p.pay_cost)} for early discharge & full heal.` : 'Not enough cash.'}>
                  {busy === p.id ? '…' : `Pay bill · ${fmt(p.pay_cost)}`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Hospital() {
  const { character, refresh } = useGame();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);
  // Re-render every second so the live discharge cost ticks down.
  const [, setNow] = useState(Date.now());

  async function load() { setInfo(await api.get('/hospital')); }
  useEffect(() => { load(); }, [character?.hospital_until, character?.health]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function treat() {
    setBusy(true); setMsg(null);
    try {
      await api.post('/hospital/treat');
      setMsg('Patched up.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!info) return null;
  const inHospital = info.inHospital && (info.hospital_until > Date.now());
  const treatCost = computeTreatCost(info, character);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card title="Saint Mary's Trauma Centre" subtitle={inHospital ? "You're admitted as a patient — your treatment is under way." : "Walk-in clinic. Pay to top up your health, or visit other patients."}>
        {inHospital && (
          <div className="bg-blue-700/15 border border-blue-400/30 rounded-md p-3 text-sm">
            <div className="font-medium text-blue-300">Receiving treatment</div>
            {character.hospital_reason && (
              <p className="text-ink-100/85 text-sm mt-1">{character.hospital_reason}</p>
            )}
            <p className="text-ink-100/70 text-xs mt-2">
              You're admitted as a patient — doctors are working on you and you'll
              need to recover here before doing anything else. You can wait it out
              and the staff will discharge you in full health, or pay the bill below
              for an immediate discharge. The fee shrinks as your treatment progresses.
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Health</div>
            <div className="font-display text-2xl">{info.health} / {info.max_health}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-100/50">Discharge in</div>
            <div className="font-display text-2xl">
              {inHospital ? <Timer until={info.hospital_until} onExpire={() => { refresh(); load(); }} /> : '—'}
            </div>
          </div>
        </div>

        <button disabled={busy || treatCost === 0 || character.cash < treatCost} className="btn btn-money w-full mt-4" onClick={treat}>
          {busy
            ? '...'
            : treatCost > 0
              ? `Pay ${fmt(treatCost)} bill — early discharge & full heal`
              : 'Already at full health'}
        </button>

        {treatCost > 0 && character.cash < treatCost && (
          <p className="text-blood-400 text-[11px] mt-2">Not enough cash to pay the bill — you'll have to wait it out.</p>
        )}

        {msg && <p className="text-xs text-money-400 mt-2">{msg}</p>}

        {!inHospital && treatCost === 0 && (
          <Link to="/" className="btn btn-ghost w-full mt-3 text-xs">← Back to dashboard</Link>
        )}
      </Card>

      {!inHospital && (
        <OtherPatients character={character} refreshChar={refresh} />
      )}
    </div>
  );
}
