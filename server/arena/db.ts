import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Ortak SQLite arayüzü. Node ≥ 22.5'te yerleşik `node:sqlite`, Bun'da `bun:sqlite` kullanılır;
 * ek paket gerekmez. Bütün para ve maç işlemleri `tx()` içinde yapılır.
 */
export interface Db {
  exec(sql: string): void;
  run(sql: string, ...params: unknown[]): { changes: number };
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  /** BEGIN IMMEDIATE … COMMIT; hata olursa ROLLBACK. İç içe çağrı SAVEPOINT kullanır. */
  tx<T>(fn: () => T): T;
  close(): void;
}

interface Stmt {
  run(...p: unknown[]): { changes: number | bigint };
  get(...p: unknown[]): unknown;
  all(...p: unknown[]): unknown[];
}
interface Raw {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export async function openDb(path = ':memory:'): Promise<Db> {
  let raw: Raw;
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    const name = 'bun:sqlite'; // yalnızca Bun altında (testler) yüklenir
    const mod = (await import(/* @vite-ignore */ name)) as { Database: new (p: string) => Raw };
    raw = new mod.Database(path);
  } else {
    const sqlite = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => Raw } | undefined }).getBuiltinModule?.('node:sqlite');
    if (!sqlite) throw new Error('node:sqlite bulunamadı: Node.js 22.5 veya üzeri gerekir.');
    raw = new sqlite.DatabaseSync(path);
  }
  raw.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA busy_timeout = 5000');

  const cache = new Map<string, Stmt>();
  const stmt = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  let depth = 0;
  const db: Db = {
    exec: (sql) => raw.exec(sql),
    run: (sql, ...p) => ({ changes: Number(stmt(sql).run(...norm(p)).changes) }),
    get: (sql, ...p) => (stmt(sql).get(...norm(p)) ?? undefined) as never,
    all: (sql, ...p) => stmt(sql).all(...norm(p)) as never,
    tx(fn) {
      const outer = depth === 0;
      const sp = `sp${depth}`;
      raw.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
      depth++;
      try {
        const out = fn();
        depth--;
        raw.exec(outer ? 'COMMIT' : `RELEASE ${sp}`);
        return out;
      } catch (e) {
        depth--;
        raw.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    },
    close: () => raw.close(),
  };
  return db;
}

/** migrations/*.sql dosyalarını sırayla uygular (bir kez). */
export function migrate(db: Db, dir = fileURLToPath(new URL('./migrations/', import.meta.url))): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const done = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((r) => r.version));
  const applied: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    let sql = readFileSync(dir + f, 'utf8');
    // Tablo yeniden kurma göçleri: yabancı anahtarlar işlem DIŞINDA kapatılır (işlem içinde PRAGMA etkisizdir),
    // işlem bitmeden bütünlük denetlenir; bozuksa göç geri alınır.
    const noFk = /PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(sql);
    if (noFk) {
      sql = sql.replace(/PRAGMA\s+foreign_keys\s*=\s*(ON|OFF)\s*;/gi, '');
      db.exec('PRAGMA foreign_keys = OFF');
    }
    try {
      db.tx(() => {
        db.exec(sql);
        if (noFk && db.all('PRAGMA foreign_key_check').length) throw new Error(`göç ${f}: yabancı anahtar bütünlüğü bozuldu`);
        db.run('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', f, Date.now());
      });
    } finally {
      if (noFk) db.exec('PRAGMA foreign_keys = ON');
    }
    applied.push(f);
  }
  return applied;
}
