import { describe, expect, it } from 'vitest';
import { deduce } from './solver';
import { cellView, createArena, reveal } from './mines';

describe('ipucu feneri (çıkarım)', () => {
  it('0 karenin çevresi ve tamamlanmış sayının kalanı güvenli; dolu sayı mayın', () => {
    // 3×3: ortadaki 1, sol üst açık 1; mayın tam bir yerde
    // satır0: [1, -1, -1] / satır1: [1, 1, -1] / satır2: [0, 0, 0]
    const v = [1, -1, -1, 1, 1, -1, 0, 0, 0];
    const d = deduce(v, 3);
    // (0,0)=1 → komşu gizli: 1 → tek gizli komşusu kesin mayın
    expect(d.mines).toContain(1);
    // ortadaki 1 tamamlandı → diğer gizliler güvenli
    expect(d.safe).toEqual(expect.arrayContaining([2, 5]));
  });
  it('patlamış mayını bilinen mayın sayar', () => {
    const v = [9, -1, 1, 1];
    // 2×2: (1,0)=1 → komşusu 9 zaten mayın → (0,1) güvenli
    expect(deduce(v, 2).safe).toEqual([1]);
  });
  it('gerçek tahtalarda çıkarımlar hiçbir zaman yanlış değil', () => {
    let checked = 0;
    for (let seed = 1; seed < 60; seed++) {
      let x = seed;
      const rng = (n: number) => ((x = (x * 1664525 + 1013904223) >>> 0), x % n);
      const s = createArena(11, 17, ['a', 'b'], rng, { lives: 9, afkTurns: 3, shields: 0 });
      const mines = new Set(s.mines);
      for (let step = 0; step < 25 && s.phase === 'playing'; step++) {
        const d = deduce(cellView(s, false), s.size);
        for (const i of d.safe) expect(mines.has(i)).toBe(false);
        for (const i of d.mines) expect(mines.has(i)).toBe(true);
        checked += d.safe.length + d.mines.length;
        const pick = d.safe[0] ?? s.cells.findIndex((c, i) => c === 0 && !mines.has(i));
        if (pick < 0) break;
        reveal(s, s.current, pick);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
