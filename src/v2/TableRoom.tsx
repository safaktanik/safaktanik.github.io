/**
 * Mine Duel — bekleme odası (101 Okey tarzı): oyuncular 2.5D masanın çevresinde kaidelerinde durur,
 * herkes "HAZIRIM" der, masa dolup herkes hazır olunca 3 sn geri sayımla maç başlar.
 * Boş koltuğa dokununca davet (arkadaş odası) ya da bot oturtma (masa sahibi, çevrimdışı/test).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { arenaClient, errorText } from '../arena/client';
import { ECONOMY, TIERS } from '../arena/economy';
import { MODES } from '../arena/modes';
import { optionsOf } from '../arena/tableOptions';
import { matchSettings, turnSeconds } from '../arena/rules';
import type { Reaction, ReactionEvent } from '../arena/protocol';
import { playSound } from '../audio/sound';
import { useArena, useTick, fmt } from '../arena/ui/common';
import { ReactionGlyph, ReactionTray } from '../arena/ui/Reactions';
import { shareInvite } from '../arena/share';
import { Btn, Chibi, Panel } from './ui';
import type { Pose } from './ui';
import { CoinIcon, InviteIcon, PlusIcon } from './icons';

/** Koltuk konumları: sen her zaman önde (b), diğerleri saat yönünde masanın çevresinde. */
const SPOTS: Record<number, string[]> = {
  2: ['b', 't'],
  3: ['b', 'l', 'r'],
  4: ['b', 'l', 't', 'r'],
};

export function TableRoom() {
  const s = useArena();
  const t = s.table!;
  const me = s.me!;
  const c = arenaClient();
  useTick(250);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const prevCount = useRef(t.players.length);
  const lastSec = useRef<number | null>(null);
  const [bubbles, setBubbles] = useState<Record<number, { e: Reaction; k: string }>>({});
  const o = optionsOf(t.options);
  const mine = t.players.find((p) => p.userId === me.id);
  const iAmReady = !!mine?.ready;
  const full = t.players.length >= t.maxPlayers;
  // Hazır kontrolünü desteklemeyen sunucuda (oyun sunucusu masa dolunca 3 sn'de başlatır) herkes hazır sayılır.
  const readyKnown = t.players.some((p) => p.ready !== undefined);
  const allReady = full && (!readyKnown || t.players.every((p) => p.ready || p.bot));

  useEffect(() => {
    if (t.players.length > prevCount.current) playSound('seat');
    prevCount.current = t.players.length;
  }, [t.players.length]);

  const left = t.countdownEndsAt ? Math.max(0, t.countdownEndsAt - c.serverNow()) : null;
  const secs = left === null ? null : Math.ceil(left / 1000);
  useEffect(() => {
    if (secs === null || !allReady) return void (lastSec.current = null);
    if (secs !== lastSec.current) {
      lastSec.current = secs;
      playSound(secs <= 0 ? 'go' : 'tick');
    }
  }, [secs, allReady]);

  // bekleme odasında emoji: oyuncunun başının üstünde balon
  const lobbyId = `lobby:${t.id}`;
  const onReact = useCallback((e: ReactionEvent) => {
    const k = `${e.id}${Math.random()}`;
    setBubbles((b) => ({ ...b, [e.seat]: { e: e.emoji, k } }));
    playSound('pop');
    window.setTimeout(() => setBubbles((b) => (b[e.seat]?.k === k ? Object.fromEntries(Object.entries(b).filter(([x]) => Number(x) !== e.seat)) : b)), 2600);
  }, []);
  useEffect(() => c.onReact((e) => e.matchId === lobbyId && onReact(e)), [c, lobbyId, onReact]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const ready = (v: boolean) => {
    playSound(v ? 'go' : 'click');
    if (v) navigator.vibrate?.(20);
    void act(() => c.request({ t: 'table.ready', ready: v }));
  };
  const invite = async () => {
    const code = t.code ?? document.documentElement.dataset.roomCode ?? null;
    const r = await shareInvite(code);
    setNote(r === 'copied' ? 'Davet panoya kopyalandı; mesajla gönder.' : r === 'shared' ? 'Davet gönderildi.' : code ? `Kodu söyle: ${code}` : 'Paylaşılamadı.');
  };
  const canBots = c.kind === 'hosted' && t.ownerId === me.id && t.status === 'waiting' && !!c.addBot;
  const canInvite = !!(t.code || c.p2p);

  const spots = SPOTS[t.maxPlayers] ?? SPOTS[4];
  const pool = t.prizePool;
  const statusText = t.status === 'countdown' ? (allReady ? 'Herkes hazır!' : `Masa doldu · hazır olmayanlar ${secs ?? 0} sn içinde otomatik başlar`) : `${t.maxPlayers - t.players.length} boş koltuk · oyuncular bekleniyor`;

  return (
    <div className={`ar-root tr2 tier--${t.tier}`}>
      <header className="tr2__head">
        <Btn tone="red" size="sm" onClick={() => void act(() => c.request({ t: 'table.leave' }))} disabled={busy}>
          ✕ Ayrıl
        </Btn>
        <div className="tr2__title">
          <h1>{t.name}</h1>
          <span>
            {TIERS[t.tier].label} · {MODES[t.mode].name} · {t.boardSize}×{t.boardSize}
          </span>
        </div>
        <span className="tr2__pool" title="Ödül havuzu">
          <CoinIcon size={26} /> <b>{fmt(pool)}</b>
        </span>
      </header>

      <div className={`tr2__stage tr2__stage--${t.maxPlayers}`}>
        {/* 2.5D masa: perspektifli keçe, üstünde küçük mayın tarlası ve ortada para yığını */}
        <div className="tr2__tablewrap" aria-hidden="true">
          <div className="tr2__table">
            <div className="tr2__felt">
              <div className="tr2__mini">
                {Array.from({ length: 25 }, (_, i) => (
                  <i key={i} className={i % 7 === 3 ? 'is-open' : i === 12 ? 'is-flag' : ''} />
                ))}
              </div>
            </div>
          </div>
          <div className="tr2__stack">
            <CoinIcon size={34} />
            <CoinIcon size={34} />
            <CoinIcon size={34} />
          </div>
        </div>

        {Array.from({ length: t.maxPlayers }, (_, seat) => {
          // görünüm bana göre döner: benim koltuğum önde
          const pos = spots[(seat - (mine?.seat ?? 0) + t.maxPlayers) % t.maxPlayers];
          const p = t.players.find((x) => x.seat === seat);
          const isMe = p?.userId === me.id;
          const rdy = !!(p && (p.ready || p.bot || !readyKnown));
          const pose: Pose = !p ? 'idle' : allReady ? 'win' : rdy ? 'ready' : 'idle';
          return (
            <div key={seat} className={`tr2__seat tr2__seat--${pos}${p ? ' is-filled' : ''}${isMe ? ' is-me' : ''}`}>
              {p ? (
                <>
                  {bubbles[seat] ? (
                    <span key={bubbles[seat].k} className="tr2__bubble">
                      <ReactionGlyph r={bubbles[seat].e} size={30} />
                    </span>
                  ) : null}
                  <Chibi id={p.avatar} size={84} pose={pose} />
                  <span className="tr2__plate">
                    <b>{p.username}</b>
                    <small>Sv {p.level}{p.userId === t.ownerId ? ' · 👑' : ''}</small>
                  </span>
                  <span className={`tr2__ready${rdy ? ' is-on' : ''}`}>{rdy ? '✓ HAZIR' : '…'}</span>
                </>
              ) : (
                <button
                  type="button"
                  className="tr2__empty"
                  disabled={busy || (!canBots && !canInvite)}
                  onClick={() => (canBots ? void act(() => c.addBot!(t.id)) : void invite())}
                  aria-label={canBots ? 'Bot oturt' : 'Davet et'}
                >
                  {canBots ? <PlusIcon size={30} /> : <InviteIcon size={34} />}
                  <small>{canBots ? 'Bot oturt' : canInvite ? 'Davet et' : 'Bekleniyor'}</small>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {t.code && !c.p2p ? (
        <section className="roomcode tr2__code" aria-label="Oda kodu">
          <span>{t.private ? 'Özel oda kodu' : 'Oda kodu'}</span>
          <b className="roomcode__n">{t.code.split('').map((d, i) => <i key={i}>{d}</i>)}</b>
          <Btn tone="yellow" size="sm" onClick={() => void invite()}>
            Davet et
          </Btn>
        </section>
      ) : null}
      <Panel className="tr2__rules">
        <div className="tr2__chips">
          <span>⏱ {turnSeconds(t.mode, o)} sn</span>
          <span>❤️ {matchSettings(t.mode, o).lives}</span>
          <span>🛡️ {o.shields}</span>
          <span>📡 {t.mode === 'blitz' ? 0 : o.sonars}</span>
          <span title="Pas">⏭️ {o.passes}</span>
          {matchSettings(t.mode, o).forces ? <span title="Zorla">👉 {o.forces}</span> : null}
          {o.bonuses ? <span>🎁 Bonus</span> : null}
          <span>
            <CoinIcon size={16} /> {fmt(t.entryFee)}
          </span>
        </div>
        <p className="tr2__mode">{MODES[t.mode].short}</p>
      </Panel>

      <div className="tr2__foot">
        <p className={`tr2__status${allReady ? ' is-go' : ''}`} role="status">
          {allReady && secs !== null ? <b className="tr2__count">{Math.max(1, secs)}</b> : null}
          {statusText}
        </p>
        <div className="tr2__acts">
          <ReactionTray onSend={(e) => c.react(lobbyId, e)} avatar={me.avatar} docked />
          {!readyKnown ? (
            <Btn tone="dark" size="lg" className="tr2__readybtn" disabled>
              {full ? 'Başlıyor…' : 'Rakipler bekleniyor'}
            </Btn>
          ) : iAmReady ? (
            <Btn tone="dark" size="lg" className="tr2__readybtn" onClick={() => ready(false)} disabled={busy || allReady}>
              ✓ HAZIRSIN
            </Btn>
          ) : (
            <Btn tone="green" size="lg" className="tr2__readybtn" onClick={() => ready(true)} disabled={busy}>
              HAZIRIM!
            </Btn>
          )}
          {canInvite ? (
            <button type="button" className="ib2 ib2--yellow" aria-label="Davet et" onClick={() => void invite()}>
              <InviteIcon size={30} />
            </button>
          ) : null}
        </div>
        {canBots && t.players.some((p) => p.bot) ? (
          <button type="button" className="linkbtn tr2__rmbot" disabled={busy} onClick={() => void act(() => c.removeBot!(t.id))}>
            Bot kaldır
          </button>
        ) : null}
        {note ? <p className="tr2__note" onClick={() => setNote(null)}>{note}</p> : null}
        {err ? <p className="aerror" role="alert">{err}</p> : null}
        <p className="tr2__fine">{ECONOMY.currency} yalnızca oyun içi puandır. Maç başlamadan ayrılırsan giriş ücreti iade edilir.</p>
      </div>
    </div>
  );
}
