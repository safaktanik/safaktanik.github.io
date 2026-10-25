import { createStoreCore } from '../hosted/storeCore';
import type { StoreLink } from '../hosted/storeCore';
import { storeClient } from '../hosted/devStore';
import type { StoreChannel } from '../hosted/devStore';
import type { HDb, HRoom } from '../hosted/types';
import { loadPeer, peerOptions } from './peer';
import type { ConnLike, PeerLike } from './peer';
import { relayHost, relayJoin } from './relay';

/**
 * ARKADAŞ ODASI: odayı kuran telefonun tarayıcısı küçük bir "sunucu" olur; masalar, profiller,
 * bakiyeler onun belleğinde (ve o cihazın tarayıcı deposunda) tutulur. Katılanlar ona öncelikle herkese açık
 * MQTT aracıları üzerinden (her ağda çalışır), olmazsa doğrudan (WebRTC/PeerJS) bağlanır.
 * Oyunun geri kalanı test sunucusuyla aynı kodu kullanır (HostedBackend).
 */

const PREFIX = 'mineduel-v2-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const peerIdFor = (code: string) => `${PREFIX}${code}`;
export function newRoomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}
export const isRoomCode = (c: string) => /^[A-Z2-9]{5}$/.test(c);

function store<T>(key: string, make: () => T): T {
  try {
    const v = window.localStorage.getItem(key);
    if (v) return JSON.parse(v) as T;
    const n = make();
    window.localStorage.setItem(key, JSON.stringify(n));
    return n;
  } catch {
    return make();
  }
}
/** Bu cihazın kalıcı oyuncu kimliği (her oda kuran telefonda aynı profil). */
export const deviceUid = () => store('mine-duel:p2p-uid', () => `p${Math.random().toString(36).slice(2, 12)}`);
/** Bu cihazın oda kodu: kurulan oda her seferinde aynı kodu (ve linki) kullanır. */
export const myRoomCode = () => store('mine-duel:p2p-code', newRoomCode);
export function resetRoomCode(): string {
  const c = newRoomCode();
  try {
    window.localStorage.setItem('mine-duel:p2p-code', JSON.stringify(c));
  } catch {
    /* yok say */
  }
  return c;
}

export type RoomError = 'peer-lib' | 'network' | 'unavailable-id' | 'peer-unavailable' | 'closed' | 'timeout' | 'unknown';
const errType = (e: unknown): RoomError => {
  const t = (e as { type?: string })?.type;
  if (t === 'peer-lib' || t === 'unavailable-id' || t === 'peer-unavailable') return t;
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed' || t === 'disconnected') return 'network';
  return 'unknown';
};

export interface RoomSession {
  code: string;
  role: 'host' | 'guest';
  uid: string;
  db: HDb;
  room: HRoom;
  /** Bağlı oyuncu sayısı (oda kuran dahil). Yalnızca oda kuranda kesin bilinir. */
  peers(): number;
  onPeers(fn: (n: number) => void): void;
  /** Bağlantı koptu (katılan için: oda kuran ayrıldı / ağ gitti). */
  onLost(fn: () => void): void;
  close(): void;
}

function openPeer(id?: string): Promise<PeerLike> {
  return loadPeer().then(
    (Peer) =>
      new Promise<PeerLike>((ok, fail) => {
        const p = new Peer(id, peerOptions());
        const timer = window.setTimeout(() => fail(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
        p.on('open', () => {
          window.clearTimeout(timer);
          ok(p);
        });
        p.on('error', (e) => {
          window.clearTimeout(timer);
          fail(Object.assign(new Error(e.type ?? 'unknown'), { type: errType(e) }));
        });
      }),
  );
}

/** Odayı kur: bu tarayıcı depoyu barındırır. */
export async function hostRoom(code: string): Promise<RoomSession> {
  const uid = deviceUid();
  const KEY = 'mine-duel:p2p-host-db';
  let initial: Record<string, Record<string, unknown>> = {};
  try {
    initial = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
  } catch {
    /* boş başla */
  }
  let saveT: number | null = null;
  const core = createStoreCore({
    initial,
    onChange(docs) {
      if (saveT) return;
      saveT = window.setTimeout(() => {
        saveT = null;
        // Yalnızca oyuncu profilleri saklanır; masalar her açılışta temiz başlar.
        const keep: Record<string, Record<string, unknown>> = {};
        for (const [p, d] of docs) if (p.startsWith('players/')) keep[p] = d.data;
        try {
          window.localStorage.setItem(KEY, JSON.stringify(keep));
        } catch {
          /* depolama dolu/kapalı */
        }
      }, 400);
    },
  });
  const peerFns = new Set<(n: number) => void>();
  const lostFns = new Set<() => void>();
  let guests = 0;
  const bump = (d: number) => {
    guests = Math.max(0, guests + d);
    for (const f of peerFns) f(guests + 1);
  };
  const attachGuest = (guestUid: string, link: StoreLink) => {
    const h = core.attach(guestUid, link);
    bump(+1);
    let closed = false;
    return {
      receive: (m: string) => h.receive(m),
      close() {
        if (closed) return;
        closed = true;
        h.close();
        bump(-1);
      },
    };
  };
  // 1) Aktarma (MQTT): her ağda çalışır. 2) Doğrudan bağlantı (PeerJS): eski sürümler ve yedek.
  const relayP = relayHost(code, attachGuest).catch(() => null);
  let peer: PeerLike | null = null;
  const peerP = openPeer(peerIdFor(code)).then(
    (p) => {
      peer = p;
      p.on('connection', (conn: ConnLike) => {
        const meta = (conn.metadata ?? {}) as { uid?: string };
        const guestUid = typeof meta.uid === 'string' && /^[a-z0-9]{3,24}$/i.test(meta.uid) ? meta.uid : `g${Math.random().toString(36).slice(2, 10)}`;
        const link: StoreLink = { send: (m) => conn.send(m), isOpen: () => conn.open };
        let h: ReturnType<typeof attachGuest> | null = null;
        const start = () => {
          if (!h) h = attachGuest(guestUid, link);
        };
        conn.on('open', start);
        if (conn.open) start();
        conn.on('data', (d) => h?.receive(typeof d === 'string' ? d : JSON.stringify(d)));
        conn.on('close', () => {
          h?.close();
          h = null;
        });
      });
      // Aracı sunucu bağlantısı koparsa (ör. telefon uykudan dönünce) yeniden bağlan.
      p.on('disconnected', () => {
        if (!p.destroyed) window.setTimeout(() => p.reconnect?.(), 1500);
      });
      return p;
    },
    (e) => {
      throw Object.assign(new Error('host'), { type: errType(e) });
    },
  );
  const relay = await relayP;
  if (!relay) {
    // aktarma yoksa doğrudan bağlantıya kal
    try {
      await peerP;
    } catch (e) {
      throw e;
    }
  } else peerP.catch(() => undefined);

  // Oda kuranın kendi istemcisi: aynı depoya bellek içi kanal.
  const toClient = new Set<(m: string) => void>();
  const selfLink: StoreLink = { send: (m) => queueMicrotask(() => toClient.forEach((f) => f(m))), isOpen: () => true };
  const self = core.attach(uid, selfLink);
  const ch: StoreChannel = { send: (m) => queueMicrotask(() => self.receive(m)), isOpen: () => true, onMessage: (fn) => toClient.add(fn), onClose: () => undefined };
  const { db, room } = storeClient(ch);
  return {
    code,
    role: 'host',
    uid,
    db,
    room,
    peers: () => guests + 1,
    onPeers: (fn) => peerFns.add(fn),
    onLost: (fn) => lostFns.add(fn),
    close() {
      self.close();
      relay?.close();
      (peer as PeerLike | null)?.destroy();
      peerP.then((p) => p.destroy(), () => undefined);
    },
  };
}

/** Odaya katıl: oda kuranın tarayıcısına doğrudan bağlan. */
export async function joinRoom(code: string): Promise<RoomSession> {
  const uid = deviceUid();
  // 1) Aktarma (MQTT): her ağda çalışır.
  let relayErr: string | null = null;
  try {
    const ch = await relayJoin(code, uid);
    const { db, room } = storeClient(ch);
    return { code, role: 'guest', uid, db, room, peers: () => 0, onPeers: () => undefined, onLost: (fn) => ch.onLost(fn), close: () => ch.close() };
  } catch (e) {
    relayErr = (e as { type?: string }).type ?? 'unknown';
  }
  // Aracılara ulaşıldı ama oda yanıt vermedi: kod yanlış ya da oda kapalı (boşuna beklemeyelim).
  if (relayErr === 'peer-unavailable') throw Object.assign(new Error('join'), { type: 'peer-unavailable' });
  // 2) Yedek: doğrudan bağlantı (aktarma aracılarına hiç ulaşılamadıysa).
  try {
    return await joinDirect(code, uid);
  } catch (e) {
    const t = (e as { type?: RoomError }).type ?? 'unknown';
    // Aktarma aracıya ulaştı ama oda yanıt vermediyse asıl neden budur.
    throw Object.assign(new Error('join'), { type: relayErr === 'peer-unavailable' ? 'peer-unavailable' : t });
  }
}

async function joinDirect(code: string, uid: string): Promise<RoomSession> {
  let peer: PeerLike;
  try {
    peer = await openPeer();
  } catch (e) {
    throw Object.assign(new Error('join'), { type: errType(e) });
  }
  const conn = await new Promise<ConnLike>((ok, fail) => {
    const c = peer.connect(peerIdFor(code), { reliable: true, metadata: { uid }, serialization: 'json' });
    const timer = window.setTimeout(() => {
      peer.destroy();
      fail(Object.assign(new Error('timeout'), { type: 'timeout' }));
    }, 15000);
    c.on('open', () => {
      window.clearTimeout(timer);
      ok(c);
    });
    const bad = (e: unknown) => {
      window.clearTimeout(timer);
      peer.destroy();
      fail(Object.assign(new Error('join'), { type: errType(e) === 'unknown' ? 'peer-unavailable' : errType(e) }));
    };
    c.on('error', bad);
    peer.on('error', bad);
  });
  const fns = new Set<(m: string) => void>();
  const closeFns = new Set<() => void>();
  const lostFns = new Set<() => void>();
  let lost = false;
  const markLost = () => {
    if (lost) return;
    lost = true;
    for (const f of closeFns) f();
    for (const f of lostFns) f();
  };
  conn.on('data', (d) => {
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    for (const f of fns) f(s);
  });
  conn.on('close', markLost);
  conn.on('error', markLost);
  const ch: StoreChannel = { send: (m) => conn.send(m), isOpen: () => conn.open && !lost, onMessage: (fn) => fns.add(fn), onClose: (fn) => closeFns.add(fn) };
  const { db, room } = storeClient(ch);
  return {
    code,
    role: 'guest',
    uid,
    db,
    room,
    peers: () => 0,
    onPeers: () => undefined,
    onLost: (fn) => lostFns.add(fn),
    close() {
      lost = true;
      conn.close();
      peer.destroy();
    },
  };
}
