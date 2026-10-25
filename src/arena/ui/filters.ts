import type { TableView } from '../protocol';
import type { TierId } from '../economy';
import type { ArenaMode } from '../modes';

export interface Filters {
  mode: ArenaMode | 'all';
  tier: TierId | 'all';
  maxFee: number | null;
  capacity: 3 | 4 | null;
  minFree: number;
  board: 'all' | 'small' | 'medium' | 'large';
  status: 'open' | 'playing' | 'all';
}
export const DEFAULT_FILTERS: Filters = { mode: 'all', tier: 'all', maxFee: null, capacity: null, minFree: 0, board: 'all', status: 'all' };

const KEY = 'mine-duel:arena:filters';
export function loadFilters(): Filters {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? { ...DEFAULT_FILTERS, ...v } : { ...DEFAULT_FILTERS };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}
export function saveFilters(f: Filters): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* yok say */
  }
}

export function boardClass(size: number): 'small' | 'medium' | 'large' {
  return size <= 15 ? 'small' : size <= 22 ? 'medium' : 'large';
}

/** Masa listesini filtreler (saf işlev; test edilir). */
export function applyFilters(tables: TableView[], f: Filters): TableView[] {
  return tables.filter((t) => {
    const open = t.status === 'waiting' || t.status === 'countdown';
    if (f.status === 'open' && !open) return false;
    if (f.status === 'playing' && t.status !== 'playing') return false;
    if (f.tier !== 'all' && t.tier !== f.tier) return false;
    if (f.mode && f.mode !== 'all' && t.mode !== f.mode) return false;
    if (f.maxFee !== null && t.entryFee > f.maxFee) return false;
    if (f.capacity !== null && t.maxPlayers !== f.capacity) return false;
    if (f.minFree > 0 && t.maxPlayers - t.players.length < f.minFree) return false;
    if (f.board !== 'all' && boardClass(t.boardSize) !== f.board) return false;
    return true;
  });
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.maxFee !== null) n++;
  if (f.capacity !== null) n++;
  if (f.minFree > 0) n++;
  if (f.board !== 'all') n++;
  if (f.status !== 'open') n++;
  if (f.mode && f.mode !== 'all') n++;
  return n;
}
