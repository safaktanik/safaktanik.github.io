import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { ECONOMY, TIERS, TIER_ORDER, boardRange, feeRange, minesForBoard } from '../../src/arena/economy';
import { parseArenaMessage } from '../../src/arena/protocol';
import type { ArenaServerMessage } from '../../src/arena/protocol';
import type { Accounts } from './accounts';
import type { Arena } from './arena';
import { listTransactions } from './wallet';
import type { Db } from './db';
import { ApiError, RateLimiter } from './util';

/**
 * Arena ağ katmanı:
 *  - HTTP JSON API  /api/...   (giriş, profil, ödüller, sıralama)
 *  - WebSocket      /arena     (lobi, masa, eşleştirme, hamleler; gerçek zamanlı bildirimler)
 * Kimlik: `Authorization: Bearer <oturum>` (HTTP) ya da ilk WS mesajı `{t:'auth', token}`.
 */
export class ArenaGateway {
  readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  private sockets = new Map<string, Set<WebSocket>>();
  private lobbySubs = new Set<WebSocket>();
  private lobbyTimer: ReturnType<typeof setTimeout> | null = null;
  private httpLimiter = new RateLimiter(240, 60_000);
  private weekly: ReturnType<typeof setInterval>;

  constructor(
    private db: Db,
    private accounts: Accounts,
    private arena: Arena,
  ) {
    arena.notify = {
      lobby: () => this.scheduleLobby(),
      table: (_tableId, users) => {
        for (const u of new Set(users)) {
          const ctx = this.arena.contextFor(u);
          // yalnızca hâlâ o masadaysa ya da masadan yeni ayrıldıysa gönder
          this.sendUser(u, { t: 'table', table: ctx.table });
        }
      },
      match: (matchId, users) => {
        for (const u of new Set(users)) {
          const view = this.arena.matchView(matchId, u);
          if (view) this.sendUser(u, { t: 'match', match: view });
        }
      },
      react: (users, ev) => {
        for (const u of new Set(users)) this.sendUser(u, { t: 'react', matchId: ev.matchId, seat: ev.seat, emoji: ev.emoji as never, id: ev.id });
      },
      user: (userId) => {
        try {
          this.sendUser(userId, { t: 'me', me: this.accounts.me(userId) });
        } catch {
          /* silinmiş kullanıcı */
        }
      },
      queue: (userId) => this.sendUser(userId, { t: 'queue', queue: this.arena.contextFor(userId).queue }),
    };
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => this.onConnection(ws, req));
    this.weekly = setInterval(() => this.arena.settleWeeks(), 10 * 60_000);
    this.weekly.unref?.();
  }

  isOnline = (userId: string) => (this.sockets.get(userId)?.size ?? 0) > 0;
  /** Arayüz başka bir adresten sunuluyorsa (VITE_ARENA_URL) izin verilen Origin'ler (ALLOWED_ORIGINS). */
  allowedOrigins: string[] = [];

  close(): void {
    clearInterval(this.weekly);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    for (const c of this.wss.clients) c.terminate();
    this.wss.close();
  }

  private send(ws: WebSocket, msg: ArenaServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }
  private sendUser(userId: string, msg: ArenaServerMessage): void {
    for (const ws of this.sockets.get(userId) ?? []) this.send(ws, msg);
  }

  private scheduleLobby(): void {
    if (this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      if (!this.lobbySubs.size) return;
      const msg: ArenaServerMessage = { t: 'lobby', tables: this.arena.listTables(), online: this.sockets.size };
      const raw = JSON.stringify(msg);
      for (const ws of this.lobbySubs) if (ws.readyState === ws.OPEN) ws.send(raw);
    }, 120);
  }

  // ------------------------------------------------------------------ WebSocket

  private onConnection(ws: WebSocket, _req: IncomingMessage): void {
    let userId: string | null = null;
    let alive = true;
    const limiter = new RateLimiter(25, 1000);
    const authTimer = setTimeout(() => {
      if (!userId) ws.close(4001, 'auth-timeout');
    }, 10_000);
    ws.on('pong', () => (alive = true));
    const beat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 25_000);

    ws.on('message', (data) => {
      if (!limiter.take('m')) return this.send(ws, { t: 'error', error: 'rate-limited' });
      const msg = parseArenaMessage(data.toString());
      if (!msg) return this.send(ws, { t: 'error', error: 'bad-message' });
      if (msg.t === 'ping') return this.send(ws, { t: 'pong' });
      if (!userId) {
        if (msg.t !== 'auth') return this.send(ws, { t: 'auth-failed' });
        const uid = this.accounts.authenticate(msg.token);
        if (!uid) {
          this.send(ws, { t: 'auth-failed' });
          return ws.close(4001, 'auth');
        }
        userId = uid;
        clearTimeout(authTimer);
        if (!this.sockets.has(uid)) this.sockets.set(uid, new Set());
        this.sockets.get(uid)!.add(ws);
        this.arena.userOnline(uid);
        this.send(ws, { t: 'ready', userId: uid });
        this.send(ws, { t: 'me', me: this.accounts.me(uid) });
        const ctx = this.arena.contextFor(uid);
        this.send(ws, { t: 'table', table: ctx.table });
        this.send(ws, { t: 'queue', queue: ctx.queue });
        if (ctx.matchId) {
          const v = this.arena.matchView(ctx.matchId, uid);
          if (v) this.send(ws, { t: 'match', match: v });
        }
        this.scheduleLobby();
        return;
      }
      void this.handle(ws, userId, msg);
    });

    ws.on('close', () => {
      clearInterval(beat);
      clearTimeout(authTimer);
      this.lobbySubs.delete(ws);
      if (!userId) return;
      const set = this.sockets.get(userId);
      set?.delete(ws);
      if (set && set.size === 0) {
        this.sockets.delete(userId);
        this.arena.userOffline(userId);
      }
      this.scheduleLobby();
    });
    ws.on('error', () => ws.terminate());
  }

  private async handle(ws: WebSocket, userId: string, msg: NonNullable<ReturnType<typeof parseArenaMessage>>): Promise<void> {
    if (msg.t === 'lobby.sub') {
      this.lobbySubs.add(ws);
      return this.send(ws, { t: 'lobby', tables: this.arena.listTables(), online: this.sockets.size });
    }
    if (msg.t === 'lobby.unsub') {
      this.lobbySubs.delete(ws);
      return;
    }
    if (msg.t === 'auth' || msg.t === 'ping') return;
    if (msg.t === 'react') {
      try {
        this.arena.react(userId, msg.matchId, msg.emoji);
      } catch {
        /* yok say */
      }
      return;
    }
    const rid = msg.rid;
    try {
      let data: unknown;
      switch (msg.t) {
        case 'table.create':
          data = await this.arena.createTable(userId, msg);
          break;
        case 'table.join':
          data = await this.arena.joinTable(userId, msg.tableId, msg.password);
          break;
        case 'table.ready':
          // Oyun sunucusunda masa dolunca kısa geri sayımla başlar; hazır bildirimi kabul edilir.
          data = null;
          break;
        case 'table.watch':
          throw new ApiError('not-supported', 400);
        case 'table.leave':
          this.arena.leaveTable(userId);
          break;
        case 'quick.start':
          data = this.arena.quickStart(userId, { tier: msg.tier, maxFee: msg.maxFee, mode: msg.mode });
          break;
        case 'quick.cancel':
          data = this.arena.quickCancel(userId);
          break;
        case 'move':
          data = this.arena.move(userId, msg.matchId, msg.index, msg.action);
          break;
        case 'scan':
          data = this.arena.scanCell(userId, msg.matchId, msg.index);
          break;
        case 'power':
          data = this.arena.power(userId, msg.matchId, msg.kind);
          break;
      }
      this.send(ws, { t: 'ack', rid, ok: true, data });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'server-error';
      if (!(e instanceof ApiError)) console.error('[arena]', e);
      this.send(ws, { t: 'ack', rid, ok: false, error: code });
    }
  }

  // ------------------------------------------------------------------ HTTP

  /** /api/ altındaki istekleri karşılar; başka yolsa false döner. */
  handleHttp(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    const origin = req.headers.origin;
    if (typeof origin === 'string' && this.allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }
    void this.route(req, res, url).catch((e) => {
      const err = e instanceof ApiError ? e : new ApiError('server-error', 500);
      if (!(e instanceof ApiError)) console.error('[api]', e);
      this.json(res, err.status, { error: err.code });
    });
    return true;
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) return;
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  private body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((ok, fail) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > 4096) {
          fail(new ApiError('payload-too-large', 413));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return ok({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          ok(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
        } catch {
          fail(new ApiError('bad-json'));
        }
      });
      req.on('error', fail);
    });
  }

  private ip(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? 'unknown';
  }

  private auth(req: IncomingMessage): { userId: string; token: string } {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const userId = this.accounts.authenticate(token);
    if (!userId) throw new ApiError('unauthorized', 401);
    return { userId, token };
  }

  private async route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (!this.httpLimiter.take(this.ip(req))) throw new ApiError('rate-limited', 429);
    const key = `${req.method} ${url.pathname}`;
    const ip = this.ip(req);
    switch (key) {
      case 'GET /api/config':
        return this.json(res, 200, {
          economy: ECONOMY,
          tiers: TIER_ORDER.map((id) => ({ ...TIERS[id], boardRange: boardRange(TIERS[id]), feeRange: feeRange(TIERS[id]), mineFor: Object.fromEntries(Array.from({ length: boardRange(TIERS[id]).max - boardRange(TIERS[id]).min + 1 }, (_, k) => { const b = boardRange(TIERS[id]).min + k; return [b, minesForBoard(TIERS[id], b)]; })) })),
        });
      case 'POST /api/auth/guest':
        return this.json(res, 200, this.accounts.createGuest(ip));
      case 'POST /api/auth/register': {
        const b = await this.body(req);
        return this.json(res, 200, await this.accounts.register({ email: String(b.email ?? ''), password: String(b.password ?? ''), username: b.username ? String(b.username) : undefined }, ip));
      }
      case 'POST /api/auth/login': {
        const b = await this.body(req);
        return this.json(res, 200, await this.accounts.login({ email: String(b.email ?? ''), password: String(b.password ?? '') }, ip));
      }
      case 'POST /api/auth/upgrade': {
        const { userId } = this.auth(req);
        const b = await this.body(req);
        const me = await this.accounts.upgrade(userId, { email: String(b.email ?? ''), password: String(b.password ?? ''), username: b.username ? String(b.username) : undefined });
        this.arena.notify.user(userId);
        return this.json(res, 200, { me });
      }
      case 'POST /api/auth/logout': {
        const { token } = this.auth(req);
        this.accounts.logout(token);
        return this.json(res, 200, { ok: true });
      }
      case 'GET /api/me': {
        const { userId } = this.auth(req);
        return this.json(res, 200, { me: this.accounts.me(userId) });
      }
      case 'POST /api/me/profile': {
        const { userId } = this.auth(req);
        const b = await this.body(req);
        const me = this.accounts.setProfile(userId, { username: b.username, avatar: b.avatar });
        this.arena.notify.user(userId);
        this.arena.notify.lobby();
        return this.json(res, 200, { me });
      }
      case 'GET /api/me/matches': {
        const { userId } = this.auth(req);
        return this.json(res, 200, { matches: this.arena.recentMatches(userId) });
      }
      case 'GET /api/me/transactions': {
        const { userId } = this.auth(req);
        return this.json(res, 200, { transactions: listTransactions(this.db, userId) });
      }
      case 'POST /api/rewards/daily': {
        const { userId } = this.auth(req);
        const r = this.accounts.claimDaily(userId);
        this.arena.notify.user(userId);
        return this.json(res, 200, r);
      }
      case 'POST /api/rewards/rescue': {
        const { userId } = this.auth(req);
        const r = this.accounts.claimRescue(userId);
        this.arena.notify.user(userId);
        return this.json(res, 200, r);
      }
      case 'GET /api/leaderboard': {
        let viewer: string | null = null;
        try {
          viewer = this.auth(req).userId;
        } catch {
          viewer = null;
        }
        const week = url.searchParams.get('week');
        return this.json(res, 200, this.arena.leaderboard(viewer, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : undefined));
      }
      default:
        throw new ApiError('not-found', 404);
    }
  }
}
