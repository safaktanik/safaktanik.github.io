import type { HCollection, HDb, HDocRef, HDocSnap, HQuery, HQuerySnap } from './types';

/** Bellekte çalışan `db` taklidi (testler için). Belgeler, canlı abonelik, kısa kilit ve players/{self} kuralı. */
export function createMemoryDb(store?: { load(): Record<string, Record<string, unknown>> | null; save(all: Record<string, Record<string, unknown>>): void }) {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(store?.load() ?? {}));
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (!store || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      store.save(Object.fromEntries(docs));
    }, 150);
  };
  const leases = new Map<string, { holder: string; until: number }>();
  const listeners = new Set<{ coll?: string; path?: string; fire: () => void }>();
  const collOf = (p: string) => p.split('/').slice(0, -1).join('/');
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const notify = (path: string) => {
    persist();
    for (const l of [...listeners]) if (l.path === path || l.coll === collOf(path)) queueMicrotask(l.fire);
  };
  const forUser = (uid: string, opts: { anyWrite?: boolean } = {}): HDb => {
    const canWrite = (p: string) => {
      if (opts.anyWrite) return true;
      const s = p.split('/');
      return !(s[0] === 'players' && s.length === 2 && s[1] !== uid);
    };
    const snap = (path: string): HDocSnap => {
      const d = docs.get(path);
      return { id: path.split('/').pop()!, exists: !!d, data: () => (d ? clone(d) : undefined) };
    };
    const ref = (path: string): HDocRef => ({
      id: path.split('/').pop()!,
      path,
      get: async () => snap(path),
      set: async (data) => {
        if (!canWrite(path)) throw { code: 'invalid_argument' };
        docs.set(path, clone(data));
        notify(path);
      },
      update: async (data) => {
        if (!canWrite(path) || !docs.has(path)) throw { code: 'invalid_argument' };
        docs.set(path, { ...docs.get(path)!, ...clone(data) });
        notify(path);
      },
      delete: async () => {
        if (!canWrite(path)) throw { code: 'invalid_argument' };
        docs.delete(path);
        notify(path);
      },
      acquire: async (o) => {
        const now = Date.now();
        const l = leases.get(path);
        if (l && l.until > now && l.holder !== o.holder) return { acquired: false, expiresAt: new Date(l.until).toISOString() };
        const until = now + Math.max(1000, o.ttlMs ?? 30000);
        leases.set(path, { holder: o.holder, until });
        return { acquired: true, expiresAt: new Date(until).toISOString() };
      },
      onSnapshot: (next) => {
        const l = { path, fire: () => next(snap(path)) };
        listeners.add(l);
        queueMicrotask(l.fire);
        return () => listeners.delete(l);
      },
    });
    const query = (coll: string, filters: [string, string, unknown][]): HQuery => {
      const run = (): HQuerySnap => ({
        docs: [...docs.keys()]
          .filter((p) => collOf(p) === coll)
          .filter((p) =>
            filters.every(([f, op, v]) => {
              const x = docs.get(p)![f];
              return op === '==' ? x === v : op === 'in' ? (v as unknown[]).includes(x) : op === '<' ? (x as number) < (v as number) : true;
            }),
          )
          .map(snap),
      });
      return {
        where: (f, op, v) => query(coll, [...filters, [f, op, v]]),
        orderBy: () => query(coll, filters),
        limit: () => query(coll, filters),
        get: async () => run(),
        onSnapshot: (next) => {
          const l = { coll, fire: () => next(run()) };
          listeners.add(l);
          queueMicrotask(l.fire);
          return () => listeners.delete(l);
        },
      };
    };
    const collection = (p: string): HCollection => ({ ...query(p, []), doc: (id?: string) => ref(`${p}/${id ?? Math.random().toString(36).slice(2)}`) });
    return { doc: ref, collection };
  };
  return { docs, forUser };
}
