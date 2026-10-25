import type { SVGProps } from 'react';
import { ASSETS } from './assets';
import { PACK } from './packArt';

/**
 * Oyunun çizimleri: deniz mayını, logo ve küçük simgeler. Hepsi kodla çizilmiş SVG'dir
 * (dosya indirmez, her çözünürlükte keskin, açık/koyu temada aynı görünür).
 */

const HORNS = [0, 45, 90, 135, 180, 225, 270, 315];

/** Deniz mayını: çelik gövde, pirinç uçlu boynuzlar, ekvator bandı ve perçinler. `lit` = patlamış (kızgın). */
export function SeaMine({ size = 24, lit = false, className = '' }: { size?: number; lit?: boolean; className?: string }) {
  const g = lit ? 'smine-lit' : 'smine';
  return (
    <svg className={`seamine${lit ? ' is-lit' : ''} ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={`${g}-body`} cx="38%" cy="34%" r="70%">
          {lit ? (
            <>
              <stop offset="0" stopColor="#ffe9a8" />
              <stop offset="0.35" stopColor="#ff8a2a" />
              <stop offset="0.75" stopColor="#b3122a" />
              <stop offset="1" stopColor="#3a0710" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#8fa3b8" />
              <stop offset="0.35" stopColor="#3d5266" />
              <stop offset="0.8" stopColor="#16222f" />
              <stop offset="1" stopColor="#0a1119" />
            </>
          )}
        </radialGradient>
        <linearGradient id={`${g}-brass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={lit ? '#fff3c4' : '#ffe08a'} />
          <stop offset="0.5" stopColor={lit ? '#ffb347' : '#d39b2a'} />
          <stop offset="1" stopColor={lit ? '#c2410c' : '#7a5410'} />
        </linearGradient>
      </defs>
      <g>
        {HORNS.map((a) => (
          <g key={a} transform={`rotate(${a} 24 24)`}>
            <rect x="22.4" y="4.6" width="3.2" height="7" rx="1" fill={lit ? '#5a1a12' : '#24313f'} />
            <circle cx="24" cy="5" r="2.9" fill={`url(#${g}-brass)`} stroke={lit ? '#7c1d0b' : '#4a3307'} strokeWidth="0.6" />
          </g>
        ))}
        <circle cx="24" cy="24" r="13.2" fill={`url(#${g}-body)`} stroke={lit ? '#5c0a14' : '#05090e'} strokeWidth="0.9" />
        <ellipse cx="24" cy="24" rx="13.2" ry="3.4" fill="none" stroke={lit ? '#ffd27a' : '#6f879e'} strokeOpacity={lit ? 0.75 : 0.55} strokeWidth="1.1" />
        {[-9, -4.5, 0, 4.5, 9].map((dx) => (
          <circle key={dx} cx={24 + dx} cy={24 + (Math.abs(dx) > 6 ? 2 : 3.2)} r="0.85" fill={lit ? '#ffe2a0' : '#9fb3c6'} opacity="0.8" />
        ))}
        <ellipse cx="19" cy="17.5" rx="4.6" ry="2.6" transform="rotate(-32 19 17.5)" fill="#fff" opacity={lit ? 0.55 : 0.32} />
        {lit ? <path d="M24 16l-2 5 3 1-3 6M30 22l-3 3 2 2" fill="none" stroke="#fff4c2" strokeWidth="1.1" strokeLinecap="round" opacity="0.9" /> : null}
      </g>
    </svg>
  );
}

/** Logo: sonar halkaları üzerinde süzülen deniz mayını, altın çerçeve. Açılışta halkalar dalga dalga yayılır. */
export function LogoMark({ size = 132, className = '' }: { size?: number; className?: string }) {
  if (ASSETS.logo) return <img className={`logomark ${className}`} src={ASSETS.logo} width={size} height={size} alt="Mine Duel" />;
  return (
    <svg className={`logomark ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Mine Duel">
      <defs>
        <radialGradient id="lg-sea" cx="50%" cy="42%" r="62%">
          <stop offset="0" stopColor="hsl(188 72% 24%)" />
          <stop offset="0.6" stopColor="hsl(205 75% 12%)" />
          <stop offset="1" stopColor="hsl(214 80% 6%)" />
        </radialGradient>
        <linearGradient id="lg-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="0.45" stopColor="#d9a43a" />
          <stop offset="1" stopColor="#7d5512" />
        </linearGradient>
        <linearGradient id="lg-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="hsl(170 85% 60%)" stopOpacity="0" />
          <stop offset="1" stopColor="hsl(170 85% 60%)" stopOpacity="0.5" />
        </linearGradient>
        <clipPath id="lg-clip">
          <circle cx="60" cy="60" r="52" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="57" fill="url(#lg-rim)" />
      <circle cx="60" cy="60" r="52.5" fill="url(#lg-sea)" stroke="#3b2a08" strokeWidth="1" />
      <g clipPath="url(#lg-clip)">
        <g fill="none" stroke="hsl(170 70% 60% / .28)" strokeWidth="1">
          <circle cx="60" cy="60" r="38" />
          <circle cx="60" cy="60" r="24" />
          <path d="M60 8v104M8 60h104" />
        </g>
        <circle className="logomark__wave" cx="60" cy="60" r="20" fill="none" stroke="hsl(170 90% 65%)" strokeWidth="2" />
        <circle className="logomark__wave logomark__wave--2" cx="60" cy="60" r="20" fill="none" stroke="hsl(170 90% 65%)" strokeWidth="2" />
        <path className="logomark__sweep" d="M60 60 L60 8 A52 52 0 0 1 105 34 Z" fill="url(#lg-sweep)" />
        {/* dalga çizgisi */}
        <path d="M8 86c10-5 18-5 26 0s18 5 26 0 18-5 26 0 18 5 26 0v30H8Z" fill="hsl(205 80% 9% / .85)" />
        <path d="M8 86c10-5 18-5 26 0s18 5 26 0 18-5 26 0 18 5 26 0" fill="none" stroke="hsl(176 80% 60% / .5)" strokeWidth="1.4" />
      </g>
      <g className="logomark__mine">
        <path d="M60 78v14" stroke="#5d6b78" strokeWidth="1.6" strokeDasharray="2 2" />
        <g transform="translate(33 30) scale(1.125)">
          <SeaMineGlyph />
        </g>
      </g>
      <circle className="logomark__blip" cx="88" cy="38" r="3.2" fill="hsl(24 100% 62%)" />
    </svg>
  );
}

/** Logo içinde kullanılan, kendi gradyanlarını taşıyan mayın çizimi. */
function SeaMineGlyph() {
  return (
    <g>
      <defs>
        <radialGradient id="lg-body" cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#a9bccd" />
          <stop offset="0.35" stopColor="#40566b" />
          <stop offset="0.8" stopColor="#15212d" />
          <stop offset="1" stopColor="#081018" />
        </radialGradient>
      </defs>
      {HORNS.map((a) => (
        <g key={a} transform={`rotate(${a} 24 24)`}>
          <rect x="22.4" y="4.6" width="3.2" height="7" rx="1" fill="#1d2935" />
          <circle cx="24" cy="5" r="2.9" fill="url(#lg-rim)" stroke="#4a3307" strokeWidth="0.6" />
        </g>
      ))}
      <circle cx="24" cy="24" r="13.2" fill="url(#lg-body)" stroke="#04080c" strokeWidth="0.9" />
      <ellipse cx="24" cy="24" rx="13.2" ry="3.4" fill="none" stroke="#ffd27a" strokeOpacity="0.55" strokeWidth="1.1" />
      <ellipse cx="19" cy="17.5" rx="4.6" ry="2.6" transform="rotate(-32 19 17.5)" fill="#fff" opacity="0.35" />
    </g>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const ShieldIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" fill="currentColor" fillOpacity=".18" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>);
export const SonarIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></svg>);
export const SmileIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5c1.8 2 5.2 2 7 0" /><circle cx="9.2" cy="10" r="1" fill="currentColor" /><circle cx="14.8" cy="10" r="1" fill="currentColor" /></svg>);
export const EyeIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>);
export const PickIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M5 19 14 10" /><path d="M9.5 4.5c4 0 8 2.5 10 6-2.7-1.3-5.4-1.8-8-1.3" /><path d="M9.5 4.5 13 8" /></svg>);

/** Dikenli deniz kestanesi mayını (kırmızı-siyah). */
export function UrchinMine({ size = 24, lit = false }: { size?: number; lit?: boolean }) {
  const spikes = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
  return (
    <svg className={`seamine${lit ? ' is-lit' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id={`urchin-${lit ? 'l' : 'd'}`} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor={lit ? '#fff0b0' : '#ff6b6b'} />
          <stop offset="0.45" stopColor={lit ? '#ff7a1a' : '#a3162e'} />
          <stop offset="1" stopColor={lit ? '#5c0a10' : '#2a0610'} />
        </radialGradient>
      </defs>
      {spikes.map((a, i) => (
        <path
          key={i}
          d={`M${(24 + Math.cos(a - 0.12) * 11).toFixed(1)} ${(24 + Math.sin(a - 0.12) * 11).toFixed(1)}L${(24 + Math.cos(a) * (i % 2 ? 19 : 22)).toFixed(1)} ${(24 + Math.sin(a) * (i % 2 ? 19 : 22)).toFixed(1)}L${(24 + Math.cos(a + 0.12) * 11).toFixed(1)} ${(24 + Math.sin(a + 0.12) * 11).toFixed(1)}Z`}
          fill={lit ? '#ffb347' : '#1b0b10'}
          stroke={lit ? '#7c1d0b' : '#000'}
          strokeWidth="0.6"
        />
      ))}
      <circle cx="24" cy="24" r="12" fill={`url(#urchin-${lit ? 'l' : 'd'})`} stroke="#1a0508" strokeWidth="0.9" />
      <circle cx="24" cy="24" r="3.4" fill={lit ? '#fff7c9' : '#ffd34d'} className="mine-core" />
      <ellipse cx="19.5" cy="18.5" rx="3.6" ry="2" transform="rotate(-32 19.5 18.5)" fill="#fff" opacity="0.4" />
    </svg>
  );
}

/** Fıçı mayın: çember bantlı tahta fıçı, kafatası damgası ve fitil. */
export function BarrelMine({ size = 24, lit = false }: { size?: number; lit?: boolean }) {
  return (
    <svg className={`seamine${lit ? ' is-lit' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M30 9c3-4 7-4 9-1" fill="none" stroke="#5a4a3a" strokeWidth="1.6" strokeLinecap="round" />
      {lit ? <circle cx="39.5" cy="8.5" r="2.6" fill="#ffd34d" className="mine-fuse" /> : <circle cx="39.5" cy="8.5" r="1.4" fill="#ff7a2e" className="mine-fuse" />}
      <path d="M12 12c4-2 20-2 24 0 3 8 3 20 0 28-4 2-20 2-24 0-3-8-3-20 0-28Z" fill={lit ? '#d9622b' : '#8a5a2e'} stroke="#2a1608" strokeWidth="1.2" />
      <path d="M17 11c-1 9-1 19 0 30M24 10.5v31M31 11c1 9 1 19 0 30" stroke={lit ? '#a8401c' : '#6b4320'} strokeWidth="1" />
      <path d="M11 17c6 1.5 20 1.5 26 0M11 31c6 1.5 20 1.5 26 0" stroke="#3a3a42" strokeWidth="2.6" />
      <circle cx="24" cy="24" r="5.2" fill="#f2ead8" stroke="#2a1608" strokeWidth="0.8" />
      <circle cx="22.2" cy="23.4" r="1.2" fill="#2a1608" />
      <circle cx="25.8" cy="23.4" r="1.2" fill="#2a1608" />
      <path d="M22.5 27h3" stroke="#2a1608" strokeWidth="0.9" />
    </svg>
  );
}

/** İmha edilmiş mayın: sökülmüş boynuzlar, yeşil güvenlik halkası ve onay işareti. */
export function DefusedMine({ size = 24 }: { size?: number }) {
  if (ASSETS.defused) return <img className="seamine is-defused" src={ASSETS.defused} width={size} height={size} alt="" draggable={false} />;
  return (
    <span className="defused" style={{ width: size, height: size }}>
      <img src={PACK.mine_disabled} width={size} height={size} alt="" draggable={false} />
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="#3ee59a" strokeWidth="2.2" strokeDasharray="4 3" className="defuse-ring" />
        <circle cx="35" cy="35" r="7" fill="#1fbf74" stroke="#0b3d24" strokeWidth="1" />
        <path d="M31.5 35l2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );

}

/** Kareye göre mayın türü (herkeste aynı; tahtaya çeşitlilik katar). Paket mayınları + çizimli deniz mayınları. */
const PACK_MINES = ['mine_classic', 'mine_elite', 'mine_frozen', 'mine_golden', 'mine_discovered'] as const;
export function BoardMine({ index, size, lit }: { index: number; size: number; lit: boolean }) {
  const img = lit ? ASSETS.mineLit : ASSETS.mine;
  if (img) return <img className={`seamine${lit ? ' is-lit' : ''}`} src={img} width={size} height={size} alt="" draggable={false} />;
  const kind = ((index * 2654435761) >>> 0) % 8;
  if (kind < 5) {
    const key = lit ? 'mine_active' : PACK_MINES[kind];
    return <img className={`seamine seamine--pack${lit ? ' is-lit' : ''} k${kind}`} src={PACK[key]} width={size} height={size} alt="" draggable={false} />;
  }
  if (kind === 5) return <UrchinMine size={size} lit={lit} />;
  if (kind === 6) return <BarrelMine size={size} lit={lit} />;
  return <SeaMine size={size} lit={lit} />;
}
