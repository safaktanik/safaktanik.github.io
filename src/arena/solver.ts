/**
 * Kesin çıkarım (eski İpucu feneri; şimdilik yalnızca testlerde ve araçlarda): yalnızca herkesin gördüğü bilgilerle (açık sayılar + patlamış/imha edilmiş mayınlar)
 * kesin çıkarım yapar. Gizli mayın bilgisini kullanmaz; bayrakları da kullanmaz (yanlış olabilirler).
 * Görünüm kodları: -1 gizli, 0–8 sayı, 9 patlamış mayın, 10 açılmamış mayın (bitişte), 11 imha edilmiş mayın.
 */
import { neighbors } from './mines';

export interface Deduction {
  /** Kesin güvenli gizli kareler. */
  safe: number[];
  /** Kesin mayınlı gizli kareler. */
  mines: number[];
}

interface Constraint {
  cells: number[];
  need: number;
}

/** extraMines: oyuncunun kendi kesin bildiği mayınlar (ör. sonarın gösterdikleri). */
export function deduce(cells: readonly number[], size: number, extraMines: Iterable<number> = []): Deduction {
  const mine = new Set<number>(extraMines);
  const safe = new Set<number>();
  for (let i = 0; i < cells.length; i++) if (cells[i] === 9 || cells[i] === 10 || cells[i] === 11 || cells[i] === 13) mine.add(i);
  const numbered: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 1 && cells[i] <= 8) numbered.push(i);

  const build = (): Constraint[] => {
    const out: Constraint[] = [];
    for (const i of numbered) {
      const unk: number[] = [];
      let known = 0;
      for (const n of neighbors(size, i)) {
        if (mine.has(n)) known++;
        else if (cells[n] === -1 && !safe.has(n)) unk.push(n);
      }
      if (unk.length) out.push({ cells: unk, need: cells[i] - known });
    }
    return out;
  };

  for (let round = 0; round < 50; round++) {
    let changed = false;
    const cs = build();
    for (const c of cs) {
      if (c.need === 0) for (const x of c.cells) if (!safe.has(x)) (safe.add(x), (changed = true));
      if (c.need === c.cells.length) for (const x of c.cells) if (!mine.has(x)) (mine.add(x), (changed = true));
    }
    if (changed) continue;
    // Alt küme kuralı: A ⊂ B ise B∖A içinde (needB − needA) mayın var.
    const sets = cs.map((c) => new Set(c.cells));
    outer: for (let a = 0; a < cs.length; a++) {
      for (let b = 0; b < cs.length; b++) {
        if (a === b || cs[a].cells.length >= cs[b].cells.length) continue;
        if (!cs[a].cells.every((x) => sets[b].has(x))) continue;
        const rest = cs[b].cells.filter((x) => !sets[a].has(x));
        const need = cs[b].need - cs[a].need;
        if (need === 0) for (const x of rest) if (!safe.has(x)) (safe.add(x), (changed = true));
        if (need === rest.length) for (const x of rest) if (!mine.has(x)) (mine.add(x), (changed = true));
        if (changed) break outer;
      }
    }
    if (!changed) break;
  }
  return {
    safe: [...safe].filter((i) => cells[i] === -1).sort((a, b) => a - b),
    mines: [...mine].filter((i) => cells[i] === -1).sort((a, b) => a - b),
  };
}
