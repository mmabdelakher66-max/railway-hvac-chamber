import { useEffect, useReducer, useRef } from 'react';
import { Chamber, TICK_MS } from '../sim/engine';

export function useChamber() {
  const ref = useRef<Chamber | null>(null);
  if (!ref.current) ref.current = new Chamber();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(() => { ref.current!.step(); force(); }, TICK_MS);
    return () => clearInterval(id);
  }, []);
  const c = ref.current;
  const act = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { fn(...a); force(); };
  return {
    c,
    start: act(() => c.start()),
    stop: act(() => c.stop()),
    estop: act(() => c.emergencyStop()),
    releaseEstop: act(() => c.releaseEstop()),
    reset: act(() => c.reset()),
    ack: act((id?: string) => c.ack(id)),
    setParams: act((p: Parameters<Chamber['setParams']>[0]) => c.setParams(p)),
    setRemoteControl: act((on: boolean) => c.setRemoteControl(on)),
    force,
    clearAllFaults: act(() => c.clearAllFaults()),
    setFault: act((k: Parameters<Chamber['setFault']>[0], on: boolean) => c.setFault(k, on)),
  };
}
export type Hmi = ReturnType<typeof useChamber>;
