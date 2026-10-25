import { ECONOMY, TIERS, TIER_ORDER, boardFor, boardRange, feeRange, payout, weekStartOf } from '../../src/arena/economy';
import { minesForTable, optionsOf, parseOptions } from '../../src/arena/tableOptions';
import type { TableOptions } from '../../src/arena/tableOptions';
import type { TierId } from '../../src/arena/economy';
import { cellView, createArena, forfeit, modeView, rankedSeats, reveal, scan, timeoutTurn, usePower } from '../../src/arena/mines';
import { isMode } from '../../src/arena/modes';
import type { ArenaMode } from '../../src/arena/modes';
import type { ArenaState, MoveOutcome, PowerKind, ScanResult } from '../../src/arena/mines';
import { levelFromXp, weeklyPointsDelta, xpGain } from '../../src/arena/scoring';
import { matchSettings, turnSeconds } from '../../src/arena/rules';
import type { MatchView, QueueView, TableView, PlayerSeatView, ResultRow } from '../../src/arena/protocol';
import type { Accounts } from './accounts';
import type { Db } from './db';
import { applyWalletTx, WalletError } from './wallet';
import { ApiError, hashSecret, newId, rngInt, systemClock, verifySecret } from './util';
import type { Clock } from './util';

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(h: unknown): void;
}
export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Ağ katmanına giden bildirimler. */
export interface ArenaNotifier {
  lobby(): void;
  table(tableId: string, userIds: string[]): void;
  match(matchId: string, userIds: string[]): void;
  react(userIds: string[], ev: { matchId: string; seat: number; emoji: string; id: string }): void;
  user(userId: string): void;
  queue(userId: string): void;
}
const noop: ArenaNotifier = { lobby() {}, table() {}, match() {}, react() {}, user() {}, queue() {} };

interface TableRow {
  id: string;
  name: string;
  tier: TierId;
  mode: ArenaMode;
  difficulty: string;
  board_size: number;
  mine_count: number;
  entry_fee: number;
  max_players: number;
  current_players: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  password_hash: string | null;
  created_by: string;
  created_at: number;
  countdown_ends_at: number | null;
  options: string | null;
}
interface SeatRow {
  id: number;
  table_id: string;
  user_id: string;
  seat_number: number;
  status: string;
  entry_fee_paid: number;
}

interface LiveMatch {
  id: string;
  tableId: string;
  tier: TierId;
  mode: ArenaMode;
  capacity: number;
  options: TableOptions;
  state: ArenaState;
  prizePool: number;
  startedAt: number;
  turnEndsAt: number | null;
  timer: unknown;
  seq: number;
  lastMove: MoveOutcome | null;
  results: ResultRow[] | null;
}

interface QueueEntry {
  userId: string;
  tier: TierId;
  mode: ArenaMode;
  maxFee: number;
  since: number;
  timer: unknown;
}

export interface ArenaOptions {
  clock?: Clock;
  scheduler?: Scheduler;
  rng?: (n: number) => number;
  /** Bir oyuncunun çevrimiçi olup olmadığı (bekleme odasındaki terk edilmiş koltukları boşaltmak için). */
  isOnline?: (userId: string) => boolean;
  /** Bekleme odasında bağlantısı kopan oyuncunun koltuğu kaç ms sonra boşaltılır. */
  waitingGraceMs?: number;
}

export interface CreateTableInput {
  mode?: unknown;
  name?: unknown;
  tier?: unknown;
  boardSize?: unknown;
  entryFee?: unknown;
  capacity?: unknown;
  password?: unknown;
  options?: unknown;
}

const isTier = (v: unknown): v is TierId => typeof v === 'string' && (TIER_ORDER as string[]).includes(v);

export class Arena {
  notify: ArenaNotifier = noop;
  private clock: Clock;
  private sched: Scheduler;
  private rng: (n: number) => number;
  private isOnline: (u: string) => boolean;
  private graceMs: number;
  private live = new Map<string, LiveMatch>();
  private countdowns = new Map<string, unknown>();
  private queue = new Map<string, QueueEntry>();
  private graceTimers = new Map<string, unknown>();
  /** Biten maçların son görünümü (kısa süre tutulur; yeniden bağlanan oyuncu sonucu görebilsin). */
  private recent = new Map<string, LiveMatch>();

  constructor(
    private db: Db,
    private accounts: Accounts,
    opts: ArenaOptions = {},
  ) {
    this.clock = opts.clock ?? systemClock;
    this.sched = opts.scheduler ?? realScheduler;
    this.rng = opts.rng ?? rngInt;
    this.isOnline = opts.isOnline ?? (() => true);
    this.graceMs = opts.waitingGraceMs ?? 45_000;
  }

  private now() {
    return this.clock.now();
  }

  // ------------------------------------------------------------------ görünümler

  private table(id: string): TableRow | undefined {
    return this.db.get<TableRow>('SELECT * FROM tables WHERE id = ?', id);
  }
  private seats(tableId: string): SeatRow[] {
    return this.db.all<SeatRow>("SELECT * FROM table_players WHERE table_id = ? AND status IN ('seated','playing') ORDER BY seat_number", tableId);
  }
  private seatOf(userId: string): SeatRow | undefined {
    return this.db.get<SeatRow>("SELECT * FROM table_players WHERE user_id = ? AND status IN ('seated','playing')", userId);
  }

  tableView(t: TableRow): TableView {
    const players: PlayerSeatView[] = this.seats(t.id).map((s) => {
      const u = this.accounts.publicUser(s.user_id)!;
      return { userId: u.id, username: u.username, avatar: u.avatar, level: u.level, seat: s.seat_number };
    });
    return {
      id: t.id,
      name: t.name,
      tier: t.tier,
      mode: t.mode ?? 'classic',
      boardSize: t.board_size,
      mineCount: t.mine_count,
      entryFee: t.entry_fee,
      maxPlayers: t.max_players,
      options: optionsOf(t.options ? JSON.parse(t.options) : null),
      players,
      status: t.status,
      locked: !!t.password_hash,
      prizePool: t.entry_fee * players.length,
      maxPrizePool: t.entry_fee * t.max_players,
      houseFeePercent: ECONOMY.houseFeePercent,
      countdownEndsAt: t.countdown_ends_at,
      ownerId: t.created_by,
      matchId: t.status === 'playing' ? (this.db.get<{ id: string }>('SELECT id FROM matches WHERE table_id = ?', t.id)?.id ?? null) : null,
    };
  }

  listTables(): TableView[] {
    return this.db
      .all<TableRow>("SELECT * FROM tables WHERE status IN ('waiting','countdown','playing') ORDER BY CASE status WHEN 'playing' THEN 1 ELSE 0 END, created_at DESC LIMIT 200")
      .map((t) => this.tableView(t));
  }

  getTableView(id: string): TableView | null {
    const t = this.table(id);
    return t ? this.tableView(t) : null;
  }

  matchView(matchId: string, viewerId: string): MatchView | null {
    const m = this.live.get(matchId) ?? this.recent.get(matchId);
    if (!m) return null;
    const s = m.state;
    const finished = s.phase === 'finished';
    const t = this.table(m.tableId);
    return {
      id: m.id,
      tableId: m.tableId,
      tableName: t?.name ?? '',
      tier: m.tier,
      ...modeView(s, finished),
      size: s.size,
      mineCount: s.mineCount,
      cells: cellView(s, finished),
      players: s.players.map((p) => {
        const u = this.accounts.publicUser(p.userId)!;
        return {
          userId: p.userId,
          username: u.username,
          avatar: u.avatar,
          level: u.level,
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
          pass: p.pass ?? 0,
          force: p.force ?? 0,
        };
      }),
      viewerSeat: s.players.find((p) => p.userId === viewerId)?.seat ?? null,
      current: s.current,
      turnNo: s.turnNo,
      turnEndsAt: finished ? null : m.turnEndsAt,
      serverNow: this.now(),
      turnSeconds: turnSeconds(m.state.mode, m.options),
      phase: s.phase,
      winnerSeat: s.winnerSeat,
      endReason: s.endReason,
      prizePool: m.prizePool,
      safeLeft: s.safeLeft,
      seq: m.seq,
      lastMove: m.lastMove,
      startedAt: m.startedAt,
      results: finished ? m.results : null,
    };
  }

  /** Kullanıcının şu anki bağlamı (yeniden bağlanınca doğru ekrana dönmesi için). */
  contextFor(userId: string): { table: TableView | null; matchId: string | null; queue: QueueView | null } {
    const seat = this.seatOf(userId);
    const table = seat ? this.getTableView(seat.table_id) : null;
    return { table, matchId: table?.matchId ?? null, queue: this.queueView(userId) };
  }

  // ------------------------------------------------------------------ masa açma

  async createTable(userId: string, input: CreateTableInput): Promise<TableView> {
    const tier = isTier(input.tier) ? input.tier : 'bronze';
    const mode: ArenaMode = isMode(input.mode) ? input.mode : 'classic';
    const def = TIERS[tier];
    const name = (typeof input.name === 'string' ? input.name.trim() : '').slice(0, ECONOMY.custom.nameMax) || `${def.label} Masa`;
    const capGuess = input.capacity === undefined ? def.capacity : Number(input.capacity);
    const boardSize = input.boardSize === undefined ? boardFor(def, capGuess).size : Number(input.boardSize);
    const br = boardRange(def);
    if (!Number.isInteger(boardSize) || boardSize < br.min || boardSize > br.max) throw new ApiError('bad-board');
    const entryFee = input.entryFee === undefined ? def.fee : Number(input.entryFee);
    const fr = feeRange(def);
    if (!Number.isInteger(entryFee) || entryFee < fr.min || entryFee > fr.max) throw new ApiError('bad-fee');
    const capacity = input.capacity === undefined ? def.capacity : Number(input.capacity);
    if (!(ECONOMY.custom.capacities as readonly number[]).includes(capacity)) throw new ApiError('bad-capacity');
    const options = parseOptions(input.options);
    if (!options) throw new ApiError('bad-options');
    let passwordHash: string | null = null;
    if (input.password !== undefined && input.password !== null && input.password !== '') {
      const pw = String(input.password);
      if (pw.length < ECONOMY.custom.passwordMin || pw.length > ECONOMY.custom.passwordMax) throw new ApiError('bad-password');
      passwordHash = await hashSecret(pw);
    }
    const id = this.createTableSync(userId, { tier, mode, name, boardSize, entryFee, capacity, passwordHash, options });
    return this.getTableView(id)!;
  }

  private createTableSync(userId: string, o: { tier: TierId; mode: ArenaMode; name: string; boardSize: number; entryFee: number; capacity: number; passwordHash: string | null; options?: TableOptions }): string {
    const opts = o.options ?? optionsOf(null);
    const id = newId('t');
    const now = this.now();
    this.db.tx(() => {
      if (this.seatOf(userId)) throw new ApiError('already-seated', 409);
      this.db.run(
        `INSERT INTO tables (id, name, tier, mode, difficulty, board_size, mine_count, entry_fee, max_players, current_players, status, password_hash, created_by, created_at, options)
         VALUES (?,?,?,?,?,?,?,?,?,0,'waiting',?,?,?,?)`,
        id,
        o.name,
        o.tier,
        o.mode,
        TIERS[o.tier].label,
        o.boardSize,
        minesForTable(TIERS[o.tier], o.boardSize, o.capacity, opts.density, o.mode),
        o.entryFee,
        o.capacity,
        o.passwordHash,
        userId,
        now,
        JSON.stringify(opts),
      );
      this.seatUser(id, userId); // masa sahibi ilk oyuncu olarak oturur ve ücreti ödenir
    });
    this.dropFromQueue(userId);
    this.notify.lobby();
    this.notify.user(userId);
    this.notify.table(id, [userId]);
    return id;
  }

  /** tx içinde çağrılır: koltuk + ücret tahsili. */
  private seatUser(tableId: string, userId: string): SeatRow {
    const t = this.table(tableId);
    if (!t) throw new ApiError('table-not-found', 404);
    if (t.status !== 'waiting') throw new ApiError('table-not-joinable', 409);
    if (this.seatOf(userId)) throw new ApiError('already-seated', 409);
    const seats = this.seats(tableId);
    if (seats.length >= t.max_players) throw new ApiError('table-full', 409);
    const taken = new Set(seats.map((s) => s.seat_number));
    let seat = 0;
    while (taken.has(seat)) seat++;
    this.db.run("INSERT INTO table_players (table_id, user_id, seat_number, status, entry_fee_paid, joined_at) VALUES (?,?,?,'seated',?,?)", tableId, userId, seat, t.entry_fee, this.now());
    const row = this.db.get<SeatRow>("SELECT * FROM table_players WHERE table_id = ? AND user_id = ? AND status = 'seated'", tableId, userId)!;
    try {
      applyWalletTx(this.db, { userId, type: 'entry-fee', amount: -t.entry_fee, key: `fee:${row.id}`, tableId, now: this.now() });
    } catch (e) {
      if (e instanceof WalletError && e.code === 'insufficient') throw new ApiError('insufficient-funds', 402);
      throw e;
    }
    this.db.run('UPDATE tables SET current_players = ? WHERE id = ?', seats.length + 1, tableId);
    return row;
  }

  // ------------------------------------------------------------------ katılma / ayrılma

  async joinTable(userId: string, tableId: string, password?: unknown): Promise<TableView> {
    const t = this.table(tableId);
    if (!t) throw new ApiError('table-not-found', 404);
    if (t.password_hash) {
      if (typeof password !== 'string' || !(await verifySecret(password, t.password_hash))) throw new ApiError('wrong-password', 403);
    }
    this.joinSync(userId, tableId);
    return this.getTableView(tableId)!;
  }

  private joinSync(userId: string, tableId: string): void {
    this.db.tx(() => this.seatUser(tableId, userId));
    this.dropFromQueue(userId);
    const t = this.table(tableId)!;
    this.notify.user(userId);
    this.notify.table(tableId, this.seats(tableId).map((s) => s.user_id));
    if (t.current_players >= t.max_players) this.startCountdown(tableId);
    this.notify.lobby();
  }

  /** Masadan ayrılma. Başlamadan önce: ücret iade, koltuk boşalır. Maç sırasında: hükmen eleme (ücret iade edilmez). */
  leaveTable(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat) {
      this.dropFromQueue(userId);
      return;
    }
    const t = this.table(seat.table_id)!;
    if (t.status === 'playing') {
      // Maçtan çıkış: elenmemişse önce hükmen elenir; sonra masadan ayrılır (maçın bitmesini beklemez).
      // Sonuç ve ödül maç bitince yine kesinleşir.
      const m = [...this.live.values()].find((x) => x.tableId === t.id);
      if (m) this.forfeitInMatch(m, userId);
      this.db.run("UPDATE table_players SET status='left' WHERE id = ? AND status='playing'", seat.id);
      this.notify.user(userId);
      this.notify.table(t.id, [userId]);
      return;
    }
    this.db.tx(() => {
      this.db.run("UPDATE table_players SET status = 'refunded' WHERE id = ?", seat.id);
      if (ECONOMY.refundOnLeaveBeforeStart && seat.entry_fee_paid > 0)
        applyWalletTx(this.db, { userId, type: 'entry-refund', amount: seat.entry_fee_paid, key: `refund:${seat.id}`, tableId: t.id, now: this.now() });
      const rest = this.seats(t.id);
      if (rest.length === 0) {
        this.db.run("UPDATE tables SET status='cancelled', current_players=0, countdown_ends_at=NULL WHERE id = ?", t.id);
      } else {
        // geri sayım sürüyorsa iptal edilir, masa yeniden beklemeye döner; sahip ayrıldıysa sahiplik devreder
        this.db.run("UPDATE tables SET status='waiting', current_players=?, countdown_ends_at=NULL, created_by = CASE WHEN created_by = ? THEN ? ELSE created_by END WHERE id = ?", rest.length, userId, rest[0].user_id, t.id);
      }
    });
    this.cancelCountdown(t.id);
    this.clearGrace(userId);
    this.notify.user(userId);
    this.notify.table(t.id, [userId, ...this.seats(t.id).map((s) => s.user_id)]);
    this.notify.lobby();
  }

  // ------------------------------------------------------------------ geri sayım ve başlatma

  private startCountdown(tableId: string): void {
    if (this.countdowns.has(tableId)) return;
    const ends = this.now() + ECONOMY.countdownSeconds * 1000;
    const changed = this.db.run("UPDATE tables SET status='countdown', countdown_ends_at=? WHERE id = ? AND status='waiting'", ends, tableId).changes;
    if (!changed) return;
    this.countdowns.set(
      tableId,
      this.sched.set(() => {
        this.countdowns.delete(tableId);
        this.startMatch(tableId);
      }, ECONOMY.countdownSeconds * 1000),
    );
    this.notify.table(tableId, this.seats(tableId).map((s) => s.user_id));
    this.notify.lobby();
  }

  private cancelCountdown(tableId: string): void {
    const h = this.countdowns.get(tableId);
    if (h !== undefined) {
      this.sched.clear(h);
      this.countdowns.delete(tableId);
    }
  }

  /** Masa doluysa maçı başlatır. Aynı masa için ikinci maç veritabanı kısıtıyla da engellenir. */
  startMatch(tableId: string): string | null {
    const now = this.now();
    let created: LiveMatch | null = null;
    try {
      this.db.tx(() => {
        const t = this.table(tableId);
        if (!t || t.status !== 'countdown') return;
        const seats = this.seats(tableId);
        if (seats.length !== t.max_players) {
          this.db.run("UPDATE tables SET status='waiting', countdown_ends_at=NULL WHERE id = ?", tableId);
          return;
        }
        // Bütün giriş ücretlerinin gerçekten tahsil edildiğini doğrula.
        for (const s of seats) {
          const paid = this.db.get<{ amount: number }>('SELECT amount FROM wallet_transactions WHERE idempotency_key = ?', `fee:${s.id}`);
          if (!paid || -paid.amount !== t.entry_fee || s.entry_fee_paid !== t.entry_fee) throw new ApiError('fee-mismatch', 500);
        }
        const topts = optionsOf(t.options ? JSON.parse(t.options) : null);
        const state = createArena(t.board_size, t.mine_count, seats.map((s) => s.user_id), this.rng, matchSettings(t.mode ?? 'classic', topts), t.mode ?? 'classic');
        state.current = this.rng(seats.length);
        const id = newId('m');
        const pool = t.entry_fee * seats.length; // havuz başlamadan kesinleşir
        this.db.run(
          `INSERT INTO matches (id, table_id, status, current_turn_user_id, board_state, mine_positions, prize_pool, started_at, turn_ends_at)
           VALUES (?,?,'active',?,?,?,?,?,?)`,
          id,
          tableId,
          state.players[state.current].userId,
          JSON.stringify(state),
          JSON.stringify(state.mines),
          pool,
          now,
          now + turnSeconds(t.mode ?? 'classic', topts) * 1000,
        );
        for (const s of seats) {
          this.db.run('INSERT INTO match_players (match_id, user_id, seat_number, lives) VALUES (?,?,?,?)', id, s.user_id, s.seat_number, state.players[0].lives);
        }
        this.db.run("UPDATE table_players SET status='playing' WHERE table_id = ? AND status='seated'", tableId);
        this.db.run("UPDATE tables SET status='playing', countdown_ends_at=NULL WHERE id = ?", tableId);
        created = { id, tableId, tier: t.tier, mode: t.mode ?? 'classic', capacity: t.max_players, options: topts, state, prizePool: pool, startedAt: now, turnEndsAt: null, timer: null, seq: 0, lastMove: null, results: null };
      });
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) return null; // ikinci başlatma denemesi
      throw e;
    }
    const m = created as LiveMatch | null;
    if (!m) {
      this.notify.table(tableId, this.seats(tableId).map((s) => s.user_id));
      this.notify.lobby();
      return null;
    }
    this.live.set(m.id, m);
    this.armTurn(m);
    const users = m.state.players.map((p) => p.userId);
    this.notify.table(tableId, users);
    this.notify.match(m.id, users);
    this.notify.lobby();
    return m.id;
  }

  // ------------------------------------------------------------------ maç

  private armTurn(m: LiveMatch): void {
    if (m.timer !== null) this.sched.clear(m.timer);
    m.timer = null;
    if (m.state.phase !== 'playing') {
      m.turnEndsAt = null;
      return;
    }
    const turnNo = m.state.turnNo;
    const secs = turnSeconds(m.state.mode, m.options);
    m.turnEndsAt = this.now() + secs * 1000;
    m.timer = this.sched.set(() => this.onTimeout(m.id, turnNo), secs * 1000);
  }

  private onTimeout(matchId: string, turnNo: number): void {
    const m = this.live.get(matchId);
    if (!m || m.state.turnNo !== turnNo || m.state.phase !== 'playing') return;
    const out = timeoutTurn(m.state, m.state.current, ECONOMY.afkEliminationTurns);
    if (out) this.afterMove(m, out);
  }

  move(userId: string, matchId: string, index: unknown, action: 'open' | 'defuse' = 'open'): MoveOutcome {
    const m = this.live.get(matchId);
    if (!m) throw new ApiError('match-not-found', 404);
    const p = m.state.players.find((x) => x.userId === userId);
    if (!p) throw new ApiError('not-in-match', 403);
    if (typeof index !== 'number') throw new ApiError('out-of-bounds');
    const r = reveal(m.state, p.seat, index, action);
    if ('error' in r) throw new ApiError(r.error, 409);
    this.afterMove(m, r.outcome);
    return r.outcome;
  }

  /** Güç kullan: Pas sırayı geçirir (hamle gibi işlenir); Zorla bu turdaki hamleden sonra sıradakini kısıtlar. */
  power(userId: string, matchId: string, kind: unknown): { kind: PowerKind } {
    const m = this.live.get(matchId);
    if (!m) throw new ApiError('match-not-found', 404);
    const p = m.state.players.find((x) => x.userId === userId);
    if (!p) throw new ApiError('not-in-match', 403);
    if (kind !== 'pass' && kind !== 'force') throw new ApiError('bad-request');
    const r = usePower(m.state, p.seat, kind);
    if ('error' in r) throw new ApiError(r.error, 409);
    if (r.outcome) this.afterMove(m, r.outcome);
    else {
      this.db.run('UPDATE matches SET board_state = ? WHERE id = ?', JSON.stringify(m.state), m.id);
      this.notify.match(m.id, m.state.players.map((x) => x.userId));
    }
    return { kind: r.kind };
  }

  /** Sonar: sonuç yalnızca kullanana döner; sıra değişmez. */
  scanCell(userId: string, matchId: string, index: unknown): ScanResult {
    const m = this.live.get(matchId);
    if (!m) throw new ApiError('match-not-found', 404);
    const p = m.state.players.find((x) => x.userId === userId);
    if (!p) throw new ApiError('not-in-match', 403);
    if (typeof index !== 'number') throw new ApiError('out-of-bounds');
    const r = scan(m.state, p.seat, index);
    if ('error' in r) throw new ApiError(r.error, 409);
    this.db.run('UPDATE matches SET board_state = ? WHERE id = ?', JSON.stringify(m.state), m.id);
    this.notify.match(m.id, m.state.players.map((x) => x.userId));
    return r;
  }

  private lastReact = new Map<string, number>();
  /** Emoji atışması: maçtaki herkese iletilir; kişi başı saniyede en fazla bir. */
  react(userId: string, matchId: string, emoji: string): void {
    const m = this.live.get(matchId) ?? this.recent.get(matchId);
    if (!m) throw new ApiError('match-not-found', 404);
    const p = m.state.players.find((x) => x.userId === userId);
    if (!p) throw new ApiError('not-in-match', 403);
    const now = this.now();
    if (now - (this.lastReact.get(userId) ?? 0) < 900) return;
    this.lastReact.set(userId, now);
    this.notify.react(
      m.state.players.map((x) => x.userId),
      { matchId, seat: p.seat, emoji, id: `${now.toString(36)}${p.seat}` },
    );
  }

  private forfeitInMatch(m: LiveMatch, userId: string): void {
    const p = m.state.players.find((x) => x.userId === userId);
    if (!p) return;
    const wasCurrent = m.state.current === p.seat;
    const out = forfeit(m.state, p.seat);
    if (!out) return;
    this.afterMove(m, out, !wasCurrent);
  }

  private afterMove(m: LiveMatch, out: MoveOutcome, keepTimer = false): void {
    m.seq++;
    m.lastMove = out;
    const s = m.state;
    this.db.tx(() => {
      this.db.run('UPDATE matches SET board_state = ?, current_turn_user_id = ? WHERE id = ?', JSON.stringify(s), s.players[s.current].userId, m.id);
      for (const p of s.players)
        this.db.run('UPDATE match_players SET lives=?, eliminated=?, turn_count=?, mines_triggered=?, safe_opened=? WHERE match_id=? AND user_id=?', p.lives, p.eliminated, p.moves, p.mineHits, p.safeOpened, m.id, p.userId);
    });
    if (s.phase === 'finished') {
      if (m.timer !== null) this.sched.clear(m.timer);
      m.timer = null;
      m.turnEndsAt = null;
      this.settle(m);
    } else if (!keepTimer) {
      this.armTurn(m);
    }
    if (!keepTimer || s.phase === 'finished') this.db.run('UPDATE matches SET turn_ends_at = ? WHERE id = ?', m.turnEndsAt, m.id);
    const users = s.players.map((p) => p.userId);
    this.notify.match(m.id, users);
    if (s.phase === 'finished') {
      for (const u of users) this.notify.user(u);
      this.notify.table(m.tableId, users);
      this.notify.lobby();
    }
  }

  /** Maç sonucunu tek transaction'da kesinleştirir; ikinci kez çağrılsa da hiçbir şey değişmez. */
  private settle(m: LiveMatch): void {
    const now = this.now();
    const s = m.state;
    const order = rankedSeats(s);
    const week = weekStartOf(now);
    const weekStartMs = Date.parse(week + 'T00:00:00Z');
    const results: ResultRow[] = [];
    this.db.tx(() => {
      const row = this.db.get<{ settled: number }>('SELECT settled FROM matches WHERE id = ?', m.id);
      if (!row || row.settled) return;
      const winnerSeat = order[0];
      const winner = s.players[winnerSeat];
      const pay = payout(m.prizePool, m.prizePool / Math.max(1, s.players.length), s.players.length);
      const ids = s.players.map((p) => p.userId).sort();
      // Aynı oyuncu kümesiyle bu hafta biten maç sayısı (anlaşmalı puan toplamayı zorlaştırır).
      const candidates = this.db.all<{ match_id: string }>(
        "SELECT mp.match_id FROM match_players mp JOIN matches mm ON mm.id = mp.match_id WHERE mp.user_id = ? AND mm.status = 'finished' AND mm.finished_at >= ?",
        ids[0],
        weekStartMs,
      );
      let sameGroup = 0;
      for (const c of candidates) {
        const set = this.db.all<{ user_id: string }>('SELECT user_id FROM match_players WHERE match_id = ? ORDER BY user_id', c.match_id).map((r) => r.user_id);
        if (set.length === ids.length && set.every((v, i) => v === ids[i])) sameGroup++;
      }
      const others = s.players.filter((p) => p.seat !== winnerSeat);
      const walkedAway = others.every((p) => p.eliminationReason === 'afk' || p.eliminationReason === 'left');

      order.forEach((seat, i) => {
        const p = s.players[seat];
        const rank = i + 1;
        const won = rank === 1;
        const prize = won ? pay.winner : rank === 2 ? pay.second : 0;
        const delta = weeklyPointsDelta({
          capacity: m.capacity,
          tier: m.tier,
          rank,
          safeOpened: p.safeOpened,
          defused: p.defused ?? 0,
          chests: p.chests,
          eliminationReason: p.eliminationReason,
          opponentsAllWalkedAway: won && walkedAway,
          sameGroupMatchesThisWeek: sameGroup,
        });
        const xp = xpGain({ won, safeOpened: p.safeOpened });
        const u = this.db.get<{ experience: number; games_played: number }>('SELECT experience, games_played FROM users WHERE id = ?', p.userId)!;
        // ikincinin iadesi ayrı anahtarla: aynı anahtar ikinci işlemi "zaten yapıldı" sayıp yutuyordu
        if (prize > 0) applyWalletTx(this.db, { userId: p.userId, type: 'match-prize', amount: prize, key: won ? `prize:${m.id}` : `prize2:${m.id}`, matchId: m.id, tableId: m.tableId, now });
        if (u.games_played === 0 && ECONOMY.firstMatchBonus > 0)
          applyWalletTx(this.db, { userId: p.userId, type: 'first-match-bonus', amount: ECONOMY.firstMatchBonus, key: `first-match:${p.userId}`, matchId: m.id, now });
        const newXp = u.experience + xp;
        this.db.run(
          'UPDATE users SET experience = ?, level = ?, games_played = games_played + 1, total_wins = total_wins + ?, total_losses = total_losses + ? WHERE id = ?',
          newXp,
          levelFromXp(newXp),
          won ? 1 : 0,
          won ? 0 : 1,
          p.userId,
        );
        this.db.run(
          `INSERT INTO weekly_leaderboard (user_id, week_start, points, wins, games_played, coins_won) VALUES (?,?,?,?,1,?)
           ON CONFLICT(user_id, week_start) DO UPDATE SET points = points + excluded.points, wins = wins + excluded.wins, games_played = games_played + 1, coins_won = coins_won + excluded.coins_won`,
          p.userId,
          week,
          delta,
          won ? 1 : 0,
          prize,
        );
        this.db.run('UPDATE match_players SET final_rank = ?, points_delta = ?, prize = ? WHERE match_id = ? AND user_id = ?', rank, delta, prize, m.id, p.userId);
        results.push({ userId: p.userId, seat, rank, prize, pointsDelta: delta, xp, moves: p.moves, mineHits: p.mineHits, safeOpened: p.safeOpened, territory: p.territory, chests: p.chests, defused: p.defused ?? 0, eliminationReason: p.eliminationReason });
      });
      // en iyi haftalık sıra
      for (const p of s.players) {
        const pts = this.db.get<{ points: number }>('SELECT points FROM weekly_leaderboard WHERE user_id = ? AND week_start = ?', p.userId, week)!.points;
        const rank = 1 + (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM weekly_leaderboard WHERE week_start = ? AND points > ?', week, pts)?.n ?? 0);
        this.db.run('UPDATE users SET best_weekly_rank = CASE WHEN best_weekly_rank IS NULL OR best_weekly_rank > ? THEN ? ELSE best_weekly_rank END WHERE id = ?', rank, rank, p.userId);
      }
      this.db.run("UPDATE matches SET status='finished', settled=1, winner_user_id=?, finished_at=? WHERE id = ?", winner.userId, now, m.id);
      this.db.run("UPDATE table_players SET status='finished' WHERE table_id = ? AND status='playing'", m.tableId);
      this.db.run("UPDATE tables SET status='finished' WHERE id = ?", m.tableId);
    });
    m.results = results.length ? results : m.results;
    this.live.delete(m.id);
    this.recent.set(m.id, m);
    this.sched.set(() => this.recent.delete(m.id), 10 * 60_000);
  }

  /** Bir maçı sonuçlandırmadan kapatır ve tüm giriş ücretlerini iade eder (sunucu hatası politikası). */
  abortMatch(matchId: string): void {
    const now = this.now();
    const row = this.db.get<{ table_id: string; status: string }>('SELECT table_id, status FROM matches WHERE id = ?', matchId);
    if (!row || row.status !== 'active') return;
    this.db.tx(() => {
      for (const s of this.db.all<SeatRow>("SELECT * FROM table_players WHERE table_id = ? AND status IN ('playing','seated')", row.table_id)) {
        if (ECONOMY.refundOnServerAbort && s.entry_fee_paid > 0)
          applyWalletTx(this.db, { userId: s.user_id, type: 'abort-refund', amount: s.entry_fee_paid, key: `refund:${s.id}`, tableId: row.table_id, matchId, now });
        this.db.run("UPDATE table_players SET status='refunded' WHERE id = ?", s.id);
      }
      this.db.run("UPDATE matches SET status='aborted', finished_at=?, settled=1 WHERE id = ?", now, matchId);
      this.db.run("UPDATE tables SET status='cancelled' WHERE id = ?", row.table_id);
    });
    const m = this.live.get(matchId);
    if (m?.timer) this.sched.clear(m.timer);
    this.live.delete(matchId);
  }

  /**
   * Sunucu açılışında: yarıda kalmış maçlar iade edilerek kapatılır; geri sayımdaki masalar beklemeye döner
   * (dolu ise yeniden geri sayım başlar). Biten haftalar arşivlenir.
   */
  recover(): { aborted: number } {
    const active = this.db.all<{ id: string }>("SELECT id FROM matches WHERE status = 'active'");
    for (const a of active) this.abortMatch(a.id);
    this.db.run("UPDATE tables SET status='waiting', countdown_ends_at=NULL WHERE status='countdown'");
    for (const t of this.db.all<TableRow>("SELECT * FROM tables WHERE status='waiting'")) if (t.current_players >= t.max_players) this.startCountdown(t.id);
    this.settleWeeks();
    return { aborted: active.length };
  }

  // ------------------------------------------------------------------ hemen oyna

  private queueView(userId: string): QueueView | null {
    const q = this.queue.get(userId);
    if (!q) return null;
    const def = TIERS[q.tier];
    const waiting = [...this.queue.values()].filter((x) => x.tier === q.tier).length;
    return { tier: q.tier, mode: q.mode, entryFee: def.fee, waitingPlayers: waiting, since: q.since, capacity: def.capacity };
  }

  /** Oyuncunun bütçesi ve tercihine uygun tier: istenen, yoksa karşılayabildiği en yüksek. */
  private pickTier(balance: number, tier: TierId | 'any', maxFee: number): TierId | null {
    const cap = Math.min(balance, maxFee);
    if (tier !== 'any') return TIERS[tier].fee <= cap ? tier : null;
    const ok = TIER_ORDER.filter((t) => TIERS[t].fee <= cap);
    return ok.length ? ok[ok.length - 1] : null;
  }

  quickStart(userId: string, opts: { tier?: unknown; maxFee?: unknown; mode?: unknown }): { joined: string | null; queued: boolean } {
    if (this.seatOf(userId)) throw new ApiError('already-seated', 409);
    if (this.queue.has(userId)) return { joined: null, queued: true };
    const tierPref: TierId | 'any' = isTier(opts.tier) ? opts.tier : 'any';
    const mode: ArenaMode = isMode(opts.mode) ? opts.mode : 'classic';
    const maxFee = Number.isInteger(opts.maxFee) && (opts.maxFee as number) > 0 ? (opts.maxFee as number) : Number.MAX_SAFE_INTEGER;
    const balance = this.accounts.me(userId).balance;
    const cap = Math.min(balance, maxFee);
    // 1) İstenmeyen yüksek ücretli masaya asla yerleştirilmez: ücret ≤ min(bakiye, üst sınır).
    const candidates = this.db
      .all<TableRow>(
        "SELECT * FROM tables WHERE status = 'waiting' AND password_hash IS NULL AND entry_fee <= ? AND current_players < max_players ORDER BY current_players DESC, created_at ASC",
        cap,
      )
      .filter((t) => (tierPref === 'any' || t.tier === tierPref) && (t.mode ?? 'classic') === mode);
    for (const t of candidates) {
      try {
        this.joinSync(userId, t.id);
        return { joined: t.id, queued: false };
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
      }
    }
    const tier = this.pickTier(balance, tierPref, maxFee);
    if (!tier) throw new ApiError('insufficient-funds', 402);
    const entry: QueueEntry = { userId, tier, mode, maxFee, since: this.now(), timer: null };
    entry.timer = this.sched.set(() => this.queueTimeout(userId), ECONOMY.quickplay.waitSeconds * 1000);
    this.queue.set(userId, entry);
    this.matchQueue(tier, mode);
    if (this.queue.has(userId)) this.notifyQueue(tier);
    return { joined: null, queued: this.queue.has(userId) };
  }

  quickCancel(userId: string): boolean {
    const had = this.queue.has(userId);
    const tier = this.queue.get(userId)?.tier;
    this.dropFromQueue(userId);
    this.notify.queue(userId);
    if (tier) this.notifyQueue(tier);
    return had;
  }

  private dropFromQueue(userId: string): void {
    const q = this.queue.get(userId);
    if (!q) return;
    if (q.timer !== null) this.sched.clear(q.timer);
    this.queue.delete(userId);
    this.notify.queue(userId);
  }

  private notifyQueue(tier: TierId): void {
    for (const q of this.queue.values()) if (q.tier === tier) this.notify.queue(q.userId);
  }

  /** Aynı tier'da kapasite kadar bekleyen varsa onlar için masa kurulur. */
  private matchQueue(tier: TierId, mode: ArenaMode): void {
    const group = [...this.queue.values()].filter((q) => q.tier === tier && q.mode === mode).sort((a, b) => a.since - b.since);
    const def = TIERS[tier];
    if (group.length < def.capacity) return;
    const members = group.slice(0, def.capacity);
    const [owner, ...rest] = members;
    let tableId: string;
    try {
      tableId = this.createTableSync(owner.userId, { tier, mode, name: `${def.label} · Hızlı`, boardSize: def.board, entryFee: def.fee, capacity: def.capacity, passwordHash: null });
    } catch {
      this.dropFromQueue(owner.userId);
      return;
    }
    for (const r of rest) {
      try {
        this.joinSync(r.userId, tableId);
      } catch {
        this.dropFromQueue(r.userId);
      }
    }
  }

  /** Bekleme süresi dolan oyuncu için tercih ettiği tier'da herkese açık bir masa açılır (bekleme odasına geçer). */
  private queueTimeout(userId: string): void {
    const q = this.queue.get(userId);
    if (!q) return;
    q.timer = null;
    try {
      this.createTableSync(userId, { tier: q.tier, mode: q.mode, name: `${TIERS[q.tier].label} · Hızlı`, boardSize: TIERS[q.tier].board, entryFee: TIERS[q.tier].fee, capacity: TIERS[q.tier].capacity, passwordHash: null });
    } catch {
      this.dropFromQueue(userId);
    }
  }

  // ------------------------------------------------------------------ bağlantı

  /** Kullanıcının son bağlantısı kapandığında: kuyruktan çıkar; bekleme odasındaysa süre sonra koltuğu boşalt. */
  userOffline(userId: string): void {
    if (this.queue.has(userId)) this.quickCancel(userId);
    const seat = this.seatOf(userId);
    if (!seat) return;
    const t = this.table(seat.table_id);
    if (!t || (t.status !== 'waiting' && t.status !== 'countdown')) return; // maçta: sunucu durumu korur, süre kuralı işler
    this.clearGrace(userId);
    this.graceTimers.set(
      userId,
      this.sched.set(() => {
        this.graceTimers.delete(userId);
        if (!this.isOnline(userId)) {
          const s = this.seatOf(userId);
          const tt = s && this.table(s.table_id);
          if (tt && (tt.status === 'waiting' || tt.status === 'countdown')) this.leaveTable(userId);
        }
      }, this.graceMs),
    );
  }
  userOnline(userId: string): void {
    this.clearGrace(userId);
  }
  private clearGrace(userId: string): void {
    const h = this.graceTimers.get(userId);
    if (h !== undefined) {
      this.sched.clear(h);
      this.graceTimers.delete(userId);
    }
  }

  // ------------------------------------------------------------------ sıralama

  leaderboard(viewerId: string | null, week = weekStartOf(this.now()), limit = 50) {
    const rows = this.db.all<{ user_id: string; points: number; wins: number; games_played: number; coins_won: number; username: string; avatar: number; level: number }>(
      `SELECT wl.user_id, wl.points, wl.wins, wl.games_played, wl.coins_won, u.username, u.avatar, u.level
       FROM weekly_leaderboard wl JOIN users u ON u.id = wl.user_id
       WHERE wl.week_start = ? ORDER BY wl.points DESC, wl.wins DESC, wl.games_played ASC, u.username_lc ASC LIMIT ?`,
      week,
      limit,
    );
    const list = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar,
      level: r.level,
      points: r.points,
      wins: r.wins,
      games: r.games_played,
      winRate: r.games_played ? Math.round((r.wins / r.games_played) * 100) : 0,
      coinsWon: r.coins_won,
    }));
    let me = viewerId ? (list.find((x) => x.userId === viewerId) ?? null) : null;
    if (viewerId && !me) {
      const r = this.db.get<{ points: number; wins: number; games_played: number; coins_won: number }>('SELECT * FROM weekly_leaderboard WHERE user_id = ? AND week_start = ?', viewerId, week);
      const u = this.accounts.publicUser(viewerId);
      if (r && u) {
        const rank = 1 + (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM weekly_leaderboard WHERE week_start = ? AND points > ?', week, r.points)?.n ?? 0);
        me = { rank, userId: u.id, username: u.username, avatar: u.avatar, level: u.level, points: r.points, wins: r.wins, games: r.games_played, winRate: r.games_played ? Math.round((r.wins / r.games_played) * 100) : 0, coinsWon: r.coins_won };
      }
    }
    const now = this.now();
    const nextReset = Date.parse(week + 'T00:00:00Z') + 7 * 86_400_000;
    return { week, list, me, prizes: ECONOMY.weeklyPrizes, endsInMs: Math.max(0, nextReset - now), serverNow: now };
  }

  /** Biten haftaları bir kez arşivler (sıra numarası) ve ilk 3'e haftalık ödül verir. Sunucu saatine dayanır. */
  settleWeeks(): string[] {
    const current = weekStartOf(this.now());
    const weeks = this.db
      .all<{ week_start: string }>('SELECT DISTINCT week_start FROM weekly_leaderboard WHERE week_start < ? AND week_start NOT IN (SELECT week_start FROM weekly_settlements)', current)
      .map((r) => r.week_start);
    for (const week of weeks) {
      this.db.tx(() => {
        if (this.db.get('SELECT 1 FROM weekly_settlements WHERE week_start = ?', week)) return;
        const rows = this.db.all<{ user_id: string; points: number }>(
          `SELECT wl.user_id, wl.points FROM weekly_leaderboard wl JOIN users u ON u.id = wl.user_id
           WHERE week_start = ? ORDER BY wl.points DESC, wl.wins DESC, wl.games_played ASC, u.username_lc ASC`,
          week,
        );
        rows.forEach((r, i) => {
          const rank = i + 1;
          this.db.run('UPDATE weekly_leaderboard SET rank = ? WHERE user_id = ? AND week_start = ?', rank, r.user_id, week);
          this.db.run('UPDATE users SET best_weekly_rank = CASE WHEN best_weekly_rank IS NULL OR best_weekly_rank > ? THEN ? ELSE best_weekly_rank END WHERE id = ?', rank, rank, r.user_id);
          const prize = ECONOMY.weeklyPrizes[i];
          if (prize && r.points > 0) applyWalletTx(this.db, { userId: r.user_id, type: 'weekly-prize', amount: prize, key: `weekly:${week}:${r.user_id}`, now: this.now() });
        });
        this.db.run('INSERT INTO weekly_settlements (week_start, settled_at) VALUES (?, ?)', week, this.now());
      });
    }
    return weeks;
  }

  // ------------------------------------------------------------------ profil

  recentMatches(userId: string, limit = 10) {
    return this.db.all<{ match_id: string; final_rank: number; prize: number; points_delta: number; mines_triggered: number; turn_count: number; finished_at: number; tier: string; table_name: string; players: number }>(
      `SELECT mp.match_id, mp.final_rank, mp.prize, mp.points_delta, mp.mines_triggered, mp.turn_count, m.finished_at, t.tier, t.name AS table_name, t.max_players AS players
       FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN tables t ON t.id = m.table_id
       WHERE mp.user_id = ? AND m.status = 'finished' ORDER BY m.finished_at DESC LIMIT ?`,
      userId,
      limit,
    );
  }

  shutdown(): void {
    for (const m of this.live.values()) if (m.timer !== null) this.sched.clear(m.timer);
    for (const h of this.countdowns.values()) this.sched.clear(h);
    for (const q of this.queue.values()) if (q.timer !== null) this.sched.clear(q.timer);
    for (const h of this.graceTimers.values()) this.sched.clear(h);
  }
}
