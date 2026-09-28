import { useState } from 'react';
import type { Hmi } from '../hmi/useChamber';
import { AlarmIcon, C, Panel, clock } from '../hmi/ui';
import type { LogEvent } from '../sim/engine';

const FILTERS: ('ALL' | LogEvent['kind'])[] = ['ALL', 'ALARM', 'OPERATOR', 'SYSTEM'];

export function Alarms({ hmi }: { hmi: Hmi }) {
  const { c } = hmi;
  const [f, setF] = useState<(typeof FILTERS)[number]>('ALL');
  const alarms = [...c.alarms].sort((a, b) => a.priority - b.priority || +b.time - +a.time);
  const events = c.events.filter(e => f === 'ALL' || e.kind === f);
  const stateOf = (a: (typeof alarms)[number]) => (a.active ? (a.acked ? 'Active · acknowledged' : 'Active · unacknowledged') : 'Returned · unacknowledged');

  return (
    <div className="grid gap-3" style={{ gridTemplateRows: 'auto minmax(0,1fr)' }}>
      <Panel title={`Alarm summary — ${alarms.length} alarm(s)`} right={<button className="btn btn-sm" disabled={!alarms.some(a => !a.acked)} onClick={() => hmi.ack()}>Acknowledge all</button>} bodyClass="!p-0">
        <div className="max-h-[300px] overflow-auto scroll">
          <table className="tbl">
            <thead><tr><th className="w-[70px]">Priority</th><th>Time</th><th>Tag</th><th>Description</th><th className="!text-right">Value</th><th className="!text-right">Limit</th><th>State</th><th /></tr></thead>
            <tbody>
              {alarms.length === 0 && <tr><td colSpan={8} className="text-center text-ink-2 !py-6">No alarms</td></tr>}
              {alarms.map(a => (
                <tr key={a.id} style={{ fontWeight: a.acked ? 400 : 600 }}>
                  <td><span className={a.active && !a.acked ? 'blink inline-flex' : 'inline-flex'}><AlarmIcon priority={a.priority} /></span> <span className="text-[12px] ml-1">{['High', 'Medium', 'Low'][a.priority - 1]}</span></td>
                  <td className="num">{clock(a.time)}</td>
                  <td className="tag !text-[12px] !text-ink">{a.tag}</td>
                  <td>{a.text}</td>
                  <td className="num text-right">{a.value}</td>
                  <td className="num text-right text-ink-2">{a.limit}</td>
                  <td style={{ color: a.active && !a.acked ? C.danger : C.ink2 }}>{stateOf(a)}</td>
                  <td className="text-right">{!a.acked && <button className="btn btn-sm" onClick={() => hmi.ack(a.id)}>Ack</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Event journal" className="min-h-[320px]" bodyClass="!p-0 flex-1 flex flex-col min-h-0"
        right={<div className="flex gap-1">{FILTERS.map(x => <button key={x} className="btn btn-sm" onClick={() => setF(x)} style={f === x ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>{x[0] + x.slice(1).toLowerCase()}</button>)}</div>}>
        <div className="flex-1 overflow-auto scroll max-h-[420px]">
          <table className="tbl">
            <thead><tr><th className="w-[110px]">Time</th><th className="w-[110px]">Source</th><th>Event</th></tr></thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={3} className="text-center text-ink-2 !py-6">No events recorded</td></tr>}
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="num">{clock(e.time)}</td>
                  <td className="text-[12px]" style={{ color: e.kind === 'ALARM' ? C.danger : e.kind === 'OPERATOR' ? C.accent : C.ink2 }}>{e.kind[0] + e.kind.slice(1).toLowerCase()}</td>
                  <td>{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
