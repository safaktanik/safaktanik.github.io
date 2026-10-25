/**
 * Mine Duel — tasarım sistemi bileşenleri (UIManager katmanı):
 * Panel (başlık çipli), Btn (parlak oyun düğmeleri), Ribbon (kurdele), RarityCard (nadirlik kartı),
 * CurrencyPill, TopBar, TabBar ve 2.5D Chibi karakter + kaide.
 * Görsel dil: lacivert zemin, kalın koyu çerçeve, neon vurgu (altın / elektrik mavisi / mor / neon yeşil).
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Character } from '../arena/ui/characters';
import type { Mood } from '../arena/ui/characters';
import { CHARACTERS } from '../arena/characterData';
import { fmt } from '../arena/ui/common';
import { BattleIcon, ChestIcon, CoinIcon, GearIcon, HeroIcon, LockIcon, ScrollIcon, TrophyIcon, XpIcon } from './icons';
import { KIT } from './kit';

/* ------------------------------------------------------------------ panel */

export function Panel({ title, onClose, children, className = '', tone = 'navy' }: { title?: ReactNode; onClose?(): void; children: ReactNode; className?: string; tone?: 'navy' | 'red' | 'gold' }) {
  return (
    <section className={`p2 p2--${tone} ${className}`}>
      {title ? <h2 className="p2__title">{title}</h2> : null}
      {onClose ? (
        <button type="button" className="p2__x" aria-label="Kapat" onClick={onClose}>
          ✕
        </button>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ düğmeler */

export type BtnTone = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'dark';
export function Btn({ tone = 'blue', size = 'md', children, onClick, disabled, className = '', type = 'button', ariaLabel }: { tone?: BtnTone; size?: 'sm' | 'md' | 'lg' | 'xl'; children: ReactNode; onClick?(): void; disabled?: boolean; className?: string; type?: 'button' | 'submit'; ariaLabel?: string }) {
  return (
    <button type={type} className={`b2 b2--${tone} b2--${size} ${className}`} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      <span className="b2__in">{children}</span>
    </button>
  );
}

/** Kare ikon düğmesi (ayarlar dişlisi gibi). */
export function IconBtn({ children, onClick, label, tone = 'blue', badge }: { children: ReactNode; onClick?(): void; label: string; tone?: BtnTone; badge?: ReactNode }) {
  return (
    <button type="button" className={`ib2 ib2--${tone}`} aria-label={label} title={label} onClick={onClick}>
      {children}
      {badge ? <i className="ib2__badge">{badge}</i> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ kurdele ve nadirlik kartı */

export function Ribbon({ children, tone = 'yellow', className = '' }: { children: ReactNode; tone?: 'yellow' | 'red' | 'blue'; className?: string }) {
  return (
    <div className={`rb2 rb2--${tone} ${className}`}>
      <span className="rb2__tail rb2__tail--l" />
      <span className="rb2__body">{children}</span>
      <span className="rb2__tail rb2__tail--r" />
    </div>
  );
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_LABEL: Record<Rarity, string> = { common: 'SIRADAN', rare: 'NADİR', epic: 'EPİK', legendary: 'EFSANEVİ' };

export function RarityCard({ rarity, icon, title, value, desc, onClick, selected, disabled, compact }: { rarity: Rarity; icon: ReactNode; title: string; value?: ReactNode; desc?: ReactNode; onClick?(): void; selected?: boolean; disabled?: boolean; compact?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`rc2 rc2--${rarity}${selected ? ' is-on' : ''}${compact ? ' rc2--compact' : ''}`} onClick={onClick} disabled={onClick ? disabled : undefined}>
      <span className="rc2__tag">{RARITY_LABEL[rarity]}</span>
      <span className="rc2__art">{icon}</span>
      {value !== undefined ? <b className="rc2__val">{value}</b> : null}
      <strong className="rc2__title">{title}</strong>
      {desc ? <small className="rc2__desc">{desc}</small> : null}
    </Tag>
  );
}

/* ------------------------------------------------------------------ üst çubuk */

export function CurrencyPill({ icon, value, onClick, label }: { icon: ReactNode; value: number | string; onClick?(): void; label: string }) {
  return (
    <button type="button" className="cp2" onClick={onClick} aria-label={`${label}: ${value}`} disabled={!onClick}>
      <span className="cp2__ic">{icon}</span>
      <b data-testid={label === 'DUEL COIN' ? 'balance' : undefined}>{typeof value === 'number' ? fmt(value) : value}</b>
      {onClick ? <img className="kit cp2__plus" src={KIT.plus} alt="" aria-hidden="true" draggable={false} /> : null}
    </button>
  );
}

export function TopBar({ coins, level, xpFrac, onSettings, onCoins, extra }: { coins: number; level: number; xpFrac: number; onSettings(): void; onCoins?(): void; extra?: ReactNode }) {
  return (
    <header className="tb2">
      <IconBtn label="Ayarlar" onClick={onSettings}>
        <GearIcon size={30} />
      </IconBtn>
      <div className="tb2__lvl" title={`Seviye ${level}`}>
        <XpIcon size={30} />
        <b>{level}</b>
        <i style={{ ['--f' as string]: String(Math.max(0, Math.min(1, xpFrac))) }} />
      </div>
      {extra}
      <CurrencyPill icon={<CoinIcon size={30} />} value={coins} label="DUEL COIN" onClick={onCoins} />
    </header>
  );
}

/* ------------------------------------------------------------------ alt sekme çubuğu */

export type Tab = 'shop' | 'hero' | 'battle' | 'rank' | 'quests';
const TABS: { id: Tab; label: string; icon: (s: number) => ReactNode; locked?: boolean }[] = [
  { id: 'shop', label: 'Mağaza', icon: (s) => <ChestIcon size={s} /> },
  { id: 'hero', label: 'Karakter', icon: (s) => <HeroIcon size={s} /> },
  { id: 'battle', label: 'Savaş', icon: (s) => <BattleIcon size={s} /> },
  { id: 'rank', label: 'Sıralama', icon: (s) => <TrophyIcon size={s} /> },
  { id: 'quests', label: 'Görevler', icon: (s) => <ScrollIcon size={s} /> },
];

export function TabBar({ tab, onTab, alerts = {} }: { tab: Tab; onTab(t: Tab): void; alerts?: Partial<Record<Tab, boolean>> }) {
  // kilitli sekmeye dokununca kısa "yakında" balonu (yoksa dokunuş hiçbir tepki vermiyordu)
  const [soon, setSoon] = useState<Tab | null>(null);
  useEffect(() => {
    if (!soon) return;
    const id = window.setTimeout(() => setSoon(null), 1600);
    return () => window.clearTimeout(id);
  }, [soon]);
  return (
    <nav className="tab2" aria-label="Ana menü">
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            className={`tab2__b${on ? ' is-on' : ''}${t.id === 'battle' ? ' tab2__b--main' : ''}${t.locked ? ' is-locked' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={t.locked ? `${t.label} (yakında)` : t.label}
            onClick={() => (t.locked ? setSoon(t.id) : onTab(t.id))}
          >
            {soon === t.id ? <span className="tab2__soon" role="status">{t.label} yakında geliyor!</span> : null}
            <span className="tab2__ic">{t.locked ? <LockIcon size={30} /> : t.icon(t.id === 'battle' ? 44 : 32)}</span>
            {on || t.id === 'battle' ? <span className="tab2__l">{t.label}</span> : null}
            {alerts[t.id] && !t.locked ? <i className="tab2__alert">!</i> : null}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ 2.5D chibi karakter */

export type Pose = 'idle' | 'win' | 'dizzy' | 'ready' | 'wave';
const POSE_MOOD: Record<Pose, Mood> = { idle: 'idle', win: 'win', dizzy: 'out', ready: 'happy', wave: 'happy' };

/**
 * Chibi gövde (büyük kafa, küçük gövde) + karakterin yüzü + yerdeki kaide.
 * Gölgelendirme ve kenar ışığıyla 3D hissi verir; poz CSS ile canlanır (yalnızca transform: ucuz).
 */
export function Chibi({ id, size = 120, pose = 'idle', pedestal = true, name, className = '' }: { id: number; size?: number; pose?: Pose; pedestal?: boolean; name?: string; className?: string }) {
  const c = CHARACTERS.find((x) => x.id === id) ?? CHARACTERS[0];
  const h = c.hue;
  const body = `hsl(${h} 70% 50%)`;
  const bodyDark = `hsl(${h} 70% 32%)`;
  const bodyHi = `hsl(${h} 85% 68%)`;
  const g = `chb-${id}-${pose}`;
  return (
    <div className={`chibi2 chibi2--${pose} ${className}`} style={{ width: size, height: size * 1.25 }}>
      <svg viewBox="0 0 100 125" width={size} height={size * 1.25} aria-hidden="true">
        <defs>
          <linearGradient id={`${g}-b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={bodyHi} />
            <stop offset="0.55" stopColor={body} />
            <stop offset="1" stopColor={bodyDark} />
          </linearGradient>
          <radialGradient id={`${g}-p`} cx="0.5" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#3ff4ff" />
            <stop offset="1" stopColor="#0b5fb0" />
          </radialGradient>
        </defs>
        {pedestal ? (
          <g className="chibi2__ped">
            <ellipse cx="50" cy="114" rx="40" ry="10" fill="#071021" />
            <ellipse cx="50" cy="110" rx="38" ry="9.5" fill={`url(#${g}-p)`} stroke="#0a1020" strokeWidth="2.5" />
            <ellipse cx="50" cy="108.5" rx="28" ry="5.5" fill="#bff8ff" opacity="0.35" />
          </g>
        ) : (
          <ellipse cx="50" cy="112" rx="26" ry="6" fill="#000" opacity="0.35" />
        )}
        <g className="chibi2__body">
          {/* bacaklar */}
          <rect x="35" y="88" width="11" height="18" rx="5" fill={bodyDark} stroke="#0a1020" strokeWidth="2.5" />
          <rect x="54" y="88" width="11" height="18" rx="5" fill={bodyDark} stroke="#0a1020" strokeWidth="2.5" />
          {/* gövde */}
          <path d="M30 70c0-8 9-13 20-13s20 5 20 13v15c0 6-6 9-20 9s-20-3-20-9z" fill={`url(#${g}-b)`} stroke="#0a1020" strokeWidth="2.8" />
          <path d="M42 62h16l-3 9h-10z" fill="#ffd23f" stroke="#0a1020" strokeWidth="2" strokeLinejoin="round" />
          {/* kollar (poza göre) */}
          <g className="chibi2__arm chibi2__arm--l">
            <rect x="19" y="63" width="12" height="24" rx="6" fill={body} stroke="#0a1020" strokeWidth="2.5" />
          </g>
          <g className="chibi2__arm chibi2__arm--r">
            <rect x="69" y="63" width="12" height="24" rx="6" fill={body} stroke="#0a1020" strokeWidth="2.5" />
          </g>
          {/* kafa: karakterin yüzü (büyük, chibi oranı) */}
          <g className="chibi2__head">
            <circle cx="50" cy="35" r="30" fill="#0a1020" />
            <svg x="21" y="6" width="58" height="58" viewBox="0 0 64 64">
              <Character id={id} size={64} mood={POSE_MOOD[pose]} animate={false} />
            </svg>
            <ellipse cx="38" cy="18" rx="10" ry="5" fill="#fff" opacity="0.28" transform="rotate(-25 38 18)" />
          </g>
          {pose === 'dizzy' ? (
            <g className="chibi2__stars">
              <path d="M30 4l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#ffd23f" stroke="#0a1020" strokeWidth="1.2" />
              <path d="M66 2l1.6 3.2 3.4.6-2.5 2.4.6 3.4-3.1-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.6z" fill="#ffd23f" stroke="#0a1020" strokeWidth="1.2" />
              <circle cx="50" cy="0" r="2.6" fill="#ff3d7f" />
            </g>
          ) : null}
        </g>
      </svg>
      {name ? <span className="chibi2__name">{name}</span> : null}
    </div>
  );
}
