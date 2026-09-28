import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Hmi } from '../hmi/useChamber';
import type { RemoteHost } from '../remote/useRemoteHost';
import { C, Led, Panel } from '../hmi/ui';

function RemoteAccess({ hmi, host }: { hmi: Hmi; host: RemoteHost }) {
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toString(host.url, { type: 'svg', margin: 1, color: { dark: C.ink, light: '#FFFFFF' } }).then(setSvg).catch(() => setSvg('')); }, [host.url]);
  const on = hmi.c.remoteControl;
  const st = { online: ['Connected', C.ok], connecting: ['Connecting…', C.warn], offline: ['Offline', C.danger] }[host.status];
  return (
    <Panel title="Remote access — mobile operator screen" right={<span className="text-[12px] font-normal text-muted">MQTT over secure WebSocket</span>}>
      <div className="flex gap-5 flex-wrap">
        <div className="w-[176px] h-[176px] shrink-0 rounded border p-1" style={{ borderColor: C.line }} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="flex-1 min-w-[280px] flex flex-col gap-2 text-[13px]">
          <div className="text-ink-2">Scan with a phone to open the live remote screen, or enter the link manually.</div>
          <div className="flex items-center gap-2"><span className="text-ink-2 w-[110px]">Session code</span><b className="num text-[20px] tracking-[.18em]">{host.session}</b></div>
          <div className="flex items-center gap-2"><span className="text-ink-2 w-[110px]">Link</span>
            <code className="text-[11px] truncate flex-1 px-2 py-1 rounded" style={{ background: C.tint }}>{host.url}</code>
            <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(host.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="flex items-center gap-2"><span className="text-ink-2 w-[110px]">Broker</span><Led on color={st[1]} label={st[0]} /><span className="text-[11px] text-muted truncate">{host.broker.replace('wss://', '')}</span></div>
          <div className="flex items-center gap-2"><span className="text-ink-2 w-[110px]">Remote screens</span><b>{host.clients}</b><span className="text-muted">connected</span></div>
          <div className="flex items-center gap-2 mt-1"><span className="text-ink-2 w-[110px]">Permission</span>
            <div className="flex gap-1">
              <button className="btn btn-sm" onClick={() => hmi.setRemoteControl(false)} style={!on ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>Monitor only</button>
              <button className="btn btn-sm" onClick={() => hmi.setRemoteControl(true)} style={on ? { background: C.deep, color: C.paper, borderColor: C.deep } : undefined}>Allow control</button>
            </div>
          </div>
          <div className="text-[11px] text-muted leading-snug">Remote screens can start/stop tests, change setpoints and acknowledge alarms only when control is allowed. Emergency stop and interlock reset remain local-only. Demo uses a public broker; a real installation would use a private broker with TLS, user authentication and a VPN.</div>
        </div>
      </div>
    </Panel>
  );
}

type Node = { x: number; y: number; w: number; t: string; s: string; safety?: boolean };
const LEVELS = [
  { y: 20, label: 'Level 3 · Engineering' },
  { y: 115, label: 'Level 2 · Supervisory' },
  { y: 210, label: 'Level 1 · Control' },
  { y: 320, label: 'Level 0 · Field' },
];
const NODES: Node[] = [
  { x: 330, y: 30, w: 200, t: 'Engineering workstation', s: 'PLC programming · reports' },
  { x: 560, y: 30, w: 200, t: 'EOG network (optional)', s: 'Via firewall · read-only' },
  { x: 790, y: 30, w: 200, t: 'Mobile operator screens', s: 'MQTT over TLS via broker' },
  { x: 230, y: 125, w: 200, t: 'SCADA server + historian', s: 'Tags · alarms · test data' },
  { x: 460, y: 125, w: 200, t: 'Operator HMI (this screen)', s: 'Control room panel' },
  { x: 150, y: 220, w: 170, t: 'PLC-01', s: 'Process control · PID loops' },
  { x: 340, y: 220, w: 150, t: 'RIO-A', s: 'Zone A remote I/O' },
  { x: 510, y: 220, w: 150, t: 'RIO-B', s: 'Zone B remote I/O' },
  { x: 700, y: 220, w: 190, t: 'SR-01 safety relay / PLC', s: 'E-stop · door · trips', safety: true },
  { x: 130, y: 330, w: 160, t: 'UUT interface', s: 'Control signals / gateway' },
  { x: 305, y: 330, w: 180, t: 'Sensors', s: 'TT · MT · FT · PDT · JT' },
  { x: 500, y: 330, w: 185, t: 'Actuators', s: 'AHU VFD · heaters · damper · LS' },
  { x: 700, y: 330, w: 190, t: 'Safety devices', s: 'HS-001 · ZS-501 · TSHH', safety: true },
];

const INSTR = [
  ['TT-101', 'Climatic zone air temperature', 'Pt100 RTD, 4-wire', '−40 … +80 °C', '±0.15 K', 'RIO-A'],
  ['MT-101', 'Climatic zone humidity', 'Capacitive RH transmitter', '0 … 100 %RH', '±2 %RH', 'RIO-A'],
  ['TT-201', 'Coach interior air temperature (avg. of grid)', 'Pt100 RTD array', '0 … 60 °C', '±0.15 K', 'RIO-B'],
  ['MT-201', 'Coach interior humidity', 'Capacitive RH transmitter', '0 … 100 %RH', '±2 %RH', 'RIO-B'],
  ['TT-311', 'Supply air temperature', 'Pt100 RTD, duct probe', '0 … 60 °C', '±0.15 K', 'RIO-B'],
  ['TT-312', 'Return air temperature', 'Pt100 RTD, duct probe', '0 … 60 °C', '±0.15 K', 'RIO-B'],
  ['FT-301', 'Supply airflow', 'Airflow measuring station', '0 … 8 000 m³/h', '±5 % of reading', 'RIO-B'],
  ['PDT-302', 'Coach-to-chamber differential pressure', 'Differential pressure transmitter', '−100 … +100 Pa', '±1 Pa', 'RIO-B'],
  ['JT-401', 'UUT electrical power', '3-phase power meter (Modbus)', '0 … 60 kW', 'Class 0.5', 'PLC-01'],
  ['ZS-501', 'Chamber door position', 'Safety door switch', 'Open / closed', '—', 'SR-01'],
  ['HS-001', 'Emergency stop', 'E-stop pushbutton, latching', 'Pushed / released', '—', 'SR-01'],
];

export function System({ hmi, host }: { hmi: Hmi; host: RemoteHost }) {
  const box = (n: Node) => (
    <g key={n.t}>
      <rect x={n.x} y={n.y} width={n.w} height={52} rx={3} fill={n.safety ? '#FBEEEE' : C.panel} stroke={n.safety ? C.danger : C.ink} strokeWidth={1.4} />
      <text x={n.x + 10} y={n.y + 21} fontSize={12} fontWeight={700} fill={C.ink}>{n.t}</text>
      <text x={n.x + 10} y={n.y + 39} fontSize={10.5} fill={C.ink2}>{n.s}</text>
    </g>
  );
  const bus = (y: number, x1: number, x2: number, dash?: string, col: string = C.accent) => (
    <line x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth={3} strokeDasharray={dash} />
  );
  const drop = (x: number, y1: number, y2: number, col: string = C.accent, dash?: string) => <line x1={x} y1={y1} x2={x} y2={y2} stroke={col} strokeWidth={1.6} strokeDasharray={dash} />;

  return (
    <div className="flex flex-col gap-3">
      <RemoteAccess hmi={hmi} host={host} />
      <Panel title="Control system architecture (proposed)" right={<span className="text-[12px] font-normal text-muted">Platform, network and I/O count to be confirmed with EOG</span>}>
        <svg viewBox="0 0 1000 400" className="w-full max-h-[420px]" fontFamily="Inter, Segoe UI, Arial">
          {LEVELS.map(l => (<g key={l.label}><rect x={0} y={l.y} width={1000} height={80} fill={l.y % 2 ? C.panel : C.tint} opacity={0.6} /><text x={10} y={l.y + 16} fontSize={10.5} fill={C.muted}>{l.label}</text></g>))}
          {bus(98, 330, 890)}
          {bus(195, 150, 890)}
          {bus(310, 130, 685)}
          {bus(310, 700, 890, '6 4', C.danger)}
          {[430, 660, 890].map(x => drop(x, 82, 98))}
          {[330, 560].map(x => drop(x, 98, 125))}
          {[330, 560].map(x => drop(x, 177, 195))}
          {[235, 415, 585, 795].map(x => drop(x, 195, 220))}
          {[210, 395, 590].map(x => drop(x, 272, 310))}
          {drop(795, 272, 310, C.danger, '6 4')}
          {[210, 395, 590].map(x => drop(x, 310, 330))}
          {drop(795, 310, 330, C.danger, '6 4')}
          {NODES.map(box)}
        </svg>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-2 mt-1">
          <span className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={C.accent} strokeWidth="3" /></svg>Ethernet control network (e.g. Profinet / Modbus TCP) behind a plant firewall</span>
          <span className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={C.accent} strokeWidth="3" /></svg>Field wiring: 4–20 mA, RTD, digital I/O</span>
          <span className="flex items-center gap-2"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={C.danger} strokeWidth="3" strokeDasharray="6 4" /></svg>Hardwired safety circuit</span>
        </div>
        <div className="flex gap-6 text-[12px] text-ink-2 mt-2">
          <Led on label="PLC-01 · running" /><Led on label="RIO-A · OK" /><Led on label="RIO-B · OK" /><Led on label="SR-01 · healthy" /><Led on label="Historian · recording" />
        </div>
      </Panel>

      <Panel title="Instrument index (proposed)" bodyClass="!p-0" right={<span className="text-[12px] font-normal text-muted">Accuracy targets to be verified against EOG requirements and test standards</span>}>
        <table className="tbl">
          <thead><tr><th>Tag</th><th>Service</th><th>Type</th><th>Range</th><th>Target accuracy</th><th>I/O</th></tr></thead>
          <tbody>{INSTR.map(r => <tr key={r[0]}><td className="tag !text-[12px] !text-ink font-semibold">{r[0]}</td>{r.slice(1).map((v, i) => <td key={i} className={i >= 2 ? 'num' : ''}>{v}</td>)}</tr>)}</tbody>
        </table>
      </Panel>
    </div>
  );
}
