import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Detected } from '../detect';
import { playSound } from '../../audio/sound';
import { LogoMark } from './art';
import { CHARACTERS, Character } from './characters';
import { Spinner } from './common';
import { SoundButton } from './SoundButton';
import { FeedbackSheet, feedbackAvailable } from './Feedback';

const SEEN_KEY = 'mine-duel:howto-seen';
export function howtoSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}
function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* yok say */
  }
}

/**
 * Açılış ekranı: logo, oyun adı ve tek bir büyük OYNA düğmesi (ekrana kaydırmadan sığar).
 * Arkadaşlarla oyna, antrenman, masalar… hepsi OYNA'dan sonra gelen ana menüde (Savaş sekmesi).
 */
export function Intro({ detected, onPlay }: { detected: Detected | null; onPlay(): void }) {
  const [howto, setHowto] = useState<null | 'first' | 'manual'>(null);
  const [fb, setFb] = useState(false);
  const go = () => {
    playSound('go');
    if (!howtoSeen()) return setHowto('first');
    onPlay();
  };
  return (
    <div className="ar-root intro intro2">
      <div className="intro2__tools">
        <SoundButton />
      </div>
      <div className="intro__inner intro2__inner">
        <div className="intro__stage intro2__stage">
          <LogoMark size={210} />
          <div className="intro__crew" aria-hidden="true">
            {[1, 0, 4, 6, 2].map((id, i) => (
              <span key={id} style={{ ['--i' as string]: i }}>
                <Character id={id} size={i === 2 ? 64 : 52} mood={i === 2 ? 'happy' : 'idle'} />
              </span>
            ))}
          </div>
        </div>
        <h1 className="intro__title">
          Mine <span>Duel</span>
        </h1>
        <p className="intro__tag">Ortak mayın tarlası. Sırayla kare aç, rakiplerine emojiyle laf at, son kalan sen ol.</p>
        <button type="button" className="abtn abtn--gold abtn--xl intro__play" onClick={go} disabled={detected === null}>
          {detected === null ? (
            <>
              <Spinner /> Hazırlanıyor…
            </>
          ) : (
            'OYNA'
          )}
        </button>
        <div className="intro2__links">
          <button type="button" className="linkbtn" onClick={() => setHowto('manual')}>
            Nasıl oynanır?
          </button>
          {feedbackAvailable() ? (
            <button type="button" className="linkbtn" onClick={() => setFb(true)}>
              💌 Görüşünü yaz
            </button>
          ) : null}
        </div>
      </div>
      {fb ? <FeedbackSheet onClose={() => setFb(false)} /> : null}
      {howto ? (
        <HowTo
          onClose={() => {
            markSeen();
            const first = howto === 'first';
            setHowto(null);
            if (first) onPlay();
          }}
          finishLabel={howto === 'first' ? 'Hadi oynayalım' : 'Anladım'}
        />
      ) : null}
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => <span className="howto2__emoji">{children}</span>;

/** Tanıtım kartları: her kart tek konu; parmakla sağa / sola kaydırılır. */
const CARDS: { icon: ReactNode; title: string; text: string; chips?: string[] }[] = [
  {
    icon: <Big>💣</Big>,
    title: 'Ortak tarla, sırayla hamle',
    text: 'Herkes aynı tahtada oynar. Sıran gelince bir kareye dokun: çevresinde yuvarlak bir menü açılır. Aynı kareye tekrar dokunmak da açar. Sayılar çevredeki 8 karede kaç mayın olduğunu gösterir.',
    chips: ['⛏️ Aç', '🚩 Bayrak', '🏝️ Güvenli adayla başlar'],
  },
  {
    icon: <Big>❤️</Big>,
    title: '3 can + kalkan',
    text: 'İlk bastığın mayını kalkanın karşılar. Sonra her mayın bir can götürür; canı biten elenir. Masada ayakta kalan son oyuncu kazanır; tahta biterse en az mayına basan. Sonuna kadar elenmezsen puan kaybetmezsin.',
    chips: ['🛡️ Kalkan', '❤️❤️❤️'],
  },
  {
    icon: <Big>✨</Big>,
    title: 'Güçler kare menüsünde',
    text: 'Sıra sendeyken bir kareye dokun; güçlerin de menüde çıkar. Hakkı biten güç menüden kalkar.',
    chips: ['📡 Sonar: 3×3 alandaki mayınları gösterir', '💡 İpucu: kesin güvenli kare', '🌫️ Duman: rakibin tahtası 5 sn sis', '❄️ Dondur: turuna ek süre'],
  },
  {
    icon: <Big>🎁</Big>,
    title: 'Bonus, seri ve şimşek',
    text: 'Tahtada gizli bonus kutuları var: kalkan, sonar, can ya da ekstra tur. Üst üste güvenli hamleler alttaki 🔥 seri barını doldurur; sıran gelir gelmez açarsan ⚡ şimşek hamle sayılır.',
    chips: ['🔥 Seri ×3 ×5 ×8', '⚡ Şimşek'],
  },
  {
    icon: <Big>🃏</Big>,
    title: 'Okey usulü masalar',
    text: 'Masa aç, kuralları sen belirle: giriş ücreti, oyuncu sayısı, tur süresi ve güçler. Arkadaşlarını kodla çağır ya da boş koltuklara bot oturt. Herkes HAZIRIM deyince maç başlar.',
    chips: ['👥 2–4 kişi', '👁 İzle', '🔗 Davet linki'],
  },
  {
    icon: <Character id={1} size={64} mood="happy" />,
    title: 'Emoji at, karakterini seç',
    text: 'Maç sırasında alttaki emojilere tek dokunuşla rakiplerine laf at. Karakter sekmesinden kendine yeni bir karakter seç; bazıları seviye atladıkça açılır.',
    chips: ['😂 😱 👏', `${CHARACTERS.length} karakter`],
  },
];

/** Nasıl oynanır: parmakla kaydırılan kart dizisi (iOS / Android'de doğal kaydırma, PC'de düğmeler). */
export function HowTo({ onClose, finishLabel = 'Anladım' }: { onClose(): void; finishLabel?: string }) {
  const [page, setPage] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const last = page === CARDS.length - 1;
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPage(Math.max(0, Math.min(CARDS.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))))));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(page + 1);
      if (e.key === 'ArrowLeft') goTo(page - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const goTo = (p: number) => {
    const el = track.current;
    const n = Math.max(0, Math.min(CARDS.length - 1, p));
    setPage(n);
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="ar-root asheet howto2" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="asheet__panel howto2__panel" role="dialog" aria-modal="true" aria-label="Nasıl oynanır?">
        <header className="asheet__head">
          <h2>Nasıl oynanır?</h2>
          <button type="button" className="aicon" aria-label="Kapat" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="howto2__track" ref={track} aria-roledescription="kaydırılabilir kartlar">
          {CARDS.map((c, k) => (
            <section key={c.title} className="howto2__card" aria-label={`${k + 1}/${CARDS.length}: ${c.title}`} aria-hidden={k !== page}>
              <div className="howto2__icon">{c.icon}</div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
              {c.chips ? (
                <div className="howto2__chips">
                  {c.chips.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
        <div className="howto2__dots" role="tablist" aria-label={`${page + 1}/${CARDS.length}`}>
          {CARDS.map((c, k) => (
            <button key={c.title} type="button" role="tab" aria-selected={k === page} aria-label={`${k + 1}. kart`} className={k === page ? 'is-on' : ''} onClick={() => goTo(k)} />
          ))}
        </div>
        <p className="howto2__swipe" aria-hidden="true">
          {page === 0 ? '← parmağınla kaydır →' : ' '}
        </p>
        <footer className="asheet__foot">
          <button type="button" className="abtn abtn--ghost" onClick={page === 0 ? onClose : () => goTo(page - 1)}>
            {page === 0 ? 'Geç' : 'Geri'}
          </button>
          <button type="button" className="abtn abtn--primary" onClick={last ? onClose : () => goTo(page + 1)}>
            {last ? finishLabel : 'İleri'}
          </button>
        </footer>
      </div>
    </div>
  );
}
