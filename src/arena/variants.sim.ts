/**
 * Son Kalan / Yıldırım denge karşılaştırması (geliştirme aracı, oyuna dahil değil).
 * Sorun: kusursuz mantıkla oynayan herkes tahmin yapmadan bitirebiliyor; maç "0 mayın" eşitliğiyle bitiyor.
 * Varyantlar: mevcut kurallar, daha yoğun mayın, tur sınırı, komşu kare (zincir) kuralı.
 * Çalıştır: npx tsx src/arena/variants.sim.ts [maçSayısı=300]
 */
import { createArena, reveal, rankedSeats } from './mines';
import type { ArenaMode, ArenaState } from './mines';
import { analyze, chooseBotMove } from './bot';
import type { BotLevel } from './bot';
import { matchSettings } from './rules';
import { TIERS, boardFor } from './economy';
import type { TierId } from './economy';
import { SHRINK } from './modes';

type Player = 'expert' | BotLevel;
interface Variant {
  id: string;
  label: string;
  mode: ArenaMode;
  density: number;
  /** Oyuncu başına en çok hamle (0 = sınırsız). */
  movesPerPlayer: number;
  lives?: number;
  /** Daralan Tahta ayarı (SHRINK'in üzerine, yalnızca bu varyant için). */
  shrink?: Partial<typeof SHRINK>;
}

const VARIANTS: Variant[] = [
  { id: 'base', label: 'Mevcut', mode: 'classic', density: 1, movesPerPlayer: 0 },
  { id: 'd125', label: 'Yoğun ×1,25', mode: 'classic', density: 1.25, movesPerPlayer: 0 },
  { id: 'd150', label: 'Yoğun ×1,5', mode: 'classic', density: 1.5, movesPerPlayer: 0 },
  { id: 'cap8', label: 'Tur sınırı (8 hamle)', mode: 'classic', density: 1, movesPerPlayer: 8 },
  { id: 'chain', label: 'Komşu kare kuralı', mode: 'chain', density: 1, movesPerPlayer: 0 },
  { id: 'blitz', label: 'Yıldırım (2 can)', mode: 'blitz', density: 1, movesPerPlayer: 0 },
  { id: 'blitzD', label: 'Yıldırım + yoğun ×1,25', mode: 'blitz', density: 1.25, movesPerPlayer: 0 },
  { id: 'blitzC', label: 'Yıldırım + komşu kare', mode: 'chain', density: 1, movesPerPlayer: 0, lives: 2 },
  { id: 'shrink', label: 'Daralan Tahta', mode: 'shrink', density: 1, movesPerPlayer: 0 },
  { id: 'shrinkD', label: 'Daralan Tahta ×1,25', mode: 'shrink', density: 1.25, movesPerPlayer: 0 },
  { id: 'sA', label: 'DT ×1,5', mode: 'shrink', density: 1.5, movesPerPlayer: 0 },
  { id: 'sB', label: 'DT ×1,5 · 2 can', mode: 'shrink', density: 1.5, movesPerPlayer: 0, lives: 2 },
  { id: 'sC', label: 'DT ×1,25 · 2 can · fırt.2', mode: 'shrink', density: 1.25, movesPerPlayer: 0, lives: 2, shrink: { stormRounds: 2, calmRounds: 1 } },
  { id: 'sD', label: 'DT ×1,5 · fırt.2 · sakin 1', mode: 'shrink', density: 1.5, movesPerPlayer: 0, shrink: { stormRounds: 2, calmRounds: 1 } },
  { id: 'sE', label: 'DT ×1,5 · 2 can · fırt.2', mode: 'shrink', density: 1.5, movesPerPlayer: 0, lives: 2, shrink: { stormRounds: 2, calmRounds: 1 } },
];

const TABLES: { tier: TierId; cap: 2 | 3 | 4 }[] = [
  { tier: 'bronze', cap: 3 },
  { tier: 'silver', cap: 3 },
  { tier: 'gold', cap: 4 },
  { tier: 'diamond', cap: 4 },
];

export function rngOf(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function viewOf(s: ArenaState, counts: Uint8Array): number[] {
  // 4 = kapanmış kare (Daralan Tahta): mayınsa 13, değilse 12
  const mines = s.cells.includes(4) ? new Set(s.mines) : null;
  return s.cells.map((c, i) => (c === 0 ? -1 : c === 1 ? counts[i] : c === 2 ? 9 : c === 3 ? 11 : mines!.has(i) ? 13 : 12));
}

export function countsOf(s: ArenaState): Uint8Array {
  const c = new Uint8Array(s.size * s.size);
  const ms = new Set(s.mines);
  for (let k = 0; k < c.length; k++) {
    const r = Math.floor(k / s.size), q = k % s.size;
    for (let dr = -1; dr <= 1; dr++)
      for (let dq = -1; dq <= 1; dq++) {
        const rr = r + dr, qq = q + dq;
        if ((dr || dq) && rr >= 0 && qq >= 0 && rr < s.size && qq < s.size && ms.has(rr * s.size + qq)) c[k]++;
      }
  }
  return c;
}

/** Uzman: kesin güvenli kareyi hep görür; yoksa en düşük riskli kareyi seçer (tahmin). */
function expertMove(view: number[], s: ArenaState, r: () => number): { index: number; guess: boolean } {
  const a = analyze(view, s.size, s.mineCount);
  const allow = s.allowed && s.allowed.length ? new Set(s.allowed) : null;
  const safe = allow ? a.safe.filter((i) => allow.has(i)) : a.safe;
  if (safe.length) return { index: safe[Math.floor(r() * safe.length)], guess: false };
  const hidden = allow ? [...allow].filter((i) => view[i] === -1) : a.hidden;
  const pool = hidden.filter((i) => !a.mines.has(i));
  const cands = pool.length ? pool : hidden.length ? hidden : view.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
  let best = Infinity;
  for (const i of cands) best = Math.min(best, a.risk.get(i) ?? 1);
  const top = cands.filter((i) => (a.risk.get(i) ?? 1) <= best + 1e-9);
  return { index: top[Math.floor(r() * top.length)], guess: true };
}

interface Stats {
  games: number;
  tieDecided: number;
  zeroMineFinish: number;
  guesses: number;
  hits: number;
  elims: number;
  lastStanding: number;
  moves: number;
  skillWins: number;
}

function run(v: Variant, tier: TierId, cap: number, games: number, lineup: Player[], seed: number): Stats {
  const saved = { ...SHRINK };
  Object.assign(SHRINK, v.shrink ?? {});
  try {
    return runInner(v, tier, cap, games, lineup, seed);
  } finally {
    Object.assign(SHRINK, saved);
  }
}

function runInner(v: Variant, tier: TierId, cap: number, games: number, lineup: Player[], seed: number): Stats {
  const b = boardFor(TIERS[tier], cap);
  const mines = Math.min(Math.floor(b.size * b.size * 0.3), Math.round(b.mines * v.density));
  const st: Stats = { games, tieDecided: 0, zeroMineFinish: 0, guesses: 0, hits: 0, elims: 0, lastStanding: 0, moves: 0, skillWins: 0 };
  for (let g = 0; g < games; g++) {
    const r = rngOf(seed + g * 7919 + cap * 31 + b.size);
    const settings = matchSettings(v.mode === 'chain' ? 'classic' : v.mode);
    if (v.lives) settings.lives = v.lives;
    const s = createArena(b.size, mines, lineup.map((_, i) => `p${i}`), (n) => Math.floor(r() * n), settings, v.mode);
    // koltuk sırası her maç kaydırılır: ilk hamle avantajı tek oyuncuya yazılmasın
    const shift = g % cap;
    const who = (seat: number) => lineup[(seat + shift) % cap];
    const counts = countsOf(s);
    let moves = 0;
    const limit = v.movesPerPlayer ? v.movesPerPlayer * cap : Infinity;
    while (s.phase === 'playing' && moves < limit && moves < 5000) {
      const view = viewOf(s, counts);
      const p = who(s.current);
      if (p === 'expert') {
        const m = expertMove(view, s, r);
        if (m.guess) st.guesses++;
        reveal(s, s.current, m.index);
      } else {
        const m = chooseBotMove(view, s.size, s.mineCount, p, r, s.allowed, v.mode);
        reveal(s, s.current, m.index, m.action === 'defuse' ? 'open' : m.action);
      }
      moves++;
    }
    st.moves += moves / cap;
    const order = rankedSeats(s);
    const alive = s.players.filter((p) => !p.eliminated);
    if (alive.length <= 1) st.lastStanding++;
    else {
      const [a, c] = order.map((seat) => s.players[seat]);
      if (!a.eliminated && !c.eliminated && a.mineHits === c.mineHits) st.tieDecided++;
      if (alive.every((p) => p.mineHits === 0)) st.zeroMineFinish++;
    }
    st.hits += s.players.reduce((n, p) => n + p.mineHits, 0);
    st.elims += s.players.filter((p) => p.eliminated).length;
    if (who(order[0]) === 'expert' && lineup.filter((x) => x === 'expert').length === 1) st.skillWins++;
  }
  return st;
}

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`.padStart(4);

if (process.argv[1]?.includes('variants.sim')) {
  const N = Number(process.argv[2] ?? 300);
  console.log('A) 4 uzman (kusursuz mantık) karşı karşıya: tahmin zorunlu mu, maçı ne belirliyor?');
  console.log('B) 1 uzman + orta botlar: beceri kazandırıyor mu? (şans payı 1/oyuncu)\n');
  for (const t of TABLES) {
    const b = boardFor(TIERS[t.tier], t.cap);
    console.log(`== ${TIERS[t.tier].label} · ${t.cap} kişi · ${b.size}×${b.size} (mevcut ${b.mines} mayın)`);
    console.log('varyant                    | eşitlikle | 0 mayın | tahmin/maç | mayın/maç | eleme/maç | son kalan | hamle/oyuncu || uzman kazanır (şans)');
    // 3. argüman: yalnızca bu varyantlar (virgülle, ör. base,d150,shrink)
    const only = process.argv[3]?.split(',');
    for (const v of VARIANTS.filter((x) => !only || only.includes(x.id))) {
      const A = run(v, t.tier, t.cap, N, Array(t.cap).fill('expert'), 1);
      const B = run(v, t.tier, t.cap, N, ['expert', ...Array(t.cap - 1).fill('medium')], 2);
      console.log(
        [
          v.label.padEnd(26),
          pct(A.tieDecided, N).padStart(9),
          pct(A.zeroMineFinish, N).padStart(7),
          (A.guesses / N).toFixed(1).padStart(10),
          (A.hits / N).toFixed(1).padStart(9),
          (A.elims / N).toFixed(2).padStart(9),
          pct(A.lastStanding, N).padStart(9),
          (A.moves / N).toFixed(1).padStart(12),
        ].join(' | ') + ` || ${pct(B.skillWins, N)} (${pct(1, t.cap)})`,
      );
    }
    console.log('');
  }
}
