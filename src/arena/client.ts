import { isReaction } from './protocol';
import type { ArenaClientMessage, ArenaServerMessage, MatchView, Me, QueueView, TableView } from './protocol';
import type { ArenaBackend, LeaderboardData, MatchRow, ReactionListener, TxRow } from './backend';
export { arenaClient } from './backend';

/** Onaylı istek gövdeleri (rid istemcide eklenir). */
export type ArenaRequest = ArenaClientMessage extends infer M ? (M extends { rid: number } ? Omit<M, 'rid'> : never) : never;

/**
 * Masa sistemi istemcisi: HTTP (giriş, profil, ödüller, sıralama) + WebSocket (lobi, masa, maç).
 * Bakiye, can, sıra ve sonuçlar daima sunucudan gelir; istemci yalnızca niyet gönderir.
 */

const TOKEN_KEY = 'mine-duel:arena:token';

function env(): Record<string, unknown> {
  return (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
}
/** Sunucu kökü: VITE_ARENA_URL (örn. https://oyun.example.com) ya da arayüzle aynı adres. */
export function arenaBase(): string {
  const v = env().VITE_ARENA_URL;
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '');
  return window.location.origin;
}
function wsBase(): string {
  return arenaBase().replace(/^http/, 'ws') + '/arena';
}
export type ServerProbe = 'ok' | 'no-server' | 'arena-disabled' | 'error';

/**
 * Masa sunucusu gerçekten var mı? (Yayınlanan önizleme sayfası, tek dosya ya da statik barındırmada yoktur.)
 * /api/config JSON dönmeli; dönmüyorsa sunucu yok sayılır.
 */
export async function probeServer(timeoutMs = 4000): Promise<ServerProbe> {
  if (window.location.protocol === 'file:' && !env().VITE_ARENA_URL) return 'no-server';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await fetch(arenaBase() + '/api/config', { signal: ctl?.signal, headers: { accept: 'application/json' } });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return 'no-server';
    const body = (await res.json().catch(() => null)) as { error?: string; economy?: unknown } | null;
    if (res.ok && body && body.economy) return 'ok';
    if (body?.error === 'arena-disabled') return 'arena-disabled';
    return res.status === 404 ? 'no-server' : 'error';
  } catch {
    return 'no-server';
  } finally {
    clearTimeout(timer);
  }
}

function loadToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(t: string | null): void {
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama yok: oturum yalnızca bu sekmede */
  }
}

export class ArenaHttpError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export interface ArenaSnapshot {
  conn: 'idle' | 'connecting' | 'online' | 'offline';
  token: string | null;
  me: Me | null;
  lobby: TableView[];
  online: number;
  lobbyLoaded: boolean;
  table: TableView | null;
  match: MatchView | null;
  queue: QueueView | null;
  /** Sunucu saati − yerel saat (geri sayımları sunucuya göre göstermek için). */
  skew: number;
  /** Test sunucusu: bu kişinin oyuncu profili henüz yok. */
  needsProfile?: boolean;
  /** Test sunucusu: bu kişi sayfayı yalnızca görüntüleme yetkisiyle açtı (yazamaz, oynayamaz). */
  readOnly?: boolean;
}

type Listener = (s: ArenaSnapshot) => void;

export class ArenaClient implements ArenaBackend {
  readonly kind = 'server' as const;
  readonly label = 'Oyun sunucusu';
  private snap: ArenaSnapshot = { conn: 'idle', token: loadToken(), me: null, lobby: [], online: 0, lobbyLoaded: false, table: null, match: null, queue: null, skew: 0 };
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private rid = 0;
  private pending = new Map<number, { ok(v: unknown): void; fail(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wantLobby = false;
  private stopped = true;

  get state(): ArenaSnapshot {
    return this.snap;
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private set(patch: Partial<ArenaSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }

  // ------------------------------------------------------------- HTTP

  async http<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.snap.token) headers.authorization = `Bearer ${this.snap.token}`;
    let res: Response;
    try {
      res = await fetch(arenaBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ArenaHttpError('network', 0);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* boş gövde */
    }
    if (!res.ok) {
      const code = (data as { error?: string } | null)?.error ?? 'server-error';
      if (res.status === 401 && path !== '/api/auth/login') this.signOutLocal();
      throw new ArenaHttpError(code, res.status);
    }
    return data as T;
  }

  async guest(): Promise<void> {
    const r = await this.http<{ token: string; me: Me }>('POST', '/api/auth/guest');
    this.signedIn(r.token, r.me);
  }
  async login(email: string, password: string): Promise<void> {
    const r = await this.http<{ token: string; me: Me }>('POST', '/api/auth/login', { email, password });
    this.signedIn(r.token, r.me);
  }
  async register(email: string, password: string, username?: string): Promise<void> {
    const r = await this.http<{ token: string; me: Me }>('POST', '/api/auth/register', { email, password, username: username || undefined });
    this.signedIn(r.token, r.me);
  }
  async upgrade(email: string, password: string, username?: string): Promise<void> {
    const r = await this.http<{ me: Me }>('POST', '/api/auth/upgrade', { email, password, username: username || undefined });
    this.set({ me: r.me });
  }
  async logout(): Promise<void> {
    try {
      await this.http('POST', '/api/auth/logout');
    } catch {
      /* zaten geçersiz */
    }
    this.signOutLocal();
  }
  async refreshMe(): Promise<Me | null> {
    if (!this.snap.token) return null;
    const r = await this.http<{ me: Me }>('GET', '/api/me');
    this.set({ me: r.me });
    return r.me;
  }

  private signedIn(token: string, me: Me): void {
    saveToken(token);
    this.set({ token, me });
    this.start();
  }
  private signOutLocal(): void {
    saveToken(null);
    this.stop();
    this.set({ token: null, me: null, table: null, match: null, queue: null });
  }

  // ------------------------------------------------------------- WebSocket

  start(): void {
    if (!this.snap.token) return;
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.set({ conn: 'idle' });
  }

  private connect(): void {
    this.set({ conn: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsBase());
    } catch {
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: this.snap.token }));
    ws.onmessage = (e) => {
      let m: ArenaServerMessage;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.fail(new ArenaHttpError('disconnected', 0));
      }
      this.pending.clear();
      if (!this.stopped) this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    this.set({ conn: 'offline' });
    const delay = Math.min(8000, 500 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  private onMessage(m: ArenaServerMessage): void {
    switch (m.t) {
      case 'ready':
        this.retry = 0;
        this.set({ conn: 'online' });
        if (this.wantLobby) this.raw({ t: 'lobby.sub' });
        break;
      case 'auth-failed':
        this.signOutLocal();
        break;
      case 'me':
        this.set({ me: m.me });
        break;
      case 'lobby':
        this.set({ lobby: m.tables, online: m.online, lobbyLoaded: true });
        break;
      case 'table': {
        // Masadan ayrıldıysak ve maç bitmişse sonuç ekranı korunur.
        this.set({ table: m.table });
        break;
      }
      case 'match':
        if (this.dismissed.has(m.match.id)) break;
        this.set({ match: m.match, skew: m.match.serverNow - Date.now() });
        break;
      case 'react':
        for (const l of this.reactListeners) l({ matchId: m.matchId, seat: m.seat, emoji: m.emoji, id: m.id });
        break;
      case 'queue':
        this.set({ queue: m.queue });
        break;
      case 'ack': {
        const p = this.pending.get(m.rid);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(m.rid);
        if (m.ok) p.ok(m.data);
        else p.fail(new ArenaHttpError(m.error, 400));
        break;
      }
      default:
        break;
    }
  }

  private raw(m: ArenaClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Onaylı istek: sunucunun cevabını bekler. */
  request<T = unknown>(m: ArenaRequest): Promise<T> {
    return new Promise((ok, fail) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return fail(new ArenaHttpError('disconnected', 0));
      const rid = ++this.rid;
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        fail(new ArenaHttpError('timeout', 0));
      }, 10_000);
      this.pending.set(rid, { ok: ok as (v: unknown) => void, fail, timer });
      this.ws.send(JSON.stringify({ ...m, rid }));
    });
  }

  watchLobby(on: boolean): void {
    this.wantLobby = on;
    this.raw({ t: on ? 'lobby.sub' : 'lobby.unsub' });
  }

  /** Bitmiş maç görünümünü temizler (sonuç ekranından çıkınca). */
  clearMatch(): void {
    if (this.snap.match) this.dismissed.add(this.snap.match.id);
    this.set({ match: null });
  }

  private dismissed = new Set<string>();
  private reactListeners = new Set<ReactionListener>();

  async leaveMatch(): Promise<void> {
    const m = this.snap.match;
    if (m && m.phase === 'playing') {
      try {
        await this.request({ t: 'table.leave' });
      } catch {
        /* bağlantı yoksa sunucu süre kuralıyla eler */
      }
    }
    this.clearMatch();
  }
  react(matchId: string, emoji: string): void {
    if (!isReaction(emoji)) return;
    this.raw({ t: 'react', matchId, emoji });
  }
  onReact(fn: ReactionListener): () => void {
    this.reactListeners.add(fn);
    return () => this.reactListeners.delete(fn);
  }

  serverNow(): number {
    return Date.now() + this.snap.skew;
  }

  leaderboard(): Promise<LeaderboardData> {
    return this.http<LeaderboardData>('GET', '/api/leaderboard');
  }
  async recentMatches(): Promise<MatchRow[]> {
    return (await this.http<{ matches: MatchRow[] }>('GET', '/api/me/matches')).matches;
  }
  async transactions(): Promise<TxRow[]> {
    return (await this.http<{ transactions: TxRow[] }>('GET', '/api/me/transactions')).transactions;
  }
  async updateProfile(p: { username?: string; avatar?: number }): Promise<void> {
    await this.http('POST', '/api/me/profile', p);
  }
  claimDaily(): Promise<{ amount: number }> {
    return this.http('POST', '/api/rewards/daily');
  }
  claimRescue(): Promise<{ amount: number }> {
    return this.http('POST', '/api/rewards/rescue');
  }
}

let singleton: ArenaClient | null = null;
/** Gerçek oyun sunucusu (Node) istemcisi. */
export function nodeClient(): ArenaClient {
  if (!singleton) singleton = new ArenaClient();
  return singleton;
}

export const ERROR_TEXT: Record<string, string> = {
  network: 'Sunucuya ulaşılamadı. Oyun sunucusunun çalıştığından emin ol.',
  disconnected: 'Bağlantı yok; yeniden bağlanılıyor…',
  timeout: 'Sunucu yanıt vermedi.',
  'rate-limited': 'Çok fazla deneme. Biraz bekleyip tekrar dene.',
  'invalid-email': 'Geçerli bir e-posta adresi yaz.',
  'weak-password': 'Parola en az 8 karakter olmalı.',
  'email-taken': 'Bu e-posta ile kayıtlı bir hesap var.',
  'username-taken': 'Bu kullanıcı adı alınmış.',
  'bad-username': 'Kullanıcı adı 3–16 harf, rakam ya da _ olmalı.',
  'bad-credentials': 'E-posta veya parola hatalı.',
  'not-guest': 'Bu hesap zaten kalıcı.',
  'already-claimed': 'Bu ödülü zaten aldın.',
  'already-owned': 'Bu ürün zaten sende.',
  'not-needed': 'Yardım paketi yalnızca bakiye en ucuz masanın altına düşünce verilir.',
  'insufficient-funds': 'Bakiyen bu masa için yetmiyor.',
  'already-seated': 'Zaten bir masadasın.',
  'table-not-found': 'Masa bulunamadı.',
  'table-not-joinable': 'Bu masa başladı ya da kapandı.',
  'table-full': 'Masa dolu.',
  'wrong-password': 'Masa şifresi hatalı.',
  'bad-board': 'Oyun alanı bu masa türünün sınırları dışında.',
  'bad-fee': 'Giriş ücreti bu masa türünün sınırları dışında.',
  'bad-capacity': 'Kapasite 2, 3 ya da 4 olmalı.',
  'bad-password': 'Masa şifresi 3–32 karakter olmalı.',
  'not-your-turn': 'Sıra sende değil.',
  'already-open': 'Bu kare zaten açık.',
  eliminated: 'Elendin; maçı izleyebilirsin.',
  'not-playing': 'Maç bitti.',
  'out-of-bounds': 'Geçersiz kare.',
  'match-not-found': 'Maç bulunamadı.',
  'server-error': 'Sunucu hatası. Tekrar dene.',
  'bad-options': 'Masa ayarları geçersiz.',
  'bad-code': 'Oda kodu 4 haneli bir sayı olmalı.',
  'code-not-found': 'Bu kodla bekleyen bir oda bulunamadı. Kodu kontrol et ya da arkadaşından odayı yeniden kurmasını iste.',
  'avatar-locked': 'Bu karakter daha yüksek seviyede açılıyor.',
  'no-defuse': 'İmha yalnızca Mayın Avcısı modunda yapılabilir.',
  'no-sonar': 'Sonar hakkın kalmadı.',
  'no-power': 'Bu gücü kullanma hakkın kalmadı.',
  'already-armed': 'Zorla bu tur zaten hazır.',
  'not-in-mode': 'Bu güç bu modda kullanılamaz.',
  'not-seated': 'Bir masada değilsin.',
  'not-allowed': 'Zincir kuralı: önceki hamlenin hemen yanındaki karelerden birini açmalısın.',
  busy: 'Masa şu an meşgul, bir saniye sonra tekrar dene.',
  'no-profile': 'Önce oyuncu profilini oluştur.',
  'not-owner': 'Bunu yalnızca masa sahibi yapabilir.',
  'not-in-match': 'Bu maçta değilsin.',
  'not-supported': 'Bu özellik bu sunucuda henüz yok.',
  unauthorized: 'Oturum süresi doldu, yeniden giriş yap.',
};
export function errorText(e: unknown): string {
  const raw = (e as { code?: unknown } | null)?.code;
  if (!(e instanceof ArenaHttpError) && typeof raw === 'string') {
    if (raw === 'invalid_argument' || raw === 'not_granted')
      return 'Bu test sunucusunda yazma iznin yok. Sayfanın sahibi seni paylaşım menüsünden "Katkıda bulunan" ya da "Düzenleyici" olarak eklemeli.';
    if (raw === 'resource_exhausted') return 'Çok hızlı işlem yapıldı; birkaç saniye bekleyip tekrar dene.';
    if (raw === 'quota_exceeded') return 'Test sunucusunun kayıt sınırı doldu.';
    if (raw === 'revoked') return 'Bu sayfaya erişimin değişti; sayfayı yenile.';
    if (raw === 'unavailable') return 'Test sunucusuna şu an ulaşılamıyor; tekrar dene.';
  }
  const code = e instanceof ArenaHttpError ? e.code : 'server-error';
  return ERROR_TEXT[code] ?? `Hata: ${code}`;
}
