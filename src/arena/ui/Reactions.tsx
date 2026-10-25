import { useEffect, useRef, useState } from 'react';
import { ART_EMOJIS, EMOJIS, STICKERS } from '../protocol';
import { PACK } from './packArt';
import type { PackKey } from './packArt';
import type { Reaction, ReactionEvent } from '../protocol';
import { playSound } from '../../audio/sound';
import { SmileIcon } from './art';
import { Character } from './characters';
import type { Mood } from './characters';

const COOLDOWN_MS = 1000;

/** Çıkartma: karakterin ifadesi ve söylediği laf. */
export const STICKER_INFO: Record<(typeof STICKERS)[number], { mood: Mood; text: string }> = {
  'st:laugh': { mood: 'happy', text: 'Ha ha ha!' },
  'st:taunt': { mood: 'cool', text: 'Sıra sende, bas bakalım!' },
  'st:cool': { mood: 'cool', text: 'Çocuk oyuncağı.' },
  'st:love': { mood: 'love', text: 'Bravo, güzel hamle!' },
  'st:angry': { mood: 'angry', text: 'Grrr!' },
  'st:shock': { mood: 'shock', text: 'Eyvah!' },
  'st:cry': { mood: 'cry', text: 'Olamaz…' },
  'st:win': { mood: 'win', text: 'Kazanan belli!' },
};
export const isSticker = (r: string): r is (typeof STICKERS)[number] => r.startsWith('st:');
const ART_LABEL: Record<string, string> = {
  laughing: 'Gülüyor', happy: 'Mutlu', celebrating: 'Kutlama', victory: 'Zafer', confident: 'Kendinden emin', well_played: 'İyi oyun', good_luck: 'Bol şans', rematch: 'Rövanş',
  thinking: 'Düşünüyor', suspicious: 'Şüpheli', confused: 'Kafası karışık', surprised: 'Şaşkın', oops: 'Hay aksi', worried: 'Endişeli', disappointed: 'Hayal kırıklığı', frustrated: 'Sinirli',
};
/** Emojiyi çiz: paket emojisi görsel, diğerleri metin. */
export function ReactionGlyph({ r, size }: { r: string; size: number }) {
  if (r.startsWith('ex:')) {
    const k = r.slice(3);
    return <img src={PACK[`emoji_${k}` as PackKey]} width={size} height={size} alt={ART_LABEL[k] ?? k} draggable={false} />;
  }
  return <>{r}</>;
}

/** Ekranın sağ kenarında açılıp kapanan emoji / çıkartma menüsü. */
export function ReactionTray({ onSend, avatar, disabled = false, docked = false }: { onSend(e: Reaction): void; avatar: number; disabled?: boolean; docked?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'sticker'>('emoji');
  const [cool, setCool] = useState(false);
  useEffect(() => {
    if (!cool) return;
    const id = window.setTimeout(() => setCool(false), COOLDOWN_MS);
    return () => window.clearTimeout(id);
  }, [cool]);
  const send = (e: Reaction) => {
    onSend(e);
    setCool(true);
    setOpen(false); // gönderince kapanır; tahtayı kapatmasın
  };
  return (
    <div className={`rtray${open ? ' is-open' : ''}${docked ? ' rtray--docked' : ''}`}>
      <div className="rtray__panel" role="menu" aria-label="Emoji gönder" aria-hidden={!open}>
        <div className="rtray__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'emoji'} className={tab === 'emoji' ? 'is-on' : ''} tabIndex={open ? 0 : -1} onClick={() => setTab('emoji')}>
            Emoji
          </button>
          <button type="button" role="tab" aria-selected={tab === 'sticker'} className={tab === 'sticker' ? 'is-on' : ''} tabIndex={open ? 0 : -1} onClick={() => setTab('sticker')}>
            Çıkartma
          </button>
        </div>
        {tab === 'emoji' ? (
          <div className="rtray__grid">
            {ART_EMOJIS.map((e, i) => (
              <button key={e} type="button" role="menuitem" className="rtray__emo rtray__emo--art" style={{ ['--i' as string]: i }} tabIndex={open ? 0 : -1} disabled={disabled || cool} aria-label={`${ART_LABEL[e.slice(3)]} gönder`} title={ART_LABEL[e.slice(3)]} onClick={() => send(e)}>
                <ReactionGlyph r={e} size={34} />
              </button>
            ))}
            {EMOJIS.map((e, i) => (
              <button key={e} type="button" role="menuitem" className="rtray__emo" style={{ ['--i' as string]: i }} tabIndex={open ? 0 : -1} disabled={disabled || cool} aria-label={`${e} gönder`} onClick={() => send(e)}>
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="rtray__grid rtray__grid--st">
            {STICKERS.map((st, i) => (
              <button key={st} type="button" role="menuitem" className="rtray__st" style={{ ['--i' as string]: i }} tabIndex={open ? 0 : -1} disabled={disabled || cool} aria-label={STICKER_INFO[st].text} onClick={() => send(st)}>
                <Character id={avatar} size={40} mood={STICKER_INFO[st].mood} animate={false} />
                <small>{STICKER_INFO[st].text}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {docked ? (
        <button type="button" className={`mbar__btn${open ? ' is-on' : ''}`} aria-expanded={open} aria-label={open ? 'Emojileri kapat' : 'Emojileri aç'} onClick={() => setOpen((o) => !o)}>
          {open ? <span className="rtray__x">×</span> : <SmileIcon size={26} />}
          <span>Emoji</span>
        </button>
      ) : (
        <button type="button" className="rtray__toggle" aria-expanded={open} aria-label={open ? 'Emojileri kapat' : 'Emojileri aç'} onClick={() => setOpen((o) => !o)}>
          {open ? <span className="rtray__x">×</span> : <SmileIcon size={24} />}
        </button>
      )}
    </div>
  );
}

interface Flying {
  id: string;
  emoji: Reaction;
  seat: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rot: number;
}

/**
 * Gelen emojiler: gönderenin oyuncu kartından çıkar, büyüyerek tahtanın üstüne süzülür, sallanır ve kaybolur.
 * Çıkartmalarda gönderenin karakteri konuşma balonuyla belirir.
 */
export function ReactionLayer({ subscribe, avatarOf, onMood }: { subscribe(fn: (e: ReactionEvent) => void): () => void; avatarOf(seat: number): number; onMood?(seat: number, mood: Mood): void }) {
  const [items, setItems] = useState<Flying[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, { emoji: Reaction; key: string }>>({});
  const timers = useRef<number[]>([]);
  const moodRef = useRef(onMood);
  moodRef.current = onMood;

  useEffect(() => {
    const off = subscribe((e) => {
      const chip = document.querySelector<HTMLElement>(`.pchip[data-seat="${e.seat}"]`);
      const board = document.querySelector<HTMLElement>('.mboard');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const r = chip?.getBoundingClientRect();
      const b = board?.getBoundingClientRect();
      const x0 = r ? r.left + r.width / 2 : vw / 2;
      const y0 = r ? r.top + r.height / 2 : 80;
      const cx = b ? b.left + b.width / 2 : vw / 2;
      const cy = b ? b.top + Math.min(b.height, vh - b.top) * 0.42 : vh / 2;
      const x1 = cx + (Math.random() - 0.5) * Math.min(160, vw * 0.3);
      const y1 = cy + (Math.random() - 0.5) * 80;
      const f: Flying = { id: `${e.id}-${Math.random().toString(36).slice(2, 6)}`, emoji: e.emoji, seat: e.seat, x0, y0, x1, y1, rot: (Math.random() - 0.5) * 40 };
      const sticker = isSticker(e.emoji);
      setItems((xs) => [...xs.slice(-7), f]);
      if (!sticker) setBubbles((bs) => ({ ...bs, [e.seat]: { emoji: e.emoji, key: f.id } }));
      if (sticker) moodRef.current?.(e.seat, STICKER_INFO[e.emoji as (typeof STICKERS)[number]].mood);
      playSound('pop');
      timers.current.push(
        window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== f.id)), sticker ? 2700 : 2100),
        window.setTimeout(() => setBubbles((bs) => (bs[e.seat]?.key === f.id ? Object.fromEntries(Object.entries(bs).filter(([k]) => Number(k) !== e.seat)) : bs)), 2600),
      );
    });
    return () => {
      off();
      for (const t of timers.current) window.clearTimeout(t);
    };
  }, [subscribe]);

  return (
    <>
      <div className="rfly-layer" aria-live="polite">
        {items.map((f) => {
          const style = { ['--x0' as string]: `${f.x0}px`, ['--y0' as string]: `${f.y0}px`, ['--x1' as string]: `${f.x1}px`, ['--y1' as string]: `${f.y1}px`, ['--rot' as string]: `${f.rot}deg` };
          if (isSticker(f.emoji)) {
            const info = STICKER_INFO[f.emoji];
            return (
              <span key={f.id} className="rfly rfly--st" style={style}>
                <Character id={avatarOf(f.seat)} size={58} mood={info.mood} />
                <b>{info.text}</b>
              </span>
            );
          }
          return (
            <span key={f.id} className="rfly" style={style}>
              <ReactionGlyph r={f.emoji} size={44} />
            </span>
          );
        })}
      </div>
      <BubblePortal bubbles={bubbles} />
    </>
  );
}

/** Oyuncu kartlarının üstünde küçük emoji balonları (kart konumuna göre sabit konumlu). */
function BubblePortal({ bubbles }: { bubbles: Record<number, { emoji: Reaction; key: string }> }) {
  const entries = Object.entries(bubbles);
  if (!entries.length) return null;
  return (
    <>
      {entries.map(([seat, b]) => {
        const chip = document.querySelector<HTMLElement>(`.pchip[data-seat="${seat}"]`);
        const r = chip?.getBoundingClientRect();
        if (!r) return null;
        return (
          <span key={b.key} className="rbubble" style={{ left: r.left + r.width - 14, top: r.top - 10 }}>
            <ReactionGlyph r={b.emoji} size={24} />
          </span>
        );
      })}
    </>
  );
}
