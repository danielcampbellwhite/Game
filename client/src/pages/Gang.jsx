import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useEventStream } from '../hooks/useEventStream.js';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

const ROLE_STYLE = {
  leader:  'text-gold-400',
  officer: 'text-money-400',
  soldier: 'text-yellow-300',
  recruit: 'text-ink-100/60',
};

function timeShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function DeclareWarForm({ gangs, cities, onSubmit, busy }) {
  const [target, setTarget] = useState('');
  const [city, setCity] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (target && city) onSubmit(parseInt(target, 10), city); }} className="space-y-3">
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Target gang</label>
        <select value={target} onChange={e=>setTarget(e.target.value)}
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm">
          <option value="">— pick a rival —</option>
          {gangs.map(g => <option key={g.id} value={g.id}>{g.name} [{g.tag}]</option>)}
        </select>
      </div>
      <div>
        <label className="text-[12px] uppercase text-ink-100/55">Contested city</label>
        <select value={city} onChange={e=>setCity(e.target.value)}
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm">
          <option value="">— pick a city —</option>
          {cities.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
      </div>
      <p className="text-[13px] text-ink-100/55">
        War lasts 24h. KOs and murders between members of the two gangs in the chosen city earn points.
        Leader of the score at the end holds the city for 7 days.
      </p>
      <button disabled={busy || !target || !city} className="btn btn-primary w-full text-xs">
        {busy ? '…' : 'Declare war'}
      </button>
    </form>
  );
}

function MemberRow({ member, you, gang, onAct }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(member.title || '');
  const isLeader = you?.role === 'leader';
  const canTitle = (you?.role === 'leader' || you?.role === 'officer');
  const canKick = !!you && (
    (you.role === 'leader' && member.role !== 'leader') ||
    (you.role === 'officer' && (member.role === 'recruit' || member.role === 'soldier'))
  );

  return (
    <div className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">{member.avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link to={`/players/${member.char_id}`} className="font-medium hover:text-blood-400">{member.name}</Link>
            <span className={`text-[12px] uppercase tracking-wide ${ROLE_STYLE[member.role]}`}>{member.role}</span>
            <span className="text-[12px] text-ink-100/40">L{member.level}</span>
          </div>
          {(member.title || canTitle) && !editing && (
            <div className="text-[13px] text-ink-100/55 italic">
              {member.title ? `“${member.title}”` : <span className="text-ink-100/30">no title</span>}
            </div>
          )}
          {editing && (
            <div className="flex gap-1 mt-1">
              <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={32}
                className="flex-1 bg-ink-950/60 border border-ink-100/15 rounded-md px-2 py-1 text-xs" />
              <button className="btn btn-primary text-[12px] px-2" onClick={async () => { await onAct('title', { target_id: member.char_id, title }); setEditing(false); }}>Save</button>
              <button className="btn btn-ghost text-[12px] px-2" onClick={() => { setTitle(member.title || ''); setEditing(false); }}>Cancel</button>
            </div>
          )}
        </div>
      </div>
      <div className="text-[12px] text-ink-100/40 mt-1">contributed {fmt(member.contributed)}</div>
      {(canTitle && !editing && !member.is_self) && (
        <div className="mt-2 flex flex-wrap gap-1">
          <button onClick={() => setEditing(true)} className="btn btn-ghost text-[12px] px-2">Set title</button>
          {isLeader && member.role !== 'leader' && (
            <>
              {member.role !== 'officer' && <button onClick={() => onAct('promote', { target_id: member.char_id, role: 'officer' })} className="btn btn-ghost text-[12px] px-2">→ Officer</button>}
              {member.role !== 'soldier' && <button onClick={() => onAct('promote', { target_id: member.char_id, role: 'soldier' })} className="btn btn-ghost text-[12px] px-2">→ Soldier</button>}
              {member.role !== 'recruit' && <button onClick={() => onAct('promote', { target_id: member.char_id, role: 'recruit' })} className="btn btn-ghost text-[12px] px-2">→ Recruit</button>}
              <button onClick={() => { if (confirm('Hand over leadership?')) onAct('promote', { target_id: member.char_id, role: 'leader' }); }} className="btn btn-ghost text-[12px] px-2 text-gold-400">→ Leader</button>
            </>
          )}
          {canKick && (
            <button onClick={() => { if (confirm(`Kick ${member.name}?`)) onAct('kick', { target_id: member.char_id }); }} className="btn btn-ghost text-[12px] px-2 text-blood-400">Kick</button>
          )}
        </div>
      )}
    </div>
  );
}

function GangChat({ gangId, you }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  async function load() {
    const r = await api.get(`/gangs/${gangId}/chat`);
    setMessages(r.messages || []);
  }
  useEffect(() => { load(); /* eslint-disable-line */ }, [gangId]);

  useEventStream('gang.chat', (p) => {
    if (!p?.message) return;
    if (String(p.gang_id) === String(gangId)) {
      setMessages(prev => [...prev, { ...p.message, mine: p.message.sender_id === you.char_id }]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/gangs/${gangId}/chat`, { body });
      setText('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col h-[50vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar p-2 space-y-2">
        {messages.length === 0 && <p className="text-xs text-ink-100/45 italic text-center mt-4">No chat yet. Break the silence.</p>}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.mine ? 'bg-blood-700/40' : 'bg-ink-800/60'}`}>
              {!m.mine && (
                <div className="text-[12px] text-ink-100/55 mb-0.5">
                  <span className="mr-1">{m.sender_avatar}</span>{m.sender_name}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="text-[12px] text-ink-100/45 mt-0.5">{timeShort(m.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-blood-400 px-3 pb-2">{error}</p>}
      <form onSubmit={send} className="border-t border-ink-100/10 p-2 flex gap-2">
        <input value={text} onChange={e=>setText(e.target.value)} maxLength={1500}
          placeholder="Message your gang…" disabled={busy}
          className="flex-1 bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" />
        <button disabled={busy || !text.trim()} className="btn btn-primary text-xs">
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

// Leader-only management card: set the treasury cut, climb the
// gang-level ladder. Members see treasury / tier in the header card
// above; this is the "make decisions" surface.
function GangManagement({ gang, onChange }) {
  const [levels, setLevels] = useState(null);
  const [cutInput, setCutInput] = useState(Math.round((gang.crime_cut_pct || 0) * 100));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get(`/gangs/${gang.id}/levels`).then(r => setLevels(r.levels)).catch(() => {});
  }, [gang.id]);

  async function setCut() {
    setBusy('cut'); setMsg(null);
    try {
      const pct = Math.max(0, Math.min(15, parseFloat(cutInput) || 0)) / 100;
      await api.post(`/gangs/${gang.id}/cut`, { pct });
      setMsg(`Cut set to ${Math.round(pct * 100)}%.`);
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function upgrade() {
    setBusy('upgrade'); setMsg(null);
    try {
      const r = await api.post(`/gangs/${gang.id}/upgrade`);
      setMsg(`Upgraded to tier ★ ${r.level}.`);
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const next = levels?.find(l => l.level === (gang.level || 1) + 1);
  const canAfford = next && (gang.treasury || 0) >= next.cost;

  return (
    <Card title=" Leader controls" subtitle="Skim crime payouts into the treasury. Spend it to climb the ladder.">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[12px] uppercase text-ink-100/55 mb-1">Treasury cut</div>
          <p className="text-[13px] text-ink-100/65 mb-2">
            % of every member's successful crime payout that flows into the gang vault. 0–15%.
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={15} step={1} value={cutInput}
              onChange={e => setCutInput(e.target.value)}
              className="w-20" />
            <span className="text-xs text-ink-100/55">%</span>
            <button onClick={setCut} disabled={busy === 'cut'} className="btn btn-ghost text-xs ml-auto">
              {busy === 'cut' ? '…' : 'Set cut'}
            </button>
          </div>
        </div>
        <div>
          <div className="text-[12px] uppercase text-ink-100/55 mb-1">Next tier</div>
          {next ? (
            <>
              <p className="text-[13px] text-ink-100/65">
                <span className="text-ink-50">★ {next.level}</span> — {next.perk}
              </p>
              <div className="flex items-baseline justify-between gap-2 mt-2">
                <span className="text-xs text-money-400 tabular-nums">{fmt(next.cost)}</span>
                <button onClick={upgrade} disabled={busy === 'upgrade' || !canAfford}
                  className="btn btn-primary text-xs">
                  {busy === 'upgrade' ? '…' : canAfford ? 'Upgrade' : `Need ${fmt(next.cost - (gang.treasury || 0))}`}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-money-400">Top tier reached. ★ {gang.level}</p>
          )}
        </div>
      </div>
      {levels && (
        <div className="mt-4 pt-3 border-t border-ink-100/10">
          <div className="text-[12px] uppercase text-ink-100/55 mb-1">Tier ladder</div>
          <ul className="space-y-1 text-[13px]">
            {levels.map(l => {
              const have = (gang.level || 1) >= l.level;
              return (
                <li key={l.level} className={have ? 'text-ink-100/85' : 'text-ink-100/45'}>
                  <span className={`inline-block w-8 tabular-nums ${have ? 'text-money-400' : ''}`}>★ {l.level}</span>
                  <span className="text-ink-100/55 mr-2">{l.cost > 0 ? fmt(l.cost) : '—'}</span>
                  {l.perk}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {msg && <p className="text-[13px] text-money-300 mt-2">{msg}</p>}
    </Card>
  );
}

export default function Gang() {
  const { id: viewId } = useParams();
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [war, setWar] = useState(null);
  const [showDeclare, setShowDeclare] = useState(false);
  const [allGangs, setAllGangs] = useState([]);
  const [allCities, setAllCities] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [depAmount, setDepAmount] = useState('');
  const [withAmount, setWithAmount] = useState('');
  const [, tick] = useState(0);
  useScrollOnMessage(msg);

  async function load() {
    let gangId = viewId;
    if (!gangId) {
      const me = await api.get('/gangs/me');
      if (!me.membership) { setData({ noGang: true }); return; }
      gangId = me.membership.gang.id;
    }
    const r = await api.get(`/gangs/${gangId}`);
    setData(r);
    // Fetch active war for the displayed gang too.
    try {
      const w = await api.get(`/gangs/${gangId}/war`);
      setWar(w.war);
    } catch { setWar(null); }
  }
  useEffect(() => { load(); /* eslint-disable-line */ }, [viewId]);

  // 1Hz tick so the war countdown updates live.
  useEffect(() => {
    if (!war) return;
    const id = setInterval(() => tick(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [war?.id]);

  async function openDeclare() {
    setShowDeclare(true);
    try {
      const [g, opts] = await Promise.all([api.get('/gangs'), api.get('/character/options')]);
      setAllGangs((g.gangs || []).filter(x => x.id !== data.gang.id));
      setAllCities(opts.cities || []);
    } catch (e) { setMsg(e.message); }
  }

  // Live updates for any gang state changes that affect the displayed gang.
  useEventStream('gang.member.joined', () => load());
  useEventStream('gang.member.left', () => load());
  useEventStream('gang.member.kicked', () => load());
  useEventStream('gang.role_changed', () => load());
  useEventStream('gang.title_changed', () => load());
  useEventStream('gang.leader_changed', () => load());
  useEventStream('gang.treasury', () => load());
  useEventStream('gang.war.declared', () => load());
  useEventStream('gang.disbanded', () => { setMsg('Your gang was disbanded.'); load(); refresh(); });
  useEventStream('gang.kicked', () => { setMsg('You were kicked from the gang.'); load(); refresh(); });

  async function act(action, body = {}) {
    setBusy(action); setMsg(null);
    try {
      const r = await api.post(`/gangs/${data.gang.id}/${action}`, body);
      if (r.character) { /* server already returned updated cash */ }
      await refresh(); await load();
      setDepAmount(''); setWithAmount('');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  async function leave() {
    if (!confirm('Leave the gang?')) return;
    setBusy('leave'); setMsg(null);
    try {
      await api.post(`/gangs/${data.gang.id}/leave`);
      await refresh();
      nav('/gangs');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }
  async function disband() {
    if (!confirm('Disband the gang? Treasury refunds to you.')) return;
    setBusy('disband'); setMsg(null);
    try {
      await api.post(`/gangs/${data.gang.id}/disband`);
      await refresh();
      nav('/gangs');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function declareWar(targetGangId, city) {
    setBusy('declare-war'); setMsg(null);
    try {
      await api.post(`/gangs/${data.gang.id}/declare-war`, { target_gang_id: targetGangId, city });
      setShowDeclare(false);
      setMsg('War declared. The clock is ticking.');
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  if (data.noGang) {
    return (
      <Card>
        <p className="text-sm text-ink-100/60">You're not in a gang. <Link to="/gangs" className="underline text-money-400">Browse gangs</Link>.</p>
      </Card>
    );
  }

  const g = data.gang;
  const you = data.you?.is_member ? { role: data.you.role, title: data.you.title, char_id: character.id } : null;
  const isLeader = you?.role === 'leader';
  const canManage = isLeader || you?.role === 'officer';

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs text-money-400">{msg}</p></Card>}

      <Card>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="font-display text-3xl">{g.name} <span className="text-base text-ink-100/55 font-mono">[{g.tag}]</span></div>
            <p className="text-xs text-ink-100/55 mt-1">{g.description || <span className="italic text-ink-100/40">No description.</span>}</p>
            <div className="text-[12px] text-ink-100/40 mt-2">{g.member_count} member{g.member_count === 1 ? '' : 's'} · founded {new Date(g.founded_at).toLocaleDateString()}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] uppercase text-ink-100/50">Tier</div>
            <div className="font-display text-2xl text-blood-300 tabular-nums">★ {g.level || 1}</div>
            <div className="text-[12px] uppercase text-ink-100/50 mt-2">Treasury</div>
            <div className="font-display text-2xl text-gold-400 tabular-nums">{fmt(g.treasury)}</div>
            <div className="text-[12px] text-ink-100/45 mt-1">Cut: {Math.round((g.crime_cut_pct || 0) * 100)}%</div>
          </div>
        </div>
        {you && (
          <div className="mt-3 pt-3 border-t border-ink-100/10 flex flex-wrap items-baseline gap-3 text-xs">
            <span>You: <span className={`uppercase ${ROLE_STYLE[you.role]}`}>{you.role}</span></span>
            {you.title && <span className="text-ink-100/60 italic">“{you.title}”</span>}
            {!isLeader && <button disabled={busy === 'leave'} onClick={leave} className="btn btn-ghost text-[13px] ml-auto">{busy === 'leave' ? '…' : 'Leave gang'}</button>}
            {isLeader && <button disabled={busy === 'disband'} onClick={disband} className="btn btn-ghost text-[13px] ml-auto text-blood-400">{busy === 'disband' ? '…' : 'Disband'}</button>}
          </div>
        )}
      </Card>

      {isLeader && <GangManagement gang={g} onChange={load} />}

      {war && (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[12px] uppercase text-blood-400 tracking-wide"> AT WAR</div>
              <div className="text-sm mt-1">
                Contested city: <b>{war.contested_city_name}</b>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] uppercase text-ink-100/55">Time remaining</div>
              <div className="font-mono text-lg tabular-nums">
                {(() => {
                  const left = Math.max(0, Math.floor((war.ends_at - Date.now()) / 1000));
                  const h = Math.floor(left / 3600);
                  const m = Math.floor((left % 3600) / 60);
                  const s = left % 60;
                  return `${h}h ${m}m ${s}s`;
                })()}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={`rounded-lg p-3 border ${war.you_role === 'a' ? 'border-money-500/40 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
              <div className="text-[12px] text-ink-100/55">{war.you_role === 'a' ? 'YOUR GANG' : 'DECLARER'}</div>
              <div className="font-display text-2xl text-money-400 tabular-nums">{war.score_a}</div>
            </div>
            <div className={`rounded-lg p-3 border ${war.you_role === 'b' ? 'border-money-500/40 bg-money-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
              <div className="text-[12px] text-ink-100/55">{war.you_role === 'b' ? 'YOUR GANG' : 'TARGET'}</div>
              <div className="font-display text-2xl text-blood-400 tabular-nums">{war.score_b}</div>
            </div>
          </div>
          <p className="text-[13px] text-ink-100/55 mt-3">
            KO an opposing-gang member in {war.contested_city_name} → +1 point. Murder them → +5.
            Whoever leads when the clock runs out holds the city for 7 days.
          </p>
        </Card>
      )}

      {isLeader && !war && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-100/70">No active war.</p>
            <button onClick={openDeclare} disabled={busy === 'declare-war'} className="btn btn-primary text-xs">
              {busy === 'declare-war' ? '…' : ' Declare war'}
            </button>
          </div>
        </Card>
      )}

      {showDeclare && (
        <Card title="Declare war" right={<button onClick={() => setShowDeclare(false)} className="btn btn-ghost text-xs">Cancel</button>}>
          <DeclareWarForm gangs={allGangs} cities={allCities} onSubmit={declareWar} busy={busy === 'declare-war'} />
        </Card>
      )}

      {you && (
        <Card title=" Treasury">
          <div className="grid sm:grid-cols-2 gap-3">
            <form onSubmit={e => { e.preventDefault(); act('deposit', { amount: parseInt(depAmount, 10) }); }}>
              <label className="text-[12px] uppercase text-ink-100/55">Deposit</label>
              <div className="flex gap-2 mt-1">
                <input value={depAmount} onChange={e=>setDepAmount(e.target.value)} type="number" min="1"
                  className="flex-1 bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" placeholder="amount £" />
                <button disabled={busy === 'deposit' || !depAmount} className="btn btn-money text-xs">{busy === 'deposit' ? '…' : 'Deposit'}</button>
              </div>
            </form>
            {canManage && (
              <form onSubmit={e => { e.preventDefault(); act('withdraw', { amount: parseInt(withAmount, 10) }); }}>
                <label className="text-[12px] uppercase text-ink-100/55">Withdraw {!canManage && <span className="text-ink-100/40">(officer+)</span>}</label>
                <div className="flex gap-2 mt-1">
                  <input value={withAmount} onChange={e=>setWithAmount(e.target.value)} type="number" min="1"
                    className="flex-1 bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm" placeholder="amount £" />
                  <button disabled={busy === 'withdraw' || !withAmount} className="btn text-xs">{busy === 'withdraw' ? '…' : 'Withdraw'}</button>
                </div>
              </form>
            )}
          </div>
        </Card>
      )}

      <Card title={`Members (${g.member_count})`}>
        <div className="grid sm:grid-cols-2 gap-3">
          {g.members.map(m => (
            <MemberRow key={m.char_id} member={m} you={you} gang={g} onAct={act} />
          ))}
        </div>
      </Card>

      {you && <Card title=" Gang chat"><GangChat gangId={g.id} you={you} /></Card>}
    </div>
  );
}
