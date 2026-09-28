import type { ReactNode } from 'react';
import type { Priority, SeqState } from '../sim/engine';

export const C = {
  paper: '#FDFFFC', panel: '#FFFFFF', ink: '#001C55', ink2: '#33466E', muted: '#5B6B8C', line: '#D3DBE8', line2: '#9FB0CC',
  tint: '#F1F5FB', accent: '#0E6BA8', deep: '#0A2472', soft: '#A6E1FA', ok: '#1E7F5C', warn: '#A86400', danger: '#C0272D',
};
export const prioColor = (p: Priority) => (p === 1 ? C.danger : p === 2 ? C.warn : C.deep);

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-h"><span>{title}</span>{right}</header>
      <div className={`panel-b ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** ISA-101 style redundant alarm coding: colour + shape + number. */
export function AlarmIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const col = prioColor(priority);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={`Priority ${priority} alarm`}>
      {priority === 1 && <rect x="1" y="1" width="14" height="14" fill={col} />}
      {priority === 2 && <polygon points="8,1 15,15 1,15" fill={col} />}
      {priority === 3 && <polygon points="8,1 15,8 8,15 1,8" fill={col} />}
      <text x="8" y={priority === 2 ? 13.5 : 12} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.paper}>{priority}</text>
    </svg>
  );
}

export function StateBadge({ state }: { state: SeqState }) {
  const map: Record<SeqState, { label: string; fg: string; bg: string }> = {
    IDLE: { label: 'Idle', fg: C.ink2, bg: C.tint },
    RAMP: { label: 'Ramping to conditions', fg: C.deep, bg: '#E4F1FA' },
    STABILIZING: { label: 'Stabilizing', fg: C.deep, bg: '#E4F1FA' },
    STABLE: { label: 'Steady state', fg: C.paper, bg: C.deep },
    TRIPPED: { label: 'Tripped', fg: C.paper, bg: C.danger },
  };
  const s = map[state];
  return <span className="inline-flex items-center h-7 px-3 rounded-[3px] text-[13px] font-semibold" style={{ color: s.fg, background: s.bg }}>{s.label}</span>;
}

export function Led({ on, color = C.ok, label }: { on: boolean; color?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: on ? color : 'transparent', border: `1.5px solid ${on ? color : C.line2}` }} />
      {label && <span>{label}</span>}
    </span>
  );
}

/** Moving analog indicator: normal band shaded, limits marked, pointer shows PV, bar shows SP. */
export function AnalogBar({ tag, label, pv, sp, min, max, lo, hi, unit, digits = 1, active = true }: {
  tag: string; label: string; pv: number; sp?: number; min: number; max: number; lo?: number; hi?: number; unit: string; digits?: number; active?: boolean;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const abnormal = active && ((lo !== undefined && pv < lo) || (hi !== undefined && pv > hi));
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2"><span className="tag">{tag}</span><span className="text-[12px] text-ink-2">{label}</span></div>
        <div className="num font-semibold text-[15px]" style={{ color: abnormal ? C.danger : C.ink }}>
          {pv.toFixed(digits)} <span className="text-[11px] font-normal text-muted">{unit}</span>
        </div>
      </div>
      <div className="relative h-3 mt-1 rounded-[2px]" style={{ background: C.tint, border: `1px solid ${C.line}` }}>
        {lo !== undefined && hi !== undefined && (
          <div className="absolute top-0 bottom-0" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, background: '#E1E8F3' }} />
        )}
        {sp !== undefined && <div className="absolute -top-0.5 -bottom-0.5 w-[2px]" style={{ left: pct(sp), background: C.accent }} title={`SP ${sp}`} />}
        <div className="absolute -top-[5px]" style={{ left: pct(pv), transform: 'translateX(-5px)' }}>
          <svg width="10" height="22" viewBox="0 0 10 22"><polygon points="0,0 10,0 5,7" fill={abnormal ? C.danger : C.ink} /><rect x="4" y="6" width="2" height="16" fill={abnormal ? C.danger : C.ink} /></svg>
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted num mt-0.5"><span>{min}</span>{sp !== undefined && <span style={{ color: C.accent }}>SP {sp.toFixed(digits)}</span>}<span>{max}</span></div>
    </div>
  );
}

export const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
};
export const clock = (d: Date) => d.toLocaleTimeString('en-GB', { hour12: false });
