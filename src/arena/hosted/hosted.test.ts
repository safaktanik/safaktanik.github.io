import { describe, expect, it } from 'vitest';
import { ECONOMY, TIERS } from '../economy';
import { HostedBackend } from './hostedBackend';
import { createMemoryDb } from './memoryDb';
import { stateOf } from './model';
import type { PlayerDoc, TableDoc } from './model';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await sleep(20);
  }
}

function setup() {
  const mem = createMemoryDb();
  const mk = (uid: string) => {
    const b = new HostedBackend(mem.forUser(uid), uid, { botDelayMs: 30, countdownMs: 50, autoTick: false });
    b.start();
    return b;
  };
  const player = (uid: string) => mem.docs.get(`players/${uid}`) as unknown as PlayerDoc;
  const table = (id: string) => mem.docs.get(`tables/${id}`) as unknown as TableDoc;
  return { mem, mk, player, table };
}

/** Sıra kimdeyse oynat (insanlar rastgele gizli kare, botlar tick ile). */
async function playOut(bs: HostedBackend[], tableId: string, get: (id: string) => TableDoc) {
  for (let guard = 0; guard < 600; guard++) {
    const t = get(tableId);
    if (t.status === 'finished') return;
    const cur = t.seats.find((s) => s.seat === t.match!.s.current)!;
    if (cur.bot) {
      await sleep(40);
      await bs[0].tick();
      continue;
    }
    const b = bs.find((x) => x.uid === cur.uid)!;
    await until(() => b.state.match?.seq === t.match!.seq);
    const s = stateOf(t);
    const pool = s.allowed && s.allowed.length ? s.allowed : s.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
    await b.request({ t: 'move', matchId: t.match!.id, index: pool[Math.floor(Math.random() * pool.length)] });
  }
  throw new Error('maç bitmedi');
}

describe('test sunucusu (paylaşılan veritabanı)', () => {
  it('profil, masa açma, katılma, bot, geri sayım, maç, bitiş ve hesaplaşma', async () => {
    const { mk, player, table } = setup();
    const a = mk('ayse');
    const b = mk('burak');
    await until(() => !!a.state.needsProfile && !!b.state.needsProfile);
    await a.createProfile('Ayşe', 1);
    await b.createProfile('Burak', 2);
    await until(() => !!a.state.me && !!b.state.me);
    expect(a.state.me!.balance).toBe(ECONOMY.startingBalance);

    const tv = await a.request<{ id: string }>({ t: 'table.create', tier: 'bronze', mode: 'territory', capacity: 3, name: 'Deneme' });
    expect(player('ayse').balance).toBe(ECONOMY.startingBalance - TIERS.bronze.fee);
    await until(() => b.state.lobby.some((x) => x.id === tv.id));
    expect(b.state.lobby.find((x) => x.id === tv.id)!.mode).toBe('territory');

    await b.request({ t: 'table.join', tableId: tv.id });
    expect(player('burak').balance).toBe(ECONOMY.startingBalance - TIERS.bronze.fee);
    await until(() => a.state.table?.players.length === 2);

    // aynı masaya ikinci kez ya da başka masaya oturamaz
    await expect(b.request({ t: 'table.create', tier: 'bronze' })).rejects.toMatchObject({ code: 'already-seated' });
    // bot ekleyebilen yalnızca masa sahibi
    await expect(b.addBot!(tv.id)).rejects.toMatchObject({ code: 'not-owner' });
    await a.addBot!(tv.id);
    await until(() => table(tv.id).status === 'countdown');
    await sleep(80);
    await a.tick();
    await until(() => table(tv.id).status === 'playing');
    const t = table(tv.id);
    expect(t.match!.pool).toBe(2 * TIERS.bronze.fee); // bot havuza para eklemez
    expect(JSON.stringify(t)).not.toContain('"mines"'); // mayın listesi düz tutulmaz

    // sırası olmayan oynayamaz
    const s0 = stateOf(t);
    const notTurn = t.seats.find((x) => !x.bot && x.seat !== s0.current)!;
    const nb = notTurn.uid === 'ayse' ? a : b;
    await until(() => nb.state.match !== null);
    await expect(nb.request({ t: 'move', matchId: t.match!.id, index: 0 })).rejects.toMatchObject({ code: 'not-your-turn' });

    await playOut([a, b], tv.id, table);
    const done = table(tv.id);
    expect(done.status).toBe('finished');
    expect(done.match!.results).toHaveLength(3);
    // her iki oyuncu da kendi hesabını bir kez kesinleştirir
    await a.tick();
    await b.tick();
    await until(() => player('ayse').settled.length === 1 && player('burak').settled.length === 1);
    await a.tick();
    await b.tick();
    expect(player('ayse').settled).toHaveLength(1);
    const winner = done.match!.results![0];
    const pa = player('ayse');
    const pb = player('burak');
    const base = ECONOMY.startingBalance - TIERS.bronze.fee + ECONOMY.firstMatchBonus;
    // havuzda 2 ücret var (bot ödemez): ikinciye iade yok, kazanan hepsini alır
    expect(pa.balance).toBe(base + (winner.userId === 'ayse' ? done.match!.pool : 0));
    expect(pb.balance).toBe(base + (winner.userId === 'burak' ? done.match!.pool : 0));
    expect(pa.games).toBe(1);
    expect(pa.seatAt).toBeNull();
    // bakiye = işlem kaydı toplamı
    for (const p of [pa, pb]) expect(p.tx.reduce((s, x) => s + x.amount, 0)).toBe(p.balance);
    a.stop();
    b.stop();
  }, 90000);

  it('başlamadan ayrılan ücretini geri alır; boş masa kapanır; şifreli masa', async () => {
    const { mk, player, table } = setup();
    const a = mk('a1');
    const b = mk('b1');
    await until(() => !!a.state.needsProfile && !!b.state.needsProfile);
    await a.createProfile('Ali', 0);
    await b.createProfile('Banu', 3);
    await until(() => !!a.state.me && !!b.state.me);
    const tv = await a.request<{ id: string }>({ t: 'table.create', tier: 'silver', password: 'gizli', mode: 'treasure' });
    await expect(b.request({ t: 'table.join', tableId: tv.id, password: 'yanlis' })).rejects.toMatchObject({ code: 'wrong-password' });
    await b.request({ t: 'table.join', tableId: tv.id, password: 'gizli' });
    await until(() => b.state.table?.id === tv.id);
    await b.request({ t: 'table.leave' });
    await until(() => player('b1').balance === ECONOMY.startingBalance);
    expect(table(tv.id).seats).toHaveLength(1);
    await until(() => a.state.table !== null);
    await a.request({ t: 'table.leave' });
    await until(() => table(tv.id).status === 'cancelled');
    expect(player('a1').balance).toBe(ECONOMY.startingBalance);
    a.stop();
    b.stop();
  }, 20000);

  it('elenen oyuncu maçtan çıkar, yeni masaya oturur; eski maç bitince sonucu yine kesinleşir', async () => {
    const { mk, player, table } = setup();
    const a = mk('ayse');
    const b = mk('burak');
    await until(() => !!a.state.needsProfile && !!b.state.needsProfile);
    await a.createProfile('Ayşe', 1);
    await b.createProfile('Burak', 2);
    await until(() => !!a.state.me && !!b.state.me);
    const tv = await a.request<{ id: string }>({ t: 'table.create', tier: 'bronze', capacity: 3, name: 'Çıkış' });
    await until(() => b.state.lobby.some((x) => x.id === tv.id));
    await b.request({ t: 'table.join', tableId: tv.id });
    await a.addBot!(tv.id);
    await until(() => table(tv.id).status === 'countdown');
    await sleep(80);
    await a.tick();
    await until(() => table(tv.id).status === 'playing');
    await until(() => !!b.state.match);
    // sonar: sırası olan kullanır, sıra değişmez
    const t0 = table(tv.id);
    const curUid = t0.seats.find((x) => x.seat === t0.match!.s.current)!.uid;
    if (curUid === 'ayse' || curUid === 'burak') {
      const cb = curUid === 'ayse' ? a : b;
      await until(() => cb.state.match?.seq === t0.match!.seq);
      const r = await cb.request<{ count: number; area: number[] }>({ t: 'scan', matchId: t0.match!.id, index: 0 });
      expect(r.area.length).toBe(4);
      expect(table(tv.id).match!.s.current).toBe(t0.match!.s.current);
      await expect(cb.request({ t: 'scan', matchId: t0.match!.id, index: 5 })).rejects.toMatchObject({ code: 'no-sonar' });
    }
    // Burak masadan çıkar (hükmen elenir) ve maç ekranı kapanır
    await b.leaveMatch();
    expect(b.state.match).toBeNull();
    await until(() => stateOf(table(tv.id)).players.find((p) => p.userId === 'burak')!.eliminated);
    // yeni masa açabilir; eski masa "bekleyenler"e alınır
    const t2 = await b.request<{ id: string }>({ t: 'table.create', tier: 'bronze', capacity: 3, name: 'Yeni' });
    expect(player('burak').seatAt).toBe(t2.id);
    expect(player('burak').pending).toContain(tv.id);
    // Ayşe maçı botla bitirir
    await playOut([a], tv.id, table);
    await a.tick();
    await until(() => player('ayse').settled.length === 1);
    // Burak'ın eski maçı da kesinleşir
    await until(
      () => {
        void b.tick();
        return player('burak').settled.length === 1;
      },
      10000,
    );
    await until(() => !(player('burak').pending ?? []).includes(tv.id));
    expect(player('burak').games).toBe(1);
    expect(player('burak').seatAt).toBe(t2.id);
    a.stop();
    b.stop();
  }, 90000);

  it('çevrimdışı masalar: sunucusuz profil, masa, botlarla maç, para, mağaza, sıralamada botlar; veriler kalıcı', async () => {
    let saved: Record<string, Record<string, unknown>> | null = null;
    const store = { load: () => saved, save: (all: Record<string, Record<string, unknown>>) => void (saved = JSON.parse(JSON.stringify(all))) };
    const mem = createMemoryDb(store);
    const b = new HostedBackend(mem.forUser('yerel', { anyWrite: true }), 'yerel', { botDelayMs: 5, countdownMs: 20, autoTick: false, local: true });
    b.start();
    expect(b.label).toBe('Çevrimdışı masalar');
    await until(() => !!b.state.needsProfile);
    await b.createProfile('Kaptan', 3);
    await until(() => !!b.state.me);
    await b.claimDaily();
    const tv = await b.request<{ id: string }>({ t: 'table.create', tier: 'bronze', capacity: 3, name: 'Yerel' });
    await b.addBot!(tv.id);
    await b.addBot!(tv.id);
    const tdoc = () => mem.docs.get(`tables/${tv.id}`) as unknown as TableDoc;
    await until(() => tdoc().status === 'countdown');
    await sleep(40);
    await b.tick();
    await until(() => tdoc().status === 'playing');
    await playOut([b], tv.id, tdoc);
    await b.tick();
    const me = () => mem.docs.get('players/yerel') as unknown as PlayerDoc;
    await until(() => me().settled.length === 1);
    expect(me().wGames).toBe(1);
    // botlar da sıralamaya girer
    const bots = [...mem.docs.keys()].filter((k) => k.startsWith('players/bot-'));
    expect(bots.length).toBe(2);
    const lb = await b.leaderboard();
    expect(lb.list.length).toBe(3);
    expect(lb.list.some((r) => r.userId === 'yerel')).toBe(true);
    // bakiye = işlem kaydı toplamı
    expect(me().tx.reduce((x, t) => x + t.amount, 0)).toBe(me().balance);
    b.stop();
    // kalıcılık: aynı depodan yeniden açınca profil ve bakiye yerinde
    await sleep(250);
    const mem2 = createMemoryDb(store);
    expect((mem2.docs.get('players/yerel') as unknown as PlayerDoc).balance).toBe(me().balance);
  }, 90000);

  it('arkadaş odası: 2 kişilik özel oda lobide görünmez, kodla katılınır ve maç başlar', async () => {
    const { mk, table } = setup();
    const a = mk('ece');
    const b = mk('can');
    await until(() => !!a.state.needsProfile && !!b.state.needsProfile);
    await a.createProfile('Ece', 1);
    await b.createProfile('Can', 2);
    await until(() => !!a.state.me && !!b.state.me);
    const tv = await a.request<{ id: string; code: string; private: boolean }>({ t: 'table.create', tier: 'bronze', mode: 'hunter', capacity: 2, name: 'Ece odası', private: true });
    expect(tv.private).toBe(true);
    expect(tv.code).toMatch(/^\d{4}$/);
    await sleep(50);
    expect(b.state.lobby.some((x) => x.id === tv.id)).toBe(false); // lobide yok
    expect(a.state.lobby.some((x) => x.id === tv.id)).toBe(true); // sahibi görür
    await expect(b.joinByCode!('0000' === tv.code ? '1111' : '0000')).rejects.toMatchObject({ code: 'code-not-found' });
    await expect(b.joinByCode!('12a')).rejects.toMatchObject({ code: 'bad-code' });
    await b.joinByCode!(tv.code);
    await until(() => table(tv.id).status === 'countdown');
    await sleep(80);
    await a.tick();
    await until(() => table(tv.id).status === 'playing');
    expect(stateOf(table(tv.id)).players).toHaveLength(2);
    expect(stateOf(table(tv.id)).mode).toBe('hunter');
    await playOut([a, b], tv.id, table);
    expect(table(tv.id).status).toBe('finished');
    a.stop();
    b.stop();
  }, 90000);

  it('başkasının oyuncu belgesine yazılamaz', async () => {
    const { mem } = setup();
    const db = mem.forUser('saldirgan');
    await expect(db.doc('players/kurban').set({ balance: 1e9 })).rejects.toMatchObject({ code: 'invalid_argument' });
  });

  it('dört modda botlarla maç başlar ve biter', async () => {
    for (const mode of ['classic', 'territory', 'treasure', 'chain'] as const) {
      const { mk, table } = setup();
      const a = mk('solo');
      await until(() => !!a.state.needsProfile);
      await a.createProfile('Solo', 4);
      await until(() => !!a.state.me);
      const tv = await a.request<{ id: string }>({ t: 'table.create', tier: 'bronze', mode, capacity: 3 });
      await a.addBot!(tv.id);
      await a.addBot!(tv.id);
      await until(() => table(tv.id).status === 'countdown');
      await sleep(80);
      await a.tick();
      await until(() => table(tv.id).status === 'playing');
      await playOut([a], tv.id, table);
      expect(table(tv.id).status).toBe('finished');
      expect(table(tv.id).match!.pool).toBe(TIERS.bronze.fee);
      a.stop();
    }
  }, 60000);
});
