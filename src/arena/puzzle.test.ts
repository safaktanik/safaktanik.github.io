import { describe, expect, it } from 'vitest';
import { PUZZLE, PuzzleGame, puzzleDay, puzzleFor, puzzleShareText, puzzleStreak, solvable } from './puzzle';
import { deduce } from './solver';

describe('Günün Bulmacası', () => {
  it('aynı gün herkese aynı tahta; farklı gün farklı', () => {
    const a = puzzleFor('2026-10-25');
    const b = puzzleFor('2026-10-25');
    const c = puzzleFor('2026-10-26');
    expect(a).toEqual(b);
    expect(a.mines).not.toEqual(c.mines);
    expect(a.mines).toHaveLength(PUZZLE.mines);
    expect(a.size).toBe(PUZZLE.size);
  });

  it('60 günün tahtası tahmin gerektirmeden çözülebilir; kesin çıkarımla oynayan kazanır', () => {
    for (let d = 0; d < 60; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const b = puzzleFor(day);
      expect(solvable(b.size, b.mines, b.start)).toBe(true);
      const g = new PuzzleGame(b);
      for (let k = 0; k < 400 && g.phase === 'playing'; k++) {
        const s = deduce(g.view(), b.size).safe;
        expect(s.length).toBeGreaterThan(0);
        for (const i of s) g.reveal(i, 1000 + k);
      }
      expect(g.phase).toBe('won');
      expect(g.mistakes).toBe(0);
    }
  });

  it('mayın hata sayılır (+30 sn ceza), 3 hatada biter', () => {
    const b = puzzleFor('2026-10-25');
    const g = new PuzzleGame(b);
    expect(g.reveal(b.mines[0], 0)).toBe('mine');
    expect(g.lives).toBe(2);
    expect(g.elapsedMs(10_000)).toBe(10_000 + PUZZLE.penaltyMs);
    expect(g.reveal(b.mines[0], 1)).toBe('ignored');
    g.reveal(b.mines[1], 2);
    g.reveal(b.mines[2], 3);
    expect(g.phase).toBe('lost');
    // bitince mayınlar görünür
    expect(g.view().filter((v) => v === 10 || v === 9)).toHaveLength(PUZZLE.mines);
  });

  it('gün anahtarı Türkiye saatiyle; seri hesabı; paylaşım metni tahtayı göstermez', () => {
    expect(puzzleDay(Date.UTC(2026, 9, 25, 21, 30))).toBe('2026-10-26');
    expect(puzzleDay(Date.UTC(2026, 9, 25, 20, 30))).toBe('2026-10-25');
    const h = [
      { day: '2026-10-25', won: true, timeMs: 90_000, mistakes: 1 },
      { day: '2026-10-24', won: true, timeMs: 60_000, mistakes: 0 },
      { day: '2026-10-22', won: true, timeMs: 60_000, mistakes: 0 },
    ];
    expect(puzzleStreak(h, '2026-10-25')).toBe(2);
    expect(puzzleStreak(h, '2026-10-26')).toBe(2);
    expect(puzzleStreak(h, '2026-10-27')).toBe(0);
    const t = puzzleShareText(h[0], 2);
    expect(t).toContain('25.10.2026');
    expect(t).toContain('1:30');
    expect(t).toContain('❤️❤️🖤');
  });
});
