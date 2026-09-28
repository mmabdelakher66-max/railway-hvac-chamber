import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Hmi } from '../hmi/useChamber';
import { C, Panel } from '../hmi/ui';
import type { HistPoint } from '../sim/engine';

type Pen = { key: keyof HistPoint; tag: string; label: string; color: string; dash?: string; unit: string };
const TEMP: Pen[] = [
  { key: 'tA', tag: 'TT-101', label: 'Climatic zone', color: C.warn, unit: '°C' },
  { key: 'spA', tag: 'TIC-101.SP', label: 'Climatic SP', color: C.warn, dash: '5 4', unit: '°C' },
  { key: 'tB', tag: 'TT-201', label: 'Coach interior', color: C.deep, unit: '°C' },
  { key: 'spB', tag: 'TIC-201.SP', label: 'Coach SP', color: C.deep, dash: '5 4', unit: '°C' },
  { key: 'tSup', tag: 'TT-311', label: 'Supply air', color: C.accent, unit: '°C' },
];
const PERF: Pen[] = [
  { key: 'q', tag: 'UUT.Q', label: 'Delivered capacity', color: C.deep, unit: 'kW' },
  { key: 'power', tag: 'JT-401', label: 'Electrical power', color: C.accent, unit: 'kW' },
];
const SPANS = [15, 30, 60, 120];

function Chart({ title, pens, data, hidden, toggle, unit }: { title: string; pens: Pen[]; data: HistPoint[]; hidden: Set<string>; toggle: (k: string) => void; unit: string }) {
  const last = data[data.length - 1];
  return (
    <Panel title={title} className="min-h-0" bodyClass="flex gap-3">
      <div className="w-[210px] shrink-0 flex flex-col gap-1">
        {pens.map(p => (
          <label key={p.key} className="flex items-center gap-2 text-[12px] cursor-pointer py-0.5">
            <input type="checkbox" checked={!hidden.has(p.key)} onChange={() => toggle(p.key)} style={{ accentColor: C.deep }} />
            <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={p.color} strokeWidth="2.5" strokeDasharray={p.dash} /></svg>
            <span className="flex-1"><span className="tag block">{p.tag}</span>{p.label}</span>
            <span className="num font-semibold">{last ? (last[p.key] as number).toFixed(1) : '—'}</span>
          </label>
        ))}
      </div>
      <div className="flex-1 h-[250px] min-w-0">
        {data.length < 2 ? (
          <div className="h-full grid place-items-center text-ink-2 text-[13px] border border-dashed rounded" style={{ borderColor: C.line }}>No data — start a test to record trends</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => `${Math.round(v)}`} stroke={C.line2} label={{ value: 'Test time (min)', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: C.muted }} />
              <YAxis stroke={C.line2} width={46} domain={['auto', 'auto']} tickFormatter={v => `${Math.round(v)}`} label={{ value: unit, angle: -90, position: 'insideLeft', fontSize: 11, fill: C.muted }} />
              <Tooltip formatter={(v) => (typeof v === 'number' ? v.toFixed(2) : v)} labelFormatter={v => `T+ ${Number(v).toFixed(1)} min`}
                contentStyle={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, fontSize: 12, color: C.ink }} />
              {pens.filter(p => !hidden.has(p.key)).map(p => (
                <Line key={p.key} dataKey={p.key} name={p.tag} stroke={p.color} strokeDasharray={p.dash} strokeWidth={p.dash ? 1.5 : 2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}

export function Trends({ hmi }: { hmi: Hmi }) {
  const { c } = hmi;
  const [span, setSpan] = useState(60);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const end = c.history.length ? c.history[c.history.length - 1].t : 0;
  const data = c.history.filter(h => h.t >= end - span);

  const exportCsv = () => {
    const blob = new Blob([c.historyCsv()], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TC-01_test_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink-2 mr-1">Time span</span>
        {SPANS.map(s => <button key={s} className="btn btn-sm" onClick={() => setSpan(s)} style={span === s ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>{s} min</button>)}
        <span className="text-[12px] text-muted ml-3">Historian sample: 15 s · {c.history.length} samples recorded</span>
        <button className="btn btn-sm ml-auto" disabled={!c.history.length} onClick={exportCsv}>Export CSV</button>
      </div>
      <Chart title="Temperatures" pens={TEMP} data={data} hidden={hidden} toggle={toggle} unit="°C" />
      <Chart title="Unit performance" pens={PERF} data={data} hidden={hidden} toggle={toggle} unit="kW" />
    </div>
  );
}
