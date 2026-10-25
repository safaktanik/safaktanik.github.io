import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './app';
import { createArenaStack } from './arena/index';

/**
 * Mine Duel oyun sunucusunu başlatır.
 *
 * Ortam değişkenleri:
 *  PORT             dinlenecek port (varsayılan 8787)
 *  HOST             dinlenecek adres (varsayılan 0.0.0.0)
 *  ALLOWED_ORIGINS  virgülle ayrılmış izinli Origin listesi; boşsa tüm Origin'ler kabul edilir
 *  STATIC_DIR       arayüz klasörü (varsayılan ../dist)
 *  DB_PATH          çok oyunculu masa sisteminin SQLite dosyası (varsayılan ./data/mine-duel.db)
 */
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const STATIC_DIR = resolve(
  process.env.STATIC_DIR ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'),
);

const DB_PATH = resolve(process.env.DB_PATH ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'mine-duel.db'));

// Masa sistemi Node 22.5+ (yerleşik SQLite) ister. Başlatılamazsa sunucu yine açılır; arayüz antrenmanı sunar
// arayüz de masa sisteminin neden kapalı olduğunu söyler.
let arena: Awaited<ReturnType<typeof createArenaStack>> | undefined;
try {
  arena = await createArenaStack(DB_PATH);
} catch (err) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const old = major < 22 || (major === 22 && minor < 5);
  console.error('');
  console.error('⚠  Masa sistemi (çok oyunculu masalar) başlatılamadı.');
  if (old) console.error(`   Node.js sürümün ${process.versions.node}; masa sistemi Node.js 22.5 veya üzerini ister. https://nodejs.org adresinden güncelleyip sunucuyu yeniden başlat.`);
  else console.error(`   Neden: ${(err as Error).message}`);
  console.error('   Sunucu masa sistemi olmadan açılıyor; arayüzde yalnızca antrenman çalışır.');
  console.error('');
}
const app = createGameServer({ allowedOrigins: ALLOWED, staticDir: STATIC_DIR, arena });

app.listen(PORT, HOST).then(
  () => {
    console.log(`Mine Duel sunucusu: http://${HOST}:${PORT}  (${arena ? 'masa sistemi: /arena + /api' : 'masa sistemi KAPALI'})`);
    if (arena) console.log(`Veritabanı: ${DB_PATH}`);
    if (existsSync(STATIC_DIR)) console.log(`Arayüz sunuluyor: ${STATIC_DIR}`);
    if (ALLOWED.length) console.log(`İzinli Origin'ler: ${ALLOWED.join(', ')}`);
  },
  (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} kullanımda. Başka bir port için PORT=… değişkenini ayarlayın.`
        : `Sunucu başlatılamadı: ${err.message}`,
    );
    process.exit(1);
  },
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
