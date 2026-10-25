import { ECONOMY, levelFromXp } from './economy';
import type { TierId } from './economy';
import type { ElimReason } from './mines';

export interface ScoreInput {
  capacity: number;
  tier: TierId;
  /** 1 = kazanan. */
  rank: number;
  safeOpened: number;
  /** Mayın Avcısı / Hazine Avı katkısı: imha edilen mayın ve bulunan sandık (etkinlik sayılır). */
  defused?: number;
  chests?: number;
  eliminationReason: ElimReason | null;
  /** Rakiplerin tamamı süre aşımı/ayrılma ile mi düştü (kimse mayına basmadan "kazanılan" maç)? */
  opponentsAllWalkedAway: boolean;
  /** Bu hafta aynı oyuncu kümesiyle bitmiş maç sayısı (bu maç hariç). */
  sameGroupMatchesThisWeek: number;
}

/** Haftalık sıralama puan farkı. Kötüye kullanım kontrolleri burada toplanır. */
export function weeklyPointsDelta(i: ScoreInput): number {
  const table = ECONOMY.points.byCapacity[i.capacity] ?? ECONOMY.points.byCapacity[3];
  let base = table[Math.min(i.rank, table.length) - 1];
  // Masadan kaçma / uzakta kalma: her zaman erken eleme cezası.
  if (i.eliminationReason === 'afk' || i.eliminationReason === 'left') base = Math.min(base, table[table.length - 1], -5);
  // Maç sonuna kadar ayakta kalan (elenmeyen) oyuncu asla puan kaybetmez: eksi puan yalnızca elenene.
  else if (i.eliminationReason === null && base < 0) base = 0;
  if (base > 0) {
    // Hiç oynamadan kazanmayı önler; imha edilen mayın ve bulunan sandık da etkinlik sayılır.
    const activity = i.safeOpened + 3 * (i.defused ?? 0) + 2 * (i.chests ?? 0);
    if (activity < ECONOMY.points.minSafeOpensForPositive) return 0;
    if (i.opponentsAllWalkedAway) return 0;
    if (i.sameGroupMatchesThisWeek >= ECONOMY.points.sameGroupZeroAfter) return 0;
    let v = base * ECONOMY.points.tierMultiplier[i.tier];
    if (i.sameGroupMatchesThisWeek >= ECONOMY.points.sameGroupHalfAfter) v *= 0.5;
    return Math.round(v);
  }
  return base === 0 ? 0 : Math.round(base);
}

export function xpGain(opts: { won: boolean; safeOpened: number }): number {
  return ECONOMY.xp.participation + (opts.won ? ECONOMY.xp.win : 0) + Math.min(ECONOMY.xp.safeCellCap, opts.safeOpened * ECONOMY.xp.perSafeCell);
}

export { levelFromXp };
