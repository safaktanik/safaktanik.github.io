/**
 * Güçlerin etkisi (geliştirme aracı, oyuna dahil değil): gücü olan bir oyuncu, olmayanlara karşı
 * ne kadar sık kazanıyor? Son Kalan, güncel tahtalar (mod mayın çarpanıyla).
 * Çalıştır: npx tsx src/arena/powers.sim.ts [maçSayısı=300]
 *
 * Simülasyon süre baskısını modellemez (eski Duman / Zaman Dondurma bu yüzden ölçülemedi; 2.4'te kaldırıldı).
 * "fener" eski İpucu'dur (görünen bilgiden kesin çıkarım); karşılaştırma için duruyor.
 */
import { createArena, reveal, rankedSeats, scan, neighbors, timeoutTurn } from './mines';
import type { ArenaState } from './mines';
import { analyze, chooseBotMove } from './bot';
import { matchSettings } from './rules';
import { TIERS, boardFor } from './economy';
import type { TierId } from './economy';
import { minesForTable } from './tableOptions';
import { countsOf, rngOf, viewOf } from './variants.sim';

type Brain = 'expert' | 'medium';
/** Gücü olan oyuncunun elindeki: sonar sayısı, "fener" (görünen bilgiden kesin çıkarım) ve "kurtarıcı fener" (tıkanınca gerçek güvenli kare). */
interface Kit {
  sonar: number;
  hint: number;
  rescue: number;
  /** Öneri "Pas": tahmin zorunluyken sırayı geçer (riski sıradakine bırakır). */
  pass?: number;
  /** Öneri "Zorla": güvenli hamleden sonra sıradaki rakip, açılan karelerin yanından açmak zorunda. */
  force?: number;
}

/** Zorla gücüyle sıradaki oyuncuya dayatılan kareler (tek tur). */
let forced: number[] | null = null;

interface Mind {
  brain: Brain;
  kit: Kit;
  knownSafe: Set<number>;
  knownMine: Set<number>;
}

function pickExpert(view: number[], s: ArenaState, r: () => number, me: Mind): { index: number; guess: boolean } {
  const a = analyze(view, s.size, s.mineCount);
  const ok = (i: number) => !forced || forced.includes(i);
  const hiddenSafe = [...me.knownSafe].filter((i) => view[i] === -1 && ok(i));
  if (hiddenSafe.length) return { index: hiddenSafe[0], guess: false };
  const safe = a.safe.filter(ok);
  if (safe.length) return { index: safe[Math.floor(r() * safe.length)], guess: false };
  if (forced) a.hidden = a.hidden.filter(ok);
  const pool = a.hidden.filter((i) => !a.mines.has(i) && !me.knownMine.has(i));
  const cands = pool.length ? pool : a.hidden;
  let best = Infinity;
  for (const i of cands) best = Math.min(best, a.risk.get(i) ?? 1);
  const top = cands.filter((i) => (a.risk.get(i) ?? 1) <= best + 1e-9);
  return { index: top[Math.floor(r() * top.length)], guess: true };
}

function turn(s: ArenaState, view: number[], r: () => number, me: Mind): void {
  const seat = s.current;
  // Zorla bu tura dayatıldıysa ve izinli gizli kare kalmadıysa kısıt düşer
  if (forced) forced = forced.filter((i) => view[i] === -1);
  if (forced && !forced.length) forced = null;
  const before = new Set(view.map((v, i) => (v !== -1 ? i : -1)).filter((i) => i >= 0));
  if (me.brain === 'medium') {
    // Fener (mevcut İpucu): görünen bilgiden kesin güvenli kare varsa onu göster
    if (me.kit.hint > 0) {
      const a = analyze(view, s.size, s.mineCount);
      if (a.safe.length) {
        me.kit.hint--;
        reveal(s, seat, a.safe[0]);
        return;
      }
    }
    const m = chooseBotMove(view, s.size, s.mineCount, 'medium', r, forced ?? s.allowed, s.mode);
    forced = null;
    reveal(s, seat, m.index);
    return;
  }
  let mv = pickExpert(view, s, r, me);
  forced = null;
  if (mv.guess && (me.kit.pass ?? 0) > 0) {
    me.kit.pass!--;
    timeoutTurn(s, seat, 99);
    return;
  }
  if (mv.guess && me.kit.rescue > 0) {
    // Kurtarıcı fener (öneri): tıkandığında gerçekten güvenli bir kare gösterir
    me.kit.rescue--;
    const mines = new Set(s.mines);
    const safe = view.map((v, i) => (v === -1 && !mines.has(i) ? i : -1)).filter((i) => i >= 0);
    const frontier = safe.filter((i) => neighbors(s.size, i).some((n) => view[n] >= 0 && view[n] <= 8));
    const opts = frontier.length ? frontier : safe;
    if (opts.length) mv = { index: opts[Math.floor(r() * opts.length)], guess: false };
  } else if (mv.guess && me.kit.sonar > 0) {
    // Sonar: tahmin edeceği karenin 3×3 çevresini tara, bulduğunu hatırla
    me.kit.sonar--;
    const res = scan(s, seat, mv.index);
    if (!('error' in res)) {
      for (const a of res.area) if (view[a] === -1) (res.mines.includes(a) ? me.knownMine : me.knownSafe).add(a);
      mv = pickExpert(view, s, r, me);
    }
  }
  const out = reveal(s, seat, mv.index);
  if ((me.kit.force ?? 0) > 0 && 'outcome' in out && out.outcome.kind === 'safe' && s.phase === 'playing') {
    // Zorla: yalnızca dar bir alan açıldıysa kullan (geniş alanda kısıt anlamsız)
    const newly = s.cells.map((c, i) => (c === 1 && !before.has(i) ? i : -1)).filter((i) => i >= 0);
    const ring = [...new Set(newly.flatMap((i) => neighbors(s.size, i)))].filter((i) => s.cells[i] === 0);
    if (ring.length && ring.length <= 6) {
      me.kit.force!--;
      forced = ring;
    }
  }
}

function run(tier: TierId, cap: number, games: number, holder: Brain, others: Brain, kit: Kit, seed: number) {
  const b = boardFor(TIERS[tier], cap);
  const mines = minesForTable(TIERS[tier], b.size, cap, 'normal', 'classic');
  let wins = 0, hits = 0, otherHits = 0;
  for (let g = 0; g < games; g++) {
    const r = rngOf(seed + g * 7919 + cap * 31 + b.size);
    const s = createArena(b.size, mines, Array.from({ length: cap }, (_, i) => `p${i}`), (n) => Math.floor(r() * n), { ...matchSettings('classic'), sonars: 0 }, 'classic');
    const hSeat = g % cap; // koltuk her maç değişir: ilk hamle avantajı dağılır
    const minds: Mind[] = Array.from({ length: cap }, (_, i) => ({
      brain: i === hSeat ? holder : others,
      kit: i === hSeat ? { ...kit } : { sonar: 0, hint: 0, rescue: 0 },
      knownSafe: new Set(),
      knownMine: new Set(),
    }));
    // motor, sonar hakkını oyuncu kaydından doğrular
    s.players.forEach((p, i) => (p.sonar = minds[i].kit.sonar));
    const counts = countsOf(s);
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 5000) turn(s, viewOf(s, counts), r, minds[s.current]);
    if (rankedSeats(s)[0] === hSeat) wins++;
    hits += s.players[hSeat].mineHits;
    otherHits += s.players.filter((p) => p.seat !== hSeat).reduce((n, p) => n + p.mineHits, 0) / (cap - 1);
  }
  return { win: wins / games, hits: hits / games, otherHits: otherHits / games };
}

if (process.argv[1]?.includes('powers.sim')) {
  const N = Number(process.argv[2] ?? 300);
  const cases: { label: string; holder: Brain; others: Brain; kit: Kit }[] = [
    { label: 'Uzman, güçsüz (kontrol)', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 0 } },
    { label: 'Uzman + 1 sonar', holder: 'expert', others: 'expert', kit: { sonar: 1, hint: 0, rescue: 0 } },
    { label: 'Uzman + 2 sonar', holder: 'expert', others: 'expert', kit: { sonar: 2, hint: 0, rescue: 0 } },
    { label: 'Uzman + 1 kurtarıcı fener', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 1 } },
    { label: 'Uzman + 1 Pas (öneri)', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 0, pass: 1 } },
    { label: 'Uzman + 2 Pas (öneri)', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 0, pass: 2 } },
    { label: 'Uzman + 1 Zorla (öneri)', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 0, force: 1 } },
    { label: 'Uzman + 2 Zorla (öneri)', holder: 'expert', others: 'expert', kit: { sonar: 0, hint: 0, rescue: 0, force: 2 } },
    { label: 'Orta bot, güçsüz (kontrol)', holder: 'medium', others: 'medium', kit: { sonar: 0, hint: 0, rescue: 0 } },
    { label: 'Orta bot + 1 fener (mevcut İpucu)', holder: 'medium', others: 'medium', kit: { sonar: 0, hint: 1, rescue: 0 } },
    { label: 'Orta bot + 3 fener', holder: 'medium', others: 'medium', kit: { sonar: 0, hint: 3, rescue: 0 } },
  ];
  for (const t of [{ tier: 'silver' as TierId, cap: 3 }, { tier: 'gold' as TierId, cap: 4 }]) {
    const b = boardFor(TIERS[t.tier], t.cap);
    console.log(`== ${TIERS[t.tier].label} · ${t.cap} kişi · ${b.size}×${b.size} · ${minesForTable(TIERS[t.tier], b.size, t.cap, 'normal', 'classic')} mayın (şans payı %${Math.round(100 / t.cap)})`);
    for (const c of cases) {
      const x = run(t.tier, t.cap, N, c.holder, c.others, c.kit, 11);
      console.log(`${c.label.padEnd(36)} kazanma %${Math.round(x.win * 100).toString().padStart(2)} · bastığı mayın ${x.hits.toFixed(2)} (rakipler ${x.otherHits.toFixed(2)})`);
    }
    console.log('');
  }
}
