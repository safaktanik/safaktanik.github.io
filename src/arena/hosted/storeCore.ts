/**
 * Paylaşılan belge deposunun çekirdeği (claude.ai `db` + `room` alt kümesinin taklidi):
 * belgeler, canlı abonelik, kısa kilit (lease), players/{self} yazma kuralı ve adlandırılmış odalarda anlık olaylar.
 * Hem yerel test deposu (Node, WebSocket) hem de telefonda "oda kuran" tarayıcı (eşler arası bağlantı) bunu kullanır.
 * Ağ ya da Node'a bağımlı değildir; mesajlar JSON metinleridir.
 */

type Doc = { data: Record<string, unknown>; lease: { holder: string; until: number } | null };
type Filter = [string, string, unknown];
export interface QuerySpec {
  coll: string;
  filters: Filter[];
  order: [string, 'asc' | 'desc'] | null;
  limit: number | null;
}
export interface StoreLink {
  send(msg: string): void;
  isOpen(): boolean;
}
interface Sub {
  link: StoreLink;
  id: number;
  path?: string;
  query?: QuerySpec;
}

function match(v: unknown, op: string, x: unknown): boolean {
  switch (op) {
    case '==':
      return v === x;
    case '!=':
      return v !== x;
    case '<':
      return (v as number) < (x as number);
    case '<=':
      return (v as number) <= (x as number);
    case '>':
      return (v as number) > (x as number);
    case '>=':
      return (v as number) >= (x as number);
    case 'in':
      return Array.isArray(x) && x.includes(v);
    case 'not-in':
      return Array.isArray(x) && !x.includes(v);
    case 'array-contains':
      return Array.isArray(v) && v.includes(x);
    default:
      return false;
  }
}

export interface StoreCoreOptions {
  initial?: Record<string, Record<string, unknown>>;
  /** Her yazmadan sonra (kalıcılık için). */
  onChange?(docs: Map<string, { data: Record<string, unknown> }>): void;
}

export function createStoreCore(opts: StoreCoreOptions = {}) {
  const docs = new Map<string, Doc>();
  for (const [p, d] of Object.entries(opts.initial ?? {})) docs.set(p, { data: d, lease: null });
  const subs = new Set<Sub>();
  const members = new Map<StoreLink, Set<string>>();
  const collOf = (path: string) => path.split('/').slice(0, -1).join('/');
  const run = (q: QuerySpec) => {
    let out = [...docs.entries()].filter(([p]) => collOf(p) === q.coll).map(([p, d]) => ({ id: p.split('/').pop()!, data: d.data }));
    for (const [f, op, v] of q.filters) out = out.filter((d) => match(d.data[f], op, v));
    if (q.order) {
      const [f, dir] = q.order;
      out.sort((a, b) => ((a.data[f] as number) < (b.data[f] as number) ? -1 : (a.data[f] as number) > (b.data[f] as number) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    } else out.sort((a, b) => (a.id < b.id ? -1 : 1));
    if (q.limit) out = out.slice(0, q.limit);
    return out;
  };
  const push = (s: Sub) => {
    if (!s.link.isOpen()) return;
    if (s.path !== undefined) {
      const d = docs.get(s.path);
      s.link.send(JSON.stringify({ sub: s.id, doc: d ? { exists: true, data: d.data } : { exists: false } }));
    } else if (s.query) s.link.send(JSON.stringify({ sub: s.id, docs: run(s.query) }));
  };
  const changed = (path: string) => {
    const c = collOf(path);
    for (const s of subs) if (s.path === path || s.query?.coll === c) push(s);
    opts.onChange?.(docs);
  };
  const canWrite = (uid: string, path: string) => {
    const seg = path.split('/');
    if (seg[0] === 'players' && seg.length === 2) return seg[1] === uid;
    return true;
  };

  /** Bir istemciyi bağlar; gelen her mesaj `receive` ile verilir. */
  function attach(uid: string, link: StoreLink) {
    const rooms = new Set<string>();
    members.set(link, rooms);
    return {
      receive(raw: string) {
        let m: { id: number; op: string; name?: string; topic?: string; path?: string; data?: Record<string, unknown>; holder?: string; ttl?: number; query?: QuerySpec; sub?: number };
        try {
          m = JSON.parse(raw);
        } catch {
          return;
        }
        const reply = (body: Record<string, unknown>) => link.isOpen() && link.send(JSON.stringify({ id: m.id, ...body }));
        const p = m.path ?? '';
        switch (m.op) {
          case 'time':
            return reply({ ok: true, now: Date.now() });
          case 'get': {
            const d = docs.get(p);
            return reply({ ok: true, doc: d ? { exists: true, data: d.data } : { exists: false } });
          }
          case 'set':
          case 'update': {
            if (!canWrite(uid, p)) return reply({ ok: false, code: 'invalid_argument' });
            const d = docs.get(p);
            if (m.op === 'update' && !d) return reply({ ok: false, code: 'invalid_argument' });
            const data = m.op === 'set' ? m.data! : { ...d!.data, ...m.data };
            docs.set(p, { data: JSON.parse(JSON.stringify(data)), lease: d?.lease ?? null });
            reply({ ok: true });
            return changed(p);
          }
          case 'delete': {
            if (!canWrite(uid, p)) return reply({ ok: false, code: 'invalid_argument' });
            docs.delete(p);
            reply({ ok: true });
            return changed(p);
          }
          case 'acquire': {
            const now = Date.now();
            const d = docs.get(p) ?? { data: {}, lease: null };
            const ttl = Math.max(1000, Math.min(600_000, m.ttl || 30_000));
            if (d.lease && d.lease.until > now && d.lease.holder !== m.holder) return reply({ ok: true, acquired: false, expiresAt: new Date(d.lease.until).toISOString() });
            d.lease = { holder: m.holder!, until: now + ttl };
            if (!docs.has(p)) docs.set(p, d);
            return reply({ ok: true, acquired: true, expiresAt: new Date(d.lease.until).toISOString(), holder: m.holder });
          }
          case 'subDoc':
          case 'subQuery': {
            const s: Sub = { link, id: m.sub!, path: m.op === 'subDoc' ? p : undefined, query: m.op === 'subQuery' ? m.query : undefined };
            subs.add(s);
            return push(s);
          }
          case 'unsub':
            for (const s of subs) if (s.link === link && s.id === m.sub) subs.delete(s);
            return;
          case 'query':
            return reply({ ok: true, docs: run(m.query!) });
          case 'rjoin':
            rooms.add(`${m.name}`);
            return;
          case 'rleave':
            rooms.delete(`${m.name}`);
            return;
          case 'remit': {
            const msg = JSON.stringify({ room: m.name, topic: m.topic, data: m.data, by: uid });
            for (const [c, r] of members) if (r.has(`${m.name}`) && c.isOpen()) c.send(msg);
            return;
          }
          case 'ping':
            return reply({ ok: true, pong: Date.now() });
        }
      },
      close() {
        members.delete(link);
        for (const s of subs) if (s.link === link) subs.delete(s);
      },
    };
  }

  return { docs, attach, connections: () => members.size };
}
