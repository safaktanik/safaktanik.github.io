import { TIERS, boardFor } from './economy';
import type { Tier } from './economy';

/** Masa sahibinin kişiselleştirebildiği kurallar (masa açarken seçilir, maç boyunca sabittir). */
export type Density = 'easy' | 'normal' | 'hard';
export interface TableOptions {
  /** Tur süresi (sn). */
  turnSeconds: number;
  /** Başlangıç canı. */
  lives: number;
  /** Mayın yoğunluğu. */
  density: Density;
  /** Oyuncu başına sonar hakkı. */
  sonars: number;
  /** Oyuncu başına kalkan. */
  shields: number;
  /** Tahtada bonus kutuları (+kalkan, +sonar, +can, ekstra tur). */
  bonuses: boolean;
  /** Güç kuralları: oyuncu başına Duman ve Zaman Dondurma hakkı. */
  smokes: number;
  freezes: number;
}

export const DEFAULT_OPTIONS: TableOptions = { turnSeconds: 20, lives: 3, density: 'normal', sonars: 1, shields: 1, bonuses: true, smokes: 1, freezes: 1 };

export const OPTION_CHOICES = {
  turnSeconds: [10, 15, 20, 30, 45],
  lives: [1, 2, 3, 4, 5],
  density: ['easy', 'normal', 'hard'] as Density[],
  sonars: [0, 1, 2, 3],
  shields: [0, 1, 2],
  smokes: [0, 1, 2],
  freezes: [0, 1, 2],
};

export const DENSITY: Record<Density, { label: string; factor: number }> = {
  easy: { label: 'Az mayın', factor: 0.8 },
  normal: { label: 'Normal', factor: 1 },
  hard: { label: 'Çok mayın', factor: 1.25 },
};

/** Kısmi/bilinmeyen girdiden geçerli seçenekler; geçersiz bir değer varsa null. */
export function parseOptions(v: unknown): TableOptions | null {
  if (v === undefined || v === null) return { ...DEFAULT_OPTIONS };
  if (typeof v !== 'object') return null;
  const o = { ...DEFAULT_OPTIONS, ...(v as Partial<TableOptions>) };
  if (!OPTION_CHOICES.turnSeconds.includes(o.turnSeconds)) return null;
  if (!OPTION_CHOICES.lives.includes(o.lives)) return null;
  if (!OPTION_CHOICES.density.includes(o.density)) return null;
  if (!OPTION_CHOICES.sonars.includes(o.sonars)) return null;
  if (!OPTION_CHOICES.shields.includes(o.shields)) return null;
  if (typeof o.bonuses !== 'boolean') return null;
  if (!OPTION_CHOICES.smokes.includes(o.smokes)) return null;
  if (!OPTION_CHOICES.freezes.includes(o.freezes)) return null;
  return { turnSeconds: o.turnSeconds, lives: o.lives, density: o.density, sonars: o.sonars, shields: o.shields, bonuses: o.bonuses, smokes: o.smokes, freezes: o.freezes };
}

/** Kayıtlı (eski kayıtlarda eksik olabilen) seçenekler. */
export function optionsOf(v: unknown): TableOptions {
  return parseOptions(v) ?? { ...DEFAULT_OPTIONS };
}

/** Tahta boyu + yoğunluk → mayın sayısı (tier'ın temel yoğunluğuna göre). */
export function minesFor(tier: Tier | keyof typeof TIERS, board: number, density: Density = 'normal'): number {
  const t = typeof tier === 'string' ? TIERS[tier] : tier;
  const base = t.mines / (t.board * t.board);
  const raw = Math.round(base * DENSITY[density].factor * board * board);
  return Math.max(4, Math.min(Math.floor(board * board * 0.3), raw));
}

/** Masa için mayın sayısı: tahta bu oyuncu sayısının önerilen boyundaysa ayarlı (simülasyonla dengelenmiş) değer. */
export function minesForTable(tier: Tier | keyof typeof TIERS, board: number, players: number, density: Density = 'normal'): number {
  const t = typeof tier === 'string' ? TIERS[tier] : tier;
  const rec = boardFor(t, players);
  if (board !== rec.size) return minesFor(t, board, density);
  return Math.max(4, Math.min(Math.floor(board * board * 0.3), Math.round(rec.mines * DENSITY[density].factor)));
}
