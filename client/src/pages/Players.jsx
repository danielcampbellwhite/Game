import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';

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
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium truncate">{p.name}</span>
          <span className="text-[10px] uppercase text-ink-100/40">L{p.at_max_level ? '999+' : p.level}</span>
          {p.online
            ? <span className="text-[10px] uppercase tracking-wide text-money-400">● online</span>
            : <span className="text-[10px] text-ink-100/40">{timeAgo(p.last_active_at)}</span>}
        </div>
        <div className="text-[11px] text-ink-100/55">{p.rank} · {p.city.replace(/_/g, ' ')}</div>
      </div>
    </Link>
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
      <Card title="🌐 Players" subtitle="Search by name to find anyone — online or offline.">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name…"
          className="w-full bg-ink-950/60 border border-ink-100/15 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blood-500/60"
          autoFocus
        />
        {data.error && <p className="text-xs text-blood-400 mt-2">{data.error}</p>}
        {!q && <p className="text-[11px] text-ink-100/45 mt-2">Showing recently active players. Type 2+ characters to search.</p>}
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
