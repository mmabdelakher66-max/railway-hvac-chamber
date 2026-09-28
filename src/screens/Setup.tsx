import { useState } from 'react';
import type { Hmi } from '../hmi/useChamber';
import { C, Panel } from '../hmi/ui';
import { RECIPES, type Params, type UutMode } from '../sim/engine';

type NumKey = Exclude<keyof Params, 'mode'>;
const ROWS: { key: NumKey; tag: string; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'zoneA_SP', tag: 'TIC-101', label: 'Climatic zone temperature', unit: '°C', min: -10, max: 55, step: 0.5 },
  { key: 'zoneA_RH_SP', tag: 'MIC-101', label: 'Climatic zone humidity', unit: '%RH', min: 20, max: 90, step: 1 },
  { key: 'solar', tag: 'SL-101', label: 'Solar load (equivalent)', unit: 'W/m²', min: 0, max: 1000, step: 50 },
  { key: 'occupancy', tag: 'LS-201', label: 'Passenger occupancy', unit: '%', min: 0, max: 100, step: 5 },
  { key: 'freshAir', tag: 'DMP-301', label: 'Fresh-air damper', unit: '%', min: 0, max: 100, step: 5 },
  { key: 'airflow', tag: 'M-202', label: 'Supply airflow', unit: '%', min: 30, max: 100, step: 5 },
  { key: 'zoneB_SP', tag: 'TIC-201', label: 'Coach interior setpoint', unit: '°C', min: 16, max: 28, step: 0.5 },
];
const MODES: UutMode[] = ['COOL', 'HEAT', 'VENT', 'OFF'];

export function Setup({ hmi }: { hmi: Hmi }) {
  const { c } = hmi;
  const [draft, setDraft] = useState<Params>({ ...c.params });
  const [recipe, setRecipe] = useState<string | null>(null);
  const dirty = (Object.keys(draft) as (keyof Params)[]).filter(k => draft[k] !== c.params[k]);

  const load = (id: string) => { setRecipe(id); setDraft({ ...c.params, ...RECIPES[id].p }); };
  const set = (k: NumKey, v: number, min: number, max: number) => setDraft(d => ({ ...d, [k]: Math.max(min, Math.min(max, isNaN(v) ? min : v)) }));
  const download = () => { hmi.setParams(draft); };

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '320px minmax(0,1fr)' }}>
      <Panel title="Test recipes">
        <div className="flex flex-col gap-2">
          {Object.entries(RECIPES).map(([id, r]) => (
            <button key={id} onClick={() => load(id)} className="text-left rounded-[3px] px-3 py-2.5 border cursor-pointer"
              style={{ borderColor: recipe === id ? C.accent : C.line, background: recipe === id ? '#E4F1FA' : C.panel }}>
              <div className="font-semibold text-[13px]">{r.label}</div>
              <div className="text-[12px] text-ink-2">{r.note}</div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-3 leading-snug">Recipes are illustrative. Final test conditions, ranges and tolerances will be defined with EOG and the applicable railway HVAC standards.</p>
      </Panel>

      <Panel title="Setpoints" right={<span className="text-[12px] font-normal text-ink-2">{dirty.length ? `${dirty.length} change(s) pending download` : 'Controller in sync'}</span>}>
        <table className="tbl">
          <thead><tr><th>Tag</th><th>Parameter</th><th className="!text-right">Active</th><th className="!text-right">New value</th><th className="w-[34%]">Adjust</th><th>Range</th></tr></thead>
          <tbody>
            {ROWS.map(r => {
              const changed = draft[r.key] !== c.params[r.key];
              return (
                <tr key={r.key}>
                  <td className="tag">{r.tag}</td>
                  <td>{r.label}</td>
                  <td className="num text-right">{c.params[r.key]} <span className="text-muted text-[11px]">{r.unit}</span></td>
                  <td className="text-right"><input type="number" value={draft[r.key]} step={r.step} min={r.min} max={r.max}
                    style={changed ? { borderColor: C.accent, background: '#EEF6FC', fontWeight: 600 } : undefined}
                    onChange={e => set(r.key, parseFloat(e.target.value), r.min, r.max)} /></td>
                  <td><input type="range" min={r.min} max={r.max} step={r.step} value={draft[r.key]} onChange={e => set(r.key, parseFloat(e.target.value), r.min, r.max)} /></td>
                  <td className="num text-[12px] text-muted whitespace-nowrap">{r.min} – {r.max} {r.unit}</td>
                </tr>
              );
            })}
            <tr>
              <td className="tag">UUT</td><td>Unit operating mode</td>
              <td className="num text-right">{c.params.mode}</td>
              <td colSpan={3}>
                <div className="flex gap-1 justify-end">
                  {MODES.map(m => (
                    <button key={m} className="btn btn-sm" onClick={() => setDraft(d => ({ ...d, mode: m }))}
                      style={draft.mode === m ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>{m}</button>
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex items-center gap-2 mt-4">
          <button className="btn" disabled={!dirty.length} onClick={() => { setDraft({ ...c.params }); setRecipe(null); }}>Discard changes</button>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-primary" disabled={!dirty.length} onClick={download}>Download to controller</button>
            <button className="btn btn-primary" disabled={c.running || c.state === 'TRIPPED'} onClick={() => { download(); hmi.start(); }}>Download &amp; start test</button>
          </div>
        </div>
        {c.state === 'TRIPPED' && <p className="text-[12px] mt-2" style={{ color: C.danger }}>Start inhibited: interlock tripped — reset on the Interlocks screen.</p>}
      </Panel>
    </div>
  );
}
