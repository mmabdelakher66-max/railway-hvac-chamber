import { useEffect, useState, type ReactNode } from 'react';
import { Menu, X, ChevronRight, Home, Bell, Gauge, Wind, Zap, LineChart, SlidersHorizontal } from 'lucide-react';
import logo from '../assets/eog-logo.png';
import { AlarmIcon, AnalogBar, C, StateBadge, clock, fmtTime } from '../hmi/ui';
import type { Params, UutMode } from '../sim/engine';
import { LIMITS, MODES } from './link';
import { useRemoteClient, type TrendPt } from './useRemoteClient';

type Page = 'home' | 'alarms' | 'sp' | 'air' | 'unit' | 'trend' | 'control';

type Editable = 'zoneB_SP' | 'zoneA_SP' | 'freshAir' | 'occupancy';
const EDIT: { key: Editable; tag: string; label: string; unit: string; step: number }[] = [
  { key: 'zoneB_SP', tag: 'TIC-201', label: 'Coach setpoint', unit: '°C', step: 0.5 },
  { key: 'zoneA_SP', tag: 'TIC-101', label: 'Outside (climatic) setpoint', unit: '°C', step: 0.5 },
  { key: 'freshAir', tag: 'DMP-301', label: 'Fresh-air damper', unit: '%', step: 5 },
  { key: 'occupancy', tag: 'LS-201', label: 'Passengers (of 100)', unit: 'pax', step: 5 },
];

function Tile({ tag, label, value, unit, sub, bar }: { tag: string; label: string; value: string; unit: string; sub?: string; bar?: number }) {
  return (
    <div className="rounded-[4px] border p-3" style={{ borderColor: C.line, background: C.panel }}>
      <div className="tag">{tag}</div>
      <div className="text-[12px] text-ink-2">{label}</div>
      <div className="num font-bold text-[22px] leading-tight mt-1">{value} <span className="text-[12px] font-normal text-muted">{unit}</span></div>
      {bar !== undefined && <div className="h-1.5 mt-1.5 rounded-sm" style={{ background: C.tint }}><div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: C.deep }} /></div>}
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

function Trend({ data }: { data: TrendPt[] }) {
  if (data.length < 2) return <div className="text-[13px] text-ink-2 py-6 text-center">Trend starts when a test is running</div>;
  const W = 340, H = 150, pad = 26;
  const t0 = data[0].t, t1 = data[data.length - 1].t || 1;
  const vals = data.flatMap(d => [d.tA, d.spA, d.tB, d.spB]);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (hi - lo < 4) hi = lo + 4;
  const x = (t: number) => pad + ((t - t0) / Math.max(0.01, t1 - t0)) * (W - pad - 6);
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 26);
  const line = (k: keyof TrendPt) => data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)} ${y(d[k] as number).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Temperature trend">
      {ticks.map(v => <g key={v}><line x1={pad} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#E6EBF3" /><text x={pad - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill={C.muted}>{Math.round(v)}</text></g>)}
      <path d={line('spA')} fill="none" stroke={C.warn} strokeWidth={1.2} strokeDasharray="4 3" />
      <path d={line('tA')} fill="none" stroke={C.warn} strokeWidth={2} />
      <path d={line('spB')} fill="none" stroke={C.deep} strokeWidth={1.2} strokeDasharray="4 3" />
      <path d={line('tB')} fill="none" stroke={C.deep} strokeWidth={2} />
      <text x={pad} y={H - 4} fontSize={9} fill={C.muted}>{t0.toFixed(0)} min</text>
      <text x={W - 6} y={H - 4} textAnchor="end" fontSize={9} fill={C.muted}>{t1.toFixed(0)} min</text>
    </svg>
  );
}

export function RemoteApp({ session, brokerIdx }: { session: string; brokerIdx: number }) {
  const r = useRemoteClient(session, brokerIdx);
  const s = r.snap;
  const [page, setPage] = useState<Page>('home');
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState<Pick<Params, Editable | 'mode'> | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Follow the controller's active values until the user starts editing
  useEffect(() => {
    if (s && !dirty) setDraft({ zoneB_SP: s.params.zoneB_SP, zoneA_SP: s.params.zoneA_SP, freshAir: s.params.freshAir, occupancy: s.params.occupancy, mode: s.params.mode });
  }, [s, dirty]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  const go = (p: Page) => { setPage(p); setMenu(false); };
  const changes = s && draft ? (Object.keys(draft) as (Editable | 'mode')[]).filter(k => draft[k] !== s.params[k]) : [];
  const running = !!s && (s.state === 'RAMP' || s.state === 'STABILIZING' || s.state === 'STABLE');
  const canControl = !!s?.remoteControl && !r.stale && r.link === 'online';
  const alarms = s ? [...s.alarms].filter(a => a.active || !a.acked).sort((a, b) => a.priority - b.priority || b.t - a.t) : [];
  const unacked = alarms.filter(a => !a.acked).length;
  const step = (k: Editable, dir: 1 | -1, st: number) => { setDirty(true); setDraft(d => {
    if (!d) return d;
    const [mn, mx] = LIMITS[k];
    return { ...d, [k]: Math.max(mn, Math.min(mx, Math.round((d[k] + dir * st) * 10) / 10)) };
  }); };

  const linkLabel = r.link !== 'online' ? (r.link === 'connecting' ? 'Connecting…' : 'Offline')
    : r.hmiOnline === false ? 'HMI offline' : !s ? 'Waiting' : r.stale ? `No data ${Math.round(r.age)} s` : 'Live';
  const linkOk = linkLabel === 'Live';

  const dev = s ? s.pv.tB - s.params.zoneB_SP : 0;
  const devChip = !s || !running || s.params.mode === 'VENT' || s.params.mode === 'OFF'
    ? { text: running ? 'No setpoint control' : 'No test running', fg: C.ink2, bg: C.tint }
    : Math.abs(dev) <= 0.5 ? { text: 'On target (±0.5 K)', fg: C.ok, bg: '#E6F2EC' }
    : Math.abs(dev) <= 1.5 ? { text: `${dev > 0 ? '+' : ''}${dev.toFixed(1)} K from setpoint`, fg: C.warn, bg: '#FBF1E3' }
    : { text: `${dev > 0 ? '+' : ''}${dev.toFixed(1)} K from setpoint`, fg: C.danger, bg: '#FBEEEE' };
  const capPct = s ? Math.round((Math.abs(s.pv.q) / Math.max(1, s.pv.qMax)) * 100) : 0;
  const topAlarm = alarms[0];

  const MENU: { id: Page; label: string; icon: ReactNode; summary?: ReactNode }[] = s ? [
    { id: 'home', label: 'Home', icon: <Home size={18} />, summary: `${s.pv.tB.toFixed(1)} °C` },
    { id: 'alarms', label: 'Alarms', icon: <Bell size={18} />, summary: alarms.length ? <span style={{ color: unacked ? C.danger : C.ink2, fontWeight: 600 }}>{alarms.length} active{unacked ? ` · ${unacked} new` : ''}</span> : 'None' },
    { id: 'sp', label: 'Setpoint vs actual', icon: <Gauge size={18} />, summary: `${s.pv.tB.toFixed(1)} / ${s.params.zoneB_SP.toFixed(1)} °C` },
    { id: 'air', label: 'Air system', icon: <Wind size={18} />, summary: `${s.pv.airflow} m³/h` },
    { id: 'unit', label: 'Unit performance', icon: <Zap size={18} />, summary: `${Math.abs(s.pv.q).toFixed(1)} kW · COP ${s.pv.cop.toFixed(2)}` },
    { id: 'trend', label: 'Temperature trend', icon: <LineChart size={18} />, summary: r.trend.length > 1 ? `${(r.trend[r.trend.length - 1].t - r.trend[0].t).toFixed(0)} min` : '—' },
    { id: 'control', label: 'Remote control', icon: <SlidersHorizontal size={18} />, summary: <span style={{ color: s.remoteControl ? C.ok : C.ink2, fontWeight: 600 }}>{s.remoteControl ? 'Enabled' : 'Monitor only'}</span> },
  ] : [];
  const title = MENU.find(m => m.id === page)?.label ?? '';

  return (
    <div className="h-full flex flex-col" style={{ background: C.paper, height: '100dvh' }}>
      {/* ── Header: logo = home, hamburger = menu ── */}
      <header className="relative z-20 flex items-center gap-3 px-3 shrink-0" style={{ background: C.ink, color: C.paper, paddingTop: 'max(8px, env(safe-area-inset-top))', paddingBottom: 8 }}>
        <button onClick={() => go('home')} aria-label="Home" className="h-10 px-2 grid place-items-center rounded-[4px] shrink-0 cursor-pointer" style={{ background: '#FFFFFF' }}>
          <img src={logo} alt="EOG" className="h-[24px] w-auto" />
        </button>
        <div className="leading-tight flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">TC-01 Remote</div>
          <div className="text-[11px] truncate flex items-center gap-1.5" style={{ color: '#AFC0DA' }}>
            <span className={`w-2 h-2 rounded-full ${linkOk ? '' : 'blink'}`} style={{ background: linkOk ? '#5CC49A' : '#FF8A8F' }} />{linkLabel} · {session}
          </div>
        </div>
        <button onClick={() => setMenu(m => !m)} aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu}
          className="relative w-11 h-11 grid place-items-center rounded-[4px] shrink-0 cursor-pointer" style={{ background: menu ? C.paper : 'rgba(253,255,252,.1)', color: menu ? C.ink : C.paper }}>
          {menu ? <X size={22} /> : <Menu size={22} />}
          {!menu && unacked > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold grid place-items-center num" style={{ background: C.danger, color: C.paper }}>{unacked}</span>}
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 top-[var(--hdr,64px)]" style={{ background: 'rgba(0,28,85,.35)' }} onClick={() => setMenu(false)} />
            <nav className="absolute left-0 right-0 top-full shadow-lg" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
              {!s && <div className="px-4 py-4 text-[13px] text-ink-2">Waiting for data…</div>}
              {MENU.map(m => (
                <button key={m.id} onClick={() => go(m.id)} className="w-full flex items-center gap-3 px-4 h-[52px] text-left cursor-pointer border-b"
                  style={{ borderColor: '#E6EBF3', background: page === m.id ? '#EEF3FA' : C.panel, color: C.ink }}>
                  <span style={{ color: page === m.id ? C.accent : C.ink2 }}>{m.icon}</span>
                  <span className="flex-1 font-semibold text-[15px]">{m.label}</span>
                  <span className="text-[12px] text-ink-2 num">{m.summary}</span>
                  <ChevronRight size={16} color={C.line2} />
                </button>
              ))}
            </nav>
          </>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-auto scroll">
        <div className="max-w-[560px] mx-auto p-3 min-h-full flex flex-col gap-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {(r.stale || r.hmiOnline === false) && s && (
            <div className="rounded-[4px] px-3 py-2 text-[13px] font-semibold shrink-0" style={{ background: '#FBEEEE', color: C.danger, border: `1px solid ${C.danger}` }}>
              {r.hmiOnline === false ? 'The local HMI is offline.' : `No update for ${Math.round(r.age)} s.`} Values may be outdated — do not rely on them.
            </div>
          )}
          {!s && (
            <div className="flex-1 grid place-items-center text-center text-ink-2 text-[14px] px-6">
              {r.link === 'online' ? <div>Connected. Waiting for the chamber HMI with session <b className="text-ink">{session}</b>…<br /><span className="text-[12px] text-muted">Make sure the HMI is open on the laptop.</span></div> : 'Connecting to the plant network…'}
            </div>
          )}

          {s && page !== 'home' && (
            <div className="flex items-center gap-2 shrink-0">
              <button className="text-[12px] text-accent font-semibold cursor-pointer" onClick={() => go('home')}>Home</button>
              <ChevronRight size={14} color={C.line2} />
              <h1 className="font-bold text-[18px]">{title}</h1>
            </div>
          )}

          {s && (
            <div className={`flex-1 flex flex-col gap-3 ${r.stale ? 'opacity-50' : ''}`}>
              {/* ── HOME: fills the screen ── */}
              {page === 'home' && (
                <>
                  <button className="text-left rounded-[4px] px-3 py-2.5 flex items-center gap-2 cursor-pointer border shrink-0"
                    onClick={() => alarms.length && go('alarms')}
                    style={alarms.length ? { background: unacked ? '#FBEEEE' : C.tint, borderColor: unacked ? C.danger : C.line } : { background: C.panel, borderColor: C.line }}>
                    {topAlarm ? <span className={unacked ? 'blink' : ''}><AlarmIcon priority={topAlarm.priority} /></span> : <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.ok }} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate">{topAlarm ? `${topAlarm.tag} ${topAlarm.text}` : 'No active alarms'}</span>
                      {alarms.length > 0 && <span className="block text-[11px] text-ink-2">{alarms.length} alarm(s) · {unacked} unacknowledged — tap to view</span>}
                    </span>
                    {alarms.length > 0 && <ChevronRight size={16} color={C.ink2} />}
                  </button>

                  <section className="panel p-4 flex-1 flex flex-col justify-center min-h-[250px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-ink-2"><span className="tag mr-1">TT-201</span>Coach temperature</span>
                      <StateBadge state={s.state} />
                    </div>
                    <div className="flex-1 flex flex-col justify-center items-center py-2">
                      <div className="flex items-start">
                        <span className="num font-bold leading-none tracking-tight" style={{ fontSize: 'clamp(72px, 24vw, 128px)' }}>{s.pv.tB.toFixed(1)}</span>
                        <span className="text-[22px] text-muted mt-2 ml-1">°C</span>
                      </div>
                      <div className="text-[15px] text-ink-2 mt-1">Setpoint <b className="num" style={{ color: C.accent }}>{s.params.zoneB_SP.toFixed(1)} °C</b></div>
                      <div className="mt-2 inline-flex text-[13px] font-semibold px-2.5 py-1 rounded-sm" style={{ color: devChip.fg, background: devChip.bg }}>{devChip.text}</div>
                    </div>
                    <div className="h-2 rounded-sm" style={{ background: C.tint, border: `1px solid ${C.line}` }}>
                      <div className="h-full" style={{ width: `${Math.min(100, (s.holdTime / s.holdReq) * 100)}%`, background: s.holdTime >= s.holdReq ? C.ok : C.accent }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted mt-1 num">
                      <span>{s.holdTime >= s.holdReq ? 'Test point valid' : 'Steady-state hold'} {fmtTime(s.holdTime)} / {fmtTime(s.holdReq)}</span>
                      <span>T+ {fmtTime(s.simTime)}</span>
                    </div>
                    {s.state === 'TRIPPED' && <div className="text-[12px] mt-2 font-semibold" style={{ color: C.danger }}>Tripped{s.tripped.length ? ` (${s.tripped.join(', ')})` : ''}{s.estop ? ' · E-stop active' : ''} — reset only at the local panel.</div>}
                  </section>

                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    <Tile tag="TT-101" label="Outside temperature" value={s.pv.tA.toFixed(1)} unit="°C" sub={`Setpoint ${s.params.zoneA_SP.toFixed(1)} °C`} />
                    <Tile tag="LS-201" label="Passengers" value={`${s.params.occupancy}`} unit="/ 100" bar={s.params.occupancy} />
                    <Tile tag="DMP-301" label="Fresh-air damper" value={`${s.pv.damper}`} unit="%" bar={s.pv.damper} sub={s.pv.damper !== s.params.freshAir ? `Command ${s.params.freshAir} %` : undefined} />
                    <Tile tag="UUT" label="Capacity used" value={`${capPct}`} unit="%" bar={capPct} sub={`${Math.abs(s.pv.q).toFixed(1)} of ${s.pv.qMax.toFixed(0)} kW`} />
                  </div>
                </>
              )}

              {page === 'alarms' && (
                <section className="panel">
                  <div className="panel-b">
                    {alarms.length === 0 ? <div className="text-[14px] text-ink-2 py-6 text-center">No active alarms</div> : (
                      <>
                        <div className="flex flex-col divide-y" style={{ borderColor: C.line }}>
                          {alarms.map(a => (
                            <div key={a.id} className="flex items-start gap-2 py-2.5" style={{ fontWeight: a.acked ? 400 : 600 }}>
                              <span className={!a.acked ? 'blink mt-0.5' : 'mt-0.5'}><AlarmIcon priority={a.priority} /></span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[14px]"><span className="tag !text-ink mr-1">{a.tag}</span>{a.text}</div>
                                <div className="text-[12px] text-muted num">{clock(new Date(a.t))} · {a.value} · {['High', 'Medium', 'Low'][a.priority - 1]} · {a.active ? (a.acked ? 'acknowledged' : 'unacknowledged') : 'returned'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {unacked > 0 && <button className="btn w-full mt-2 !h-11" disabled={!canControl} onClick={() => r.send({ cmd: 'ack' })}>{canControl ? 'Acknowledge all' : 'Acknowledge (needs remote control)'}</button>}
                      </>
                    )}
                    <p className="text-[11px] text-muted mt-3">Acknowledging confirms you have seen an alarm. It stays listed until its cause is cleared. Trips are reset only at the local panel.</p>
                  </div>
                </section>
              )}

              {page === 'sp' && (
                <section className="panel"><div className="panel-b">
                  <AnalogBar active={running && s.state !== 'RAMP'} tag="TT-101" label="Outside air (climatic zone)" pv={s.pv.tA} sp={s.params.zoneA_SP} min={-10} max={60} lo={s.params.zoneA_SP - 2} hi={s.params.zoneA_SP + 2} unit="°C" />
                  <AnalogBar active={s.state === 'STABLE'} tag="TT-201" label="Inside coach" pv={s.pv.tB} sp={s.params.zoneB_SP} min={10} max={45} lo={s.params.zoneB_SP - 1.5} hi={s.params.zoneB_SP + 1.5} unit="°C" />
                  <AnalogBar tag="MT-101" label="Outside humidity" pv={s.pv.rhA} sp={s.params.zoneA_RH_SP} min={0} max={100} unit="%RH" digits={0} />
                  <AnalogBar active={s.pv.fanRun} tag="MT-201" label="Coach humidity" pv={s.pv.rhB} min={0} max={100} lo={30} hi={70} unit="%RH" digits={0} />
                  <div className="grid grid-cols-2 text-[13px] mt-3 gap-y-1 text-ink-2 num">
                    <span>Coach deviation</span><span className="text-right font-semibold text-ink">{(dev >= 0 ? '+' : '') + dev.toFixed(1)} K</span>
                    <span>Outside − coach</span><span className="text-right font-semibold text-ink">{(s.pv.tA - s.pv.tB).toFixed(1)} K</span>
                  </div>
                </div></section>
              )}

              {page === 'air' && (
                <div className="grid grid-cols-2 gap-2">
                  <Tile tag="TT-311" label="Supply air" value={s.pv.tSupply.toFixed(1)} unit="°C" />
                  <Tile tag="TT-312" label="Return air" value={s.pv.tReturn.toFixed(1)} unit="°C" />
                  <Tile tag="FT-301" label="Supply airflow" value={`${s.pv.airflow}`} unit="m³/h" sub={`Fan setting ${s.params.airflow} %`} />
                  <Tile tag="PDT-302" label="Coach pressure" value={s.pv.dp.toFixed(1)} unit="Pa" sub="vs climatic zone" />
                  <Tile tag="DMP-301" label="Fresh-air damper" value={`${s.pv.damper}`} unit="%" bar={s.pv.damper} sub={`Command ${s.params.freshAir} %`} />
                  <Tile tag="MT-201" label="Coach humidity" value={s.pv.rhB.toFixed(0)} unit="%RH" />
                </div>
              )}

              {page === 'unit' && (
                <div className="grid grid-cols-2 gap-2">
                  <Tile tag="UUT" label="Cooling capacity" value={Math.abs(s.pv.q).toFixed(1)} unit={`/ ${s.pv.qMax.toFixed(0)} kW`} bar={capPct} sub={`${capPct} % of available`} />
                  <Tile tag="JT-401" label="Electrical power" value={s.pv.power.toFixed(1)} unit="kW" />
                  <Tile tag="UUT" label="Efficiency (COP)" value={s.pv.cop.toFixed(2)} unit="" sub="kW cooling per kW electric" />
                  <Tile tag="UUT" label="Mode" value={s.params.mode} unit="" sub={`Compressor ${s.pv.compRun ? 'running' : 'stopped'}`} />
                  <Tile tag="SL-101" label="Solar load" value={`${s.params.solar}`} unit="W/m²" />
                  <Tile tag="LS-201" label="Load simulator" value={`${s.pv.loadOut}`} unit="%" bar={s.pv.loadOut} sub={`${s.params.occupancy} passengers`} />
                </div>
              )}

              {page === 'trend' && (
                <section className="panel"><div className="panel-b">
                  <div className="text-[12px] text-ink-2 flex gap-3 mb-1"><span style={{ color: C.warn }}>━ outside</span><span style={{ color: C.deep }}>━ coach</span><span>┅ setpoint</span></div>
                  <Trend data={r.trend} />
                  <p className="text-[11px] text-muted mt-2">Recorded on this phone while the screen is open.</p>
                </div></section>
              )}

              {page === 'control' && (
                <section className="panel"><div className="panel-b">
                  {!s.remoteControl ? (
                    <p className="text-[14px] text-ink-2">The local operator must enable remote control on the HMI (<b className="text-ink">F6 System → Remote access</b>). Until then this screen is monitor-only.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button className="btn btn-primary !h-11" disabled={!canControl || running || s.state === 'TRIPPED'} onClick={() => r.send({ cmd: 'start' })}>Start test</button>
                        <button className="btn !h-11" disabled={!canControl || !running} onClick={() => r.send({ cmd: 'stop' })}>Stop test</button>
                      </div>
                      {draft && (
                        <div className="mt-3 flex flex-col divide-y" style={{ borderColor: C.line }}>
                          {EDIT.map(e => {
                            const changed = draft[e.key] !== s.params[e.key];
                            return (
                              <div key={e.key} className="flex items-center gap-2 py-2">
                                <div className="flex-1 min-w-0"><div className="tag">{e.tag}</div><div className="text-[13px]">{e.label}</div><div className="text-[11px] text-muted num">Active {s.params[e.key]} {e.unit}</div></div>
                                <button className="btn !w-10 !h-10 !p-0 text-[18px]" onClick={() => step(e.key, -1, e.step)} aria-label={`Decrease ${e.label}`}>−</button>
                                <div className="num w-[72px] text-center font-bold text-[17px] rounded-[3px] py-1.5" style={{ background: changed ? '#EEF6FC' : C.tint, color: changed ? C.accent : C.ink }}>{draft[e.key]}<span className="text-[10px] font-normal text-muted"> {e.unit === 'pax' ? '' : e.unit}</span></div>
                                <button className="btn !w-10 !h-10 !p-0 text-[18px]" onClick={() => step(e.key, 1, e.step)} aria-label={`Increase ${e.label}`}>+</button>
                              </div>
                            );
                          })}
                          <div className="py-2">
                            <div className="text-[13px] mb-1.5">Unit mode <span className="text-[11px] text-muted">· active {s.params.mode}</span></div>
                            <div className="grid grid-cols-4 gap-1">
                              {MODES.map((m: UutMode) => <button key={m} className="btn btn-sm" onClick={() => { setDirty(true); setDraft(d => d && { ...d, mode: m }); }} style={draft.mode === m ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>{m}</button>)}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <button className="btn !h-11" disabled={!changes.length} onClick={() => setDirty(false)}>Discard</button>
                        <button className="btn btn-primary !h-11" disabled={!changes.length || !canControl} onClick={() => setConfirm(true)}>Send {changes.length ? `(${changes.length})` : ''}</button>
                      </div>
                    </>
                  )}
                  <p className="text-[11px] text-muted mt-3">For safety, the emergency stop and interlock reset are only available at the local panel.</p>
                </div></section>
              )}
            </div>
          )}
        </div>
      </main>

      {confirm && s && draft && (
        <div className="fixed inset-0 z-30 grid place-items-end sm:place-items-center" style={{ background: 'rgba(0,28,85,.35)' }} onClick={() => setConfirm(false)}>
          <div className="w-full sm:max-w-[420px] rounded-t-[8px] sm:rounded-[6px] p-4" style={{ background: C.panel, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-[15px] mb-2">Write to controller?</div>
            <div className="flex flex-col gap-1 text-[13px] mb-3">
              {changes.map(k => <div key={k} className="flex justify-between num"><span className="text-ink-2">{EDIT.find(e => e.key === k)?.label ?? 'Unit mode'}</span><span><span className="text-muted">{String(s.params[k])}</span> → <b>{String(draft[k])}</b></span></div>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn !h-11" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-primary !h-11" onClick={() => { const p: Partial<Params> = {}; changes.forEach(k => ((p as Record<string, unknown>)[k] = draft[k])); r.send({ cmd: 'set', params: p }); setConfirm(false); setDirty(false); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {r.toast && (
        <div className="fixed left-3 right-3 z-40 rounded-[4px] px-3 py-2.5 text-[13px] font-semibold text-center" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))', background: r.toast.ok ? C.ok : C.danger, color: C.paper }}>
          {r.toast.text}
        </div>
      )}
    </div>
  );
}
