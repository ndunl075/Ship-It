export const stages = ['Queued', 'LiftOff', 'Orbit', 'Approach', 'Landing', 'Celebrating', 'Settled'] as const;
export type Stage = typeof stages[number];
export const duration = 12500;
export function flightStage(elapsed: number): Stage {
  if (elapsed < 400) return 'Queued';
  if (elapsed < 1900) return 'LiftOff';
  if (elapsed < 6100) return 'Orbit';
  if (elapsed < 8500) return 'Approach';
  if (elapsed < 10000) return 'Landing';
  if (elapsed < duration) return 'Celebrating';
  return 'Settled';
}
export type FlightClock = { elapsed: number; stage: Stage };
export function advanceFlight(clock: FlightClock, delta: number, paused: boolean, reducedMotion: boolean): FlightClock {
  if (reducedMotion) return { elapsed: duration, stage: 'Settled' };
  if (paused || clock.stage === 'Settled') return clock;
  const elapsed = Math.min(duration, clock.elapsed + Math.max(0, delta));
  return { elapsed, stage: flightStage(elapsed) };
}
export class LaunchLedger {
  private seen = new Set<string>();
  accept(id: string) { if (this.seen.has(id)) return false; this.seen.add(id); return true; }
  seed(ids: string[]) { ids.forEach(id => this.seen.add(id)); }
}
export function shareUrl(kind: 'project' | 'launch', id: string, base = window.location.href) {
  const url = new URL(base); url.search = ''; url.hash = ''; url.searchParams.set(kind, id); return url.toString();
}
