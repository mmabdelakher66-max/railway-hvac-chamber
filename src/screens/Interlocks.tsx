import type { Hmi } from '../hmi/useChamber';
import { C, Led, Panel } from '../hmi/ui';
import type { FaultKey } from '../sim/engine';

const FAULTS: { key: FaultKey; label: string; effect: string }[] = [
  { key: 'fanFail', label: 'Supply fan M-202 failure', effect: 'Airflow collapses → IL-03 trips the compressor (on a running test)' },
  { key: 'heaterRunaway', label: 'Climatic heater EH-101 stuck on', effect: 'TT-101 rises → high alarm at 55 °C → IL-01 trip at 60 °C opens the safety contactor' },
  { key: 'elecFault', label: 'Electrical fault on UUT supply', effect: 'Protection relay → IL-04 isolates the unit' },
  { key: 'doorOpen', label: 'Chamber access door opened', effect: 'IL-05 trips and inhibits start until the door is closed' },
];

export function Interlocks({ hmi }: { hmi: Hmi }) {
  const { c } = hmi;
  const causes = c.causes();
  const anyFault = Object.values(c.faults).some(Boolean);
  const tripped = c.interlocks.filter(i => i.tripped);
  const readyToReset = c.state === 'TRIPPED' && tripped.every(i => !causes[i.id]);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
      <div className="flex flex-col gap-3">
        <Panel title="Safety interlocks — cause & effect" bodyClass="!p-0"
          right={<div className="flex gap-2">
            <button className="btn btn-sm" disabled={!c.estop} onClick={hmi.releaseEstop}>Release E-stop</button>
            <button className="btn btn-sm btn-primary" disabled={c.state !== 'TRIPPED'} onClick={hmi.reset}>Reset interlocks</button>
          </div>}>
          {c.msg && (
            <div className="px-3 py-2 text-[13px] border-b" style={{ borderColor: C.line, background: c.msg.ok ? '#E6F2EC' : '#FBEEEE', color: c.msg.ok ? C.ok : C.danger }}>
              {c.msg.text}
            </div>
          )}
          {c.state === 'TRIPPED' && (
            <div className="px-3 py-2 text-[13px] border-b text-ink-2" style={{ borderColor: C.line }}>
              {readyToReset
                ? <>All trip causes are cleared — press <b className="text-ink">Reset interlocks</b> to return to Idle.</>
                : <>Reset sequence: <b className="text-ink">1.</b> clear the cause (fault / door / E-stop) → <b className="text-ink">2.</b> wait until the Reset column shows “Ready” → <b className="text-ink">3.</b> press Reset interlocks.</>}
            </div>
          )}
          <table className="tbl">
            <thead><tr><th>ID</th><th>Device</th><th>Function</th><th>Trip condition</th><th>Action</th><th>Status</th><th>Reset</th></tr></thead>
            <tbody>
              {c.interlocks.map(il => {
                const cause = causes[il.id];
                return (
                  <tr key={il.id} style={il.tripped ? { background: '#FBEEEE' } : undefined}>
                    <td className="num font-semibold">{il.id}</td>
                    <td className="tag !text-[12px] !text-ink">{il.tag}</td>
                    <td>{il.text}</td>
                    <td className="text-ink-2">{il.condition}</td>
                    <td className="text-ink-2">{il.action}</td>
                    <td className="font-semibold whitespace-nowrap" style={{ color: il.tripped ? C.danger : C.ok }}><Led on color={il.tripped ? C.danger : C.ok} label={il.tripped ? 'Tripped' : 'Healthy'} /></td>
                    <td className="text-[12px] whitespace-nowrap" style={{ color: !il.tripped ? C.muted : cause ? C.danger : C.ok }}>
                      {!il.tripped ? '—' : cause ? cause : 'Ready'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Protection philosophy (proposed)">
          <ul className="text-[13px] text-ink-2 leading-relaxed list-disc pl-5">
            <li>Interlocks are latching: a trip stays active until the cause is cleared <b className="text-ink">and</b> an operator resets it. Clearing the fault alone does not restart anything.</li>
            <li>Acknowledging an alarm only confirms the operator has seen it. The alarm stays in the list until its condition clears (e.g. after reset).</li>
            <li>Safety functions run in a hardwired safety relay / safety PLC, independent of the SCADA. The HMI only displays and resets.</li>
            <li>Emergency stop: stop category and performance level to be set from a risk assessment (e.g. ISO 13849 / IEC 60204-1), confirmed with EOG.</li>
            <li>Alarm limits shown are placeholders pending EOG requirements and the applicable railway HVAC test standards.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Fault simulation (training / demo)" right={<button className="btn btn-sm" disabled={!anyFault} onClick={hmi.clearAllFaults}>Clear all faults</button>}>
        <p className="text-[12px] text-muted mb-3">Inject a fault to demonstrate how the control system detects it, raises alarms and brings the chamber to a safe state.</p>
        <div className="flex flex-col gap-2">
          {FAULTS.map(f => {
            const on = c.faults[f.key];
            return (
              <div key={f.key} className="rounded-[3px] border p-3" style={{ borderColor: on ? C.danger : C.line, background: on ? '#FBEEEE' : C.panel }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[13px]">{f.label}</span>
                  <button className="btn btn-sm" onClick={() => hmi.setFault(f.key, !on)} style={on ? { background: C.danger, color: C.paper, borderColor: C.danger } : undefined}>{on ? 'Clear' : 'Inject'}</button>
                </div>
                <div className="text-[12px] text-ink-2 mt-1">{f.effect}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[12px] text-ink-2">Chamber state: <b style={{ color: c.state === 'TRIPPED' ? C.danger : C.ink }}>{c.state}</b>{c.estop && <> · <b style={{ color: C.danger }}>E-stop active</b></>}</div>
      </Panel>
    </div>
  );
}
