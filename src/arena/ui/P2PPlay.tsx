import { useCallback, useEffect, useRef, useState } from 'react';
import { setBackend } from '../backend';
import { HostedBackend } from '../hosted/hostedBackend';
import { hostRoom, isRoomCode, joinRoom, myRoomCode, resetRoomCode } from '../p2p/room';
import type { RoomError, RoomSession } from '../p2p/room';
import { playSound } from '../../audio/sound';
import { BackIcon } from './icons';
import { LogoMark } from './art';
import { PackIcon } from './PackIcon';
import { Spinner } from './common';
import { Tables } from './ArenaApp';

const ERR: Record<RoomError, string> = {
  'peer-lib': 'Bağlantı bileşeni yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.',
  network: 'Bağlantı sunucusuna ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.',
  'unavailable-id': 'Bu oda kodu şu an başka bir sekmede ya da cihazda açık görünüyor. Birkaç saniye sonra tekrar dene ya da yeni kod al.',
  'peer-unavailable': 'Bu kodla açık bir oda bulunamadı. Kodu kontrol et; odayı kuran kişinin oyun sayfası açık ve ekranı açık olmalı (telefon kilitlenirse oda duraklar).',
  closed: 'Oda kapandı.',
  timeout: 'Bağlantı zaman aşımına uğradı. İnternet bağlantını kontrol edip tekrar dene.',
  unknown: 'Bağlanılamadı. Tekrar dene.',
};
const errOf = (e: unknown): RoomError => ((e as { type?: RoomError })?.type && (e as { type: RoomError }).type in ERR ? (e as { type: RoomError }).type : 'unknown');

/** Davet linki: aynı HTML sayfası + oda kodu (#oda=KOD). Dosyadan açıldıysa link verilemez, yalnızca kod. */
export function roomLink(code: string): string | null {
  const { protocol, origin, pathname } = window.location;
  if (protocol !== 'https:' && protocol !== 'http:') return null;
  return `${origin}${pathname}#oda=${code}`;
}
export function codeFromHash(): string | null {
  const m = /(?:^|[#&])oda=([A-Za-z0-9]{5})/.exec(window.location.hash);
  return m ? m[1].toUpperCase() : null;
}

async function invite(code: string): Promise<string> {
  const url = roomLink(code);
  const text = `Mine Duel odama gel! Oda kodu: ${code}`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  try {
    if (nav.share && url) {
      await nav.share({ title: 'Mine Duel', text, url });
      return 'Davet gönderildi.';
    }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return '';
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return url ? 'Davet linki kopyalandı; mesajla gönder.' : 'Kod kopyalandı.';
  } catch {
    return `Kodu arkadaşına söyle: ${code}`;
  }
}

type Phase = { k: 'menu' } | { k: 'connecting'; role: 'host' | 'guest'; code: string } | { k: 'ready' } | { k: 'lost' };

/**
 * Arkadaşlarla oyna (eşler arası oda). Bir kişi odayı kurar (onun tarayıcısı küçük bir sunucu olur),
 * diğerleri 5 haneli kodla ya da davet linkiyle katılır. Sonra masalar, para, sıralama… hepsi bu odada.
 */
export function P2PPlay({ initialCode, onExit, onPractice }: { initialCode?: string | null; onExit(): void; onPractice(): void }) {
  const [phase, setPhase] = useState<Phase>({ k: 'menu' });
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState(initialCode ?? '');
  const [gen, setGen] = useState(0);
  const [peers, setPeers] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const sess = useRef<RoomSession | null>(null);
  const backend = useRef<HostedBackend | null>(null);
  const retry = useRef<number | null>(null);
  const alive = useRef(true);
  const [hostCode, setHostCode] = useState(myRoomCode);

  const teardown = () => {
    if (retry.current) window.clearTimeout(retry.current);
    retry.current = null;
    backend.current?.stop();
    backend.current = null;
    sess.current?.close();
    sess.current = null;
  };
  useEffect(
    () => () => {
      alive.current = false;
      delete document.documentElement.dataset.room;
      teardown();
    },
    [],
  );

  const connect = useCallback(async (role: 'host' | 'guest', c: string, quiet = false) => {
    if (!quiet) {
      setErr(null);
      setPhase({ k: 'connecting', role, code: c });
    }
    try {
      const s = role === 'host' ? await hostRoom(c) : await joinRoom(c);
      if (!alive.current) return s.close();
      teardown();
      sess.current = s;
      const b = new HostedBackend(s.db, s.uid, { p2p: true }, s.room);
      backend.current = b;
      setBackend(b);
      b.start();
      s.onPeers((n) => {
        setPeers(n);
        playSound('seat');
      });
      s.onLost(() => {
        if (!alive.current || sess.current !== s) return;
        setPhase({ k: 'lost' });
        scheduleRetry(c);
      });
      setPeers(s.peers());
      setGen((g) => g + 1);
      setPhase({ k: 'ready' });
      if (role === 'guest') {
        try {
          history.replaceState(null, '', `#oda=${c}`);
        } catch {
          /* yok say */
        }
      }
    } catch (e) {
      if (!alive.current) return;
      if (quiet) return scheduleRetry(c);
      setErr(ERR[errOf(e)]);
      setPhase({ k: 'menu' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Katılan: oda kuranla bağlantı koparsa birkaç saniyede bir yeniden dene. */
  const scheduleRetry = (c: string) => {
    if (retry.current) window.clearTimeout(retry.current);
    retry.current = window.setTimeout(() => {
      retry.current = null;
      if (document.visibilityState === 'visible') void connect('guest', c, true);
      else scheduleRetry(c);
    }, 3000);
  };

  // Oda kuranın ekranı kendiliğinden kararmasın (kilitlenirse oda duraklar). iOS 16.4+ / Chrome destekler.
  useEffect(() => {
    if (phase.k !== 'ready' || sess.current?.role !== 'host') return;
    type WL = { release(): Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WL> } };
    let lock: WL | null = null;
    const get = () => {
      if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => (lock = l), () => undefined);
    };
    get();
    document.addEventListener('visibilitychange', get);
    return () => {
      document.removeEventListener('visibilitychange', get);
      void lock?.release().catch(() => undefined);
    };
  }, [phase.k]);

  // Linkle gelindiyse doğrudan katıl.
  useEffect(() => {
    if (initialCode && isRoomCode(initialCode)) void connect('guest', initialCode);
  }, [initialCode, connect]);

  // Ekran yeniden açılınca kopmuş bağlantıyı hemen dene.
  useEffect(() => {
    const v = () => {
      if (document.visibilityState === 'visible' && phase.k === 'lost' && sess.current?.role === 'guest') void connect('guest', sess.current.code, true);
    };
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, [phase.k, connect]);

  const leave = () => {
    teardown();
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      /* yok say */
    }
    onExit();
  };

  if ((phase.k === 'ready' || phase.k === 'lost') && sess.current) {
    document.documentElement.dataset.room = '1';
    const s = sess.current;
    document.documentElement.dataset.roomCode = s.code;
    return (
      <>
        <div className={`roombar${phase.k === 'lost' ? ' is-lost' : ''}`} title={s.role === 'host' ? 'Odayı sen kurdun: bu sayfa açık kaldıkça oda açık kalır.' : undefined}>
          <span className="roombar__dot" />
          <span className="roombar__txt">
            Oda <b>{s.code}</b>
            {s.role === 'host' ? <> · {peers} kişi bağlı</> : phase.k === 'lost' ? ' · bağlantı koptu, yeniden bağlanılıyor…' : ' · bağlı'}
          </span>
          <button type="button" className="roombar__btn" onClick={() => void invite(s.code).then((m) => setMsg(m || null))}>
            <PackIcon name="icon_friend" size={18} /> Davet
          </button>
        </div>
        {msg ? (
          <p className="roombar__msg" onClick={() => setMsg(null)}>
            {msg}
          </p>
        ) : null}
        <Tables key={gen} onExit={leave} onPractice={onPractice} />
      </>
    );
  }

  delete document.documentElement.dataset.room;
  delete document.documentElement.dataset.roomCode;
  const busy = phase.k === 'connecting';
  return (
    <div className="ar-root ascreen p2p">
      <button type="button" className="aback" onClick={onExit}>
        <BackIcon size={18} /> Ana ekran
      </button>
      <header className="p2p__hero">
        <LogoMark size={96} />
        <div>
          <h1>Arkadaşlarla oyna</h1>
          <p className="amuted">Biri odayı kurar, diğerleri kodla katılır. Hesap ya da kurulum yok; Wi-Fi’de de mobil veride de çalışır.</p>
        </div>
      </header>

      <section className="p2p__card">
        <h2>
          <PackIcon name="icon_home" size={28} /> Oda kur
        </h2>
        <p className="asmall amuted">Senin oda kodun her zaman aynı kalır; arkadaşların linki bir kez kaydetsin yeter.</p>
        <div className="p2p__code">{hostCode.split('').map((d, i) => <i key={i}>{d}</i>)}</div>
        <button type="button" className="abtn abtn--gold abtn--xl" disabled={busy} onClick={() => void connect('host', hostCode)}>
          {busy && phase.role === 'host' ? <Spinner /> : null} Odayı aç
        </button>
        <button type="button" className="linkbtn asmall" disabled={busy} onClick={() => setHostCode(resetRoomCode())}>
          Yeni kod al
        </button>
      </section>

      <section className="p2p__card">
        <h2>
          <PackIcon name="icon_friend" size={28} /> Odaya katıl
        </h2>
        <label className="afield codefield">
          <span>Oda kodu (5 karakter)</span>
          <input
            value={code}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCDE"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
          />
        </label>
        <button type="button" className="abtn abtn--primary abtn--xl" disabled={busy || !isRoomCode(code)} onClick={() => void connect('guest', code)}>
          {busy && phase.role === 'guest' ? <Spinner /> : null} Katıl
        </button>
      </section>

      {busy ? <p className="amuted center">{phase.role === 'host' ? 'Oda açılıyor…' : 'Odaya bağlanılıyor…'}</p> : null}
      {err ? <p className="aerror">{err}</p> : null}

      <details className="p2p__help">
        <summary>Nasıl çalışır?</summary>
        <ul className="asmall">
          <li>Odayı kuran telefonun tarayıcısı oyunun “sunucusu” olur; masalar, profiller ve DUEL COIN orada tutulur.</li>
          <li>Odayı kuran kişi oyun sırasında sayfayı açık tutmalı. Diğerlerinin bağlantısı koparsa oyun kendiliğinden yeniden bağlanır.</li>
          <li>Wi-Fi ya da mobil veri fark etmez: bağlantı güvenli bir aktarma sunucusu üzerinden kurulur.</li>
          <li>Oda kuran telefonun ekranı kilitlenirse ya da Safari arka plana atılırsa oda duraklar; geri açınca arkadaşlar kendiliğinden yeniden bağlanır.</li>
        </ul>
      </details>
    </div>
  );
}
