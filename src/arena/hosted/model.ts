import type { TableOptions } from '../tableOptions';
import type { ArenaState } from '../mines';
import type { ArenaMode } from '../modes';
import type { TierId } from '../economy';
import type { MoveOutcome } from '../mines';
import type { ResultRow } from '../protocol';

/** Test sunucusundaki belge biçimleri. */

export interface SeatDoc {
  seat: number;
  uid: string;
  bot: boolean;
  name: string;
  avatar: number;
  level: number;
  /** Bekleme odasında hazır (botlar her zaman). */
  ready?: boolean;
}

export interface MatchDoc {
  id: string;
  /** ArenaState; mayın ve sandık konumları ayrı ve karıştırılmış tutulur (`hid`). */
  s: Omit<ArenaState, 'mines' | 'chests' | 'bonuses'>;
  /** Botun seçtiği (henüz açmadığı) kare ve hamlesi. */
  aim?: { seat: number; index: number; turnNo: number; action: 'open' | 'defuse'; at: number } | null;
  hid: string;
  pool: number;
  humans: number;
  startedAt: number;
  turnEndsAt: number | null;
  lastAt: number;
  seq: number;
  lastMove: MoveOutcome | null;
  results: ResultRow[] | null;
}

export interface TableDoc {
  id: string;
  name: string;
  tier: TierId;
  mode: ArenaMode;
  boardSize: number;
  mineCount: number;
  entryFee: number;
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  pw: string | null;
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
  countdownEndsAt: number | null;
  seats: SeatDoc[];
  match: MatchDoc | null;
  /** Arkadaş odası: 4 haneli katılma kodu; özel odalar lobide listelenmez. */
  code?: string;
  private?: boolean;
  /** Masa sahibinin seçtiği kurallar (tur süresi, can, yoğunluk, sonar, kalkan). */
  options?: TableOptions;
}

export interface RecentDoc {
  match_id: string;
  final_rank: number;
  prize: number;
  points_delta: number;
  mines_triggered: number;
  turn_count: number;
  finished_at: number;
  tier: TierId;
  table_name: string;
  players: number;
  mode: ArenaMode;
  /** Rakip kimlikleri (aynı grup puan azaltması için). */
  group: string;
}

export interface TxDoc {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  created_at: number;
}

export interface PlayerDoc {
  name: string;
  avatar: number;
  balance: number;
  xp: number;
  wins: number;
  losses: number;
  games: number;
  best: number | null;
  week: string;
  wPoints: number;
  wWins: number;
  wGames: number;
  wCoins: number;
  lastDaily: string | null;
  streak: number;
  lastRescue: string | null;
  seatAt: string | null;
  /** Elendikten sonra ayrıldığım, sonucu henüz kesinleşmemiş masalar. */
  pending?: string[];
  settled: string[];
  recent: RecentDoc[];
  tx: TxDoc[];
  createdAt: number;
  /** Görev ödülü / mağaza alımı gibi tek seferlik işlemlerin anahtarları (aynı işlem iki kez uygulanmaz). */
  claims?: string[];
  /** Mağazadan alınan kozmetikler. */
  owned?: string[];
}

/** Mayın/sandık konumlarını belgede düz liste olarak tutmamak için basit karıştırma (gizlilik değil, kazara görmeyi önler). */
export function packHidden(tableId: string, mines: number[], chests: number[], bonuses: ArenaState['bonuses'] = []): string {
  const raw = JSON.stringify([mines, chests, bonuses]);
  let out = '';
  for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw.charCodeAt(i) ^ tableId.charCodeAt(i % tableId.length) ^ 0x5a);
  return btoa(out);
}
export function unpackHidden(tableId: string, hid: string): { mines: number[]; chests: number[]; bonuses: ArenaState['bonuses'] } {
  const bin = atob(hid);
  let raw = '';
  for (let i = 0; i < bin.length; i++) raw += String.fromCharCode(bin.charCodeAt(i) ^ tableId.charCodeAt(i % tableId.length) ^ 0x5a);
  const [mines, chests, bonuses] = JSON.parse(raw) as [number[], number[], ArenaState['bonuses'] | undefined];
  return { mines, chests, bonuses: bonuses ?? [] };
}
export function stateOf(t: TableDoc): ArenaState {
  const m = t.match!;
  const { mines, chests, bonuses } = unpackHidden(t.id, m.hid);
  const base = structuredClone(m.s) as ArenaState;
  // eski kayıtlar: bonuslar durumun içinde düz tutulmuş olabilir
  return { ...base, mines, chests, bonuses: bonuses.length ? bonuses : (base.bonuses ?? []) };
}
export function storeState(t: TableDoc, s: ArenaState): void {
  const { mines: _m, chests: _c, bonuses: _b, ...rest } = s;
  void _m;
  void _c;
  void _b;
  t.match!.s = rest;
}
