import type { TableOptions } from './tableOptions';
import type { TierId } from './economy';
import type { BonusKind, ElimReason, EndReason, MoveOutcome, PowerKind } from './mines';
import type { ArenaMode } from './modes';
import { isMode } from './modes';

export type { ArenaMode };

/** Masa / maç / kuyruk görünümleri: sunucu → istemci. Mayın konumları maç bitmeden hiçbir görünümde yoktur. */

/** Oyuncunun kendi hesabı (bakiye dahil) — her zaman sunucudan okunur. */
export interface PublicUser {
  id: string;
  username: string;
  avatar: number;
  level: number;
}

export interface Me extends PublicUser {
  accountType: 'guest' | 'member';
  email: string | null;
  xp: number;
  xpLevelStart: number;
  xpNext: number;
  balance: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winRate: number;
  weeklyPoints: number;
  weeklyRank: number | null;
  bestRank: number | null;
  dailyAvailable: boolean;
  dailyAmount: number;
  streak: number;
  rescueAvailable: boolean;
  rescueAmount: number;
}

export interface PlayerSeatView {
  userId: string;
  username: string;
  avatar: number;
  level: number;
  seat: number;
  /** Bekleme odasında "Hazırım" dedi mi (botlar her zaman hazır). */
  ready?: boolean;
  bot?: boolean;
}

export interface TableView {
  id: string;
  name: string;
  /** Arkadaş odası katılma kodu (yalnızca test sunucusunda). */
  code?: string | null;
  private?: boolean;
  /** Masa kuralları (yoksa varsayılan). */
  options?: TableOptions;
  tier: TierId;
  mode: ArenaMode;
  boardSize: number;
  mineCount: number;
  entryFee: number;
  maxPlayers: number;
  players: PlayerSeatView[];
  status: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  locked: boolean;
  /** Şu an oturanların ödediği toplam. */
  prizePool: number;
  /** Masa dolunca oluşacak havuz. */
  maxPrizePool: number;
  houseFeePercent: number;
  countdownEndsAt: number | null;
  ownerId: string;
  matchId: string | null;
}

export interface MatchPlayerView extends PlayerSeatView {
  lives: number;
  eliminated: boolean;
  eliminationReason: ElimReason | null;
  moves: number;
  mineHits: number;
  safeOpened: number;
  territory: number;
  chests: number;
  shield: number;
  sonar: number;
  /** Mayın Avcısı: imha edilen mayın. */
  defused: number;
  /** Güç hakları (eski kayıtlarda yok olabilir). */
  smoke?: number;
  freeze?: number;
}

/** Emoji atışması: maçtaki herkese anlık iletilir, saklanmaz. */
export const EMOJIS = ['😂', '😎', '😱', '🔥', '💣', '🤯', '😈', '👏', '🙏', '😭', '🫡', '🤡', '🦈', '🐙', '💥', '🍀', '🫠', '🥶', '💀', '🎉'] as const;
/** Karakter çıkartmaları: gönderenin kendi karakteri, ifadesi ve kısa bir lafla ekranda belirir. */
export const STICKERS = ['st:laugh', 'st:taunt', 'st:cool', 'st:love', 'st:angry', 'st:shock', 'st:cry', 'st:win'] as const;
/** Varlık paketindeki çizimli emojiler. */
export const ART_EMOJIS = ['ex:laughing', 'ex:happy', 'ex:celebrating', 'ex:victory', 'ex:confident', 'ex:well_played', 'ex:good_luck', 'ex:rematch', 'ex:thinking', 'ex:suspicious', 'ex:confused', 'ex:surprised', 'ex:oops', 'ex:worried', 'ex:disappointed', 'ex:frustrated'] as const;
export const REACTIONS = [...ART_EMOJIS, ...EMOJIS, ...STICKERS] as const;
export type Reaction = (typeof REACTIONS)[number];
export function isReaction(v: unknown): v is Reaction {
  return typeof v === 'string' && (REACTIONS as readonly string[]).includes(v);
}
export interface ReactionEvent {
  id: string;
  seat: number;
  emoji: Reaction;
}

export interface ResultRow {
  userId: string;
  seat: number;
  rank: number;
  prize: number;
  pointsDelta: number;
  xp: number;
  moves: number;
  mineHits: number;
  safeOpened: number;
  territory: number;
  chests: number;
  defused?: number;
  eliminationReason: ElimReason | null;
}

export interface MatchView {
  id: string;
  tableId: string;
  tableName: string;
  tier: TierId;
  mode: ArenaMode;
  /** Kareyi açan koltuk; -1 gizli. */
  owners: number[];
  /** Bulunmuş sandık kareleri (Hazine Avı). */
  chestsFound: number[];
  /** Tüm sandıklar — yalnızca maç bitince. */
  chestsAll: number[] | null;
  chestTotal: number;
  /** Zincir: bu tur açılabilecek kareler. */
  allowed: number[] | null;
  /** Bulunan bonus kutuları (kim, ne buldu) ve maç bitince hepsi. */
  bonusFound?: { i: number; k: BonusKind; seat: number }[];
  bonusAll?: { i: number; k: BonusKind }[] | null;
  bonusTotal?: number;
  /** Duman: bu turda (`turnNo`) `by` dışındaki oyuncuların tahtası ilk 5 sn sisli. */
  smoke?: { by: number; turnNo: number } | null;
  /** Son kullanılan güç (animasyon); n her kullanımda artar. */
  lastPower?: { seat: number; kind: PowerKind; n: number; turnNo: number } | null;
  /** Botun (düşünürken) seçtiği kare: açmadan önce herkes görür. */
  aim?: { seat: number; index: number; turnNo: number } | null;
  size: number;
  mineCount: number;
  /** -1 gizli, 0–8 güvenli (komşu mayın sayısı), 9 patlamış mayın, 10 açılmamış mayın (yalnızca maç bitince). */
  cells: number[];
  players: MatchPlayerView[];
  viewerSeat: number | null;
  current: number;
  turnNo: number;
  turnEndsAt: number | null;
  serverNow: number;
  turnSeconds: number;
  phase: 'playing' | 'finished';
  winnerSeat: number | null;
  endReason: EndReason | null;
  prizePool: number;
  safeLeft: number;
  seq: number;
  lastMove: MoveOutcome | null;
  startedAt: number;
  results: ResultRow[] | null;
}

export interface QueueView {
  tier: TierId;
  mode: ArenaMode;
  entryFee: number;
  waitingPlayers: number;
  capacity: number;
  since: number;
}

// ----------------------------------------------------------------- WebSocket mesajları

export type ArenaClientMessage =
  | { t: 'auth'; token: string }
  | { t: 'lobby.sub' }
  | { t: 'lobby.unsub' }
  | { t: 'table.create'; rid: number; name?: string; tier: TierId; mode?: ArenaMode; boardSize?: number; entryFee?: number; capacity?: number; password?: string; private?: boolean; options?: Partial<TableOptions> }
  | { t: 'table.join'; rid: number; tableId: string; password?: string }
  | { t: 'table.leave'; rid: number }
  | { t: 'table.ready'; rid: number; ready: boolean }
  | { t: 'table.watch'; rid: number; tableId: string }
  | { t: 'quick.start'; rid: number; tier?: TierId | 'any'; maxFee?: number; mode?: ArenaMode }
  | { t: 'quick.cancel'; rid: number }
  | { t: 'move'; rid: number; matchId: string; index: number; action?: 'open' | 'defuse' }
  | { t: 'scan'; rid: number; matchId: string; index: number }
  | { t: 'power'; rid: number; matchId: string; kind: PowerKind }
  | { t: 'react'; matchId: string; emoji: Reaction }
  | { t: 'ping' };

export type ArenaServerMessage =
  | { t: 'ready'; userId: string }
  | { t: 'auth-failed' }
  | { t: 'ack'; rid: number; ok: true; data?: unknown }
  | { t: 'ack'; rid: number; ok: false; error: string }
  | { t: 'lobby'; tables: TableView[]; online: number }
  | { t: 'table'; table: TableView | null }
  | { t: 'match'; match: MatchView }
  | { t: 'queue'; queue: QueueView | null }
  | { t: 'me'; me: Me }
  | { t: 'react'; matchId: string; seat: number; emoji: Reaction; id: string }
  | { t: 'pong' }
  | { t: 'error'; error: string };

const MAX_RAW = 4096;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const TIERS_OK = ['bronze', 'silver', 'gold', 'diamond'];

/** İstemci mesajını doğrular; bilinmeyen alanları atar. Geçersizse null. */
export function parseArenaMessage(raw: unknown): ArenaClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_RAW) return null;
  let m: Record<string, unknown>;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    m = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const rid = m.rid;
  const needRid = () => isInt(rid) && rid >= 0;
  switch (m.t) {
    case 'auth':
      return str(m.token, 200) ? { t: 'auth', token: m.token } : null;
    case 'lobby.sub':
    case 'lobby.unsub':
    case 'ping':
      return { t: m.t };
    case 'table.create': {
      if (!needRid() || !TIERS_OK.includes(m.tier as string)) return null;
      if (m.name !== undefined && !str(m.name, 40)) return null;
      if (m.password !== undefined && !str(m.password, 64)) return null;
      if (m.mode !== undefined && !isMode(m.mode)) return null;
      if (m.options !== undefined && (typeof m.options !== 'object' || m.options === null || Array.isArray(m.options))) return null;
      for (const k of ['boardSize', 'entryFee', 'capacity']) if (m[k] !== undefined && !isInt(m[k])) return null;
      return {
        t: 'table.create',
        rid: rid as number,
        tier: m.tier as TierId,
        mode: m.mode as ArenaMode | undefined,
        name: m.name as string | undefined,
        boardSize: m.boardSize as number | undefined,
        entryFee: m.entryFee as number | undefined,
        capacity: m.capacity as number | undefined,
        password: m.password as string | undefined,
        options: m.options && typeof m.options === 'object' && !Array.isArray(m.options) ? (m.options as Partial<TableOptions>) : undefined,
      };
    }
    case 'table.join':
      if (!needRid() || !str(m.tableId, 64) || (m.password !== undefined && !str(m.password, 64))) return null;
      return { t: 'table.join', rid: rid as number, tableId: m.tableId, password: m.password as string | undefined };
    case 'table.ready':
      if (!needRid() || typeof m.ready !== 'boolean') return null;
      return { t: 'table.ready', rid: rid as number, ready: m.ready };
    case 'table.watch':
      if (!needRid() || !str(m.tableId, 64)) return null;
      return { t: 'table.watch', rid: rid as number, tableId: m.tableId };
    case 'table.leave':
    case 'quick.cancel':
      return needRid() ? { t: m.t, rid: rid as number } : null;
    case 'quick.start':
      if (!needRid()) return null;
      if (m.tier !== undefined && m.tier !== 'any' && !TIERS_OK.includes(m.tier as string)) return null;
      if (m.maxFee !== undefined && !isInt(m.maxFee)) return null;
      if (m.mode !== undefined && !isMode(m.mode)) return null;
      return { t: 'quick.start', rid: rid as number, tier: m.tier as TierId | 'any' | undefined, maxFee: m.maxFee as number | undefined, mode: m.mode as ArenaMode | undefined };
    case 'move':
      if (!needRid() || !str(m.matchId, 64) || !isInt(m.index)) return null;
      if (m.action !== undefined && m.action !== 'open' && m.action !== 'defuse') return null;
      return { t: 'move', rid: rid as number, matchId: m.matchId, index: m.index, action: m.action === 'defuse' ? 'defuse' : 'open' };
    case 'scan':
      if (!needRid() || !str(m.matchId, 64) || !isInt(m.index)) return null;
      return { t: 'scan', rid: rid as number, matchId: m.matchId, index: m.index };
    case 'power':
      if (!needRid() || !str(m.matchId, 64) || (m.kind !== 'smoke' && m.kind !== 'freeze')) return null;
      return { t: 'power', rid: rid as number, matchId: m.matchId, kind: m.kind };
    case 'react':
      if (!str(m.matchId, 64) || !isReaction(m.emoji)) return null;
      return { t: 'react', matchId: m.matchId, emoji: m.emoji };
    default:
      return null;
  }
}
