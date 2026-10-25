import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Accounts } from './accounts';
import { Arena } from './arena';
import type { ArenaOptions } from './arena';
import { migrate, openDb } from './db';
import type { Db } from './db';
import { ArenaGateway } from './gateway';

export interface ArenaStack {
  db: Db;
  accounts: Accounts;
  arena: Arena;
  gateway: ArenaGateway;
  close(): void;
}

/** Veritabanını açar, şemayı uygular, yarıda kalmış maçları iade ederek kapatır ve ağ geçidini kurar. */
export async function createArenaStack(dbPath: string, opts: ArenaOptions = {}): Promise<ArenaStack> {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = await openDb(dbPath);
  migrate(db);
  const accounts = new Accounts(db, opts.clock);
  let gateway: ArenaGateway | null = null;
  const arena = new Arena(db, accounts, { ...opts, isOnline: (u) => gateway?.isOnline(u) ?? false });
  gateway = new ArenaGateway(db, accounts, arena);
  const { aborted } = arena.recover();
  if (aborted) console.log(`[arena] yarıda kalan ${aborted} maç iade edilerek kapatıldı`);
  return {
    db,
    accounts,
    arena,
    gateway,
    close() {
      arena.shutdown();
      gateway!.close();
      db.close();
    },
  };
}
