import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../context/GameContext.jsx';
import { useScrollOnMessage } from '../hooks/useScrollOnMessage.js';
import Card from '../components/Card.jsx';
import Timer from '../components/Timer.jsx';
import { fmt } from '../components/Money.jsx';

const STAT_LABELS = {
  level:        'Lvl',
  strength:     'STR',
  defence:      'DEF',
  speed:        'SPD',
  intelligence: 'INT',
  reputation:   'REP',
};

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  // `hour: 'numeric'` (vs '2-digit') drops the leading zero for 12-hour format.
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function GateRow({ gates, character }) {
  const entries = Object.entries(gates || {});
  if (!entries.length) return <div className="text-[11px] text-ink-100/45">No requirements.</div>;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      {entries.map(([stat, need]) => {
        const have = character[stat] ?? 0;
        const ok = have >= need;
        return (
          <span key={stat} className={ok ? 'text-money-400' : 'text-blood-400'}>
            {STAT_LABELS[stat] || stat} {need}
            <span className="text-ink-100/45 ml-1">({have})</span>
          </span>
        );
      })}
    </div>
  );
}

function EmploymentCard({ employment, character, onCheckin, onCollect, onQuit, busy }) {
  const job = employment.job;
  const onShift = employment.on_shift_now;
  const cooldownReady = employment.cooldown_ready;
  const cooldownPending = onShift && !cooldownReady && employment.next_checkin_at;
  const turnedUp = employment.turned_up_for_current_shift;
  // Show the fire warning only while the player can still act on it: an
  // unattended current shift, or an unattended next shift if they're off
  // duty between two scheduled days.
  const fireWarning = onShift && !turnedUp;

  return (
    <Card title={`💼 ${job.emoji} ${job.name}`}
      subtitle={`£${job.hourly.toLocaleString()}/hour · max one check-in per hour during shift · Schedule: ${job.scheduleLabel}`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase text-ink-100/55">Pending wages</div>
          <div className="text-money-400 font-semibold tabular-nums">{fmt(employment.pending_pay)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-ink-100/55">Total earned</div>
          <div className="tabular-nums">{fmt(employment.total_earned)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-ink-100/55">Status</div>
          {onShift
            ? cooldownReady
              ? <div className="text-sm text-money-400">✓ Ready to check in</div>
              : <div className="text-sm text-yellow-300">⏳ Cooling down</div>
            : <div className="text-sm text-ink-100/65">Off duty</div>}
        </div>
        <div>
          <div className="text-[10px] uppercase text-ink-100/55">{onShift ? 'Shift ends' : 'Next shift'}</div>
          <div className="text-sm">
            {onShift
              ? <Timer until={employment.current_shift.end} />
              : employment.next_shift
                ? <>{fmtTime(employment.next_shift.start)} <span className="text-ink-100/55">(in <Timer until={employment.next_shift.start} />)</span></>
                : '—'}
          </div>
        </div>
      </div>

      {onShift && cooldownReady && (
        <div className="mt-4 rounded-md border border-money-500/30 bg-money-500/5 p-3">
          <div className="text-[10px] uppercase text-money-400">Ready for an hour of work</div>
          <div className="text-sm mt-0.5">"{job.task}"</div>
          <div className="text-[10px] text-ink-100/55">
            Costs {job.taskEnergy} energy · {job.xp} XP · earns {fmt(job.hourly)} (added to pending immediately)
          </div>
        </div>
      )}
      {cooldownPending && (
        <div className="mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs">
          <div className="text-yellow-300">
            Next check-in available in <b><Timer until={employment.next_checkin_at} /></b>.
            Stay on shift to keep stacking hourly wages.
          </div>
        </div>
      )}
      {!onShift && employment.next_shift && (
        <div className="mt-4 rounded-md border border-ink-100/10 bg-ink-950/30 p-3 text-xs text-ink-100/55">
          Off duty. Next shift opens at <b className="text-ink-100/85">{fmtTime(employment.next_shift.start)}</b>{' '}
          (<Timer until={employment.next_shift.start} />). Turn up at least once that shift to keep your job.
        </div>
      )}
      {fireWarning && (
        <div className="mt-3 rounded-md border border-blood-500/40 bg-blood-700/10 p-3 text-xs">
          <span className="text-blood-300">⚠ Haven't turned up yet — shift ends in <b><Timer until={employment.fire_at} /></b>.</span>{' '}
          <span className="text-ink-100/65">Check in at least once before then or you'll be fired.</span>
        </div>
      )}
      {onShift && turnedUp && cooldownPending && (
        <div className="mt-3 rounded-md border border-money-500/30 bg-money-500/5 p-3 text-xs text-money-400">
          ✓ Turned up for this shift — your job is safe. Keep checking in hourly to stack wages.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <button disabled={busy === 'checkin' || !employment.can_checkin_now || character.energy < job.taskEnergy}
          className="btn btn-primary text-xs" onClick={onCheckin}>
          {busy === 'checkin'
            ? '...'
            : !onShift
              ? 'Off shift'
              : !cooldownReady
                ? <>Wait <Timer until={employment.next_checkin_at} /></>
                : 'Check in'}
        </button>
        <button disabled={busy === 'collect' || employment.pending_pay <= 0}
          className="btn btn-money text-xs" onClick={onCollect}>
          {busy === 'collect' ? '...' : `Collect ${fmt(employment.pending_pay)}`}
        </button>
        <button disabled={busy === 'quit'}
          className="btn btn-ghost text-xs" onClick={onQuit}>
          {busy === 'quit' ? '...' : 'Quit job'}
        </button>
      </div>
    </Card>
  );
}

export default function Jobs() {
  const { character, refresh } = useGame();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  useScrollOnMessage(msg);

  async function load() { setData(await api.get('/jobs')); }
  useEffect(() => { load(); }, []);

  async function call(action, body, key) {
    setBusy(key); setMsg(null);
    try {
      const r = await api.post(`/jobs/${action}`, body);
      if (r.pay) setMsg(`Collected ${fmt(r.pay)}`);
      else if (r.finalPay > 0) setMsg(`Final paycheck ${fmt(r.finalPay)}`);
      else if (r.earned) setMsg(`Hour clocked — +${fmt(r.earned)} pending${r.levels ? ` (levelled up ${r.levels}×!)` : ''}.`);
      else if (r.levels) setMsg(`Shift done — levelled up ${r.levels}×!`);
      else setMsg('Done.');
      await refresh(); await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  if (!data) return null;
  const employed = !!data.employment;

  return (
    <div className="space-y-4">
      {msg && <Card><p className="text-xs">{msg}</p></Card>}

      {employed
        ? <EmploymentCard
            employment={data.employment}
            character={character}
            onCheckin={() => call('checkin', null, 'checkin')}
            onCollect={() => call('collect', null, 'collect')}
            onQuit={() => call('quit', null, 'quit')}
            busy={busy}
          />
        : <Card title="💼 The Job Market" subtitle="Pick a permanent role for steady passive income. Each job has a fixed shift schedule — turn up (check in at least once) every shift to keep your job, and check in hourly while on shift to stack wages. Pay drops into pending immediately and can be collected anytime (but is lost on firing).">
            <p className="text-xs text-ink-100/55">Browse the listings below — eligible jobs have a green Apply button.</p>
          </Card>
      }

      <Card title={employed ? 'Other roles you could move to' : 'Job listings'} subtitle={employed ? 'Quit your current job first to switch.' : null}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.jobs.map(j => {
            const isCurrent = j.isCurrent;
            const canApply = !employed && j.eligible;
            return (
              <div key={j.id}
                className={`rounded-lg p-3 border ${isCurrent
                  ? 'border-money-500/50 bg-money-600/10'
                  : j.eligible
                    ? 'border-ink-100/10 bg-ink-950/40'
                    : 'border-ink-100/5 bg-ink-950/30 opacity-65'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{j.emoji} {j.name}</div>
                    <div className="text-[10px] text-ink-100/55">£{j.hourly.toLocaleString()}/hour while on shift</div>
                  </div>
                  {isCurrent && <span className="text-[9px] uppercase text-money-400 tracking-wide">current</span>}
                </div>
                <div className="text-[10px] text-yellow-300/85 mt-1.5">{j.scheduleLabel}</div>
                <div className="mt-2"><GateRow gates={j.gates} character={character} /></div>
                <div className="text-[10px] text-ink-100/45 mt-2 italic">"{j.task}"</div>
                {!isCurrent && (
                  <button disabled={!canApply || busy === `apply-${j.id}`}
                    className={`btn w-full text-xs mt-3 ${canApply ? 'btn-money' : 'btn-ghost'}`}
                    onClick={() => call('apply', { job_id: j.id }, `apply-${j.id}`)}>
                    {busy === `apply-${j.id}`
                      ? '...'
                      : !j.eligible
                        ? 'Not qualified'
                        : employed
                          ? 'Quit current first'
                          : 'Apply'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
