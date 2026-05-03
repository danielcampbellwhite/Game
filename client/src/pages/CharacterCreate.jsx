import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useNavigate } from 'react-router-dom';
import StatAllocator, { initialStats, pointsRemaining, STAT_POINTS } from '../components/StatAllocator.jsx';
import FactionPicker from '../components/FactionPicker.jsx';
import StarterPicker, { emptyStarter, starterComplete } from '../components/StarterPicker.jsx';

export default function CharacterCreate() {
  const { createCharacter } = useGame();
  const nav = useNavigate();
  const [opts, setOpts] = useState({ cities: [], factions: [] });
  const [name, setName] = useState('');
  const [city, setCity] = useState(null);
  const [faction, setFaction] = useState(null);
  const [gender, setGender] = useState(null);
  const [stats, setStats] = useState(initialStats);
  const [starter, setStarter] = useState(emptyStarter);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    api.get('/character/options').then(d => {
      setOpts(d);
      setCity(d.cities[0].id);
    });
  }, []);

  const remaining = pointsRemaining(stats);
  // Whenever the starting city changes, drop the previously-picked
  // house — the per-city catalogue is different.
  useEffect(() => { setStarter(s => ({ ...s, house_id: null })); }, [city]);

  const starterOk = starterComplete(starter) && (() => {
    const cars = opts?.starter?.cars || [];
    const houses = (opts?.starter?.housesByCity && opts.starter.housesByCity[city]) || [];
    const bizs = opts?.starter?.businesses || [];
    const carP   = cars.find(c => c.id === starter.car_id)?.price || 0;
    const houseP = houses.find(h => h.id === starter.house_id)?.price || 0;
    const bizP   = bizs.find(b => b.id === starter.business_id)?.price || 0;
    return (carP + houseP + bizP) <= (opts?.starter?.budget || 0);
  })();
  const canSubmit = !busy && name.trim() && faction && gender && remaining === 0 && starterOk;

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      // Avatar field is no longer surfaced in the UI; submitted as empty.
      await createCharacter({ name, avatar: '', city, stats, faction, gender, starter });
      nav('/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function rollName() {
    setRolling(true);
    try {
      const q = gender ? `?gender=${gender}` : '';
      const r = await api.get(`/character/random-name${q}`);
      if (r?.name) setName(r.name);
    } catch {} finally { setRolling(false); }
  }

  return (
    <div className="max-w-2xl mx-auto card">
      <h2 className="font-display text-3xl text-blood-500 mb-1">Create your character</h2>
      <p className="text-xs text-ink-100/60 mb-4">Pick a name, a place to start, and spend your {STAT_POINTS} starting stat points.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs uppercase text-ink-100/60">Name</label>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} maxLength={32} placeholder="Vito Corleone" className="flex-1" />
            <button type="button" onClick={rollName} disabled={rolling} className="btn btn-ghost text-xs whitespace-nowrap">
              {rolling ? '…' : 'Random'}
            </button>
          </div>
          {!gender && <p className="text-[10px] text-ink-100/40 mt-1">Pick a gender below to weight the random names.</p>}
        </div>

        <div>
          <label className="text-xs uppercase text-ink-100/60 block mb-1">Gender</label>
          <div className="grid grid-cols-2 gap-2">
            {['male', 'female'].map(g => (
              <button type="button" key={g} onClick={() => setGender(g)}
                className={`p-2 rounded-lg border text-center capitalize ${gender === g ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/60'}`}>
                {g}
              </button>
            ))}
          </div>
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
        <FactionPicker factions={opts.factions || []} value={faction} onChange={setFaction} />
        <StatAllocator value={stats} onChange={setStats} />
        <StarterPicker starter={opts.starter} city={city} value={starter} onChange={setStarter} />
        {err && <p className="text-blood-400 text-xs">{err}</p>}
        <button disabled={!canSubmit} type="submit" className="btn btn-primary w-full">
          {busy ? '...'
            : !faction ? 'Pick a faction'
            : !gender ? 'Pick a gender'
            : remaining > 0 ? `Spend ${remaining} more point${remaining === 1 ? '' : 's'}`
            : !starterOk ? 'Finish your starter pack'
            : 'Hit the streets'}
        </button>
      </form>
    </div>
  );
}
