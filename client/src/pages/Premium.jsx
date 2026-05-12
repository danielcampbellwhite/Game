import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import Card from '../components/Card.jsx';
import { fmt } from '../components/Money.jsx';

// Premium store — Gold Bars (account-bound currency) buy premium-only
// vehicles, properties, weapons. Items follow whichever character the
// player is running; Bars survive death / retirement / prestige.
//
// Phase 1: top-up button is a placeholder ("Coming soon" — Stripe wires
// in Phase 2). Admins can use POST /api/premium/admin-grant to seed
// Bars for testing.

const KIND_META = {
  vehicle:  { label: 'Premium Vehicles',   tone: 'text-blood-300' },
  property: { label: 'Premium Properties', tone: 'text-gold-300'  },
  weapon:   { label: 'Premium Weapons',    tone: 'text-money-300' },
};

function GoldBar({ n, className = '' }) {
  return (
    <span className={`inline-flex items-baseline gap-1 tabular-nums ${className}`}>
      <span aria-hidden></span>
      <span>{(n || 0).toLocaleString()}</span>
      <span className="text-[11px] uppercase tracking-wider opacity-70">{n === 1 ? 'bar' : 'bars'}</span>
    </span>
  );
}

function ItemCard({ item, ownedIds, balance, busy, onBuy }) {
  const owned = ownedIds.has(item.id);
  const canAfford = balance >= item.premiumPrice;
  const disabled = owned || !canAfford || busy;
  return (
    <div className="rounded-lg border border-gold-500/25 bg-ink-950/50 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-ink-50 truncate">{item.name}</div>
          <div className="text-[11px] uppercase tracking-wide text-ink-100/45">
            {KIND_META[item.kind]?.label || item.kind}
          </div>
        </div>
        <div className="text-right shrink-0">
          <GoldBar n={item.premiumPrice} className="text-gold-300 font-medium" />
        </div>
      </div>
      <p className="text-[13px] text-ink-100/65 leading-snug">{item.description}</p>
      {item.kind === 'vehicle' && (
        <div className="text-[12px] text-ink-100/55 tabular-nums">
          T{item.tier} · book {fmt(item.bookPrice)} · speed {item.speed} · handling {item.handling}
        </div>
      )}
      {item.kind === 'property' && (
        <div className="text-[12px] text-ink-100/55 tabular-nums">
          T{item.tier} · {item.address} · garage {item.garage} · +{item.bonuses.max_energy} energy cap
        </div>
      )}
      {item.kind === 'weapon' && (
        <div className="text-[12px] text-ink-100/55 tabular-nums">
          {item.category} · damage {item.dmg} · ammo .{item.ammoType}
        </div>
      )}
      <button
        onClick={() => onBuy(item)}
        disabled={disabled}
        className="btn btn-primary text-xs mt-1">
        {owned
          ? ' Owned'
          : busy
            ? '…'
            : canAfford
              ? `Buy for ${item.premiumPrice} bars`
              : `Need ${item.premiumPrice} bars`}
      </button>
    </div>
  );
}

export default function Premium() {
  const { refresh, character } = useGame();
  const [data, setData] = useState(null);
  const [busyItemId, setBusyItemId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      setData(await api.get('/premium'));
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function buy(item) {
    setBusyItemId(item.id); setMsg(null);
    try {
      await api.post('/premium/buy', { item_id: item.id });
      setMsg(` ${item.name} unlocked — it'll travel with you across every character.`);
      await load();
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusyItemId(null); }
  }

  // Equip / unequip / drive helpers — POST to the matching endpoint
  // and refresh both this page (for the "Active" badge) and the
  // global character (for everything else that reads from it).
  async function action(endpoint, item, label) {
    setBusyItemId(item?.id || endpoint); setMsg(null);
    try {
      const body = item ? { item_id: item.id } : undefined;
      await api.post(`/premium/${endpoint}`, body);
      if (label) setMsg(label);
      await load();
      await refresh();
    } catch (e) { setMsg(e.message); }
    finally { setBusyItemId(null); }
  }

  if (!data) return null;

  const ownedIds = new Set((data.inventory || []).map(r => r.premium_id));
  const byKind = (kind) => data.catalogue.filter(i => i.kind === kind);
  // Per-character equip state — comes from publicCharacter via useGame.
  const equippedWeapon  = character?.equipped_weapon;
  const activePremiumId = character?.active_premium_vehicle_id;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      <Card title=" Gold Bars" subtitle="Premium currency. Tied to your account — survives death, retirement, prestige. Spend on permanent prestige items that follow every character you ever run.">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[12px] uppercase text-ink-100/55">Balance</div>
            <div className="font-display text-4xl text-gold-300">
              <GoldBar n={data.balance} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] uppercase text-ink-100/55">Owned</div>
            <div className="font-display text-2xl text-ink-50 tabular-nums">{data.inventory.length}</div>
          </div>
        </div>
      </Card>

      {data.inventory.length > 0 && (
        <Card title="Your premium items" subtitle="Equip / drive / activate. These don't decay, can't be sold, and follow you across every character.">
          <ul className="space-y-2">
            {data.inventory.map(row => {
              const item = data.catalogue.find(i => i.id === row.premium_id);
              if (!item) return null;
              const isWeaponEquipped = item.kind === 'weapon'   && equippedWeapon  === item.id;
              const isVehicleActive  = item.kind === 'vehicle'  && activePremiumId === item.id;
              const busy = busyItemId === item.id;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-gold-500/20 bg-ink-950/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-50 truncate">{item.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-ink-100/45">
                      {KIND_META[item.kind]?.label || item.kind}
                      {(isWeaponEquipped || isVehicleActive) && (
                        <span className="ml-2 text-money-300">· In use</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {item.kind === 'weapon' && (
                      isWeaponEquipped
                        ? <span className="text-[12px] text-money-300">Equipped</span>
                        : <button disabled={busy} onClick={() => action('equip-weapon', item, ` Equipped ${item.name}.`)} className="btn btn-primary text-xs">{busy ? '…' : 'Equip'}</button>
                    )}
                    {item.kind === 'vehicle' && (
                      isVehicleActive
                        ? <button disabled={busy} onClick={() => action('unequip-vehicle', null, 'Parked your premium ride.')} className="btn btn-ghost text-xs">{busy ? '…' : 'Park'}</button>
                        : <button disabled={busy} onClick={() => action('equip-vehicle', item, ` Now driving ${item.name}.`)} className="btn btn-primary text-xs">{busy ? '…' : 'Drive'}</button>
                    )}
                    {item.kind === 'property' && (
                      <span className="text-[12px] text-ink-100/55">Active in {item.city.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Top up" subtitle="Each Gold Bar is 10p. Stripe-powered checkout coming soon — for now an admin can seed your account for testing.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(data.packs || []).map(p => (
            <div key={p.id} className="rounded-lg border border-ink-100/15 bg-ink-900/40 p-2 text-center">
              <div className="text-[11px] uppercase tracking-wide text-ink-100/45">{p.label}</div>
              <div className="font-display text-xl text-gold-300 tabular-nums"> {p.bars}</div>
              <div className="text-[12px] text-ink-100/70 tabular-nums">£{p.priceGBP.toFixed(2)}</div>
              <button disabled className="btn btn-ghost text-[11px] mt-1 w-full opacity-60 cursor-not-allowed">
                Coming soon
              </button>
            </div>
          ))}
        </div>
      </Card>

      {['vehicle', 'property', 'weapon'].map(kind => {
        const items = byKind(kind);
        if (!items.length) return null;
        return (
          <Card key={kind} title={KIND_META[kind].label}>
            <div className="grid sm:grid-cols-2 gap-3">
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  ownedIds={ownedIds}
                  balance={data.balance}
                  busy={busyItemId === item.id}
                  onBuy={buy}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
