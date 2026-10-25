/**
 * Denge simülasyonu (geliştirme aracı, oyuna dahil değil): botlarla binlerce maç oynatıp
 * maç uzunluğu, bitiş sebebi ve kazananın nasıl belirlendiğini ölçer.
 * Çalıştır: npm run sim  (ya da: npx tsx src/arena/balance.sim.ts 300 classic,blitz)
 */
import { createArena, reveal, rankedSeats } from './mines';
import type { ArenaMode } from './mines';
import { chooseBotMove } from './bot';
import type { BotLevel } from './bot';
import { matchSettings } from './rules';
import { TIERS, TIER_ORDER } from './economy';
import { boardFor } from './economy';

function rngOf(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
export function simulate(mode: ArenaMode, size: number, mines: number, players: number, games: number, levels: BotLevel[] = ['medium']) {
  let lastStanding = 0, turns = 0, elims = 0, bestSkillWins = 0, hitsWinner = 0, cleared = 0;
  for (let g = 0; g < games; g++) {
    const r = rngOf(g * 7919 + players * 31 + size);
    const s = createArena(size, mines, Array.from({ length: players }, (_, i) => `p${i}`), (n) => Math.floor(r() * n), matchSettings(mode), mode);
    const lv = Array.from({ length: players }, (_, i) => levels[i % levels.length]);
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 5000) {
      const view = s.cells.map((c, i) => (c === 0 ? -1 : c === 1 ? countAt(s, i) : c === 2 ? 9 : 11));
      const mv = chooseBotMove(view, s.size, s.mineCount, lv[s.current], r, s.allowed, mode);
      reveal(s, s.current, mv.index, mv.action);
      turns++;
    }
    if (s.endReason === 'last-standing') lastStanding++;
    if (s.endReason === 'cleared') cleared++;
    elims += s.players.filter((p) => p.eliminated).length;
    const w = rankedSeats(s)[0];
    hitsWinner += s.players[w].mineHits;
    if (levels.length > 1 && lv[w] === 'hard') bestSkillWins++;
  }
  return { lastStanding: lastStanding / games, cleared: cleared / games, turnsPerGame: turns / games, turnsPerPlayer: turns / games / players, elimsPerGame: elims / games, winnerHits: hitsWinner / games, hardWins: levels.length > 1 ? bestSkillWins / games : undefined };
}
const countCache = new WeakMap<object, Uint8Array>();
function countAt(s: { size: number; mines: number[] }, i: number): number {
  let c = countCache.get(s.mines);
  if (!c) {
    c = new Uint8Array(s.size * s.size);
    const ms = new Set(s.mines);
    for (let k = 0; k < c.length; k++) {
      const r = Math.floor(k / s.size), q = k % s.size;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
        if (!dr && !dq) continue;
        const rr = r + dr, qq = q + dq;
        if (rr >= 0 && qq >= 0 && rr < s.size && qq < s.size && ms.has(rr * s.size + qq)) n++;
      }
      c[k] = n;
    }
    countCache.set(s.mines, c);
  }
  return c[i];
}

if (process.argv[1]?.includes('balance.sim')) {
  const N = Number(process.argv[2] ?? 300);
  for (const mode of (process.argv[3] ?? 'classic').split(',') as ArenaMode[])
    for (const id of TIER_ORDER)
      for (const cap of [2, 3, 4]) {
        const b = typeof boardFor === 'function' ? boardFor(TIERS[id], cap) : { size: TIERS[id].board, mines: TIERS[id].mines };
        const r = simulate(mode, b.size, b.mines, cap, N, cap === 2 ? ['easy', 'hard'] : cap === 3 ? ['easy', 'medium', 'hard'] : ['easy', 'medium', 'medium', 'hard']);
        console.log(mode.padEnd(8), id.padEnd(8), cap, `${b.size}x${b.size}/${b.mines}`.padEnd(9), Object.entries(r).map(([k, v]) => `${k}=${v === undefined ? '-' : (v as number).toFixed(2)}`).join(' '));
      }
}
