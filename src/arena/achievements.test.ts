import { describe, expect, it } from 'vitest';
import { badgesFor } from './achievements';
import type { MatchView } from './protocol';

const view = (over: Partial<MatchView>, row: Record<string, unknown>, lives = 1): MatchView =>
  ({
    phase: 'finished',
    mode: 'classic',
    players: [{ seat: 0, lives, eliminated: false }],
    results: [{ seat: 0, rank: 1, mineHits: 0, defused: 0, ...row }],
    ...over,
  }) as unknown as MatchView;

describe('madalyalar', () => {
  it('kazanma, kusursuz, geri dönüş, Yıldırım, avcı, radar, strateji, seri', () => {
    expect(badgesFor(view({}, {}), 0, { maxStreak: 0, usedSonar: false })).toEqual(['first_victory', 'perfect_logic', 'comeback']);
    expect(badgesFor(view({ mode: 'blitz' }, { mineHits: 2 }, 2), 0, { maxStreak: 6, usedSonar: false })).toEqual(['first_victory', 'quick_thinker', 'winning_streak']);
    expect(badgesFor(view({ mode: 'hunter' }, { rank: 2, defused: 3 }, 2), 0, { maxStreak: 0, usedSonar: true })).toEqual(['mine_hunter', 'radar_expert']);
    expect(badgesFor(view({ mode: 'territory' }, { mineHits: 1 }, 3), 0, { maxStreak: 0, usedSonar: false })).toEqual(['first_victory', 'strategic_master']);
    expect(badgesFor(view({ phase: 'playing' }, {}), 0, { maxStreak: 9, usedSonar: true })).toEqual([]);
    expect(badgesFor(view({}, {}), null, { maxStreak: 9, usedSonar: true })).toEqual([]);
  });
  it('yeni madalyalar: şimşek, bayrak ustası, kutu avcısı, kâhin, keskin zekâ', () => {
    const lost = (o: Partial<MatchView> = {}) => view(o, { rank: 2, mineHits: 1 }, 2);
    const base = { maxStreak: 0, usedSonar: false };
    expect(badgesFor(lost(), 0, { ...base, lightning: 3 })).toEqual(['lightning']);
    expect(badgesFor(lost(), 0, { ...base, lightning: 2 })).toEqual([]);
    expect(badgesFor(lost(), 0, { ...base, flagsRight: 4, flagsTotal: 4 })).toEqual(['flag_master']);
    expect(badgesFor(lost(), 0, { ...base, flagsRight: 4, flagsTotal: 5 })).toEqual([]);
    expect(badgesFor(lost({ bonusFound: [{ i: 1, k: 'extra', seat: 0 }, { i: 2, k: 'life', seat: 0 }, { i: 3, k: 'life', seat: 1 }] }), 0, base)).toEqual(['bonus_hunter']);
    expect(badgesFor(lost({ bonusFound: [{ i: 1, k: 'extra', seat: 0 }, { i: 3, k: 'life', seat: 1 }] }), 0, base)).toEqual([]);
    // izleyici (koltuksuz) de kâhin olabilir
    expect(badgesFor(lost(), null, { ...base, oracleRight: 3 })).toEqual(['oracle']);
    expect(badgesFor(view({}, {}, 3), 0, { ...base, usedPower: false })).toEqual(['first_victory', 'perfect_logic', 'sharp_mind']);
    expect(badgesFor(view({}, {}, 3), 0, { ...base, usedPower: true })).toEqual(['first_victory', 'perfect_logic']);
  });
});
