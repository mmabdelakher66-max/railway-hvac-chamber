import type { Hmi } from '../hmi/useChamber';
import { AlarmIcon, AnalogBar, C, Panel, StateBadge, fmtTime } from '../hmi/ui';
import { HOLD_REQUIRED } from '../sim/engine';

/* ── P&ID symbol helpers (ISA 5.1 style) ── */
function Bubble({ x, y, tag, n }: { x: number; y: number; tag: string; n: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={17} fill={C.paper} stroke={C.ink} strokeWidth={1.4} />
      <line x1={x - 17} y1={y} x2={x + 17} y2={y} stroke={C.ink} strokeWidth={1} />
      <text x={x} y={y - 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={C.ink}>{tag}</text>
      <text x={x} y={y + 11} textAnchor="middle" fontSize={9.5} fill={C.ink}>{n}</text>
    </g>
  );
}
function Val({ x, y, v, unit, w = 84, alarm, desc }: { x: number; y: number; v: string; unit: string; w?: number; alarm?: 1 | 2 | 3; desc?: string }) {
  const col = alarm === 1 ? C.danger : alarm === 2 ? C.warn : alarm === 3 ? C.deep : C.line2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={24} fill={C.panel} stroke={col} strokeWidth={alarm ? 2 : 1} rx={2} />
      <text x={x + w - 30} y={y + 16.5} textAnchor="end" fontSize={13} fontWeight={700} fill={C.ink} style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</text>
      <text x={x + w - 26} y={y + 16.5} fontSize={10} fill={C.muted}>{unit}</text>
      {alarm && <foreignObject x={x + w + 3} y={y + 4} width={16} height={16}><AlarmIcon priority={alarm} size={16} /></foreignObject>}
      {desc && <text x={x} y={y + 37} fontSize={10} fill={C.muted}>{desc}</text>}
    </g>
  );
}
function Fan({ x, y, r, on }: { x: number; y: number; r: number; on: boolean }) {
  const f = on ? C.ink : C.paper, s = on ? C.paper : C.ink;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={f} stroke={C.ink} strokeWidth={1.5} />
      {[0, 120, 240].map(a => (
        <path key={a} d={`M${x} ${y} q ${r * 0.55} ${-r * 0.2} ${r * 0.7} ${-r * 0.7}`} fill="none" stroke={s} strokeWidth={2} transform={`rotate(${a} ${x} ${y})`} />
      ))}
    </g>
  );
}
function Coil({ x, y, w, h, on }: { x: number; y: number; w: number; h: number; on: boolean }) {
  const lines = [];
  for (let i = 0; i < 5; i++) lines.push(<line key={i} x1={x} y1={y + (h / 5) * i} x2={x + w} y2={y + (h / 5) * (i + 1)} stroke={on ? C.paper : C.ink} strokeWidth={1.2} />);
  return <g><rect x={x} y={y} width={w} height={h} fill={on ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.5} />{lines}</g>;
}
function Heater({ x, y, w, h, on }: { x: number; y: number; w: number; h: number; on: boolean }) {
  const pts = Array.from({ length: 7 }, (_, i) => `${x + 6 + (i % 2) * (w - 12)},${y + 6 + i * ((h - 12) / 6)}`).join(' ');
  return <g><rect x={x} y={y} width={w} height={h} fill={on ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.5} /><polyline points={pts} fill="none" stroke={on ? C.paper : C.ink} strokeWidth={1.4} /></g>;
}
function Duct({ d, flow }: { d: string; flow: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke={flow ? C.ink2 : C.line2} strokeWidth={15} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={flow ? '#E4EAF4' : C.tint} strokeWidth={11} strokeLinejoin="round" />
    </g>
  );
}
function Arrow({ x, y, dir, on }: { x: number; y: number; dir: 'r' | 'l' | 'u' | 'd'; on: boolean }) {
  const rot = { r: 0, d: 90, l: 180, u: 270 }[dir];
  return <polygon points="-5,-5 5,0 -5,5" transform={`translate(${x} ${y}) rotate(${rot})`} fill={on ? C.ink : C.line2} />;
}

export function Overview({ hmi }: { hmi: Hmi }) {
  const { c } = hmi;
  const m = c.measured(), p = c.p, P = c.params;
  const run = c.running;
  const alarmFor = (tag: string) => {
    const a = c.alarms.filter(x => x.tag === tag && x.active).sort((x, y) => x.priority - y.priority)[0];
    return a?.priority;
  };
  const f1 = (v: number) => v.toFixed(1);
  const seatsOn = Math.round((P.occupancy / 100) * 10);

  return (
    <div className="grid gap-3 h-full min-h-[640px]" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <Panel title="Process overview — chamber P&ID mimic" className="min-w-0"
        right={<span className="flex items-center gap-4 text-[11px] font-normal text-ink-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: C.ink }} />Running</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block border" style={{ borderColor: C.ink, background: C.paper }} />Stopped</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: C.accent }} />Setpoint</span>
        </span>}
        bodyClass="flex-1 flex items-center justify-center">
        <svg viewBox="0 0 1000 545" className="w-full h-full max-h-[calc(100vh-190px)]" role="img" aria-label="Chamber process mimic" fontFamily="Inter, Segoe UI, Arial">
          <defs>
            <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke={C.line2} strokeWidth="2" />
            </pattern>
          </defs>

          {/* Zones */}
          <rect x={20} y={30} width={450} height={500} fill={C.panel} stroke={C.ink2} strokeWidth={2} />
          <rect x={530} y={30} width={450} height={500} fill={C.panel} stroke={C.ink2} strokeWidth={2} />
          <rect x={470} y={30} width={60} height={500} fill="url(#hatch)" stroke={C.ink2} strokeWidth={1} />
          <text x={34} y={52} fontSize={12} fontWeight={700} fill={C.ink}>ZONE A — CLIMATIC CHAMBER (SIMULATED OUTDOOR)</text>
          <text x={544} y={52} fontSize={12} fontWeight={700} fill={C.ink}>ZONE B — PASSENGER COACH SIMULATOR</text>

          {/* Zone A instruments */}
          <Bubble x={56} y={100} tag="TT" n="101" />
          <Val x={80} y={88} v={f1(m.tA)} unit="°C" alarm={alarmFor('TT-101')} desc={`Air temperature · SP ${P.zoneA_SP.toFixed(1)} °C`} />
          <Bubble x={56} y={170} tag="MT" n="101" />
          <Val x={80} y={158} v={f1(m.rhA)} unit="%RH" desc={`Relative humidity · SP ${P.zoneA_RH_SP} %`} />

          {/* Solar array */}
          <rect x={300} y={78} width={140} height={14} fill={run && P.solar > 0 ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.5} />
          {[315, 350, 385, 420].map((x, i) => <line key={x} x1={x} y1={94} x2={410 + i * 22} y2={192} stroke={run && P.solar > 0 ? C.warn : C.line2} strokeWidth={1.4} strokeDasharray="5 4" />)}
          <text x={300} y={70} fontSize={10.5} fontWeight={600} fill={C.ink}>SL-101 solar array</text>
          <text x={440} y={70} textAnchor="end" fontSize={10.5} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>{run ? P.solar : 0} W/m²</text>

          {/* Door interlock */}
          <line x1={20} y1={300} x2={20} y2={360} stroke={C.panel} strokeWidth={4} />
          {c.faults.doorOpen
            ? <><line x1={20} y1={300} x2={62} y2={318} stroke={C.danger} strokeWidth={3} /><path d="M20 360 A 60 60 0 0 0 62 318" fill="none" stroke={C.danger} strokeDasharray="3 3" /></>
            : <line x1={20} y1={300} x2={20} y2={360} stroke={C.ink} strokeWidth={4} />}
          <text x={34} y={335} fontSize={10.5} fontWeight={600} fill={C.ink}>ZS-501</text>
          <text x={34} y={349} fontSize={10.5} fill={c.faults.doorOpen ? C.danger : C.ink2}>{c.faults.doorOpen ? 'Door OPEN' : 'Door closed'}</text>

          {/* Fresh-air intake + damper */}
          <Duct d="M150 285 H395" flow={p.fanRun && p.damper > 0} />
          <Arrow x={220} y={285} dir="r" on={p.fanRun && p.damper > 0} />
          <circle cx={300} cy={285} r={10} fill={C.paper} stroke={C.ink} strokeWidth={1.5} />
          <line x1={300} y1={285} x2={300 + 10 * Math.cos((p.damper / 100) * Math.PI / 2 - Math.PI / 2)} y2={285 + 10 * Math.sin((p.damper / 100) * Math.PI / 2 - Math.PI / 2)} stroke={C.ink} strokeWidth={2.2} />
          <line x1={300 - 10 * Math.cos((p.damper / 100) * Math.PI / 2 - Math.PI / 2)} y1={285 - 10 * Math.sin((p.damper / 100) * Math.PI / 2 - Math.PI / 2)} x2={300} y2={285} stroke={C.ink} strokeWidth={2.2} />
          <text x={150} y={263} fontSize={10.5} fontWeight={600} fill={C.ink}>DMP-301 fresh-air damper</text>
          <text x={150} y={316} fontSize={10.5} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>Position {p.damper.toFixed(0)} %</text>

          {/* Climatic plant */}
          <rect x={45} y={400} width={300} height={115} fill={C.panel} stroke={C.ink} strokeWidth={1.5} />
          <text x={55} y={417} fontSize={10.5} fontWeight={700} fill={C.ink}>AHU-101 climatic conditioning plant</text>
          <text x={335} y={417} textAnchor="end" fontSize={10.5} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>Output {p.plantOut.toFixed(0)} %</text>
          <Coil x={62} y={430} w={34} h={52} on={run && P.zoneA_SP < p.tA + 0.5} />
          <Heater x={122} y={430} w={34} h={52} on={(run && P.zoneA_SP > p.tA - 0.5) || (c.faults.heaterRunaway && c.state !== 'TRIPPED')} />
          <rect x={182} y={430} width={34} height={52} fill={run ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.5} />
          {[0, 1, 2].map(r => [0, 1].map(k => <circle key={`${r}${k}`} cx={192 + k * 14} cy={442 + r * 14} r={2.4} fill={run ? C.paper : C.ink} />))}
          <Fan x={285} y={456} r={24} on={run} />
          {[['CC-101', 79], ['EH-101', 139], ['HU-101', 199], ['M-101', 285]].map(([t, x]) => <text key={t} x={x} y={503} textAnchor="middle" fontSize={9.5} fill={C.ink2}>{t}</text>)}
          <Arrow x={330} y={390} dir="u" on={run} />
          <line x1={330} y1={400} x2={330} y2={394} stroke={run ? C.ink : C.line2} strokeWidth={2} />

          {/* Unit under test */}
          <rect x={395} y={193} width={210} height={18} fill={C.paper} stroke={C.ink} strokeWidth={1} />
          <text x={500} y={206} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.ink}>UUT — HVAC UNIT UNDER TEST</text>
          <rect x={395} y={215} width={210} height={120} fill={C.paper} stroke={C.ink} strokeWidth={2.5} />
          <line x1={500} y1={215} x2={500} y2={335} stroke={C.ink2} strokeDasharray="4 3" />
          <Fan x={428} y={250} r={15} on={p.compRun} />
          <circle cx={462} cy={300} r={15} fill={p.compRun ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.5} />
          <text x={462} y={304.5} textAnchor="middle" fontSize={12} fontWeight={700} fill={p.compRun ? C.paper : C.ink}>C</text>
          <text x={428} y={277} textAnchor="middle" fontSize={8.5} fill={C.ink2}>M-203</text>
          <text x={425} y={326} textAnchor="middle" fontSize={8.5} fill={C.ink2}>Condenser</text>
          <Coil x={512} y={232} w={26} h={62} on={p.compRun || (p.q < -0.5)} />
          <Fan x={574} y={262} r={17} on={p.fanRun} />
          <text x={574} y={292} textAnchor="middle" fontSize={8.5} fill={C.ink2}>M-202</text>
          <text x={558} y={326} textAnchor="middle" fontSize={8.5} fill={C.ink2}>Evaporator</text>

          <rect x={400} y={345} width={200} height={50} fill={C.tint} stroke={C.line} />
          <text x={410} y={364} fontSize={11} fill={C.ink}><tspan fontWeight={700}>{P.mode}</tspan><tspan fill={C.ink2}> · compressor {p.compRun ? 'running' : 'stopped'}</tspan></text>
          <text x={410} y={384} fontSize={11} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>Capacity <tspan fill={C.ink} fontWeight={700}>{Math.abs(p.q).toFixed(1)}</tspan> / {p.qMax.toFixed(1)} kW · COP {p.cop.toFixed(2)}</text>

          <Bubble x={374} y={440} tag="JT" n="401" />
          <Val x={396} y={428} w={70} v={f1(m.power)} unit="kW" desc="UUT power" />

          {/* Differential pressure across partition */}
          <line x1={470} y1={488} x2={530} y2={488} stroke={C.ink2} strokeDasharray="3 3" />
          <Bubble x={500} y={488} tag="PDT" n="302" />
          <Val x={540} y={476} w={78} v={f1(m.dp)} unit="Pa" alarm={alarmFor('PDT-302')} desc="Coach vs chamber" />

          {/* Supply duct in coach */}
          <Duct d="M605 250 H650 V100 H960" flow={p.fanRun} />
          <Arrow x={627} y={250} dir="r" on={p.fanRun} />
          <Arrow x={900} y={100} dir="r" on={p.fanRun} />
          {[700, 790, 880].map(x => (<g key={x}><line x1={x} y1={110} x2={x} y2={128} stroke={p.fanRun ? C.ink : C.line2} strokeWidth={1.6} /><Arrow x={x} y={130} dir="d" on={p.fanRun} /></g>))}
          <text x={965} y={82} textAnchor="end" fontSize={10} fill={C.ink2}>Supply air to ceiling diffusers</text>
          <Bubble x={690} y={170} tag="FT" n="301" />
          <Val x={714} y={158} w={98} v={m.airflow.toFixed(0)} unit="m³/h" alarm={alarmFor('FT-301')} desc="Supply airflow" />
          <Bubble x={855} y={170} tag="TT" n="311" />
          <Val x={879} y={158} w={78} v={f1(m.tSupply)} unit="°C" desc="Supply air" />

          {/* Return air */}
          <Duct d="M720 310 H605" flow={p.fanRun} />
          <Arrow x={650} y={310} dir="l" on={p.fanRun} />
          <text x={660} y={290} fontSize={10} fill={C.ink2}>Return air</text>
          <Bubble x={640} y={355} tag="TT" n="312" />
          <Val x={664} y={343} w={78} v={f1(m.tReturn)} unit="°C" desc="Return air" />

          {/* Coach instruments */}
          <Bubble x={790} y={255} tag="TT" n="201" />
          <Val x={814} y={243} w={78} v={f1(m.tB)} unit="°C" alarm={alarmFor('TT-201')} desc={`Coach air · SP ${P.zoneB_SP.toFixed(1)} °C`} />
          <Bubble x={790} y={330} tag="MT" n="201" />
          <Val x={814} y={318} w={78} v={f1(m.rhB)} unit="%RH" alarm={alarmFor('MT-201')} desc="Coach humidity" />

          {/* Passenger load simulator */}
          <rect x={640} y={410} width={320} height={105} fill={C.panel} stroke={C.ink} strokeWidth={1.5} />
          <text x={650} y={427} fontSize={10.5} fontWeight={700} fill={C.ink}>LS-201 passenger load simulator</text>
          <text x={950} y={427} textAnchor="end" fontSize={10.5} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>Output {p.loadOut.toFixed(0)} %</text>
          {Array.from({ length: 10 }, (_, i) => {
            const on = run && i < seatsOn;
            const x = 655 + i * 29;
            return <g key={i}><rect x={x} y={445} width={20} height={24} rx={3} fill={on ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.2} /><rect x={x - 2} y={469} width={24} height={8} rx={2} fill={on ? C.ink : C.paper} stroke={C.ink} strokeWidth={1.2} /></g>;
          })}
          <text x={650} y={503} fontSize={10} fill={C.ink2} style={{ fontVariantNumeric: 'tabular-nums' }}>Occupancy {P.occupancy} % of 100 pax · sensible + latent heat</text>
        </svg>
      </Panel>

      <div className="flex flex-col gap-3 min-h-0">
        <Panel title="Test control" right={<StateBadge state={c.state} />}>
          <div className="grid grid-cols-2 gap-y-1 text-[12px] text-ink-2">
            <span>Test time</span><span className="num text-right text-ink font-semibold">T+ {fmtTime(c.simTime)}</span>
            <span>Steady-state hold</span><span className="num text-right text-ink font-semibold">{fmtTime(c.holdTime)}</span>
          </div>
          <div className="h-2 mt-2 rounded-sm" style={{ background: C.tint, border: `1px solid ${C.line}` }}>
            <div className="h-full" style={{ width: `${Math.min(100, (c.holdTime / HOLD_REQUIRED) * 100)}%`, background: c.holdTime >= HOLD_REQUIRED ? C.ok : C.accent }} />
          </div>
          <div className="text-[11px] text-muted mt-1">{c.holdTime >= HOLD_REQUIRED ? 'Test point valid — 15 min within ±0.5 K' : 'Valid test point: 15 min within ±0.5 K of setpoints'}</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className="btn btn-primary" disabled={run || c.state === 'TRIPPED'} onClick={hmi.start}>Start test</button>
            <button className="btn" disabled={!run} onClick={hmi.stop}>Stop</button>
          </div>
          {c.state === 'TRIPPED' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button className="btn" onClick={hmi.reset}>Reset interlocks</button>
              <button className="btn" disabled={!c.estop} onClick={hmi.releaseEstop}>Release E-stop</button>
            </div>
          )}
          {c.msg && <div className="text-[12px] mt-2 px-2 py-1.5 rounded-[3px]" style={{ background: c.msg.ok ? '#E6F2EC' : '#FBEEEE', color: c.msg.ok ? C.ok : C.danger }}>{c.msg.text}</div>}
          <button className="estop mt-3" onClick={hmi.estop} disabled={c.estop}>{c.estop ? 'E-STOP ACTIVE' : 'EMERGENCY STOP'}</button>
        </Panel>

        <Panel title="Key process values" className="flex-1" bodyClass="flex-1 overflow-auto scroll">
          <AnalogBar active={run && c.state !== 'RAMP'} tag="TT-101" label="Climatic zone" pv={m.tA} sp={P.zoneA_SP} min={-10} max={60} lo={P.zoneA_SP - 2} hi={P.zoneA_SP + 2} unit="°C" />
          <AnalogBar active={c.state === 'STABLE'} tag="TT-201" label="Coach interior" pv={m.tB} sp={P.zoneB_SP} min={10} max={45} lo={P.zoneB_SP - 1.5} hi={P.zoneB_SP + 1.5} unit="°C" />
          <AnalogBar active={p.fanRun} tag="MT-201" label="Coach humidity" pv={m.rhB} min={0} max={100} lo={30} hi={70} unit="%RH" digits={0} />
          <AnalogBar active={p.fanRun} tag="PDT-302" label="Coach pressurisation" pv={m.dp} min={0} max={80} lo={10} hi={70} unit="Pa" />
          <AnalogBar tag="UUT" label="Delivered capacity" pv={Math.abs(p.q)} min={0} max={45} lo={0} hi={p.qMax} unit="kW" />
          <AnalogBar tag="JT-401" label="Electrical power" pv={m.power} min={0} max={30} unit="kW" />
        </Panel>
      </div>
    </div>
  );
}
