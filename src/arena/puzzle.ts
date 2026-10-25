/**
 * Günün Bulmacası: herkese aynı (tarihten üretilen), tek kişilik, **tahmin gerektirmeyen** tahta.
 * Başlangıç adasından itibaren yalnızca kesin çıkarımla (solver.ts) sonuna kadar çözülebildiği doğrulanır.
 * Mayına basmak hata sayılır (3 hak); süre ve hata sayısı sonuçtur. Sunucusuz, bu cihazda saklanır.
 */
import { computeCounts, neighbors } from './mines';
import { deduce } from './solver';

export const PUZZLE = { size: 12, mines: 26, lives: 3, penaltyMs: 30_000 };

/** Gün anahtarı (Türkiye saatiyle): herkes gece yarısı aynı anda yeni bulmacaya geçer. */
export function puzzleDay(ms = Date.now()): string {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rngOf(seed: number) {
  let x = seed >>> 0 || 1;
  return (n: number) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return Math.floor((x / 2 ** 32) * n);
  };
}

export interface PuzzleBoard {
  day: string;
  size: number;
  mines: number[];
  /** Başlangıçta açık güvenli kareler (ortaya yakın boş alan ve kenarı). */
  start: number[];
}

/** Sıfırdan yayılan açılış (mayınsız). */
function flood(size: number, counts: Uint8Array, mineSet: Set<number>, from: number, open: Set<number>): void {
  const stack = [from];
  while (stack.length) {
    const c = stack.pop()!;
    if (open.has(c) || mineSet.has(c)) continue;
    open.add(c);
    if (counts[c] === 0) for (const n of neighbors(size, c)) if (!open.has(n)) stack.push(n);
  }
}

function viewOf(size: number, counts: Uint8Array, open: Set<number>, boom: Set<number> = new Set()): number[] {
  return Array.from({ length: size * size }, (_, i) => (boom.has(i) ? 9 : open.has(i) ? counts[i] : -1));
}

/** Yalnızca kesin çıkarımla sonuna kadar çözülebiliyor mu? */
export function solvable(size: number, mines: number[], start: number[]): boolean {
  const mineSet = new Set(mines);
  const counts = computeCounts(size, mines);
  const open = new Set<number>();
  for (const s of start) flood(size, counts, mineSet, s, open);
  const goal = size * size - mines.length;
  for (let guard = 0; guard < size * size && open.size < goal; guard++) {
    const d = deduce(viewOf(size, counts, open), size);
    if (!d.safe.length) return false;
    for (const i of d.safe) flood(size, counts, mineSet, i, open);
  }
  return open.size === goal;
}

/** Günün tahtası: aynı gün herkese aynı; tahminsiz çözülebilene kadar deterministik olarak yeniden üretilir. */
export function puzzleFor(day: string): PuzzleBoard {
  const { size, mines: n } = PUZZLE;
  const mid = (size - 1) / 2;
  for (let k = 0; k < 500; k++) {
    const rng = rngOf(hash(`${day}#${k}`));
    const idx = Array.from({ length: size * size }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const j = i + rng(idx.length - i);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const mines = idx.slice(0, n).sort((a, b) => a - b);
    const mineSet = new Set(mines);
    const counts = computeCounts(size, mines);
    // ortaya en yakın sıfır kare başlangıç olur
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < size * size; i++) {
      if (mineSet.has(i) || counts[i] !== 0) continue;
      const d = Math.hypot(Math.floor(i / size) - mid, (i % size) - mid);
      if (d < bestD) (best = i), (bestD = d);
    }
    if (best < 0) continue;
    const open = new Set<number>();
    flood(size, counts, mineSet, best, open);
    // çok küçük ya da çok büyük açılış sıkıcı: tahtanın %6–25'i
    if (open.size < size * size * 0.06 || open.size > size * size * 0.25) continue;
    if (solvable(size, mines, [best])) return { day, size, mines, start: [best] };
  }
  throw new Error('bulmaca üretilemedi');
}

/** Oynanan bulmaca (bu cihazda). */
export class PuzzleGame {
  readonly board: PuzzleBoard;
  private readonly counts: Uint8Array;
  private readonly mineSet: Set<number>;
  readonly open = new Set<number>();
  readonly boom = new Set<number>();
  lives = PUZZLE.lives;
  mistakes = 0;
  startedAt: number | null = null;
  finishedAt: number | null = null;
  phase: 'playing' | 'won' | 'lost' = 'playing';

  constructor(board: PuzzleBoard) {
    this.board = board;
    this.counts = computeCounts(board.size, board.mines);
    this.mineSet = new Set(board.mines);
    for (const s of board.start) flood(board.size, this.counts, this.mineSet, s, this.open);
  }

  get goal(): number {
    return this.board.size * this.board.size - this.board.mines.length;
  }

  view(): number[] {
    const v = viewOf(this.board.size, this.counts, this.open, this.boom);
    if (this.phase !== 'playing') for (const m of this.board.mines) if (!this.boom.has(m)) v[m] = 10;
    return v;
  }

  /** Kare aç: mayınsa hata (+ ceza süresi), değilse yayılarak açılır. */
  reveal(i: number, now = Date.now()): 'safe' | 'mine' | 'ignored' {
    if (this.phase !== 'playing' || this.open.has(i) || this.boom.has(i)) return 'ignored';
    this.startedAt ??= now;
    if (this.mineSet.has(i)) {
      this.boom.add(i);
      this.mistakes++;
      this.lives--;
      if (this.lives <= 0) {
        this.phase = 'lost';
        this.finishedAt = now;
      }
      return 'mine';
    }
    flood(this.board.size, this.counts, this.mineSet, i, this.open);
    if (this.open.size >= this.goal) {
      this.phase = 'won';
      this.finishedAt = now;
    }
    return 'safe';
  }

  /** Sonuç süresi: geçen süre + her hata için ceza. */
  elapsedMs(now = Date.now()): number {
    if (this.startedAt === null) return 0;
    return (this.finishedAt ?? now) - this.startedAt + this.mistakes * PUZZLE.penaltyMs;
  }
}

/** Bu cihazdaki bulmaca geçmişi. */
export interface PuzzleRecord {
  day: string;
  won: boolean;
  timeMs: number;
  mistakes: number;
}
const KEY = 'md2:puzzle';

export function loadPuzzleHistory(): PuzzleRecord[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as PuzzleRecord[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Günün ilk sonucu kaydedilir (tekrar oynamak sonucu değiştirmez). */
export function savePuzzleResult(r: PuzzleRecord): PuzzleRecord[] {
  const all = loadPuzzleHistory();
  if (all.some((x) => x.day === r.day)) return all;
  const next = [r, ...all].slice(0, 120);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* yok say */
  }
  return next;
}

/** Üst üste çözülen gün sayısı (bugün ya da dün biten seriden geriye). */
export function puzzleStreak(history: PuzzleRecord[], today: string): number {
  const won = new Set(history.filter((r) => r.won).map((r) => r.day));
  const dayMs = 86_400_000;
  let d = Date.parse(today + 'T00:00:00Z');
  if (!won.has(today)) d -= dayMs;
  let n = 0;
  while (won.has(new Date(d).toISOString().slice(0, 10))) {
    n++;
    d -= dayMs;
  }
  return n;
}

/** Paylaşım metni (sonucu bozmadan: tahtayı göstermez). */
export function puzzleShareText(r: PuzzleRecord, streak: number): string {
  const t = Math.round(r.timeMs / 1000);
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const hearts = '❤️'.repeat(Math.max(0, PUZZLE.lives - r.mistakes)) + '🖤'.repeat(Math.min(PUZZLE.lives, r.mistakes));
  const [y, m, d] = r.day.split('-');
  return r.won
    ? `💣 Mine Duel · Günün Bulmacası ${d}.${m}.${y}\n⏱ ${clock} · ${hearts}${streak > 1 ? ` · 🔥 ${streak} gün` : ''}`
    : `💣 Mine Duel · Günün Bulmacası ${d}.${m}.${y}\n💥 Bu sefer mayınlar kazandı`;
}
