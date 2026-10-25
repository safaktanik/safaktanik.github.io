/**
 * Eşler arası bağlantı (WebRTC). Üretimde PeerJS kütüphanesi CDN'den yüklenir ve ücretsiz PeerJS
 * aracı sunucusu (yalnızca tanışma/sinyal için) kullanılır; oyun verisi telefonlar arasında doğrudan akar.
 * Otomatik testlerde `?p2ptest=ws://…` ile aynı arayüzü taklit eden yerel bir aktarıcı kullanılır.
 */

export interface ConnLike {
  open: boolean;
  metadata?: unknown;
  peer: string;
  send(data: unknown): void;
  close(): void;
  on(ev: 'open' | 'close', fn: () => void): void;
  on(ev: 'data', fn: (d: unknown) => void): void;
  on(ev: 'error', fn: (e: unknown) => void): void;
}
export interface PeerLike {
  id: string;
  disconnected?: boolean;
  destroyed?: boolean;
  on(ev: 'open', fn: (id: string) => void): void;
  on(ev: 'connection', fn: (c: ConnLike) => void): void;
  on(ev: 'error', fn: (e: { type?: string; message?: string }) => void): void;
  on(ev: 'disconnected' | 'close', fn: () => void): void;
  connect(id: string, opts?: { reliable?: boolean; metadata?: unknown; serialization?: string }): ConnLike;
  reconnect?(): void;
  destroy(): void;
}
export type PeerCtor = new (id?: string, opts?: Record<string, unknown>) => PeerLike;

/** NAT arkasındaki telefonların birbirini bulması için STUN; mümkün olmayan ağlarda yedek TURN (ücretsiz, en iyi çaba). */
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

const CDNS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];

function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => ok();
    s.onerror = () => {
      s.remove();
      fail(new Error(`yüklenemedi: ${src}`));
    };
    document.head.appendChild(s);
  });
}

let ctorP: Promise<PeerCtor> | null = null;
export function loadPeer(): Promise<PeerCtor> {
  if (ctorP) return ctorP;
  const test = new URLSearchParams(window.location.search).get('p2ptest');
  if (test) return (ctorP = Promise.resolve(fakePeerCtor(test)));
  ctorP = (async () => {
    const w = window as unknown as { Peer?: PeerCtor };
    if (w.Peer) return w.Peer;
    for (const src of CDNS) {
      try {
        await loadScript(src);
        if (w.Peer) return w.Peer;
      } catch {
        /* sıradaki CDN */
      }
    }
    ctorP = null;
    throw Object.assign(new Error('peer-lib'), { type: 'peer-lib' });
  })();
  return ctorP;
}

export function peerOptions(): Record<string, unknown> {
  return { debug: 0, config: { iceServers: ICE_SERVERS } };
}

/* ------------------------------------------------------------------ test aktarıcısı (PeerJS taklidi) */

type Handler = (...a: unknown[]) => void;
class Emitter {
  private h = new Map<string, Handler[]>();
  on(ev: string, fn: Handler) {
    this.h.set(ev, [...(this.h.get(ev) ?? []), fn]);
  }
  emit(ev: string, ...a: unknown[]) {
    for (const f of this.h.get(ev) ?? []) f(...a);
  }
}

function fakePeerCtor(url: string): PeerCtor {
  return class FakePeer extends Emitter {
    id: string;
    destroyed = false;
    private ws: WebSocket;
    private conns = new Map<string, FakeConn>();
    constructor(id?: string) {
      super();
      this.id = id ?? `anon-${Math.random().toString(36).slice(2, 10)}`;
      this.ws = new WebSocket(`${url}?id=${encodeURIComponent(this.id)}`);
      this.ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as { t: string; from?: string; cid?: string; data?: unknown; meta?: unknown; err?: string };
        if (m.t === 'open') this.emit('open', this.id);
        else if (m.t === 'error') this.emit('error', { type: m.err });
        else if (m.t === 'incoming') {
          const c = new FakeConn(this, m.cid!, m.from!, m.meta);
          this.conns.set(m.cid!, c);
          this.emit('connection', c);
          this.raw({ t: 'accept', cid: m.cid });
          setTimeout(() => c.markOpen(), 0);
        } else if (m.t === 'accepted') this.conns.get(m.cid!)?.markOpen();
        else if (m.t === 'data') this.conns.get(m.cid!)?.emit('data', m.data);
        else if (m.t === 'closed') {
          const c = this.conns.get(m.cid!);
          if (c) {
            c.open = false;
            this.conns.delete(m.cid!);
            c.emit('close');
          }
        } else if (m.t === 'unavailable') {
          const c = this.conns.get(m.cid!);
          this.conns.delete(m.cid!);
          c?.emit('error', { type: 'peer-unavailable' });
          this.emit('error', { type: 'peer-unavailable' });
        }
      };
      this.ws.onclose = () => {
        for (const c of this.conns.values()) {
          c.open = false;
          c.emit('close');
        }
        this.conns.clear();
        if (!this.destroyed) this.emit('disconnected');
      };
      this.ws.onerror = () => this.emit('error', { type: 'network' });
    }
    raw(m: unknown) {
      if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    }
    connect(id: string, opts?: { metadata?: unknown }): ConnLike {
      const cid = Math.random().toString(36).slice(2, 12);
      const c = new FakeConn(this, cid, id, opts?.metadata);
      this.conns.set(cid, c);
      const go = () => this.raw({ t: 'connect', to: id, cid, meta: opts?.metadata });
      if (this.ws.readyState === 1) go();
      else this.ws.addEventListener('open', go);
      return c;
    }
    dropConn(cid: string) {
      this.raw({ t: 'close', cid });
      this.conns.delete(cid);
    }
    destroy() {
      this.destroyed = true;
      this.ws.close();
    }
  } as unknown as PeerCtor;
}

class FakeConn extends Emitter implements ConnLike {
  open = false;
  constructor(
    private p: { raw(m: unknown): void; dropConn(cid: string): void },
    private cid: string,
    public peer: string,
    public metadata: unknown,
  ) {
    super();
  }
  markOpen() {
    if (this.open) return;
    this.open = true;
    this.emit('open');
  }
  send(data: unknown) {
    this.p.raw({ t: 'data', cid: this.cid, data });
  }
  close() {
    this.open = false;
    this.p.dropConn(this.cid);
    this.emit('close');
  }
}
