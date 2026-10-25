import type { MatchView } from './protocol';

/** Maç madalyaları (varlık paketindeki rozetler). Maç sonunda o maçtaki oyununa göre kazanılır. */
export type BadgeId = 'first_victory' | 'perfect_logic' | 'comeback' | 'quick_thinker' | 'mine_hunter' | 'radar_expert' | 'strategic_master' | 'winning_streak' | 'lightning' | 'flag_master' | 'bonus_hunter' | 'oracle' | 'sharp_mind';

export const BADGES: Record<BadgeId, { name: string; desc: string }> = {
  first_victory: { name: 'Zafer', desc: 'Bir maç kazan.' },
  perfect_logic: { name: 'Kusursuz Mantık', desc: 'Hiç mayına basmadan kazan.' },
  comeback: { name: 'Geri Dönüş', desc: 'Son canınla kazan.' },
  quick_thinker: { name: 'Hızlı Düşünür', desc: 'Yıldırım modunda kazan.' },
  mine_hunter: { name: 'Mayın Avcısı', desc: 'Bir maçta en az 3 mayın imha et.' },
  radar_expert: { name: 'Radar Uzmanı', desc: 'Sonar kullan ve maçı mayına basmadan bitir.' },
  strategic_master: { name: 'Strateji Ustası', desc: 'Bölge Savaşı, Hazine Avı ya da Zincir kazan.' },
  winning_streak: { name: 'Seri Ustası', desc: 'Bir maçta üst üste 5 güvenli hamle yap.' },
  lightning: { name: 'Şimşek El', desc: 'Bir maçta 3 kez, sıran gelir gelmez (3 sn içinde) güvenli kare aç.' },
  flag_master: { name: 'Bayrak Ustası', desc: 'En az 4 bayrak koy, hepsi mayının üstünde çıksın.' },
  bonus_hunter: { name: 'Kutu Avcısı', desc: 'Bir maçta en az 2 bonus kutusu bul.' },
  oracle: { name: 'Kâhin', desc: 'İzlerken en az 3 hamleyi doğru tahmin et.' },
  sharp_mind: { name: 'Keskin Zekâ', desc: 'Hiç güç kullanmadan (sonar, Pas, Zorla yok) ve mayına basmadan kazan.' },
};
/** Paket görseli olmayan yeni madalyalar için simge. */
export const BADGE_EMOJI: Partial<Record<BadgeId, string>> = { lightning: '⚡', flag_master: '🚩', bonus_hunter: '🎁', oracle: '🔮', sharp_mind: '🧠' };
export const BADGE_ORDER = Object.keys(BADGES) as BadgeId[];

export interface MatchExtras {
  maxStreak: number;
  usedSonar: boolean;
  lightning?: number;
  flagsRight?: number;
  flagsTotal?: number;
  oracleRight?: number;
  /** Pas ya da Zorla kullandı mı. */
  usedPower?: boolean;
}

/** Bu maçta kazanılan madalyalar (yalnızca oyuncunun kendisi için). */
export function badgesFor(m: MatchView, seat: number | null, x: MatchExtras): BadgeId[] {
  if (m.phase !== 'finished') return [];
  if (seat === null) return (x.oracleRight ?? 0) >= 3 ? ['oracle'] : [];
  const row = m.results?.find((r) => r.seat === seat);
  const p = m.players[seat];
  if (!row || !p) return [];
  const won = row.rank === 1;
  const out: BadgeId[] = [];
  if (won) out.push('first_victory');
  if (won && row.mineHits === 0) out.push('perfect_logic');
  if (won && p.lives === 1) out.push('comeback');
  if (won && m.mode === 'blitz') out.push('quick_thinker');
  if ((row.defused ?? 0) >= 3) out.push('mine_hunter');
  if (x.usedSonar && row.mineHits === 0 && !p.eliminated) out.push('radar_expert');
  if (won && (m.mode === 'territory' || m.mode === 'treasure' || m.mode === 'chain')) out.push('strategic_master');
  if (x.maxStreak >= 5) out.push('winning_streak');
  if ((x.lightning ?? 0) >= 3) out.push('lightning');
  if ((x.flagsTotal ?? 0) >= 4 && x.flagsRight === x.flagsTotal) out.push('flag_master');
  if ((m.bonusFound ?? []).filter((b) => b.seat === seat).length >= 2) out.push('bonus_hunter');
  if ((x.oracleRight ?? 0) >= 3) out.push('oracle');
  if (won && x.usedPower === false && !x.usedSonar && row.mineHits === 0) out.push('sharp_mind');
  return out;
}

/** Madalya koleksiyonu: bu tarayıcıda saklanır. */
const KEY = 'mine-duel:badges';
export type BadgeBook = Partial<Record<BadgeId, number>>;
export function loadBadges(): BadgeBook {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as BadgeBook;
  } catch {
    return {};
  }
}
/** Maç başına bir kez işlenir. */
export function recordBadges(matchId: string, ids: BadgeId[]): void {
  try {
    const seenKey = `${KEY}:seen`;
    const seen = JSON.parse(window.localStorage.getItem(seenKey) ?? '[]') as string[];
    if (seen.includes(matchId)) return;
    const book = loadBadges();
    for (const id of ids) book[id] = (book[id] ?? 0) + 1;
    window.localStorage.setItem(KEY, JSON.stringify(book));
    window.localStorage.setItem(seenKey, JSON.stringify([matchId, ...seen].slice(0, 80)));
  } catch {
    /* depolama yoksa yalnızca ekranda gösterilir */
  }
}
