/**
 * Mine Duel 2 — ikon seti: kalın koyu dış çizgi + canlı neon dolgu + üst parlama (oyun arayüzü stili).
 * Hepsi elle çizilmiş SVG; dosya indirmez, her boyutta keskin.
 */
import type { ReactNode } from 'react';

const OUT = '#0a1020';
type P = { size?: number; className?: string };

function Svg({ size = 32, className = '', children, label }: P & { children: ReactNode; label?: string }) {
  return (
    <svg className={`ic2 ${className}`} width={size} height={size} viewBox="0 0 48 48" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </svg>
  );
}
/** Üst parlama şeridi. */
const Shine = ({ d }: { d: string }) => <path d={d} fill="#fff" opacity={0.45} />;

export function CoinIcon(p: P) {
  return (
    <Svg {...p} label="DUEL COIN">
      <defs>
        <linearGradient id="g-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe46b" />
          <stop offset="1" stopColor="#f19a00" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="27" rx="18" ry="17" fill="#b86a00" stroke={OUT} strokeWidth="3" />
      <circle cx="24" cy="23" r="18" fill="url(#g-coin)" stroke={OUT} strokeWidth="3" />
      <circle cx="24" cy="23" r="12.5" fill="none" stroke="#c97a00" strokeWidth="2.4" />
      {/* damga: mayın */}
      <circle cx="24" cy="23" r="5.6" fill="#c97a00" />
      <path d="M24 14.5v3M24 28.5v3M15.5 23h3M29.5 23h3M18 17l2 2M28 27l2 2M18 29l2-2M28 19l2-2" stroke="#c97a00" strokeWidth="2.2" strokeLinecap="round" />
      <Shine d="M12 17a13 13 0 0 1 10-8a1.6 1.6 0 0 1 .4 3a10 10 0 0 0-7.6 6.2a1.6 1.6 0 0 1-2.8-1.2z" />
    </Svg>
  );
}

export function GemIcon(p: P) {
  return (
    <Svg {...p} label="Elmas">
      <path d="M12 8h24l9 12-21 22L3 20z" fill="#ff3d7f" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M3 20h42M17 8l-5 12 12 22 12-22-5-12" fill="none" stroke="#b3104c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 20l12 22-12-22zM24 20" fill="#ff7aa8" />
      <Shine d="M13 10h9l-4 9h-7z" />
    </Svg>
  );
}

export function GearIcon(p: P) {
  return (
    <Svg {...p} label="Ayarlar">
      <path
        d="M21 4h6l1.2 5.2 3.6 1.6 4.6-2.8 4.2 4.2-2.8 4.6 1.6 3.6L44 21v6l-5.2 1.2-1.6 3.6 2.8 4.6-4.2 4.2-4.6-2.8-3.6 1.6L27 44h-6l-1.2-5.2-3.6-1.6-4.6 2.8-4.2-4.2 2.8-4.6-1.6-3.6L4 27v-6l5.2-1.2 1.6-3.6-2.8-4.6 4.2-4.2 4.6 2.8 3.6-1.6z"
        fill="#e9f3ff"
        stroke={OUT}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="7" fill="#1d6cff" stroke={OUT} strokeWidth="3" />
    </Svg>
  );
}

export function ChestIcon(p: P) {
  return (
    <Svg {...p} label="Ödüller">
      <path d="M6 22h36v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#e8283f" stroke={OUT} strokeWidth="3" />
      <path d="M6 22c0-8 6-14 18-14s18 6 18 14z" fill="#ff4a5e" stroke={OUT} strokeWidth="3" />
      <path d="M6 22h36" stroke={OUT} strokeWidth="3" />
      <rect x="19" y="18" width="10" height="11" rx="2" fill="#ffd23f" stroke={OUT} strokeWidth="2.6" />
      <path d="M14 10v32M34 10v32" stroke="#a5162a" strokeWidth="2.4" />
      <Shine d="M10 18c1-4 5-7 10-8a1 1 0 0 1 .5 2c-4 1-7 3-8 6z" />
    </Svg>
  );
}

export function HeroIcon(p: P) {
  return (
    <Svg {...p} label="Karakter">
      <path d="M8 44c1-9 7-14 16-14s15 5 16 14z" fill="#22d36b" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="24" cy="18" r="11" fill="#ffd8b0" stroke={OUT} strokeWidth="3" />
      <path d="M13 17c0-7 5-11 11-11s11 4 11 11c-3-3-6-4-11-4s-8 1-11 4z" fill="#1b1f3a" stroke={OUT} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="1.8" fill={OUT} />
      <circle cx="28" cy="20" r="1.8" fill={OUT} />
      <Shine d="M12 40c1-4 4-7 8-8a1 1 0 0 1 .6 1.8c-3 1.3-5 3.4-6 6.4z" />
    </Svg>
  );
}

export function BattleIcon(p: P) {
  return (
    <Svg {...p} label="Savaş">
      <defs>
        <linearGradient id="g-batl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe36a" />
          <stop offset="1" stopColor="#f2a100" />
        </linearGradient>
      </defs>
      <path d="M24 3l17 6v13c0 11-7 19-17 23C14 41 7 33 7 22V9z" fill="url(#g-batl)" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 9l11 4v9c0 8-5 13-11 16-6-3-11-8-11-16v-9z" fill="#1b4fd8" stroke={OUT} strokeWidth="2.4" strokeLinejoin="round" />
      {/* mayın */}
      <circle cx="24" cy="23" r="5.2" fill="#e9f3ff" stroke={OUT} strokeWidth="2" />
      <path d="M24 14.5v3M24 28.5v3M15.5 23h3M29.5 23h3" stroke="#e9f3ff" strokeWidth="2.2" strokeLinecap="round" />
      <Shine d="M10 11l13-5v3l-10 4v6h-3z" />
    </Svg>
  );
}

export function TrophyIcon(p: P) {
  return (
    <Svg {...p} label="Sıralama">
      <path d="M14 6h20v10c0 7-4 12-10 12s-10-5-10-12z" fill="#ffc700" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 10H7c0 7 3 11 8 11M34 10h7c0 7-3 11-8 11" fill="none" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 28h8l1 7h-10z" fill="#f29a00" stroke={OUT} strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="13" y="35" width="22" height="8" rx="2.5" fill="#8b4bff" stroke={OUT} strokeWidth="3" />
      <Shine d="M17 9h4v8c0 2 .6 3.6 1.6 5l-2 1.4C18 21.6 17 19.4 17 17z" />
    </Svg>
  );
}

export function ScrollIcon(p: P) {
  return (
    <Svg {...p} label="Görevler">
      <path d="M10 8h24a4 4 0 0 1 4 4v24a6 6 0 0 1-6 6H14a4 4 0 0 1-4-4z" fill="#b84dff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M16 16h16M16 23h16M16 30h10" stroke="#f3dcff" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 42a6 6 0 0 0 6-6v-2h-8v2a6 6 0 0 1-2 4" fill="#7d1fd1" stroke={OUT} strokeWidth="2.4" strokeLinejoin="round" />
      <Shine d="M13 10h18v3H13z" />
    </Svg>
  );
}

export function LockIcon(p: P) {
  return (
    <Svg {...p} label="Kilitli">
      <path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke={OUT} strokeWidth="8" />
      <path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#5c6b86" strokeWidth="3.4" />
      <rect x="9" y="20" width="30" height="22" rx="5" fill="#5c6b86" stroke={OUT} strokeWidth="3" />
      <circle cx="24" cy="30" r="3.4" fill={OUT} />
      <path d="M24 31v5" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

export function FlagIcon2(p: P) {
  return (
    <Svg {...p} label="Bayrak">
      <path d="M12 6v38" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
      <path d="M12 6v38" stroke="#d9e4f5" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 7h24l-6 8 6 8H13z" fill="#ff3b3b" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <Shine d="M15 9h17l-2 2.5H15z" />
    </Svg>
  );
}

export function PickIcon2(p: P) {
  return (
    <Svg {...p} label="Aç">
      <path d="M22 26L8 40" stroke={OUT} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M22 26L8 40" stroke="#c7863f" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M8 18C15 7 30 4 41 9c-9 0-17 4-21 11z" fill="#c9d6ea" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 40C41 33 44 18 39 7c0 9-4 17-11 21z" fill="#c9d6ea" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
    </Svg>
  );
}

export function RadarIcon(p: P) {
  return (
    <Svg {...p} label="Radar">
      <circle cx="24" cy="24" r="19" fill="#063a6b" stroke={OUT} strokeWidth="3" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="#00d2ff" strokeWidth="2" opacity="0.6" />
      <circle cx="24" cy="24" r="6.5" fill="none" stroke="#00d2ff" strokeWidth="2" opacity="0.6" />
      <path d="M24 24L24 5A19 19 0 0 1 41 16z" fill="#00d2ff" opacity="0.85" />
      <circle cx="32" cy="15" r="3" fill="#bdf6ff" />
      <circle cx="24" cy="24" r="2.6" fill="#bdf6ff" />
    </Svg>
  );
}

export function ShieldIcon2(p: P) {
  return (
    <Svg {...p} label="Kalkan">
      <path d="M24 4l17 6v12c0 11-7 18-17 22C14 40 7 33 7 22V10z" fill="#00a6ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 10l11 4v8c0 7-4 12-11 15z" fill="#0072e0" />
      <path d="M17 23l5 5 9-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Shine d="M10 12l13-5v3l-10 4v7h-3z" />
    </Svg>
  );
}

export function EmoteIcon(p: P) {
  return (
    <Svg {...p} label="Emoji">
      <circle cx="24" cy="24" r="19" fill="#ffd23f" stroke={OUT} strokeWidth="3" />
      <ellipse cx="17.5" cy="20" rx="2.6" ry="3.6" fill={OUT} />
      <ellipse cx="30.5" cy="20" rx="2.6" ry="3.6" fill={OUT} />
      <path d="M14 28c4 7 16 7 20 0z" fill="#b8172a" stroke={OUT} strokeWidth="2.6" strokeLinejoin="round" />
      <Shine d="M11 18a14 14 0 0 1 9-10a1.5 1.5 0 0 1 1 2.8a11 11 0 0 0-7 7.7z" />
    </Svg>
  );
}

export function EyeIcon2(p: P) {
  return (
    <Svg {...p} label="İzle">
      <path d="M3 24C9 13 16 9 24 9s15 4 21 15c-6 11-13 15-21 15S9 35 3 24z" fill="#e9f3ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="9" fill="#00a6ff" stroke={OUT} strokeWidth="3" />
      <circle cx="24" cy="24" r="3.6" fill={OUT} />
      <circle cx="21" cy="21" r="2" fill="#fff" />
    </Svg>
  );
}

export function InviteIcon(p: P) {
  return (
    <Svg {...p} label="Davet et">
      <circle cx="18" cy="16" r="8" fill="#ffd8b0" stroke={OUT} strokeWidth="3" />
      <path d="M4 42c1-9 6-14 14-14s13 5 14 14z" fill="#00a6ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="36" cy="30" r="9" fill="#22d36b" stroke={OUT} strokeWidth="3" />
      <path d="M36 25v10M31 30h10" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </Svg>
  );
}

export function StarIcon(p: P & { on?: boolean }) {
  const on = p.on !== false;
  return (
    <Svg {...p}>
      <path d="M24 4l6 12.5 13.5 2-9.8 9.6 2.3 13.6L24 35.3l-12 6.4 2.3-13.6-9.8-9.6 13.5-2z" fill={on ? '#ffc700' : '#3a4a68'} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      {on ? <Shine d="M18 17l5-10 1.4 2.8L21 17z" /> : null}
    </Svg>
  );
}

export function PlayIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 7l26 17-26 17z" fill="#fff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
    </Svg>
  );
}

export function BotIcon(p: P) {
  return (
    <Svg {...p} label="Botlar">
      <path d="M24 4v6" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="5" r="3" fill="#ff3d7f" stroke={OUT} strokeWidth="2.4" />
      <rect x="8" y="10" width="32" height="26" rx="9" fill="#a6b4cc" stroke={OUT} strokeWidth="3" />
      <rect x="13" y="16" width="22" height="13" rx="6" fill="#0d1527" />
      <circle cx="19" cy="22.5" r="3" fill="#00ff66" />
      <circle cx="29" cy="22.5" r="3" fill="#00ff66" />
      <path d="M14 36v6h20v-6" fill="#7d8aa3" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
    </Svg>
  );
}

export function FriendsIcon(p: P) {
  return (
    <Svg {...p} label="Arkadaşlar">
      <circle cx="16" cy="17" r="7" fill="#ffd8b0" stroke={OUT} strokeWidth="3" />
      <circle cx="32" cy="17" r="7" fill="#f0b98a" stroke={OUT} strokeWidth="3" />
      <path d="M3 42c1-8 6-13 13-13s12 5 13 13z" fill="#b800ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M19 42c1-8 6-13 13-13s12 5 13 13z" fill="#00a6ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
    </Svg>
  );
}

export function TablesIcon(p: P) {
  return (
    <Svg {...p} label="Masalar">
      <ellipse cx="24" cy="22" rx="20" ry="12" fill="#1f8a52" stroke={OUT} strokeWidth="3" />
      <ellipse cx="24" cy="20" rx="15" ry="8" fill="#2fd27a" />
      <path d="M10 30v12M38 30v12" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
      <rect x="17" y="15" width="6" height="6" rx="1.5" fill="#e9f3ff" stroke={OUT} strokeWidth="1.8" />
      <rect x="25" y="17" width="6" height="6" rx="1.5" fill="#e9f3ff" stroke={OUT} strokeWidth="1.8" />
    </Svg>
  );
}

export function PlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M24 8v32M8 24h32" stroke={OUT} strokeWidth="10" strokeLinecap="round" />
      <path d="M24 8v32M8 24h32" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  );
}

export function XpIcon(p: P) {
  return (
    <Svg {...p} label="XP">
      <path d="M24 3l18 10v22L24 45 6 35V13z" fill="#00d2ff" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <text x="24" y="30" textAnchor="middle" fontFamily="'MD Display', 'Arial Black', sans-serif" fontSize="15" fill="#fff" stroke={OUT} strokeWidth="1.2" paintOrder="stroke">
        XP
      </text>
    </Svg>
  );
}
