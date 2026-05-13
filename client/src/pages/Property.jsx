import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import LockBadge from '../components/LockBadge.jsx';
import { fmt } from '../components/Money.jsx';

const TIER_EMOJI = { 1: '', 2: '', 3: '', 4: '', 5: '' };

const SLOT_LABEL = {
  alarm: 'Alarm',
  doors: 'Doors',
  cameras: 'Cameras',
  guards: 'Guards',
  safe: 'Safe',
};

// One owned property card. Expands into a mod-installer when "Manage"
// is clicked, with all five slots and a buy/sell button per option.
function OwnedCard({ p, here, character, modsCatalogue, modSlots, onChange, setMsg, busy, setBusy }) {
  const [manage, setManage] = useState(false);
  const [listPrice, setListPrice] = useState('');
  const isListed = p.for_sale_price != null;

  async function installMod(modId) {
    setBusy(`m-${p.id}-${modId}`); setMsg(null);
    try {
      await api.post(`/properties/${p.id}/install-mod`, { mod_id: modId });
      setMsg(`Installed.`);
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function uninstallMod(slot) {
    setBusy(`u-${p.id}-${slot}`); setMsg(null);
    try {
      await api.post(`/properties/${p.id}/uninstall-mod`, { slot });
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function list() {
    const price = parseInt(listPrice, 10);
    if (!price || price < 1) { setMsg('Enter a price.'); return; }
    setBusy(`list-${p.id}`); setMsg(null);
    try {
      await api.post(`/properties/${p.id}/list`, { price });
      setMsg(`Listed at ${fmt(price)}.`);
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function unlist() {
    setBusy(`unl-${p.id}`); setMsg(null);
    try {
      await api.post(`/properties/${p.id}/unlist`);
      setMsg('Delisted.');
      await onChange();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className={`rounded-md border p-3 ${here ? 'border-money-500/40 bg-money-600/10' : 'border-ink-100/10 bg-ink-950/40 opacity-90'}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm">{TIER_EMOJI[p.tier] || ''} {p.name}</div>
          {p.address && <div className="text-[12px] text-ink-100/45">{p.address}</div>}
          <div className="text-[12px] mt-0.5">
            <span className="text-ink-100/55">{p.cityName}</span>
            <span className={`ml-2 text-[11px] uppercase tracking-wide ${here ? 'text-money-400' : 'text-ink-100/40'}`}>
              {here ? 'Active here' : 'Inactive'}
            </span>
            {isListed && <span className="ml-2 text-[11px] uppercase tracking-wide text-yellow-300">Listed · {fmt(p.for_sale_price)}</span>}
          </div>
        </div>
        <div className="text-right text-[12px] whitespace-nowrap">
          <div className={here ? 'text-money-400' : 'text-ink-100/40'}>
            +{p.bonuses?.max_energy} en · +{p.bonuses?.max_nerve} nv · +{p.bonuses?.happiness} hp
          </div>
          <div className="text-blood-300 mt-0.5">def {p.defence}</div>
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button onClick={() => setManage(m => !m)} className="btn btn-ghost text-xs flex-1">
          {manage ? 'Hide' : 'Manage'}
        </button>
      </div>

      {manage && (
        <div className="mt-3 space-y-3 pt-3 border-t border-ink-100/10">
          {/* Mod slots */}
          {modSlots.map(slot => {
            const installedId = p.mods?.[slot];
            const installed = installedId ? modsCatalogue.find(m => m.id === installedId) : null;
            const slotOptions = modsCatalogue.filter(m => m.slot === slot);
            return (
              <div key={slot}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-ink-100/55">{SLOT_LABEL[slot]}</span>
                  {installed ? (
                    <span className="text-[12px] text-money-300">{installed.name} · +{installed.defence} def</span>
                  ) : (
                    <span className="text-[12px] text-ink-100/40">empty</span>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-1.5 mt-1.5">
                  {slotOptions.map(opt => (
                    <button key={opt.id}
                      disabled={installedId === opt.id || (busy && busy.startsWith(`m-${p.id}`)) || character.cash < opt.cost}
                      onClick={() => installMod(opt.id)}
                      className={`text-left text-[12px] rounded border px-2 py-1 ${
                        installedId === opt.id
                          ? 'border-money-500/40 bg-money-600/10 text-money-300'
                          : 'border-ink-100/10 hover:border-blood-500/40'
                      }`}
                      title={opt.blurb}>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{opt.name}</span>
                        <span className="tabular-nums shrink-0">{fmt(opt.cost)}</span>
                      </div>
                      <div className="text-[10px] text-ink-100/55">+{opt.defence} def · +{fmt(opt.value)} value</div>
                    </button>
                  ))}
                </div>
                {installed && (
                  <button onClick={() => uninstallMod(slot)} disabled={!!busy}
                    className="text-[11px] text-ink-100/45 hover:text-blood-300 mt-1">
                    × Remove (no refund)
                  </button>
                )}
              </div>
            );
          })}

          {/* List for sale */}
          <div className="pt-2 border-t border-ink-100/10">
            <div className="text-[11px] uppercase tracking-wide text-ink-100/55 mb-1">Sell to another player</div>
            {isListed ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-yellow-300">Listed at {fmt(p.for_sale_price)}</span>
                <button onClick={unlist} disabled={!!busy} className="btn btn-ghost text-xs">Unlist</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <input type="number" min={1} step={1000} placeholder={`Suggested ${fmt(p.bookCost + p.modsValue)}`}
                  value={listPrice} onChange={e => setListPrice(e.target.value)}
                  className="flex-1 min-w-[120px]" />
                <button onClick={list} disabled={!!busy || !listPrice} className="btn btn-primary text-xs">
                  List for sale
                </button>
              </div>
            )}
            {!isListed && (
              <p className="text-[10px] text-ink-100/40 mt-1">
                Buyers pay you minus 5% sales tax. Mods transfer with the property.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Property() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/properties')); }
  useEffect(() => { load(); }, [character?.city]);

  async function buy(p) {
    setBusy(`b-${p.id}`); setMsg(null);
    try {
      await api.post('/properties/buy', { property_id: p.id });
      setMsg(`Bought ${p.name}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  async function buyFromPlayer(listing) {
    setBusy(`bp-${listing.instance_id}`); setMsg(null);
    try {
      const r = await api.post(`/properties/${listing.instance_id}/buy-from-player`);
      setMsg(`Bought ${listing.property.name} from ${listing.seller.name}.`);
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const onChange = async () => { await refresh(); await load(); };

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}
      <Card title=" Estate Agent" subtitle={`Listings in ${data.currentCityName}. Properties are city-locked — to buy a place in another city, fly there first.`} />

      <Card title="Your portfolio" subtitle={data.owned.length
          ? `${data.owned.length} propert${data.owned.length === 1 ? 'y' : 'ies'} across the world. Bonuses only apply in the city you're currently in. Mod defence protects against burglars.`
          : null}>
        {!data.owned.length ? <p className="text-sm text-ink-100/60">None yet — buy your first below.</p> : (
          <div className="grid sm:grid-cols-2 gap-2">
            {data.owned.map(p => (
              <OwnedCard key={p.id} p={p}
                here={p.city === data.currentCity}
                character={character}
                modsCatalogue={data.modsCatalogue}
                modSlots={data.modSlots}
                onChange={onChange}
                setMsg={setMsg}
                busy={busy}
                setBusy={setBusy} />
            ))}
          </div>
        )}
      </Card>

      {data.market.length > 0 && (
        <Card collapsible title={`Player listings in ${data.currentCityName}`}
          subtitle={`${data.market.length} propert${data.market.length === 1 ? 'y' : 'ies'} listed by other players in this city. Mods transfer with the sale.`}>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.market.map(l => {
              const p = l.property;
              return (
                <div key={l.instance_id} className="rounded-lg p-3 border border-ink-100/10 bg-ink-950/40">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{TIER_EMOJI[p.tier] || ''} {p.name}</div>
                      <div className="text-[12px] text-ink-100/45">{p.address}</div>
                      <div className="text-[12px] text-ink-100/55 mt-0.5">
                        Sold by <Link to={`/players/${l.seller.id}`} className="text-blood-300 hover:underline">{l.seller.name}</Link>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-money-400 tabular-nums">{fmt(l.price)}</div>
                      <div className="text-[10px] text-ink-100/40 tabular-nums">book {fmt(p.bookCost)}</div>
                    </div>
                  </div>
                  <div className="text-[13px] text-ink-100/60 mt-2">
                    +{p.bonuses.max_energy} en · +{p.bonuses.max_nerve} nv · +{p.bonuses.happiness} hp · def {p.defence}
                  </div>
                  {p.modsValue > 0 && (
                    <div className="text-[11px] text-ink-100/55 mt-0.5">Mods installed (worth {fmt(p.modsValue)}).</div>
                  )}
                  <button disabled={busy === `bp-${l.instance_id}` || character.cash < l.price}
                    onClick={() => buyFromPlayer(l)}
                    className="btn btn-primary w-full text-xs mt-3">
                    {character.cash < l.price ? `Need ${fmt(l.price - character.cash)} more` : `Buy for ${fmt(l.price)}`}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card collapsible title={`For sale at the estate agent — ${data.currentCityName}`}>
        {!data.forSale.length ? <p className="text-sm text-ink-100/60">All bought up — or you've got a place at every tier here. Travel to see other markets.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.forSale.sort((a, b) => a.cost - b.cost).map(p => (
              <div key={p.id} className={`rounded-lg p-3 border bg-ink-950/40 ${p.locked ? 'border-ink-100/5 opacity-50 grayscale' : 'border-ink-100/10'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{TIER_EMOJI[p.tier] || ''} {p.name}</div>
                    <div className="text-[12px] text-ink-100/45">{p.address}</div>
                    <div className="text-[12px] text-ink-100/50">{p.tierLabel} · Tier {p.tier}</div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-money-400 tabular-nums">{fmt(p.cost)}</div>
                    {p.locked && <div className="mt-1"><LockBadge level={p.levelGate} /></div>}
                  </div>
                </div>
                <div className="text-[13px] text-ink-100/60 mt-2">
                  +{p.bonuses.max_energy} energy · +{p.bonuses.max_nerve} nerve · +{p.bonuses.happiness} happiness
                </div>
                {p.garage > 0 && (
                  <div className="text-[12px] text-ink-100/50 mt-0.5">{p.garage} garage spaces</div>
                )}
                <button disabled={p.locked || character.cash < p.cost || busy === `b-${p.id}`} className="btn btn-primary w-full text-xs mt-3" onClick={() => buy(p)}>
                  {busy === `b-${p.id}`
                    ? '...'
                    : p.locked
                      ? 'Locked'
                      : character.cash < p.cost ? `Need ${fmt(p.cost - character.cash)} more` : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
