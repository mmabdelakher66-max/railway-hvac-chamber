import { useEffect, useRef, useState } from 'react';
import type { MqttClient } from 'mqtt';
import { brokerUrl, connect, topic, type CmdResult, type Command, type Snapshot } from './link';

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;

export interface TrendPt { t: number; tA: number; spA: number; tB: number; spB: number }

/** Runs on the phone: subscribes to live data and sends commands. */
export function useRemoteClient(session: string, brokerIdx: number) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [link, setLink] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [hmiOnline, setHmiOnline] = useState<boolean | null>(null);
  const [lastRx, setLastRx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<CmdResult | null>(null);
  const [trend, setTrend] = useState<TrendPt[]>([]);
  const client = useRef<MqttClient | null>(null);
  const me = useRef('ph' + Math.random().toString(16).slice(2, 8));

  useEffect(() => {
    const cl = connect(brokerUrl(brokerIdx));
    client.current = cl;
    cl.on('connect', () => {
      setLink('online');
      cl.subscribe([topic(session, 'state'), topic(session, 'result'), topic(session, 'hmi')]);
      cl.publish(topic(session, `presence/${me.current}`), '1');
    });
    cl.on('offline', () => setLink('offline'));
    cl.on('reconnect', () => setLink('connecting'));
    cl.on('message', (t, buf) => {
      const s = buf.toString();
      if (t.endsWith('/hmi')) { setHmiOnline(s === 'online'); return; }
      if (t.endsWith('/result')) { try { setToast(JSON.parse(s)); } catch { /* ignore */ } return; }
      try {
        const d: Snapshot = JSON.parse(s);
        setSnap(d); setLastRx(Date.now());
        if (d.state === 'RAMP' || d.state === 'STABILIZING' || d.state === 'STABLE') {
          setTrend(tr => {
            const pt = { t: d.simTime / 60, tA: d.pv.tA, spA: d.params.zoneA_SP, tB: d.pv.tB, spB: d.params.zoneB_SP };
            const base = tr.length && pt.t < tr[tr.length - 1].t ? [] : tr;   // new test started
            return [...base, pt].slice(-400);
          });
        }
      } catch { /* ignore malformed */ }
    });
    const hb = setInterval(() => { if (cl.connected) cl.publish(topic(session, `presence/${me.current}`), '1'); }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(hb); clearInterval(tick); cl.end(true); };
  }, [session, brokerIdx]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4000); return () => clearTimeout(id); }, [toast]);

  const send = (c: NoId<Command>) => {
    const cmd = { ...c, id: Math.random().toString(36).slice(2) } as Command;
    if (client.current?.connected) client.current.publish(topic(session, 'cmd'), JSON.stringify(cmd));
    else setToast({ id: cmd.id, ok: false, text: 'Not connected — command not sent' });
  };

  const age = lastRx ? (now - lastRx) / 1000 : Infinity;
  return { snap, link, hmiOnline, age, stale: age > 5, toast, send, trend };
}
