import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card.jsx';

// High Street hub — the city block that holds every small shop.
// You travel to high_street on the City > Around Town tab, then
// pick one of the five shops here. Each shop's own page (/shop/X)
// hits /api/shops/X which is gated to the high_street location.

const SHOPS = [
  { slug: 'coffee',     name: 'Coffee Shop',     desc: 'Espresso, energy drinks, the occasional sandwich. Quick top-up of energy.' },
  { slug: 'pharmacy',   name: 'Pharmacy',        desc: 'First aid, painkillers, vitamins. Patch up small wounds without a hospital trip.' },
  { slug: 'off_licence',name: 'Off-Licence',     desc: 'Booze and cigars. Mood and happiness, on the rocks.' },
  { slug: 'deli',       name: 'Late-Night Deli', desc: 'Sandwiches, hot soup, energy drinks — happiness with a side of fuel.' },
  { slug: 'gift_shop',  name: 'Gift Shop',       desc: 'Flowers, chocolates, concert tickets. Give to a friend, score with them.' },
];

export default function HighStreet() {
  return (
    <Card title="High Street"
      subtitle="Five shops on one block. Pick your poison.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SHOPS.map(s => (
          <Link key={s.slug} to={`/shop/${s.slug}`}
            className="group p-3 rounded-lg border border-ink-100/10 bg-ink-950/40 hover:border-blood-500/40 hover:bg-ink-900/60 transition">
            <div className="font-medium text-sm group-hover:text-blood-400 transition">{s.name}</div>
            <div className="text-[13px] text-ink-100/55 leading-snug mt-0.5">{s.desc}</div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
