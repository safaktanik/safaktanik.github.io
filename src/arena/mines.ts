/**
 * Çok oyunculu ortak Mayın Tarlası motoru (saf, deterministik; ağ ve veritabanından bağımsız).
 * Altı mod: Son Kalan (classic), Bölge Savaşı (territory), Hazine Avı (treasure), Zincir (chain),
 * Mayın Avcısı (hunter: mayın imha et, puan topla), Yıldırım (blitz: kısa tur, az can).
 * Sunucu, test sunucusu ve antrenman aynı motoru kullanır.
 */
import type { ArenaMode } from './modes';

export type { ArenaMode };
export type CellState = 0 | 1 | 2 | 3; // 0 gizli, 1 güvenli açık, 2 patlamış mayın, 3 imha edilmiş mayın
export type EndReason = 'last-standing' | 'cleared' | 'treasure' | 'defused';
export type MoveAction = 'open' | 'defuse';
export type ElimReason = 'lives' | 'afk' | 'left';
/** Bonus kutusu: açan oyuncuya +1 kalkan, +1 sonar, +1 can ya da ekstra tur verir. */
export type BonusKind = 'shield' | 'sonar' | 'life' | 'extra';
export const MAX_LIVES = 5;
/** Etkin güçler: Duman (rakibin sıradaki turunda tahtası 5 sn sisli), Zaman Dondurma (kendi turuna ek süre). */
export type PowerKind = 'smoke' | 'freeze';
export const FREEZE_MS = 10_000;
export const SMOKE_MS = 5_000;

export interface ArenaPlayer {
  userId: string;
  /** Oturma sırası (0..n-1); tur sırası da budur. */
  seat: number;
  lives: number;
  eliminated: boolean;
  /** Kaçıncı sırada elendi (1 = ilk elenen). */
  eliminatedOrder: number | null;
  eliminationReason: ElimReason | null;
  moves: number;
  mineHits: number;
  safeOpened: number;
  /** Üst üste süre aşımı sayısı. */
  timeouts: number;
  /** Bölge Savaşı: sahip olunan kare sayısı (= safeOpened). */
  territory: number;
  /** Hazine Avı: elde tutulan sandık. */
  chests: number;
  /** İlk mayında can kaybettirmeyen kalkan (maç başına 1). */
  shield: number;
  /** Sonar hakkı: 3×3 alandaki gizli mayınların yerini gösterir, sırayı harcamaz. */
  sonar: number;
  /** Mayın Avcısı: doğru imha edilen mayın sayısı (puan). */
  defused: number;
  /** Güç hakları: Duman ve Zaman Dondurma. */
  smoke: number;
  freeze: number;
}

export interface ArenaState {
  mode: ArenaMode;
  size: number;
  mineCount: number;
  mines: number[];
  cells: CellState[];
  /** Kareyi açan koltuk (-1: açılmamış). */
  owners: number[];
  /** Hazine Avı: sandık kareleri (güvenli kareler). */
  chests: number[];
  /** Bulunmuş sandıklar. */
  chestsFound: number[];
  /** Zincir: bu tur açılabilecek kareler (null: serbest). */
  allowed: number[] | null;
  players: ArenaPlayer[];
  current: number;
  turnNo: number;
  phase: 'playing' | 'finished';
  winnerSeat: number | null;
  endReason: EndReason | null;
  eliminationCounter: number;
  safeLeft: number;
  /** Bonus kutuları (gizli güvenli kareler) ve bulunanlar. */
  bonuses: { i: number; k: BonusKind }[];
  bonusFound: { i: number; k: BonusKind; seat: number }[];
  /** Duman: `by` koltuğu attı; `turnNo` turunda diğer oyuncuların tahtası sislenir. */
  smoke: { by: number; turnNo: number } | null;
  /** Bu turda Zaman Dondurma kullanıldı mı (tur başına bir kez). */
  frozenTurn: number | null;
  /** Son kullanılan güç (herkese animasyon için); n her kullanımda artar. */
  lastPower: { seat: number; kind: PowerKind; n: number; turnNo: number } | null;
}

export interface Settings {
  lives: number;
  afkTurns: number;
  /** Maç başında herkes için açılan güvenli başlangıç alanı (varsayılan açık). */
  island?: boolean;
  /** Oyuncu başına kalkan ve sonar sayısı (varsayılan 1 / 1). */
  shields?: number;
  sonars?: number;
  /** Tahtaya bonus kutuları serpiştirilsin mi (varsayılan kapalı; masa ayarı açar). */
  bonuses?: boolean;
  /** Oyuncu başına Duman ve Zaman Dondurma hakkı (varsayılan 0). */
  smokes?: number;
  freezes?: number;
}

export type MoveError = 'not-playing' | 'not-your-turn' | 'out-of-bounds' | 'already-open' | 'eliminated' | 'not-allowed' | 'no-defuse';

export interface MoveOutcome {
  seat: number;
  index: number;
  kind: 'safe' | 'mine' | 'timeout' | 'left' | 'defused' | 'misdefuse';
  /** Bu hamleyle açılan (taşan) güvenli kare sayısı. */
  opened: number;
  livesLeft: number;
  eliminated: boolean;
  finished: boolean;
  /** Hazine Avı: bu hamlede bulunan sandık sayısı. */
  chestsFound?: number;
  /** Hazine Avı: mayın yüzünden kaybedilen sandık. */
  chestLost?: boolean;
  /** Kalkan bu mayını karşıladı (can kaybı yok). */
  shielded?: boolean;
  /** Bu hamlede açılan bonus kutuları. */
  bonuses?: BonusKind[];
  /** Ekstra tur: sıra aynı oyuncuda kaldı. */
  extraTurn?: boolean;
}

export function neighbors(size: number, i: number): number[] {
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push(nr * size + nc);
    }
  }
  return out;
}

/** Her kare için komşu mayın sayısı (0–8). */
export function computeCounts(size: number, mines: readonly number[]): Uint8Array {
  const counts = new Uint8Array(size * size);
  for (const m of mines) for (const n of neighbors(size, m)) counts[n]++;
  return counts;
}

/** Hazine Avı'nda tahtadaki sandık sayısı. */
export function chestCountFor(size: number, mineCount: number): number {
  const safe = size * size - mineCount;
  return Math.max(3, Math.min(15, Math.round(safe * 0.045)));
}

/** Tahtadaki bonus kutusu sayısı (güvenli kare sayısına göre 2–8). */
export function bonusCountFor(size: number, mineCount: number): number {
  const safe = size * size - mineCount;
  return Math.max(2, Math.min(8, Math.round(safe * 0.03)));
}

/** Bir kareden başlayan boş alan yayılmasının kapsadığı güvenli kareler. */
function floodRegion(size: number, start: number, mineSet: Set<number>, counts: Uint8Array): number[] {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    if (counts[cur] !== 0) continue;
    for (const n of neighbors(size, cur)) {
      if (!seen.has(n) && !mineSet.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return [...seen];
}

/**
 * Başlangıç adası: herkesin ilk hamleden önce sayı görebilmesi için açılan güvenli alan.
 * Ortaya yakın, tahtanın yaklaşık %6–14'ü büyüklüğünde bir sıfır bölgesi seçilir.
 */
function chooseIsland(size: number, mineSet: Set<number>, counts: Uint8Array, rng: (n: number) => number): number[] {
  const total = size * size;
  const zeros: number[] = [];
  for (let i = 0; i < total; i++) if (!mineSet.has(i) && counts[i] === 0) zeros.push(i);
  if (!zeros.length) {
    // sıfır yoksa: ortaya en yakın, en düşük sayılı güvenli kare
    let best = -1;
    for (let i = 0; i < total; i++) if (!mineSet.has(i) && (best < 0 || counts[i] < counts[best])) best = i;
    return best >= 0 ? [best] : [];
  }
  const mid = (size - 1) / 2;
  const dist = (i: number) => Math.hypot(Math.floor(i / size) - mid, (i % size) - mid);
  const target = total * 0.09;
  const cands = [...zeros].sort((a, b) => dist(a) - dist(b)).slice(0, 24);
  // birkaç rastgele aday daha (her maç aynı yer olmasın)
  for (let k = 0; k < 6; k++) cands.push(zeros[rng(zeros.length)]);
  let best: number[] = [];
  let bestScore = Infinity;
  const seen = new Set<number>();
  for (const c of cands) {
    if (seen.has(c)) continue;
    const reg = floodRegion(size, c, mineSet, counts);
    for (const r of reg) seen.add(r);
    const tooBig = reg.length > total * 0.18 ? 3 : 1;
    const score = (Math.abs(reg.length - target) / target) * tooBig + dist(c) / size;
    if (score < bestScore) {
      bestScore = score;
      best = reg;
    }
  }
  return best;
}

/** rng(n): 0..n-1 arası tam sayı. Mayınlar (ve sandıklar) oyun başlamadan belirlenir. */
export function createArena(size: number, mineCount: number, userIds: string[], rng: (n: number) => number, settings: Settings, mode: ArenaMode = 'classic'): ArenaState {
  const total = size * size;
  if (size < 4 || mineCount < 1 || mineCount >= total) throw new Error('invalid-board');
  if (userIds.length < 2) throw new Error('invalid-players');
  const idx = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < mineCount; i++) {
    const j = i + rng(total - i);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const mines = idx.slice(0, mineCount).sort((a, b) => a - b);
  const mineSet = new Set(mines);
  const counts = computeCounts(size, mines);
  const cells = new Array<CellState>(total).fill(0);
  const island = settings.island === false ? [] : chooseIsland(size, mineSet, counts, rng);
  for (const c of island) cells[c] = 1;
  // Sandıklar: başlangıç adası dışındaki güvenli karelerden. Önce boş alan yayılmasıyla açılamayan kareler
  // (sıfıra komşu olmayan sayılı kareler) seçilir; böylece ilk büyük yayılma birden çok sandığı şansla toplamaz.
  let chests: number[] = [];
  if (mode === 'treasure') {
    const free = idx.filter((i) => !mineSet.has(i) && cells[i] === 0);
    const isolated = free.filter((i) => counts[i] > 0 && !neighbors(size, i).some((n) => !mineSet.has(n) && counts[n] === 0));
    const want = chestCountFor(size, mineCount);
    const pool = isolated.length > want ? isolated : free;
    const n = Math.min(pool.length - 1, chestCountFor(size, mineCount));
    for (let i = 0; i < n; i++) {
      const j = i + rng(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    chests = pool.slice(0, Math.max(0, n)).sort((a, b) => a - b);
  }
  // Bonus kutuları: adanın ve sandıkların dışındaki güvenli karelerden; türler sırayla dağıtılır (çeşitlilik).
  let bonuses: { i: number; k: BonusKind }[] = [];
  if (settings.bonuses) {
    const chestSet = new Set(chests);
    const pool = idx.filter((i) => !mineSet.has(i) && cells[i] === 0 && !chestSet.has(i));
    const n = Math.min(Math.max(0, pool.length - 2), bonusCountFor(size, mineCount));
    for (let i = 0; i < n; i++) {
      const j = i + rng(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const kinds: BonusKind[] = ['extra', 'shield', 'life', 'sonar'].filter((k) => k !== 'sonar' || (settings.sonars ?? 1) > 0) as BonusKind[];
    const off = n > 0 ? rng(kinds.length) : 0;
    bonuses = pool.slice(0, n).map((i, k) => ({ i, k: kinds[(k + off) % kinds.length] })).sort((a, b) => a.i - b.i);
  }
  return {
    mode,
    size,
    mineCount,
    mines,
    cells,
    owners: new Array<number>(total).fill(-1),
    chests,
    chestsFound: [],
    allowed: null,
    players: userIds.map((userId, seat) => ({
      userId,
      seat,
      lives: settings.lives,
      eliminated: false,
      eliminatedOrder: null,
      eliminationReason: null,
      moves: 0,
      mineHits: 0,
      safeOpened: 0,
      timeouts: 0,
      territory: 0,
      chests: 0,
      shield: settings.shields ?? 1,
      sonar: settings.sonars ?? 1,
      defused: 0,
      smoke: settings.smokes ?? 0,
      freeze: settings.freezes ?? 0,
    })),
    current: 0,
    turnNo: 1,
    phase: 'playing',
    winnerSeat: null,
    endReason: null,
    eliminationCounter: 0,
    safeLeft: total - mineCount - island.length,
    bonuses,
    bonusFound: [],
    smoke: null,
    frozenTurn: null,
    lastPower: null,
  };
}

export function alivePlayers(s: ArenaState): ArenaPlayer[] {
  return s.players.filter((p) => !p.eliminated);
}

function eliminate(s: ArenaState, p: ArenaPlayer, reason: ElimReason): void {
  p.eliminated = true;
  p.eliminationReason = reason;
  p.eliminatedOrder = ++s.eliminationCounter;
}

function nextAliveAfter(s: ArenaState, seat: number): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const cand = (seat + k) % n;
    if (!s.players[cand].eliminated) return cand;
  }
  return seat;
}

/** Bitiş koşulları; bitmişse kazananı belirler. */
function checkEnd(s: ArenaState): boolean {
  if (s.phase === 'finished') return true;
  const alive = alivePlayers(s);
  let reason: EndReason | null = null;
  if (alive.length <= 1) reason = 'last-standing';
  else if (s.mode === 'treasure' && s.chests.length > 0 && s.chestsFound.length >= s.chests.length) reason = 'treasure';
  else if (s.mode === 'hunter' && s.mines.every((m) => s.cells[m] !== 0)) reason = 'defused';
  else if (s.safeLeft <= 0) reason = 'cleared';
  if (!reason) return false;
  s.phase = 'finished';
  s.endReason = reason;
  s.allowed = null;
  s.winnerSeat = rankedSeats(s)[0] ?? null;
  return true;
}

/** Sıralama (moda göre). İlk eleman kazanandır. */
export function rankedSeats(s: ArenaState): number[] {
  const byElim = (a: ArenaPlayer, b: ArenaPlayer) => (b.eliminatedOrder ?? 0) - (a.eliminatedOrder ?? 0);
  const alive = s.players.filter((p) => !p.eliminated);
  const out = s.players.filter((p) => p.eliminated);
  if (s.mode === 'treasure') {
    // Sandık sayısı belirleyici; eşitlikte hayatta olan, can, az patlama, koltuk.
    return [...s.players]
      .sort((a, b) => b.chests - a.chests || Number(a.eliminated) - Number(b.eliminated) || a.mineHits - b.mineHits || b.safeOpened - a.safeOpened || byElim(a, b) || a.seat - b.seat)
      .map((p) => p.seat);
  }
  if (s.mode === 'hunter') {
    // İmha edilen mayın belirleyici; eşitlikte hayatta olan, can, az patlama.
    return [...s.players]
      .sort((a, b) => b.defused - a.defused || Number(a.eliminated) - Number(b.eliminated) || a.mineHits - b.mineHits || b.lives - a.lives || byElim(a, b) || a.seat - b.seat)
      .map((p) => p.seat);
  }
  if (s.mode === 'territory') {
    alive.sort((a, b) => b.territory - a.territory || a.mineHits - b.mineHits || a.seat - b.seat);
    out.sort((a, b) => b.territory - a.territory || byElim(a, b));
    return [...alive, ...out].map((p) => p.seat);
  }
  // Tahta temizlenince ayakta kalanlar arasında beceri belirler: en az mayına basan, sonra en çok güvenli kare açan.
  // (Can sayısı bonus kutusuyla şansa bağlı artabildiği için sıralamada belirleyici değildir.)
  alive.sort((a, b) => a.mineHits - b.mineHits || b.safeOpened - a.safeOpened || b.lives - a.lives || a.seat - b.seat);
  out.sort(byElim);
  return [...alive, ...out].map((p) => p.seat);
}

/** Yeni açılan karelerdeki bonus kutularını açan oyuncuya uygular. */
function collectBonuses(s: ArenaState, p: ArenaPlayer, newly: number[]): BonusKind[] {
  if (!s.bonuses?.length || !newly.length) return [];
  const got: BonusKind[] = [];
  const at = new Map(s.bonuses.map((b) => [b.i, b.k]));
  for (const c of newly) {
    const k = at.get(c);
    if (!k) continue;
    s.bonusFound.push({ i: c, k, seat: p.seat });
    got.push(k);
    if (k === 'shield') p.shield = (p.shield ?? 0) + 1;
    else if (k === 'sonar') p.sonar = (p.sonar ?? 0) + 1;
    else if (k === 'life') {
      if (p.lives < MAX_LIVES) p.lives++;
      else p.shield = (p.shield ?? 0) + 1; // can dolu: kalkana dönüşür
    }
  }
  return got;
}

/** Ekstra tur: bitiş yoksa sıra aynı oyuncuda kalır (yeni tur numarasıyla; süre yeniden başlar). */
function stay(s: ArenaState): void {
  if (checkEnd(s)) return;
  s.turnNo++;
}

function pass(s: ArenaState, fromSeat: number): void {
  if (checkEnd(s)) return;
  s.current = nextAliveAfter(s, fromSeat);
  s.turnNo++;
}

/** Zincir: verilen karelerin komşusu olan gizli kareler. */
function chainFrom(s: ArenaState, from: number[]): number[] | null {
  const set = new Set<number>();
  for (const f of from) for (const n of neighbors(s.size, f)) if (s.cells[n] === 0) set.add(n);
  return set.size ? [...set].sort((a, b) => a - b) : null;
}

export function validateMove(s: ArenaState, seat: number, index: number, action: MoveAction = 'open'): MoveError | null {
  if (s.phase !== 'playing') return 'not-playing';
  const p = s.players[seat];
  if (!p) return 'not-your-turn';
  if (p.eliminated) return 'eliminated';
  if (seat !== s.current) return 'not-your-turn';
  if (!Number.isInteger(index) || index < 0 || index >= s.size * s.size) return 'out-of-bounds';
  if (s.cells[index] !== 0) return 'already-open';
  if (action === 'defuse' && s.mode !== 'hunter') return 'no-defuse';
  if (s.mode === 'chain' && s.allowed && s.allowed.length && !s.allowed.includes(index)) return 'not-allowed';
  return null;
}

/** Hamleyi uygular (s yerinde değiştirilir). Geçersizse hata döner ve durum değişmez. */
export function reveal(s: ArenaState, seat: number, index: number, action: MoveAction = 'open'): { error: MoveError } | { outcome: MoveOutcome } {
  const error = validateMove(s, seat, index, action);
  if (error) return { error };
  const p = s.players[seat];
  p.moves++;
  p.timeouts = 0;
  const mineSet = new Set(s.mines);
  const isMine = mineSet.has(index);
  if (action === 'defuse') return { outcome: defuse(s, p, index, isMine, mineSet) };
  let opened = 0;
  let eliminated = false;
  let chestsFound = 0;
  let chestLost = false;
  const newly: number[] = [];
  let shielded = false;
  let bonuses: BonusKind[] = [];
  if (isMine) {
    s.cells[index] = 2;
    s.owners[index] = seat;
    p.mineHits++;
    if ((p.shield ?? 0) > 0) {
      // kalkan: can ve sandık kaybı yok
      p.shield--;
      shielded = true;
    } else {
      p.lives--;
      if (s.mode === 'treasure' && p.chests > 0) {
        p.chests--;
        chestLost = true;
      }
    }
    if (p.lives <= 0) {
      eliminate(s, p, 'lives');
      eliminated = true;
    }
  } else {
    newly.push(...floodOpen(s, index, mineSet));
    opened = newly.length;
    for (const c of newly) s.owners[c] = seat;
    p.safeOpened += opened;
    p.territory += opened;
    s.safeLeft -= opened;
    if (s.mode === 'treasure' && s.chests.length) {
      const chestSet = new Set(s.chests);
      for (const c of newly)
        if (chestSet.has(c)) {
          s.chestsFound.push(c);
          chestsFound++;
        }
      p.chests += chestsFound;
    }
    bonuses = collectBonuses(s, p, newly);
  }
  if (s.mode === 'chain') s.allowed = chainFrom(s, isMine ? [index] : newly);
  const extra = bonuses.includes('extra') && !p.eliminated;
  if (extra) stay(s);
  else pass(s, seat);
  const out: MoveOutcome = { seat, index, kind: isMine ? 'mine' : 'safe', opened, livesLeft: p.lives, eliminated, finished: (s.phase as string) === 'finished' };
  if (shielded) out.shielded = true;
  if (bonuses.length) out.bonuses = bonuses;
  if (extra && (s.phase as string) === 'playing') out.extraTurn = true;
  if (s.mode === 'treasure') {
    out.chestsFound = chestsFound;
    out.chestLost = chestLost;
  }
  return { outcome: out };
}

/** Mayın Avcısı: imha girişimi. Doğruysa puan; yanlışsa (güvenli kare) can kaybı ve kare açılır. */
function defuse(s: ArenaState, p: ArenaPlayer, index: number, isMine: boolean, mineSet: Set<number>): MoveOutcome {
  const seat = p.seat;
  let opened = 0;
  let eliminated = false;
  let shielded = false;
  let bonuses: BonusKind[] = [];
  if (isMine) {
    s.cells[index] = 3;
    s.owners[index] = seat;
    p.defused++;
  } else {
    // yanlış imha: kare açılır (bilgi herkese), oyuncu ceza alır; sonuç tablosunda "hata" olarak sayılır
    p.mineHits++;
    const newly = floodOpen(s, index, mineSet);
    opened = newly.length;
    for (const c of newly) s.owners[c] = seat;
    s.safeLeft -= opened;
    // yanlış imhada açılan kutular da açana yazılır (ekstra tur hariç: ceza hamlesi)
    bonuses = collectBonuses(s, p, newly);
    if ((p.shield ?? 0) > 0) {
      p.shield--;
      shielded = true;
    } else p.lives--;
    if (p.lives <= 0) {
      eliminate(s, p, 'lives');
      eliminated = true;
    }
  }
  pass(s, seat);
  const out: MoveOutcome = { seat, index, kind: isMine ? 'defused' : 'misdefuse', opened, livesLeft: p.lives, eliminated, finished: (s.phase as string) === 'finished' };
  if (shielded) out.shielded = true;
  if (bonuses.length) out.bonuses = bonuses;
  return out;
}

function floodOpen(s: ArenaState, index: number, mineSet: Set<number>): number[] {
  const counts = computeCounts(s.size, s.mines);
  const newly = [index];
  const queue = [index];
  s.cells[index] = 1;
  while (queue.length) {
    const cur = queue.pop()!;
    if (counts[cur] !== 0) continue;
    for (const n of neighbors(s.size, cur)) {
      if (s.cells[n] === 0 && !mineSet.has(n)) {
        s.cells[n] = 1;
        newly.push(n);
        queue.push(n);
      }
    }
  }
  return newly;
}

export type PowerError = 'not-playing' | 'not-your-turn' | 'eliminated' | 'no-power' | 'already-frozen';

/**
 * Güç kullanımı (sırayı harcamaz). Duman: sıradaki turda rakiplerin tahtası 5 sn sislenir.
 * Zaman Dondurma: bu turun süresine ek (tur başına bir kez); arka uç süreyi `extendMs` kadar uzatır.
 */
export function usePower(s: ArenaState, seat: number, kind: PowerKind): { error: PowerError } | { kind: PowerKind; extendMs: number } {
  if (s.phase !== 'playing') return { error: 'not-playing' };
  const p = s.players[seat];
  if (!p) return { error: 'not-your-turn' };
  if (p.eliminated) return { error: 'eliminated' };
  if (seat !== s.current) return { error: 'not-your-turn' };
  if ((p[kind] ?? 0) <= 0) return { error: 'no-power' };
  let extendMs = 0;
  if (kind === 'freeze') {
    if (s.frozenTurn === s.turnNo) return { error: 'already-frozen' };
    s.frozenTurn = s.turnNo;
    extendMs = s.mode === 'blitz' ? FREEZE_MS / 2 : FREEZE_MS;
  } else s.smoke = { by: seat, turnNo: s.turnNo + 1 };
  p[kind]--;
  s.lastPower = { seat, kind, n: (s.lastPower?.n ?? 0) + 1, turnNo: s.turnNo };
  return { kind, extendMs };
}

export type ScanError = 'not-playing' | 'not-your-turn' | 'eliminated' | 'out-of-bounds' | 'no-sonar';
/** Sonar sonucu: 3×3 alan, içindeki gizli mayınların tam yeri ve sayısı (yalnızca kullanana). */
export interface ScanResult {
  count: number;
  area: number[];
  mines: number[];
}

/** Sonar: 3×3 alandaki (merkez dahil) gizli mayınların yerini yalnızca kullanana gösterir; sırayı harcamaz. */
export function scan(s: ArenaState, seat: number, index: number): { error: ScanError } | ScanResult {
  if (s.phase !== 'playing') return { error: 'not-playing' };
  const p = s.players[seat];
  if (!p) return { error: 'not-your-turn' };
  if (p.eliminated) return { error: 'eliminated' };
  if (seat !== s.current) return { error: 'not-your-turn' };
  if (!Number.isInteger(index) || index < 0 || index >= s.size * s.size) return { error: 'out-of-bounds' };
  if ((p.sonar ?? 0) <= 0) return { error: 'no-sonar' };
  p.sonar--;
  const area = [index, ...neighbors(s.size, index)].sort((a, b) => a - b);
  const mineSet = new Set(s.mines);
  const mines = area.filter((a) => mineSet.has(a) && s.cells[a] === 0);
  return { count: mines.length, area, mines };
}

/** Süre aşımı: hamle hakkı kaybolur; üst üste `afkTurns` aşımda oyuncu elenir. Zincir kısıtı aynen sürer. */
export function timeoutTurn(s: ArenaState, seat: number, afkTurns: number): MoveOutcome | null {
  if (s.phase !== 'playing' || seat !== s.current) return null;
  const p = s.players[seat];
  p.timeouts++;
  let eliminated = false;
  if (p.timeouts >= afkTurns) {
    eliminate(s, p, 'afk');
    eliminated = true;
  }
  pass(s, seat);
  return { seat, index: -1, kind: 'timeout', opened: 0, livesLeft: p.lives, eliminated, finished: (s.phase as string) === 'finished' };
}

/** Maçtan ayrılma: oyuncu elenir (giriş ücreti iade edilmez, havuz değişmez). */
export function forfeit(s: ArenaState, seat: number): MoveOutcome | null {
  const p = s.players[seat];
  if (s.phase !== 'playing' || !p || p.eliminated) return null;
  eliminate(s, p, 'left');
  if (seat === s.current) pass(s, seat);
  else checkEnd(s);
  return { seat, index: -1, kind: 'left', opened: 0, livesLeft: p.lives, eliminated: true, finished: (s.phase as string) === 'finished' };
}

/** Hücre görünümü: -1 gizli, 0–8 güvenli açık (komşu mayın sayısı), 9 patlamış mayın, 10 (yalnızca bitişte) açılmamış mayın, 11 imha edilmiş mayın. */
export function cellView(s: ArenaState, revealMines: boolean): number[] {
  const counts = computeCounts(s.size, s.mines);
  const mineSet = revealMines ? new Set(s.mines) : null;
  return s.cells.map((c, i) => (c === 1 ? counts[i] : c === 2 ? 9 : c === 3 ? 11 : mineSet?.has(i) ? 10 : -1));
}

/** Oyunculara gösterilebilecek mod verisi (gizli bilgi sızdırmaz). */
export function modeView(s: ArenaState, finished: boolean) {
  return {
    mode: s.mode,
    owners: s.owners.map((o, i) => (s.cells[i] === 0 ? -1 : o)),
    chestsFound: [...s.chestsFound],
    chestsAll: finished ? [...s.chests] : null,
    chestTotal: s.chests.length,
    allowed: s.phase === 'playing' ? s.allowed : null,
    bonusFound: (s.bonusFound ?? []).map((b) => ({ ...b })),
    bonusAll: finished ? (s.bonuses ?? []).map((b) => ({ ...b })) : null,
    bonusTotal: (s.bonuses ?? []).length,
    smoke: s.phase === 'playing' && s.smoke && s.smoke.turnNo >= s.turnNo ? { ...s.smoke } : null,
    lastPower: s.lastPower ? { ...s.lastPower } : null,
  };
}

/** Eski kayıtlar (mod alanı olmayan) için eksik alanları tamamlar. */
export function normalizeState(s: ArenaState): ArenaState {
  const total = s.size * s.size;
  s.mode ??= 'classic';
  s.owners ??= new Array<number>(total).fill(-1);
  s.chests ??= [];
  s.chestsFound ??= [];
  s.allowed ??= null;
  s.bonuses ??= [];
  s.bonusFound ??= [];
  s.smoke ??= null;
  s.frozenTurn ??= null;
  s.lastPower ??= null;
  for (const p of s.players) {
    p.territory ??= p.safeOpened ?? 0;
    p.chests ??= 0;
    p.shield ??= 0;
    p.sonar ??= 0;
    p.defused ??= 0;
    p.smoke ??= 0;
    p.freeze ??= 0;
  }
  return s;
}
