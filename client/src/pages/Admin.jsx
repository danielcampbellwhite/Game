import React, { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// God-mode panel. Visible only to users flagged is_admin in the DB.
// First-time bootstrap is done from the browser console — see README:
//   POST /api/admin/promote-self  with X-Admin-Token: <env value>
// After that the flag persists and ADMIN_TOKEN can be removed.

const NUMERIC_FIELDS = [
  { id: 'level',        label: 'Level',        max: 100 },
  { id: 'cash',         label: 'Cash',         money: true },
  { id: 'bank',         label: 'Bank',         money: true },
  { id: 'dirty_cash',   label: 'Illegal cash', money: true },
  { id: 'reputation',   label: 'Reputation' },
  { id: 'happiness',    label: 'Happiness',    max: 100 },
  { id: 'health',       label: 'Health' },
  { id: 'energy',       label: 'Energy' },
  { id: 'nerve',        label: 'Nerve' },
  { id: 'strength',     label: 'Strength' },
  { id: 'defence',      label: 'Defence' },
  { id: 'speed',        label: 'Speed' },
  { id: 'intelligence', label: 'Intelligence' },
];

function PlayerEditor({ player, onSaved }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(NUMERIC_FIELDS.map(f => [f.id, player[f.id] ?? 0])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  // Reset draft when the selected player changes.
  useEffect(() => {
    setDraft(Object.fromEntries(NUMERIC_FIELDS.map(f => [f.id, player[f.id] ?? 0])));
    setMsg(null); setErr(null);
  }, [player.id]);

  function set(f, v) { setDraft(d => ({ ...d, [f]: v })); }

  async function applyAction(body, label) {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await api.post(`/admin/players/${player.id}/edit`, body);
      onSaved(r.character);
      setMsg(`${label}: ${r.applied || 'no changes'}.`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function saveFields() {
    // Only send fields that actually differ from the loaded values to
    // keep the audit log clean.
    const body = {};
    for (const f of NUMERIC_FIELDS) {
      const v = Math.floor(Number(draft[f.id]));
      if (Number.isFinite(v) && v !== player[f.id]) body[f.id] = v;
    }
    if (Object.keys(body).length === 0) {
      setMsg('No changes to save.');
      return;
    }
    return applyAction(body, 'Saved');
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {NUMERIC_FIELDS.map(f => (
          <label key={f.id} className="block">
            <span className="text-[10px] uppercase text-ink-100/60">{f.label}</span>
            <input
              type="number"
              value={draft[f.id]}
              onChange={e => set(f.id, e.target.value)}
              className="w-full" />
            <span className="text-[10px] text-ink-100/40">
              current: {f.money ? fmt(player[f.id]) : (player[f.id] ?? '—')}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ink-100/10">
        <label className="text-[10px] uppercase text-ink-100/60">Faction</label>
        <select
          defaultValue={player.faction || ''}
          onChange={e => applyAction({ faction: e.target.value }, `Faction → ${e.target.value || 'cleared'}`)}
          disabled={busy}
          className="text-xs">
          <option value="">— unaligned —</option>
          <option value="fraudster">Fraudster</option>
          <option value="mafia">Mafia</option>
          <option value="cartel">Cartel</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-100/10">
        <button disabled={busy} onClick={saveFields} className="btn btn-primary text-xs">
          {busy ? '…' : 'Save fields'}
        </button>
        <button disabled={busy} onClick={() => applyAction({ maxStats: true }, 'Max stats')} className="btn text-xs">Max stats</button>
        <button disabled={busy} onClick={() => applyAction({ fullVitals: true }, 'Full vitals')} className="btn text-xs">Full vitals</button>
        <button disabled={busy} onClick={() => applyAction({ cashAdd: 1_000_000 }, '+£1M')} className="btn btn-money text-xs">+£1M cash</button>
        <button disabled={busy} onClick={() => applyAction({ cashAdd: 100_000_000 }, '+£100M')} className="btn btn-money text-xs">+£100M cash</button>
        <button disabled={busy} onClick={() => applyAction({ releaseFromJail: true }, 'Released from jail')} className="btn text-xs">Release from jail</button>
        <button disabled={busy} onClick={() => applyAction({ releaseFromHospital: true }, 'Discharged')} className="btn text-xs">Discharge from hospital</button>
      </div>

      {msg && <p className="text-money-400 text-xs">{msg}</p>}
      {err && <p className="text-blood-400 text-xs">{err}</p>}
    </div>
  );
}

export default function Admin() {
  const { character } = useGame();
  const [players, setPlayers] = useState(null);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [err, setErr] = useState(null);
  const [seedCount, setSeedCount] = useState(50);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState(null);

  async function load() {
    try {
      const r = await api.get('/admin/players');
      setPlayers(r.players);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { if (character?.is_admin) load(); }, [character?.is_admin]);

  async function seed() {
    setSeedBusy(true); setSeedMsg(null);
    try {
      const r = await api.post('/admin/seed-players', { count: parseInt(seedCount, 10) || 50 });
      setSeedMsg(`Created ${r.created} of ${r.requested} requested NPCs.`);
      await load();
    } catch (e) { setSeedMsg(e.message); }
    finally { setSeedBusy(false); }
  }

  async function purge() {
    if (!confirm('Delete every NPC seeded by /admin/seed-players? This cascades to their inventory/vehicles/etc.')) return;
    setSeedBusy(true); setSeedMsg(null);
    try {
      const r = await api.post('/admin/purge-seeded', {});
      setSeedMsg(`Deleted ${r.deleted} seeded users.`);
      await load();
    } catch (e) { setSeedMsg(e.message); }
    finally { setSeedBusy(false); }
  }

  // Defer the gate check until character is loaded; otherwise an admin
  // refreshing the page would briefly bounce to /.
  if (!character) return null;
  if (!character.is_admin) return <Navigate to="/" replace />;

  const filtered = (players || []).filter(p => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q);
  });
  const selected = (players || []).find(p => p.id === selectedId);

  return (
    <div className="space-y-4">
      <Card title="Admin Panel"
        subtitle="God mode. Edits apply immediately and are written to the system log of the targeted character."
        right={<button onClick={load} className="btn btn-ghost text-xs">↻ Refresh</button>}>
        <p className="text-[11px] text-ink-100/55">
          Logged in as <b>{character.name}</b> (admin). Pick a player below to edit their stats, money, level, or release them from jail/hospital.
        </p>
        {err && <p className="text-blood-400 text-xs mt-2">{err}</p>}
      </Card>

      <Card title="Populate world"
        subtitle="Generate randomised NPC players. They're real DB rows — robbable, murderable, messageable — backdated 30 days so they're past new-character protection.">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] uppercase text-ink-100/60">Count</label>
          <input type="number" min="1" max="500" value={seedCount}
            onChange={e => setSeedCount(e.target.value)}
            disabled={seedBusy}
            className="w-24 text-sm" />
          <button disabled={seedBusy} onClick={seed} className="btn btn-money text-xs">
            {seedBusy ? '…' : 'Seed NPCs'}
          </button>
          <button disabled={seedBusy} onClick={purge} className="btn text-xs">
            Purge all NPCs
          </button>
        </div>
        {seedMsg && <p className="text-money-400 text-xs mt-2">{seedMsg}</p>}
        <p className="text-[10px] text-ink-100/40 mt-2">
          Seeded users have <code>username</code> starting with <code>npc_</code>.
          Purge wipes them along with everything they own (cascade delete).
        </p>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <Card title={`Players ${players ? `(${players.length})` : ''}`}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search by name or username…"
              className="w-full mb-2 text-sm" />
            {!players ? (
              <p className="text-xs text-ink-100/55">Loading…</p>
            ) : (
              <ul className="space-y-1 max-h-[60vh] overflow-y-auto scrollbar pr-1">
                {filtered.map(p => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left rounded-md p-2 border text-xs ${selectedId === p.id ? 'border-blood-500 bg-blood-700/15' : 'border-ink-100/10 bg-ink-950/40 hover:border-ink-100/30'}`}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium truncate">{p.name}</span>
                        <span className="text-[10px] text-ink-100/45">L{p.level}</span>
                      </div>
                      <div className="text-[10px] text-ink-100/55 flex items-baseline justify-between">
                        <span>@{p.username}{p.is_admin ? ' · admin' : ''}</span>
                        <span className="text-money-300">{fmt(p.cash)}</span>
                      </div>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="text-xs text-ink-100/55 p-2">No matches.</li>
                )}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <Card
              title={`Editing ${selected.name}`}
              subtitle={`@${selected.username} · ${selected.city} · status: ${selected.status}`}
              right={<Link to={`/players/${selected.id}`} className="btn btn-ghost text-xs">View profile →</Link>}>
              <PlayerEditor
                player={selected}
                onSaved={(updated) => {
                  // Merge the updated public character back into the list so
                  // the row reflects new values without a full refetch.
                  setPlayers(list => list.map(p => p.id === selected.id ? { ...p, ...updated } : p));
                }} />
            </Card>
          ) : (
            <Card><p className="text-xs text-ink-100/55">Pick a player from the list to edit their account.</p></Card>
          )}
        </div>
      </div>
    </div>
  );
}
