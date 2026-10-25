import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, applyFilters } from './filters';
import type { TableView } from '../protocol';

const mk = (o: Partial<TableView>): TableView => ({
  id: Math.random().toString(),
  name: 'x',
  tier: 'bronze',
  mode: 'classic',
  boardSize: 12,
  mineCount: 20,
  entryFee: 100,
  maxPlayers: 3,
  players: [],
  status: 'waiting',
  locked: false,
  prizePool: 0,
  maxPrizePool: 300,
  houseFeePercent: 0,
  countdownEndsAt: null,
  ownerId: 'u',
  matchId: null,
  ...o,
});
const P = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, username: 'a', avatar: 0, level: 1, seat: i }));

describe('masa filtreleri', () => {
  const list = [
    mk({ id: 'b', tier: 'bronze', entryFee: 100, players: P(1) }),
    mk({ id: 's', tier: 'silver', entryFee: 500, boardSize: 20, players: P(2) }),
    mk({ id: 'g', tier: 'gold', entryFee: 1500, maxPlayers: 4, boardSize: 25, players: P(3) }),
    mk({ id: 'p', tier: 'bronze', status: 'playing', players: P(3) }),
    mk({ id: 'z', tier: 'bronze', mode: 'treasure', players: P(1) }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => applyFilters(list, { ...DEFAULT_FILTERS, ...f }).map((t) => t.id);
  it('varsayılan: bekleyen ve oynanan masalar (Katıl / İzle)', () => expect(ids({})).toEqual(['b', 's', 'g', 'p', 'z']));
  it('yalnızca bekleyenler', () => expect(ids({ status: 'open' })).toEqual(['b', 's', 'g', 'z']));
  it('mod', () => expect(ids({ mode: 'treasure' })).toEqual(['z']));
  it('durum', () => {
    expect(ids({ status: 'playing' })).toEqual(['p']);
    expect(ids({ status: 'all' })).toHaveLength(5);
  });
  it('ücret, tier, kapasite, boş koltuk, alan', () => {
    expect(ids({ status: 'open', maxFee: 500 })).toEqual(['b', 's', 'z']);
    expect(ids({ status: 'open', tier: 'silver' })).toEqual(['s']);
    expect(ids({ status: 'open', capacity: 4 })).toEqual(['g']);
    expect(ids({ status: 'open', minFree: 2 })).toEqual(['b', 'z']);
    expect(ids({ status: 'open', board: 'large' })).toEqual(['g']);
    expect(ids({ status: 'open', board: 'medium' })).toEqual(['s']);
  });
});
