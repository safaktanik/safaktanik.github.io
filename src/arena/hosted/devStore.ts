import type { HCollection, HDb, HDocRef, HDocSnap, HQuery, HQuerySnap, HRoom, HRoomMsg } from './types';

/**
 * Yerel test deposuna (server/teststore.ts) bağlanan, claude.ai `db` API'siyle aynı yüzeye sahip istemci.
 * Yalnızca `?teststore=ws://…` ile açılan sayfalarda kullanılır (geliştirme ve otomatik testler).
 */
export function connectDevStore(url: string, uid: string): Promise<{ db: HDb; room: HRoom }> {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(`${url}?uid=${encodeURIComponent(uid)}`);
    let handler: (m: string) => void = () => undefined;
    const ch: StoreChannel = { send: (m) => ws.send(m), isOpen: () => ws.readyState === ws.OPEN, onMessage: (fn) => (handler = fn), onClose: (fn) => ws.addEventListener('close', fn) };
    ws.onmessage = (e) => handler(String(e.data));
    ws.onopen = () => ok(storeClient(ch));
    ws.onerror = () => fail(new Error('test deposuna bağlanılamadı'));
  });
}

/** Mesaj kanalı: WebSocket ya da eşler arası (WebRTC) veri kanalı. */
export interface StoreChannel {
  send(msg: string): void;
  isOpen(): boolean;
  onMessage(fn: (msg: string) => void): void;
  onClose(fn: () => void): void;
}

/** Kanal üzerinden depo istemcisi: claude.ai `db` + `room` API'siyle aynı yüzey. */
export function storeClient(ch: StoreChannel): { db: HDb; room: HRoom } {
  {
    const ws = { send: (m: string) => ch.send(m), get readyState() { return ch.isOpen() ? 1 : 3; }, OPEN: 1 };
    let seq = 0;
    const pending = new Map<number, (m: Record<string, unknown>) => void>();
    const subs = new Map<number, (m: Record<string, unknown>) => void>();
    const roomFns = new Map<string, Set<(m: HRoomMsg) => void>>();
    ch.onMessage((raw) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      if (typeof m.room === 'string') {
        for (const f of roomFns.get(`${m.room}|${m.topic}`) ?? []) f({ data: m.data, by: m.by as string });
      } else if (typeof m.sub === 'number') subs.get(m.sub)?.(m);
      else if (typeof m.id === 'number') {
        pending.get(m.id)?.(m);
        pending.delete(m.id);
      }
    });
    const call = (body: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        const id = ++seq;
        if (!ch.isOpen()) return rej({ code: 'unavailable' });
        pending.set(id, (m) => (m.ok === false ? rej({ code: m.code }) : res(m)));
        ws.send(JSON.stringify({ ...body, id }));
      });
    // Saat eşitleme: deponun (oda kuranın) saatine göre fark. En kısa gidiş-dönüşlü ölçüm en doğrusudur.
    let offset = 0;
    let bestRtt = Infinity;
    let synced = false;
    const syncClock = async () => {
      for (let k = 0; k < 4; k++) {
        const t0 = Date.now();
        try {
          const r = await call({ op: 'time' });
          const t1 = Date.now();
          const rtt = t1 - t0;
          if (typeof r.now === 'number' && rtt <= bestRtt * 1.5 + 5) {
            if (rtt < bestRtt) bestRtt = rtt;
            offset = (r.now as number) - (t0 + t1) / 2;
            synced = true;
          }
        } catch {
          return;
        }
      }
    };
    void syncClock();
    // Depo saat sorgusunu bilmiyorsa (eski sürüm) cihaz saatiyle devam et.
    setTimeout(() => (synced = true), 5000);
    const resync = setInterval(() => {
      if (!ch.isOpen()) return clearInterval(resync);
      bestRtt = Math.max(bestRtt, 50) * 2; // ağ değişmiş olabilir: yeni ölçümlere izin ver
      void syncClock();
    }, 30_000);
    const docSnap = (id: string, d: { exists: boolean; data?: Record<string, unknown> }): HDocSnap => ({ id, exists: d.exists, data: () => d.data });
    const docRef = (path: string): HDocRef => {
      const id = path.split('/').pop()!;
      return {
        id,
        path,
        get: async () => docSnap(id, (await call({ op: 'get', path })).doc as { exists: boolean; data?: Record<string, unknown> }),
        set: async (data) => void (await call({ op: 'set', path, data })),
        update: async (data) => void (await call({ op: 'update', path, data })),
        delete: async () => void (await call({ op: 'delete', path })),
        acquire: async (o) => {
          const r = await call({ op: 'acquire', path, holder: o.holder, ttl: o.ttlMs });
          return { acquired: !!r.acquired, expiresAt: r.expiresAt as string | undefined };
        },
        onSnapshot: (next) => {
          const sub = ++seq;
          subs.set(sub, (m) => next(docSnap(id, m.doc as { exists: boolean; data?: Record<string, unknown> })));
          ws.send(JSON.stringify({ op: 'subDoc', path, sub }));
          return () => {
            subs.delete(sub);
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ op: 'unsub', sub }));
          };
        },
      };
    };
    const query = (coll: string, filters: unknown[][], order: unknown[] | null, limit: number | null): HQuery => {
      const spec = { coll, filters, order, limit };
      const toSnap = (docs: { id: string; data: Record<string, unknown> }[]): HQuerySnap => ({ docs: docs.map((d) => docSnap(d.id, { exists: true, data: d.data })) });
      return {
        where: (f, op, v) => query(coll, [...filters, [f, op, v]], order, limit),
        orderBy: (f, dir = 'asc') => query(coll, filters, [f, dir], limit),
        limit: (n) => query(coll, filters, order, n),
        get: async () => toSnap((await call({ op: 'query', query: spec })).docs as { id: string; data: Record<string, unknown> }[]),
        onSnapshot: (next) => {
          const sub = ++seq;
          subs.set(sub, (m) => next(toSnap(m.docs as { id: string; data: Record<string, unknown> }[])));
          ws.send(JSON.stringify({ op: 'subQuery', query: spec, sub }));
          return () => {
            subs.delete(sub);
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ op: 'unsub', sub }));
          };
        },
      };
    };
    const collection = (path: string): HCollection => ({
      ...query(path, [], null, null),
      doc: (id?: string) => docRef(`${path}/${id ?? Math.random().toString(36).slice(2, 12)}`),
    });
    // claude.ai `room` öykünmesi: adlandırılmış odaya katıl, konuya yayın yap, dinle.
    const room: HRoom = {
      join: async (name) => {
        ws.send(JSON.stringify({ op: 'rjoin', name }));
        return {
          emit: async (topic, data) => void ws.send(JSON.stringify({ op: 'remit', name, topic, data })),
          on: (topic, fn) => {
            const k = `${name}|${topic}`;
            if (!roomFns.has(k)) roomFns.set(k, new Set());
            roomFns.get(k)!.add(fn);
            return () => roomFns.get(k)?.delete(fn);
          },
          leave: async () => {
            for (const k of [...roomFns.keys()]) if (k.startsWith(`${name}|`)) roomFns.delete(k);
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ op: 'rleave', name }));
          },
        };
      },
    };
    ch.onClose(() => {
      for (const [, p] of pending) p({ ok: false, code: 'unavailable' });
      pending.clear();
    });
    return { db: { doc: docRef, collection, now: () => Date.now() + offset, synced: () => synced }, room };
  }
}
