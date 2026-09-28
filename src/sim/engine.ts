// Railway HVAC Test Chamber — process model + control/interlock logic.
// Conceptual demonstrator: simplified first-order thermal model, not a validated simulation.

export type UutMode = 'COOL' | 'HEAT' | 'VENT' | 'OFF';
export type SeqState = 'IDLE' | 'RAMP' | 'STABILIZING' | 'STABLE' | 'TRIPPED';
export type Priority = 1 | 2 | 3;
export type FaultKey = 'fanFail' | 'heaterRunaway' | 'elecFault' | 'doorOpen';

export interface Params {
  zoneA_SP: number;      // °C  climatic (outdoor) temperature setpoint
  zoneA_RH_SP: number;   // %RH
  solar: number;         // W/m² equivalent solar load
  occupancy: number;     // % of 100 passengers
  freshAir: number;      // % fresh-air damper
  airflow: number;       // % of nominal supply airflow
  zoneB_SP: number;      // °C  coach interior setpoint
  mode: UutMode;
}

export interface Process {
  tA: number; rhA: number; tB: number; rhB: number;
  tSupply: number; tReturn: number;
  airflow: number;   // m³/h
  dp: number;        // Pa, coach vs climatic zone
  q: number;         // kW, + cooling / − heating delivered by UUT
  qMax: number;      // kW, available cooling capacity at current conditions
  power: number;     // kW electrical, UUT
  cop: number;
  plantOut: number;  // % climatic plant output
  loadOut: number;   // % passenger load simulator output
  damper: number;    // % position
  fanRun: boolean; compRun: boolean; plantRun: boolean;
}

export interface Alarm {
  id: string; tag: string; text: string; priority: Priority;
  time: Date; active: boolean; acked: boolean; value: string; limit: string;
}
export interface LogEvent { time: Date; kind: 'OPERATOR' | 'SYSTEM' | 'ALARM'; text: string; }
export interface HistPoint { t: number; tA: number; spA: number; tB: number; spB: number; tSup: number; q: number; power: number; rhB: number; }

export interface Interlock { id: string; tag: string; text: string; condition: string; action: string; tripped: boolean; }

export const RECIPES: Record<string, { label: string; note: string; p: Partial<Params> }> = {
  normal:   { label: 'Normal day',      note: '25 °C · 50 %RH · moderate occupancy', p: { zoneA_SP: 25, zoneA_RH_SP: 50, solar: 300, occupancy: 50, freshAir: 50, airflow: 70, zoneB_SP: 23, mode: 'COOL' } },
  hot:      { label: 'Egyptian summer', note: '45 °C · 30 %RH · high solar load',   p: { zoneA_SP: 45, zoneA_RH_SP: 30, solar: 900, occupancy: 70, freshAir: 40, airflow: 90, zoneB_SP: 24, mode: 'COOL' } },
  peak:     { label: 'Peak occupancy',  note: '35 °C · 60 %RH · 100 % crush load',  p: { zoneA_SP: 35, zoneA_RH_SP: 60, solar: 600, occupancy: 100, freshAir: 80, airflow: 100, zoneB_SP: 24, mode: 'COOL' } },
  winter:   { label: 'Winter heating',  note: '5 °C · 70 %RH · low occupancy',      p: { zoneA_SP: 5, zoneA_RH_SP: 70, solar: 0, occupancy: 20, freshAir: 40, airflow: 60, zoneB_SP: 20, mode: 'HEAT' } },
};

export const DEFAULT_PARAMS: Params = { zoneA_SP: 35, zoneA_RH_SP: 50, solar: 600, occupancy: 60, freshAir: 50, airflow: 80, zoneB_SP: 23, mode: 'COOL' };

export const TICK_MS = 500;
export const SIM_DT = 15;              // simulated seconds per tick → ×30 time compression
export const HOLD_REQUIRED = 15 * 60;  // s of steady state for a valid test point
const AMBIENT = 25;
const C_B = 600;        // kJ/K  coach air + interior thermal mass
const UA = 0.4;         // kW/K  body heat leakage
const PAX_MAX = 100, PAX_KW = 0.12;
const FRESH_MAX = 0.35; // m³/s at 100 % damper
const AIRFLOW_NOM = 6500; // m³/h
const Q_HEAT_MAX = 30;  // kW

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));
const noise = (a: number) => (Math.random() - 0.5) * a;

export class Chamber {
  params: Params = { ...DEFAULT_PARAMS };
  p: Process = {
    tA: AMBIENT, rhA: 50, tB: AMBIENT, rhB: 50, tSupply: AMBIENT, tReturn: AMBIENT,
    airflow: 0, dp: 0, q: 0, qMax: 40, power: 0, cop: 3.4, plantOut: 0, loadOut: 0, damper: 0,
    fanRun: false, compRun: false, plantRun: false,
  };
  state: SeqState = 'IDLE';
  simTime = 0;      // s since test start
  holdTime = 0;     // s within steady-state band
  holdLogged = false;
  estop = false;
  faults: Record<FaultKey, boolean> = { fanFail: false, heaterRunaway: false, elecFault: false, doorOpen: false };
  alarms: Alarm[] = [];
  events: LogEvent[] = [];
  history: HistPoint[] = [];
  interlocks: Interlock[] = [
    { id: 'IL-01', tag: 'TSHH-101', text: 'Climatic zone over-temperature', condition: 'TT-101 > 60 °C', action: 'Trip plant + UUT, fans run-on', tripped: false },
    { id: 'IL-02', tag: 'TSHH-201', text: 'Coach zone over-temperature', condition: 'TT-201 > 45 °C', action: 'Trip load simulator + UUT', tripped: false },
    { id: 'IL-03', tag: 'FSL-301', text: 'Supply airflow failure', condition: 'FT-301 < 20 % nominal while running', action: 'Trip UUT compressor + heaters', tripped: false },
    { id: 'IL-04', tag: 'EFT-401', text: 'Electrical fault / earth leakage', condition: 'Protection relay trip', action: 'Isolate UUT supply', tripped: false },
    { id: 'IL-05', tag: 'ZS-501', text: 'Chamber access door open', condition: 'Door switch open', action: 'Inhibit start / trip test', tripped: false },
    { id: 'IL-06', tag: 'HS-001', text: 'Emergency stop', condition: 'E-stop pushed', action: 'Safe shutdown of all actuators', tripped: false },
  ];
  msg: { text: string; ok: boolean; time: Date } | null = null;
  remoteControl = false;   // local operator grants/revokes control from remote (phone) screens

  setRemoteControl(on: boolean) {
    if (this.remoteControl === on) return;
    this.remoteControl = on;
    this.log('OPERATOR', on ? 'Remote control ENABLED for mobile operator screens' : 'Remote control disabled — mobile screens are monitor-only');
  }
  private integ = 0;
  private maxCapTimer = 0;

  get running() { return this.state === 'RAMP' || this.state === 'STABILIZING' || this.state === 'STABLE'; }

  private say(text: string, ok: boolean) { this.msg = { text, ok, time: new Date() }; }

  /** Why each interlock cannot be reset yet (empty = cause cleared). */
  causes(): Record<string, string | null> {
    return {
      'IL-01': this.p.tA > 58 ? 'TT-101 still above 58 °C' : this.faults.heaterRunaway ? 'EH-101 fault still present' : null,
      'IL-02': this.p.tB > 43 ? 'TT-201 still above 43 °C' : null,
      'IL-03': this.faults.fanFail ? 'Fan M-202 fault still present' : null,
      'IL-04': this.faults.elecFault ? 'Electrical fault still present' : null,
      'IL-05': this.faults.doorOpen ? 'Door still open' : null,
      'IL-06': this.estop ? 'E-stop still pushed — release it first' : null,
    };
  }

  clearAllFaults() {
    (Object.keys(this.faults) as FaultKey[]).forEach(k => this.setFault(k, false));
    this.say('All simulated faults cleared — now reset the interlocks', true);
  }

  log(kind: LogEvent['kind'], text: string) {
    this.events.unshift({ time: new Date(), kind, text });
    if (this.events.length > 200) this.events.pop();
  }

  setParams(next: Partial<Params>, source = 'Operator') {
    const labels: Record<string, [string, string]> = {
      zoneA_SP: ['TIC-101 SP', '°C'], zoneA_RH_SP: ['MIC-101 SP', '%RH'], solar: ['Solar load', 'W/m²'],
      occupancy: ['Occupancy', '%'], freshAir: ['DMP-301', '%'], airflow: ['Supply airflow', '%'],
      zoneB_SP: ['TIC-201 SP', '°C'], mode: ['UUT mode', ''],
    };
    for (const [k, v] of Object.entries(next)) {
      const key = k as keyof Params;
      if (this.params[key] !== v) {
        const [lbl, u] = labels[key];
        this.log('OPERATOR', `${source}: ${lbl} ${this.params[key]}${u ? ' ' + u : ''} → ${v}${u ? ' ' + u : ''}`);
      }
    }
    this.params = { ...this.params, ...next };
  }

  start() {
    if (this.running) return;
    if (this.state === 'TRIPPED') { this.log('SYSTEM', 'Start rejected — reset interlocks first'); this.say('Start rejected — reset the interlocks first', false); return; }
    this.state = 'RAMP'; this.simTime = 0; this.holdTime = 0; this.holdLogged = false; this.integ = 0;
    this.history = [];
    this.say('Test started', true);
    this.log('OPERATOR', `Test started — TIC-101 SP ${this.params.zoneA_SP} °C, TIC-201 SP ${this.params.zoneB_SP} °C, UUT ${this.params.mode}`);
  }

  stop() {
    if (!this.running) return;
    this.state = 'IDLE';
    this.log('OPERATOR', 'Controlled stop — test ended by operator');
  }

  emergencyStop() {
    if (this.estop) return;
    this.estop = true;
    this.trip('IL-06');
  }

  releaseEstop() {
    if (!this.estop) return;
    this.estop = false;
    this.log('OPERATOR', 'E-stop released (reset still required)');
    this.say('E-stop released — press Reset interlocks', true);
  }

  reset() {
    if (this.state !== 'TRIPPED') return;
    const c = this.causes();
    const blocking = this.interlocks.filter(i => i.tripped && c[i.id]).map(i => `${i.id}: ${c[i.id]}`);
    if (blocking.length) {
      this.log('SYSTEM', `Reset rejected — ${blocking.join('; ')}`);
      this.say(`Reset rejected — ${blocking.join('; ')}`, false);
      return;
    }
    this.interlocks.forEach(i => (i.tripped = false));
    this.state = 'IDLE';
    this.log('OPERATOR', 'Interlocks reset — system ready');
    this.say('Interlocks reset — system ready to start', true);
  }

  setFault(key: FaultKey, on: boolean) {
    const names: Record<FaultKey, string> = { fanFail: 'Supply fan failure', heaterRunaway: 'Climatic heater runaway', elecFault: 'Electrical fault', doorOpen: 'Chamber door open' };
    if (this.faults[key] === on) return;
    this.faults[key] = on;
    this.log('SYSTEM', `${on ? 'Simulated fault injected' : 'Simulated fault cleared'}: ${names[key]}`);
  }

  ack(id?: string) {
    const list = id ? this.alarms.filter(a => a.id === id) : this.alarms;
    let n = 0;
    list.forEach(a => { if (!a.acked) { a.acked = true; n++; } });
    this.alarms = this.alarms.filter(a => a.active || !a.acked);
    if (n) this.log('OPERATOR', id ? `Alarm acknowledged: ${list[0]?.tag}` : `${n} alarm(s) acknowledged`);
  }

  private trip(id: string) {
    const il = this.interlocks.find(i => i.id === id)!;
    if (il.tripped) return;
    il.tripped = true;
    const wasRunning = this.running;
    this.state = 'TRIPPED';
    this.holdTime = 0;
    this.log('ALARM', `INTERLOCK ${il.id} TRIPPED — ${il.text}${wasRunning ? ' · test aborted' : ''}`);
  }

  private alarm(id: string, cond: boolean, tag: string, text: string, priority: Priority, value: string, limit: string) {
    const a = this.alarms.find(x => x.id === id);
    if (cond) {
      if (!a) {
        this.alarms.unshift({ id, tag, text, priority, time: new Date(), active: true, acked: false, value, limit });
        this.log('ALARM', `P${priority} ${tag} ${text}`);
      } else { a.active = true; a.value = value; }
    } else if (a && a.active) {
      a.active = false;
      if (a.acked) this.alarms = this.alarms.filter(x => x !== a);
      this.log('ALARM', `RTN ${tag} ${text}`);
    }
  }

  step(dt = SIM_DT) {
    const P = this.params, p = this.p;
    const run = this.running;

    // ── Interlock checks (hard-wired safety layer) ──
    if (p.tA > 60) this.trip('IL-01');
    if (p.tB > 45) this.trip('IL-02');
    if (run && this.faults.fanFail && P.mode !== 'OFF') this.trip('IL-03');
    if (this.faults.elecFault) this.trip('IL-04');
    if (this.faults.doorOpen) this.trip('IL-05');


    // ── Climatic zone A (chamber conditioning plant) ──
    p.plantRun = run;
    if (run) {
      const err = P.zoneA_SP - p.tA;
      const rate = clamp(err / 200, -0.04, 0.04);           // max ≈2.4 K/min
      p.tA += rate * dt;
      p.plantOut = clamp(Math.abs(err) * 15 + 25, 0, 100);
      p.rhA = approach(p.rhA, P.zoneA_RH_SP, 1 / 400, dt);
    } else {
      p.tA = approach(p.tA, AMBIENT, 1 / 1800, dt);
      p.rhA = approach(p.rhA, 50, 1 / 1800, dt);
      p.plantOut = 0;
    }
    // stuck control contactor keeps heating until the safety contactor (IL-01 / IL-06) opens
    if (this.faults.heaterRunaway && this.state !== 'TRIPPED') p.tA += 0.06 * dt;

    // ── Unit under test ──
    p.fanRun = run && P.mode !== 'OFF' && !this.faults.fanFail;
    p.airflow = p.fanRun ? (P.airflow / 100) * AIRFLOW_NOM : 0;
    p.damper = p.fanRun ? P.freshAir : 0;
    p.cop = clamp(3.4 - 0.045 * (p.tA - 25), 1.8, 4);
    p.qMax = clamp(40 * (1 - 0.012 * Math.max(0, p.tA - 35)), 20, 40) * (0.6 + 0.4 * P.airflow / 100);

    const occKw = (P.occupancy / 100) * PAX_MAX * PAX_KW;
    const solarKw = (P.solar / 1000) * 6;
    p.loadOut = run ? clamp(((occKw + solarKw) / 18) * 100, 0, 100) : 0;
    const vFresh = (p.damper / 100) * FRESH_MAX;
    const gains = (run ? occKw + solarKw : 0) + UA * (p.tA - p.tB) + 1.2 * 1.005 * vFresh * (p.tA - p.tB);

    let qTarget = 0;
    if (p.fanRun && (P.mode === 'COOL' || P.mode === 'HEAT')) {
      const e = P.mode === 'COOL' ? p.tB - P.zoneB_SP : P.zoneB_SP - p.tB;
      this.integ = clamp(this.integ + e * dt * 0.05, 0, P.mode === 'COOL' ? p.qMax : Q_HEAT_MAX);
      const out = clamp(14 * e + this.integ, 0, P.mode === 'COOL' ? p.qMax : Q_HEAT_MAX);
      qTarget = P.mode === 'COOL' ? out : -out;
    } else this.integ = 0;
    p.q += clamp(qTarget - p.q, -0.8 * dt, 0.8 * dt);        // capacity slew (compressor staging)
    p.compRun = P.mode === 'COOL' && p.fanRun && p.q > 0.5;

    p.tB += ((gains - p.q) / C_B) * dt;
    p.tReturn = p.tB;
    const vs = p.airflow / 3600;
    p.tSupply = vs > 0.05 ? clamp(p.tB - p.q / (1.2 * 1.005 * vs), 6, 60) : p.tB;

    const rhTarget = p.fanRun ? clamp(52 - Math.max(0, p.q) * 0.35 + P.occupancy * 0.12 + (p.rhA - 50) * 0.25, 30, 85) : p.rhA;
    p.rhB = approach(p.rhB, rhTarget, 1 / 600, dt);
    p.dp = p.fanRun ? 4 + P.freshAir * 0.55 : 0;

    const fanKw = p.fanRun ? 2.2 * Math.pow(P.airflow / 100, 3) + 1.2 : 0;
    p.power = p.q > 0 ? p.q / p.cop + fanKw : -p.q + fanKw;

    // ── Test sequence ──
    if (run) {
      this.simTime += dt;
      const aOk = Math.abs(p.tA - P.zoneA_SP) < 0.5;
      const bOk = P.mode === 'VENT' || P.mode === 'OFF' || Math.abs(p.tB - P.zoneB_SP) < 0.5;
      if (this.state === 'RAMP' && Math.abs(p.tA - P.zoneA_SP) < 1) { this.state = 'STABILIZING'; this.log('SYSTEM', 'Climatic zone at setpoint — stabilizing'); }
      if (this.state === 'STABILIZING' && aOk && bOk) { this.state = 'STABLE'; this.holdTime = 0; this.log('SYSTEM', 'Steady-state band entered (±0.5 K) — hold timer started'); }
      if (this.state === 'STABLE') {
        if (!(Math.abs(p.tA - P.zoneA_SP) < 0.8 && (P.mode === 'VENT' || P.mode === 'OFF' || Math.abs(p.tB - P.zoneB_SP) < 0.8))) {
          this.state = 'STABILIZING'; this.holdTime = 0; this.log('SYSTEM', 'Left steady-state band — hold timer reset');
        } else {
          this.holdTime += dt;
          if (this.holdTime >= HOLD_REQUIRED && !this.holdLogged) { this.holdLogged = true; this.log('SYSTEM', 'Steady-state hold 15 min achieved — test point valid'); }
        }
      }
    }

    // ── Process alarms (operator advisories) ──
    const f1 = (v: number) => v.toFixed(1);
    const settled = this.state === 'STABLE' || (this.state === 'STABILIZING' && this.simTime > 1800);
    this.alarm('TT101-DEV', run && this.state !== 'RAMP' && Math.abs(p.tA - P.zoneA_SP) > 2, 'TT-101', 'Climatic zone temperature deviation', 2, `${f1(p.tA)} °C`, `SP ±2.0`);
    this.alarm('TT201-DEV', run && settled && (P.mode === 'COOL' || P.mode === 'HEAT') && Math.abs(p.tB - P.zoneB_SP) > 1.5, 'TT-201', 'Coach temperature out of tolerance', 2, `${f1(p.tB)} °C`, `SP ±1.5`);
    this.alarm('TT101-H', p.tA > 55, 'TT-101', 'Climatic zone temperature high', 1, `${f1(p.tA)} °C`, '55.0 °C');
    const atMax = p.compRun && p.q >= p.qMax * 0.98;
    this.maxCapTimer = atMax ? this.maxCapTimer + dt : 0;
    this.alarm('UUT-MAX', this.maxCapTimer > 120, 'UUT', 'Unit at maximum capacity — SP may be unachievable', 2, `${f1(p.q)} kW`, `${f1(p.qMax)} kW`);
    this.alarm('PDT302-L', p.fanRun && p.dp < 10, 'PDT-302', 'Coach pressurisation low', 3, `${f1(p.dp)} Pa`, '10.0 Pa');
    this.alarm('MT201-H', p.fanRun && p.rhB > 70, 'MT-201', 'Coach humidity high', 3, `${f1(p.rhB)} %`, '70.0 %');
    this.alarm('FT301-L', this.faults.fanFail, 'FT-301', 'Supply airflow low', 1, `${p.airflow.toFixed(0)} m³/h`, `${(0.2 * AIRFLOW_NOM).toFixed(0)} m³/h`);
    this.alarm('ZS501', this.faults.doorOpen, 'ZS-501', 'Chamber access door open', 2, 'OPEN', 'CLOSED');
    this.alarm('ESTOP', this.estop, 'HS-001', 'Emergency stop pushed', 1, 'ACTIVE', '—');
    for (const il of this.interlocks) if (il.id !== 'IL-06') this.alarm(`TRIP-${il.id}`, il.tripped, il.tag, `${il.id} trip: ${il.text}`, 1, 'TRIPPED', il.condition);

    // ── Historian ──
    if (run) {
      this.history.push({ t: this.simTime / 60, tA: p.tA, spA: P.zoneA_SP, tB: p.tB, spB: P.zoneB_SP, tSup: p.tSupply, q: p.q, power: p.power, rhB: p.rhB });
      if (this.history.length > 720) this.history.shift();
    }
  }

  /** Measured values as a transmitter would report them (with signal noise). */
  measured() {
    const p = this.p;
    return {
      tA: p.tA + noise(0.06), rhA: p.rhA + noise(0.3), tB: p.tB + noise(0.06), rhB: p.rhB + noise(0.3),
      tSupply: p.tSupply + noise(0.08), tReturn: p.tReturn + noise(0.06),
      airflow: p.airflow > 0 ? p.airflow + noise(25) : 0, dp: p.dp > 0 ? p.dp + noise(0.6) : 0,
      power: p.power > 0 ? p.power + noise(0.08) : 0, q: p.q,
    };
  }

  historyCsv() {
    const head = 'time_min,TT101_zoneA_C,TIC101_SP_C,TT201_coach_C,TIC201_SP_C,TT311_supply_C,UUT_capacity_kW,JT401_power_kW,MT201_RH_pct';
    const rows = this.history.map(h => [h.t, h.tA, h.spA, h.tB, h.spB, h.tSup, h.q, h.power, h.rhB].map(v => v.toFixed(2)).join(','));
    return [head, ...rows].join('\n');
  }
}
