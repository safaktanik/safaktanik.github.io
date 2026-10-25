import { BADGE_EMOJI } from '../achievements';
import type { BadgeId } from '../achievements';
import { PACK } from './packArt';

const HUE: Partial<Record<BadgeId, number>> = { lightning: 48, flag_master: 18, bonus_hunter: 300, oracle: 265, sharp_mind: 190 };

/** Madalya görseli: paket rozeti, yoksa aynı tarzda çizilmiş madalya + simge. */
export function BadgeArt({ id, size }: { id: BadgeId; size: number }) {
  const art = (PACK as Record<string, string>)[`badge_${id}`];
  if (art) return <img src={art} width={size} height={size} alt="" />;
  const h = HUE[id] ?? 200;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 90% 66%)`} />
          <stop offset="1" stopColor={`hsl(${h} 70% 36%)`} />
        </linearGradient>
      </defs>
      <path d="M20 4h10l2 14-8 4zM44 4H34l-2 14 8 4z" fill={`hsl(${h} 60% 40%)`} />
      <circle cx="32" cy="38" r="22" fill="hsl(45 95% 55%)" />
      <circle cx="32" cy="38" r="18.5" fill={`url(#bg-${id})`} stroke="hsl(45 100% 80%)" strokeWidth="1.5" />
      <text x="32" y="46" textAnchor="middle" fontSize="22">{BADGE_EMOJI[id] ?? '★'}</text>
    </svg>
  );
}
