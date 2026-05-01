import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function CharacterCreate() {
  const { createCharacter } = useGame();
  const nav = useNavigate();
  const [opts, setOpts] = useState({ cities: [], avatars: [] });
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [city, setCity] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deathSummary, setDeathSummary] = useState(null);

  useEffect(() => {
    api.get('/character/options').then(d => {
      setOpts(d);
      setAvatar(d.avatars[0]);
      setCity(d.cities[0].id);
    });
    // If we just got murdered, show the player a banner before they roll
    // a new character. The summary is one-shot — clear after reading.
    try {
      const raw = sessionStorage.getItem('pvp_death_summary');
      if (raw) {
        setDeathSummary(JSON.parse(raw));
        sessionStorage.removeItem('pvp_death_summary');
      }
    } catch {}
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await createCharacter({ name, avatar, city });
      nav('/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto card">
      {deathSummary && (
        <div className="mb-4 p-4 rounded-lg border border-blood-500/40 bg-blood-700/15">
          <div className="font-display text-xl text-blood-300">☠️ {deathSummary.loser_name} is dead.</div>
          <p className="text-xs text-ink-100/75 mt-1">
            Your character was murdered in a turf war. £{(deathSummary.cash_taken || 0).toLocaleString()} on hand was claimed by your killer.
            Your bank balance, gear, and progression are gone with the body. Roll fresh and start over.
          </p>
        </div>
      )}
      <h2 className="font-display text-3xl text-blood-500 mb-1">Create your character</h2>
      <p className="text-xs text-ink-100/60 mb-4">Pick a name, a face, and a place to start your hustle.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs uppercase text-ink-100/60">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Vito Corleone" className="w-full" />
        </div>
        <div>
          <label className="text-xs uppercase text-ink-100/60 block mb-1">Avatar</label>
          <div className="grid grid-cols-6 gap-2">
            {opts.avatars.map(a => (
              <button type="button" key={a} onClick={() => setAvatar(a)}
                className={`text-3xl py-3 rounded-lg border ${avatar === a ? 'border-blood-500 bg-blood-700/20' : 'border-ink-100/10 hover:bg-ink-800/60'}`}>
                {a}
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
                <div className="text-xl">{c.emoji} <span className="font-medium">{c.name}</span></div>
                <div className="text-[10px] text-ink-100/50 mt-1">drugs ×{c.drugMul} · biz ×{c.businessMul}</div>
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-blood-400 text-xs">{err}</p>}
        <button disabled={busy || !name} type="submit" className="btn btn-primary w-full">{busy ? '...' : 'Hit the streets'}</button>
      </form>
    </div>
  );
}
