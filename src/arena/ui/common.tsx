import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { arenaClient } from '../client';
import type { ArenaSnapshot } from '../client';
import { TIERS } from '../economy';
import type { TierId } from '../economy';
import { CHARACTER_COUNT, Character, charOf } from './characters';
import { KIT, TIER_ART, medalFor } from '../../v2/kit';
import type { Mood } from './characters';

export function useArena(): ArenaSnapshot {
  const c = arenaClient();
  return useSyncExternalStore(
    (fn) => c.subscribe(fn),
    () => c.state,
  );
}

/** Saniyede bir (ya da verilen aralıkta) yeniden çizim. */
export function useTick(ms = 250): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return n;
}

const nf = new Intl.NumberFormat('tr-TR');
export const fmt = (n: number) => nf.format(n);

/** DUEL COIN simgesi: arayüz setinin taçlı jetonu. */
export function Coin({ size = 18 }: { size?: number }) {
  return <img className="coin kit" src={KIT.coin} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

export function Money({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`money ${className}`}>
      <Coin size={size} />
      <b>{fmt(value)}</b>
    </span>
  );
}

/** Oyuncu avatarı: çizimli karakter (characters.tsx). `mood` maç içindeki ifadeyi belirler. */
export const AVATAR_COUNT = CHARACTER_COUNT;

export function Avatar({ id, size = 44, active = false, out = false, mood, className = '' }: { id: number; size?: number; active?: boolean; out?: boolean; mood?: Mood; className?: string }) {
  const c = charOf(id);
  return (
    <span className={`avatar${active ? ' avatar--active' : ''}${out ? ' avatar--out' : ''} ${className}`} style={{ width: size, height: size, ['--av' as string]: c.hue }} title={c.name}>
      <Character id={c.id} size={size} mood={mood ?? (out ? 'out' : 'idle')} />
    </span>
  );
}

export function Hearts({ lives, max = 3, size = 16 }: { lives: number; max?: number; size?: number }) {
  return (
    <span className="ahearts" aria-label={`${lives}/${max} can`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} className={i < lives ? 'ah ah--on' : 'ah ah--off'} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.5S3.5 15.2 3.5 9.1A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.5c0 6.1-8.5 11.4-8.5 11.4Z" />
        </svg>
      ))}
    </span>
  );
}

/** Masa türü: madalya (Bronz/Gümüş/Altın) ya da elmas + ad. */
export function TierBadge({ tier, small = false }: { tier: TierId; small?: boolean }) {
  return (
    <span className={`tierbadge tier--${tier}${small ? ' tierbadge--sm' : ''}`}>
      <img className="kit tierbadge__art" src={TIER_ART[tier]} alt="" aria-hidden="true" draggable={false} />
      {TIERS[tier].label}
    </span>
  );
}

/** 1–3. sıra için kanatlı madalya; diğerlerinde sıra numarası. */
export function RankMark({ rank, size = 28 }: { rank: number; size?: number }) {
  const m = medalFor(rank);
  return m ? <img className="kit rankmark" src={m} width={size} height={size} alt={`${rank}.`} draggable={false} /> : <span className="rankmark rankmark--n">{rank}</span>;
}

export function LevelBadge({ level }: { level: number }) {
  return <span className="lvl">Sv {level}</span>;
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

/** Tıklanabilir küçük simge düğmesi. */
export function IconBtn({ label, onClick, children, badge }: { label: string; onClick(): void; children: ReactNode; badge?: boolean }) {
  return (
    <button type="button" className="aicon" aria-label={label} title={label} onClick={onClick}>
      {children}
      {badge ? <i className="aicon__dot" /> : null}
    </button>
  );
}

const MOTION_KEY = 'mine-duel:arena:motion';
export function loadMotion(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function applyMotion(on: boolean): void {
  try {
    window.localStorage.setItem(MOTION_KEY, on ? 'on' : 'off');
  } catch {
    /* yok say */
  }
  document.documentElement.dataset.motion = on ? 'on' : 'off';
}

export function rankLabel(r: number | null): string {
  return r ? `#${r}` : '—';
}

export function msToClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}s`;
  if (h > 0) return `${h}s ${m}dk`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Test sunucusunda yalnızca görüntüleme yetkisi olanlara açıklama. */
export function ReadOnlyNote() {
  const s = useArena();
  if (!s.readOnly) return null;
  return (
    <p className="aerror readonly">
      Bu sayfayı yalnızca <b>görüntüleme</b> yetkisiyle açtın; masaya oturamaz ve profil oluşturamazsın. Sayfanın sahibinden seni
      <b> düzenleme yetkisiyle</b> davet etmesini iste (claude.ai → sayfanın Paylaş menüsü).
    </p>
  );
}
