import type { ReactNode } from 'react';
import { ASSETS } from './assets';
import { PACK } from './packArt';
import type { PackKey } from './packArt';

const ART_FACE: Record<string, string> = { idle: 'smile', happy: 'smile', love: 'smile', win: 'victory', cool: 'victory', hurt: 'sad', cry: 'sad', out: 'sad', shock: 'surprise', angry: 'think' };

/**
 * Oyunun karakterleri: 12 özgün deniz kaptanı. Hepsi kodla çizilmiş SVG (64×64), ruh hâline göre yüz ifadesi değişir.
 * Avatar numaraları (0–11) eski kayıtlarla aynıdır; yalnızca çizimler değişti.
 */

export type Mood = 'idle' | 'happy' | 'hurt' | 'out' | 'win' | 'cool' | 'love' | 'angry' | 'shock' | 'cry';

import { CHARACTERS, CHARACTER_COUNT } from '../characterData';
export { CHARACTERS, CHARACTER_COUNT } from '../characterData';
export type { CharacterInfo } from '../characterData';

export const charOf = (id: number) => CHARACTERS[((id % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT];

/* ------------------------------------------------------------------ yüz parçaları */

const INK = '#14202c';

function Eyes({ l, r, s = 4.2, mood }: { l: [number, number]; r: [number, number]; s?: number; mood: Mood }) {
  const pair = (fn: (x: number, y: number) => ReactNode) => (
    <>
      {fn(l[0], l[1])}
      {fn(r[0], r[1])}
    </>
  );
  switch (mood) {
    case 'happy':
    case 'win':
      return pair((x, y) => <path d={`M${x - s} ${y + 1}q${s} ${-s * 1.3} ${s * 2} 0`} fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />);
    case 'hurt':
      return pair((x, y) => <path d={`M${x - s * 0.8} ${y - s * 0.7}l${s * 1.6} ${s * 0.7}l${-s * 1.6} ${s * 0.7}`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />);
    case 'out':
      return pair((x, y) => <path d={`M${x - s * 0.7} ${y - s * 0.7}l${s * 1.4} ${s * 1.4}M${x + s * 0.7} ${y - s * 0.7}l${-s * 1.4} ${s * 1.4}`} stroke={INK} strokeWidth={1.7} strokeLinecap="round" />);
    case 'cool':
      return (
        <g>
          <path d={`M${l[0] - s * 1.5} ${l[1] - s * 0.9}H${r[0] + s * 1.5}`} stroke={INK} strokeWidth={1.6} />
          <rect x={l[0] - s * 1.3} y={l[1] - s} width={s * 2.6} height={s * 1.9} rx={s * 0.8} fill={INK} />
          <rect x={r[0] - s * 1.3} y={r[1] - s} width={s * 2.6} height={s * 1.9} rx={s * 0.8} fill={INK} />
          <path d={`M${l[0] - s * 0.7} ${l[1] - s * 0.4}l${s * 0.8} 0`} stroke="#9fd8ff" strokeWidth={1} strokeLinecap="round" />
          <path d={`M${r[0] - s * 0.7} ${r[1] - s * 0.4}l${s * 0.8} 0`} stroke="#9fd8ff" strokeWidth={1} strokeLinecap="round" />
        </g>
      );
    case 'love':
      return pair((x, y) => <path d={`M${x} ${y + s * 0.9}c${-s * 1.6} ${-s * 1} ${-s * 1.2} ${-s * 2.3} 0 ${-s * 1.3}c${s * 1.2} ${-s * 1} ${s * 1.6} ${s * 0.3} 0 ${s * 1.3}Z`} fill="#ff4d79" stroke="#a0123a" strokeWidth={0.6} />);
    case 'angry':
      return (
        <g>
          {pair((x, y) => (
            <>
              <circle cx={x} cy={y + 0.6} r={s * 0.75} fill="#fff" />
              <circle cx={x} cy={y + 1} r={s * 0.38} fill={INK} />
            </>
          ))}
          <path d={`M${l[0] - s * 1.1} ${l[1] - s * 1.2}l${s * 1.9} ${s * 0.8}M${r[0] + s * 1.1} ${r[1] - s * 1.2}l${-s * 1.9} ${s * 0.8}`} stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
        </g>
      );
    case 'shock':
      return pair((x, y) => (
        <>
          <circle cx={x} cy={y} r={s * 1.05} fill="#fff" stroke={INK} strokeWidth={0.8} />
          <circle cx={x} cy={y} r={s * 0.35} fill={INK} />
        </>
      ));
    default:
      // idle + cry: açık gözler (cry'da gözyaşı ağız tarafında çizilir)
      return (
        <g className="ch-eyes">
          {pair((x, y) => (
            <>
              <ellipse cx={x} cy={y} rx={s * 0.82} ry={s} fill="#fff" />
              <circle cx={x + s * 0.12} cy={y + s * 0.18} r={s * 0.52} fill={INK} />
              <circle cx={x + s * 0.32} cy={y - s * 0.12} r={s * 0.17} fill="#fff" />
            </>
          ))}
        </g>
      );
  }
}

function Mouth({ x, y, w = 7, mood }: { x: number; y: number; w?: number; mood: Mood }) {
  const h = w / 2;
  switch (mood) {
    case 'happy':
    case 'win':
    case 'love':
      return <path d={`M${x - h} ${y - 0.5}q${h} ${w * 0.9} ${w} 0Z`} fill="#7a1b2b" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />;
    case 'hurt':
    case 'cry':
      return <path d={`M${x - h} ${y + 1.6}q${h} ${-w * 0.5} ${w} 0`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
    case 'out':
      return <path d={`M${x - h * 0.8} ${y + 0.8}h${w * 0.8}`} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
    case 'shock':
      return <ellipse cx={x} cy={y + 1} rx={w * 0.22} ry={w * 0.3} fill="#7a1b2b" stroke={INK} strokeWidth={1} />;
    case 'angry':
      return <path d={`M${x - h} ${y + 1.5}q${h} ${-w * 0.35} ${w} 0`} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" />;
    case 'cool':
      return <path d={`M${x - h * 0.6} ${y}q${h * 0.9} ${w * 0.35} ${w * 0.75} ${-w * 0.2}`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
    default:
      return <path d={`M${x - h} ${y}q${h} ${w * 0.55} ${w} 0`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
  }
}

/** Ruh hâline göre ek süsler: gözyaşı, ter damlası, kızarıklık, yıldız. */
function Extras({ mood, l, r }: { mood: Mood; l: [number, number]; r: [number, number] }) {
  if (mood === 'cry')
    return (
      <g className="ch-tears" fill="#7fd3ff" stroke="#2a7fb0" strokeWidth={0.5}>
        <path d={`M${l[0] - 1} ${l[1] + 4}q-2 4 0 6q2 -2 0 -6Z`} />
        <path d={`M${r[0] + 1} ${r[1] + 4}q-2 4 0 6q2 -2 0 -6Z`} />
      </g>
    );
  if (mood === 'hurt' || mood === 'shock') return <path className="ch-sweat" d={`M${r[0] + 7} ${r[1] - 7}q-2.5 4 0 5.5q2.5 -1.5 0 -5.5Z`} fill="#9fe0ff" stroke="#2a7fb0" strokeWidth={0.5} />;
  if (mood === 'love' || mood === 'happy')
    return (
      <g fill="#ff7a9a" opacity={0.55}>
        <ellipse cx={l[0] - 2} cy={l[1] + 6} rx={3} ry={1.8} />
        <ellipse cx={r[0] + 2} cy={r[1] + 6} rx={3} ry={1.8} />
      </g>
    );
  if (mood === 'win')
    return (
      <g className="ch-sparkle" fill="#ffe07a">
        <path d="M10 14l1.2 3 3 1.2-3 1.2L10 22.4l-1.2-3-3-1.2 3-1.2Z" />
        <path d="M54 10l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9Z" />
      </g>
    );
  if (mood === 'angry') return <path d="M50 10l3 3m0-3-3 3M47 8v4" stroke="#ff5a4d" strokeWidth={1.6} strokeLinecap="round" />;
  return null;
}

type Face = { l: [number, number]; r: [number, number]; s?: number; m: [number, number]; mw?: number };

/* ------------------------------------------------------------------ 12 karakter */

interface Drawn {
  body: ReactNode;
  face: Face;
  /** Yüzün üstüne çizilecek parçalar (şapka, kask camı çerçevesi vb.). */
  top?: ReactNode;
}

function draw(id: number): Drawn {
  switch (id) {
    case 0: // Kaptan Fok
      return {
        body: (
          <g>
            <ellipse cx="32" cy="40" rx="19" ry="17" fill="#8aa3b8" stroke={INK} strokeWidth="1.4" />
            <ellipse cx="27" cy="46" rx="6" ry="4.6" fill="#e9f1f7" />
            <ellipse cx="37" cy="46" rx="6" ry="4.6" fill="#e9f1f7" />
            <ellipse cx="32" cy="42.5" rx="3" ry="2.2" fill={INK} />
            <path d="M21 45h-7M21 47.5l-6 2M43 45h7M43 47.5l6 2" stroke={INK} strokeWidth="0.9" strokeLinecap="round" />
          </g>
        ),
        face: { l: [25, 34], r: [39, 34], s: 3.8, m: [32, 50], mw: 6 },
        top: (
          <g>
            <path d="M14 26c2-9 34-9 36 0l-2 3H16Z" fill="#f4f7fb" stroke={INK} strokeWidth="1.3" />
            <rect x="15" y="25" width="34" height="5" rx="2" fill="#1f3a5a" stroke={INK} strokeWidth="1.2" />
            <path d="M16 30c5 3 27 3 32 0" fill="#13283f" stroke={INK} strokeWidth="1.2" />
            <circle cx="32" cy="22" r="3.4" fill="#f2c14e" stroke="#7a5a12" strokeWidth="0.8" />
            <path d="M32 20.3v3.6M30.4 22.6c.6 1.3 2.6 1.3 3.2 0" stroke="#7a5a12" strokeWidth="0.8" fill="none" />
          </g>
        ),
      };
    case 1: // Okta (ahtapot)
      return {
        body: (
          <g>
            {[14, 22, 30, 38, 46].map((x, i) => (
              <path key={x} d={`M${x + 2} 42c${i % 2 ? 4 : -4} 8 ${i % 2 ? -2 : 6} 12 ${i % 2 ? 4 : -2} 15`} fill="none" stroke="#b25bd6" strokeWidth="5.5" strokeLinecap="round" />
            ))}
            <path d="M12 38c0-16 9-26 20-26s20 10 20 26c0 6-9 7-20 7s-20-1-20-7Z" fill="#c46fe6" stroke={INK} strokeWidth="1.4" />
            <ellipse cx="25" cy="20" rx="5" ry="3" fill="#fff" opacity="0.25" transform="rotate(-25 25 20)" />
            <circle cx="20" cy="28" r="1.4" fill="#e9b3ff" />
            <circle cx="44" cy="25" r="1.8" fill="#e9b3ff" />
          </g>
        ),
        face: { l: [25, 32], r: [39, 32], s: 4.4, m: [32, 40], mw: 7 },
      };
    case 2: // Martı Mırtı
      return {
        body: (
          <g>
            <path d="M14 46c-2-14 6-28 18-28s20 14 18 28c-6 6-30 6-36 0Z" fill="#f7f9fb" stroke={INK} strokeWidth="1.4" />
            <path d="M14 44c-4-2-7-8-5-12 4 2 7 5 8 9" fill="#b9c6d2" stroke={INK} strokeWidth="1.1" />
            <path d="M50 44c4-2 7-8 5-12-4 2-7 5-8 9" fill="#b9c6d2" stroke={INK} strokeWidth="1.1" />
            <path d="M26 39l6 0 10 3-10 3h-6Z" fill="#ffb02e" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="39" cy="42" r="1.1" fill="#e2482c" />
            <path d="M18 50c6 4 22 4 28 0l-2 6H20Z" fill="#e2482c" stroke={INK} strokeWidth="1.1" />
            <path d="M28 18c1-4 4-6 4-6s1 3 0 6" fill="#f7f9fb" stroke={INK} strokeWidth="1" />
          </g>
        ),
        face: { l: [25, 31], r: [38, 31], s: 3.6, m: [33, 47], mw: 4 },
      };
    case 3: // Tosun (kaplumbağa)
      return {
        body: (
          <g>
            <path d="M6 50c0-14 11-24 26-24s26 10 26 24Z" fill="#8a6a2e" stroke={INK} strokeWidth="1.4" />
            <path d="M14 50l5-12h10l4 12M33 50l4-12h9l6 12M24 38l-3-8h10l-2 8" fill="none" stroke="#5e4517" strokeWidth="1.3" />
            <ellipse cx="32" cy="32" rx="14" ry="13" fill="#7cc46b" stroke={INK} strokeWidth="1.4" />
            <circle cx="26" cy="24" r="1.3" fill="#5ea24e" />
            <circle cx="40" cy="26" r="1.1" fill="#5ea24e" />
            <path d="M18 27c4-8 24-8 28 0" fill="none" stroke="#e2482c" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M45 26l6-3M45 28l6 1" stroke="#e2482c" strokeWidth="2" strokeLinecap="round" />
          </g>
        ),
        face: { l: [27, 32], r: [37, 32], s: 3.4, m: [32, 39], mw: 6 },
      };
    case 4: // Pofuduk (balon balığı)
      return {
        body: (
          <g>
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2;
              const x1 = 32 + Math.cos(a) * 18;
              const y1 = 34 + Math.sin(a) * 18;
              const x2 = 32 + Math.cos(a) * 24;
              const y2 = 34 + Math.sin(a) * 24;
              return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke="#c98a12" strokeWidth="2.2" strokeLinecap="round" />;
            })}
            <circle cx="32" cy="34" r="19" fill="#ffd34d" stroke={INK} strokeWidth="1.4" />
            <path d="M18 40c6 8 22 8 28 0" fill="#fff3c2" />
            <path d="M12 34l-5-4v9Z" fill="#ffb02e" stroke={INK} strokeWidth="1" />
            {[24, 32, 40].map((x) => (
              <circle key={x} cx={x} cy={22} r="1.3" fill="#e0a21b" />
            ))}
          </g>
        ),
        face: { l: [25, 31], r: [39, 31], s: 4.3, m: [32, 41], mw: 6 },
      };
    case 5: // Pıt (penguen)
      return {
        body: (
          <g>
            <ellipse cx="32" cy="38" rx="18" ry="19" fill="#23303e" stroke={INK} strokeWidth="1.4" />
            <path d="M18 38c0-9 6-13 14-13s14 4 14 13c0 9-6 14-14 14s-14-5-14-14Z" fill="#f4f7fb" />
            <path d="M28 40l4-2 4 2-4 4Z" fill="#ffa62e" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
            <path d="M14 22c2-10 34-10 36 0l-1 4H15Z" fill="#e24a5c" stroke={INK} strokeWidth="1.3" />
            <path d="M15 24h34" stroke="#fff" strokeWidth="3" />
            <circle cx="32" cy="12" r="4" fill="#fff" stroke={INK} strokeWidth="1" />
          </g>
        ),
        face: { l: [26, 33], r: [38, 33], s: 3.6, m: [32, 47], mw: 5 },
      };
    case 6: // Kıskaç (yengeç)
      return {
        body: (
          <g>
            <path d="M12 30c-7-4-8-12-3-15 3 4 7 5 9 9M52 30c7-4 8-12 3-15-3 4-7 5-9 9" fill="#ff6a4a" stroke={INK} strokeWidth="1.3" />
            <path d="M7 15c3-1 5 1 5 4M57 15c-3-1-5 1-5 4" stroke={INK} strokeWidth="1.2" fill="none" />
            <path d="M16 50l-6 6M20 52l-4 7M48 50l6 6M44 52l4 7" stroke="#d94a2e" strokeWidth="2.6" strokeLinecap="round" />
            <ellipse cx="32" cy="40" rx="20" ry="14" fill="#ff7b57" stroke={INK} strokeWidth="1.4" />
            <path d="M26 27v-9M38 27v-9" stroke="#d94a2e" strokeWidth="2.4" />
            <circle cx="26" cy="17" r="5.3" fill="#ff7b57" stroke={INK} strokeWidth="1.2" />
            <circle cx="38" cy="17" r="5.3" fill="#ff7b57" stroke={INK} strokeWidth="1.2" />
            <circle cx="22" cy="44" r="1.3" fill="#ffb59e" />
            <circle cx="42" cy="44" r="1.3" fill="#ffb59e" />
          </g>
        ),
        face: { l: [26, 17], r: [38, 17], s: 3.3, m: [32, 42], mw: 8 },
      };
    case 7: // Bulut (balina)
      return {
        body: (
          <g>
            <path d="M28 14c-2-4 0-7 2-8M32 14V5M36 14c2-4 0-7-2-8" stroke="#7fd3ff" strokeWidth="2.2" strokeLinecap="round" fill="none" className="ch-spout" />
            <path d="M8 36c0-12 10-20 24-20s24 8 24 20c0 11-10 18-24 18S8 47 8 36Z" fill="#4f8fe0" stroke={INK} strokeWidth="1.4" />
            <path d="M14 42c5 8 31 8 36 0-2 7-10 10-18 10s-16-3-18-10Z" fill="#d6ebff" />
            <path d="M20 46h24M22 49h20" stroke="#9cc4ea" strokeWidth="1" />
            <ellipse cx="22" cy="24" rx="5" ry="2.5" fill="#fff" opacity="0.3" transform="rotate(-20 22 24)" />
          </g>
        ),
        face: { l: [24, 33], r: [40, 33], s: 3.6, m: [32, 40], mw: 9 },
      };
    case 8: // Dalga (deniz atı)
      return {
        body: (
          <g>
            <path d="M24 58c-6-2-6-10 0-12 8-3 10-9 4-14-6-5-6-14 2-18 10-5 20 2 18 12-1 6-6 6-8 4" fill="#ffb24d" stroke={INK} strokeWidth="1.4" />
            <path d="M46 24h9c2 0 2 4 0 4h-9" fill="#ffb24d" stroke={INK} strokeWidth="1.3" />
            <path d="M22 18l-5-4 6-1M21 25l-6-2 6-3M22 33l-6 0 5-4" fill="#ff8a3d" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
            {[[30, 40], [27, 47], [34, 30]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#e0871f" />
            ))}
          </g>
        ),
        face: { l: [34, 20], r: [42, 21], s: 3, m: [44, 27], mw: 4 },
      };
    case 9: // Diş (köpekbalığı)
      return {
        body: (
          <g>
            <path d="M32 6l8 14H26Z" fill="#7d93a8" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M8 38c0-12 10-20 24-20s24 8 24 20c0 10-10 16-24 16S8 48 8 38Z" fill="#8ea3b6" stroke={INK} strokeWidth="1.4" />
            <path d="M12 42c6 10 34 10 40 0-2 8-10 12-20 12s-18-4-20-12Z" fill="#eef3f7" />
            <path d="M14 36l-3 3M14 33l-3 3M50 36l3 3M50 33l3 3" stroke="#5c7186" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        ),
        face: { l: [24, 32], r: [40, 32], s: 3.5, m: [32, 44], mw: 14 },
        top: <path d="M22 44l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3" fill="#fff" stroke={INK} strokeWidth="0.8" strokeLinejoin="round" className="ch-teeth" />,
      };
    case 10: // Rüzgâr (vatoz)
      return {
        body: (
          <g>
            <path d="M4 32c8-2 14-12 28-12s20 10 28 12c-8 4-14 14-28 14S12 36 4 32Z" fill="#2f8f8a" stroke={INK} strokeWidth="1.4" />
            <path d="M22 22c-2-5 0-9 3-10M42 22c2-5 0-9-3-10" stroke="#2f8f8a" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M18 38c6 6 22 6 28 0-4 6-10 8-14 8s-10-2-14-8Z" fill="#dff5f2" />
            <path d="M32 46c0 6 4 10 10 12" stroke="#2f8f8a" strokeWidth="2" fill="none" strokeLinecap="round" />
            {[16, 48].map((x) => (
              <circle key={x} cx={x} cy={30} r="1.2" fill="#8fe0d8" />
            ))}
          </g>
        ),
        face: { l: [26, 30], r: [38, 30], s: 3.3, m: [32, 38], mw: 6 },
      };
    default: // 11 Dalgıç Demir (pirinç kask)
      return {
        body: (
          <g>
            <path d="M12 58c0-8 8-12 20-12s20 4 20 12Z" fill="#3a5a7a" stroke={INK} strokeWidth="1.3" />
            <circle cx="32" cy="32" r="21" fill="#d9a23a" stroke={INK} strokeWidth="1.4" />
            <circle cx="32" cy="32" r="21" fill="url(#ch-brass)" opacity="0.6" />
            <circle cx="32" cy="33" r="13.5" fill="#bfe6ff" stroke="#6b4a10" strokeWidth="3" />
            <circle cx="32" cy="33" r="13.5" fill="#ffd9b0" opacity="0.85" />
            {[[13, 32], [51, 32], [32, 12]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="3.3" fill="#c48d27" stroke={INK} strokeWidth="1" />
            ))}
            <path d="M14 24l-4-2M50 24l4-2" stroke="#6b4a10" strokeWidth="2" strokeLinecap="round" />
          </g>
        ),
        face: { l: [27, 31], r: [37, 31], s: 3.2, m: [32, 38.5], mw: 6 },
        top: (
          <g>
            <circle cx="32" cy="33" r="13.5" fill="none" stroke="#6b4a10" strokeWidth="3" />
            <path d="M32 19.5v27M18.5 33h27" stroke="#6b4a10" strokeWidth="1.2" opacity="0.6" />
            <ellipse cx="27" cy="26" rx="4" ry="2" fill="#fff" opacity="0.55" transform="rotate(-30 27 26)" />
          </g>
        ),
      };
  }
}

/** Karakter çizimi. `mood` yüz ifadesini, `animate` küçük canlı hareketleri (göz kırpma, sallanma) açar. */
export function Character({ id, size = 48, mood = 'idle', animate = true, className = '', ring = true }: { id: number; size?: number; mood?: Mood; animate?: boolean; className?: string; ring?: boolean }) {
  const c = charOf(id);
  const img = ASSETS.characters[c.id];
  if (img)
    return (
      <svg className={`charsvg mood--${mood} ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={c.name}>
        <clipPath id={`ch-img-${c.id}`}>
          <circle cx="32" cy="32" r="31" />
        </clipPath>
        <circle cx="32" cy="32" r="31" fill={`hsl(${c.hue} 60% 40%)`} />
        <image href={img} x="0" y="0" width="64" height="64" clipPath={`url(#ch-img-${c.id})`} preserveAspectRatio="xMidYMid slice" style={mood === 'out' ? { filter: 'grayscale(1)' } : undefined} />
      </svg>
    );
  if (c.art) {
    const key = `${c.art}_${ART_FACE[mood] ?? 'smile'}` as PackKey;
    return (
      <svg className={`charsvg charsvg--art mood--${mood}${animate ? ' is-alive' : ''} ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={c.name}>
        <g className="ch-body">
          <image href={PACK[key]} x="0" y="0" width="64" height="64" style={mood === 'out' ? { filter: 'grayscale(1) brightness(.7)' } : undefined} />
        </g>
        {mood === 'cry' || mood === 'hurt' ? <path className="ch-sweat" d="M48 18q-2.5 4 0 5.5q2.5-1.5 0-5.5Z" fill="#9fe0ff" stroke="#2a7fb0" strokeWidth={0.5} /> : null}
        {mood === 'win' || mood === 'cool' ? (
          <g className="ch-sparkle" fill="#ffe07a">
            <path d="M10 14l1.2 3 3 1.2-3 1.2L10 22.4l-1.2-3-3-1.2 3-1.2Z" />
            <path d="M54 10l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9Z" />
          </g>
        ) : null}
      </svg>
    );
  }
  const d = draw(c.id);
  const f = d.face;
  return (
    <svg className={`charsvg mood--${mood}${animate ? ' is-alive' : ''} ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={c.name}>
      <defs>
        <radialGradient id={`ch-bg-${c.id}`} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor={`hsl(${c.hue} 80% 72%)`} />
          <stop offset="1" stopColor={`hsl(${c.hue} 60% 34%)`} />
        </radialGradient>
        <linearGradient id="ch-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset="1" stopColor="#7a5410" />
        </linearGradient>
        <clipPath id="ch-clip">
          <circle cx="32" cy="32" r="31" />
        </clipPath>
      </defs>
      {ring ? <circle cx="32" cy="32" r="31" fill={`url(#ch-bg-${c.id})`} /> : null}
      <g clipPath={ring ? 'url(#ch-clip)' : undefined}>
        <g className="ch-body">
          {d.body}
          <g className="ch-face">
            <Eyes l={f.l} r={f.r} s={f.s} mood={mood} />
            <Mouth x={f.m[0]} y={f.m[1]} w={f.mw} mood={mood} />
            <Extras mood={mood} l={f.l} r={f.r} />
          </g>
          {d.top}
        </g>
      </g>
      {ring ? <circle cx="32" cy="32" r="31" fill="none" stroke="hsl(0 0% 100% / .18)" strokeWidth="1.5" /> : null}
    </svg>
  );
}
