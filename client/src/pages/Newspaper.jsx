import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '../components/Money.jsx';

// The City Gazette — broadsheet styling. Drops the surrounding dark
// chrome for a cream-paper-with-ink-blockprint look so the page
// actually reads as a newspaper rather than just another card.
// Everything below the masthead lives inside a single `paper` div
// that supplies the cream background + black ink colour scheme.

//  Inline SVG illustrations ─────────────────────────────
// Black-ink only, designed to sit cleanly on the cream background.
// Each takes a className for sizing.

function MugshotSvg({ className = '', width = 76, height = 96 }) {
  return (
    <svg viewBox="0 0 76 96" width={width} height={height} className={className} aria-hidden>
      {/* Background bars (jail aesthetic) */}
      {[10, 24, 38, 52, 66].map(x => (
        <line key={x} x1={x} y1="0" x2={x} y2="96" stroke="#1a1815" strokeWidth="0.6" opacity="0.25" />
      ))}
      {/* Head */}
      <ellipse cx="38" cy="36" rx="18" ry="22" fill="#1a1815" />
      {/* Shoulders + suit */}
      <path d="M8 96 Q8 70 24 64 L52 64 Q68 70 68 96 Z" fill="#1a1815" />
      {/* Lapel */}
      <path d="M30 64 L38 78 L46 64 L46 76 L38 92 L30 76 Z" fill="#efe8d4" />
      {/* Tie */}
      <path d="M36 76 L40 76 L41 96 L35 96 Z" fill="#1a1815" />
      {/* Brimmed hat */}
      <path d="M14 24 Q18 14 38 12 Q58 14 62 24 L60 26 Q40 22 16 26 Z" fill="#1a1815" />
      <ellipse cx="38" cy="26" rx="26" ry="3.5" fill="#1a1815" />
      {/* Hat band highlight */}
      <path d="M14 25 Q38 22 62 25" stroke="#efe8d4" strokeWidth="0.6" fill="none" opacity="0.55" />
      {/* Mugshot height-strip on the right */}
      <rect x="68" y="0" width="8" height="96" fill="#efe8d4" stroke="#1a1815" strokeWidth="0.5" />
      {[12, 24, 36, 48, 60, 72, 84].map(y => (
        <line key={y} x1="68" y1={y} x2="76" y2={y} stroke="#1a1815" strokeWidth="0.4" />
      ))}
    </svg>
  );
}

function CashSackSvg({ className = '', width = 64, height = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={width} height={height} className={className} aria-hidden>
      <path d="M14 26 Q20 16 32 14 Q44 16 50 26 L56 56 Q44 62 32 62 Q20 62 8 56 Z" fill="#1a1815" />
      {/* Cinch + creases */}
      <path d="M14 26 Q18 24 24 22 L40 22 Q46 24 50 26" stroke="#efe8d4" strokeWidth="1" fill="none" />
      <path d="M22 12 L24 22 M40 22 L42 12" stroke="#1a1815" strokeWidth="1.5" />
      <ellipse cx="32" cy="14" rx="10" ry="3" fill="#efe8d4" stroke="#1a1815" strokeWidth="1" />
      {/* $ on the bag */}
      <text x="32" y="48" textAnchor="middle" fontFamily="Georgia, serif" fontSize="20" fontWeight="bold" fill="#efe8d4">$</text>
    </svg>
  );
}

function FlagSvg({ className = '', width = 56, height = 72 }) {
  return (
    <svg viewBox="0 0 56 72" width={width} height={height} className={className} aria-hidden>
      {/* Hill */}
      <path d="M0 60 Q14 50 28 56 Q42 62 56 56 L56 72 L0 72 Z" fill="#1a1815" opacity="0.18" />
      {/* Pole */}
      <line x1="20" y1="8" x2="20" y2="64" stroke="#1a1815" strokeWidth="2" />
      <circle cx="20" cy="8" r="2" fill="#1a1815" />
      {/* Flag */}
      <path d="M20 10 L48 14 L40 22 L48 30 L20 30 Z" fill="#1a1815" />
      <text x="32" y="24" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fontWeight="bold" fill="#efe8d4">T</text>
    </svg>
  );
}

function BadgeSvg({ className = '', width = 60, height = 64 }) {
  return (
    <svg viewBox="0 0 60 64" width={width} height={height} className={className} aria-hidden>
      {/* 7-point star */}
      <path
        d="M30 4 L36 18 L52 14 L42 28 L56 36 L40 40 L44 56 L30 48 L16 56 L20 40 L4 36 L18 28 L8 14 L24 18 Z"
        fill="#1a1815" />
      <circle cx="30" cy="34" r="9" fill="#efe8d4" stroke="#1a1815" strokeWidth="1.5" />
      <text x="30" y="38" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fontWeight="bold" fill="#1a1815">P</text>
    </svg>
  );
}

//  ───────────────────────────────────────────────────────────

function relativeTime(ts) {
  const dt = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (dt < 60)    return `${dt}s ago`;
  if (dt < 3600)  return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}

function SectionHeader({ children }) {
  return (
    <div className="border-y-2 border-double border-[#1a1815] py-1 my-3 text-center">
      <div className="font-serif text-[11px] tracking-[0.35em] uppercase">{children}</div>
    </div>
  );
}

// Long horizontal rule that mimics newspaper bar dividers.
function Rule({ thick = false }) {
  return <div className={`border-t ${thick ? 'border-t-2 border-double' : 'border-[#1a1815]/60'} my-3`} />;
}

export default function Newspaper() {
  const { character } = useGame();
  const [data, setData] = useState(null);
  const [city, setCity] = useState(null);

  async function load(targetCity) {
    const q = targetCity ? `?city=${encodeURIComponent(targetCity)}` : '';
    setData(await api.get(`/newspaper${q}`));
  }
  useEffect(() => { load(city); }, [city]);
  useEffect(() => { if (!city && character?.city) setCity(character.city); }, [character?.city]);

  if (!data) return null;

  const localHH = String(data.localTime.hour).padStart(2, '0');
  const localMM = String(data.localTime.minute).padStart(2, '0');

  // Lead story — newest meaningful headline (skip dry "Arrived at"
  // travel pings).
  const lead = (data.headlines || []).find(h =>
    !(h.type === 'travel' && /Arrived at/i.test(h.text))
  ) || (data.headlines || [])[0];

  const totalKills    = (data.murders || []).length;
  const totalScores   = (data.bigScores || []).length;
  const totalTurfFlips = (data.turfFlips || []).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div
        className="font-serif bg-[#efe8d4] text-[#1a1815] p-4 sm:p-8 rounded-md shadow-2xl shadow-black/70"
        style={{
          // Subtle paper grain — tiled diagonal noise.
          backgroundImage:
            'radial-gradient(circle at 30% 20%, rgba(0,0,0,0.04) 0, transparent 50%),' +
            'radial-gradient(circle at 80% 70%, rgba(0,0,0,0.03) 0, transparent 40%)',
        }}
      >
        {/*  Masthead  */}
        <div className="text-center">
          <div className="flex justify-between items-baseline text-[10px] uppercase tracking-[0.25em] mb-2 border-b border-[#1a1815]/70 pb-1">
            <span>Vol. MMXXVI · No. {Math.floor(Date.now() / 86_400_000) % 9999}</span>
            <span>{data.cityName} Edition</span>
            <span>Three pence</span>
          </div>
          <div className="font-display text-4xl sm:text-6xl tracking-wider uppercase leading-none">
            The {data.cityName} Gazette
          </div>
          <div className="border-t-2 border-double border-[#1a1815] mt-2 pt-1 text-[11px] uppercase tracking-[0.3em]">
            All the crime that's fit to print
          </div>
          <div className="text-[12px] mt-2 flex justify-center flex-wrap gap-x-3 italic">
            <span>{new Date(data.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
            <span>· {data.weather}</span>
            <span>· {localHH}:{localMM} ({data.localTime.bucketLabel})</span>
          </div>
        </div>

        {/*  City switcher  */}
        <div className="flex flex-wrap justify-center gap-2 mt-3 text-[11px]">
          {data.citiesAvailable.map(c => (
            <button key={c.id}
              onClick={() => setCity(c.id)}
              className={`uppercase tracking-[0.18em] px-2 py-0.5 ${
                c.id === data.city
                  ? 'bg-[#1a1815] text-[#efe8d4]'
                  : 'text-[#1a1815]/70 hover:text-[#1a1815] underline-offset-2 hover:underline'}`}>
              {c.name}
            </button>
          ))}
        </div>

        <Rule thick />

        {/*  Lead story + sidebar  */}
        <div className="grid md:grid-cols-3 gap-x-6">
          <div className="md:col-span-2">
            <SectionHeader>Front Page</SectionHeader>
            {lead ? (
              <article>
                <h2 className="font-display text-3xl sm:text-4xl uppercase leading-tight tracking-wide mb-1">
                  {leadHeadline(lead)}
                </h2>
                <div className="text-[11px] uppercase tracking-[0.2em] mb-3 text-[#1a1815]/70">
                  By <span className="italic">Staff Wire</span> · {relativeTime(lead.when)}
                </div>
                <p className="text-[15px] leading-relaxed first-letter:font-display first-letter:text-6xl first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:leading-[0.85]">
                  {lead.text}
                </p>
                {data.headlines.length > 1 && (
                  <>
                    <Rule />
                    <div className="text-[11px] uppercase tracking-[0.2em] mb-2 text-[#1a1815]/70">Also in the news</div>
                    <ul className="text-[13px] leading-relaxed space-y-1.5">
                      {data.headlines.slice(1, 7).map((h, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[#1a1815]/40">•</span>
                          <div>
                            <span className="italic text-[#1a1815]/55 mr-2 uppercase tracking-wider text-[10px]">
                              {labelFor(h.type)}
                            </span>
                            {h.text}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            ) : (
              <p className="italic text-[#1a1815]/70">A quiet day on the streets. Editors are crossing their fingers.</p>
            )}
          </div>

          {/*  Right sidebar — Obituaries + Turf  */}
          <aside className="md:col-span-1 mt-6 md:mt-0 md:border-l md:border-[#1a1815]/30 md:pl-5">
            <SectionHeader>Obituaries</SectionHeader>
            {totalKills === 0 ? (
              <p className="italic text-[#1a1815]/70 text-[13px]">No murders reported. A small mercy.</p>
            ) : (
              <ul className="space-y-3">
                {data.murders.slice(0, 6).map((m, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <MugshotSvg width={52} height={66} className="shrink-0" />
                    <div className="text-[13px] leading-snug">
                      <div className="font-bold uppercase tracking-wide text-[12px]">{m.victim}</div>
                      <div className="text-[#1a1815]/70 italic mt-0.5">
                        {m.attackerKnown
                          ? <>Felled by {m.attacker}{m.cashTaken > 0 ? `, wallet relieved of ${fmt(m.cashTaken)}` : ''}.</>
                          : <>Killed by persons unknown. Cops are working it{m.cashTaken > 0 ? `; wallet was relieved of ${fmt(m.cashTaken)}` : ''}.</>}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-[#1a1815]/50 mt-0.5">
                        {relativeTime(m.when)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Rule />

            <SectionHeader>Turf Desk</SectionHeader>
            {totalTurfFlips === 0 ? (
              <p className="italic text-[#1a1815]/70 text-[13px]">No changes of hands on the streets today.</p>
            ) : (
              <article>
                {data.turfWar && (
                  <p className="text-[13px] leading-relaxed mb-3 first-letter:font-display first-letter:text-4xl first-letter:float-left first-letter:mr-1.5 first-letter:mt-1 first-letter:leading-[0.85]">
                    {data.turfWar}
                  </p>
                )}
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#1a1815]/55 mb-1">Sectors swapped</div>
                <ul className="space-y-1.5">
                  {data.turfFlips.slice(0, 5).map((t, i) => (
                    <li key={i} className="flex gap-2 items-start text-[12px]">
                      <FlagSvg width={20} height={26} className="shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span className="font-bold">{t.attacker_gang_name || t.actor || 'A small crew'}</span>
                        {' took '}
                        <span className="italic">{t.area || 'a sector'}</span>
                        {t.defender_gang_name && <> from <span className="font-bold">{t.defender_gang_name}</span></>}
                        <span className="text-[#1a1815]/55"> · {relativeTime(t.when)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </aside>
        </div>

        <Rule thick />

        {/*  Bottom row — Big Scores + Top Earners + Police Blotter  */}
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-6">
          <section>
            <SectionHeader>Biggest Scores</SectionHeader>
            <div className="flex items-start gap-3 mb-3">
              <CashSackSvg width={64} height={64} className="shrink-0" />
              <p className="italic text-[12px] text-[#1a1815]/70 leading-snug">
                Single-job takings from the last 24h. Editors verified what they could.
              </p>
            </div>
            {totalScores === 0 ? (
              <p className="italic text-[#1a1815]/70 text-[13px]">No spectacular hauls. Mostly small change.</p>
            ) : (
              <ol className="space-y-3 text-[13px]">
                {data.bigScores.map((s, i) => (
                  <li key={i} className="border-b border-[#1a1815]/10 pb-2 last:border-0 last:pb-0">
                    <div className="flex justify-between gap-2 mb-0.5">
                      <span className="font-bold uppercase tracking-wide text-[11px]">
                        {i + 1}. {prettyCrime(s.crime || 'Unreported job')}
                      </span>
                      <span className="tabular-nums font-bold shrink-0">{fmt(s.payout)}</span>
                    </div>
                    <p className="leading-snug text-[12px]">{s.story}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <SectionHeader>Top Earners</SectionHeader>
            <p className="italic text-[12px] text-[#1a1815]/70 leading-snug mb-2">
              Day's gross totals by player.
            </p>
            {(data.earners || []).length === 0 ? (
              <p className="italic text-[#1a1815]/70 text-[13px]">No reported income to speak of.</p>
            ) : (
              <ol className="space-y-1.5 text-[13px]">
                {data.earners.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-bold mr-1.5">{i + 1}.</span>
                      <span className="italic">{e.name}</span>
                    </span>
                    <span className="tabular-nums font-bold shrink-0">{fmt(e.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <SectionHeader>Police Blotter</SectionHeader>
            <div className="flex items-start gap-3 mb-3">
              <BadgeSvg width={56} height={60} className="shrink-0" />
              <p className="italic text-[12px] text-[#1a1815]/70 leading-snug">
                Last 24h. Compiled from the desk sergeant's notes.
              </p>
            </div>
            <dl className="text-[13px] space-y-1">
              <div className="flex justify-between">
                <dt className="uppercase tracking-wider text-[12px]">Arrests</dt>
                <dd className="tabular-nums font-bold">{data.blotter.jailings}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="uppercase tracking-wider text-[12px]">Hospitalised</dt>
                <dd className="tabular-nums font-bold">{data.blotter.hospital}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="uppercase tracking-wider text-[12px]">Murders</dt>
                <dd className="tabular-nums font-bold">{totalKills}</dd>
              </div>
            </dl>
          </section>
        </div>

        <Rule thick />

        {/*  Footer / boundary snapshot of turf control  */}
        <section>
          <SectionHeader>City Control</SectionHeader>
          <p className="italic text-[12px] text-[#1a1815]/70 leading-snug mb-2">
            {data.turf.total} sectors. State of play as of press time.
          </p>
          <div className="space-y-1 text-[13px]">
            {Object.entries(data.turf.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([fid, n]) => {
                const pct = Math.round((n / data.turf.total) * 100);
                return (
                  <div key={fid}>
                    <div className="flex justify-between">
                      <span className="capitalize font-bold uppercase tracking-wider text-[12px]">{fid}</span>
                      <span className="tabular-nums">{n}/{data.turf.total} · {pct}%</span>
                    </div>
                    <div className="h-1 bg-[#1a1815]/15 overflow-hidden mt-0.5">
                      <div className="h-full bg-[#1a1815]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
          <Link to="/city" className="inline-block text-[11px] uppercase tracking-[0.2em] mt-3 underline hover:no-underline">
            View the map →
          </Link>
        </section>

        <div className="border-t-2 border-double border-[#1a1815] mt-4 pt-2 text-center text-[10px] uppercase tracking-[0.25em] text-[#1a1815]/65">
          Printed nightly · No advertising accepted from rival families
        </div>
      </div>
    </div>
  );
}

//  Helpers ─────────────────────────────────────────────────

function leadHeadline(h) {
  // Tightens the lead's text into a punchy headline-style intro.
  // Strips leading emojis and capitalises the first letter for the
  // newspaper voice; the body keeps the original sentence.
  const trimmed = (h.text || '').replace(/^[\p{Emoji}\p{Emoji_Presentation}\s]+/u, '').trim();
  return trimmed.length > 80 ? trimmed.slice(0, 78) + '…' : trimmed;
}

function labelFor(type) {
  if (type === 'crime')   return 'Crime';
  if (type === 'turf')    return 'Turf';
  if (type === 'casino')  return 'Vice';
  if (type === 'travel')  return 'Wire';
  return 'News';
}

function prettyCrime(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
