import { ECONOMY, TIERS, dayKeyOf, levelFromXp, weekStartOf, xpForLevel } from '../../src/arena/economy';
import { CHARACTER_COUNT, STARTER_CHARACTERS, characterUnlocked } from '../../src/arena/characterData';
import type { Me, PublicUser } from '../../src/arena/protocol';
import type { Db } from './db';

export type { Me, PublicUser };
import { applyWalletTx } from './wallet';
import { ApiError, RateLimiter, hashSecret, newId, newToken, sha256, systemClock, verifySecret } from './util';
import type { Clock } from './util';

export const AVATAR_COUNT = CHARACTER_COUNT;
const USERNAME_RE = /^[\p{L}\p{N}_]{3,16}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const ADJ = ['Cesur', 'Sessiz', 'Hızlı', 'Kurnaz', 'Derin', 'Gece', 'Fırtına', 'Mavi'];
const NOUN = ['Kaptan', 'Denizci', 'Balina', 'Yelken', 'Çapa', 'Fener', 'Dalgıç', 'Martı'];

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  avatar: number;
  account_type: 'guest' | 'member';
  email: string | null;
  password_hash: string | null;
  level: number;
  experience: number;
  balance: number;
  total_wins: number;
  total_losses: number;
  games_played: number;
  best_weekly_rank: number | null;
  daily_streak: number;
  last_daily: string | null;
  last_rescue: string | null;
  created_at: number;
}

export interface AuthResult {
  token: string;
  me: Me;
}

export class Accounts {
  private loginLimiter: RateLimiter;
  private guestLimiter: RateLimiter;
  constructor(
    private db: Db,
    private clock: Clock = systemClock,
  ) {
    this.loginLimiter = new RateLimiter(10, 10 * 60_000, clock);
    this.guestLimiter = new RateLimiter(20, 60 * 60_000, clock);
  }

  private row(id: string): UserRow | undefined {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
  }

  private uniqueName(): string {
    for (let i = 0; i < 20; i++) {
      const name = `${ADJ[Math.floor(Math.random() * ADJ.length)]}${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(Math.random() * 9000 + 1000)}`;
      if (!this.db.get('SELECT 1 FROM users WHERE username_lc = ?', name.toLowerCase())) return name;
    }
    return `Oyuncu${Date.now() % 1e9}`;
  }

  private insertUser(opts: { type: 'guest' | 'member'; username: string; email?: string; hash?: string; avatar?: number }): string {
    const id = newId('u');
    const now = this.clock.now();
    this.db.tx(() => {
      this.db.run(
        `INSERT INTO users (id, username, username_lc, display_name, avatar, account_type, email, password_hash, level, experience, balance, created_at)
         VALUES (?,?,?,?,?,?,?,?,1,0,0,?)`,
        id,
        opts.username,
        opts.username.toLowerCase(),
        opts.username,
        opts.avatar ?? STARTER_CHARACTERS[Math.floor(Math.random() * STARTER_CHARACTERS.length)],
        opts.type,
        opts.email ?? null,
        opts.hash ?? null,
        now,
      );
      applyWalletTx(this.db, { userId: id, type: 'signup-bonus', amount: ECONOMY.startingBalance, key: `signup:${id}`, now });
    });
    return id;
  }

  private session(userId: string): string {
    const token = newToken();
    const now = this.clock.now();
    this.db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)', sha256(token), userId, now, now + ECONOMY.sessionDays * 86_400_000);
    return token;
  }

  createGuest(ip = 'local'): AuthResult {
    if (!this.guestLimiter.take(ip)) throw new ApiError('rate-limited', 429);
    const id = this.insertUser({ type: 'guest', username: this.uniqueName() });
    return { token: this.session(id), me: this.me(id) };
  }

  private checkCreds(email: string, password: string): string {
    const e = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) throw new ApiError('invalid-email');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new ApiError('weak-password');
    return e;
  }

  private checkUsername(name: unknown, selfId?: string): string {
    const n = String(name ?? '').trim();
    if (!USERNAME_RE.test(n)) throw new ApiError('bad-username');
    const taken = this.db.get<{ id: string }>('SELECT id FROM users WHERE username_lc = ?', n.toLowerCase());
    if (taken && taken.id !== selfId) throw new ApiError('username-taken', 409);
    return n;
  }

  async register(input: { email: string; password: string; username?: string }, ip = 'local'): Promise<AuthResult> {
    if (!this.guestLimiter.take('reg:' + ip)) throw new ApiError('rate-limited', 429);
    const email = this.checkCreds(input.email, input.password);
    const username = input.username ? this.checkUsername(input.username) : this.uniqueName();
    if (this.db.get('SELECT 1 FROM users WHERE email = ?', email)) throw new ApiError('email-taken', 409);
    const hash = await hashSecret(input.password);
    const id = this.insertUser({ type: 'member', username, email, hash });
    return { token: this.session(id), me: this.me(id) };
  }

  /** Misafir hesabı aynı kimlikle kalıcı hesaba dönüştürür: bakiye, istatistik ve sıralama aynen korunur. */
  async upgrade(userId: string, input: { email: string; password: string; username?: string }): Promise<Me> {
    const u = this.row(userId);
    if (!u) throw new ApiError('unauthorized', 401);
    if (u.account_type !== 'guest') throw new ApiError('not-guest');
    const email = this.checkCreds(input.email, input.password);
    if (this.db.get('SELECT 1 FROM users WHERE email = ?', email)) throw new ApiError('email-taken', 409);
    const username = input.username && input.username !== u.username ? this.checkUsername(input.username, userId) : u.username;
    const hash = await hashSecret(input.password);
    this.db.tx(() => {
      const again = this.row(userId)!;
      if (again.account_type !== 'guest') throw new ApiError('not-guest');
      this.db.run(
        "UPDATE users SET account_type='member', email=?, password_hash=?, username=?, username_lc=?, display_name=? WHERE id=?",
        email,
        hash,
        username,
        username.toLowerCase(),
        username,
        userId,
      );
    });
    return this.me(userId);
  }

  async login(input: { email: string; password: string }, ip = 'local'): Promise<AuthResult> {
    const email = String(input.email ?? '').trim().toLowerCase();
    if (!this.loginLimiter.take(`${ip}|${email}`)) throw new ApiError('rate-limited', 429);
    const u = this.db.get<UserRow>('SELECT * FROM users WHERE email = ?', email);
    // Kullanıcı yokken de aynı işi yap (zamanlama farkı sızdırmasın).
    const ok = await verifySecret(String(input.password ?? ''), u?.password_hash ?? 'scrypt$AAAA$AAAA');
    if (!u || !ok) throw new ApiError('bad-credentials', 401);
    return { token: this.session(u.id), me: this.me(u.id) };
  }

  authenticate(token: unknown): string | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.db.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', sha256(token));
    if (!row || row.expires_at < this.clock.now()) return null;
    return row.user_id;
  }

  logout(token: string): void {
    this.db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  }

  publicUser(id: string): PublicUser | null {
    const u = this.row(id);
    return u ? { id: u.id, username: u.username, avatar: u.avatar, level: u.level } : null;
  }

  setProfile(userId: string, input: { username?: unknown; avatar?: unknown }): Me {
    const u = this.row(userId);
    if (!u) throw new ApiError('unauthorized', 401);
    let username = u.username;
    if (input.username !== undefined && input.username !== u.username) username = this.checkUsername(input.username, userId);
    let avatar = u.avatar;
    if (input.avatar !== undefined) {
      if (!Number.isInteger(input.avatar) || (input.avatar as number) < 0 || (input.avatar as number) >= AVATAR_COUNT) throw new ApiError('bad-avatar');
      // Seviyesi yetmeyen karakter seçilemez (zaten seçili olan korunur).
      if (input.avatar !== u.avatar && !characterUnlocked(input.avatar as number, levelFromXp(u.experience))) throw new ApiError('avatar-locked', 403);
      avatar = input.avatar as number;
    }
    this.db.run('UPDATE users SET username=?, username_lc=?, display_name=?, avatar=? WHERE id=?', username, username.toLowerCase(), username, avatar, userId);
    return this.me(userId);
  }

  me(userId: string): Me {
    const u = this.row(userId);
    if (!u) throw new ApiError('unauthorized', 401);
    const now = this.clock.now();
    const today = dayKeyOf(now);
    const week = weekStartOf(now);
    const wl = this.db.get<{ points: number }>('SELECT points FROM weekly_leaderboard WHERE user_id = ? AND week_start = ?', userId, week);
    let rank: number | null = null;
    if (wl) rank = 1 + (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM weekly_leaderboard WHERE week_start = ? AND points > ?', week, wl.points)?.n ?? 0);
    const streakNext = u.last_daily === today ? u.daily_streak : u.last_daily === dayKeyOf(now - 86_400_000) ? u.daily_streak + 1 : 1;
    const minFee = Math.min(...Object.values(TIERS).map((t) => t.fee));
    const level = levelFromXp(u.experience);
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      level,
      accountType: u.account_type,
      email: u.email,
      xp: u.experience,
      xpLevelStart: xpForLevel(level),
      xpNext: xpForLevel(level + 1),
      balance: u.balance,
      wins: u.total_wins,
      losses: u.total_losses,
      gamesPlayed: u.games_played,
      winRate: u.games_played ? Math.round((u.total_wins / u.games_played) * 100) : 0,
      weeklyPoints: wl?.points ?? 0,
      weeklyRank: rank,
      bestRank: u.best_weekly_rank,
      dailyAvailable: u.last_daily !== today,
      dailyAmount: ECONOMY.daily.base + Math.min(ECONOMY.daily.maxStreakBonus, ECONOMY.daily.streakBonus * (streakNext - 1)),
      streak: u.last_daily === today ? u.daily_streak : u.last_daily === dayKeyOf(now - 86_400_000) ? u.daily_streak : 0,
      rescueAvailable: u.balance < minFee && u.last_rescue !== today,
      rescueAmount: ECONOMY.rescue.amount,
    };
  }

  /** Günlük ödül: kullanıcı başına günde bir kez (sunucu saati, UTC gün). */
  claimDaily(userId: string): { amount: number; streak: number; balance: number } {
    const now = this.clock.now();
    const today = dayKeyOf(now);
    return this.db.tx(() => {
      const u = this.row(userId);
      if (!u) throw new ApiError('unauthorized', 401);
      if (u.last_daily === today) throw new ApiError('already-claimed');
      const streak = u.last_daily === dayKeyOf(now - 86_400_000) ? u.daily_streak + 1 : 1;
      const amount = ECONOMY.daily.base + Math.min(ECONOMY.daily.maxStreakBonus, ECONOMY.daily.streakBonus * (streak - 1));
      const r = applyWalletTx(this.db, { userId, type: 'daily-reward', amount, key: `daily:${userId}:${today}`, now });
      this.db.run('INSERT INTO daily_claims (user_id, day, amount) VALUES (?,?,?)', userId, today, amount);
      this.db.run('UPDATE users SET last_daily = ?, daily_streak = ? WHERE id = ?', today, streak, userId);
      return { amount, streak, balance: r.balance };
    });
  }

  /** Yardım paketi: bakiye en ucuz masanın altına düştüyse günde bir kez. */
  claimRescue(userId: string): { amount: number; balance: number } {
    const now = this.clock.now();
    const today = dayKeyOf(now);
    return this.db.tx(() => {
      const u = this.row(userId);
      if (!u) throw new ApiError('unauthorized', 401);
      const minFee = Math.min(...Object.values(TIERS).map((t) => t.fee));
      if (u.balance >= minFee) throw new ApiError('not-needed');
      if (u.last_rescue === today) throw new ApiError('already-claimed');
      const r = applyWalletTx(this.db, { userId, type: 'rescue-pack', amount: ECONOMY.rescue.amount, key: `rescue:${userId}:${today}`, now });
      this.db.run('UPDATE users SET last_rescue = ? WHERE id = ?', today, userId);
      return { amount: ECONOMY.rescue.amount, balance: r.balance };
    });
  }
}
