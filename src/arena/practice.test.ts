import { afterEach, describe, expect, it, vi } from 'vitest';
import { PracticeGame } from './practice';

afterEach(() => {
  vi.useRealTimers();
});

describe('antrenman masası', () => {
  it('dispose → resume (React StrictMode) sonrası maç donmaz', () => {
    vi.useFakeTimers();
    const g = new PracticeGame({ tier: 'bronze', mode: 'classic', opponents: 2, level: 'medium', name: 'Ben', avatar: 0, turnSeconds: 10 });
    g.resume();
    g.dispose();
    g.resume();
    const turn = g.state.turnNo;
    vi.advanceTimersByTime(12_000);
    expect(g.state.turnNo).toBeGreaterThan(turn);
  });

  for (const mode of ['classic', 'blitz', 'chain', 'hunter', 'shrink'] as const) {
    it(`${mode}: botlar güçleriyle (Pas / Zorla) oynar, oyuncu süre aşımıyla geçse de maç biter`, () => {
      vi.useFakeTimers();
      const g = new PracticeGame({ tier: 'bronze', mode, opponents: 2, level: 'medium', name: 'Ben', avatar: 0, turnSeconds: 20 });
      let lastTurn = g.state.turnNo;
      let stuck = 0;
      for (let i = 0; i < 4000 && g.state.phase === 'playing'; i++) {
        vi.advanceTimersByTime(1000);
        if (g.state.turnNo === lastTurn) stuck++;
        else {
          stuck = 0;
          lastTurn = g.state.turnNo;
        }
        // hiçbir tur süre sınırından (20 sn) uzun sürmemeli
        expect(stuck).toBeLessThan(25);
      }
      expect(g.state.phase).toBe('finished');
    });
  }
});
