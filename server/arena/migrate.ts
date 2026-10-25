import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, openDb } from './db';

/** `npm run db:migrate` — veritabanını oluşturur/şemayı günceller. (Sunucu açılışta da otomatik uygular.) */
const path = resolve(process.env.DB_PATH ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'data', 'mine-duel.db'));
mkdirSync(dirname(path), { recursive: true });
const db = await openDb(path);
const applied = migrate(db);
console.log(applied.length ? `Uygulanan migration: ${applied.join(', ')}` : 'Şema güncel.');
console.log(`Veritabanı: ${path}`);
db.close();
