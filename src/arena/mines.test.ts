import { describe, expect, it } from 'vitest';
import { ECONOMY, TIERS, boardFor, boardRange, feeRange, levelFromXp, minesForBoard, payout, weekStartOf } from './economy';
import { alivePlayers, cellView, chestCountFor, computeCounts, createArena, forfeit, modeView, neighbors, rankedSeats, reveal, scan, timeoutTurn, usePower, FREEZE_MS } from './mines';
import type { ArenaState } from './mines';
import { minesForTable } from './tableOptions';

const S = { lives: 3, afkTurns: 3, island: false, shields: 0 };
function seeded(seed: number) {
  let x = seed;
  return (n: number) => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x % n;
  };
}
/** Belirli mayınlarla küçük tahta kurar. */
function board(mines: number[], players = 3, size = 5): ArenaState {
  const s = createArena(size, 3, Array.from({ length: players }, (_, i) => `u${i}`), seeded(1), S);
  s.mines = mines;
  s.mineCount = mines.length;
  s.safeLeft = size * size - mines.length;
  return s;
}

const CHECK = Array.from({ length: 13 }, (_, i) => i * 2); // her güvenli karenin sayısı > 0: taşma yok

describe('mayın tarlası motoru', () => {
  it('mayınlar benzersiz, sınır içinde ve başlamadan belirlenir', () => {
    const s = createArena(12, 20, ['a', 'b', 'c'], seeded(7), S);
    expect(new Set(s.mines).size).toBe(20);
    expect(s.mines.every((m) => m >= 0 && m < 144)).toBe(true);
    expect(s.players.every((p) => p.lives === 3)).toBe(true);
  });

  it('komşu mayın sayıları doğru (köşe, kenar, orta)', () => {
    const counts = computeCounts(5, [0, 1, 12]);
    expect(counts[6]).toBe(3); // 0,1,12 hepsi komşu
    expect(counts[5]).toBe(2); // 0 ve 1
    expect(counts[24]).toBe(0);
    expect(neighbors(5, 0)).toHaveLength(3);
    expect(neighbors(5, 2)).toHaveLength(5);
    expect(neighbors(5, 12)).toHaveLength(8);
    // kaba kuvvetle çapraz kontrol
    const s = createArena(12, 20, ['a', 'b'], seeded(3), S);
    const c = computeCounts(12, s.mines);
    for (let i = 0; i < 144; i++) expect(c[i]).toBe(neighbors(12, i).filter((n) => s.mines.includes(n)).length);
  });

  it('güvenli hamle sırayı geçirir; sırası olmayan reddedilir', () => {
    const s = board(CHECK);
    expect((reveal(s, 1, 1) as { error: string }).error).toBe('not-your-turn');
    const r = reveal(s, 0, 1);
    expect('outcome' in r).toBe(true);
    expect(s.current).toBe(1);
  });

  it('açılan kare tekrar seçilemez, sınır dışı reddedilir; durum değişmez', () => {
    const s = board(CHECK);
    reveal(s, 0, 1);
    const before = JSON.stringify(s);
    expect((reveal(s, 1, 1) as { error: string }).error).toBe('already-open');
    expect((reveal(s, 1, 25) as { error: string }).error).toBe('out-of-bounds');
    expect((reveal(s, 1, -1) as { error: string }).error).toBe('out-of-bounds');
    expect((reveal(s, 1, 1.5) as { error: string }).error).toBe('out-of-bounds');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('mayına basınca tam 1 can kaybedilir, kare patlar ve tekrar seçilemez', () => {
    const s = board([0, 1, 2]);
    const r = reveal(s, 0, 0) as { outcome: { kind: string; livesLeft: number } };
    expect(r.outcome.kind).toBe('mine');
    expect(s.players[0].lives).toBe(2);
    expect(s.players[0].mineHits).toBe(1);
    expect(s.cells[0]).toBe(2);
    expect((reveal(s, 1, 0) as { error: string }).error).toBe('already-open');
  });

  it('boş alan (0) komşuları otomatik açar', () => {
    const s = board([0]); // sağ alt köşe uzak: büyük bir sıfır bölgesi
    const r = reveal(s, 0, 24) as { outcome: { opened: number } };
    expect(r.outcome.opened).toBeGreaterThan(10);
    // mayın komşusu olan kareler açılır ama yayılmaz; mayının kendisi asla açılmaz
    expect(s.cells[0]).toBe(0);
    expect(s.safeLeft).toBe(24 - r.outcome.opened);
  });

  it('canı biten elenir, sıra atlanır, oyun sürer; son kalan kazanır', () => {
    const s = board([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    s.players[1].lives = 1;
    reveal(s, 0, 24); // u0 güvenli
    reveal(s, 1, 0); // u1 mayın → elenir
    expect(s.players[1].eliminated).toBe(true);
    expect(s.players[1].eliminationReason).toBe('lives');
    expect(s.phase).toBe('playing');
    expect(s.current).toBe(2);
    expect((reveal(s, 1, 20) as { error: string }).error).toBe('eliminated');
    s.players[2].lives = 1;
    const r = reveal(s, 2, 1) as { outcome: { finished: boolean } };
    expect(r.outcome.finished).toBe(true);
    expect(s.phase).toBe('finished');
    expect(s.winnerSeat).toBe(0);
    expect(s.endReason).toBe('last-standing');
    expect((reveal(s, 0, 20) as { error: string }).error).toBe('not-playing');
  });

  it('sıra elenmiş oyuncuya hiç gelmez', () => {
    const s = board(CHECK, 4);
    s.players[1].lives = 1;
    reveal(s, 0, 1);
    reveal(s, 1, 0); // elenir
    reveal(s, 2, 3);
    reveal(s, 3, 5);
    expect(s.current).toBe(0);
    reveal(s, 0, 7);
    expect(s.current).toBe(2); // 1 atlandı
  });

  it('tüm güvenli kareler açılırsa maç biter; kazanan can > patlama > açılan kareye göre', () => {
    const s = board([0], 2, 4);
    s.players[1].lives = 2;
    reveal(s, 0, 15); // hepsini açan akış
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('cleared');
    expect(s.winnerSeat).toBe(0); // 3 can ≥ 2 can
    expect(rankedSeats(s)[0]).toBe(0);
  });

  it('süre aşımı sırayı geçirir; art arda 3 aşımda eleme; hamle sayacı sıfırlar', () => {
    const s = board(CHECK, 3);
    timeoutTurn(s, 0, 3);
    expect(s.current).toBe(1);
    timeoutTurn(s, 1, 3);
    timeoutTurn(s, 2, 3);
    reveal(s, 0, 1); // sayaç sıfırlanır
    expect(s.players[0].timeouts).toBe(0);
    timeoutTurn(s, 1, 3);
    timeoutTurn(s, 2, 3);
    timeoutTurn(s, 0, 3);
    timeoutTurn(s, 1, 3);
    expect(s.players[1].eliminated).toBe(true);
    expect(s.players[1].eliminationReason).toBe('afk');
    expect(timeoutTurn(s, 0, 3)).toBeNull(); // sırası olmayan için aşım yok
  });

  it('ayrılan elenir; sırası ondaysa sıra geçer', () => {
    const s = board([0, 1, 2], 3);
    forfeit(s, 0);
    expect(s.players[0].eliminationReason).toBe('left');
    expect(s.current).toBe(1);
    forfeit(s, 2);
    expect(s.phase).toBe('finished');
    expect(s.winnerSeat).toBe(1);
    expect(alivePlayers(s)).toHaveLength(1);
  });

  it('görünümde mayın konumu bitmeden sızmaz', () => {
    const s = board([0, 1, 2]);
    reveal(s, 0, 24);
    const v = cellView(s, false);
    expect(v.filter((x) => x === 10)).toHaveLength(0);
    expect(v[0]).toBe(-1);
    s.phase = 'finished';
    expect(cellView(s, true).filter((x) => x === 10)).toHaveLength(3);
  });

  it('1000 rastgele maç: tutarlılık (tek aktif oyuncu, ≥1 sağ, sayaçlar doğru)', () => {
    for (let g = 0; g < 1000; g++) {
      const rng = seeded(g + 1);
      const n = 3 + (g % 2);
      const s = createArena(8, 10, Array.from({ length: n }, (_, i) => `p${i}`), rng, S);
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 500) {
        const p = s.players[s.current];
        expect(p.eliminated).toBe(false);
        const hidden = s.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
        const r = rng(20) === 0 ? timeoutTurn(s, s.current, 3) : reveal(s, s.current, hidden[rng(hidden.length)]);
        expect(r).not.toBeNull();
      }
      expect(s.phase).toBe('finished');
      expect(s.winnerSeat).not.toBeNull();
      expect(s.cells.filter((c) => c === 1).length + s.safeLeft).toBe(64 - 10);
      const total = s.players.reduce((a, p) => a + p.mineHits, 0);
      expect(s.cells.filter((c) => c === 2).length).toBe(total);
      expect(alivePlayers(s).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('moda göre mayın yoğunluğu', () => {
  it('Son Kalan ve Yıldırım ×1,25; diğer modlar tablodaki değer; yoğunluk seçimiyle çarpılır, %30 sınırı korunur', () => {
    expect(minesForTable(TIERS.gold, 14, 4, 'normal', 'classic')).toBe(45);
    expect(minesForTable(TIERS.gold, 14, 4, 'normal', 'blitz')).toBe(45);
    expect(minesForTable(TIERS.gold, 14, 4, 'normal', 'chain')).toBe(36);
    expect(minesForTable(TIERS.bronze, 10, 3, 'normal', 'territory')).toBe(16);
    expect(minesForTable(TIERS.bronze, 10, 3, 'normal', 'classic')).toBe(20);
    expect(minesForTable(TIERS.bronze, 10, 3, 'easy', 'classic')).toBe(16);
    expect(minesForTable(TIERS.gold, 14, 4)).toBe(36); // mod verilmezse çarpan yok
    expect(minesForTable(TIERS.diamond, 15, 4, 'hard', 'classic')).toBeLessThanOrEqual(Math.floor(15 * 15 * 0.3));
  });
});

describe('ekonomi ayarları', () => {
  it('tier tablosu: oyuncu sayısına göre tahta, yoğunluk tier ile artar, en çok 15×15', () => {
    expect([TIERS.bronze.board, TIERS.bronze.mines, TIERS.bronze.capacity, TIERS.bronze.fee]).toEqual([10, 16, 3, 100]);
    expect([TIERS.diamond.board, TIERS.diamond.mines, TIERS.diamond.capacity, TIERS.diamond.fee]).toEqual([15, 45, 4, 5000]);
    let prev = 0;
    for (const id of ['bronze', 'silver', 'gold', 'diamond'] as const) {
      const t = TIERS[id];
      // varsayılan kapasitedeki tahta = tier tanımı
      expect(boardFor(t, t.capacity)).toEqual({ size: t.board, mines: t.mines });
      let prevSize = 0;
      for (const cap of [2, 3, 4]) {
        const b = boardFor(t, cap);
        expect(b.size).toBeGreaterThan(prevSize); // kalabalık masada tahta büyür
        expect(b.size).toBeLessThanOrEqual(15);
        const d = b.mines / (b.size * b.size);
        expect(d).toBeGreaterThan(0.13);
        expect(d).toBeLessThanOrEqual(0.21);
        prevSize = b.size;
      }
      const d = t.mines / (t.board * t.board);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(ECONOMY.lives).toBe(3);
  });
  it('özel masa sınırları ve yoğunluk korunur', () => {
    expect(boardRange(TIERS.bronze)).toEqual({ min: 8, max: 13 });
    expect(boardRange(TIERS.diamond)).toEqual({ min: 12, max: 18 });
    expect(minesForBoard(TIERS.silver, 12)).toBe(25);
    expect(feeRange(TIERS.bronze)).toEqual({ min: 50, max: 200 });
    expect(minesForBoard(TIERS.gold, 15)).toBeLessThan(15 * 15 * 0.3);
  });
  it('haftalık başlangıç pazartesi, seviye ve ödül hesabı', () => {
    expect(weekStartOf(Date.parse('2026-10-23T12:00:00Z'))).toBe('2026-10-19');
    expect(weekStartOf(Date.parse('2026-10-25T23:59:59Z'))).toBe('2026-10-19');
    expect(weekStartOf(Date.parse('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(payout(3000)).toEqual({ winner: 3000, second: 0, house: 0 });
    expect(payout(3000, 1000, 2)).toEqual({ winner: 3000, second: 0, house: 0 });
    expect(payout(3000, 1000, 3)).toEqual({ winner: 2000, second: 1000, house: 0 });
    expect(payout(400, 100, 4)).toEqual({ winner: 300, second: 100, house: 0 });
    // havuza yalnızca 2 ücret girdiyse (ör. 3 koltuk, 1 bot, arkadaş odası) kazanan hepsini alır
    expect(payout(200, 100, 3)).toEqual({ winner: 200, second: 0, house: 0 });
  });
});

describe('modlar', () => {
  it('Bölge Savaşı: açılan kareler açanın bölgesi olur; tahta bitince en geniş bölge kazanır', () => {
    const s = createArena(5, 1, ['a', 'b'], () => 0, S, 'territory');
    s.mines = [0];
    s.safeLeft = 24;
    const r1 = reveal(s, 0, 1) as { outcome: { opened: number } }; // "1": tek kare
    expect(r1.outcome.opened).toBe(1);
    expect(s.owners[1]).toBe(0);
    const r2 = reveal(s, 1, 24) as { outcome: { opened: number; finished: boolean } }; // sıfır: tüm kalanı yayar
    expect(s.players[1].territory).toBe(r2.outcome.opened);
    expect(s.owners[24]).toBe(1);
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('cleared');
    expect(s.winnerSeat).toBe(1);
    const v = modeView(s, true);
    expect(v.owners.filter((o) => o === 1).length).toBe(s.players[1].territory);
  });

  it('Bölge Savaşı: elenen oyuncu, bölgesi büyük olsa da hayatta kalanların arkasındadır', () => {
    const s = createArena(6, 3, ['a', 'b', 'c'], () => 0, S, 'territory');
    s.players[0].territory = 30;
    s.players[0].eliminated = true;
    s.players[0].eliminatedOrder = 1;
    s.players[1].territory = 2;
    s.players[2].territory = 5;
    expect(rankedSeats(s)).toEqual([2, 1, 0]);
  });

  it('Hazine Avı: sandıklar boş alan yayılmasıyla toplu açılamayan karelere konur', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createArena(11, 20, ['a', 'b', 'c', 'd'], seededInt(seed), S, 'treasure');
      const counts = computeCounts(11, s.mines);
      const mineSet = new Set(s.mines);
      for (const c of s.chests) {
        expect(counts[c]).toBeGreaterThan(0);
        expect(neighbors(11, c).some((n) => !mineSet.has(n) && counts[n] === 0)).toBe(false);
      }
    }
  });

  it('Hazine Avı: sandıklar güvenli karelerde; bulan alır, mayına basan bir sandık kaybeder; hepsi bulununca biter', () => {
    const s = createArena(8, 6, ['a', 'b'], seededInt(5), S, 'treasure');
    expect(s.chests.length).toBe(chestCountFor(8, 6));
    expect(s.chests.some((c) => s.mines.includes(c))).toBe(false);
    // sandığı doğrudan aç
    const c0 = s.chests[0];
    const first = s.current;
    const r = reveal(s, first, c0) as { outcome: { chestsFound: number } };
    expect(r.outcome.chestsFound).toBeGreaterThanOrEqual(1);
    const got = s.players[first].chests;
    expect(got).toBeGreaterThanOrEqual(1);
    // diğer oyuncu oynasın, sonra ilk oyuncu mayına bassın
    const other = s.current;
    const safe = s.cells.findIndex((c, i) => c === 0 && !s.mines.includes(i));
    reveal(s, other, safe);
    if (s.phase === 'playing') {
      const m = s.mines.find((x) => s.cells[x] === 0)!;
      const rr = reveal(s, first, m) as { outcome: { chestLost: boolean } };
      expect(rr.outcome.chestLost).toBe(true);
      expect(s.players[first].chests).toBe(got - 1);
    }
    // görünümde bulunmamış sandıklar sızmaz
    const v = modeView(s, false);
    expect(v.chestsAll).toBeNull();
    expect(v.chestsFound.every((c) => s.cells[c] === 1)).toBe(true);
  });

  it('Hazine Avı: tüm sandıklar bulununca en çok sandığı olan kazanır', () => {
    const s = createArena(5, 1, ['a', 'b'], () => 0, S, 'treasure');
    s.mines = [0];
    s.chests = [24];
    s.safeLeft = 24;
    reveal(s, 0, 1);
    reveal(s, 1, 24); // yayılarak sandığı da açar
    expect(s.phase).toBe('finished');
    expect(['treasure', 'cleared']).toContain(s.endReason);
    expect(s.winnerSeat).toBe(1);
  });

  it('Zincir: sıradaki oyuncu yalnızca önceki hamlenin komşularını açabilir; mayın sonrası zincir mayından sürer', () => {
    const s = createArena(5, 13, ['a', 'b'], () => 0, S, 'chain');
    s.mines = CHECK;
    s.safeLeft = 12;
    reveal(s, 0, 1); // tek kare (sayı > 0)
    expect(s.allowed).toEqual(neighbors(5, 1).filter((n) => s.cells[n] === 0).sort((a, b) => a - b));
    expect((reveal(s, 1, 23) as { error: string }).error).toBe('not-allowed');
    const r = reveal(s, 1, 0) as { outcome: { kind: string } }; // 0 bir mayın ve 1'in komşusu
    expect(r.outcome.kind).toBe('mine');
    expect(s.allowed).toEqual(neighbors(5, 0).filter((n) => s.cells[n] === 0).sort((a, b) => a - b));
    // süre aşımı kısıtı değiştirmez
    const before = s.allowed;
    timeoutTurn(s, s.current, 3);
    expect(s.allowed).toEqual(before);
  });

  it('Zincir: açılabilecek kare kalmazsa serbest seçim', () => {
    const s = createArena(4, 1, ['a', 'b'], () => 0, S, 'chain');
    s.mines = [15];
    s.safeLeft = 15;
    reveal(s, 0, 0); // 0'dan yayılır; mayının çevresi kalır
    expect(s.allowed === null || s.allowed.every((i) => s.cells[i] === 0)).toBe(true);
  });

  it('dört modda 400 rastgele maç tutarlı biter', () => {
    for (const mode of ['classic', 'territory', 'treasure', 'chain'] as const) {
      for (let g = 0; g < 100; g++) {
        const rng = seededInt(g + 7);
        const s = createArena(8, 10, ['p0', 'p1', 'p2'], rng, S, mode);
        let guard = 0;
        while (s.phase === 'playing' && guard++ < 500) {
          const pool = (s.allowed && s.allowed.length ? s.allowed : s.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0));
          const r = reveal(s, s.current, pool[rng(pool.length)]);
          expect('outcome' in r).toBe(true);
        }
        expect(s.phase).toBe('finished');
        expect(s.winnerSeat).not.toBeNull();
        expect(s.owners.filter((o, i) => o >= 0 && s.cells[i] === 1).length).toBe(s.players.reduce((a, p) => a + p.territory, 0));
        if (mode === 'treasure') expect(s.players.reduce((a, p) => a + p.chests, 0)).toBeLessThanOrEqual(s.chestsFound.length);
      }
    }
  });
});

function seededInt(seed: number) {
  let x = seed;
  return (n: number) => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x % n;
  };
}

describe('denge: başlangıç adası, kalkan, sonar', () => {
  const D = { lives: 3, afkTurns: 3 };
  it('başlangıç adası: maç başında güvenli bir alan açık, sahipsiz; mayın yok; sandıklar adanın dışında', () => {
    for (let g = 0; g < 200; g++) {
      const s = createArena(12, 17, ['a', 'b', 'c'], seededInt(g + 3), D, g % 2 ? 'treasure' : 'classic');
      const open = s.cells.map((c, i) => (c === 1 ? i : -1)).filter((i) => i >= 0);
      expect(open.length).toBeGreaterThan(0);
      expect(open.some((i) => s.mines.includes(i))).toBe(false);
      expect(open.every((i) => s.owners[i] === -1)).toBe(true);
      expect(s.chests.some((c) => s.cells[c] !== 0)).toBe(false);
      expect(s.safeLeft).toBe(144 - 17 - open.length);
      // sayılar görünür: ada kenarında en az bir sayı
      expect(cellView(s, false).some((v) => v > 0 && v <= 8)).toBe(true);
    }
  });

  it('kalkan: ilk mayın can götürmez; ikincisi götürür', () => {
    const s = createArena(5, 13, ['a', 'b'], () => 0, { lives: 3, afkTurns: 3, island: false }, 'treasure');
    s.mines = CHECK;
    s.safeLeft = 12;
    s.players[0].chests = 2;
    const r1 = reveal(s, 0, 0) as { outcome: { shielded?: boolean; livesLeft: number; chestLost?: boolean } };
    expect(r1.outcome.shielded).toBe(true);
    expect(r1.outcome.livesLeft).toBe(3);
    expect(r1.outcome.chestLost).toBe(false);
    expect(s.players[0].chests).toBe(2);
    expect(s.players[0].shield).toBe(0);
    reveal(s, 1, 1);
    const r2 = reveal(s, 0, 2) as { outcome: { shielded?: boolean; livesLeft: number } };
    expect(r2.outcome.shielded).toBeUndefined();
    expect(r2.outcome.livesLeft).toBe(2);
  });

  it('sonar: 3×3 alandaki gizli mayınların yerini gösterir, sırayı harcamaz, bir kez kullanılır', () => {
    const s = createArena(5, 13, ['a', 'b'], () => 0, { lives: 3, afkTurns: 3, island: false }, 'classic');
    s.mines = CHECK;
    s.cells[2] = 2; // patlamış mayın artık gizli değil: sonar yalnızca gizli mayınları gösterir
    const r = scan(s, 0, 6) as { count: number; area: number[]; mines: number[] };
    expect(r.area).toEqual([0, 1, 2, 5, 6, 7, 10, 11, 12]);
    expect(r.mines).toEqual([0, 6, 10, 12]); // tam yerleri
    expect(r.count).toBe(4);
    expect(s.current).toBe(0); // sıra hâlâ bende
    expect((scan(s, 0, 6) as { error: string }).error).toBe('no-sonar');
    expect((scan(s, 1, 6) as { error: string }).error).toBe('not-your-turn');
  });
});

describe('yeni modlar: Mayın Avcısı ve Yıldırım', () => {
  const hunter = (mines: number[]) => {
    const s = createArena(5, 3, ['u0', 'u1', 'u2'], seeded(2), S, 'hunter');
    s.mines = mines;
    s.mineCount = mines.length;
    s.safeLeft = 25 - mines.length;
    return s;
  };
  it('doğru imha puan verir, sırayı geçirir, herkese 11 olarak görünür', () => {
    const s = hunter([0, 12, 24]);
    const r = reveal(s, 0, 12, 'defuse');
    expect('outcome' in r && r.outcome.kind).toBe('defused');
    expect(s.players[0].defused).toBe(1);
    expect(s.players[0].lives).toBe(3);
    expect(s.current).toBe(1);
    expect(cellView(s, false)[12]).toBe(11);
    // imha edilmiş kare yeniden açılamaz
    expect(reveal(s, 1, 12)).toEqual({ error: 'already-open' });
  });
  it('yanlış imha: kare açılır, can gider (kalkan varsa kalkan)', () => {
    const s = hunter([0, 12, 24]);
    const r = reveal(s, 0, 6, 'defuse');
    expect('outcome' in r && r.outcome.kind).toBe('misdefuse');
    expect(s.players[0].lives).toBe(2);
    expect(s.cells[6]).toBe(1);
    expect(s.players[0].defused).toBe(0);
    // sonuç tablosunda hata olarak görünür
    expect(s.players[0].mineHits).toBe(1);
    const k = createArena(5, 3, ['a', 'b', 'c'], seeded(3), { ...S, shields: 1 }, 'hunter');
    const safe = [...Array(25).keys()].find((i) => !k.mines.includes(i) && k.cells[i] === 0)!;
    const r2 = reveal(k, 0, safe, 'defuse');
    expect('outcome' in r2 && r2.outcome.shielded).toBe(true);
    expect(k.players[0].lives).toBe(3);
  });
  it('imha yalnızca Mayın Avcısı modunda', () => {
    const s = createArena(5, 3, ['a', 'b', 'c'], seeded(4), S, 'classic');
    expect(reveal(s, 0, 0, 'defuse')).toEqual({ error: 'no-defuse' });
  });
  it('bütün mayınlar ele alınınca biter; en çok imha eden kazanır', () => {
    const s = hunter([0, 24, 4]);
    reveal(s, 0, 0, 'defuse');
    reveal(s, 1, 24, 'open'); // patlar, puan yok
    reveal(s, 2, 1, 'open'); // sayılı kare: taşma yok
    reveal(s, 0, 4, 'defuse');
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('defused');
    expect(s.winnerSeat).toBe(0);
    expect(rankedSeats(s)[0]).toBe(0);
  });
  it('Yıldırım: 2 can, sonar yok, tur 8 sn', async () => {
    const { matchSettings, turnSeconds } = await import('./rules');
    const s = createArena(8, 6, ['a', 'b', 'c'], seeded(5), matchSettings('blitz'), 'blitz');
    expect(s.players.every((p) => p.lives === 2 && p.sonar === 0 && p.shield === 1)).toBe(true);
    expect(turnSeconds('blitz')).toBe(8);
    expect(turnSeconds('classic')).toBe(ECONOMY.turnSeconds);
  });
});

describe('bonus kutuları', () => {
  const B = { ...S, bonuses: true };
  it('kapalıyken hiç kutu yok; açıkken güvenli, adanın dışında ve gizli kutular var', () => {
    expect(createArena(11, 17, ['a', 'b'], seeded(5), S).bonuses).toEqual([]);
    for (let seed = 1; seed < 40; seed++) {
      const s = createArena(11, 17, ['a', 'b', 'c'], seeded(seed), B);
      expect(s.bonuses.length).toBeGreaterThanOrEqual(2);
      expect(s.bonuses.length).toBeLessThanOrEqual(8);
      const mines = new Set(s.mines);
      for (const b of s.bonuses) {
        expect(mines.has(b.i)).toBe(false);
        expect(s.cells[b.i]).toBe(0);
      }
      // görünümde maç sürerken hangi karede olduğu sızmaz
      const v = modeView(s, false);
      expect(v.bonusAll).toBeNull();
      expect(v.bonusFound).toEqual([]);
      expect(v.bonusTotal).toBe(s.bonuses.length);
    }
  });
  it('sonar kapalıysa sonar kutusu çıkmaz', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = createArena(13, 24, ['a', 'b'], seeded(seed), { ...B, sonars: 0 });
      expect(s.bonuses.some((b) => b.k === 'sonar')).toBe(false);
    }
  });
  const withBonus = (k: 'shield' | 'sonar' | 'life' | 'extra') => {
    for (let seed = 1; seed < 400; seed++) {
      const s = createArena(11, 17, ['a', 'b', 'c'], seeded(seed), B);
      const counts = computeCounts(s.size, s.mines);
      // sayılı (taşmayan) bir kareye konmuş kutu: tek kare açılır, sonuç net
      const b = s.bonuses.find((x) => x.k === k && counts[x.i] > 0);
      if (b) return { s, b };
    }
    throw new Error('kutu bulunamadı');
  };
  it('kalkan / sonar / can kutusu açana yazılır, sıra geçer', () => {
    for (const k of ['shield', 'sonar', 'life'] as const) {
      const { s, b } = withBonus(k);
      const p = s.players[0];
      const before = { shield: p.shield, sonar: p.sonar, lives: p.lives };
      const r = reveal(s, 0, b.i);
      if (!('outcome' in r)) throw new Error(r.error);
      expect(r.outcome.bonuses).toEqual([k]);
      expect(r.outcome.extraTurn).toBeUndefined();
      expect(s.current).toBe(1);
      if (k === 'shield') expect(p.shield).toBe(before.shield + 1);
      if (k === 'sonar') expect(p.sonar).toBe(before.sonar + 1);
      if (k === 'life') expect(p.lives).toBe(before.lives + 1);
      expect(s.bonusFound).toEqual([{ i: b.i, k, seat: 0 }]);
      expect(modeView(s, false).bonusFound).toEqual([{ i: b.i, k, seat: 0 }]);
    }
  });
  it('can doluysa can kutusu kalkana dönüşür', () => {
    const { s, b } = withBonus('life');
    s.players[0].lives = 5;
    const sh = s.players[0].shield;
    reveal(s, 0, b.i);
    expect(s.players[0].lives).toBe(5);
    expect(s.players[0].shield).toBe(sh + 1);
  });
  it('ekstra tur: sıra aynı oyuncuda kalır, tur numarası artar', () => {
    const { s, b } = withBonus('extra');
    const turn = s.turnNo;
    const r = reveal(s, 0, b.i);
    if (!('outcome' in r)) throw new Error(r.error);
    expect(r.outcome.extraTurn).toBe(true);
    expect(s.current).toBe(0);
    expect(s.turnNo).toBe(turn + 1);
    // ikinci hamle de geçerli; ardından sıra geçer
    const next = s.cells.findIndex((c, i) => c === 0 && !s.mines.includes(i) && !s.bonuses.some((x) => x.i === i));
    const r2 = reveal(s, 0, next);
    expect('outcome' in r2).toBe(true);
    expect(s.current).not.toBe(0);
  });
  it('maç bitince bütün kutular görünür', () => {
    const s = createArena(9, 11, ['a', 'b'], seeded(9), B);
    forfeit(s, 1);
    expect(modeView(s, true).bonusAll?.length).toBe(s.bonuses.length);
  });
});

describe('güçler: Duman ve Zaman Dondurma', () => {
  const P = { lives: 3, afkTurns: 3, island: false, shields: 0, smokes: 1, freezes: 1 };
  it('varsayılan olarak hak yok; ayarla verilir', () => {
    expect(createArena(9, 10, ['a', 'b'], seeded(1), S).players[0].smoke).toBe(0);
    const s = createArena(9, 10, ['a', 'b'], seeded(1), P);
    expect([s.players[0].smoke, s.players[0].freeze]).toEqual([1, 1]);
  });
  it('yalnızca sırası gelen kullanır; sıra değişmez', () => {
    const s = createArena(9, 10, ['a', 'b'], seeded(2), P);
    expect(usePower(s, 1, 'smoke')).toEqual({ error: 'not-your-turn' });
    const r = usePower(s, 0, 'smoke');
    expect(r).toEqual({ kind: 'smoke', extendMs: 0 });
    expect(s.current).toBe(0);
    expect(s.smoke).toEqual({ by: 0, turnNo: s.turnNo + 1 });
    expect(usePower(s, 0, 'smoke')).toEqual({ error: 'no-power' });
    expect(s.lastPower).toEqual({ seat: 0, kind: 'smoke', n: 1, turnNo: s.turnNo });
    // görünüm: duman sıradaki tur için
    expect(modeView(s, false).smoke).toEqual({ by: 0, turnNo: s.turnNo + 1 });
  });
  it('Zaman Dondurma: süre uzar, tur başına bir kez', () => {
    const s = createArena(9, 10, ['a', 'b'], seeded(3), { ...P, freezes: 2 });
    expect(usePower(s, 0, 'freeze')).toEqual({ kind: 'freeze', extendMs: FREEZE_MS });
    expect(usePower(s, 0, 'freeze')).toEqual({ error: 'already-frozen' });
    expect(s.players[0].freeze).toBe(1);
    const b = createArena(9, 10, ['a', 'b'], seeded(3), P, 'blitz');
    expect(usePower(b, 0, 'freeze')).toEqual({ kind: 'freeze', extendMs: FREEZE_MS / 2 });
  });
  it('elenmiş ya da bitmiş maçta kullanılamaz', () => {
    const s = createArena(9, 10, ['a', 'b'], seeded(4), P);
    forfeit(s, 1);
    expect(usePower(s, 0, 'smoke')).toEqual({ error: 'not-playing' });
  });
});

describe('adil sıralama ve puan', () => {
  it('tahta temizlenince en az mayına basan kazanır (bonus canı sıralamayı belirlemez)', async () => {
    const { createArena, reveal, rankedSeats } = await import('./mines');
    const s = createArena(6, 4, ['a', 'b'], (n) => n - 1, { lives: 3, afkTurns: 3, island: false, shields: 0, sonars: 0, bonuses: false });
    s.players[0].mineHits = 1;
    s.players[0].lives = 4; // bonus kutusundan can almış ama bir mayına basmış
    s.players[1].mineHits = 0;
    s.players[1].lives = 3;
    expect(rankedSeats(s)[0]).toBe(1);
    void reveal;
  });
  it('maç sonunda ayakta kalan asla eksi puan almaz; kazanan artı alır; elenen sonuncu eksi alır', async () => {
    const { weeklyPointsDelta } = await import('./scoring');
    const base = { tier: 'bronze' as const, opponentsAllWalkedAway: false, sameGroupMatchesThisWeek: 0 };
    expect(weeklyPointsDelta({ ...base, capacity: 2, rank: 2, safeOpened: 20, eliminationReason: null })).toBe(0);
    expect(weeklyPointsDelta({ ...base, capacity: 2, rank: 1, safeOpened: 20, eliminationReason: null })).toBeGreaterThan(0);
    expect(weeklyPointsDelta({ ...base, capacity: 2, rank: 2, safeOpened: 20, eliminationReason: 'lives' })).toBe(-5);
    // Mayın Avcısı: yalnızca imha eden kazanan da puan alır
    expect(weeklyPointsDelta({ ...base, capacity: 3, rank: 1, safeOpened: 0, defused: 4, eliminationReason: null })).toBeGreaterThan(0);
    // kaçan her zaman ceza alır
    expect(weeklyPointsDelta({ ...base, capacity: 3, rank: 1, safeOpened: 20, eliminationReason: 'left' })).toBe(-5);
  });
});
