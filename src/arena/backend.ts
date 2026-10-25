import type { ArenaSnapshot } from './client';
import type { ArenaRequest } from './client';
import type { TierId } from './economy';
import type { ReactionEvent } from './protocol';

export type ReactionListener = (e: ReactionEvent & { matchId: string }) => void;

/** Masa sistemi arayüzünün konuştuğu arka uç: gerçek oyun sunucusu (Node) ya da test sunucusu (paylaşılan veritabanı). */

export interface LeaderRow {
  rank: number;
  userId: string;
  username: string;
  avatar: number;
  level: number;
  points: number;
  wins: number;
  games: number;
  winRate: number;
  coinsWon: number;
}
export interface LeaderboardData {
  week: string;
  list: LeaderRow[];
  me: LeaderRow | null;
  prizes: number[];
  endsInMs: number;
  serverNow: number;
}
export interface MatchRow {
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
  mode?: string;
}
export interface TxRow {
  id: number | string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  created_at: number;
}

export interface ArenaBackend {
  kind: 'server' | 'hosted';
  /** Arayüzde gösterilen ad: "Oyun sunucusu" / "Test sunucusu". */
  label: string;
  /** Çevrimdışı masalar (bu cihazda, botlara karşı). */
  local?: boolean;
  /** Arkadaş odası (eşler arası). */
  p2p?: boolean;
  readonly state: ArenaSnapshot;
  subscribe(fn: (s: ArenaSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  request<T = unknown>(m: ArenaRequest): Promise<T>;
  watchLobby(on: boolean): void;
  clearMatch(): void;
  /** Maçtan çık (elenmediysen hükmen elenirsin); maçın bitmesi beklenmez, sonuç arka planda kesinleşir. */
  leaveMatch(): Promise<void>;
  /** Emoji atışması. */
  react(matchId: string, emoji: string): void;
  onReact(fn: ReactionListener): () => void;
  serverNow(): number;
  refreshMe(): Promise<unknown>;

  // hesap (yalnızca oyun sunucusunda)
  guest(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, username?: string): Promise<void>;
  upgrade(email: string, password: string, username?: string): Promise<void>;
  logout(): Promise<void>;

  // veriler
  leaderboard(): Promise<LeaderboardData>;
  recentMatches(): Promise<MatchRow[]>;
  transactions(): Promise<TxRow[]>;
  updateProfile(p: { username?: string; avatar?: number }): Promise<void>;
  claimDaily(): Promise<{ amount: number }>;
  claimRescue(): Promise<{ amount: number }>;

  /** Test sunucusunda: boş koltuğa bot oturt / kaldır (yalnızca masa sahibi). */
  addBot?(tableId: string): Promise<void>;
  /** Test sunucusunda: arkadaş odasına 4 haneli kodla katıl. */
  joinByCode?(code: string): Promise<unknown>;
  removeBot?(tableId: string): Promise<void>;
}

let current: ArenaBackend | null = null;
export function setBackend(b: ArenaBackend): void {
  if (current && current !== b) current.stop();
  current = b;
}
export function arenaClient(): ArenaBackend {
  if (!current) throw new Error('arka uç seçilmedi');
  return current;
}
export function hasBackend(): boolean {
  return current !== null;
}
