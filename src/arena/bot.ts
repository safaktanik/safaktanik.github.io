import { neighbors } from './mines';

export type BotLevel = 'easy' | 'medium' | 'hard';

/**
 * Bot kişiliği: notice = kesin güvenli kareyi fark etme olasılığı, noise = risk tahminindeki sezgi payı,
 * reckless = düşünmeden rastgele kare açma olasılığı, defuse = (Avcı) bildiği mayını imha etmeye cesaret.
 */
export const BOT_PERSONA: Record<BotLevel, { notice: number; noise: number; reckless: number; defuse: number; think: number }> = {
  easy: { notice: 0.45, noise: 0.5, reckless: 0.14, defuse: 0.2, think: 1.15 },
  medium: { notice: 0.68, noise: 0.28, reckless: 0.06, defuse: 0.45, think: 1 },
  hard: { notice: 0.88, noise: 0.1, reckless: 0.02, defuse: 0.75, think: 0.9 },
};

/**
 * İnsan gibi düşünme süresi (ms): bariz hamlede ~1,4–3 sn, tahmin gerekiyorsa ~2–4,5 sn.
 * (4 kişilik masada insan oyuncu kendi sırasını 20 sn'ye kadar bekliyordu; tempo için kısaltıldı.)
 * r: 0..1 (rastgele ya da herkesin aynı hesapladığı sözde rastgele). Süreli turda tur süresinin %70'ini aşmaz.
 */
export function botThinkMs(cells: readonly number[], size: number, mineCount: number, level: BotLevel, r: number, turnSeconds = 0): number {
  const obvious = analyze(cells, size, mineCount).safe.length > 0;
  const ms = ((obvious ? 1400 : 2000) + r * (obvious ? 1600 : 2500)) * BOT_PERSONA[level].think;
  return Math.round(turnSeconds > 0 ? Math.min(ms, turnSeconds * 1000 * 0.7) : ms);
}

/**
 * Antrenman botu: yalnızca oyuncuların gördüğü tahtayı kullanır (cellView: -1 gizli, 0–8 sayı, 9 patlamış mayın).
 * Mayın konumlarını bilmez; açık sayılardan kesin güvenli/kesin mayın kareleri çıkarır, yoksa en düşük riskli kareyi seçer.
 */
export function analyze(cells: readonly number[], size: number, mineCount: number) {
  const mines = new Set<number>();
  // 9 patlamış, 11 imha edilmiş, 13 kapanmış (Daralan Tahta) mayın: hepsi bilinen mayın
  cells.forEach((v, i) => (v === 9 || v === 11 || v === 13) && mines.add(i));
  const safe = new Set<number>();
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (v < 1 || v > 8) continue;
      const ns = neighbors(size, i);
      const hidden = ns.filter((n) => cells[n] === -1 && !mines.has(n) && !safe.has(n));
      const flagged = ns.filter((n) => mines.has(n)).length;
      if (!hidden.length) continue;
      if (v - flagged === 0) {
        for (const h of hidden) safe.add(h);
        changed = true;
      } else if (v - flagged === hidden.length) {
        for (const h of hidden) mines.add(h);
        changed = true;
      }
    }
  }
  // Risk tahmini: sınırdaki kareler için yerel oran, diğerleri için kalan yoğunluk.
  const risk = new Map<number, number>();
  const hiddenAll = cells.map((v, i) => (v === -1 && !mines.has(i) ? i : -1)).filter((i) => i >= 0);
  const left = Math.max(0, mineCount - mines.size);
  const constrained = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v < 1 || v > 8) continue;
    const ns = neighbors(size, i);
    const hidden = ns.filter((n) => cells[n] === -1 && !mines.has(n));
    if (!hidden.length) continue;
    const need = v - ns.filter((n) => mines.has(n)).length;
    const p = Math.max(0, Math.min(1, need / hidden.length));
    for (const h of hidden) {
      constrained.add(h);
      risk.set(h, Math.max(risk.get(h) ?? 0, p));
    }
  }
  const free = hiddenAll.filter((i) => !constrained.has(i));
  const density = hiddenAll.length ? left / hiddenAll.length : 1;
  for (const f of free) risk.set(f, density);
  for (const s of safe) risk.set(s, 0);
  return { safe: [...safe].filter((i) => cells[i] === -1), mines, risk, hidden: hiddenAll };
}

/**
 * Bot güç kararı (hamleden önce): kesin güvenli kare yokken risk yüksekse Pas; kesin güvenli kare
 * açacakken arada bir Zorla kurar (rakibi açtığı yerin yanına iter). Zincir modunda Zorla yok.
 */
export function chooseBotPower(
  cells: readonly number[],
  size: number,
  mineCount: number,
  level: BotLevel,
  have: { pass: number; force: number },
  rnd: () => number = Math.random,
  allowed: readonly number[] | null = null,
  mode = 'classic',
): 'pass' | 'force' | null {
  const a = analyze(cells, size, mineCount);
  const allow = allowed && allowed.length ? new Set(allowed) : null;
  const safe = allow ? a.safe.filter((i) => allow.has(i)) : a.safe;
  if (!safe.length) {
    if (have.pass <= 0) return null;
    const hidden = (allow ? a.hidden.filter((i) => allow.has(i)) : a.hidden).filter((i) => !a.mines.has(i));
    const least = hidden.reduce((m, i) => Math.min(m, a.risk.get(i) ?? 1), 1);
    // zor bot riski daha iyi tartar: yalnızca gerçekten riskliyse pas geçer
    const threshold = level === 'hard' ? 0.25 : level === 'medium' ? 0.18 : 0.1;
    return least >= threshold && rnd() < BOT_PERSONA[level].notice ? 'pass' : null;
  }
  if (have.force > 0 && mode !== 'chain' && rnd() < 0.3) return 'force';
  return null;
}

/** Mayın Avcısı dahil bot hamlesi: kesin bilinen gizli mayını (seviyesine göre) imha eder, yoksa kare açar. */
export function chooseBotMove(
  cells: readonly number[],
  size: number,
  mineCount: number,
  level: BotLevel,
  rnd: () => number = Math.random,
  allowed: readonly number[] | null = null,
  mode = 'classic',
): { index: number; action: 'open' | 'defuse' } {
  if (mode === 'hunter') {
    const { mines } = analyze(cells, size, mineCount);
    const known = [...mines].filter((i) => cells[i] === -1);
    if (known.length && rnd() < BOT_PERSONA[level].defuse) return { index: known[Math.floor(rnd() * known.length)], action: 'defuse' };
  }
  return { index: chooseBotCell(cells, size, mineCount, level, rnd, allowed), action: 'open' };
}

export function chooseBotCell(
  cells: readonly number[],
  size: number,
  mineCount: number,
  level: BotLevel,
  rnd: () => number = Math.random,
  /** Zincir modu: yalnızca bu kareler açılabilir. */
  allowed: readonly number[] | null = null,
): number {
  const full = analyze(cells, size, mineCount);
  const allow = allowed && allowed.length ? new Set(allowed) : null;
  const a = allow
    ? { ...full, safe: full.safe.filter((i) => allow.has(i)), hidden: full.hidden.filter((i) => allow.has(i)) }
    : full;
  if (allow && !a.hidden.length) {
    // izinli karelerin hepsi kesin mayın: en az kötüsünü (rastgele) seç
    return [...allow][Math.floor(rnd() * allow.size)];
  }
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  if (!a.hidden.length) {
    // yalnızca mayın olduğu bilinen kareler kaldı (normalde oyun bu noktada biter)
    const any = cells.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
    return pick(any);
  }
  // Botlar insan gibi oynar: kesin güvenli kareyi her zaman fark etmez, tahminleri "gürültülü"dür,
  // arada bir de düşünmeden rastgele kare açar. Seviye bu üç oranı belirler.
  const P = BOT_PERSONA[level];
  if (rnd() < P.reckless) return pick(a.hidden);
  if (a.safe.length && rnd() < P.notice) return pick(a.safe);
  // Risk tahmini + gürültü: insanlar sınırdaki kareleri tam hesaplamaz, sezgiyle seçer.
  let best = Infinity;
  const noisy = new Map<number, number>();
  // Fark edilmeyen kesin güvenli kareler bot için "sıradan" görünür (ortalama risk).
  const plain = a.hidden.length ? Math.max(0, mineCount - a.mines.size) / a.hidden.length : 0;
  const safeSet = new Set(a.safe);
  for (const i of a.hidden) {
    const r = (safeSet.has(i) ? plain : a.risk.get(i) ?? 1) + rnd() * P.noise;
    noisy.set(i, r);
    best = Math.min(best, r);
  }
  let cands = a.hidden.filter((i) => (noisy.get(i) ?? 1) <= best + 1e-9);
  if (level === 'hard') {
    // eşit riskte: köşe/kenar yerine çok komşulu, açık alana yakın kareler (daha çok bilgi açar)
    const score = (i: number) => neighbors(size, i).filter((n) => cells[n] === -1).length;
    const top = Math.max(...cands.map(score));
    cands = cands.filter((i) => score(i) === top);
  }
  return pick(cands);
}
