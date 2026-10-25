import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createGameServer } from './app';
import type { GameServer } from './app';

const servers: GameServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
async function start(opts: Parameters<typeof createGameServer>[0] = {}) {
  const app = createGameServer(opts);
  const port = await app.listen(0, '127.0.0.1');
  servers.push(app);
  return port;
}

describe('sunucu', () => {
  it('masa sistemi yoksa /api açıkça arena-disabled döner; /health çalışır', async () => {
    const port = await start();
    expect(await (await fetch(`http://127.0.0.1:${port}/health`)).json()).toEqual({ ok: true, arena: false });
    const r = await fetch(`http://127.0.0.1:${port}/api/config`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'arena-disabled' });
  });

  it('/arena dışındaki yollara WebSocket yükseltmesi yapılamaz', async () => {
    const port = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const outcome = await new Promise<string>((ok) => {
      ws.once('open', () => ok('open'));
      ws.once('unexpected-response', () => ok('rejected'));
      ws.once('error', () => ok('rejected'));
      ws.once('close', () => ok('rejected'));
    });
    expect(outcome).toBe('rejected');
  });

  it('arayüzü sunar, bilinmeyen yolları index.html’e düşürür ve dizin dışına çıkmaz', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mine-duel-static-'));
    const dir = join(root, 'dist');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Mine Duel</title>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)');
    writeFileSync(join(root, 'mine-duel-secret.txt'), 'GİZLİ');
    const port = await start({ staticDir: dir });
    const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
    expect(await (await get('/')).text()).toContain('Mine Duel');
    expect((await get('/assets/a.js')).headers.get('content-type')).toContain('javascript');
    expect(await (await get('/baska/sayfa')).text()).toContain('Mine Duel');
    for (const evil of ['/..%2fmine-duel-secret.txt', '/%2e%2e/mine-duel-secret.txt', '/../mine-duel-secret.txt']) {
      expect(await (await get(evil)).text()).not.toContain('GİZLİ');
    }
    expect((await get('/%zz')).status).toBe(400);
    rmSync(root, { recursive: true, force: true });
  });
});
