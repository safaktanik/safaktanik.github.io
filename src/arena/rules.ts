import { ECONOMY } from './economy';
import type { Settings } from './mines';
import type { ArenaMode } from './modes';
import { turnSecondsFor } from './modes';
import { optionsOf } from './tableOptions';
import type { TableOptions } from './tableOptions';

/** Bütün arka uçların maç başlatırken kullandığı ortak kural ayarları (moda göre). */
export function matchSettings(mode: ArenaMode = 'classic', opts?: Partial<TableOptions> | null): Settings {
  const o = optionsOf(opts);
  const blitz = mode === 'blitz';
  // Yıldırım kendi kurallarını dayatır (2 can, sonar yok); kalkan masa ayarından.
  return { lives: blitz ? Math.min(2, o.lives) : o.lives, afkTurns: ECONOMY.afkEliminationTurns, island: ECONOMY.startIsland, shields: o.shields, sonars: blitz ? 0 : o.sonars, bonuses: o.bonuses, passes: o.passes, forces: mode === 'chain' ? 0 : o.forces };
}

/** Moda ve masa ayarına göre tur süresi (sn). Yıldırım her zaman en fazla 8 sn. */
export function turnSeconds(mode: ArenaMode = 'classic', opts?: Partial<TableOptions> | null): number {
  const base = opts ? optionsOf(opts).turnSeconds : ECONOMY.turnSeconds;
  return mode === 'blitz' ? Math.min(8, turnSecondsFor(mode, base)) : turnSecondsFor(mode, base);
}
