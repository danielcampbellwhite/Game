import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { useEventStream } from '../hooks/useEventStream.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

function PlayerSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/players/search?q=${encodeURIComponent(q)}`);
        setResults(r.players || []);
      } catch { setResults([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search player by name…"
        className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" />
      {!!results.length && (
        <ul className="rounded-lg border border-ink-100/10 divide-y divide-ink-100/5 max-h-56 overflow-y-auto scrollbar">
          {results.map(p => (
            <li key={p.id}>
              <button onClick={() => onPick(p)} className="w-full text-left p-2 hover:bg-ink-800/60 transition">
                <span className="text-xl mr-2">{p.avatar}</span>
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-[12px] text-ink-100/50 ml-2">L{p.level} · {p.rank}</span>
                {p.online && <span className="text-[12px] text-money-400 ml-2"> online</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OCPlan() {
  const { id } = useParams();
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);
  const [invitingRole, setInvitingRole] = useState(null);
  useScrollOnMessage(msg);

  async function load() {
    try {
      const r = await api.get(`/oc/plans/${id}`);
      setPlan(r.plan);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-line */ }, [id]);

  useEventStream('oc.role_filled', (p) => { if (String(p.plan_id) === String(id)) load(); });
  useEventStream('oc.role_left',   (p) => { if (String(p.plan_id) === String(id)) load(); });
  useEventStream('oc.cancelled',   (p) => { if (String(p.plan_id) === String(id)) load(); });
  useEventStream('oc.executed',    (p) => {
    if (String(p.plan_id) === String(id)) {
      setResult(p.result);
      load();
      refresh();
    }
  });

  async function invite(roleId, target) {
    setBusy('invite-' + roleId); setMsg(null);
    try {
      await api.post(`/oc/plans/${id}/invite`, { role_id: roleId, target_id: target.id });
      setMsg(`Invite sent to ${target.name} for ${roleId.replace(/_/g,' ')}.`);
      setInvitingRole(null);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function leave() {
    if (!confirm('Leave this plan?')) return;
    setBusy('leave'); setMsg(null);
    try {
      await api.post(`/oc/plans/${id}/leave`);
      nav('/oc');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function cancelPlan() {
    if (!confirm('Cancel the entire plan?')) return;
    setBusy('cancel'); setMsg(null);
    try {
      await api.post(`/oc/plans/${id}/cancel`);
      nav('/oc');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function execute() {
    if (!confirm('Execute the heist now?')) return;
    setBusy('execute'); setMsg(null);
    try {
      const r = await api.post(`/oc/plans/${id}/execute`);
      setResult(r.result);
      await refresh();
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!plan) return null;
  const isLeader = plan.leader_id === character?.id;
  const myRole = plan.roles.find(r => r.assigned?.id === character?.id);

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-blood-400">{msg}</p></Card>}

      {result && (
        <Card title={result.outcome === 'full' ? ' Heist succeeded' : result.outcome === 'partial' ? ' Partial success' : ' Heist busted'}>
          {result.outcome !== 'bust' ? (
            <div>
              <p className="text-sm text-money-400">Total payout: <span className="font-display text-lg">{fmt(result.payout_total)}</span></p>
              <ul className="text-xs text-ink-100/75 mt-2 space-y-1">
                {result.splits.map(s => (
                  <li key={s.char_id}>
                    {s.name} ({s.role.replace(/_/g,' ')}): +{fmt(s.cut)} +{s.xp}xp{s.levels > 0 ? ` · LEVEL UP ×${s.levels}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-sm text-blood-400">The crew got caught out. Independent rolls:</p>
              <ul className="text-xs text-ink-100/75 mt-2 space-y-1">
                {result.splits.map(s => (
                  <li key={s.char_id}>
                    {s.name}: {s.jailed ? ` jailed ${s.jailed}m` : s.hospital ? ` hospital ${s.hospital}m` : ' escaped'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="font-display text-3xl">{plan.crime?.emoji} {plan.crime?.name}</div>
            <p className="text-xs text-ink-100/55 mt-1">{plan.crime?.desc}</p>
            <div className="text-[13px] text-ink-100/45 mt-2">
              Payout {fmt(plan.crime?.payoutMin)}–{fmt(plan.crime?.payoutMax)} · Risk {plan.crime?.risk} · Energy {plan.crime?.energy}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] uppercase text-ink-100/55">Crew</div>
            <div className="font-display text-2xl tabular-nums">{plan.filled} / {plan.total}</div>
            <div className="text-[12px] uppercase text-ink-100/45 mt-1">{plan.status}</div>
          </div>
        </div>
        {plan.status === 'recruiting' || plan.status === 'ready' ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {isLeader && plan.ready && (
              <button disabled={busy === 'execute'} onClick={execute} className="btn btn-money text-xs">
                {busy === 'execute' ? '…' : ' Execute heist'}
              </button>
            )}
            {isLeader && (
              <button disabled={busy === 'cancel'} onClick={cancelPlan} className="btn btn-ghost text-xs">
                {busy === 'cancel' ? '…' : 'Cancel plan'}
              </button>
            )}
            {!isLeader && myRole && (
              <button disabled={busy === 'leave'} onClick={leave} className="btn btn-ghost text-xs">
                {busy === 'leave' ? '…' : 'Leave plan'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-ink-100/45 mt-3 italic">Plan is {plan.status}.</p>
        )}
      </Card>

      <Card title="Roles">
        <div className="space-y-3">
          {plan.roles.map(r => (
            <div key={r.role_id} className={`rounded-lg p-3 border ${r.filled ? 'border-money-500/30 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-[12px] text-ink-100/55">{r.stat} ≥ {r.min} · {Math.round((r.share || 0) * 100)}%</div>
              </div>
              {r.filled ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-2xl">{r.assigned?.avatar}</span>
                  <Link to={`/players/${r.assigned?.id}`} className="text-sm font-medium hover:text-blood-400">{r.assigned?.name}</Link>
                  <span className="text-[12px] text-ink-100/45 ml-1">L{r.assigned?.level}</span>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-ink-100/55 mt-1 italic">Open</p>
                  {isLeader && plan.status === 'recruiting' && r.role_id !== plan.roles[0].role_id && (
                    <div className="mt-2">
                      {invitingRole === r.role_id ? (
                        <PlayerSearch onPick={(p) => invite(r.role_id, p)} />
                      ) : (
                        <button onClick={() => setInvitingRole(r.role_id)} className="btn btn-ghost text-xs">Invite a player</button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
