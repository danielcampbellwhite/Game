import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useNavigate } from 'react-router-dom';
import StatAllocator, { initialStats, pointsRemaining, STAT_POINTS } from '../components/StatAllocator.jsx';

export default function CharacterCreate() {
  const { createCharacter } = useGame();
  const nav = useNavigate();
  const [opts, setOpts] = useState({ cities: [] });
  const [name, setName] = useState('');
  const [city, setCity] = useState(null);
  const [stats, setStats] = useState(initialStats);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/character/options').then(d => {
      setOpts(d);
      setCity(d.cities[0].id);
    });
  }, []);

  const remaining = pointsRemaining(stats);
  const canSubmit = !busy && name.trim() && remaining === 0;

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      // Avatar field is no longer surfaced in the UI; submitted as empty.
      await createCharacter({ name, avatar: '', city, stats });
      nav('/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto card">
      <h2 className="font-display text-3xl text-blood-500 mb-1">Create your character</h2>
      <p className="text-xs text-ink-100/60 mb-4">Pick a name, a place to start, and spend your {STAT_POINTS} starting stat points.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs uppercase text-ink-100/60">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Vito Corleone" className="w-full" />
        </div>
        <div>
          <label className="text-xs uppercase text-ink-100/60 block mb-1">Starting city</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {opts.cities.map(c => (
              <button type="button" key={c.id} onClick={() => setCity(c.id)}
                className={`p-3 rounded-lg border text-left ${city === c.id ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/60'}`}>
                <div className="font-medium">{c.name}</div>
                <div className="text-[10px] text-ink-100/50 mt-1">drugs ×{c.drugMul} · biz ×{c.businessMul}</div>
              </button>
            ))}
          </div>
        </div>
        <StatAllocator value={stats} onChange={setStats} />
        {err && <p className="text-blood-400 text-xs">{err}</p>}
        <button disabled={!canSubmit} type="submit" className="btn btn-primary w-full">
          {busy ? '...' : remaining > 0 ? `Spend ${remaining} more point${remaining === 1 ? '' : 's'}` : 'Hit the streets'}
        </button>
      </form>
    </div>
  );
}
