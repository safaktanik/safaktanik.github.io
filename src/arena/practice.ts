import { ECONOMY, TIERS, boardFor } from './economy';
import type { TierId } from './economy';
import { botThinkMs, chooseBotMove } from './bot';
import type { BotLevel } from './bot';
import { matchSettings, turnSeconds } from './rules';
import { minesForTable } from './tableOptions';
import type { Density } from './tableOptions';
import { cellView, createArena, forfeit, modeView, rankedSeats, reveal, scan, timeoutTurn, usePower } from './mines';
import type { ArenaMode } from './modes';
import type { ArenaState, MoveOutcome, PowerKind, ScanResult } from './mines';
import type { MatchView, Reaction, ReactionEvent, ResultRow } from './protocol';
import type { ReactionListener } from './backend';

/** Sunucusuz antrenman masası: aynı motor, tarayıcıda; rakipler açıkça "Bot" olarak adlandırılır. Para ve sıralama yoktur. */

export interface PracticeOptions {
  tier: TierId;
  mode: ArenaMode;
  opponents: 1 | 2 | 3;
  level: BotLevel;
  name: string;
  avatar: number;
  /** Tur süresi (sn); 0 = süresiz. */
  turnSeconds: number;
  /** Başlangıç canı ve mayın yoğunluğu (varsayılan 3 / normal). */
  lives?: number;
  density?: Density;
  /** Bonus kutuları (varsayılan açık). */
  bonuses?: boolean;
}

const BOT_NAMES = ['Bot Mırtı', 'Bot Kıskaç', 'Bot Diş'];
const BOT_AVATARS = [2, 6, 9];

export class PracticeGame {
  readonly id = `practice-${Date.now()}`;
  state: ArenaState;
  private seq = 0;
  private lastMove: MoveOutcome | null = null;
  private turnEndsAt: number | null = null;
  private aim: { seat: number; index: number; turnNo: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private results: ResultRow[] | null = null;
  private listeners = new Set<() => void>();
  private startedAt = Date.now();
  private cached: MatchView | null = null;
  private names: string[];
  private avatars: number[];

  constructor(private o: PracticeOptions) {
    const t = TIERS[o.tier];
    const ids = ['me', ...BOT_NAMES.slice(0, o.opponents).map((_, i) => `bot${i}`)];
    this.names = [o.name || 'Sen', ...BOT_NAMES.slice(0, o.opponents)];
    this.avatars = [o.avatar, ...BOT_AVATARS.slice(0, o.opponents)];
    const size = boardFor(t, ids.length).size;
    this.state = createArena(size, minesForTable(t, size, ids.length, o.density ?? 'normal', o.mode ?? 'classic'), ids, (n) => Math.floor(Math.random() * n), matchSettings(o.mode ?? 'classic', { lives: o.lives ?? 3, bonuses: o.bonuses ?? true }), o.mode ?? 'classic');
    this.state.current = Math.floor(Math.random() * ids.length);
    this.arm();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.cached = null;
    for (const l of this.listeners) l();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.timer = this.botTimer = null;
    const s = this.state;
    if (s.phase !== 'playing') {
      this.turnEndsAt = null;
      return;
    }
    const turnNo = s.turnNo;
    const secs = this.secs();
    if (secs > 0) {
      this.turnEndsAt = Date.now() + secs * 1000;
      this.timer = setTimeout(() => {
        if (this.state.turnNo !== turnNo || this.state.phase !== 'playing') return;
        const out = timeoutTurn(this.state, this.state.current, ECONOMY.afkEliminationTurns);
        if (out) this.after(out);
      }, secs * 1000);
    } else this.turnEndsAt = null;
    this.aim = null;
    if (s.current !== 0) {
      // İnsan gibi: önce düşünür, sonra kareyi seçer (herkes görür), biraz tereddüt edip açar.
      const view = cellView(this.state, false);
      const delay = botThinkMs(view, s.size, s.mineCount, this.o.level, Math.random(), secs);
      this.botTimer = setTimeout(() => {
        if (this.state.turnNo !== turnNo || this.state.phase !== 'playing') return;
        // Bot bazen Duman atar (rakibin bir sonraki turunu zorlaştırır).
        const bp = this.state.players[this.state.current];
        if ((bp.smoke ?? 0) > 0 && Math.random() < 0.3) usePower(this.state, bp.seat, 'smoke');
        const bm = chooseBotMove(cellView(this.state, false), s.size, s.mineCount, this.o.level, Math.random, this.state.allowed, s.mode);
        this.aim = { seat: this.state.current, index: bm.index, turnNo };
        this.emit();
        this.botTimer = setTimeout(() => {
          if (this.state.turnNo !== turnNo || this.state.phase !== 'playing') return;
          this.aim = null;
          const r = reveal(this.state, this.state.current, bm.index, bm.action);
          if ('outcome' in r) this.after(r.outcome);
        }, 700 + Math.random() * 600);
      }, Math.max(600, delay - 1000));
    }
  }

  // ---------------------------------------------------------------- emoji: botlar da laf atar
  private reactListeners = new Set<ReactionListener>();
  private reactTimers: ReturnType<typeof setTimeout>[] = [];
  private lastBotReact = 0;
  onReact(fn: ReactionListener): () => void {
    this.reactListeners.add(fn);
    return () => this.reactListeners.delete(fn);
  }
  private fire(seat: number, emoji: Reaction): void {
    const e: ReactionEvent & { matchId: string } = { matchId: this.id, seat, emoji, id: `${Date.now().toString(36)}${seat}${Math.random().toString(36).slice(2, 5)}` };
    for (const l of this.reactListeners) l(e);
  }
  react(emoji: Reaction): void {
    this.fire(0, emoji);
    // bazen bir bot cevap verir
    if (Math.random() < 0.45) this.botReact(['😈', '😎', 'ex:confident', 'ex:rematch', 'ex:suspicious', 'st:taunt'], 0);
  }
  /** Rastgele bir botun, kısa bir gecikmeyle emoji atması (seyrek; spam değil). */
  private botReact(pool: Reaction[], notSeat: number | null, chance = 1): void {
    const now = Date.now();
    if (now - this.lastBotReact < 2500 || Math.random() > chance) return;
    const bots = this.state.players.filter((p) => p.seat !== 0 && p.seat !== notSeat && !p.eliminated);
    if (!bots.length) return;
    this.lastBotReact = now;
    const b = bots[Math.floor(Math.random() * bots.length)];
    const e = pool[Math.floor(Math.random() * pool.length)];
    this.reactTimers.push(setTimeout(() => this.fire(b.seat, e), 500 + Math.random() * 900));
  }
  private botBanter(out: MoveOutcome): void {
    if (out.kind === 'mine' && !out.shielded) {
      if (out.seat === 0) this.botReact(['ex:laughing', '😂', 'st:laugh', '😈', 'ex:oops'], null, 0.75);
      else this.botReact(['ex:worried', 'st:cry', '😱', 'ex:frustrated'], null, 0.35);
    } else if (out.kind === 'safe' && out.seat === 0 && (out.opened >= 12 || (out.chestsFound ?? 0) > 0)) this.botReact(['ex:surprised', 'ex:well_played', 'st:shock', '🔥'], null, 0.5);
  }

  private after(out: MoveOutcome): void {
    this.seq++;
    this.lastMove = out;
    this.botBanter(out);
    if (this.state.phase === 'finished') this.finish();
    this.arm();
    this.emit();
  }

  private finish(): void {
    const s = this.state;
    this.results = rankedSeats(s).map((seat, i) => {
      const p = s.players[seat];
      return { userId: p.userId, seat, rank: i + 1, prize: 0, pointsDelta: 0, xp: 0, moves: p.moves, mineHits: p.mineHits, safeOpened: p.safeOpened, territory: p.territory, chests: p.chests, defused: p.defused ?? 0, eliminationReason: p.eliminationReason };
    });
  }

  /** Oyuncunun hamlesi; geçersizse hata kodu fırlatır. */
  /** Tur süresi: Yıldırım'da her zaman 8 sn; diğerlerinde seçilen (0 = süresiz). */
  private secs(): number {
    return this.state.mode === 'blitz' ? turnSeconds('blitz') : this.o.turnSeconds;
  }

  move(index: number, action: 'open' | 'defuse' = 'open'): void {
    const r = reveal(this.state, 0, index, action);
    if ('error' in r) throw Object.assign(new Error(r.error), { code: r.error });
    this.after(r.outcome);
  }

  /** Güç kullan (Duman / Zaman Dondurma); sıra değişmez, Dondurma süreyi uzatır. */
  power(kind: PowerKind): { kind: PowerKind; extendMs: number } {
    const r = usePower(this.state, 0, kind);
    if ('error' in r) throw Object.assign(new Error(r.error), { code: r.error });
    if (r.extendMs && this.turnEndsAt !== null) {
      const turnNo = this.state.turnNo;
      this.turnEndsAt += r.extendMs;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.state.turnNo !== turnNo || this.state.phase !== 'playing') return;
        const out = timeoutTurn(this.state, this.state.current, ECONOMY.afkEliminationTurns);
        if (out) this.after(out);
      }, Math.max(0, this.turnEndsAt - Date.now()));
    }
    this.emit();
    return r;
  }

  /** Sonar: sonucu yalnızca oyuncu görür; sıra değişmez. */
  scan(index: number): ScanResult {
    const r = scan(this.state, 0, index);
    if ('error' in r) throw Object.assign(new Error(r.error), { code: r.error });
    this.emit();
    return r;
  }

  quit(): void {
    const out = forfeit(this.state, 0);
    if (out) {
      // Oyuncu ayrılınca antrenman biter: kalan botlar arasında sonucu beklemeye gerek yok.
      if (this.state.phase === 'playing') {
        this.state.phase = 'finished';
        this.state.endReason = 'last-standing';
        this.state.winnerSeat = rankedSeats(this.state)[0];
      }
      this.after(out);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearTimeout(this.botTimer);
    for (const t of this.reactTimers) clearTimeout(t);
    this.listeners.clear();
    this.reactListeners.clear();
  }

  view(): MatchView {
    if (this.cached) return this.cached;
    this.cached = this.build();
    return this.cached;
  }
  private build(): MatchView {
    const s = this.state;
    const finished = s.phase === 'finished';
    const t = TIERS[this.o.tier];
    return {
      id: this.id,
      tableId: this.id,
      tableName: `${t.label} antrenman`,
      tier: this.o.tier,
      ...modeView(s, finished),
      size: s.size,
      mineCount: s.mineCount,
      cells: cellView(s, finished),
      players: s.players.map((p) => ({
        userId: p.userId,
        username: this.names[p.seat],
        avatar: this.avatars[p.seat],
        level: 1,
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
      })),
      viewerSeat: 0,
      current: s.current,
      turnNo: s.turnNo,
      turnEndsAt: finished ? null : this.turnEndsAt,
      serverNow: Date.now(),
      turnSeconds: this.secs() || turnSeconds(s.mode),
      phase: s.phase,
      winnerSeat: s.winnerSeat,
      endReason: s.endReason,
      prizePool: 0,
      safeLeft: s.safeLeft,
      seq: this.seq,
      lastMove: this.lastMove,
      aim: this.aim,
      startedAt: this.startedAt,
      results: finished ? this.results : null,
    };
  }
}
