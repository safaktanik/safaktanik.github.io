import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import type { Reaction, ReactionEvent } from '../protocol';
import { errorText } from '../client';
import type { MatchPlayerView, MatchView } from '../protocol';
import { playSound, setMusicTension, startMusic, stopMusic } from '../../audio/sound';
import { Avatar, Hearts, LevelBadge, fmt, useTick } from './common';
import { ChestIcon, ExitIcon, FlagIcon, MineIcon } from './icons';
import { BoardMine, DefusedMine, EyeIcon, SeaMine } from './art';
import { FxCanvas, fx, fxAtCell } from './Fx';
import { badgesFor, recordBadges } from '../achievements';
import { deduce } from '../solver';
import type { BonusKind, PowerKind, ScanResult } from '../mines';
import { SMOKE_MS } from '../mines';
import { FlagIcon2 } from '../../v2/icons';
import { PackIcon } from './PackIcon';
import { PACK } from './packArt';
import type { PackKey } from './packArt';
import type { Mood } from './characters';
import { ReactionGlyph, ReactionLayer, ReactionTray } from './Reactions';
import { ModeIcon } from './ModeUi';
import { MODES } from '../modes';
import { CoinIcon } from '../../v2/icons';
import { MatchResult } from './MatchResult';
import { Sheet } from './Sheet';


export const BONUS_INFO: Record<BonusKind, { icon: string; gain: string }> = {
  shield: { icon: '🛡️', gain: '+1 kalkan' },
  sonar: { icon: '📡', gain: '+1 sonar' },
  life: { icon: '❤️', gain: '+1 can' },
  extra: { icon: '🔁', gain: 'ekstra tur' },
};

export const cellName = (size: number, i: number) => `${Math.floor(i / size) + 1}. satır, ${(i % size) + 1}. sütun`;

interface BoardProps {
  size: number;
  cells: number[];
  /** Bölge: açan koltuk (renk) — yalnızca Bölge Savaşı'nda boyanır. */
  owners: number[] | null;
  chests: Set<number> | null;
  hiddenChests: Set<number> | null;
  allowed: Set<number> | null;
  myTurn: boolean;
  cellPx: number;
  selected: number | null;
  last: number | null;
  lastKind: string | null;
  boom: { index: number; key: number } | null;
  interactive: boolean;
  flags: Set<number>;
  /** Sonarın bulduğu mayınlar ve güvenli olduğu kesinleşen kareler (yalnızca bu oyuncu görür). */
  sonarMines: Set<number>;
  sonarSafe: Set<number>;
  /** Rakibin (ya da botun) seçtiği kare: açmadan önce görünür. */
  aim: { index: number; seat: number } | null;
  ping: { index: number; key: number } | null;
  overlay: { index: number; key: number; art: PackKey } | null;
  /** Bayraklarla tamamlanmış sayılar (soluk gösterilir). */
  done: Set<number>;
  /** Bulunmuş bonus kutuları ve (bitişte) bulunmamış olanlar. */
  bonusAt: Map<number, BonusKind> | null;
  bonusGhost: Map<number, BonusKind> | null;
  /** İpucu feneri: parlayan kare. */
  hint: { index: number; kind: 'safe' | 'mine'; key: number } | null;
  /** Maç bitti: bayrak kontrolü gösterilir. */
  finished: boolean;
  onCell(i: number): void;
  /** Uzun bas: kare menüsü. */
  onLong(i: number): void;
  /** Sağ tık: doğrudan bayrak. */
  onFlag(i: number): void;
}

/** Ortak tahta: tek tıklama dinleyicisi (900 kareye kadar akıcı). */
const BoardGrid = memo(function BoardGrid({ size, cells, owners, chests, hiddenChests, allowed, myTurn, cellPx, selected, last, lastKind, boom, interactive, flags, sonarMines, sonarSafe, aim, ping, overlay, done, bonusAt, bonusGhost, hint, finished, onCell, onLong, onFlag }: BoardProps) {
  // iPhone'da sağ tık yok: kareye uzun basınca (0,45 sn) bayrak konur/kalkar.
  const press = useRef<{ t: number; i: number; x: number; y: number } | null>(null);
  const suppress = useRef(false);
  const lastLong = useRef(0);
  const cellAt = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null;
    return el ? Number(el.dataset.i) : null;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    const i = cellAt(e.target);
    if (i === null) return;
    if (press.current) window.clearTimeout(press.current.t);
    press.current = {
      i,
      x: e.clientX,
      y: e.clientY,
      t: window.setTimeout(() => {
        suppress.current = true;
        lastLong.current = Date.now();
        press.current = null;
        navigator.vibrate?.(12);
        onLong(i);
      }, 420),
    };
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.t);
    press.current = null;
    if (suppress.current) window.setTimeout(() => (suppress.current = false), 400);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    const i = cellAt(e.target);
    if (i !== null) onCell(i);
  };
  const onContext = (e: MouseEvent<HTMLDivElement>) => {
    const i = cellAt(e.target);
    if (i === null) return;
    e.preventDefault();
    if (Date.now() - lastLong.current < 1200) return; // uzun basış zaten işledi (Android)
    cancelPress();
    onFlag(i);
  };
  return (
    <div
      className={`mgrid${interactive ? ' is-live' : ''}`}
      style={{ gridTemplateColumns: `repeat(${size}, ${cellPx}px)`, gridAutoRows: `${cellPx}px`, fontSize: Math.max(10, Math.round(cellPx * 0.52)) }}
      onClick={onClick}
      onContextMenu={onContext}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      role="grid"
      aria-label={`Oyun alanı ${size}×${size}`}
    >
      {cells.map((v, i) => {
        let cls = 'mc';
        let content: ReactNode = null;
        if (v === -1) cls += ' mc--hidden';
        else if (v === 9) {
          cls += ' mc--boom';
          content = <BoardMine index={i} lit size={Math.round(cellPx * 0.9)} />;
        } else if (v === 10) {
          cls += ' mc--mine';
          content = <BoardMine index={i} lit={false} size={Math.round(cellPx * 0.82)} />;
        } else if (v === 11) {
          cls += ` mc--defused${owners && owners[i] >= 0 ? ` s${owners[i]}` : ''}`;
          content = <DefusedMine size={Math.round(cellPx * 0.86)} />;
        } else {
          cls += ` mc--open n${v}`;
          content = v > 0 ? v : null;
        }
        if (owners && v >= 0 && v <= 8 && owners[i] >= 0) cls += ` mc--own s${owners[i]}`;
        if (chests?.has(i)) {
          cls += ` mc--chest${owners && owners[i] >= 0 ? ` s${owners[i]}` : ''}`;
          content = (
            <>
              <ChestIcon size={Math.round(cellPx * 0.6)} />
              {typeof content === 'number' ? <em>{content}</em> : null}
            </>
          );
        } else if (hiddenChests?.has(i) && v === -1) {
          cls += ' mc--chestghost';
          content = <ChestIcon size={Math.round(cellPx * 0.5)} />;
        }
        if (allowed && v === -1) cls += allowed.has(i) ? ' mc--allow' : myTurn ? ' mc--blocked' : '';
        if (v === -1 && flags.has(i)) {
          cls += finished ? ' mc--flag mc--flagbad' : ' mc--flag';
          content = <FlagIcon2 size={Math.round(cellPx * 0.66)} />;
        } else if (v === 10 && flags.has(i)) cls += ' mc--flagok';
        const bonus = bonusAt?.get(i) ?? null;
        const ghost = !bonus && v === -1 && !flags.has(i) ? bonusGhost?.get(i) ?? null : null;
        if (ghost) {
          cls += ' mc--bonusghost';
          content = <span className="mbonus mbonus--ghost">🎁</span>;
        }
        if (hint && hint.index === i) cls += ` mc--hint mc--hint-${hint.kind}`;
        const sMine = v === -1 && sonarMines.has(i);
        if (sMine) {
          cls += ' mc--sonarmine';
          if (!flags.has(i)) content = <BoardMine index={i} lit={false} size={Math.round(cellPx * 0.72)} />;
        } else if (v === -1 && sonarSafe.has(i) && !flags.has(i)) cls += ' mc--sonarsafe';
        if (aim && aim.index === i && v === -1) cls += ` mc--aim s${aim.seat}`;
        if (done.has(i)) cls += ' mc--done';
        if (i === selected) cls += ' mc--sel';
        if (i === last) cls += ` mc--last mc--last-${lastKind}`;
        return (
          <button key={i} type="button" className={cls} data-i={i} tabIndex={v === -1 && interactive ? 0 : -1} aria-label={cellName(size, i)}>
            {content}
            {bonus ? <span className={`mbonus mbonus--${bonus}`} title={BONUS_INFO[bonus].gain}>{BONUS_INFO[bonus].icon}</span> : null}
            {finished && v === 10 && flags.has(i) ? <span className="mflagok">✓</span> : null}
            {finished && v === -1 && flags.has(i) ? <span className="mflagbad">✗</span> : null}
            {hint && hint.index === i ? <i key={hint.key} className="mhintglow" /> : null}
            {sMine ? <span className="msonartag" aria-label="Sonar: mayın">📡</span> : null}
            {aim && aim.index === i && v === -1 ? <span className="maim" aria-hidden="true">🤔</span> : null}
            {boom && boom.index === i ? <i key={boom.key} className="mboom" /> : null}
            {ping && ping.index === i ? <img key={ping.key} className="mping mping--art" src={PACK.effect_radar_sweep} alt="" /> : null}
            {overlay && overlay.index === i ? <img key={overlay.key} className={`mover mover--${overlay.art}`} src={PACK[overlay.art]} alt="" /> : null}
          </button>
        );
      })}
    </div>
  );
});

export interface RadialAction {
  id: string;
  icon: string;
  label: string;
  tone: string;
  badge?: number;
  disabled?: boolean;
  onClick(): void;
}

/** Kare menüsü: seçilen karenin çevresinde, tahtanın içine doğru açılan yuvarlak düğmeler. */
function RadialMenu({ index, wrap, actions, onGone }: { index: number; wrap: { current: HTMLDivElement | null }; actions: RadialAction[]; onGone(): void }) {
  const [pos, setPos] = useState<{ x: number; y: number; c: number; W: number; H: number } | null>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  useLayoutEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const place = () => {
      const cell = w.querySelector<HTMLElement>(`.mgrid [data-i="${index}"]`);
      if (!cell) return setPos(null);
      const a = w.getBoundingClientRect();
      const b = cell.getBoundingClientRect();
      const x = b.left - a.left + b.width / 2;
      const y = b.top - a.top + b.height / 2;
      // kare görünür alandan çıktıysa menü kapanır; yoksa kareyi izler
      if (x < 0 || y < 0 || x > a.width || y > a.height) return gone.current();
      setPos({ x, y, c: b.width, W: a.width, H: a.height });
    };
    place();
    const sc = w.querySelector('.mscroll');
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    sc?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      sc?.removeEventListener('scroll', onScroll);
    };
  }, [index, wrap, actions.length]);
  if (!pos || !actions.length) return null;
  const n = actions.length;
  const B = n > 4 ? 54 : 58; // düğme çapı
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  // Az düğme: tahtanın ortasına doğru açılan yay. Çok düğme (güçler dahil): karenin çevresinde tam halka;
  // kenardaki karede halka sığmazsa düğmeler kareyi örtmeden tahtanın içine yayılır (birbirine binmez).
  const Rring = Math.max(pos.c / 2 + B / 2 + 6, ((B + 8) * n) / (2 * Math.PI), 62);
  const fitsRing = pos.x >= Rring + B / 2 && pos.y >= Rring + B / 2 && pos.x <= pos.W - Rring - B / 2 && pos.y <= pos.H - Rring - B / 2;
  const base = Math.hypot(pos.W / 2 - pos.x, pos.H / 2 - pos.y) < 40 ? -Math.PI / 2 : Math.atan2(pos.H / 2 - pos.y, pos.W / 2 - pos.x);
  const lo = B / 2 + 2;
  const inside = (x: number, y: number) => x >= lo && y >= lo && x <= pos.W - lo && y <= pos.H - lo;
  let spots: { x: number; y: number }[];
  if (n > 3 && fitsRing) {
    // ortadaki kare: tam halka
    spots = actions.map((_, k) => ({ x: pos.x + Math.cos(-Math.PI / 2 + (k * 2 * Math.PI) / n) * Rring, y: pos.y + Math.sin(-Math.PI / 2 + (k * 2 * Math.PI) / n) * Rring }));
  } else if (n > 3) {
    // kenar / köşe kare: kareyi örtmeden, tahtanın içinde kalan yerlere iç içe yaylar halinde (yakından uzağa)
    const cand: { x: number; y: number; r: number; d: number; sa: number }[] = [];
    for (let ring = 0; ring < 4; ring++) {
      const r = pos.c / 2 + B / 2 + 8 + ring * (B + 8);
      const cnt = Math.max(6, Math.floor((2 * Math.PI * r) / (B + 8)));
      for (let k = 0; k < cnt; k++) {
        const ang = base + (k * 2 * Math.PI) / cnt;
        const x = pos.x + Math.cos(ang) * r;
        const y = pos.y + Math.sin(ang) * r;
        if (!inside(x, y)) continue;
        const d = Math.abs(Math.atan2(Math.sin(ang - base), Math.cos(ang - base)));
        cand.push({ x, y, r: ring, d, sa: Math.atan2(Math.sin(ang - base), Math.cos(ang - base)) });
      }
    }
    cand.sort((p, q) => p.r - q.r || p.d - q.d);
    const picked: typeof cand = [];
    for (const c of cand) {
      if (picked.length >= n) break;
      if (picked.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= B + 4)) picked.push(c);
    }
    picked.sort((p, q) => p.r - q.r || p.sa - q.sa);
    // aynı yay üzerindekileri açıya göre sırala: düğmeler dağınık değil, düzgün bir yelpaze gibi dizilir
    spots = picked.length >= n ? picked : actions.map((_, k) => ({ x: clamp(pos.x + Math.cos(base + k) * Rring, lo, pos.W - lo), y: clamp(pos.y + Math.sin(base + k) * Rring, lo, pos.H - lo) }));
  } else {
    // az düğme: tahtanın ortasına doğru yay
    const R = Math.max(pos.c / 2 + B / 2 + 8, 66);
    const step = (Math.PI / 180) * 56;
    spots = actions.map((_, k) => {
      const ang = base + (k - (n - 1) / 2) * step;
      return { x: clamp(pos.x + Math.cos(ang) * R, lo, pos.W - lo), y: clamp(pos.y + Math.sin(ang) * R, lo, pos.H - lo) };
    });
  }
  return (
    <div className="mradial" role="menu" aria-label="Kare menüsü">
      <span className="mradial__ring" style={{ left: pos.x, top: pos.y, width: pos.c, height: pos.c }} />
      {actions.map((a, k) => {
        const { x, y } = spots[k];
        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            className={`mradial__btn mradial__btn--${a.tone}${n > 4 ? ' is-small' : ''}`}
            style={{ left: x, top: y, ['--k' as string]: k }}
            aria-label={a.label}
            disabled={a.disabled}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
            }}
          >
            <span className="mradial__ico" aria-hidden="true">{a.icon}</span>
            <span className="mradial__lbl">{a.label}</span>
            {a.badge !== undefined ? <em>{a.badge}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

function PlayerChip({ p, m, isMe, hurt, mood, fire }: { p: MatchPlayerView; m: MatchView; isMe: boolean; hurt: boolean; mood: Mood | null; fire: number }) {
  const active = m.phase === 'playing' && m.current === p.seat && !p.eliminated;
  const face: Mood = p.eliminated ? 'out' : m.phase === 'finished' && m.winnerSeat === p.seat ? 'win' : mood ?? (active ? 'idle' : 'idle');
  return (
    <div style={{ ['--seatc' as string]: `var(--seat${p.seat})` }} className={`pchip${active ? ' is-active' : ''}${p.eliminated ? ' is-out' : ''}${isMe ? ' is-me' : ''}${hurt ? ' is-hurt' : ''}${!p.eliminated && p.lives === 1 && m.phase === 'playing' ? ' is-lastlife' : ''}`} data-seat={p.seat}>
      {active && !isMe ? (
        <span className="pchip__think" aria-label="düşünüyor">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {fire >= 3 && !p.eliminated ? <span key={fire} className="pchip__fire" title={`Seri: ${fire} güvenli hamle`}>🔥{fire}</span> : null}
      <Avatar id={p.avatar} size={44} active={active} out={p.eliminated} mood={face} key={`${face}`} />
      <div className="pchip__txt">
        <strong>{p.username}{isMe && p.username !== 'Sen' ? ' (sen)' : ''}</strong>
        <span className="pchip__row">
          <LevelBadge level={p.level} />
          {m.mode === 'territory' ? (
            <span className="pchip__score" title="Bölge">
              <FlagIcon size={12} /> {p.territory}
            </span>
          ) : null}
          {m.mode === 'hunter' ? (
            <span className="pchip__score pchip__score--hunt" title="İmha edilen mayın">
              <DefusedMine size={13} /> {p.defused}
            </span>
          ) : null}
          {m.mode === 'treasure' ? (
            <span className="pchip__score" title="Sandık">
              <ChestIcon size={12} /> {p.chests}
            </span>
          ) : null}
          {!p.eliminated && p.shield > 0 ? (
            <span className="pchip__shield" title="Kalkan: ilk mayını karşılar">
              <PackIcon name="ability_shield" size={15} />
              {p.shield > 1 ? <small>{p.shield}</small> : null}
            </span>
          ) : null}
          {p.eliminated ? <em className="pchip__out">{p.eliminationReason === 'afk' ? 'Uzakta · elendi' : p.eliminationReason === 'left' ? 'Ayrıldı' : 'Elendi'}</em> : m.players.length >= 3 || p.lives > 3 ? (
            <span className="pchip__lives" title={`${p.lives} can`}>❤️<b>{p.lives}</b></span>
          ) : (
            <Hearts lives={p.lives} size={14} />
          )}
        </span>
      </div>
    </div>
  );
}

export interface MatchScreenProps {
  m: MatchView;
  meId: string | null;
  /** Sunucu saatine göre şimdi (ms). */
  now(): number;
  move(index: number, action?: 'open' | 'defuse'): Promise<unknown>;
  /** Sonar: 3×3 alandaki mayın sayısı (yalnızca sana). */
  scan?(index: number): Promise<ScanResult>;
  /** Güç kullan (Duman / Zaman Dondurma). */
  power?(kind: PowerKind): Promise<unknown>;
  /** Masadan çık: elenmediysen hükmen elenirsin; maçın bitmesi beklenmez. */
  exit(): Promise<unknown> | void;
  react?(e: Reaction): void;
  subscribeReactions?(fn: (e: ReactionEvent) => void): () => void;
  onLobby(): void;
  onAgain(): void;
  /** Çevrimdışı antrenman: para/puan gösterilmez. */
  practice?: boolean;
  weeklyRank?: number | null;
}

type Tool = 'open' | 'flag' | 'sonar' | 'defuse';

/** Değer dolu olduğunda `ms` sonra temizler (efekt zamanlayıcıları). */
function useAutoClear(v: unknown, clear: () => void, ms: number): void {
  const ref = useRef(clear);
  ref.current = clear;
  useEffect(() => {
    if (!v) return;
    const id = window.setTimeout(() => ref.current(), ms);
    return () => window.clearTimeout(id);
  }, [v, ms]);
}
const STREAK_MARKS = [3, 5, 8, 12, 16];
const QUICK_EMOJI = ['😂', '😱', '👏'] as const;

/** Seri göstergesi: üst üste güvenli hamleler alevi büyütür; sıradaki eşiğe (×3, ×5, ×8…) kalan hamle görünür. */
function StreakMeter({ n, zap, myTurn }: { n: number; zap: number; myTurn: boolean }) {
  const next = STREAK_MARKS.find((x) => x > n) ?? n + 1;
  const prev = [...STREAK_MARKS].reverse().find((x) => x <= n) ?? 0;
  const frac = Math.max(0.04, Math.min(1, (n - prev) / Math.max(1, next - prev)));
  const lvl = STREAK_MARKS.filter((x) => x <= n).length;
  return (
    <div className={`mstreak mstreak--l${lvl}${myTurn ? ' is-turn' : ''}`} title="Üst üste güvenli hamle serisi">
      <span className="mstreak__fire" aria-hidden="true">🔥</span>
      <div className="mstreak__body">
        <b>{n ? `SERİ ×${n}` : 'SERİ'}</b>
        <span className="mstreak__bar">
          <i style={{ transform: `scaleX(${frac})` }} />
        </span>
        <small>{n ? `×${next} için ${next - n} hamle` : 'güvenli aç, alevi yak'}</small>
      </div>
      {zap ? <span className="mstreak__zap" title="Şimşek hamle">⚡{zap}</span> : null}
    </div>
  );
}

export function MatchScreen({ m, meId, now, move, scan, power, exit, react, subscribeReactions, onLobby, onAgain, practice = false, weeklyRank = null }: MatchScreenProps) {
  useTick(250);
  const mySeat = m.viewerSeat;
  const meP = mySeat !== null ? m.players[mySeat] : null;
  const myTurn = m.phase === 'playing' && meP !== null && !meP.eliminated && m.current === mySeat;
  // Elenen oyuncu ve izleyici tahtaya hiçbir şekilde dokunamaz (bayrak, menü, güç yok); yalnızca izler.
  const canAct = m.phase === 'playing' && meP !== null && !meP.eliminated;

  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boom, setBoom] = useState<{ index: number; key: number } | null>(null);
  const [ping, setPing] = useState<{ index: number; key: number } | null>(null);
  const [overlay, setOverlay] = useState<{ index: number; key: number; art: PackKey } | null>(null);
  const [shake, setShake] = useState<'' | 'soft' | 'hard'>('');
  const [flash, setFlash] = useState<{ key: number; tone: 'hard' | 'soft' | 'shield' } | null>(null);
  const [hurtSeat, setHurtSeat] = useState<number | null>(null);
  const [moods, setMoods] = useState<Record<number, { mood: Mood; key: number }>>({});
  const setMood = useCallback((seat: number, mood: Mood, ms = 1800) => {
    const key = Date.now() + Math.random();
    setMoods((x) => ({ ...x, [seat]: { mood, key } }));
    window.setTimeout(() => setMoods((x) => (x[seat]?.key === key ? Object.fromEntries(Object.entries(x).filter(([k]) => Number(k) !== seat)) : x)), ms);
  }, []);
  const [banner, setBanner] = useState<{ text: string; tone: string; key: number } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [elimCard, setElimCard] = useState<'hidden' | 'shown' | 'closed'>('hidden');
  const [tool, setTool] = useState<Tool>('open');
  const [flags, setFlags] = useState<Set<number>>(() => new Set());
  const [scans, setScans] = useState<(ScanResult & { center: number })[]>([]);
  // Kare menüsü (dokun / basılı tut): Aç, Bayrak, Sonar, İmha yuvarlak düğmelerle.
  const [menu, setMenu] = useState<number | null>(null);
  // Bayrak isabeti: maç sırasında başkası açınca da sayılır (mayın → doğru, güvenli → yanlış).
  const flagHits = useRef({ right: 0, wrong: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const seenSeq = useRef(m.seq);
  const wasMyTurn = useRef(myTurn);
  const streaks = useRef(new Map<number, number>());
  // Eğlence katmanı (bu cihazda): seri alevi, şimşek hamle, ipucu feneri, izleyici tahmini.
  const [fire, setFire] = useState<Record<number, number>>({});
  const turnStart = useRef(0);
  const lightning = useRef(0);
  const [hintsLeft, setHintsLeft] = useState(1);
  const [hint, setHint] = useState<{ index: number; kind: 'safe' | 'mine'; key: number } | null>(null);
  const usedHint = useRef(false);
  const [guess, setGuess] = useState<{ turnNo: number; seat: number; g: 'safe' | 'mine' } | null>(null);
  const guessRef = useRef<typeof guess>(guess);
  guessRef.current = guess;
  const [oracle, setOracle] = useState({ right: 0, total: 0 });

  // Yeni maçta yerel işaretler sıfırlanır.
  useEffect(() => {
    setFlags(new Set());
    setScans([]);
    setMenu(null);
    flagHits.current = { right: 0, wrong: 0 };
    setTool('open');
    setElimCard('hidden');
    streaks.current.clear();
    maxStreak.current = 0;
    setFire({});
    lightning.current = 0;
    setHintsLeft(1);
    setHint(null);
    usedHint.current = false;
    setGuess(null);
    setOracle({ right: 0, total: 0 });
  }, [m.id]);

  // Güçler (Duman / Zaman Dondurma): kullanılınca herkese duyuru; duman kurbanında 5 sn sis.
  const seenPower = useRef(m.lastPower?.n ?? 0);
  useEffect(() => {
    const lp = m.lastPower;
    if (!lp || lp.n === seenPower.current) return;
    seenPower.current = lp.n;
    const who = lp.seat === mySeat ? 'Sen' : m.players[lp.seat]?.username ?? 'Biri';
    if (lp.kind === 'smoke') {
      playSound('smoke');
      setBanner({ text: lp.seat === mySeat ? '🌫️ Duman attın! Sıradakinin tahtası 5 sn sisli olacak' : `🌫️ ${who} duman attı!`, tone: 'smoke', key: Date.now() });
    } else {
      playSound('freeze');
      setBanner({ text: lp.seat === mySeat ? '❄️ Zamanı dondurdun: turuna ek süre!' : `❄️ ${who} zamanı dondurdu: ek süre`, tone: 'freeze', key: Date.now() });
    }
  }, [m.lastPower, mySeat, m.players]);
  const [fogUntil, setFogUntil] = useState(0);
  const fogTurn = useRef(-1);
  useEffect(() => {
    const sm = m.smoke;
    if (!sm || sm.turnNo !== m.turnNo || m.phase !== 'playing' || mySeat === null || sm.by === mySeat || fogTurn.current === m.turnNo) return;
    fogTurn.current = m.turnNo;
    setFogUntil(Date.now() + SMOKE_MS);
  }, [m.smoke, m.turnNo, m.phase, mySeat]);
  const fogged = fogUntil > Date.now();
  const frozenNow = !!m.lastPower && m.lastPower.kind === 'freeze' && m.lastPower.turnNo === m.turnNo && m.phase === 'playing';
  const usePowerUp = useCallback(
    async (kind: PowerKind) => {
      if (!power) return;
      setBusy(true);
      setErr(null);
      try {
        await power(kind);
        if (kind === 'freeze') navigator.vibrate?.([20, 40, 20]);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [power],
  );

  // Son hamlenin efektleri (yalnızca yeni hamlelerde).
  useEffect(() => {
    if (m.seq === seenSeq.current) return;
    const jumped = m.seq - seenSeq.current > 1;
    seenSeq.current = m.seq;
    const lm = m.lastMove;
    if (!lm) return;
    const who = m.players[lm.seat];
    const isMe = lm.seat === mySeat;
    const name = isMe ? 'Sen' : who.username;
    const st = streaks.current;
    if (lm.kind === 'defused') {
      st.set(lm.seat, (st.get(lm.seat) ?? 0) + 1);
      playSound('shield');
      window.setTimeout(() => playSound('coins'), 160);
      fxAtCell('defuse', lm.index, 1.2);
      setOverlay({ index: lm.index, key: m.seq, art: 'effect_mine_found' });
      setMood(lm.seat, 'cool');
      setBanner({ text: isMe ? 'Mayını imha ettin! +1 puan' : `${name} bir mayını imha etti!`, tone: 'defuse', key: m.seq });
    } else if (lm.kind === 'misdefuse') {
      st.set(lm.seat, 0);
      playSound('out');
      fxAtCell(lm.shielded ? 'shield' : 'misdefuse', lm.index);
      setHurtSeat(lm.seat);
      setMood(lm.seat, lm.shielded ? 'shock' : 'cry');
      if (isMe) navigator.vibrate?.([60, 40, 60]);
      setBanner({ text: lm.shielded ? `${name} yanlış kareyi imha etmeye çalıştı; kalkan korudu` : lm.eliminated ? `${name} yanlış imha yaptı ve elendi!` : `${name} yanlış imha! Orada mayın yoktu (${lm.livesLeft} can)`, tone: 'warn', key: m.seq });
    } else if (lm.kind === 'mine') {
      st.set(lm.seat, 0);
      playSound('boom');
      fxAtCell('boom', lm.index, isMe ? 1.25 : 1);
      if (lm.shielded) {
        window.setTimeout(() => fxAtCell('shield', lm.index), 120);
        setOverlay({ index: lm.index, key: m.seq, art: 'effect_shield' });
      }
      setMood(lm.seat, lm.shielded ? 'shock' : lm.eliminated ? 'out' : 'hurt');
      for (const p of m.players) if (p.seat !== lm.seat && !p.eliminated && Math.random() < 0.5) setMood(p.seat, Math.random() < 0.5 ? 'happy' : 'shock', 1400);
      setBoom({ index: lm.index, key: m.seq });
      setHurtSeat(lm.seat);
      setShake(isMe ? 'hard' : 'soft');
      setFlash({ key: m.seq, tone: lm.shielded ? 'shield' : isMe ? 'hard' : 'soft' });
      if (isMe) navigator.vibrate?.(lm.shielded ? [60] : [90, 50, 160]);
      if (lm.shielded) {
        window.setTimeout(() => playSound('shield'), 120);
        setBanner({ text: isMe ? 'Kalkanın patlamayı karşıladı! Can kaybı yok.' : `${name} mayına bastı ama kalkanı korudu!`, tone: 'shield', key: m.seq });
      } else {
        setBanner({ text: lm.eliminated ? `${name} son canını kaybetti ve elendi!` : `${name} mayına bastı! (${lm.livesLeft} can kaldı)`, tone: 'mine', key: m.seq });
        if (lm.eliminated) window.setTimeout(() => playSound('out'), 450);
      }
    } else if (lm.kind === 'safe') {
      const n = (jumped ? 0 : st.get(lm.seat) ?? 0) + 1;
      st.set(lm.seat, n);
      if (isMe) maxStreak.current = Math.max(maxStreak.current, n);
      if (lm.opened > 4) fxAtCell('safe', lm.index, 1.4);
      if (lm.chestsFound) {
        playSound('coins');
        fxAtCell('chest', lm.index, 1.2);
        setMood(lm.seat, 'win');
        setBanner({ text: `${name} ${lm.chestsFound} sandık buldu!`, tone: 'safe', key: m.seq });
      } else if (STREAK_MARKS.includes(n) && (isMe || n >= 5)) {
        playSound('streak');
        fxAtCell('streak', lm.index, 1.2);
        setMood(lm.seat, 'cool');
        setBanner({ text: isMe ? `🔥 Seri ×${n}! Mayınları ustaca atlatıyorsun` : `🔥 ${name} seri yakaladı: ×${n}`, tone: 'streak', key: m.seq });
      } else {
        playSound('reveal');
        if (lm.opened > 1) setBanner({ text: `${name} ${lm.opened} güvenli kare açtı`, tone: 'safe', key: m.seq });
        if (lm.opened > 6) setMood(lm.seat, 'happy');
      }
    } else if (lm.kind === 'timeout') {
      st.set(lm.seat, 0);
      setBanner({ text: lm.eliminated ? `${name} üst üste süre aştı ve elendi` : `${name} süresini doldurdu, sıra geçti`, tone: 'warn', key: m.seq });
    } else if (lm.kind === 'left') {
      setBanner({ text: `${name} masadan ayrıldı ve elendi`, tone: 'warn', key: m.seq });
    }
    setFire(Object.fromEntries(st));
    // Şimşek hamle: sıran gelir gelmez (3 sn içinde) güvenli kare.
    if (isMe && lm.kind === 'safe' && !jumped && turnStart.current && Date.now() - turnStart.current < 4000) {
      lightning.current++;
      window.setTimeout(() => playSound('zap'), 90);
      fxAtCell('streak', lm.index, 0.9);
      if (!lm.chestsFound && !lm.bonuses?.length) setBanner({ text: `⚡ Şimşek hamle! (${lightning.current})`, tone: 'zap', key: m.seq });
    }
    // Bonus kutuları
    if (lm.bonuses?.length) {
      const gains = lm.bonuses.map((k) => BONUS_INFO[k].gain).join(', ');
      window.setTimeout(() => playSound('bonus'), 120);
      if (lm.extraTurn) window.setTimeout(() => playSound('extra'), 520);
      fxAtCell('chest', lm.index, 1.3);
      setMood(lm.seat, 'win');
      setBanner({
        text: lm.extraTurn ? (isMe ? `🎁 Bonus kutusu: ${gains}! Bir hamle daha yap` : `🎁 ${name} bonus buldu: ${gains}! Yine o oynuyor`) : `🎁 ${isMe ? 'Bonus kutusu' : `${name} bonus buldu`}: ${gains}`,
        tone: 'bonus',
        key: m.seq,
      });
      if (isMe) navigator.vibrate?.([30, 30, 30]);
    }
    // İzleyici tahmini
    const gs = guessRef.current;
    if (gs && gs.seat === lm.seat && lm.kind !== 'timeout' && lm.kind !== 'left') {
      const safeMove = lm.kind === 'safe' || lm.kind === 'defused';
      const ok = (gs.g === 'safe') === safeMove;
      setOracle((o) => ({ right: o.right + (ok ? 1 : 0), total: o.total + 1 }));
      window.setTimeout(() => playSound(ok ? 'right' : 'wrong'), 250);
      setGuess(null);
    } else if (gs && gs.seat === lm.seat) setGuess(null);
  }, [m.seq, m.lastMove, m.players, mySeat, setMood]);
  // Sıranın başladığı an (şimşek hamle için); ekstra turda da yeniden başlar.
  useEffect(() => {
    turnStart.current = myTurn ? Date.now() : 0;
  }, [myTurn, m.turnNo]);

  // Madalyalar: maç bitince bir kez hesaplanır ve bu cihazdaki koleksiyona eklenir.
  const maxStreak = useRef(0);
  // Bayrak isabeti (bitişte mayınlar görünür: 10 = mayın).
  const flagStats = useMemo(() => {
    if (m.phase !== 'finished') return { right: 0, total: 0 };
    let right = flagHits.current.right;
    for (const i of flags) if (m.cells[i] === 10) right++;
    return { right, total: flags.size + flagHits.current.right + flagHits.current.wrong };
  }, [m.phase, m.cells, flags]);
  const badges = useMemo(() => {
    if (m.phase !== 'finished') return [];
    const b = badgesFor(m, mySeat, { maxStreak: maxStreak.current, usedSonar: scans.length > 0, lightning: lightning.current, flagsRight: flagStats.right, flagsTotal: flagStats.total, oracleRight: oracle.right, usedHint: usedHint.current });
    recordBadges(m.id, b);
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.phase, m.id, m.results]);

  // Maç sonu: kazanan için konfeti.
  const finishedRef = useRef(m.phase === 'finished');
  useEffect(() => {
    if (m.phase === 'finished' && !finishedRef.current) {
      finishedRef.current = true;
      fx('win', 0, 0);
    }
  }, [m.phase]);

  // Elendiğim an: izle / çık kartı.
  const iAmOut = !!meP?.eliminated && m.phase === 'playing';
  useEffect(() => {
    if (iAmOut && elimCard === 'hidden') {
      const id = window.setTimeout(() => setElimCard('shown'), 900);
      return () => window.clearTimeout(id);
    }
  }, [iAmOut, elimCard]);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) playSound('turn');
    wasMyTurn.current = myTurn;
    if (!myTurn) {
      setSel(null);
      setTool((t) => (t === 'sonar' ? 'open' : t));
    }
  }, [myTurn]);
  useEffect(() => {
    if (sel !== null && m.cells[sel] !== -1) setSel(null);
  }, [m.cells, sel]);
  useEffect(() => {
    // Açılan karelerdeki bayraklar düşer.
    setFlags((f) => {
      let changed = false;
      const n = new Set<number>();
      for (const i of f) {
        const v = m.cells[i];
        if (v === -1 || v === 10) n.add(i);
        else {
          changed = true;
          if (v === 9 || v === 11) flagHits.current.right++;
          else flagHits.current.wrong++;
        }
      }
      return changed ? n : f;
    });
  }, [m.cells]);
  useAutoClear(shake, () => setShake(''), 560);
  useAutoClear(hurtSeat !== null ? hurtSeat + 1 : 0, () => setHurtSeat(null), 900);
  useAutoClear(banner, () => setBanner(null), 2400);
  useAutoClear(boom, () => setBoom(null), 900);
  useAutoClear(ping, () => setPing(null), 1300);
  useAutoClear(overlay, () => setOverlay(null), 1300);
  useAutoClear(flash, () => setFlash(null), 750);

  // Tahta kutusunun gerçek boyutu: kareler hem genişliğe hem yüksekliğe sığar (kaydırma yok).
  const [box, setBox] = useState({ w: 340, h: 340 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Kare boyutu yalnızca ilk yerleşimde ve ekran (döndürme / pencere) değişince hesaplanır;
    // araç seçimi, yazı ya da efekt gibi iç değişiklikler tahtayı asla küçültüp büyütmez.
    const t0 = performance.now();
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    const update = () => {
      const settling = performance.now() - t0 < 1200;
      if (!settling && window.innerWidth === vw && window.innerHeight === vh) return;
      vw = window.innerWidth;
      vh = window.innerHeight;
      if (el.clientWidth > 0 && el.clientHeight > 0) setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  // Yakınlaştırma: tahta kutuya sığan boyuttan (fit) başlar; büyük tahtalarda kareler parmakla rahat
  // basılacak boyuta (≈30 px) otomatik büyür ve tahta kendi içinde kaydırılır (sayfa kaymaz). İki parmakla da yakınlaşır.
  // v2 tahtası: kareler arası 2 px boşluk + 4 px iç kenar (kare boyutu hesabına katılır)
  const GAP = 2;
  const PAD = 4;
  const fit = Math.max(10, Math.min(52, Math.floor((Math.min(box.w, box.h) - 10 - PAD * 2 - GAP * (m.size - 1)) / m.size)));
  const [zoom, setZoom] = useState(1);
  const maxZoom = Math.max(1, 56 / fit);
  const autoZoom = fit < 22 ? Math.min(maxZoom, 30 / fit) : 1;
  const zoomInit = useRef<string>('');
  useEffect(() => {
    const key = `${m.id}:${fit}`;
    if (zoomInit.current === key) return;
    zoomInit.current = key;
    setZoom(autoZoom);
    centerOn.current = 'island';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, fit]);
  const cellPx = Math.max(10, Math.min(60, Math.round(fit * zoom)));
  const scroller = useRef<HTMLDivElement>(null);
  const centerOn = useRef<'island' | { fx: number; fy: number } | null>(null);
  const zoomTo = useCallback(
    (z: number) => {
      const el = scroller.current;
      if (el) centerOn.current = { fx: (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth), fy: (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight) };
      setZoom(Math.max(1, Math.min(maxZoom, z)));
    },
    [maxZoom],
  );
  useLayoutEffect(() => {
    const el = scroller.current;
    const c = centerOn.current;
    if (!el || !c) return;
    centerOn.current = null;
    if (c === 'island') {
      // açık alanın (başlangıç adası) ortasına odaklan
      let sr = 0;
      let sc = 0;
      let n = 0;
      m.cells.forEach((v, i) => {
        if (v >= 0 && v <= 8) {
          sr += Math.floor(i / m.size);
          sc += i % m.size;
          n++;
        }
      });
      const r = n ? sr / n : m.size / 2;
      const col = n ? sc / n : m.size / 2;
      el.scrollLeft = (col + 0.5) * cellPx - el.clientWidth / 2;
      el.scrollTop = (r + 0.5) * cellPx - el.clientHeight / 2;
    } else {
      el.scrollLeft = c.fx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = c.fy * el.scrollHeight - el.clientHeight / 2;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellPx]);
  // İki parmakla yakınlaştırma (pinch). Tarayıcının sayfa yakınlaştırması yerine tahta büyür.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let start: { d: number; z: number } | null = null;
    let raf = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { d: dist(e.touches), z: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const z = (start.z * dist(e.touches)) / start.d;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => zoomTo(z));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [zoomTo]);

  const reveal = useCallback(
    async (i: number, action?: 'open' | 'defuse') => {
      setBusy(true);
      setErr(null);
      setMenu(null);
      try {
        await move(i, action ?? (tool === 'defuse' ? 'defuse' : 'open'));
        setSel(null);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [move, tool],
  );

  const doScan = useCallback(
    async (i: number) => {
      if (!scan) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await scan(i);
        playSound('sonar');
        setPing({ index: i, key: Date.now() });
        const mines = r.mines ?? [];
        setScans((xs) => [...xs, { ...r, mines, center: i }]);
        fxAtCell('sonar', i, 1.2);
        setBanner({
          text: mines.length === 0 ? '📡 Sonar: bu alan tertemiz! Yeşil kareler güvenli.' : `📡 Sonar ${mines.length} mayının yerini buldu! Kırmızılar mayın, yeşiller güvenli.`,
          tone: 'sonar',
          key: Date.now(),
        });
        if (mines.length) window.setTimeout(() => playSound('warn'), 450);
        setTool('open');
        setSel(null);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [scan],
  );

  const toggleFlag = useCallback(
    (i: number) => {
      if (m.cells[i] !== -1 || !canAct) return;
      setFlags((f) => {
        const n = new Set(f);
        if (n.has(i)) {
          n.delete(i);
          playSound('unflag');
        } else {
          n.add(i);
          playSound('flag');
          navigator.vibrate?.(15);
        }
        return n;
      });
      if (sel === i) setSel(null);
    },
    [m.cells, canAct, sel],
  );

  // Sonar: bulunan mayınlar (hâlâ gizli olanlar) ve alanın geri kalanı (kesin güvenli).
  const sonarMines = useMemo(() => new Set(scans.flatMap((x) => x.mines).filter((i) => m.cells[i] === -1)), [scans, m.cells]);
  const sonarSafe = useMemo(() => {
    const out = new Set<number>();
    for (const x of scans) for (const a of x.area) if (m.cells[a] === -1 && !x.mines.includes(a)) out.add(a);
    return out;
  }, [scans, m.cells]);
  // İpucu feneri: yalnızca görünen bilgilerden kesin çıkarım (maç başına 1 hak; çıkarım yoksa hak gitmez).
  const fireHint = useCallback(() => {
    if (!myTurn || hintsLeft <= 0 || busy) return;
    const d = deduce(m.cells, m.size, sonarMines);
    const allowedOk = (i: number) => !(m.mode === 'chain' && m.allowed && m.allowed.length) || m.allowed.includes(i);
    const pick = (xs: number[]) => xs[Math.floor(Math.random() * xs.length)];
    // Yeni bilgi ver: sonarın zaten gösterdiği kareleri ve kendi bayraklarını tercih etme.
    const fresh = d.safe.filter((i) => allowedOk(i) && !sonarSafe.has(i));
    const safe = fresh.length ? fresh : d.safe.filter(allowedOk);
    d.mines = d.mines.filter((i) => !sonarMines.has(i) && !flags.has(i));
    const key = Date.now();
    if (m.mode === 'hunter' && d.mines.length) {
      const i = pick(d.mines);
      setHint({ index: i, kind: 'mine', key });
      setTool('defuse');
      setSel(i);
      setBanner({ text: '💡 Fener: parlayan kare kesin mayın. İmha et, puanı kap!', tone: 'hint', key });
    } else if (safe.length) {
      const unflagged = safe.filter((x) => !flags.has(x));
      const i = pick(unflagged.length ? unflagged : safe);
      const wrongFlag = flags.has(i);
      if (wrongFlag)
        setFlags((f) => {
          const n = new Set(f);
          n.delete(i);
          return n;
        });
      setHint({ index: i, kind: 'safe', key });
      setTool('open');
      setSel(i);
      setBanner({ text: wrongFlag ? '💡 Fener: buradaki bayrağın yanlıştı, kaldırdım. Bu kare kesinlikle güvenli!' : '💡 Fener: parlayan kare kesinlikle güvenli', tone: 'hint', key });
    } else if (d.mines.length) {
      const i = pick(d.mines);
      setHint({ index: i, kind: 'mine', key });
      setFlags((f) => new Set(f).add(i));
      setBanner({ text: '💡 Fener kesin bir mayın buldu ve bayrakladı. Güvenli kare için risk alman gerek.', tone: 'hint', key });
    } else {
      playSound('wrong');
      setBanner({ text: '💡 Fener: şu an kesin bir çıkarım yok, şansını dene! (hakkın duruyor)', tone: 'warn', key });
      return;
    }
    playSound('hint');
    usedHint.current = true;
    setHintsLeft((n) => n - 1);
  }, [myTurn, hintsLeft, busy, m.cells, m.size, m.mode, m.allowed, sonarMines, sonarSafe, flags]);
  useEffect(() => {
    if (hint && m.cells[hint.index] !== -1) setHint(null);
  }, [m.cells, hint]);
  useAutoClear(hint, () => setHint(null), 6000);

  const chestSet = useMemo(() => (m.mode === 'treasure' ? new Set(m.chestsFound) : null), [m.mode, m.chestsFound]);
  const ghostChests = useMemo(() => (m.mode === 'treasure' && m.chestsAll ? new Set(m.chestsAll.filter((c) => !m.chestsFound.includes(c))) : null), [m.mode, m.chestsAll, m.chestsFound]);
  const allowedSet = useMemo(() => (m.mode === 'chain' && m.allowed && m.allowed.length ? new Set(m.allowed) : null), [m.mode, m.allowed]);
  // Çevresindeki bayrak + bilinen mayın sayısı kendi sayısına eşit olan kareler "tamam" (soluk): kalan güvenli komşuları bulmak kolaylaşır.
  const doneSet = useMemo(() => {
    const out = new Set<number>();
    const n = m.size;
    m.cells.forEach((v, i) => {
      if (v < 1 || v > 8) return;
      const r = Math.floor(i / n);
      const c = i % n;
      let k = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          const j = rr * n + cc;
          if (flags.has(j) || sonarMines.has(j) || m.cells[j] === 9 || m.cells[j] === 11) k++;
        }
      if (k === v) out.add(i);
    });
    return out;
  }, [m.cells, m.size, flags, sonarMines]);
  const bonusAt = useMemo(() => (m.bonusFound?.length ? new Map(m.bonusFound.map((b) => [b.i, b.k] as [number, BonusKind])) : null), [m.bonusFound]);
  const bonusGhost = useMemo(() => (m.bonusAll ? new Map(m.bonusAll.filter((b) => !bonusAt?.has(b.i)).map((b) => [b.i, b.k] as [number, BonusKind])) : null), [m.bonusAll, bonusAt]);

  /** Kareyi açmayı dener (bayrak, sonar ve zincir kontrolleriyle). */
  const tryOpen = useCallback(
    (i: number, action: 'open' | 'defuse') => {
      if (!myTurn || busy || m.cells[i] !== -1) return;
      if (action === 'open' && flags.has(i)) return setErr('Bu karede bayrağın var. Önce bayrağı kaldır.');
      if (action === 'open' && sonarMines.has(i)) return setErr('📡 Sonar burada mayın buldu! Başka bir kare seç.');
      if (allowedSet && !allowedSet.has(i)) return setErr('Zincir kuralı: parlayan karelerden birini açmalısın.');
      void reveal(i, action);
    },
    [myTurn, busy, m.cells, flags, sonarMines, allowedSet, reveal],
  );

  const onCell = useCallback(
    (i: number) => {
      if (!canAct) return;
      if (m.cells[i] !== -1) {
        setMenu(null);
        return;
      }
      if (tool === 'flag') {
        setMenu(null);
        return toggleFlag(i);
      }
      if (myTurn && !busy && tool === 'sonar') {
        setMenu(null);
        return void doScan(i);
      }
      // Aynı kareye ikinci dokunuş: hızlı aç (menüyü beklemeden).
      if (myTurn && !busy && sel === i && menu === i) return tryOpen(i, tool === 'defuse' ? 'defuse' : 'open');
      setMenu(i);
      setErr(null);
      const openable = !(allowedSet && !allowedSet.has(i)) && (tool === 'defuse' || (!flags.has(i) && !sonarMines.has(i)));
      setSel(myTurn && openable ? i : null);
      playSound('aim');
    },
    [canAct, m.cells, tool, toggleFlag, myTurn, busy, doScan, sel, menu, tryOpen, allowedSet, flags, sonarMines],
  );
  const onLong = useCallback(
    (i: number) => {
      if (!canAct || m.cells[i] !== -1) return;
      setMenu(i);
      setSel(myTurn && !(allowedSet && !allowedSet.has(i)) && !flags.has(i) && !sonarMines.has(i) ? i : null);
      playSound('aim');
    },
    [canAct, m.cells, myTurn, allowedSet, flags, sonarMines],
  );
  // Menü: kare açılınca, sıra değişince ya da maç bitince kapanır.
  useEffect(() => {
    if (menu !== null && (m.cells[menu] !== -1 || !canAct)) setMenu(null);
  }, [m.cells, menu, canAct]);
  useEffect(() => setMenu((x) => (x === null ? x : null)), [myTurn]);
  // Menü dışında herhangi bir yere dokununca (üst bar, alt panel, kenar boşluğu) ya da Esc ile kapanır.
  useEffect(() => {
    if (menu === null) return;
    const down = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.mradial, .mgrid')) setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);

  const turnLeft = m.turnEndsAt ? Math.max(0, m.turnEndsAt - now()) : 0;
  const secsLeft = Math.ceil(turnLeft / 1000);
  // Süre uyarısı: sıra sendeyken son 5 saniyede tik, son 3 saniyede tiz uyarı + titreşim.
  const lastWarn = useRef<string>('');
  useEffect(() => {
    if (!myTurn || m.phase !== 'playing' || !m.turnEndsAt) return;
    const key = `${m.turnNo}:${secsLeft}`;
    if (lastWarn.current === key) return;
    lastWarn.current = key;
    if (secsLeft <= 5 && secsLeft > 3) playSound('tick');
    else if (secsLeft <= 3 && secsLeft > 0) {
      playSound('warn');
      navigator.vibrate?.(40);
    } else if (secsLeft === 0) playSound('timeup');
  }, [secsLeft, myTurn, m.phase, m.turnNo, m.turnEndsAt]);
  // Maç müziği (ayarlardan kapatılabilir): sıra sende ve süre azalırken temposu artar.
  useEffect(() => {
    if (m.phase !== 'playing') return stopMusic();
    startMusic();
  }, [m.phase]);
  useEffect(() => () => stopMusic(), []);
  useEffect(() => setMusicTension(myTurn ? (secsLeft <= 5 ? 2 : 1) : 0), [myTurn, secsLeft]);
  // Son can: kalp atışı (sıra sendeyken) ve kırmızı nabız.
  const lastLife = m.phase === 'playing' && !!meP && !meP.eliminated && meP.lives === 1;
  useEffect(() => {
    if (!lastLife || !myTurn) return;
    playSound('heart');
    const id = window.setInterval(() => playSound('heart'), 1150);
    return () => window.clearInterval(id);
  }, [lastLife, myTurn]);
  const frac = m.turnEndsAt ? Math.min(1, turnLeft / (m.turnSeconds * 1000)) : 0;
  const cur = m.players[m.current];
  const alive = m.players.filter((p) => !p.eliminated).length;

  const leave = async () => {
    setConfirmLeave(false);
    try {
      await exit();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const subscribe = useMemo(() => subscribeReactions ?? (() => () => undefined), [subscribeReactions]);
  const canReact = !!react && mySeat !== null;
  const [reactCool, setReactCool] = useState(false);
  useAutoClear(reactCool, () => setReactCool(false), 1000);
  const quickReact = (e: Reaction) => {
    if (!react || reactCool) return;
    react(e);
    setReactCool(true);
    playSound('pop');
  };

  const status = useMemo(() => {
    if (m.phase === 'finished') return { text: 'Maç bitti', tone: 'done' };
    if (meP?.eliminated) return { text: `Elendin; maçı izliyorsun. Sıra: ${cur.username}`, tone: 'spect' };
    if (myTurn) {
      if (tool === 'sonar') return { text: 'Sonar: taranacak alanın ortasına dokun', tone: 'sonar' };
      if (tool === 'defuse') return { text: sel === null ? 'İmha: mayın olan kareyi seç' : 'Emin misin? Tekrar dokun', tone: 'defuse' };
      if (tool === 'flag') return { text: 'Bayrak: şüpheli karelere dokun', tone: 'go' };
      return {
        text: sel === null ? (m.mode === 'chain' && m.allowed?.length ? 'Sıra sende: zincirdeki parlayan karelerden birini seç' : 'Sıra sende: bir kare seç') : `Seçili: ${cellName(m.size, sel)}. Açmak için tekrar dokun`,
        tone: 'go',
      };
    }
    if (mySeat === null) return { text: `İzleyici · sıra: ${cur.username}`, tone: 'spect' };
    return { text: `Sıra: ${cur.username}${tool === 'flag' ? ' · bayrak koyabilirsin' : ''}`, tone: 'wait' };
  }, [m.phase, meP, myTurn, sel, cur, m.size, mySeat, m.mode, m.allowed, tool]);

  const sonarLeft = meP?.sonar ?? 0;

  const menuActions = useMemo((): RadialAction[] => {
    if (menu === null) return [];
    const i = menu;
    const flagged = flags.has(i);
    const blocked = !!(allowedSet && !allowedSet.has(i));
    const sMine = sonarMines.has(i);
    const flag: RadialAction = {
      id: 'flag',
      icon: flagged ? '🏳️' : '🚩',
      label: flagged ? 'Kaldır' : 'Bayrak',
      tone: 'flag',
      onClick: () => {
        toggleFlag(i);
        setMenu(null);
      },
    };
    if (!myTurn) return [flag];
    const open: RadialAction = {
      id: 'open',
      icon: '⛏️',
      label: flagged ? 'Bayraklı' : sMine ? 'Mayın!' : blocked ? 'Zincir dışı' : 'Aç',
      tone: 'open',
      disabled: flagged || sMine || blocked || busy,
      onClick: () => tryOpen(i, 'open'),
    };
    const out: RadialAction[] = [flag];
    if (m.mode === 'hunter') out.push({ id: 'defuse', icon: '🎯', label: 'İmha', tone: 'defuse', disabled: blocked || busy, onClick: () => tryOpen(i, 'defuse') });
    out.push(open);
    if (scan && m.mode !== 'blitz')
      out.push({
        id: 'sonar',
        icon: '📡',
        label: 'Sonar',
        tone: 'sonar',
        badge: sonarLeft,
        disabled: sonarLeft <= 0 || busy,
        onClick: () => {
          setMenu(null);
          void doScan(i);
        },
      });
    // Güçler de kare menüsünde (tahtanın altında ayrı çubuk yok). Hakkı biten güç menüden kalkar.
    if (hintsLeft > 0)
      out.push({
        id: 'hint',
        icon: '💡',
        label: 'İpucu',
        tone: 'hint',
        badge: hintsLeft,
        disabled: busy,
        onClick: () => {
          setMenu(null);
          fireHint();
        },
      });
    if (power && (meP?.smoke ?? 0) > 0)
      out.push({
        id: 'smoke',
        icon: '🌫️',
        label: 'Duman',
        tone: 'smoke',
        badge: meP?.smoke ?? 0,
        disabled: busy,
        onClick: () => {
          setMenu(null);
          void usePowerUp('smoke');
        },
      });
    if (power && (meP?.freeze ?? 0) > 0 && m.turnEndsAt && !frozenNow)
      out.push({
        id: 'freeze',
        icon: '❄️',
        label: 'Dondur',
        tone: 'freeze',
        badge: meP?.freeze ?? 0,
        disabled: busy,
        onClick: () => {
          setMenu(null);
          void usePowerUp('freeze');
        },
      });
    return out;
  }, [menu, flags, allowedSet, sonarMines, myTurn, busy, m.mode, scan, sonarLeft, toggleFlag, tryOpen, doScan, hintsLeft, fireHint, power, meP, m.turnEndsAt, frozenNow, usePowerUp]);

  // Kalan mayın göstergesi: toplam − patlayan − imha edilen − benim bayraklarım.
  const knownMines = useMemo(() => m.cells.reduce((n, v) => n + (v === 9 || v === 11 ? 1 : 0), 0), [m.cells]);
  const minesLeft = m.mineCount - knownMines - new Set([...flags, ...sonarMines]).size;
  const selectedReady = myTurn && sel !== null && (tool === 'open' || tool === 'defuse') && !busy;
  const playing = m.phase === 'playing';
  const card = useMemo(() => {
    if (m.phase !== 'finished') return [];
    const out: { icon: string; label: string; value: string }[] = [];
    if (mySeat !== null) {
      if (flagStats.total) out.push({ icon: '🚩', label: 'Bayrak isabeti', value: `${flagStats.right}/${flagStats.total}` });
      out.push({ icon: '🔥', label: 'En uzun seri', value: `${maxStreak.current}` });
      out.push({ icon: '⚡', label: 'Şimşek hamle', value: `${lightning.current}` });
      if (m.bonusTotal) out.push({ icon: '🎁', label: 'Bonus kutusu', value: `${(m.bonusFound ?? []).filter((b) => b.seat === mySeat).length}` });
      out.push({ icon: '💡', label: 'İpucu', value: usedHint.current ? 'Kullandın' : 'Kullanmadın' });
    }
    if (oracle.total) out.push({ icon: '🔮', label: 'Doğru tahmin', value: `${oracle.right}/${oracle.total}` });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.phase, m.id, flagStats, oracle]);
  const activeMe = playing && meP && !meP.eliminated;

  return (
    <div className={`ar-root ascreen match tier--${m.tier}${shake ? ` is-shaking is-shaking--${shake}` : ''}${myTurn ? ' is-myturn' : ''}${myTurn && secsLeft <= 5 ? ' is-hurry' : ''}${lastLife ? ' is-lastlife' : ''}${frozenNow ? ' is-frozen' : ''}`}>
      {flash ? <div key={flash.key} className={`mflash mflash--${flash.tone}`} aria-hidden="true" /> : null}
      {/* Üst bar: tek satır, telefonda taşmaz. Solda çıkış, ortada mod (+ bonus sayacı), sağda kalan mayın ve ödül. */}
      <header className="mh2" title={m.tableName}>
        {playing && meP ? (
          <button type="button" className="mh2__exit" aria-label="Masadan çık" title="Masadan çık" onClick={() => (meP.eliminated ? void leave() : setConfirmLeave(true))}>
            <ExitIcon size={20} />
          </button>
        ) : null}
        <div className={`mh2__mode mode--${m.mode}`}>
          <span className="mh2__modeic" aria-hidden="true">
            <ModeIcon mode={m.mode} size={18} />
          </span>
          <b>{MODES[m.mode].name}</b>
          {m.mode === 'treasure' ? (
            <small>
              <ChestIcon size={13} /> {m.chestsFound.length}/{m.chestTotal}
            </small>
          ) : null}
          {m.bonusTotal ? <small title="Bulunan / toplam bonus kutusu">🎁 {m.bonusFound?.length ?? 0}/{m.bonusTotal}</small> : null}
        </div>
        <span className={`mh2__pill mh2__mines${minesLeft < 0 ? ' is-neg' : ''}`} title="Kalan mayın (bayraklarını düşerek)">
          <MineIcon size={16} />
          <b>{minesLeft}</b>
        </span>
        {practice ? null : (
          <span className="mh2__pill mh2__pool" title="Ödül havuzu">
            <CoinIcon size={18} />
            <b>{fmt(m.prizePool)}</b>
          </span>
        )}
      </header>

      <div className={`pstrip pstrip--${m.players.length}`}>
        {m.players.map((p) => (
          <PlayerChip key={p.userId} p={p} m={m} isMe={p.seat === mySeat} hurt={hurtSeat === p.seat} mood={moods[p.seat]?.mood ?? null} fire={fire[p.seat] ?? 0} />
        ))}
      </div>

      {selectedReady ? (
        <button type="button" className={`mstatus mstatus--cta${tool === 'defuse' ? ' mstatus--defusecta' : ''}`} onClick={() => sel !== null && tryOpen(sel, tool === 'defuse' ? 'defuse' : 'open')}>
          <span>{tool === 'defuse' ? 'Mayını imha et' : 'Kareyi aç'} ✓</span>
          {m.turnEndsAt ? (
            <span className="mtimer" aria-label={`${secsLeft} saniye`}>
              <i style={{ transform: `scaleX(${frac})` }} className={secsLeft <= 5 ? 'is-low' : ''} />
              <b>{secsLeft}</b>
            </span>
          ) : null}
        </button>
      ) : (
        <div className={`mstatus mstatus--${status.tone}`} role="status">
          <span>{status.text}</span>
          {playing && m.turnEndsAt ? (
            <span className="mtimer" aria-label={`${secsLeft} saniye`}>
              <i style={{ transform: `scaleX(${frac})` }} className={secsLeft <= 5 ? 'is-low' : ''} />
              <b>{secsLeft}</b>
            </span>
          ) : null}
        </div>
      )}

      <div
        className={`mboard${tool !== 'open' && playing ? ` is-tool-${tool}` : ''}${cellPx > fit ? ' is-zoomed' : ''}`}
        ref={wrap}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('.mgrid, .mradial, .mzoom')) setMenu(null);
        }}
      >
        <div className="mscroll" ref={scroller}>
        <BoardGrid
          size={m.size}
          cells={m.cells}
          owners={m.mode === 'territory' || m.mode === 'treasure' ? m.owners : null}
          chests={chestSet}
          hiddenChests={ghostChests}
          allowed={allowedSet}
          myTurn={myTurn}
          cellPx={cellPx}
          selected={sel}
          last={m.lastMove && m.lastMove.index >= 0 ? m.lastMove.index : null}
          lastKind={m.lastMove?.kind ?? null}
          boom={boom}
          interactive={canAct}
          flags={flags}
          sonarMines={sonarMines}
          sonarSafe={sonarSafe}
          aim={m.aim && m.aim.turnNo === m.turnNo && m.phase === 'playing' ? m.aim : null}
          ping={ping}
          overlay={overlay}
          done={doneSet}
          bonusAt={bonusAt}
          bonusGhost={bonusGhost}
          hint={hint}
          finished={m.phase === 'finished'}
          onCell={onCell}
          onLong={onLong}
          onFlag={toggleFlag}
        />
        </div>
        {menu !== null ? <RadialMenu index={menu} wrap={wrap} actions={menuActions} onGone={() => setMenu(null)} /> : null}
        {fogged ? (
          <div key={fogUntil} className="msmoke" aria-label="Duman: tahta birkaç saniye görünmüyor" role="img">
            <i />
            <i />
            <i />
            <i />
            <b>🌫️ Duman!</b>
          </div>
        ) : null}

        {banner ? (
          <div key={banner.key} className={`mbanner mbanner--${banner.tone}`}>
            {banner.text}
          </div>
        ) : null}
        {err ? (
          <p className="mtoast" role="alert" onClick={() => setErr(null)}>
            {err}
          </p>
        ) : null}
      </div>

      {activeMe ? (
        // Alt panel: güç düğmeleri yok (hepsi kare menüsünde). Yerine seri göstergesi, tek dokunuşla emoji ve yakınlaştırma.
        <nav className="mdock" aria-label="Seri ve emoji">
          <StreakMeter n={fire[mySeat!] ?? 0} zap={lightning.current} myTurn={myTurn} />
          {canReact ? (
            <div className="mdock__emo">
              {QUICK_EMOJI.map((e) => (
                <button key={e} type="button" className="mdock__q" aria-label={`${e} gönder`} disabled={reactCool} onClick={() => quickReact(e)}>
                  <ReactionGlyph r={e} size={30} />
                </button>
              ))}
              <ReactionTray onSend={(e) => react!(e)} avatar={meP.avatar ?? 0} docked />
            </div>
          ) : null}
          {fit < 34 ? (
            <button type="button" className={`mdock__zoom${zoom > 1.01 ? ' is-on' : ''}`} aria-label={zoom > 1.01 ? 'Tahtayı sığdır' : 'Yakınlaştır'} onClick={() => zoomTo(zoom > 1.01 ? 1 : Math.max(autoZoom, Math.min(maxZoom, 30 / fit)))}>
              {zoom > 1.01 ? '🔍−' : '🔍+'}
            </button>
          ) : null}
        </nav>
      ) : playing && ((meP?.eliminated && elimCard === 'closed') || mySeat === null) ? (
        <nav className="mbar mbar--spect">
          <div className="mguess" role="group" aria-label="Sıradaki hamleyi tahmin et">
            <small>
              <EyeIcon size={14} /> {cur.username} ne açacak? {oracle.total ? <b>🔮 {oracle.right}/{oracle.total}</b> : null}
            </small>
            <div>
              {(['safe', 'mine'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`mguess__btn mguess__btn--${g}${guess?.g === g ? ' is-on' : ''}`}
                  disabled={!!guess}
                  onClick={() => {
                    playSound('click');
                    setGuess({ turnNo: m.turnNo, seat: m.current, g });
                  }}
                >
                  {g === 'safe' ? '✅ Güvenli' : '💥 Mayın'}
                </button>
              ))}
            </div>
          </div>
          {canReact && meP ? <ReactionTray onSend={(e) => react!(e)} avatar={meP.avatar ?? 0} docked /> : null}
          <button type="button" className="mbar__btn mbar__exit" onClick={() => void leave()} aria-label={meP ? 'Çık' : 'İzlemeyi bırak'}>
            <ExitIcon size={20} />
            <span>Çık</span>
          </button>
        </nav>
      ) : null}

      {subscribeReactions ? <ReactionLayer subscribe={subscribe} avatarOf={(seat) => m.players[seat]?.avatar ?? 0} onMood={(seat, md) => setMood(seat, md, 2600)} /> : null}
      <FxCanvas />

      {elimCard === 'shown' && iAmOut ? (
        <div className="melim" role="dialog" aria-modal="true" aria-label="Elendin">
          <div className="melim__panel">
            <div className="melim__icon">
              <SeaMine lit size={64} />
            </div>
            <h2>Elendin</h2>
            <p className="amuted">
              {meP?.eliminationReason === 'afk' ? 'Üst üste süre aştın.' : 'Canların bitti.'} {alive} oyuncu hâlâ masada.
              {practice ? '' : ' Sonucun maç bitince kesinleşir; beklemek zorunda değilsin.'}
            </p>
            <div className="melim__btns">
              <button type="button" className="abtn abtn--primary abtn--lg" onClick={() => setElimCard('closed')}>
                <EyeIcon size={18} /> İzlemeye devam
              </button>
              <button type="button" className="abtn abtn--ghost abtn--lg" onClick={() => void leave()}>
                <ExitIcon size={18} /> Masadan çık
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {m.phase === 'finished' ? <MatchResult m={m} meId={meId} now={now} practice={practice} weeklyRank={weeklyRank} onLobby={onLobby} onAgain={onAgain} badges={badges} card={card} /> : null}

      {confirmLeave ? (
        <Sheet
          title="Masadan çıkmak istiyor musun?"
          onClose={() => setConfirmLeave(false)}
          footer={
            <>
              <button type="button" className="abtn abtn--ghost" onClick={() => setConfirmLeave(false)}>
                Vazgeç
              </button>
              <button type="button" className="abtn abtn--danger" onClick={() => void leave()}>
                Çık ve elen
              </button>
            </>
          }
        >
          <p>{practice ? 'Antrenman maçından çıkarsan bu maç sona erer.' : 'Maç sürerken çıkarsan elenirsin; giriş ücretin iade edilmez ve haftalık puandan erken eleme cezası düşülür. Diğer oyuncular devam eder.'}</p>
        </Sheet>
      ) : null}
    </div>
  );
}
