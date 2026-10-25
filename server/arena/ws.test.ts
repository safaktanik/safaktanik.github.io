import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ArenaServerMessage, MatchView, TableView } from '../../src/arena/protocol';
import { ECONOMY, TIERS } from '../../src/arena/economy';
import { createGameServer } from '../app';
import type { GameServer } from '../app';
import { createArenaStack } from './index';

/** Gerçek HTTP + WebSocket üzerinden çok istemcili masa testi (her istemci ayrı bağlantı ve ayrı oturum). */

const servers: GameServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

async function start() {
  const arena = await createArenaStack(':memory:');
  const app = createGameServer({ arena });
  const port = await app.listen(0, '127.0.0.1');
  servers.push(app);
  return { port, arena };
}

class Client {
  inbox: ArenaServerMessage[] = [];
  table: TableView | null = null;
  match: MatchView | null = null;
  private rid = 0;
  private waiters: { test: () => boolean; ok: () => void }[] = [];
  constructor(
    public ws: WebSocket,
    public token: string,
    public userId: string,
  ) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ArenaServerMessage;
      this.inbox.push(m);
      if (m.t === 'table') this.table = m.table;
      if (m.t === 'match') this.match = m.match;
      this.waiters = this.waiters.filter((w) => (w.test() ? (w.ok(), false) : true));
    });
  }
  until(test: () => boolean, ms = 8000): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('zaman aşımı')), ms);
      this.waiters.push({ test, ok: () => (clearTimeout(timer), ok()) });
    });
  }
  async req(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: unknown }> {
    const rid = ++this.rid;
    this.ws.send(JSON.stringify({ ...body, rid }));
    await this.until(() => this.inbox.some((m) => m.t === 'ack' && m.rid === rid));
    const ack = this.inbox.find((m) => m.t === 'ack' && m.rid === rid) as { ok: boolean; error?: string; data?: unknown };
    return ack;
  }
}

async function guest(port: number): Promise<Client> {
  const r = (await (await fetch(`http://127.0.0.1:${port}/api/auth/guest`, { method: 'POST' })).json()) as { token: string; me: { id: string } };
  const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
  await new Promise((ok, fail) => (ws.once('open', ok), ws.once('error', fail)));
  const c = new Client(ws, r.token, r.me.id);
  ws.send(JSON.stringify({ t: 'auth', token: r.token }));
  await c.until(() => c.inbox.some((m) => m.t === 'ready'));
  return c;
}

describe('arena: gerçek WebSocket', () => {
  it('kimliksiz bağlantı işlem yapamaz; uydurma jeton reddedilir', async () => {
    const { port } = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
    await new Promise((ok) => ws.once('open', ok));
    const got: string[] = [];
    ws.on('message', (d) => got.push(JSON.parse(d.toString()).t));
    ws.send(JSON.stringify({ t: 'table.leave', rid: 1 }));
    ws.send(JSON.stringify({ t: 'auth', token: 'x'.repeat(43) }));
    await new Promise((ok) => ws.once('close', ok));
    expect(got).toContain('auth-failed');
    expect(got).not.toContain('ack');
    const me = await fetch(`http://127.0.0.1:${port}/api/me`, { headers: { authorization: 'Bearer uydurma' } });
    expect(me.status).toBe(401);
  });

  it('4 ayrı istemci: masa açma, katılma, canlı koltuk güncellemesi, geri sayım, sıralı hamleler, aynı tahta, ödül', async () => {
    const { port, arena } = await start();
    const [a, b, c, d] = [await guest(port), await guest(port), await guest(port), await guest(port)];
    for (const x of [a, b, c, d]) x.ws.send(JSON.stringify({ t: 'lobby.sub' }));

    const created = await a.req({ t: 'table.create', tier: 'bronze', capacity: 4, name: 'Test Masası' });
    expect(created.ok).toBe(true);
    const tableId = (created.data as TableView).id;
    // lobi aboneleri yeni masayı görür
    await b.until(() => b.inbox.some((m) => m.t === 'lobby' && m.tables.some((t) => t.id === tableId)));

    expect((await b.req({ t: 'table.join', tableId })).ok).toBe(true);
    // a, b'nin oturduğunu gerçek zamanlı görür
    await a.until(() => a.table?.players.length === 2);
    expect((await c.req({ t: 'table.join', tableId })).ok).toBe(true);
    // c ayrılırsa koltuk herkeste boşalır
    expect((await c.req({ t: 'table.leave' })).ok).toBe(true);
    await a.until(() => a.table?.players.length === 2);
    expect((await c.req({ t: 'table.join', tableId })).ok).toBe(true);
    expect(a.table?.status).not.toBe('countdown');
    expect((await d.req({ t: 'table.join', tableId })).ok).toBe(true);
    await a.until(() => a.table?.status === 'countdown');
    // dolu masaya beşinci kişi giremez
    const e = await guest(port);
    expect((await e.req({ t: 'table.join', tableId })).error).toBe('table-not-joinable');

    for (const x of [a, b, c, d]) await x.until(() => x.match !== null, (ECONOMY.countdownSeconds + 3) * 1000);
    const players = [a, b, c, d];
    const byId = new Map(players.map((p) => [p.userId, p]));

    // sırası olmayanın hamlesi reddedilir
    const m0 = a.match!;
    const notTurn = players.find((p) => p.userId !== m0.players[m0.current].userId)!;
    expect((await notTurn.req({ t: 'move', matchId: m0.id, index: 0 })).error).toBe('not-your-turn');

    // maçı sonuna kadar oyna: her tur sırası gelen istemci gizli bir kare açar
    let moves = 0;
    let repeatChecked = false;
    while (a.match!.phase === 'playing' && moves < 400) {
      const v = a.match!;
      const p = byId.get(v.players[v.current].userId)!;
      await p.until(() => p.match!.seq === v.seq);
      if (!repeatChecked) {
        const open = p.match!.cells.findIndex((x) => x >= 0);
        if (open >= 0) {
          expect((await p.req({ t: 'move', matchId: v.id, index: open })).error).toBe('already-open');
          repeatChecked = true;
        }
      }
      const hidden = p.match!.cells.map((x, i) => (x === -1 ? i : -1)).filter((i) => i >= 0);
      const r = await p.req({ t: 'move', matchId: v.id, index: hidden[(moves * 37) % hidden.length] });
      expect(r.ok).toBe(true);
      moves++;
      await a.until(() => a.match!.seq > v.seq);
    }
    expect(a.match!.phase).toBe('finished');
    for (const x of players) await x.until(() => x.match!.phase === 'finished');
    // herkes aynı son durumu görür
    expect(new Set(players.map((x) => JSON.stringify(x.match!.cells))).size).toBe(1);
    expect(new Set(players.map((x) => x.match!.winnerSeat)).size).toBe(1);
    const final = a.match!;
    const winner = final.players[final.winnerSeat!];
    expect(final.results!.find((r) => r.rank === 1)!.userId).toBe(winner.userId);
    // 4 kişilik masa: kazanan 3 ücret, ikinci kendi ücretini geri alır
    expect(final.results!.find((r) => r.rank === 1)!.prize).toBe(3 * TIERS.bronze.fee);
    const secondId = final.results!.find((r) => r.rank === 2)!.userId;
    expect(final.results!.find((r) => r.rank === 2)!.prize).toBe(TIERS.bronze.fee);
    // bakiyeler sunucudan
    for (const x of players) {
      const me = (await (await fetch(`http://127.0.0.1:${port}/api/me`, { headers: { authorization: `Bearer ${x.token}` } })).json()) as { me: { balance: number } };
      const expected = ECONOMY.startingBalance - TIERS.bronze.fee + ECONOMY.firstMatchBonus + (x.userId === winner.userId ? 3 * TIERS.bronze.fee : x.userId === secondId ? TIERS.bronze.fee : 0);
      expect(me.me.balance).toBe(expected);
    }
    const lb = (await (await fetch(`http://127.0.0.1:${port}/api/leaderboard`)).json()) as { list: { userId: string }[] };
    expect(lb.list).toHaveLength(4);
    expect(arena.db.get<{ n: number }>("SELECT COUNT(*) n FROM matches WHERE status='finished' AND settled=1")!.n).toBe(1);
  }, 60_000);

  it('bağlantı kopup yeniden bağlanan oyuncu aynı masayı ve maçı görür', async () => {
    const { port } = await start();
    const [a, b, c] = [await guest(port), await guest(port), await guest(port)];
    const t = await a.req({ t: 'table.create', tier: 'bronze', capacity: 3 });
    const tableId = (t.data as TableView).id;
    await b.req({ t: 'table.join', tableId });
    await c.req({ t: 'table.join', tableId });
    await a.until(() => a.match !== null, 8000);
    const matchId = a.match!.id;
    b.ws.terminate();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
    await new Promise((ok) => ws.once('open', ok));
    const b2 = new Client(ws, b.token, b.userId);
    ws.send(JSON.stringify({ t: 'auth', token: b.token }));
    await b2.until(() => b2.match !== null && b2.table !== null);
    expect(b2.table!.id).toBe(tableId);
    expect(b2.match!.id).toBe(matchId);
    expect(b2.match!.viewerSeat).not.toBeNull();
  }, 20_000);

  it('emoji atışması: maçtaki herkese anlık iletilir (gönderenin koltuğuyla); sonar yalnızca sorana döner', async () => {
    const { port } = await start();
    const [a, b, c] = [await guest(port), await guest(port), await guest(port)];
    const tableId = ((await a.req({ t: 'table.create', tier: 'bronze', capacity: 3, name: 'Emoji' })).data as TableView).id;
    await b.req({ t: 'table.join', tableId });
    await c.req({ t: 'table.join', tableId });
    await a.until(() => !!a.match, (ECONOMY.countdownSeconds + 5) * 1000);
    await b.until(() => !!b.match);
    const matchId = a.match!.id;
    const seatA = a.match!.viewerSeat;
    a.ws.send(JSON.stringify({ t: 'react', matchId, emoji: '😈' }));
    a.ws.send(JSON.stringify({ t: 'react', matchId, emoji: 'kötü-söz' })); // listede olmayan: yok sayılır
    for (const x of [a, b, c]) await x.until(() => x.inbox.some((m) => m.t === 'react'));
    const got = c.inbox.filter((m) => m.t === 'react');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ t: 'react', matchId, seat: seatA, emoji: '😈' });
    // sonar
    const cur = [a, b, c].find((x) => x.match!.current === x.match!.viewerSeat)!;
    const r = await cur.req({ t: 'scan', matchId, index: 0 });
    expect(r.ok).toBe(true);
    expect((r.data as { area: number[] }).area).toHaveLength(4);
    const other = [a, b, c].find((x) => x !== cur)!;
    expect((await other.req({ t: 'scan', matchId, index: 0 })).error).toBe('not-your-turn');
  }, 30000);
});
