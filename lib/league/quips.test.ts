import { describe, expect, it } from 'vitest';
import { quipFor, type QuipContext } from './quips';

function context(overrides: Partial<QuipContext> = {}): QuipContext {
  return {
    gameweek: 10,
    net: 30,
    gross: 30,
    hits: 0,
    bench: 0,
    runnerUpNet: 45,
    tied: false,
    previousLosses: [],
    ...overrides,
  };
}

describe('quipFor', () => {
  it('leads with the tie when everyone is level', () => {
    expect(quipFor(context({ tied: true, hits: 8 }))).toBe(
      'Level at the bottom. Everyone pays.',
    );
  });

  it('blames hits when they alone dragged the manager below the runner-up', () => {
    // gross 40 would have beaten the runner-up's net of 32; the 12-point hit
    // is what put them bottom.
    const line = quipFor(
      context({ gross: 40, hits: 12, net: 28, runnerUpNet: 32 }),
    );
    expect(line).toBe('Paid 12 points in hits to finish bottom.');
  });

  it('does not blame hits when the manager would have finished bottom anyway', () => {
    const line = quipFor(
      context({ gross: 20, hits: 4, net: 16, runnerUpNet: 32 }),
    );
    expect(line).not.toMatch(/hits/);
  });

  it('calls out a bench that outscored the starting team', () => {
    const line = quipFor(context({ net: 20, bench: 34, runnerUpNet: 45 }));
    expect(line).toBe('Their bench outscored their team by 14.');
  });

  it('flags a second consecutive week at the bottom', () => {
    const line = quipFor(
      context({ gameweek: 6, previousLosses: [5], net: 25, runnerUpNet: 26 }),
    );
    expect(line).toBe('Second week running.');
  });

  it('counts a longer active streak', () => {
    const line = quipFor(
      context({ gameweek: 7, previousLosses: [4, 5, 6], net: 25, runnerUpNet: 26 }),
    );
    expect(line).toBe('4 weeks running.');
  });

  it('does not call it a streak once it has already broken', () => {
    const line = quipFor(
      context({ gameweek: 7, previousLosses: [4, 5], net: 25, runnerUpNet: 40 }),
    );
    expect(line).not.toMatch(/running/);
  });

  it('counts a third-or-later eviction that is not on an active streak', () => {
    const line = quipFor(
      context({ gameweek: 10, previousLosses: [2, 5], net: 25, runnerUpNet: 40 }),
    );
    expect(line).toBe('Third eviction of the season.');
  });

  it('notes finishing exactly one point off safety', () => {
    const line = quipFor(context({ net: 25, runnerUpNet: 26 }));
    expect(line).toBe('One point off safety.');
  });

  it('notes a wide margin', () => {
    const line = quipFor(context({ net: 10, runnerUpNet: 30 }));
    expect(line).toBe('Bottom by 20. Not a photo finish.');
  });

  it('falls back to the raw score for an otherwise unremarkable low finish', () => {
    const line = quipFor(context({ net: 15, runnerUpNet: 20 }));
    expect(line).toBe('15 points from eleven players.');
  });

  it('picks a stable fallback line when nothing else applies', () => {
    const line = quipFor(context({ net: 65, runnerUpNet: 70, gameweek: 3 }));
    expect(line.length).toBeGreaterThan(0);
    expect(quipFor(context({ net: 65, runnerUpNet: 70, gameweek: 3 }))).toBe(line);
  });

  it('is deterministic for identical input', () => {
    const ctx = context({ bench: 12, net: 18, hits: 4, gross: 22, runnerUpNet: 30 });
    expect(quipFor(ctx)).toBe(quipFor(ctx));
  });

  it('varies the fallback line across gameweeks', () => {
    const lines = new Set(
      Array.from({ length: 8 }, (_, i) =>
        quipFor(context({ net: 65, runnerUpNet: 70, gameweek: i })),
      ),
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it('keeps every fallback line short enough to never wrap past two lines', () => {
    for (let gw = 0; gw < 8; gw += 1) {
      const line = quipFor(context({ net: 65, runnerUpNet: 70, gameweek: gw }));
      expect(line.length).toBeLessThanOrEqual(60);
    }
  });
});
