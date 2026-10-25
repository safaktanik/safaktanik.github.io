/**
 * Merkezi oyun ekonomisi ve denge ayarları.
 * Sunucu ve arayüz aynı dosyayı kullanır; değerleri başka yerde sabit olarak yazmayın.
 * Para birimi yalnızca oyun içi sanal puandır (gerçek para, çekim ya da transfer yoktur).
 */

export type TierId = 'bronze' | 'silver' | 'gold' | 'diamond';
export const TIER_ORDER: TierId[] = ['bronze', 'silver', 'gold', 'diamond'];

export interface Tier {
  id: TierId;
  label: string;
  /** Kare sayısı (board × board). */
  board: number;
  mines: number;
  /** Varsayılan oyuncu kapasitesi. */
  capacity: 2 | 3 | 4;
  /** Varsayılan giriş ücreti. */
  fee: number;
}

export const TIERS: Record<TierId, Tier> = {
  // Yoğunluk tier ile artar: Bronz ≈ %16, Gümüş ≈ %17, Altın ≈ %18, Elmas ≈ %20 (Uzman).
  // Tahtalar en çok 15×15: telefonda yakınlaştırmadan oynanır.
  // board/mines = varsayılan kapasitedeki tahta (oyuncu sayısına göre değişir: bkz. BOARDS / boardFor).
  bronze: { id: 'bronze', label: 'Bronz', board: 10, mines: 16, capacity: 3, fee: 100 },
  silver: { id: 'silver', label: 'Gümüş', board: 12, mines: 25, capacity: 3, fee: 500 },
  gold: { id: 'gold', label: 'Altın', board: 14, mines: 36, capacity: 4, fee: 1500 },
  diamond: { id: 'diamond', label: 'Elmas', board: 15, mines: 45, capacity: 4, fee: 5000 },
};

export const ECONOMY = {
  currency: 'DUEL COIN',
  currencyShort: 'DC',
  startingBalance: 3000,

  /** Maç kuralları. */
  lives: 3,
  turnSeconds: 20,
  countdownSeconds: 3,
  /** Masa dolunca herkesin "Hazırım" demesi için en uzun bekleme (sn); herkes hazırsa hemen geri sayım. */
  readySeconds: 15,
  /** Üst üste bu kadar süre aşımı yapan oyuncu "uzakta" sayılıp elenir (süre aşımı istismarını önler). */
  afkEliminationTurns: 3,
  /** Denge: maç başında herkes için açılan güvenli başlangıç alanı. */
  startIsland: true,
  /** Oyuncu başına ilk mayında can kaybettirmeyen kalkan sayısı. */
  shields: 1,
  /** Oyuncu başına sonar hakkı (3×3 alandaki gizli mayınların yerini gösterir, sırayı harcamaz). */
  sonars: 1,
  /** Maç sonunda havuzdan kesilen işletim payı (%). İlk sürümde 0. */
  houseFeePercent: 0,

  /** Özel masa sınırları (tier varsayılanlarına göre). */
  custom: {
    feeMinFactor: 0.5,
    feeMaxFactor: 2,
    /** Tahta kenarı tier varsayılanından en fazla bu kadar sapabilir; mayın yoğunluğu tier ile aynı kalır. */
    boardDelta: 3,
    capacities: [2, 3, 4] as const,
    nameMax: 24,
    passwordMin: 3,
    passwordMax: 32,
  },

  /** Masa iptali/ayrılma ücret iadesi: oyun başlamadan ayrılan herkese ücret tam iade edilir. */
  refundOnLeaveBeforeStart: true,
  /** Sunucu hatasıyla yarıda kalan maçta tüm giriş ücretleri iade edilir. */
  refundOnServerAbort: true,

  daily: { base: 500, streakBonus: 100, maxStreakBonus: 500 },
  firstMatchBonus: 300,
  /** Bakiyesi en ucuz masanın giriş ücretinin altına düşenler günde bir kez "yardım paketi" alabilir. */
  rescue: { amount: 400 },

  xp: { participation: 20, win: 50, perSafeCell: 1, safeCellCap: 60 },

  /** Sıralama puanı: kapasiteye göre derece → puan. */
  points: {
    byCapacity: { 2: [20, -5], 3: [25, 10, -5], 4: [25, 10, 0, -5] } as Record<number, number[]>,
    /** Pahalı masalara girerek sıralamayı kolayca şişirmeyi önlemek için tier çarpanı dar tutulur. */
    tierMultiplier: { bronze: 1, silver: 1.1, gold: 1.2, diamond: 1.3 } as Record<TierId, number>,
    /** Olumlu puan için en az açılması gereken güvenli kare. */
    minSafeOpensForPositive: 3,
    /** Aynı oyuncu kümesi bir haftada bu kadar maçtan sonra puanı yarıya iner, sonra sıfırlanır. */
    sameGroupHalfAfter: 3,
    sameGroupZeroAfter: 5,
  },

  /** Haftalık ödüller (ilk 3). */
  weeklyPrizes: [1000, 500, 250],

  quickplay: { waitSeconds: 8 },
  /** Oturum ömrü. */
  sessionDays: 30,
};

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 100;
}

/** Tier için özel masa alan boyutu aralığı. */
export function boardRange(tier: Tier): { min: number; max: number } {
  const d = ECONOMY.custom.boardDelta;
  return { min: Math.max(8, tier.board - d), max: Math.min(24, tier.board + d) };
}
/** Tier ile aynı yoğunlukta mayın sayısı. */
export function minesForBoard(tier: Tier, board: number): number {
  const density = tier.mines / (tier.board * tier.board);
  const raw = Math.round(density * board * board);
  return Math.max(4, Math.min(Math.floor(board * board * 0.3), raw));
}
export function feeRange(tier: Tier): { min: number; max: number } {
  return { min: Math.round(tier.fee * ECONOMY.custom.feeMinFactor), max: Math.round(tier.fee * ECONOMY.custom.feeMaxFactor) };
}

/** Haftanın başlangıcı: pazartesi 00:00 UTC (sunucu saati). YYYY-MM-DD. */
export function weekStartOf(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // 0 = pazartesi
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  return new Date(start).toISOString().slice(0, 10);
}
export function nextWeekStartMs(ms: number): number {
  return Date.parse(weekStartOf(ms) + 'T00:00:00Z') + 7 * 86_400_000;
}
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ödül havuzunun paylaşımı: kazanan hepsini alır (işletim payı düşüldükten sonra). */
export function payout(pool: number): { winner: number; house: number } {
  const house = Math.floor((pool * ECONOMY.houseFeePercent) / 100);
  return { winner: pool - house, house };
}

/**
 * Tier ve oyuncu sayısına göre varsayılan tahta (kenar, mayın).
 * Ortak tahtada oyuncu başına düşen hamle sayısı sabit kalsın diye kalabalık masada tahta büyür;
 * yoğunluk tier ile artar (Bronz ≈ %13, Elmas ≈ %19). Değerler botlarla binlerce maç simülasyonuyla
 * ayarlandı (src/arena/balance.sim.ts): Bronz ≈ 10, Gümüş ≈ 14, Altın ≈ 18, Elmas ≈ 24 hamle / oyuncu.
 */
export const BOARDS: Record<TierId, Record<2 | 3 | 4, [number, number]>> = {
  bronze: { 2: [9, 12], 3: [10, 16], 4: [11, 20] },
  silver: { 2: [11, 20], 3: [12, 25], 4: [13, 30] },
  gold: { 2: [12, 26], 3: [13, 31], 4: [14, 36] },
  diamond: { 2: [13, 33], 3: [14, 39], 4: [15, 45] },
};
export function boardFor(tier: Tier, players: number): { size: number; mines: number } {
  const cap = (players <= 2 ? 2 : players >= 4 ? 4 : 3) as 2 | 3 | 4;
  const [size, mines] = BOARDS[tier.id][cap];
  return { size, mines };
}
