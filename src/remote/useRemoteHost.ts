import { useEffect, useRef, useState } from 'react';
import type { MqttClient } from 'mqtt';
import type { Chamber, Params } from '../sim/engine';
import { HOLD_REQUIRED } from '../sim/engine';
import { BROKERS, LIMITS, MODES, brokerUrl, connect, hasOverride, newSession, topic, type CmdResult, type Command, type Snapshot } from './link';

export type LinkStatus = 'connecting' | 'online' | 'offline';

export function snapshot(c: Chamber): Snapshot {
  const m = c.measured(), p = c.p;
  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    v: 1, ts: Date.now(), state: c.state, simTime: c.simTime, holdTime: c.holdTime, holdReq: HOLD_REQUIRED,
    estop: c.estop, remoteControl: c.remoteControl, tripped: c.interlocks.filter(i => i.tripped).map(i => i.id),
    params: c.params,
    pv: {
      tA: r(m.tA), rhA: r(m.rhA, 1), tB: r(m.tB), rhB: r(m.rhB, 1), tSupply: r(m.tSupply), tReturn: r(m.tReturn),
      airflow: Math.round(m.airflow), dp: r(m.dp, 1), q: r(p.q), qMax: r(p.qMax), power: r(m.power), cop: r(p.cop),
      damper: Math.round(p.damper), plantOut: Math.round(p.plantOut), loadOut: Math.round(p.loadOut), fanRun: p.fanRun, compRun: p.compRun,
    },
    alarms: c.alarms.map(a => ({ id: a.id, tag: a.tag, text: a.text, priority: a.priority, active: a.active, acked: a.acked, t: a.time.getTime(), value: a.value })),
  };
}

/** Runs on the local HMI: publishes live data and executes permitted commands from phones. */
export function useRemoteHost(c: Chamber, refresh: () => void) {
  const [session] = useState(() => {
    try { const s = localStorage.getItem('tc01-session'); if (s) return s; const n = newSession(); localStorage.setItem('tc01-session', n); return n; }
    catch { return newSession(); }
  });
  const [brokerIdx, setBrokerIdx] = useState(0);
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [clients, setClients] = useState(0);
  const client = useRef<MqttClient | null>(null);
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    const url = brokerUrl(brokerIdx);
    const statusTopic = topic(session, 'hmi');
    const cl = connect(url, { topic: statusTopic, payload: 'offline' });
    client.current = cl;
    setStatus('connecting');
    let everConnected = false;
    const failover = setTimeout(() => {
      if (!everConnected && !hasOverride() && brokerIdx < BROKERS.length - 1) setBrokerIdx(brokerIdx + 1);
    }, 9000);

    cl.on('connect', () => {
      everConnected = true; setStatus('online');
      cl.publish(statusTopic, 'online', { retain: true });
      cl.subscribe([topic(session, 'cmd'), topic(session, 'presence/+')]);
    });
    cl.on('offline', () => setStatus('offline'));
    cl.on('reconnect', () => setStatus('connecting'));
    cl.on('message', (t, buf) => {
      if (t.includes('/presence/')) { seen.current.set(t.split('/').pop()!, Date.now()); return; }
      let cmd: Command;
      try { cmd = JSON.parse(buf.toString()); } catch { return; }
      const res = execute(c, cmd);
      cl.publish(topic(session, 'result'), JSON.stringify(res));
      refresh();
    });

    const pub = setInterval(() => {
      if (cl.connected) cl.publish(topic(session, 'state'), JSON.stringify(snapshot(c)), { retain: true });
      const now = Date.now();
      let n = 0; seen.current.forEach(t => { if (now - t < 12000) n++; });
      setClients(n);
    }, 1000);

    return () => {
      clearTimeout(failover); clearInterval(pub);
      if (cl.connected) cl.publish(statusTopic, 'offline', { retain: true });
      cl.end(true);
    };
  }, [brokerIdx, session, c, refresh]);

  const base = `${location.origin}${location.pathname}`;
  const override = new URLSearchParams(location.search).get('broker');
  const url = `${base}?remote=${session}&b=${brokerIdx}${override ? `&broker=${encodeURIComponent(override)}` : ''}`;
  return { session, status, clients, url, broker: brokerUrl(brokerIdx) };
}
export type RemoteHost = ReturnType<typeof useRemoteHost>;

function execute(c: Chamber, cmd: Command): CmdResult {
  const src = 'Remote (phone)';
  if (!c.remoteControl) {
    c.log('SYSTEM', `${src} command rejected — remote control not enabled (${cmd.cmd})`);
    return { id: cmd.id, ok: false, text: 'Rejected: the local operator has not enabled remote control' };
  }
  switch (cmd.cmd) {
    case 'start': {
      if (c.running) return { id: cmd.id, ok: false, text: 'Test already running' };
      c.log('OPERATOR', `${src}: start requested`);
      c.start();
      return c.running ? { id: cmd.id, ok: true, text: 'Test started' } : { id: cmd.id, ok: false, text: c.state === 'TRIPPED' ? 'Start rejected: interlock tripped — reset at local panel' : 'Start rejected' };
    }
    case 'stop':
      if (!c.running) return { id: cmd.id, ok: false, text: 'No test running' };
      c.log('OPERATOR', `${src}: controlled stop requested`);
      c.stop();
      return { id: cmd.id, ok: true, text: 'Test stopped (controlled stop)' };
    case 'ack':
      c.ack(cmd.alarmId);
      c.log('OPERATOR', `${src}: alarm acknowledge`);
      return { id: cmd.id, ok: true, text: 'Alarm(s) acknowledged' };
    case 'set': {
      const clean: Partial<Params> = {};
      for (const [k, v] of Object.entries(cmd.params ?? {})) {
        if (k === 'mode') { if (MODES.includes(v as never)) clean.mode = v as Params['mode']; continue; }
        const lim = LIMITS[k as keyof typeof LIMITS];
        if (!lim || typeof v !== 'number' || !isFinite(v)) continue;
        (clean as Record<string, number>)[k] = Math.max(lim[0], Math.min(lim[1], v));
      }
      if (!Object.keys(clean).length) return { id: cmd.id, ok: false, text: 'No valid setpoints received' };
      c.setParams(clean, src);
      return { id: cmd.id, ok: true, text: `${Object.keys(clean).length} setpoint(s) written to controller` };
    }
  }
}
