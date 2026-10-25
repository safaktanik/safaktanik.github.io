import { mqttConnect } from './mqtt';
import type { MqttClient } from './mqtt';
import type { StoreLink } from '../hosted/storeCore';
import type { StoreChannel } from '../hosted/devStore';

/**
 * Aktarmalı oda bağlantısı: oda kuran ve katılanlar herkese açık MQTT aracıları üzerinden konuşur.
 * Doğrudan (WebRTC) bağlantı gerekmez; mobil veri dahil her ağda çalışır. Birden çok aracı aynı anda
 * denenir: biri kapalıysa diğeri kullanılır.
 *
 * Konular: mineduel/v1/<kod>/h  (katılanlar → oda kuran)   mineduel/v1/<kod>/g/<oturum>  (oda kuran → katılan)
 */
export const DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
export function brokerList(): string[] {
  try {
    const q = new URLSearchParams(window.location.search).get('mqtt');
    if (q) return q.split(',').filter((u) => /^wss?:\/\//.test(u));
  } catch {
    /* yok say */
  }
  return DEFAULT_BROKERS;
}
const base = (code: string) => `mineduel/v2/${code}`;
const CHUNK = 48_000;
const PING_MS = 6000;
const DEAD_MS = 20_000;

type Env = { t: 'hello' | 'join' | 'msg' | 'ping' | 'bye' | 'welcome' | 'part'; s?: string; u?: string; d?: string; id?: string; i?: number; n?: number };

/** Büyük mesajları parçalara böler (aracıların mesaj boyu sınırı için). */
function sendMsg(pub: (e: Env) => void, extra: Partial<Env>, d: string): void {
  if (d.length <= CHUNK) return pub({ ...extra, t: 'msg', d });
  const id = Math.random().toString(36).slice(2, 10);
  const n = Math.ceil(d.length / CHUNK);
  for (let i = 0; i < n; i++) pub({ ...extra, t: 'part', id, i, n, d: d.slice(i * CHUNK, (i + 1) * CHUNK) });
}
/** Parçaları birleştirir; tamamlanınca tüm mesajı döndürür. */
function assembler() {
  const parts = new Map<string, { n: number; got: string[]; c: number; at: number }>();
  return (e: Env): string | null => {
    if (e.t === 'msg') return e.d ?? null;
    if (e.t !== 'part' || !e.id || typeof e.i !== 'number' || typeof e.n !== 'number' || e.n > 400) return null;
    let p = parts.get(e.id);
    if (!p) {
      p = { n: e.n, got: new Array<string>(e.n), c: 0, at: Date.now() };
      parts.set(e.id, p);
      for (const [k, v] of parts) if (Date.now() - v.at > 60_000) parts.delete(k);
    }
    if (p.got[e.i] === undefined) {
      p.got[e.i] = e.d ?? '';
      p.c++;
    }
    if (p.c < p.n) return null;
    parts.delete(e.id);
    return p.got.join('');
  };
}
const parse = (s: string): Env | null => {
  try {
    const e = JSON.parse(s) as Env;
    return e && typeof e.t === 'string' ? e : null;
  } catch {
    return null;
  }
};

export interface GuestHandle {
  receive(m: string): void;
  close(): void;
}

/**
 * Oda kuran: bütün aracılara bağlanır ve katılanları kabul eder. En az bir aracıya bağlanınca çözülür.
 * attach(uid, link): katılan için depo bağlantısı açar.
 */
export function relayHost(code: string, attach: (uid: string, link: StoreLink) => GuestHandle, onCount?: (n: number) => void): Promise<{ close(): void; brokers(): number }> {
  const urls = brokerList();
  let stopped = false;
  const clients = new Map<string, MqttClient>();
  const sessions = new Map<string, { sid: string; uid: string; client: MqttClient; h: GuestHandle | null; last: number; asm: ReturnType<typeof assembler> }>();
  const count = () => onCount?.([...sessions.values()].filter((x) => x.h).length);
  const drop = (sid: string, notify = true) => {
    const x = sessions.get(sid);
    if (!x) return;
    sessions.delete(sid);
    if (notify && x.client.isOpen()) x.client.publish(`${base(code)}/g/${sid}`, JSON.stringify({ t: 'bye' }));
    x.h?.close();
    count();
  };
  const serve = (url: string, c: MqttClient) => {
    clients.set(url, c);
    c.subscribe(`${base(code)}/h`);
    c.onMessage((_topic, payload) => {
      const e = parse(payload);
      if (!e || typeof e.s !== 'string' || !/^[a-z0-9]{6,20}$/i.test(e.s)) return;
      const sid = e.s;
      const to = `${base(code)}/g/${sid}`;
      const pub = (x: Env) => c.publish(to, JSON.stringify(x));
      if (e.t === 'hello') return pub({ t: 'welcome', id: hostId });
      let x = sessions.get(sid);
      if (e.t === 'join') {
        if (x || sessions.size >= 16) return;
        const uid = typeof e.u === 'string' && /^[a-z0-9]{3,24}$/i.test(e.u) ? e.u : `g${Math.random().toString(36).slice(2, 10)}`;
        x = { sid, uid, client: c, h: null, last: Date.now(), asm: assembler() };
        sessions.set(sid, x);
        const link: StoreLink = { send: (m) => sendMsg(pub, {}, m), isOpen: () => c.isOpen() && sessions.has(sid) };
        x.h = attach(uid, link);
        count();
        return;
      }
      if (!x || x.client !== c) return;
      x.last = Date.now();
      if (e.t === 'bye') return drop(sid, false);
      if (e.t === 'ping') return pub({ t: 'ping' });
      const full = x.asm(e);
      if (full !== null) x.h?.receive(full);
    });
    c.onClose(() => {
      if (clients.get(url) === c) clients.delete(url);
      for (const [sid, x] of sessions) if (x.client === c) drop(sid, false);
      if (!stopped) window.setTimeout(() => void connect(url).catch(() => undefined), 3000);
    });
  };
  const hostId = Math.random().toString(36).slice(2, 10);
  const connect = (url: string): Promise<void> =>
    mqttConnect(url, 7000, { topic: `${base(code)}/w`, payload: hostId }).then(
      (c) => {
        if (stopped) return c.close();
        serve(url, c);
      },
      () => {
        if (!stopped) window.setTimeout(() => void connect(url).catch(() => undefined), 15000);
        throw new Error('broker');
      },
    );
  const sweep = window.setInterval(() => {
    const now = Date.now();
    for (const [sid, x] of sessions) {
      if (now - x.last > DEAD_MS) drop(sid);
      else if (x.client.isOpen()) x.client.publish(`${base(code)}/g/${sid}`, JSON.stringify({ t: 'ping' }));
    }
  }, PING_MS);
  const onHide = () => handle.close();
  window.addEventListener('pagehide', onHide);
  const handle = {
    close() {
      window.removeEventListener('pagehide', onHide);
      stopped = true;
      window.clearInterval(sweep);
      for (const sid of [...sessions.keys()]) drop(sid);
      for (const c of clients.values()) c.close();
      clients.clear();
    },
    brokers: () => clients.size,
  };
  return new Promise((ok, fail) => {
    let left = urls.length;
    let done = false;
    for (const u of urls)
      connect(u).then(
        () => {
          if (!done) {
            done = true;
            ok(handle);
          }
        },
        () => {
          if (--left === 0 && !done) {
            handle.close();
            fail(Object.assign(new Error('network'), { type: 'network' }));
          }
        },
      );
  });
}

/**
 * Katılan: aracılara aynı anda bağlanır, odaya "merhaba" der; oda kurandan ilk yanıt gelen aracıyla devam eder.
 * Hiçbir aracıya ulaşılamazsa 'network', aracı var ama oda yanıt vermezse 'peer-unavailable'.
 */
export function relayJoin(code: string, uid: string, timeoutMs = 9000): Promise<StoreChannel & { close(): void; onLost(fn: () => void): void }> {
  const urls = brokerList();
  const sid = `s${Math.random().toString(36).slice(2, 12)}`;
  const mine = `${base(code)}/g/${sid}`;
  const host = `${base(code)}/h`;
  const pending = new Set<MqttClient>();
  return new Promise((ok, fail) => {
    let settled = false;
    let reached = 0;
    let failed = 0;
    const timer = window.setTimeout(() => finishFail(reached ? 'peer-unavailable' : 'timeout'), timeoutMs);
    const finishFail = (type: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      for (const c of pending) c.close();
      fail(Object.assign(new Error(type), { type }));
    };
    const win = (c: MqttClient, hostId: string | undefined) => {
      settled = true;
      window.clearTimeout(timer);
      for (const o of pending) if (o !== c) o.close();
      pending.clear();
      const pub = (e: Env) => c.publish(host, JSON.stringify({ ...e, s: sid }));
      pub({ t: 'join', u: uid });
      const fns = new Set<(m: string) => void>();
      const closeFns = new Set<() => void>();
      const lostFns = new Set<() => void>();
      const asm = assembler();
      let lost = false;
      let lastHost = Date.now();
      const markLost = () => {
        if (lost) return;
        lost = true;
        window.clearInterval(beat);
        for (const f of closeFns) f();
        for (const f of lostFns) f();
        c.close();
      };
      const beat = window.setInterval(() => {
        if (Date.now() - lastHost > DEAD_MS) return markLost();
        pub({ t: 'ping' });
      }, PING_MS);
      c.subscribe(`${base(code)}/w`);
      c.onMessage((topic, payload) => {
        // oda kuranın bağlantısı beklenmedik koptu (aracının "vasiyet" mesajı)
        if (topic === `${base(code)}/w`) return void (hostId && payload === hostId && markLost());
        if (topic !== mine) return;
        const e = parse(payload);
        if (!e) return;
        lastHost = Date.now();
        if (e.t === 'bye') return markLost();
        const full = asm(e);
        if (full !== null) for (const f of fns) f(full);
      });
      c.onClose(markLost);
      ok({
        send: (m) => sendMsg(pub, {}, m),
        isOpen: () => !lost && c.isOpen(),
        onMessage: (fn) => fns.add(fn),
        onClose: (fn) => closeFns.add(fn),
        onLost: (fn) => lostFns.add(fn),
        close() {
          if (!lost && c.isOpen()) pub({ t: 'bye' });
          lost = true;
          window.clearInterval(beat);
          c.close();
        },
      });
    };
    for (const u of urls)
      mqttConnect(u).then(
        (c) => {
          if (settled) return c.close();
          reached++;
          pending.add(c);
          c.onMessage((topic, payload) => {
            if (settled || topic !== mine) return;
            const e = parse(payload);
            if (e?.t === 'welcome') win(c, e.id);
          });
          c.subscribe(mine);
          c.publish(host, JSON.stringify({ t: 'hello', s: sid }));
          // ilk "merhaba" kaybolursa bir kez daha
          window.setTimeout(() => !settled && c.isOpen() && c.publish(host, JSON.stringify({ t: 'hello', s: sid })), 2500);
        },
        () => {
          if (++failed === urls.length) finishFail('network');
        },
      );
  });
}
