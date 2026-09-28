import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, Smartphone } from 'lucide-react';
import { useChamber } from './hmi/useChamber';
import logo from './assets/eog-logo.png';
import { AlarmIcon, C, clock, fmtTime } from './hmi/ui';
import { Overview } from './screens/Overview';
import { Setup } from './screens/Setup';
import { Trends } from './screens/Trends';
import { Alarms } from './screens/Alarms';
import { Interlocks } from './screens/Interlocks';
import { System } from './screens/System';
import { RemoteApp } from './remote/RemoteApp';
import { useRemoteHost } from './remote/useRemoteHost';

const qs = new URLSearchParams(location.search);
const REMOTE = qs.get('remote');

export default function App() {
  if (REMOTE) return <RemoteApp session={REMOTE.toUpperCase()} brokerIdx={Number(qs.get('b') || 0)} />;
  return <Hmi />;
}

type Screen = 'overview' | 'setup' | 'trends' | 'alarms' | 'interlocks' | 'system';
const SCREENS: { id: Screen; label: string; fk: string }[] = [
  { id: 'overview', label: 'Overview', fk: 'F1' },
  { id: 'setup', label: 'Test setup', fk: 'F2' },
  { id: 'trends', label: 'Trends', fk: 'F3' },
  { id: 'alarms', label: 'Alarms', fk: 'F4' },
  { id: 'interlocks', label: 'Interlocks', fk: 'F5' },
  { id: 'system', label: 'System', fk: 'F6' },
];

function Hmi() {
  const hmi = useChamber();
  const { c } = hmi;
  const host = useRemoteHost(c, hmi.force);
  const [screen, setScreen] = useState<Screen>('overview');
  const [now, setNow] = useState(new Date());
  const [full, setFull] = useState(false);

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); setScreen(SCREENS[i].id); }
    };
    const onFs = () => setFull(!!document.fullscreenElement);
    addEventListener('keydown', onKey); document.addEventListener('fullscreenchange', onFs);
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  const unacked = c.alarms.filter(a => !a.acked);
  const top = [...c.alarms].filter(a => a.active).sort((a, b) => a.priority - b.priority || +b.time - +a.time)[0];
  const counts = [1, 2, 3].map(p => c.alarms.filter(a => a.active && a.priority === p).length);

  return (
    <div className="h-full flex flex-col">
      {/* Title bar */}
      <header className="flex items-center gap-4 px-4 h-14 shrink-0" style={{ background: C.ink, color: C.paper }}>
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-9 px-2 grid place-items-center rounded-[4px]" style={{ background: '#FFFFFF' }}><img src={logo} alt="EOG International" className="h-[22px] w-auto" /></div>
          <div className="leading-tight">
            <div className="font-semibold text-[15px]">TC-01 · Railway HVAC Test Chamber</div>
            <div className="text-[11px] hidden 2xl:block" style={{ color: '#AFC0DA' }}>EOG International · UPEI Cairo — conceptual HMI</div>
          </div>
        </div>
        <nav className="flex gap-1 flex-1 min-w-0 overflow-x-auto" style={{ justifyContent: 'safe center' }}>
          {SCREENS.map(s => (
            <button key={s.id} className={`navbtn ${screen === s.id ? 'on' : ''}`} onClick={() => setScreen(s.id)}>
              <span className="fk">{s.fk}</span>{s.label}
              {s.id === 'alarms' && unacked.length > 0 && <span className="num text-[11px] px-1.5 rounded-sm" style={{ background: C.danger, color: C.paper }}>{unacked.length}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-[12px] shrink-0">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#5CC49A' }} />PLC-01<span className="hidden 2xl:inline"> online</span></div>
          <button className="navbtn !h-8 !px-2 !text-[12px]" title="Remote access" onClick={() => setScreen('system')}>
            <Smartphone size={14} />
            <span className="w-2 h-2 rounded-full" style={{ background: host.status === 'online' ? '#5CC49A' : host.status === 'connecting' ? '#E0B04A' : '#FF8A8F' }} />
            {host.clients} remote{c.remoteControl ? ' · control' : ''}
          </button>
          <div className="hidden 2xl:block" style={{ color: '#AFC0DA' }}>Operator: <span style={{ color: C.paper }}>ENG-01</span></div>
          <div className="num text-right leading-tight"><div className="font-semibold text-[14px]">{clock(now)}</div><div style={{ color: '#AFC0DA' }}>{now.toLocaleDateString('en-GB')}</div></div>
          <button className="navbtn !h-8 !px-2" title="Full screen" onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
            {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* Alarm banner */}
      <div className="flex items-center gap-3 px-4 h-10 shrink-0 border-b" style={{ borderColor: C.line, background: top && !top.acked ? '#FBEEEE' : C.tint }}>
        {top ? (
          <>
            <span className={!top.acked ? 'blink' : ''}><AlarmIcon priority={top.priority} /></span>
            <span className="num text-[12px] text-muted">{clock(top.time)}</span>
            <span className="tag !text-[12px] !text-ink font-semibold">{top.tag}</span>
            <span className="font-semibold truncate">{top.text}</span>
            <span className="num text-ink-2 text-[12px]">{top.value}</span>
            <span className="text-[12px] px-2 py-0.5 rounded-sm" style={top.acked ? { background: C.tint, color: C.ink2 } : { background: C.danger, color: C.paper }}>{top.acked ? 'Acknowledged · condition still active' : 'Unacknowledged'}</span>
          </>
        ) : <span className="text-ink-2">No active alarms</span>}
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          <span className="text-muted">Active</span>
          {counts.map((n, i) => <span key={i} className="flex items-center gap-1 num"><AlarmIcon priority={(i + 1) as 1 | 2 | 3} size={13} />{n}</span>)}
          <span className="text-muted ml-1">Unacked <b className="num" style={{ color: unacked.length ? C.danger : C.ink2 }}>{unacked.length}</b></span>
          <button className="btn btn-sm" disabled={!unacked.length} onClick={() => hmi.ack()}>Acknowledge all</button>
          <button className="btn btn-sm" onClick={() => setScreen('alarms')}>Alarm list</button>
        </div>
      </div>

      <main className="flex-1 min-h-0 p-3 overflow-auto scroll">
        {screen === 'overview' && <Overview hmi={hmi} />}
        {screen === 'setup' && <Setup hmi={hmi} />}
        {screen === 'trends' && <Trends hmi={hmi} />}
        {screen === 'alarms' && <Alarms hmi={hmi} />}
        {screen === 'interlocks' && <Interlocks hmi={hmi} />}
        {screen === 'system' && <System hmi={hmi} host={host} />}
      </main>

      {/* Status bar */}
      <footer className="flex items-center gap-6 px-4 h-8 shrink-0 text-[12px] border-t" style={{ borderColor: C.line, background: C.tint, color: C.ink2 }}>
        <span>Sequence: <b className="text-ink">{c.state}</b></span>
        <span className="num">Test time: <b className="text-ink">T+ {fmtTime(c.simTime)}</b></span>
        <span className="num">Steady-state hold: <b className="text-ink">{fmtTime(c.holdTime)}</b> / 00:15:00</span>
        <span>UUT mode: <b className="text-ink">{c.params.mode}</b></span>
        <span className="ml-auto text-muted">Simulated process ×30 speed · not connected to hardware · final design subject to EOG requirements</span>
      </footer>
    </div>
  );
}
