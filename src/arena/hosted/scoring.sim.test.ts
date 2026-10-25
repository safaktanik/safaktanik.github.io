/**
 * Çevrimdışı masalarda puanlamanın uçtan uca denetimi: bir insan + botlar, birçok maç.
 * İnsan "iyi" (mayınları bilerek kaçınan) ya da "kötü" (mayına basan) oynar; kazandığında puanı
 * asla eksi olmamalı, sonuncu olduğunda eksi olmalı.
 */
import { describe, expect, it } from 'vitest';
import { HostedBackend } from './hostedBackend';
import { createMemoryDb } from './memoryDb';
import { stateOf } from './model';
import type { PlayerDoc, TableDoc } from './model';
import type { ArenaMode } from '../modes';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await sleep(10);
  }
}

async function oneMatch(mode: ArenaMode, cap: number, style: 'good' | 'bad') {
  const mem = createMemoryDb();
  const b = new HostedBackend(mem.forUser('ben'), 'ben', { botDelayMs: 5, countdownMs: 10, autoTick: false, local: true });
  b.start();
  await until(() => !!b.state.needsProfile);
  await b.createProfile('Şafak', 1);
  await until(() => !!b.state.me);
  const tv = await b.request<{ id: string }>({ t: 'table.create', tier: 'bronze', mode, capacity: cap, name: 'Sim' });
  for (let i = 1; i < cap; i++) await b.addBot(tv.id);
  const get = () => mem.docs.get(`tables/${tv.id}`) as unknown as TableDoc;
  for (let g = 0; g < 50 && get().status !== 'playing'; g++) {
    await sleep(15);
    await b.tick();
  }
  expect(get().status).toBe('playing');
  for (let guard = 0; guard < 3000; guard++) {
    const t = get();
    if (t.status === 'finished') break;
    const s = stateOf(t);
    const cur = t.seats.find((x) => x.seat === s.current)!;
    if (cur.bot) {
      await sleep(6);
      await b.tick();
      continue;
    }
    await until(() => b.state.match?.seq === t.match!.seq);
    const mines = new Set(s.mines);
    const hidden = s.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
    const allowed = s.allowed && s.allowed.length ? s.allowed : hidden;
    let pick: number;
    let action: 'open' | 'defuse' = 'open';
    if (style === 'good') {
      if (mode === 'hunter') {
        const m = allowed.filter((i) => mines.has(i));
        pick = m.length ? m[0] : allowed[0];
        action = m.length ? 'defuse' : 'open';
      } else {
        const safe = allowed.filter((i) => !mines.has(i));
        pick = safe.length ? safe[Math.floor(Math.random() * safe.length)] : allowed[0];
      }
    } else {
      const m = allowed.filter((i) => mines.has(i));
      pick = m.length ? m[0] : allowed[0];
    }
    await b.request({ t: 'move', matchId: t.match!.id, index: pick, action });
  }
  const t = get();
  expect(t.status).toBe('finished');
  // hesaplaşma (settle) zamanlayıcıda çalışır
  for (let g = 0; g < 40; g++) {
    await b.tick();
    await sleep(10);
    const p = mem.docs.get('players/ben') as unknown as PlayerDoc;
    if (p.settled?.includes(t.match!.id)) break;
  }
  const p = mem.docs.get('players/ben') as unknown as PlayerDoc;
  const row = t.match!.results!.find((r) => r.userId === 'ben')!;
  const shown = b.state.match?.results?.find((r) => r.userId === 'ben');
  b.stop?.();
  return { rank: row.rank, players: cap, wPoints: p.wPoints, shownDelta: shown?.pointsDelta ?? row.pointsDelta, rowDelta: row.pointsDelta, prize: row.prize, reason: row.eliminationReason, safe: row.safeOpened };
}

describe('puanlama simülasyonu (çevrimdışı, 1 insan + botlar)', () => {
  for (const mode of ['classic', 'blitz', 'hunter', 'territory', 'treasure', 'chain'] as ArenaMode[]) {
    for (const cap of [2, 3, 4]) {
      it(`${mode} · ${cap} kişi: kazanan + puan, son − puan`, async () => {
        const good = await oneMatch(mode, cap, 'good');
        const bad = await oneMatch(mode, cap, 'bad');
        // eslint-disable-next-line no-console
        console.log(mode, cap, 'iyi:', JSON.stringify(good), 'kötü:', JSON.stringify(bad));
        expect(good.wPoints).toBe(good.shownDelta);
        expect(bad.wPoints).toBe(bad.shownDelta);
        if (good.rank === 1) expect(good.wPoints).toBeGreaterThan(0);
        // sonuncu: elendiyse eksi; sona kadar ayakta kaldıysa (ör. sandıklar erken bitti) eksi yok
        if (bad.rank === cap && bad.reason) expect(bad.wPoints).toBeLessThan(0);
        for (const r of [good, bad]) if (!r.reason) expect(r.wPoints).toBeGreaterThanOrEqual(0);
      }, 60000);
    }
  }
});
