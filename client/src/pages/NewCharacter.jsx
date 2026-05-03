import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card.jsx';

// New-character creation. Reached when the player's character has been
// murdered (status === 'pending_new_character'). Player picks a fresh
// name + avatar + city; the row revives at level 10 with default stats
// and gets a fresh 3-day protection window.
export default function NewCharacter() {
  const { character, refresh } = useGame();
  const nav = useNavigate();
  const [opts, setOpts] = useState({ cities: [] });
  const [name, setName] = useState('');
  const [city, setCity] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/character/options').then(d => {
      setOpts(d);
      setCity(d.cities[0].id);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await api.post('/character/new-character', { name, avatar: '', city });
      await refresh();
      nav('/');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!character) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <div className="text-center">
          <div className="font-display text-3xl text-blood-500">Your character has been killed.</div>
          <p className="text-xs text-ink-100/65 mt-2">
            {character.name} is dead. Everything they owned — bank, cash, businesses, properties, vehicles, inventory, gang — is gone.
            Roll a new character to continue. New characters start at <b>level 10</b> and have <b>3 days of protection</b> from any attack.
          </p>
        </div>
      </Card>

      <Card title="Roll a new character">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs uppercase text-ink-100/60">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={24}
              placeholder="The new boss" className="w-full" autoFocus />
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
          <p className="text-[11px] text-ink-100/55">
            Starting level <b>10</b> · stats reset to <b>1</b> each · cash <b>£500</b> · empty inventory.
          </p>
          {err && <p className="text-blood-400 text-xs">{err}</p>}
          <button disabled={busy || !name.trim()} type="submit" className="btn btn-primary w-full">
            {busy ? '...' : 'Hit the streets'}
          </button>
        </form>
      </Card>
    </div>
  );
}
