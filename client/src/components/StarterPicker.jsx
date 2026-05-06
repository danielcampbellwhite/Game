import React from 'react';
import { fmt } from './Money.jsx';

// Starter-pack picker rendered on character-create / new-character.
// Players have a fixed budget to distribute across three required
// picks: a car, a house in their starting city, and a small business.
//
// All three are required; the total must be ≤ budget; the parent
// gates submit on that. Server re-validates against the same
// catalogues — these come from /api/character/options so the client
// never has to know the prices itself.

function PickRow({ label, options, selectedId, onSelect, budgetLeft, currentPrice }) {
  if (!options.length) {
    return (
      <div>
        <div className="text-[12px] uppercase text-ink-100/60 mb-1">{label}</div>
        <p className="text-xs text-ink-100/55 italic">Nothing available — pick a different starting city.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[12px] uppercase text-ink-100/60 mb-1">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          Over budget by {fmt(-left)}. Drop one of your picks for a cheaper option.
        </p>
      )}
    </div>
  );
}

export function emptyStarter() {
  return { car_id: null, house_id: null, business_id: null };
}

export function starterComplete(value) {
  return !!(value?.car_id && value?.house_id && value?.business_id);
}
