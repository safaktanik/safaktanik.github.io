import type { ArenaBackend, LeaderboardData, LeaderRow, MatchRow, TxRow } from '../backend';
import { ArenaHttpError } from '../client';
import type { ArenaRequest, ArenaSnapshot } from '../client';
import { botThinkMs, chooseBotMove } from '../bot';
import { ECONOMY, TIERS, TIER_ORDER, boardFor, boardRange, dayKeyOf, feeRange, levelFromXp, nextWeekStartMs, payout, weekStartOf, xpForLevel } from '../economy';
import type { TierId } from '../economy';
import { cellView, createArena, forfeit, modeView, rankedSeats, reveal, scan, timeoutTurn, usePower } from '../mines';
import type { ArenaState, MoveOutcome, PowerKind, ScanResult } from '../mines';
import { isMode } from '../modes';
import type { ArenaMode } from '../modes';
import { isReaction } from '../protocol';
import type { MatchView, Me, ReactionEvent, ResultRow, TableView } from '../protocol';
import { weeklyPointsDelta, xpGain } from '../scoring';
import { matchSettings, turnSeconds } from '../rules';
import { minesForTable, optionsOf, parseOptions } from '../tableOptions';
import { characterUnlocked } from '../characterData';
import { packHidden, stateOf, storeState } from './model';
import type { PlayerDoc, RecentDoc, SeatDoc, TableDoc, TxDoc } from './model';
import type { HDb, HDocRef, HNamedRoom, HRoom } from './types';

/**
 * TEST SUNUCUSU: claude.ai'de yayınlanan sayfanın paylaşılan veritabanı (db) üzerinde çalışan masa sistemi.
 * Herkes aynı belgeleri görür ve canlı günceller. Hamleler kısa bir kilitle (lease) sırayla uygulanır ve
 * aynı motorla doğrulanır. Gerçek sunucudan farkı: kurallar istemcide uygulanır, yani hileye karşı korumalı DEĞİLDİR;
 * para tamamen sanal ve yalnızca test içindir.
 */

const BOT_NAMES = ['Bot Mırtı', 'Bot Kıskaç', 'Bot Diş', 'Bot Okta'];
const BOT_AVATARS = [2, 6, 9, 1];
/** Botun kalıcı oyuncu belgesinin kimliği ("Bot Mırtı" → "bot-mirti"). */
function botIdOf(name: string): string {
  const ascii = name.toLowerCase().replace(/[ıöüçşğ]/g, (ch) => ({ ı: 'i', ö: 'o', ü: 'u', ç: 'c', ş: 's', ğ: 'g' })[ch] ?? ch);
  return `bot-${ascii.replace(/^bot\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}
const STALE_WAITING_MS = 45 * 60_000;
const STALE_PLAYING_MS = 20 * 60_000;
const BOT_DELAY_MS = 1900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const randInt = (n: number) => Math.floor(Math.random() * n);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class HostedBackend implements ArenaBackend {
  readonly kind = 'hosted' as const;
  readonly label: string;
  /** Çevrimdışı mod: veriler bu cihazda, rakipler bot; botlar da sıralamaya girer. */
  readonly local: boolean;
  /** Arkadaş odası (eşler arası): depo oda kuranın tarayıcısında. */
  readonly p2p: boolean;
  private snap: ArenaSnapshot = { conn: 'connecting', token: 'hosted', me: null, lobby: [], online: -1, lobbyLoaded: false, table: null, match: null, queue: null, skew: 0, needsProfile: false };
  private listeners = new Set<(s: ArenaSnapshot) => void>();
  private player: PlayerDoc | null = null;
  private playerLoaded = false;
  private tableDoc: TableDoc | null = null;
  private tableSubId: string | null = null;
  private unsubs: (() => void)[] = [];
  private tableUnsub: (() => void) | null = null;
  private weekly: { uid: string; p: PlayerDoc }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private thinkKey = '';
  private thinkMs = 0;
  private ticking = false;
  private lastAttempt = '';
  private dismissed = new Set<string>();
  private pChain: Promise<unknown> = Promise.resolve();
  private readonly tab = rid('tab');
  private started = false;
  private settling = new Set<string>();

  private botDelay: number;
  private countdownMs: number;
  private readyMs: number;
  /** İzlenen masa (koltuksuz). */
  private watching: string | null = null;
  constructor(
    private db: HDb,
    readonly uid: string,
    timing: { botDelayMs?: number; countdownMs?: number; readyMs?: number; autoTick?: boolean; local?: boolean; p2p?: boolean } = {},
    private room: HRoom | null = null,
  ) {
    this.local = !!timing.local;
    this.p2p = !!timing.p2p;
    this.label = this.local ? 'Çevrimdışı masalar' : this.p2p ? 'Arkadaş odası' : 'Test sunucusu';
    this.botDelay = timing.botDelayMs ?? BOT_DELAY_MS;
    this.countdownMs = timing.countdownMs ?? ECONOMY.countdownSeconds * 1000;
    // Hazır kontrolü süresi; testler kısa geri sayım verdiyse onu kullan.
    this.readyMs = timing.readyMs ?? (timing.countdownMs !== undefined ? timing.countdownMs : ECONOMY.readySeconds * 1000);
    this.autoTick = timing.autoTick ?? true;
  }
  private autoTick: boolean;

  get state(): ArenaSnapshot {
    return this.snap;
  }
  subscribe(fn: (s: ArenaSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private set(patch: Partial<ArenaSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }
  /** Ortak saat: arkadaş odasında oda kuranın saati (cihaz saatleri farklı olabilir). */
  now(): number {
    return this.db.now ? this.db.now() : Date.now();
  }
  serverNow(): number {
    return this.now();
  }

  // ------------------------------------------------------------------ yaşam döngüsü

  start(): void {
    if (this.started) return;
    this.started = true;
    const err = () => this.set({ conn: 'offline' });
    this.unsubs.push(
      this.playerRef().onSnapshot((s) => {
        this.playerLoaded = true;
        this.player = s.exists ? (s.data() as unknown as PlayerDoc) : null;
        this.followTable(this.player?.seatAt ?? this.watching);
        this.recompute();
      }, err),
    );
    this.unsubs.push(
      this.db
        .collection('tables')
        .where('status', 'in', ['waiting', 'countdown', 'playing'])
        .onSnapshot((q) => {
          const now = this.now();
          const docs = q.docs.map((d) => d.data() as unknown as TableDoc).filter((t) => t && !this.isStale(t, now));
          docs.sort((a, b) => Number(a.status === 'playing') - Number(b.status === 'playing') || b.createdAt - a.createdAt);
          // Özel arkadaş odaları lobide görünmez (kodla katılınır); kendi odam görünür.
          const visible = docs.filter((t) => !t.private || t.seats.some((s) => s.uid === this.uid));
          this.set({ lobby: visible.map((t) => this.tableView(t)), lobbyLoaded: true, conn: 'online' });
          if (this.local) void this.seedLocal(docs);
        }, err),
    );
    this.unsubs.push(
      this.db
        .collection('players')
        .where('week', '==', weekStartOf(this.now()))
        .onSnapshot((q) => {
          this.weekly = q.docs.filter((d) => d.exists).map((d) => ({ uid: d.id, p: d.data() as unknown as PlayerDoc }));
          this.recompute();
        }, () => undefined),
    );
    if (this.autoTick) this.timer = setInterval(() => void this.tick(), 600);
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.tableUnsub?.();
    this.tableUnsub = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  private isStale(t: TableDoc, now: number): boolean {
    if (t.status === 'playing') return now - t.updatedAt > STALE_PLAYING_MS;
    return now - t.updatedAt > STALE_WAITING_MS || (!this.local && !t.seats.some((s) => !s.bot)) || (this.local && t.status === 'countdown' && !t.seats.some((s) => !s.bot));
  }

  private playerRef(uid = this.uid): HDocRef {
    return this.db.doc(`players/${uid}`);
  }

  private followTable(id: string | null): void {
    if (id === this.tableSubId) return;
    this.tableUnsub?.();
    this.tableUnsub = null;
    this.tableSubId = id;
    this.tableDoc = null;
    if (!id) {
      this.followRoom(null);
      this.recompute();
      return;
    }
    this.followRoom(id);
    this.tableUnsub = this.db.doc(`tables/${id}`).onSnapshot(
      (s) => {
        this.tableDoc = s.exists ? (s.data() as unknown as TableDoc) : null;
        this.recompute();
        void this.tick();
      },
      () => undefined,
    );
  }

  private recompute(): void {
    const p = this.player;
    const me = p ? this.meOf(p) : null;
    const t = this.tableDoc;
    const mineSeat = t?.seats.find((s) => s.uid === this.uid) ?? null;
    let table: TableView | null = null;
    let match: MatchView | null = this.snap.match && this.snap.match.phase === 'finished' && !this.dismissed.has(this.snap.match.id) ? this.snap.match : null;
    if (t && !mineSeat && this.watching === t.id && t.match && !this.dismissed.has(t.match.id) && (t.status === 'playing' || t.status === 'finished')) match = this.matchView(t);
    if (t && (mineSeat || t.match?.s.players.some((x) => x.userId === this.uid))) {
      if (t.status === 'waiting' || t.status === 'countdown') table = this.tableView(t);
      if (t.match && !this.dismissed.has(t.match.id) && (t.status === 'playing' || t.status === 'finished')) match = this.matchView(t);
    }
    this.set({ me, table, match, needsProfile: this.playerLoaded && !p, conn: this.snap.conn === 'offline' ? 'offline' : 'online' });
  }

  private meOf(p: PlayerDoc): Me {
    const now = this.now();
    const today = dayKeyOf(now);
    const week = weekStartOf(now);
    const yest = dayKeyOf(now - 86_400_000);
    const wPoints = p.week === week ? p.wPoints : 0;
    const level = levelFromXp(p.xp);
    const ranked = this.rankedWeekly();
    const idx = ranked.findIndex((r) => r.uid === this.uid);
    const streakNext = p.lastDaily === today ? p.streak : p.lastDaily === yest ? p.streak + 1 : 1;
    const minFee = Math.min(...Object.values(TIERS).map((x) => x.fee));
    return {
      id: this.uid,
      username: p.name,
      avatar: p.avatar,
      level,
      accountType: 'member',
      email: null,
      xp: p.xp,
      xpLevelStart: xpForLevel(level),
      xpNext: xpForLevel(level + 1),
      balance: p.balance,
      wins: p.wins,
      losses: p.losses,
      gamesPlayed: p.games,
      winRate: p.games ? Math.round((p.wins / p.games) * 100) : 0,
      weeklyPoints: wPoints,
      weeklyRank: p.week === week && p.wGames > 0 && idx >= 0 ? idx + 1 : null,
      bestRank: p.best,
      dailyAvailable: p.lastDaily !== today,
      dailyAmount: ECONOMY.daily.base + Math.min(ECONOMY.daily.maxStreakBonus, ECONOMY.daily.streakBonus * (streakNext - 1)),
      streak: p.lastDaily === today || p.lastDaily === yest ? p.streak : 0,
      rescueAvailable: p.balance < minFee && p.lastRescue !== today,
      rescueAmount: ECONOMY.rescue.amount,
    };
  }

  private rankedWeekly() {
    return this.weekly
      .filter((w) => w.p.wGames > 0)
      .sort((a, b) => b.p.wPoints - a.p.wPoints || b.p.wWins - a.p.wWins || a.p.wGames - b.p.wGames || a.p.name.localeCompare(b.p.name));
  }

  // ------------------------------------------------------------------ görünümler

  /** Botun seviyesi her ekranda aynı olsun: kalıcı belgesindeki deneyimden (sıralama da bunu gösterir). */
  private botLevel(name: string): number {
    const w = this.weekly.find((x) => x.uid === botIdOf(name));
    return w ? levelFromXp(w.p.xp) : 1;
  }

  private humans(t: TableDoc): number {
    return t.seats.filter((s) => !s.bot).length;
  }

  /**
   * Havuza ücret ödeyen koltuk sayısı. Çevrimdışı modda botların ücretini "ev" öder; yoksa botlara karşı
   * kazanmak yalnızca kendi ücretini geri getirir ve bakiye hiç büyüyemez. Arkadaş odasında botlar ödemez.
   */
  private payingSeats(t: TableDoc, seated: number): number {
    return this.local ? seated : this.humans(t);
  }

  tableView(t: TableDoc): TableView {
    const bots = t.seats.filter((s) => s.bot).length;
    return {
      id: t.id,
      name: t.name,
      code: t.code ?? null,
      options: optionsOf(t.options),
      private: !!t.private,
      tier: t.tier,
      mode: t.mode,
      boardSize: t.boardSize,
      mineCount: t.mineCount,
      entryFee: t.entryFee,
      maxPlayers: t.maxPlayers,
      players: [...t.seats].sort((a, b) => a.seat - b.seat).map((s) => ({ userId: s.uid, username: s.name, avatar: s.avatar, level: s.level, seat: s.seat, bot: s.bot, ready: s.bot || !!s.ready })),
      status: t.status,
      locked: !!t.pw,
      prizePool: t.entryFee * this.payingSeats(t, t.seats.length),
      maxPrizePool: t.entryFee * (this.local ? t.maxPlayers : t.maxPlayers - bots),
      houseFeePercent: 0,
      countdownEndsAt: t.countdownEndsAt,
      ownerId: t.ownerUid,
      matchId: t.match?.id ?? null,
    };
  }

  private matchView(t: TableDoc): MatchView {
    const m = t.match!;
    const s = stateOf(t);
    const finished = s.phase === 'finished';
    const seatOf = (seat: number) => t.seats.find((x) => x.seat === seat);
    return {
      id: m.id,
      tableId: t.id,
      tableName: t.name,
      tier: t.tier,
      ...modeView(s, finished),
      size: s.size,
      mineCount: s.mineCount,
      cells: cellView(s, finished),
      players: s.players.map((p) => {
        const st = seatOf(p.seat);
        return {
          userId: p.userId,
          username: st?.name ?? 'Oyuncu',
          avatar: st?.avatar ?? 0,
          level: st?.level ?? 1,
          seat: p.seat,
          lives: p.lives,
          eliminated: p.eliminated,
          eliminationReason: p.eliminationReason,
          moves: p.moves,
          mineHits: p.mineHits,
          safeOpened: p.safeOpened,
          territory: p.territory,
          chests: p.chests,
          shield: p.shield ?? 0,
          sonar: p.sonar ?? 0,
          defused: p.defused ?? 0,
        smoke: p.smoke ?? 0,
        freeze: p.freeze ?? 0,
        };
      }),
      viewerSeat: s.players.find((p) => p.userId === this.uid)?.seat ?? null,
      current: s.current,
      turnNo: s.turnNo,
      turnEndsAt: finished ? null : m.turnEndsAt,
      serverNow: this.now(),
      turnSeconds: turnSeconds(s.mode, t.options),
      phase: s.phase,
      winnerSeat: s.winnerSeat,
      endReason: s.endReason,
      prizePool: m.pool,
      safeLeft: s.safeLeft,
      seq: m.seq,
      lastMove: m.lastMove,
      aim: m.aim && m.aim.turnNo === s.turnNo && !finished ? { seat: m.aim.seat, index: m.aim.index, turnNo: m.aim.turnNo } : null,
      startedAt: m.startedAt,
      results: finished ? m.results : null,
    };
  }

  // ------------------------------------------------------------------ yazma yardımcıları

  /** Masa belgesini kilitle → oku → değiştir → yaz. Kilit kısa ömürlüdür ve kendiliğinden düşer. */
  private async mutateTable(id: string, fn: (t: TableDoc) => TableDoc | null): Promise<TableDoc> {
    const ref = this.db.doc(`tables/${id}`);
    for (let attempt = 0; attempt < 14; attempt++) {
      const lease = await ref.acquire({ holder: this.tab, ttlMs: 1000 });
      if (!lease.acquired) {
        const wait = lease.expiresAt ? Date.parse(lease.expiresAt) - this.now() + 40 : 300;
        await sleep(Math.max(60, Math.min(1500, wait)) + randInt(120));
        continue;
      }
      const snap = await ref.get();
      if (!snap.exists) throw new ArenaHttpError('table-not-found', 404);
      const cur = snap.data() as unknown as TableDoc;
      const next = fn(structuredClone(cur));
      if (!next) return cur;
      next.updatedAt = this.now();
      await ref.set(next as unknown as Record<string, unknown>);
      return next;
    }
    throw new ArenaHttpError('busy', 0);
  }

  /** Kendi oyuncu belgemi sırayla günceller (yalnızca sahibi yazabilir). */
  private updatePlayer(fn: (p: PlayerDoc) => PlayerDoc | null): Promise<PlayerDoc | null> {
    const run = async () => {
      const snap = await this.playerRef().get();
      if (!snap.exists) throw new ArenaHttpError('no-profile', 400);
      const cur = this.rollWeek(snap.data() as unknown as PlayerDoc);
      const next = fn(structuredClone(cur));
      if (!next) return cur;
      await this.playerRef().set(next as unknown as Record<string, unknown>);
      this.player = next;
      this.recompute();
      return next;
    };
    const p = this.pChain.then(run, run);
    this.pChain = p.catch(() => undefined);
    return p;
  }

  private rollWeek(p: PlayerDoc): PlayerDoc {
    const week = weekStartOf(this.now());
    if (p.week === week) return p;
    return { ...p, week, wPoints: 0, wWins: 0, wGames: 0, wCoins: 0 };
  }

  private tx(p: PlayerDoc, type: string, amount: number): void {
    if (p.balance + amount < 0) throw new ArenaHttpError('insufficient-funds', 402);
    p.balance += amount;
    const t: TxDoc = { id: rid('x'), transaction_type: type, amount, balance_after: p.balance, created_at: this.now() };
    p.tx = [t, ...(p.tx ?? [])].slice(0, 40);
  }

  // ------------------------------------------------------------------ profil

  async createProfile(name: string, avatar: number): Promise<void> {
    const n = name.trim();
    if (!/^[\p{L}\p{N}_ ]{3,16}$/u.test(n)) throw new ArenaHttpError('bad-username', 400);
    if (!characterUnlocked(avatar, 1)) throw new ArenaHttpError('avatar-locked', 403);
    const now = this.now();
    const p: PlayerDoc = {
      name: n,
      avatar,
      balance: 0,
      xp: 0,
      wins: 0,
      losses: 0,
      games: 0,
      best: null,
      week: weekStartOf(now),
      wPoints: 0,
      wWins: 0,
      wGames: 0,
      wCoins: 0,
      lastDaily: null,
      streak: 0,
      lastRescue: null,
      seatAt: null,
      settled: [],
      recent: [],
      tx: [],
      createdAt: now,
    };
    this.tx(p, 'signup-bonus', ECONOMY.startingBalance);
    await this.playerRef().set(p as unknown as Record<string, unknown>);
  }

  async updateProfile(input: { username?: string; avatar?: number }): Promise<void> {
    if (input.username !== undefined && !/^[\p{L}\p{N}_ ]{3,16}$/u.test(input.username.trim())) throw new ArenaHttpError('bad-username', 400);
    await this.updatePlayer((p) => {
      if (input.avatar !== undefined && input.avatar !== p.avatar && !characterUnlocked(input.avatar, levelFromXp(p.xp))) throw new ArenaHttpError('avatar-locked', 403);
      return { ...p, name: input.username?.trim() ?? p.name, avatar: input.avatar ?? p.avatar };
    });
  }

  async claimDaily(): Promise<{ amount: number }> {
    let amount = 0;
    await this.updatePlayer((p) => {
      const now = this.now();
      const today = dayKeyOf(now);
      if (p.lastDaily === today) throw new ArenaHttpError('already-claimed', 400);
      const streak = p.lastDaily === dayKeyOf(now - 86_400_000) ? p.streak + 1 : 1;
      amount = ECONOMY.daily.base + Math.min(ECONOMY.daily.maxStreakBonus, ECONOMY.daily.streakBonus * (streak - 1));
      this.tx(p, 'daily-reward', amount);
      return { ...p, lastDaily: today, streak };
    });
    return { amount };
  }

  async claimRescue(): Promise<{ amount: number }> {
    await this.updatePlayer((p) => {
      const today = dayKeyOf(this.now());
      const minFee = Math.min(...Object.values(TIERS).map((x) => x.fee));
      if (p.balance >= minFee) throw new ArenaHttpError('not-needed', 400);
      if (p.lastRescue === today) throw new ArenaHttpError('already-claimed', 400);
      this.tx(p, 'rescue-pack', ECONOMY.rescue.amount);
      return { ...p, lastRescue: today };
    });
    return { amount: ECONOMY.rescue.amount };
  }

  async refreshMe(): Promise<unknown> {
    return this.snap.me;
  }

  // hesap işlemleri test sunucusunda claude.ai hesabıyla yapılır
  async guest(): Promise<void> {}
  async login(): Promise<void> {
    throw new ArenaHttpError('not-supported', 400);
  }
  async register(): Promise<void> {
    throw new ArenaHttpError('not-supported', 400);
  }
  async upgrade(): Promise<void> {
    throw new ArenaHttpError('not-supported', 400);
  }
  async logout(): Promise<void> {}

  // ------------------------------------------------------------------ veriler

  async leaderboard(): Promise<LeaderboardData> {
    const now = this.now();
    const week = weekStartOf(now);
    const q = await this.db.collection('players').where('week', '==', week).get();
    this.weekly = q.docs.filter((d) => d.exists).map((d) => ({ uid: d.id, p: d.data() as unknown as PlayerDoc }));
    const rows: LeaderRow[] = this.rankedWeekly()
      .slice(0, 50)
      .map((w, i) => ({
        rank: i + 1,
        userId: w.uid,
        username: w.p.name,
        avatar: w.p.avatar,
        level: levelFromXp(w.p.xp),
        points: w.p.wPoints,
        wins: w.p.wWins,
        games: w.p.wGames,
        winRate: w.p.wGames ? Math.round((w.p.wWins / w.p.wGames) * 100) : 0,
        coinsWon: w.p.wCoins,
      }));
    return { week, list: rows, me: rows.find((r) => r.userId === this.uid) ?? null, prizes: [], endsInMs: nextWeekStartMs(now) - now, serverNow: now };
  }
  async recentMatches(): Promise<MatchRow[]> {
    return (this.player?.recent ?? []) as MatchRow[];
  }
  async transactions(): Promise<TxRow[]> {
    return (this.player?.tx ?? []) as TxRow[];
  }

  // ------------------------------------------------------------------ istekler

  watchLobby(): void {}
  clearMatch(): void {
    if (this.snap.match) this.dismissed.add(this.snap.match.id);
    this.set({ match: null });
  }

  private stopWatching(): void {
    const id = this.watching;
    this.watching = null;
    if (id && this.tableDoc?.match) this.dismissed.add(this.tableDoc.match.id);
    this.followTable(this.player?.seatAt ?? null);
    this.set({ match: null });
  }

  async request<T = unknown>(m: ArenaRequest): Promise<T> {
    switch (m.t) {
      case 'table.create':
        return (await this.createTable(m)) as T;
      case 'table.join':
        return (await this.joinTable(m.tableId, m.password)) as T;
      case 'table.leave':
        if (this.watching) return this.stopWatching() as T;
        return (await this.leave()) as T;
      case 'table.ready':
        return (await this.setReady(m.ready)) as T;
      case 'table.watch':
        return (await this.watch(m.tableId)) as T;
      case 'quick.start':
        return (await this.quick(m.tier ?? 'any', m.maxFee ?? Number.MAX_SAFE_INTEGER, m.mode ?? 'classic')) as T;
      case 'quick.cancel':
        return undefined as T;
      case 'move':
        return (await this.move(m.matchId, m.index, m.action ?? 'open')) as T;
      case 'scan':
        return (await this.scanCell(m.matchId, m.index)) as T;
      case 'power':
        return (await this.power(m.matchId, m.kind)) as T;
    }
    return undefined as T;
  }

  /** Maçtan çık: hâlâ oyundaysa hükmen elenir; sonra maç ekranı kapanır, sonuç arka planda kesinleşir. */
  async leaveMatch(): Promise<void> {
    if (this.watching) return void this.stopWatching();
    const t = this.tableDoc;
    const me = t?.match?.s.players.find((p) => p.userId === this.uid);
    if (t && t.status === 'playing' && me && !me.eliminated) await this.leave();
    this.clearMatch();
  }

  // ------------------------------------------------------------------ emoji (room)

  private reactListeners = new Set<(e: ReactionEvent & { matchId: string }) => void>();
  private roomName: string | null = null;
  private roomP: Promise<HNamedRoom | null> | null = null;
  private roomOff: (() => void) | null = null;
  private lastReactAt = 0;

  onReact(fn: (e: ReactionEvent & { matchId: string }) => void): () => void {
    this.reactListeners.add(fn);
    return () => this.reactListeners.delete(fn);
  }
  private emitReact(e: ReactionEvent & { matchId: string }): void {
    for (const l of this.reactListeners) l(e);
  }
  /** Masa değişince ilgili odaya katıl (oda adı: t-<masa>). */
  private followRoom(tableId: string | null): void {
    const name = tableId ? `t-${tableId.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)}` : null;
    if (name === this.roomName) return;
    this.roomOff?.();
    this.roomOff = null;
    const old = this.roomP;
    if (old) void old.then((r) => r?.leave()).catch(() => undefined);
    this.roomName = name;
    this.roomP = null;
    if (!name || !this.room) return;
    this.roomP = this.room.join(name).then(
      (r) => {
        if (this.roomName !== name) {
          void r.leave().catch(() => undefined);
          return null;
        }
        this.roomOff = r.on(
          'react',
          (msg) => {
            const d = msg.data as { m?: unknown; u?: unknown; e?: unknown; id?: unknown } | undefined;
            if (!d || typeof d.m !== 'string' || typeof d.u !== 'string' || !isReaction(d.e)) return;
            if (d.u === this.uid) return; // kendi emojim zaten yerelde gösterildi
            const seat = d.m.startsWith('lobby:') ? this.tableDoc?.seats.find((x) => x.uid === d.u)?.seat : this.tableDoc?.match?.s.players.find((p) => p.userId === d.u)?.seat;
            if (seat === undefined) return;
            this.emitReact({ matchId: d.m, seat, emoji: d.e, id: String(d.id ?? this.now()) });
          },
          () => undefined,
        );
        return r;
      },
      () => null,
    );
  }
  react(matchId: string, emoji: string): void {
    if (!isReaction(emoji)) return;
    const now = this.now();
    if (now - this.lastReactAt < 900) return;
    this.lastReactAt = now;
    // Bekleme odasında da emoji atılabilir: matchId = 'lobby:<masa>'.
    const seat = matchId.startsWith('lobby:') ? this.tableDoc?.seats.find((x) => x.uid === this.uid)?.seat : this.tableDoc?.match?.s.players.find((p) => p.userId === this.uid)?.seat;
    if (seat === undefined) return;
    const id = `${now.toString(36)}${seat}`;
    this.emitReact({ matchId, seat, emoji, id });
    void this.roomP?.then((r) => r?.emit('react', { m: matchId, u: this.uid, e: emoji, id })).catch(() => undefined);
  }

  private myActiveTable(): TableDoc | null {
    const t = this.tableDoc;
    if (!t) return null;
    const seated = t.seats.some((s) => s.uid === this.uid);
    if (!seated) return null;
    if (t.status === 'waiting' || t.status === 'countdown') return t;
    if (t.status === 'playing' && t.match && !this.isStale(t, this.now())) {
      const me = t.match.s.players.find((p) => p.userId === this.uid);
      if (me && !me.eliminated) return t;
    }
    return null;
  }

  private requireProfile(): PlayerDoc {
    if (!this.player) throw new ArenaHttpError('no-profile', 400);
    return this.player;
  }

  private seatDocFor(p: PlayerDoc, seat: number): SeatDoc {
    return { seat, uid: this.uid, bot: false, name: p.name, avatar: p.avatar, level: levelFromXp(p.xp), ready: false };
  }

  private async createTable(m: Extract<ArenaRequest, { t: 'table.create' }>): Promise<TableView> {
    const p = this.requireProfile();
    if (this.myActiveTable()) throw new ArenaHttpError('already-seated', 409);
    const tier: TierId = (TIER_ORDER as string[]).includes(m.tier) ? m.tier : 'bronze';
    const def = TIERS[tier];
    const mode: ArenaMode = isMode(m.mode) ? m.mode : 'classic';
    const capReq = m.capacity ?? def.capacity;
    const boardSize = m.boardSize ?? boardFor(def, capReq).size;
    const br = boardRange(def);
    if (boardSize < br.min || boardSize > br.max) throw new ArenaHttpError('bad-board', 400);
    const entryFee = m.entryFee ?? def.fee;
    const fr = feeRange(def);
    if (entryFee < fr.min || entryFee > fr.max) throw new ArenaHttpError('bad-fee', 400);
    const opts = parseOptions(m.options);
    if (!opts) throw new ArenaHttpError('bad-options', 400);
    const cap = m.capacity ?? def.capacity;
    // Test sunucusunda 2 kişilik arkadaş düellosu da açılabilir.
    if (cap !== 2 && cap !== 3 && cap !== 4) throw new ArenaHttpError('bad-capacity', 400);
    if (p.balance < entryFee) throw new ArenaHttpError('insufficient-funds', 402);
    const id = rid('t');
    const pw = m.password ? await sha256(`${id}:${m.password}`) : null;
    const now = this.now();
    const t: TableDoc = {
      id,
      name: (m.name ?? '').trim().slice(0, ECONOMY.custom.nameMax) || `${def.label} Masa`,
      tier,
      mode,
      boardSize,
      mineCount: minesForTable(def, boardSize, cap, opts.density, mode),
      entryFee,
      maxPlayers: cap,
      status: 'waiting',
      pw,
      ownerUid: this.uid,
      createdAt: now,
      updatedAt: now,
      countdownEndsAt: null,
      seats: [this.seatDocFor(p, 0)],
      match: null,
      code: String(1000 + randInt(9000)),
      options: opts,
      private: !!m.private,
    };
    await this.db.doc(`tables/${id}`).set(t as unknown as Record<string, unknown>);
    try {
      await this.updatePlayer((pp) => {
        this.tx(pp, 'entry-fee', -entryFee);
        return this.seatTo(pp, id);
      });
    } catch (e) {
      await this.db.doc(`tables/${id}`).delete();
      throw e;
    }
    void this.cleanup();
    return this.tableView(t);
  }

  private async joinTable(tableId: string, password?: string): Promise<TableView> {
    const p = this.requireProfile();
    if (this.myActiveTable()) throw new ArenaHttpError('already-seated', 409);
    const snap = await this.db.doc(`tables/${tableId}`).get();
    if (!snap.exists) throw new ArenaHttpError('table-not-found', 404);
    const t0 = snap.data() as unknown as TableDoc;
    if (t0.pw && (!password || (await sha256(`${tableId}:${password}`)) !== t0.pw)) throw new ArenaHttpError('wrong-password', 403);
    if (p.balance < t0.entryFee) throw new ArenaHttpError('insufficient-funds', 402);
    const t = await this.mutateTable(tableId, (t) => {
      if (t.status !== 'waiting') throw new ArenaHttpError('table-not-joinable', 409);
      if (t.seats.some((s) => s.uid === this.uid)) throw new ArenaHttpError('already-seated', 409);
      if (t.seats.length >= t.maxPlayers) throw new ArenaHttpError('table-full', 409);
      const taken = new Set(t.seats.map((s) => s.seat));
      let seat = 0;
      while (taken.has(seat)) seat++;
      t.seats.push(this.seatDocFor(p, seat));
      this.maybeCountdown(t);
      return t;
    });
    try {
      await this.updatePlayer((pp) => {
        this.tx(pp, 'entry-fee', -t.entryFee);
        return this.seatTo(pp, tableId);
      });
    } catch (e) {
      await this.mutateTable(tableId, (tt) => {
        tt.seats = tt.seats.filter((s) => s.uid !== this.uid);
        if (tt.status === 'countdown') {
          tt.status = 'waiting';
          tt.countdownEndsAt = null;
        }
        return tt;
      });
      throw e;
    }
    this.followTable(tableId);
    return this.tableView(t);
  }

  /**
   * Masa dolunca hazır kontrolü başlar: herkes "Hazırım" derse kısa geri sayımla, demezse en geç
   * `readyMs` sonra maç başlar (masada bekleyen biri herkesi sonsuza kadar bekletemez).
   */
  private maybeCountdown(t: TableDoc): void {
    if (t.status === 'waiting' && t.seats.length >= t.maxPlayers) {
      t.status = 'countdown';
      const allReady = t.seats.every((x) => x.bot || x.ready);
      t.countdownEndsAt = this.now() + (allReady ? this.countdownMs : Math.max(this.countdownMs, this.readyMs));
    }
  }

  /** Bekleme odasında hazır ol / hazırlığı geri al. */
  private async setReady(ready: boolean): Promise<void> {
    const t = this.tableDoc;
    if (!t || (t.status !== 'waiting' && t.status !== 'countdown')) throw new ArenaHttpError('not-seated', 409);
    await this.mutateTable(t.id, (tt) => {
      if (tt.status !== 'waiting' && tt.status !== 'countdown') return null;
      const me = tt.seats.find((x) => x.uid === this.uid);
      if (!me) return null;
      me.ready = ready;
      if (tt.status === 'countdown' && tt.countdownEndsAt && tt.seats.every((x) => x.bot || x.ready)) tt.countdownEndsAt = Math.min(tt.countdownEndsAt, this.now() + this.countdownMs);
      return tt;
    });
  }

  /** Oynanan bir masayı izle (koltuk almadan). */
  private async watch(tableId: string): Promise<void> {
    if (this.myActiveTable()) throw new ArenaHttpError('already-seated', 409);
    const snap = await this.db.doc(`tables/${tableId}`).get();
    const t = snap.exists ? (snap.data() as unknown as TableDoc) : null;
    if (!t || t.status !== 'playing' || !t.match) throw new ArenaHttpError('not-playing', 409);
    this.watching = tableId;
    this.followTable(tableId);
  }

  private async leave(): Promise<void> {
    const t = this.tableDoc;
    const p = this.player;
    if (!t || !p) return;
    if (t.status === 'waiting' || t.status === 'countdown') {
      let removed = false;
      await this.mutateTable(t.id, (tt) => {
        if (tt.status !== 'waiting' && tt.status !== 'countdown') return null;
        if (!tt.seats.some((s) => s.uid === this.uid)) return null;
        tt.seats = tt.seats.filter((s) => s.uid !== this.uid);
        removed = true;
        const humans = tt.seats.filter((s) => !s.bot);
        if (!humans.length) {
          tt.status = 'cancelled';
          tt.seats = [];
        } else {
          tt.status = 'waiting';
          tt.countdownEndsAt = null;
          if (tt.ownerUid === this.uid) tt.ownerUid = humans[0].uid;
        }
        return tt;
      });
      await this.updatePlayer((pp) => {
        if (removed) this.tx(pp, 'entry-refund', t.entryFee);
        return { ...pp, seatAt: null };
      });
      return;
    }
    if (t.status === 'playing') {
      await this.mutateTable(t.id, (tt) => {
        if (!tt.match || tt.status !== 'playing') return null;
        const s = stateOf(tt);
        const me = s.players.find((x) => x.userId === this.uid);
        if (!me) return null;
        const wasCurrent = s.current === me.seat;
        const out = forfeit(s, me.seat);
        if (!out) return null;
        this.applyOutcome(tt, s, out, !wasCurrent);
        return tt;
      });
    }
  }

  private async quick(tier: TierId | 'any', maxFee: number, mode: ArenaMode): Promise<{ joined: string | null; queued: boolean }> {
    const p = this.requireProfile();
    const cap = Math.min(p.balance, maxFee);
    const cands = this.snap.lobby
      .filter((t) => t.status === 'waiting' && !t.locked && t.entryFee <= cap && t.players.length < t.maxPlayers && (tier === 'any' || t.tier === tier) && t.mode === mode)
      .sort((a, b) => b.players.length - a.players.length);
    for (const c of cands) {
      try {
        await this.joinTable(c.id);
        return { joined: c.id, queued: false };
      } catch (e) {
        if (!(e instanceof ArenaHttpError) || e.code === 'insufficient-funds') throw e;
      }
    }
    const ok = TIER_ORDER.filter((t) => TIERS[t].fee <= cap);
    const pick: TierId | undefined = tier !== 'any' ? (TIERS[tier].fee <= cap ? tier : undefined) : ok[ok.length - 1];
    if (!pick) throw new ArenaHttpError('insufficient-funds', 402);
    const t = await this.createTable({ t: 'table.create', tier: pick, mode, name: `${TIERS[pick].label} · Hızlı` });
    return { joined: t.id, queued: false };
  }

  markReadOnly(): void {
    this.set({ readOnly: true });
  }

  /** Arkadaş odasına 4 haneli kodla katıl. */
  async joinByCode(code: string): Promise<TableView> {
    const c = code.trim();
    if (!/^\d{4}$/.test(c)) throw new ArenaHttpError('bad-code', 400);
    const q = await this.db.collection('tables').where('code', '==', c).get();
    const now = this.now();
    const t = q.docs
      .map((d) => d.data() as unknown as TableDoc)
      .filter((x) => x && x.status === 'waiting' && !this.isStale(x, now))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!t) throw new ArenaHttpError('code-not-found', 404);
    return this.joinTable(t.id);
  }

  async addBot(tableId: string): Promise<void> {
    await this.mutateTable(tableId, (t) => {
      if (t.ownerUid !== this.uid) throw new ArenaHttpError('not-owner', 403);
      if (t.status !== 'waiting' || t.seats.length >= t.maxPlayers) return null;
      const taken = new Set(t.seats.map((s) => s.seat));
      let seat = 0;
      while (taken.has(seat)) seat++;
      const n = t.seats.filter((s) => s.bot).length;
      t.seats.push({ seat, uid: `bot-${seat}-${t.id}`, bot: true, name: BOT_NAMES[n % BOT_NAMES.length], avatar: BOT_AVATARS[n % BOT_AVATARS.length], level: this.botLevel(BOT_NAMES[n % BOT_NAMES.length]) });
      this.maybeCountdown(t);
      return t;
    });
  }

  async removeBot(tableId: string): Promise<void> {
    await this.mutateTable(tableId, (t) => {
      if (t.ownerUid !== this.uid || t.status === 'playing') return null;
      const bots = t.seats.filter((s) => s.bot);
      if (!bots.length) return null;
      const last = bots[bots.length - 1];
      t.seats = t.seats.filter((s) => s !== last && s.uid !== last.uid);
      t.status = 'waiting';
      t.countdownEndsAt = null;
      return t;
    });
  }

  /** Yeni masaya otururken, sonucu bekleyen eski masayı "bekleyenler" listesine al. */
  private seatTo(pp: PlayerDoc, id: string): PlayerDoc {
    const old = pp.seatAt;
    const pending = (pp.pending ?? []).filter((x) => x !== id);
    if (old && old !== id) pending.unshift(old);
    return { ...pp, seatAt: id, pending: pending.slice(0, 8) };
  }

  /** Ayrıldığım ama bitmesini beklemediğim maçları kesinleştir. */
  private pendingAt = 0;
  private async settlePending(): Promise<void> {
    const p = this.player;
    if (!p?.pending?.length || this.now() - this.pendingAt < 4000) return;
    this.pendingAt = this.now();
    const drop: string[] = [];
    for (const id of p.pending) {
      const snap = await this.db.doc(`tables/${id}`).get();
      const t = snap.exists ? (snap.data() as unknown as TableDoc) : null;
      if (!t || !t.match || t.status === 'cancelled') drop.push(id);
      else if (t.status === 'finished' && t.match.results) {
        await this.settle(t);
        drop.push(id);
      } else if (this.isStale(t, this.now())) drop.push(id);
    }
    if (drop.length) await this.updatePlayer((pp) => ({ ...pp, pending: (pp.pending ?? []).filter((x) => !drop.includes(x)) }));
  }

  /** Sonar: 3×3 alandaki mayın sayısı yalnızca bana döner; sıra geçmez. */
  /** Güç kullan (Duman / Zaman Dondurma). Sıra değişmez; Dondurma tur süresini uzatır. */
  private async power(matchId: string, kind: PowerKind): Promise<{ kind: PowerKind; extendMs: number }> {
    const t0 = this.tableDoc;
    if (!t0 || t0.match?.id !== matchId) throw new ArenaHttpError('match-not-found', 404);
    let res: { kind: PowerKind; extendMs: number } | null = null;
    await this.mutateTable(t0.id, (t) => {
      if (!t.match || t.match.id !== matchId || t.status !== 'playing') throw new ArenaHttpError('not-playing', 409);
      const s = stateOf(t);
      const me = s.players.find((p) => p.userId === this.uid);
      if (!me) throw new ArenaHttpError('not-in-match', 403);
      const r = usePower(s, me.seat, kind);
      if ('error' in r) throw new ArenaHttpError(r.error, 409);
      res = r;
      if (r.extendMs && t.match.turnEndsAt) t.match.turnEndsAt += r.extendMs;
      storeState(t, s);
      return t;
    });
    return res!;
  }

  private async scanCell(matchId: string, index: number): Promise<ScanResult> {
    const t0 = this.tableDoc;
    if (!t0 || t0.match?.id !== matchId) throw new ArenaHttpError('match-not-found', 404);
    let res: ScanResult | null = null;
    await this.mutateTable(t0.id, (t) => {
      if (!t.match || t.match.id !== matchId || t.status !== 'playing') throw new ArenaHttpError('not-playing', 409);
      const s = stateOf(t);
      const me = s.players.find((p) => p.userId === this.uid);
      if (!me) throw new ArenaHttpError('not-in-match', 403);
      const r = scan(s, me.seat, index);
      if ('error' in r) throw new ArenaHttpError(r.error, 409);
      res = r;
      t.match.lastAt = this.now();
      storeState(t, s);
      return t;
    });
    return res!;
  }

  private async move(matchId: string, index: number, action: 'open' | 'defuse' = 'open'): Promise<MoveOutcome> {
    const t0 = this.tableDoc;
    if (!t0 || t0.match?.id !== matchId) throw new ArenaHttpError('match-not-found', 404);
    let outcome: MoveOutcome | null = null;
    await this.mutateTable(t0.id, (t) => {
      if (!t.match || t.match.id !== matchId || t.status !== 'playing') throw new ArenaHttpError('not-playing', 409);
      const s = stateOf(t);
      const me = s.players.find((p) => p.userId === this.uid);
      if (!me) throw new ArenaHttpError('not-in-match', 403);
      const r = reveal(s, me.seat, index, action);
      if ('error' in r) throw new ArenaHttpError(r.error, 409);
      outcome = r.outcome;
      this.applyOutcome(t, s, r.outcome, false);
      return t;
    });
    return outcome!;
  }

  /** Hamle sonrası ortak işler: sıra süresi, son hamle, bitişte sonuçlar. */
  private applyOutcome(t: TableDoc, s: ArenaState, out: MoveOutcome, keepTimer: boolean): void {
    const m = t.match!;
    m.seq++;
    m.lastMove = out;
    m.lastAt = this.now();
    if (!keepTimer) m.turnEndsAt = this.now() + turnSeconds(s.mode, t.options) * 1000;
    if (s.phase === 'finished') {
      m.turnEndsAt = null;
      t.status = 'finished';
      const order = rankedSeats(s);
      const pay = payout(m.pool, t.entryFee, s.players.length);
      const walked =(seat: number) => s.players.filter((x) => x.seat !== seat).every((x) => x.eliminationReason === 'afk' || x.eliminationReason === 'left');
      m.results = order.map((seat, i): ResultRow => {
        const p = s.players[seat];
        const bot = !!t.seats.find((x) => x.seat === seat)?.bot;
        const pts =
          (!bot || this.local) && m.humans >= this.minHumans()
            ? weeklyPointsDelta({ capacity: t.maxPlayers, tier: t.tier, rank: i + 1, safeOpened: p.safeOpened, defused: p.defused ?? 0, chests: p.chests, eliminationReason: p.eliminationReason, opponentsAllWalkedAway: i === 0 && walked(seat), sameGroupMatchesThisWeek: 0 })
            : 0;
        return {
          userId: p.userId,
          seat,
          rank: i + 1,
          prize: bot ? 0 : i === 0 ? pay.winner : i === 1 ? pay.second : 0,
          pointsDelta: pts,
          xp: bot ? 0 : xpGain({ won: i === 0, safeOpened: p.safeOpened }),
          moves: p.moves,
          mineHits: p.mineHits,
          safeOpened: p.safeOpened,
          territory: p.territory,
          chests: p.chests,
          defused: p.defused ?? 0,
          eliminationReason: p.eliminationReason,
        };
      });
    }
    storeState(t, s);
  }

  // ------------------------------------------------------------------ zamanlayıcı: geri sayım, botlar, süre aşımı, kesinleştirme

  /** Zamanlayıcı adımı (testler doğrudan çağırabilir). */
  async tick(): Promise<void> {
    if (this.ticking) return;
    const t = this.tableDoc;
    if (!t) return void (await this.settlePending().catch(() => undefined));
    // Arkadaş odası: saat oda kuranla eşitlenmeden süre aşımı / bot hamlesi kararı verme.
    if (this.db.synced && !this.db.synced()) return;
    this.ticking = true;
    try {
      const now = this.now();
      if (this.local && t.status === 'waiting' && t.seats.length < t.maxPlayers && t.seats.some((s) => s.uid === this.uid) && now - t.updatedAt > 3500 && this.once(`fill:${t.id}:${t.seats.length}`)) {
        await this.autoFill(t);
      } else if (t.status === 'countdown' && t.countdownEndsAt && now >= t.countdownEndsAt && this.once(`start:${t.id}`)) {
        await this.mutateTable(t.id, (tt) => {
          if (tt.status !== 'countdown' || tt.seats.length < tt.maxPlayers) return null;
          const seats = [...tt.seats].sort((a, b) => a.seat - b.seat);
          seats.forEach((s, i) => (s.seat = i));
          tt.seats = seats;
          const s = createArena(tt.boardSize, tt.mineCount, seats.map((x) => x.uid), randInt, matchSettings(tt.mode, tt.options), tt.mode);
          s.current = randInt(seats.length);
          const at = this.now();
          const humans = seats.filter((x) => !x.bot).length;
          tt.match = {
            id: rid('m'),
            s: {} as never,
            hid: packHidden(tt.id, s.mines, s.chests, s.bonuses),
            pool: tt.entryFee * this.payingSeats(tt, seats.length),
            humans,
            startedAt: at,
            turnEndsAt: at + turnSeconds(tt.mode, tt.options) * 1000,
            lastAt: at,
            seq: 0,
            lastMove: null,
            results: null,
          };
          storeState(tt, s);
          tt.status = 'playing';
          tt.countdownEndsAt = null;
          return tt;
        });
      } else if (t.status === 'playing' && t.match) {
        const s = t.match.s;
        const cur = t.seats.find((x) => x.seat === s.current);
        const key = `${t.match.id}:${s.turnNo}`;
        // Botun düşünme süresi: sabit + tura göre değişen ek (herkesin tarayıcısında aynı).
        const human = this.botDelay >= 1000;
        // İnsan gibi bot: düşünür (herkesin aynı hesapladığı süre), kareyi seçer (herkes görür), biraz sonra açar.
        const aim = t.match.aim && t.match.aim.turnNo === s.turnNo ? t.match.aim : null;
        // düşünme süresi tur başına bir kez hesaplanır (her tıkta tahtayı yeniden analiz etmeyelim)
        let think = 0;
        if (human && cur?.bot && !aim) {
          if (this.thinkKey !== key) {
            this.thinkKey = key;
            this.thinkMs = botThinkMs(cellView(stateOf(t), false), s.size, s.mineCount, 'medium', ((s.turnNo * 7919) % 1000) / 1000, turnSeconds(t.mode, t.options)) - 1000;
          }
          think = this.thinkMs;
        }
        if (human && cur?.bot && !aim && now >= t.match.lastAt + Math.max(600, think) && this.once(`aim:${key}`)) {
          await this.mutateTable(t.id, (tt) => {
            if (!tt.match || tt.status !== 'playing' || tt.match.s.turnNo !== s.turnNo || tt.match.aim?.turnNo === s.turnNo) return null;
            const st = stateOf(tt);
            const bp = st.players[st.current];
            if ((bp.smoke ?? 0) > 0 && Math.random() < 0.3) usePower(st, bp.seat, 'smoke');
            const bm = chooseBotMove(cellView(st, false), st.size, st.mineCount, 'medium', Math.random, st.allowed, st.mode);
            tt.match.aim = { seat: st.current, index: bm.index, turnNo: st.turnNo, action: bm.action, at: this.now() };
            storeState(tt, st);
            return tt;
          });
        } else if (human && cur?.bot && aim && now >= aim.at + 900 && this.once(`bot:${key}`)) {
          await this.mutateTable(t.id, (tt) => {
            const a = tt.match?.aim;
            if (!tt.match || tt.status !== 'playing' || tt.match.s.turnNo !== s.turnNo || !a || a.turnNo !== s.turnNo) return null;
            const st = stateOf(tt);
            tt.match.aim = null;
            const r = reveal(st, st.current, a.index, a.action);
            if ('error' in r) return tt; // olmaz ama olursa: bir sonraki tıkta yeniden seçer
            this.applyOutcome(tt, st, r.outcome, false);
            return tt;
          });
        } else if (!human && cur?.bot && now >= t.match.lastAt + this.botDelay && this.once(`bot:${key}`)) {
          await this.mutateTable(t.id, (tt) => {
            if (!tt.match || tt.status !== 'playing' || tt.match.s.turnNo !== s.turnNo) return null;
            const st = stateOf(tt);
            const bm = chooseBotMove(cellView(st, false), st.size, st.mineCount, 'medium', Math.random, st.allowed, st.mode);
            const r = reveal(st, st.current, bm.index, bm.action);
            if ('error' in r) return null;
            this.applyOutcome(tt, st, r.outcome, false);
            return tt;
          });
        } else if (t.match.turnEndsAt && now >= t.match.turnEndsAt + 1200 && this.once(`to:${key}`)) {
          await this.mutateTable(t.id, (tt) => {
            if (!tt.match || tt.status !== 'playing' || tt.match.s.turnNo !== s.turnNo) return null;
            const st = stateOf(tt);
            const out = timeoutTurn(st, st.current, ECONOMY.afkEliminationTurns);
            if (!out) return null;
            this.applyOutcome(tt, st, out, false);
            return tt;
          });
        }
      }
      if (t.status === 'finished' && t.match?.results) await this.settle(t);
    } catch {
      /* yarış: başka bir oyuncu önce davrandı; bir sonraki tıkta yeniden denenir */
    } finally {
      this.ticking = false;
    }
    await this.settlePending().catch(() => undefined);
  }

  /** Aynı işi kısa sürede tekrar denememek için (kilit beklerken). */
  private once(key: string): boolean {
    const now = this.now();
    const [k, at] = this.lastAttempt.split('@');
    if (k === key && now - Number(at) < 1800) return false;
    this.lastAttempt = `${key}@${now}`;
    return true;
  }

  /** Çevrimdışı lobi boş kalmasın: botların açtığı, oturulmayı bekleyen birkaç masa. */
  private seeding = false;
  private async seedLocal(open: TableDoc[]): Promise<void> {
    if (this.seeding) return;
    const botOnly = open.filter((t) => t.status === 'waiting' && !t.seats.some((s) => !s.bot));
    // Kural güncellemesinden (ör. mod mayın çarpanı) önce açılmış bot masaları eski sayılarla kalmasın: kaldır, yenisi açılır.
    const stale = botOnly.filter((t) => t.mineCount !== minesForTable(TIERS[t.tier], t.boardSize, t.maxPlayers, optionsOf(t.options).density, t.mode));
    if (stale.length) {
      // silme anlık görüntüsü seedLocal'ı yeniden tetikler; o sırada ikinci kez masa açılmasın
      this.seeding = true;
      try {
        for (const t of stale) await this.db.doc(`tables/${t.id}`).delete().catch(() => undefined);
      } finally {
        this.seeding = false;
      }
    }
    const waiting = botOnly.filter((t) => !stale.includes(t));
    const specs: { tier: TierId; mode: ArenaMode; cap: 3 | 4; bots: number }[] = [
      { tier: 'bronze', mode: 'classic', cap: 3, bots: 1 },
      { tier: 'bronze', mode: 'treasure', cap: 4, bots: 2 },
      { tier: 'silver', mode: 'territory', cap: 3, bots: 2 },
      { tier: 'silver', mode: 'chain', cap: 4, bots: 1 },
      { tier: 'bronze', mode: 'hunter', cap: 3, bots: 2 },
      { tier: 'silver', mode: 'blitz', cap: 3, bots: 1 },
      { tier: 'gold', mode: 'classic', cap: 4, bots: 3 },
      { tier: 'diamond', mode: 'treasure', cap: 4, bots: 2 },
    ];
    const missing = specs.filter((sp) => !waiting.some((t) => t.tier === sp.tier && t.mode === sp.mode));
    if (!missing.length) return;
    this.seeding = true;
    try {
      for (const sp of missing) {
        const def = TIERS[sp.tier];
        const id = rid('t');
        const now = this.now();
        const seats: SeatDoc[] = Array.from({ length: sp.bots }, (_, i) => {
          const n = (TIER_ORDER.indexOf(sp.tier) + i) % BOT_NAMES.length;
          return { seat: i, uid: `bot-${i}-${id}`, bot: true, name: BOT_NAMES[n], avatar: BOT_AVATARS[n], level: this.botLevel(BOT_NAMES[n]) };
        });
        const t: TableDoc = {
          id,
          name: `${seats[0].name.replace('Bot ', '')} masası`,
          tier: sp.tier,
          mode: sp.mode,
          boardSize: boardFor(def, sp.cap).size,
          mineCount: minesForTable(def, boardFor(def, sp.cap).size, sp.cap, 'normal', sp.mode),
          entryFee: def.fee,
          maxPlayers: sp.cap,
          status: 'waiting',
          pw: null,
          ownerUid: seats[0].uid,
          createdAt: now,
          updatedAt: now,
          countdownEndsAt: null,
          seats,
          match: null,
        };
        await this.db.doc(`tables/${id}`).set(t as unknown as Record<string, unknown>);
      }
    } finally {
      this.seeding = false;
    }
  }

  /** Çevrimdışı: oturduğun masanın boş koltukları kısa süre sonra botlarla dolar. */
  private async autoFill(t: TableDoc): Promise<void> {
    await this.mutateTable(t.id, (tt) => {
      if (tt.status !== 'waiting' || tt.seats.length >= tt.maxPlayers || !tt.seats.some((s) => s.uid === this.uid)) return null;
      const taken = new Set(tt.seats.map((s) => s.seat));
      let seat = 0;
      while (taken.has(seat)) seat++;
      const used = new Set(tt.seats.map((s) => s.name));
      const n = BOT_NAMES.findIndex((x) => !used.has(x));
      const k = n < 0 ? seat % BOT_NAMES.length : n;
      tt.seats.push({ seat, uid: `bot-${seat}-${tt.id}`, bot: true, name: BOT_NAMES[k], avatar: BOT_AVATARS[k], level: this.botLevel(BOT_NAMES[k]) });
      this.maybeCountdown(tt);
      return tt;
    });
  }

  private minHumans(): number {
    return this.local ? 1 : 2;
  }

  /** Oda (emoji) sonradan hazır olursa bağlanır; açılış onu beklemez. */
  setRoom(room: HRoom | null): void {
    this.room = room;
    this.roomName = null;
    this.followRoom(this.tableSubId);
  }

  /** Çevrimdışı modda botlar da kalıcı rakiptir: maç sonucu kendi belgelerine işlenir (sıralama için). */
  private async settleBots(t: TableDoc): Promise<void> {
    const m = t.match!;
    for (const row of m.results ?? []) {
      const seat = t.seats.find((x) => x.seat === row.seat);
      if (!seat?.bot) continue;
      const id = botIdOf(seat.name);
      const ref = this.db.doc(`players/${id}`);
      const snap = await ref.get();
      const now = this.now();
      const week = weekStartOf(now);
      let p = snap.exists ? (snap.data() as unknown as PlayerDoc) : null;
      if (p?.settled?.includes(m.id)) continue;
      if (!p) p = { name: seat.name, avatar: seat.avatar, balance: 0, xp: 0, wins: 0, losses: 0, games: 0, best: null, week, wPoints: 0, wWins: 0, wGames: 0, wCoins: 0, lastDaily: null, streak: 0, lastRescue: null, seatAt: null, settled: [], recent: [], tx: [], createdAt: now };
      if (p.week !== week) p = { ...p, week, wPoints: 0, wWins: 0, wGames: 0, wCoins: 0 };
      const won = row.rank === 1;
      const delta = weeklyPointsDelta({ capacity: t.maxPlayers, tier: t.tier, rank: row.rank, safeOpened: row.safeOpened, defused: row.defused, chests: row.chests, eliminationReason: row.eliminationReason, opponentsAllWalkedAway: false, sameGroupMatchesThisWeek: 0 });
      const next: PlayerDoc = {
        ...p,
        xp: p.xp + xpGain({ won, safeOpened: row.safeOpened }),
        games: p.games + 1,
        wins: p.wins + (won ? 1 : 0),
        losses: p.losses + (won ? 0 : 1),
        wPoints: p.wPoints + delta,
        wWins: p.wWins + (won ? 1 : 0),
        wGames: p.wGames + 1,
        settled: [m.id, ...(p.settled ?? [])].slice(0, 60),
      };
      await ref.set(next as unknown as Record<string, unknown>);
    }
  }

  /** Maç bitince her oyuncu kendi belgesini günceller: ödül, puan, deneyim, istatistik (yalnızca bir kez). */
  private async settle(t: TableDoc): Promise<void> {
    const m = t.match!;
    const p = this.player;
    if (!p || p.settled?.includes(m.id) || this.settling.has(m.id)) return;
    const row = m.results!.find((r) => r.userId === this.uid);
    if (!row) return;
    this.settling.add(m.id);
    try {
      const group = m.s.players
        .map((x) => x.userId)
        .filter((u) => u !== this.uid)
        .sort()
        .join(',');
      const week = weekStartOf(this.now());
      const weekStart = Date.parse(week + 'T00:00:00Z');
      const sameGroup = (p.recent ?? []).filter((r) => r.group === group && r.finished_at >= weekStart).length;
      const others = m.s.players.filter((x) => x.userId !== this.uid);
      const walked = others.every((x) => x.eliminationReason === 'afk' || x.eliminationReason === 'left');
      const delta =
        m.humans >= this.minHumans()
          ? weeklyPointsDelta({
              capacity: t.maxPlayers,
              tier: t.tier,
              rank: row.rank,
              safeOpened: row.safeOpened,
              defused: row.defused,
              chests: row.chests,
              eliminationReason: row.eliminationReason,
              opponentsAllWalkedAway: row.rank === 1 && walked,
              sameGroupMatchesThisWeek: sameGroup,
            })
          : 0;
      const won = row.rank === 1;
      const xp = xpGain({ won, safeOpened: row.safeOpened });
      if (this.local) {
        // Botların puanı önce işlensin: yoksa ilk maçta sıralamada tek kişi görünüp "en iyi sıra #1" yazılıyordu.
        // Bot belgesi yazılamasa bile oyuncunun kendi hesaplaşması engellenmemeli.
        try {
          await this.settleBots(t);
          const q = await this.db.collection('players').where('week', '==', week).get();
          this.weekly = q.docs.filter((d) => d.exists).map((d) => ({ uid: d.id, p: d.data() as unknown as PlayerDoc }));
        } catch {
          /* sıralama bir sonraki anlık görüntüde güncellenir */
        }
      }
      await this.updatePlayer((pp) => {
        if (pp.settled?.includes(m.id)) return null;
        if (row.prize > 0) this.tx(pp, 'match-prize', row.prize);
        if (pp.games === 0 && ECONOMY.firstMatchBonus > 0) this.tx(pp, 'first-match-bonus', ECONOMY.firstMatchBonus);
        const recent: RecentDoc = {
          match_id: m.id,
          final_rank: row.rank,
          prize: row.prize,
          points_delta: delta,
          mines_triggered: row.mineHits,
          turn_count: row.moves,
          finished_at: this.now(),
          tier: t.tier,
          table_name: t.name,
          players: t.maxPlayers,
          mode: t.mode,
          group,
        };
        const next: PlayerDoc = {
          ...pp,
          xp: pp.xp + xp,
          games: pp.games + 1,
          wins: pp.wins + (won ? 1 : 0),
          losses: pp.losses + (won ? 0 : 1),
          wPoints: pp.wPoints + delta,
          wWins: pp.wWins + (won ? 1 : 0),
          wGames: pp.wGames + 1,
          wCoins: pp.wCoins + row.prize,
          seatAt: pp.seatAt === t.id ? null : pp.seatAt,
          settled: [m.id, ...(pp.settled ?? [])].slice(0, 60),
          recent: [recent, ...(pp.recent ?? [])].slice(0, 12),
        };
        // rankedWeekly ile aynı sıralama: eşit puanda galibiyet, sonra az maç öne geçer
        const ahead = (o: PlayerDoc) => o.wPoints > next.wPoints || (o.wPoints === next.wPoints && (o.wWins > next.wWins || (o.wWins === next.wWins && o.wGames < next.wGames)));
        const rankNow = 1 + this.weekly.filter((w) => w.uid !== this.uid && w.p.wGames > 0 && ahead(w.p)).length;
        next.best = next.best === null ? rankNow : Math.min(next.best, rankNow);
        return next;
      });
      // sonuç ekranında kendi satırımı güncel puan/deneyimle göster
      if (this.snap.match?.id === m.id && this.snap.match.results) {
        const results = this.snap.match.results.map((r) => (r.userId === this.uid ? { ...r, pointsDelta: delta, xp } : r));
        this.set({ match: { ...this.snap.match, results } });
      }
    } finally {
      this.settling.delete(m.id);
    }
  }

  /** Eski/terk edilmiş masaları siler (belge sınırını korumak için). */
  private async cleanup(): Promise<void> {
    try {
      const q = await this.db.collection('tables').where('updatedAt', '<', this.now() - 2 * 3600_000).limit(20).get();
      for (const d of q.docs) await this.db.doc(`tables/${d.id}`).delete();
    } catch {
      /* önemli değil */
    }
  }
}
