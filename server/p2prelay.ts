import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

/**
 * YALNIZCA TEST İÇİN: PeerJS aracı sunucusu + WebRTC veri kanalının taklidi (mesajları WebSocket üzerinden aktarır).
 * Sayfayı `?p2ptest=ws://127.0.0.1:8793` ile açınca oyun gerçek PeerJS yerine bunu kullanır.
 */
export function createRelay() {
  const peers = new Map<string, WebSocket>();
  const conns = new Map<string, { a: string; b: string }>();
  const server = createServer((_q, r) => r.writeHead(200).end('p2p relay'));
  const wss = new WebSocketServer({ server });
  const sendTo = (id: string, m: unknown) => {
    const ws = peers.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  wss.on('connection', (ws: WebSocket, req) => {
    const id = new URL(req.url ?? '/', 'http://x').searchParams.get('id') ?? '';
    if (!id || peers.has(id)) {
      ws.send(JSON.stringify({ t: 'error', err: 'unavailable-id' }));
      ws.close();
      return;
    }
    peers.set(id, ws);
    ws.send(JSON.stringify({ t: 'open' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as { t: string; to?: string; cid: string; meta?: unknown; data?: unknown };
      if (m.t === 'connect') {
        if (!peers.has(m.to!)) return sendTo(id, { t: 'unavailable', cid: m.cid });
        conns.set(m.cid, { a: id, b: m.to! });
        sendTo(m.to!, { t: 'incoming', from: id, cid: m.cid, meta: m.meta });
      } else if (m.t === 'accept') {
        const c = conns.get(m.cid);
        if (c) sendTo(c.a, { t: 'accepted', cid: m.cid });
      } else if (m.t === 'data') {
        const c = conns.get(m.cid);
        if (c) sendTo(c.a === id ? c.b : c.a, { t: 'data', cid: m.cid, data: m.data });
      } else if (m.t === 'close') {
        const c = conns.get(m.cid);
        if (c) {
          conns.delete(m.cid);
          sendTo(c.a === id ? c.b : c.a, { t: 'closed', cid: m.cid });
        }
      }
    });
    ws.on('close', () => {
      if (peers.get(id) === ws) peers.delete(id);
      for (const [cid, c] of conns)
        if (c.a === id || c.b === id) {
          conns.delete(cid);
          sendTo(c.a === id ? c.b : c.a, { t: 'closed', cid });
        }
    });
  });
  return {
    listen: (port: number, host = '127.0.0.1') => new Promise<number>((ok) => server.listen(port, host, () => ok((server.address() as AddressInfo).port))),
  };
}

const isMain = process.argv[1] && /p2prelay\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  void createRelay()
    .listen(Number(process.env.PORT ?? 8793))
    .then((p) => console.log(`P2P test aktarıcısı: ws://127.0.0.1:${p}`));
}
