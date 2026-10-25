import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ArenaStack } from './arena/index';

export interface ServerOptions {
  /** İzinli Origin listesi; boşsa tüm Origin'ler kabul edilir. */
  allowedOrigins?: string[];
  /** Derlenmiş arayüz klasörü; yoksa yalnızca API ve /health sunulur. */
  staticDir?: string;
  /** Çok oyunculu masa sistemi (HTTP /api + WebSocket /arena). Verilmezse API "arena-disabled" döner. */
  arena?: ArenaStack;
}

export interface GameServer {
  server: Server;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Mine Duel oyun sunucusu:
 *  - /api/...  masa sistemi HTTP API'si
 *  - /arena    masa sistemi WebSocket'i
 *  - /health   durum denetimi
 *  - diğerleri: varsa `staticDir` içindeki derlenmiş arayüz (tek komutla yayın için)
 */
export function createGameServer(opts: ServerOptions = {}): GameServer {
  const allowed = opts.allowedOrigins ?? [];
  const staticDir = opts.staticDir ? resolve(opts.staticDir) : null;
  if (opts.arena) opts.arena.gateway.allowedOrigins = allowed;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, arena: !!opts.arena }));
      return;
    }
    if (opts.arena && opts.arena.gateway.handleHttp(req, res)) return;
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'arena-disabled' }));
      return;
    }
    if (!staticDir || !existsSync(staticDir)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Mine Duel sunucusu çalışıyor. Arayüz için "npm run build" çalıştırın veya "npm run dev" kullanın.');
      return;
    }
    // Yol aşımı (../) koruması: istenen dosya staticDir dışına çıkamaz.
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = resolve(staticDir, rel);
    if (file !== staticDir && !file.startsWith(staticDir + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });

  const originAllowed = (origin: string | undefined) => allowed.length === 0 || (typeof origin === 'string' && allowed.includes(origin));
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/arena' && opts.arena && originAllowed(req.headers.origin)) {
      const aw = opts.arena.gateway.wss;
      aw.handleUpgrade(req, socket, head, (ws) => aw.emit('connection', ws, req));
      return;
    }
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });

  return {
    server,
    listen: (port, host = '0.0.0.0') =>
      new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen(port, host, () => ok((server.address() as AddressInfo).port));
      }),
    close: () =>
      new Promise((ok) => {
        opts.arena?.close();
        server.close(() => ok());
        server.closeAllConnections?.();
      }),
  };
}
