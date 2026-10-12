import { describe, expect, it } from 'vitest';
import { advanceFlight, duration, flightStage, LaunchLedger, shareUrl } from './flight';
import { paginate } from './api';
describe('flight lifecycle', () => {
  it('moves through every phase using elapsed time and settles', () => {
    expect([0, 400, 1900, 6100, 8500, 10000, 12500].map(flightStage)).toEqual([
      'Queued',
      'LiftOff',
      'Orbit',
      'Approach',
      'Landing',
      'Celebrating',
      'Settled',
    ]);
    expect(advanceFlight({ elapsed: 0, stage: 'Queued' }, 99999, false, false)).toEqual({
      elapsed: duration,
      stage: 'Settled',
    });
  });
  it('pauses elapsed time and bypasses animation for reduced motion', () => {
    const state = { elapsed: 2400, stage: 'Orbit' as const };
    expect(advanceFlight(state, 1000, true, false)).toBe(state);
    expect(advanceFlight(state, 1000, true, true).stage).toBe('Settled');
  });
  it('deduplicates initial and reconnected events while allowing a new deployment', () => {
    const ledger = new LaunchLedger();
    ledger.seed(['first']);
    expect(ledger.accept('first')).toBe(false);
    expect(ledger.accept('second')).toBe(true);
    expect(ledger.accept('second')).toBe(false);
  });
  it('preserves the Pages base and encodes a clean share link', () => {
    expect(shareUrl('project', 'gh:123', 'https://example.com/Ship-It/?launch=old#thing')).toBe(
      'https://example.com/Ship-It/?project=gh%3A123',
    );
  });
  it('keeps simulated launch and project links inside the sandbox', () => {
    expect(
      shareUrl('launch', 'sim-0-0', 'https://example.com/Ship-It/?demo=1&project=old#thing'),
    ).toBe('https://example.com/Ship-It/?demo=1&launch=sim-0-0');
    expect(shareUrl('project', 'gh:800000', 'https://example.com/Ship-It/?demo=1&launch=old')).toBe(
      'https://example.com/Ship-It/?demo=1&project=gh%3A800000',
    );
  });
});
describe('demo read pagination', () => {
  it('returns all matching records without overlap', () => {
    const a = paginate([1, 2, 3, 4, 5], null, 2),
      b = paginate([1, 2, 3, 4, 5], a.nextCursor, 2),
      c = paginate([1, 2, 3, 4, 5], b.nextCursor, 2);
    expect([...a.items, ...b.items, ...c.items]).toEqual([1, 2, 3, 4, 5]);
    expect(c.nextCursor).toBeNull();
  });
});
