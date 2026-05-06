import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Card from '../components/Card.jsx';
import FactionBadge from '../components/FactionBadge.jsx';

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function PlayerRow({ p }) {
  return (
    <Link to={`/players/${p.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
      <Avatar entity={p} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium truncate">{p.name}</span>
          <span className="text-[12px] uppercase text-ink-100/40">L{p.level}</span>
          {p.online
            ? <span className="text-[12px] uppercase tracking-wide text-money-400"> online</span>
            : <span className="text-[12px] text-ink-100/40">{timeAgo(p.last_active_at)}</span>}
          <FactionBadge faction={p.faction} />
          {p.same_city && (
            <span className="text-[12px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-blood-500/40 text-blood-300">
              in your city
            </span>
          )}
        </div>
        <div className="text-[13px] text-ink-100/55">{p.rank}</div>
      </div>
    </Link>
  );
}

function FactionRepCard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    api.get('/factions/reputation').then(r => { if (live) setData(r); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!data) return null;
  const palette = { gold: 'bg-gold-400', blood: 'bg-blood-500', money: 'bg-money-500' };
  return (
    <Card title="Faction Reputation"
      subtitle={data.total > 0
        ? `Each faction's share of ${data.total.toLocaleString()} crimes committed across the world.`
        : "No-one's pulled a job yet — share starts even and shifts with every crime."}>
      <div className="flex h-3 w-full rounded-full overflow-hidden border border-ink-100/10">
        {data.factions.map(f => (
          <div key={f.id} className={palette[f.palette] || 'bg-ink-700'}
            style={{ width: `${Math.max(2, f.percent)}%` }} title={`${f.name} — ${f.percent}%`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-[13px]">
        {data.factions.map(f => (
          <div key={f.id}>
            <div className="text-ink-100/60">{f.name}</div>
            <div className="tabular-nums">{f.percent}% <span className="text-ink-100/40">· {f.crimes.toLocaleString()}</span></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Players() {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ players: [] });
  const [busy, setBusy] = useState(false);

  async function load(query = '') {
    setBusy(true);
    try {
      const r = await api.get(`/players/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setData(r);
    } catch (e) {
      setData({ players: [], error: e.message });
    } finally { setBusy(false); }
  }

  useEffect(() => { load(''); }, []);

  // Debounce search.
  useEffect(() => {
    if (q.length === 0) { load(''); return; }
    if (q.length < 2) return;
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <FactionRepCard />
      <Card title="Players" subtitle="Search by name to find anyone — online or offline. Locations are private; fly somewhere to see who's there.">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name…"
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blood-500/60"
          autoFocus
        />
        {data.error && <p className="text-xs text-blood-400 mt-2">{data.error}</p>}
        {!q && <p className="text-[13px] text-ink-100/45 mt-2">Showing recently active players. Type 2+ characters to search.</p>}
      </Card>

      {busy && data.players.length === 0 && (
        <Card><p className="text-xs text-ink-100/55">Loading…</p></Card>
      )}

      {!busy && data.players.length === 0 && (
        <Card><p className="text-xs text-ink-100/55">{q ? 'No players match.' : 'No other players yet.'}</p></Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.players.map(p => <PlayerRow key={p.id} p={p} />)}
      </div>
    </div>
  );
}
