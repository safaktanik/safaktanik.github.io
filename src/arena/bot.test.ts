import { describe, expect, it } from 'vitest';
import { analyze, botThinkMs, chooseBotCell, chooseBotPower } from './bot';
import { cellView, createArena, reveal } from './mines';

function seeded(seed: number) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('antrenman botu', () => {
  it('kesin güvenli ve kesin mayın karelerini çıkarır', () => {
    // 3×3: ortada "1", köşede patlamış mayın → diğer komşular kesin güvenli
    const cells = [9, -1, -1, -1, 1, -1, -1, -1, -1];
    const a = analyze(cells, 3, 1);
    expect(a.safe.sort()).toEqual([1, 2, 3, 5, 6, 7, 8]);
    // "1" ve tek gizli komşu → o kare kesin mayın
    const b = analyze([1, -1, 0, 0], 2, 1);
    expect(b.mines.has(1)).toBe(true);
    expect(b.safe).toEqual([]);
  });

  it('asla açık kareyi ya da kesin mayını seçmez', () => {
    for (let g = 0; g < 200; g++) {
      const rnd = seeded(g + 1);
      const s = createArena(10, 15, ['a', 'b', 'c'], (n) => Math.floor(rnd() * n), { lives: 3, afkTurns: 3 });
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 200) {
        const view = cellView(s, false);
        const level = (['easy', 'medium', 'hard'] as const)[g % 3];
        const i = chooseBotCell(view, 10, 15, level, rnd);
        expect(view[i]).toBe(-1);
        if (level !== 'easy') expect(analyze(view, 10, 15).mines.has(i) && analyze(view, 10, 15).hidden.length > 0).toBe(false);
        const r = reveal(s, s.current, i);
        expect('outcome' in r).toBe(true);
      }
      expect(s.phase).toBe('finished');
    }
  });

  it('zor bot kolaydan daha az mayına basar (hile yapmadan)', () => {
    const hits = { easy: 0, hard: 0 };
    for (const level of ['easy', 'hard'] as const) {
      for (let g = 0; g < 150; g++) {
        const rnd = seeded(1000 + g);
        const s = createArena(12, 20, ['a', 'b'], (n) => Math.floor(rnd() * n), { lives: 99, afkTurns: 3, island: false, shields: 0 });
        for (let k = 0; k < 40 && s.phase === 'playing'; k++) {
          const i = chooseBotCell(cellView(s, false), 12, 20, level, rnd);
          const r = reveal(s, s.current, i);
          if ('outcome' in r && r.outcome.kind === 'mine') hits[level]++;
        }
      }
    }
    expect(hits.hard).toBeLessThan(hits.easy * 0.75);
  });
});

describe('bot ve zincir', () => {
  it('zincirde yalnızca izinli karelerden seçer', () => {
    for (let g = 0; g < 100; g++) {
      const rnd = seeded(g + 50);
      const s = createArena(9, 12, ['a', 'b', 'c'], (n) => Math.floor(rnd() * n), { lives: 3, afkTurns: 3 }, 'chain');
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 300) {
        const i = chooseBotCell(cellView(s, false), 9, 12, 'hard', rnd, s.allowed);
        if (s.allowed && s.allowed.length) expect(s.allowed).toContain(i);
        expect('outcome' in reveal(s, s.current, i)).toBe(true);
      }
      expect(s.phase).toBe('finished');
    }
  });
});

describe('bot: Mayın Avcısı', () => {
  it('kesin bilinen mayını imha eder', async () => {
    const { chooseBotMove } = await import('./bot');
    // 3x3: köşede 1 gösteren kareler, tek gizli kare 0 → kesin mayın
    // tahta: [ -1, 1, 0 / 1, 1, 0 / 0, 0, 0 ]
    const cells = [-1, 1, 0, 1, 1, 0, 0, 0, 0];
    const m = chooseBotMove(cells, 3, 1, 'hard', () => 0.1, null, 'hunter');
    expect(m).toEqual({ index: 0, action: 'defuse' });
    const c = chooseBotMove(cells, 3, 1, 'hard', () => 0.1, null, 'classic');
    expect(c.action).toBe('open');
  });
});

describe('bot güçleri (Pas / Zorla)', () => {
  // 3×3: ortada "1", çevresi gizli → kesin güvenli kare yok, her komşu %12,5 risk; tamamen gizli tahta %25+ risk
  const stuck = [-1, -1, -1, -1, -1, -1, -1, -1, -1];
  const easySafe = [9, -1, -1, -1, 1, -1, -1, -1, -1]; // patlamış mayın + "1" → diğerleri kesin güvenli
  it('tıkanınca (kesin güvenli kare yok, risk yüksek) Pas geçer; hakkı yoksa geçmez', () => {
    expect(chooseBotPower(stuck, 3, 3, 'medium', { pass: 1, force: 0 }, () => 0)).toBe('pass');
    expect(chooseBotPower(stuck, 3, 3, 'medium', { pass: 0, force: 1 }, () => 0)).toBeNull();
  });
  it('kesin güvenli kare varken Pas geçmez; arada bir Zorla kurar; Zincir modunda Zorla yok', () => {
    expect(chooseBotPower(easySafe, 3, 1, 'medium', { pass: 1, force: 0 }, () => 0)).toBeNull();
    expect(chooseBotPower(easySafe, 3, 1, 'medium', { pass: 1, force: 1 }, () => 0)).toBe('force');
    expect(chooseBotPower(easySafe, 3, 1, 'medium', { pass: 1, force: 1 }, () => 0.99)).toBeNull();
    expect(chooseBotPower(easySafe, 3, 1, 'medium', { pass: 1, force: 1 }, () => 0, null, 'chain')).toBeNull();
  });
});

describe('insan gibi bot', () => {
  it('düşünme süresi: bariz hamlede kısa, tahminde uzun; süreli turda sınırlı', () => {
    const obvious = [9, -1, -1, -1, 1, -1, -1, -1, -1]; // güvenli kare var
    const guess = [-1, -1, -1, -1, -1, -1, -1, -1, -1];
    for (const r of [0, 0.5, 0.99]) {
      const a = botThinkMs(obvious, 3, 1, 'medium', r);
      const b = botThinkMs(guess, 3, 2, 'medium', r);
      expect(a).toBeGreaterThanOrEqual(1400);
      expect(a).toBeLessThanOrEqual(3000);
      expect(b).toBeGreaterThanOrEqual(2000);
      expect(b).toBeLessThanOrEqual(4500);
      expect(botThinkMs(guess, 3, 2, 'easy', r, 8)).toBeLessThanOrEqual(5600);
    }
  });
  it('kolay bot kesin güvenli kareyi her zaman fark etmez; zor bot neredeyse her zaman eder', () => {
    // 4×4: sol üst patlamış mayın + "1" → çevresi kesin güvenli; geri kalan gizli kareler belirsiz
    const cells = [9, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    const sure = new Set([1, 4, 2, 6, 8, 9, 10]);
    const rate = (level: 'easy' | 'hard') => {
      const rnd = seeded(level === 'easy' ? 3 : 4);
      let ok = 0;
      for (let k = 0; k < 600; k++) if (sure.has(chooseBotCell(cells, 4, 3, level, rnd))) ok++;
      return ok / 600;
    };
    expect(rate('easy')).toBeLessThan(0.8);
    expect(rate('hard')).toBeGreaterThan(0.85);
  });
});
