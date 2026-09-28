// Remote operator link over MQTT (WebSocket). The local HMI is the publisher; phones subscribe.
import mqtt, { type MqttClient } from 'mqtt';
import type { Params, Priority, SeqState, UutMode } from '../sim/engine';

/** Public test brokers — fine for a demo. Production would use a private broker with TLS + authentication. */
export const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const override = () => new URLSearchParams(location.search).get('broker');
export const brokerUrl = (idx: number) => override() || BROKERS[idx] || BROKERS[0];
export const hasOverride = () => !!override();
export const topic = (session: string, t: string) => `upei-eog/tc01/${session}/${t}`;

export function connect(url: string, will?: { topic: string; payload: string }): MqttClient {
  return mqtt.connect(url, {
    clientId: 'tc01_' + Math.random().toString(16).slice(2, 10),
    clean: true, connectTimeout: 7000, reconnectPeriod: 3000, keepalive: 20,
    will: will ? { topic: will.topic, payload: will.payload, qos: 0, retain: true } : undefined,
  });
}

export const newSession = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export interface SnapAlarm { id: string; tag: string; text: string; priority: Priority; active: boolean; acked: boolean; t: number; value: string }
export interface Snapshot {
  v: 1; ts: number; state: SeqState; simTime: number; holdTime: number; holdReq: number;
  estop: boolean; remoteControl: boolean; tripped: string[];
  params: Params;
  pv: {
    tA: number; rhA: number; tB: number; rhB: number; tSupply: number; tReturn: number; airflow: number; dp: number;
    q: number; qMax: number; power: number; cop: number; damper: number; plantOut: number; loadOut: number;
    fanRun: boolean; compRun: boolean;
  };
  alarms: SnapAlarm[];
}
export type Command =
  | { id: string; cmd: 'start' | 'stop' }
  | { id: string; cmd: 'ack'; alarmId?: string }
  | { id: string; cmd: 'set'; params: Partial<Params> };
export interface CmdResult { id: string; ok: boolean; text: string }

export const MODES: UutMode[] = ['COOL', 'HEAT', 'VENT', 'OFF'];
export const LIMITS: Record<'zoneA_SP' | 'zoneB_SP' | 'freshAir' | 'occupancy' | 'zoneA_RH_SP' | 'solar' | 'airflow', [number, number]> = {
  zoneA_SP: [-10, 55], zoneB_SP: [16, 28], freshAir: [0, 100], occupancy: [0, 100], zoneA_RH_SP: [20, 90], solar: [0, 1000], airflow: [30, 100],
};
