import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import LogFeed from '../components/LogFeed.jsx';
import Money, { fmt } from '../components/Money.jsx';
import Timer from '../components/Timer.jsx';

function Stat({ label, base, buff = 0, cap = null, permanent = false, accuracyOnly = false }) {
  // Accuracy is a pure-buff stat (base 0); the rest are base + buff.
  const total = accuracyOnly ? buff : (base || 0) + (buff || 0);
  const atCap = cap != null && (base || 0) >= cap;
  return (
    <div>
      <div className="text-[10px] uppercase text-ink-100/50">{label}</div>
      <div>
        <span>{total}</span>
        {!permanent && buff > 0 && <span className="ml-1 text-[10px] text-money-400">(+{buff})</span>}
        {cap != null && !accuracyOnly && (
          atCap
            ? <span className="ml-1 text-[10px] text-money-400 uppercase">max</span>
            : <span className="ml-1 text-[10px] text-ink-100/40">/ {cap}</span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { character, log, refresh } = useGame();
  const [daily, setDaily] = useState(null);
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [equipBusy, setEquipBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [invMsg, setInvMsg] = useState(null);
  useScrollOnMessage(msg);
  useScrollOnMessage(invMsg);
  const nav = useNavigate();

  async function loadDaily() {
    setDaily(await api.get('/daily'));
  }
  async function loadInv() {
    setInv(await api.get('/inventory'));
  }
  useEffect(() => { loadDaily(); loadInv(); }, []);

  async function claim() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/daily/claim');
      setMsg(`+${fmt(r.reward)} (streak ${r.streak})`);
      await refresh();
      await loadDaily();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function equip(kind, item_id) {
    setEquipBusy(`eq-${kind}-${item_id}`); setInvMsg(null);
    try { await api.post('/inventory/equip', { kind, item_id }); await refresh(); await loadInv(); }
    catch (e) { setInvMsg(e.message); }
    finally { setEquipBusy(null); }
  }

  if (!character) return null;
  const c = character;
  const inJail = c.jail_until && c.jail_until > Date.now();
  const inHospital = c.hospital_until && c.hospital_until > Date.now();
  const travelling = c.travel_until && c.travel_until > Date.now();
  const eq = inv?.equipped;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title={c.name} subtitle={`${c.rank} · Level ${c.at_max_level ? '999+' : c.level}${c.prestige ? ` · Prestige ${c.prestige}` : ''}`} className="md:col-span-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Strength"     base={c.strength}     buff={c.buffs?.strength?.current} cap={c.stat_caps?.strength} />
          <Stat label="Defence"      base={c.defence}      buff={c.buffs?.defence?.current}  cap={c.stat_caps?.defence}  />
          <Stat label="Speed"        base={c.speed}        buff={c.buffs?.speed?.current}    cap={c.stat_caps?.speed}    />
          <Stat label="Intelligence" base={c.intelligence} cap={c.stat_caps?.intelligence}   permanent />
          <Stat label="Accuracy"     base={0}              buff={c.buffs?.accuracy?.current} accuracyOnly />
          <div><div className="text-[10px] uppercase text-ink-100/50">Cash</div><Money value={c.cash} /></div>
          <div><div className="text-[10px] uppercase text-ink-100/50">Bank</div><Money value={c.bank} /></div>
          <div><div className="text-[10px] uppercase text-ink-100/50">Dirty</div><Money value={c.dirty_cash} dirty /></div>
          <div><div className="text-[10px] uppercase text-ink-100/50">Reputation</div><div>{c.reputation}</div></div>
        </div>
        <div className="mt-3 pt-3 border-t border-ink-100/10 flex items-baseline justify-between">
          <span className="text-xs uppercase text-ink-100/60 tracking-wide">Net Worth</span>
          <span className="text-xl font-display text-gold-400 tabular-nums">{fmt(c.net_worth)}</span>
        </div>
      </Card>

      <Card title="Daily reward">
        {daily?.ready ? (
          <>
            <p className="text-sm">Streak: <span className="text-gold-400">{daily.streak} days</span></p>
            <p className="text-xs text-ink-100/60 my-2">+£{(400 + c.level * 100).toLocaleString()}{((daily.streak + 1) % 7 === 0) && ' + full vital refill'}</p>
            <button disabled={busy} className="btn btn-money w-full" onClick={claim}>{busy ? '...' : 'Claim today'}</button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-100/70">Log in tomorrow for your daily bonus.</p>
            {daily?.streak > 0 && <p className="text-xs text-ink-100/50">Current streak: {daily.streak} day{daily.streak === 1 ? '' : 's'}</p>}
          </>
        )}
        {msg && <p className="text-xs text-money-400 mt-2">{msg}</p>}
      </Card>

      {(inJail || inHospital || travelling) && (
        <Card title="Status" className="md:col-span-3">
          {inJail && (
            <div className="flex items-center justify-between">
              <p>In jail. <Timer until={c.jail_until} prefix="Out in " onExpire={refresh} /></p>
              <button className="btn" onClick={() => nav('/jail')}>Open cell options</button>
            </div>
          )}
          {inHospital && (
            <div className="flex items-center justify-between mt-2">
              <p>In hospital. <Timer until={c.hospital_until} prefix="Out in " onExpire={refresh} /></p>
              <button className="btn" onClick={() => nav('/hospital')}>Pay for treatment</button>
            </div>
          )}
          {travelling && (
            <div className="mt-2">
              <p>Travelling to {c.travel_to}. <Timer until={c.travel_until} prefix="Arriving in " onExpire={refresh} /></p>
            </div>
          )}
        </Card>
      )}

      {invMsg && <Card className="md:col-span-3"><p className="text-xs text-blood-400">{invMsg}</p></Card>}

      {inv && (
        <>
          <Card title="Equipped" className="md:col-span-3" right={
            <Link className="btn btn-ghost text-xs" to="/gun-store">→ Gun Store</Link>
          }>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>Weapon: <b>{eq.weapon === 'fists' ? 'Fists' : (inv.weapons.find(w => w.id === eq.weapon)?.name || eq.weapon)}</b></div>
              <div>Armour: <b>{eq.armour === 'none' ? 'No Armour' : (inv.armours.find(a => a.id === eq.armour)?.name || eq.armour)}</b></div>
            </div>
          </Card>

          <Card title="Garage" subtitle={`${inv.vehicles.length} vehicles · sell stolen ones at the Chop Shop, trade in legit ones the same place.`}
            className="md:col-span-3"
            right={
              <div className="flex gap-2 text-xs">
                <Link className="btn btn-ghost" to="/dealership">→ Car Dealer</Link>
                <Link className="btn btn-ghost" to="/chop-shop">→ Chop Shop</Link>
              </div>
            }>
            {!inv.vehicles.length ? <p className="text-sm text-ink-100/60">No vehicles yet.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inv.vehicles.map(v => (
                  <div key={v.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                    <div className="font-medium">{v.maker} {v.name}</div>
                    <div className="text-[11px] text-ink-100/60">Tier {v.tier} · book {fmt(v.bookPrice)}</div>
                    <div className="text-[10px] text-ink-100/40 mt-0.5">{v.acquired_via === 'stolen' ? 'stolen' : 'bought'} · in {v.cityName}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Weapons" className="md:col-span-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className={`rounded-lg p-3 border ${eq.weapon === 'fists' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="font-medium">Fists</div>
                <div className="text-[11px] text-ink-100/60">DMG 4 · melee</div>
                {eq.weapon !== 'fists' && <button className="btn text-xs w-full mt-2" onClick={() => equip('weapon', 'fists')}>Equip</button>}
              </div>
              {inv.weapons.filter(w => w.id !== 'fists').map(w => (
                <div key={w.id} className={`rounded-lg p-3 border ${eq.weapon === w.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                  <div className="font-medium">{w.name}</div>
                  {w.maker && <div className="text-[10px] text-ink-100/50">{w.maker}</div>}
                  <div className="text-[11px] text-ink-100/60">DMG {w.dmg}{w.ammoType ? ` · ${w.ammoType}` : ' · melee'}</div>
                  {eq.weapon !== w.id && <button disabled={equipBusy === `eq-weapon-${w.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('weapon', w.id)}>Equip</button>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Armour" className="md:col-span-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className={`rounded-lg p-3 border ${eq.armour === 'none' ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                <div className="font-medium">No Armour</div>
                {eq.armour !== 'none' && <button className="btn text-xs w-full mt-2" onClick={() => equip('armour', 'none')}>Unequip</button>}
              </div>
              {inv.armours.map(a => (
                <div key={a.id} className={`rounded-lg p-3 border ${eq.armour === a.id ? 'border-blood-500 bg-blood-700/10' : 'border-ink-100/10 bg-ink-950/40'}`}>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-[11px] text-ink-100/60">DEF {a.def}</div>
                  {eq.armour !== a.id && <button disabled={equipBusy === `eq-armour-${a.id}`} className="btn btn-primary text-xs w-full mt-2" onClick={() => equip('armour', a.id)}>Equip</button>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Ammo on hand" className="md:col-span-3">
            {!inv.ammo.length ? <p className="text-sm text-ink-100/60">No ammo. Pick some up at the Gun Store.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {inv.ammo.map(a => (
                  <div key={a.id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-ink-100/60">{a.qty} rounds</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Recent activity" className="md:col-span-3">
        <LogFeed items={log} />
      </Card>
    </div>
  );
}
