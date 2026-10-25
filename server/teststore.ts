import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

/**
 * YEREL TEST DEPOSU — claude.ai yayınlanan sayfalarının `db` yeteneğini taklit eder (belgeler, canlı abonelik,
 * kısa kilit/lease, players/{self} yazma kuralı). Yalnızca geliştirme ve otomatik testler içindir; veriler bellekte tutulur.
 * Kullanım: `npm run test-store` → sayfayı `?teststore=ws://localhost:8790&uid=ayse` ile açın.
 */

import { createStoreCore } from '../src/arena/hosted/storeCore';

export function createTestStore() {
  const core = createStoreCore();
  const server = createServer((_q, r) => r.writeHead(200, { 'content-type': 'text/plain' }).end('Mine Duel yerel test deposu'));
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: WebSocket, req) => {
    const uid = new URL(req.url ?? '/', 'http://x').searchParams.get('uid') ?? 'anon';
    const h = core.attach(uid, { send: (m) => ws.send(m), isOpen: () => ws.readyState === ws.OPEN });
    ws.on('message', (raw) => h.receive(String(raw)));
    ws.on('close', () => h.close());
  });
  return {
    docs: core.docs,
    listen: (port: number, host = '127.0.0.1') => new Promise<number>((ok) => server.listen(port, host, () => ok((server.address() as AddressInfo).port))),
    close: () =>
      new Promise<void>((ok) => {
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => ok());
      }),
  };
}

const isMain = process.argv[1] && /teststore\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 8790);
  void createTestStore()
    .listen(port, process.env.HOST ?? '127.0.0.1')
    .then((p) => console.log(`Yerel test deposu: ws://127.0.0.1:${p}  — sayfayı ?teststore=ws://127.0.0.1:${p}&uid=<ad> ile açın`));
}
