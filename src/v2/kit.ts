/**
 * Oyun arayüz seti görselleri (Freepik "hand drawn video game set elements", 8837930).
 * Kaynak vektörden şeffaf WebP olarak kesildi: scripts/ui-kit/*.py — ayrıntı assets/ui-kit/KAYNAK.md.
 * Site tek dosya olduğu için `?inline` ile data: adresi olarak gömülür.
 */
import arrowLeft from '../../assets/ui-kit/arrow-l-small.webp?inline';
import arrowRight from '../../assets/ui-kit/arrow-r-small.webp?inline';
import coin from '../../assets/ui-kit/coin.webp?inline';
import diamond from '../../assets/ui-kit/diamond.webp?inline';
import gemBlue from '../../assets/ui-kit/gem-blue.webp?inline';
import gemGreen from '../../assets/ui-kit/gem-green.webp?inline';
import gemPurple from '../../assets/ui-kit/gem-purple.webp?inline';
import gemRed from '../../assets/ui-kit/gem-red.webp?inline';
import medal1 from '../../assets/ui-kit/medal-1.webp?inline';
import medal2 from '../../assets/ui-kit/medal-2.webp?inline';
import medal3 from '../../assets/ui-kit/medal-3.webp?inline';
import plus from '../../assets/ui-kit/plus.webp?inline';

export const KIT = { arrowLeft, arrowRight, coin, diamond, gemBlue, gemGreen, gemPurple, gemRed, medal1, medal2, medal3, plus };
export type KitName = keyof typeof KIT;

/** Sıra madalyası (1–3), yoksa null. */
export function medalFor(rank: number): string | null {
  return rank === 1 ? KIT.medal1 : rank === 2 ? KIT.medal2 : rank === 3 ? KIT.medal3 : null;
}

/** Masa türü simgesi: Bronz/Gümüş/Altın madalya, Elmas elmas. */
export const TIER_ART = { bronze: medal3, silver: medal2, gold: medal1, diamond } as const;
