import React from 'react';
import { fmt } from './Money.jsx';

// Starter-pack picker rendered on character-create / new-character.
// Each slot (car, house, business) is OPTIONAL — players can pick a
// "Skip" tile to start without one. Anything left of the budget
// rolls forward as starting cash on the server, so skipping a slot
// has a real reward instead of just losing the budget.

function PickRow({ label, options, selectedId, onSelect, budgetLeft, currentPrice }) {
  return (
    <div>
      <div className="text-[12px] uppercase text-ink-100/60 mb-1">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Opt-out tile — always available, always £0. */}
        <button type="button"
          onClick={() => onSelect(null)}
          className={`p-2 rounded-md border text-left transition ${
            selectedId == null
              ? 'border-money-500 bg-money-700/15'
              : 'border-ink-100/10 hover:bg-ink-800/60'
          }`}>
          <div className="text-xs font-medium leading-tight">Skip</div>
          <div className="text-[11px] text-ink-100/50 leading-tight mt-0.5">Start without one</div>
          <div className="text-[12px] text-money-300 tabular-nums mt-1">{fmt(0)}</div>
        </button>
        {options.map(o => {
          const selected = selectedId === o.id;
          // Affordable iff swapping to this pick wouldn't exceed
          // budget given the player's other selections.
          const swappable = (budgetLeft + (currentPrice || 0)) >= o.price;
          const blocked = !selected && !swappable;
          return (
            <button type="button" key={o.id}
              disabled={blocked}
              onClick={() => onSelect(o.id)}
              className={`p-2 rounded-md border text-left transition ${
                selected
                  ? 'border-blood-500 bg-blood-700/20'
                  : blocked
                    ? 'border-ink-100/5 opacity-40 cursor-not-allowed'
                    : 'border-ink-100/10 hover:bg-ink-800/60'
              }`}>
              <div className="text-xs font-medium leading-tight">{o.name}</div>
              {o.address && <div className="text-[11px] text-ink-100/50 leading-tight mt-0.5">{o.address}</div>}
              <div className="text-[12px] text-money-300 tabular-nums mt-1">{fmt(o.price)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StarterPicker({ starter, city, value, onChange }) {
  if (!starter) return null;
  const budget = starter.budget || 0;
  const cars = starter.cars || [];
  const houses = (starter.housesByCity && starter.housesByCity[city]) || [];
  const businesses = starter.businesses || [];

  const carPrice   = cars.find(c => c.id === value.car_id)?.price || 0;
  const housePrice = houses.find(h => h.id === value.house_id)?.price || 0;
  const bizPrice   = businesses.find(b => b.id === value.business_id)?.price || 0;
  const total = carPrice + housePrice + bizPrice;
  const left = budget - total;
  const overBudget = left < 0;

  function set(key, id) { onChange({ ...value, [key]: id }); }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase text-ink-100/60">Starter pack</span>
        <span className={`text-xs tabular-nums ${overBudget ? 'text-blood-400' : 'text-money-300'}`}>
          {fmt(left)} <span className="text-ink-100/50">/ {fmt(budget)} left</span>
        </span>
      </div>
      <p className="text-[12px] text-ink-100/65">
        Each slot is optional — skip a row to start without that asset.
        Unspent budget rolls forward as starting cash.
      </p>

      <PickRow
        label="Car"
        options={cars}
        selectedId={value.car_id}
        onSelect={id => set('car_id', id)}
        budgetLeft={left}
        currentPrice={carPrice}
      />
      <PickRow
        label="House (in your starting city)"
        options={houses}
        selectedId={value.house_id}
        onSelect={id => set('house_id', id)}
        budgetLeft={left}
        currentPrice={housePrice}
      />
      <PickRow
        label="Business"
        options={businesses}
        selectedId={value.business_id}
        onSelect={id => set('business_id', id)}
        budgetLeft={left}
        currentPrice={bizPrice}
      />

      {overBudget && (
        <p className="text-[13px] text-blood-400">
          Over budget by {fmt(-left)}. Drop one of your picks for a cheaper option, or skip a slot.
        </p>
      )}
      {!overBudget && left > 0 && (
        <p className="text-[12px] text-money-300">
          You'll start with an extra <b className="tabular-nums">{fmt(left)}</b> in cash.
        </p>
      )}
    </div>
  );
}

export function emptyStarter() {
  return { car_id: null, house_id: null, business_id: null };
}

// Always valid now — every slot is optional, including skipping all three.
// The server is the source of truth for budget / unknown-id rejection.
export function starterComplete(_value) {
  return true;
}
