import { Accounts } from './accounts';
import { Arena } from './arena';
import type { Scheduler } from './arena';
import { migrate, openDb } from './db';
import type { Db } from './db';
import type { ArenaState } from '../../src/arena/mines';

/** Elle ilerletilen saat + zamanlayıcı (testler gerçek bekleme yapmaz). */
export class FakeTime implements Scheduler {
  t = Date.parse('2026-10-21T10:00:00Z');
  private seq = 0;
  private jobs = new Map<number, { at: number; fn: () => void }>();
  now = () => this.t;
  set(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.jobs.set(id, { at: this.t + ms, fn });
    return id;
  }
  clear(h: unknown): void {
    this.jobs.delete(h as number);
  }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.jobs) if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.jobs.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
  pending(): number {
    return this.jobs.size;
  }
}

export interface Kit {
  db: Db;
  accounts: Accounts;
  arena: Arena;
  time: FakeTime;
  guest(): string;
  balance(u: string): number;
  state(matchId: string): ArenaState;
}

export async function makeKit(opts: { online?: (u: string) => boolean; rng?: (n: number) => number } = {}): Promise<Kit> {
  const db = await openDb(':memory:');
  migrate(db);
  const time = new FakeTime();
  const clock = { now: time.now };
  const accounts = new Accounts(db, clock);
  let n = 0;
  const arena = new Arena(db, accounts, { clock, scheduler: time, rng: opts.rng ?? ((k) => (n = (n * 1103515245 + 12345) >>> 0) % k), isOnline: opts.online, waitingGraceMs: 30_000 });
  return {
    db,
    accounts,
    arena,
    time,
    guest: () => accounts.createGuest(`ip${Math.random()}`).me.id,
    balance: (u) => db.get<{ balance: number }>('SELECT balance FROM users WHERE id = ?', u)!.balance,
    state: (id) => ((arena as unknown as { live: Map<string, { state: ArenaState }>; recent: Map<string, { state: ArenaState }> }).live.get(id) ?? (arena as unknown as { recent: Map<string, { state: ArenaState }> }).recent.get(id))!.state,
  };
}

/** Mayın olmayan, gizli bir kare. */
export function safeCell(s: ArenaState): number {
  const mines = new Set(s.mines);
  return s.cells.findIndex((c, i) => c === 0 && !mines.has(i));
}
/** Gizli bir mayın karesi. */
export function mineCell(s: ArenaState): number {
  return s.mines.find((m) => s.cells[m] === 0)!;
}
