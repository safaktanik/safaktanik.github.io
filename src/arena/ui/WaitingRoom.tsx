import { useEffect, useRef, useState } from 'react';
import { arenaClient, errorText } from '../client';
import { ECONOMY, payoutText } from '../economy';
import { matchSettings, turnSeconds } from '../rules';
import { playSound } from '../../audio/sound';
import { Avatar, LevelBadge, Money, TierBadge, useArena, useTick } from './common';
import { ExitIcon, GridIcon, LockIcon, MineIcon, PlusIcon, UserIcon } from './icons';
import { ModeBadge, RulesSheet } from './ModeUi';
import { MODES } from '../modes';
import { PackIcon } from './PackIcon';
import { shareInvite } from '../share';

export function WaitingRoom() {
  const s = useArena();
  const t = s.table!;
  const me = s.me!;
  const c = arenaClient();
  useTick(200);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prevCount = useRef(t.players.length);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (t.players.length > prevCount.current) playSound('seat');
    prevCount.current = t.players.length;
  }, [t.players.length]);

  const left = t.countdownEndsAt ? Math.max(0, t.countdownEndsAt - c.serverNow()) : null;
  const secs = left === null ? null : Math.ceil(left / 1000);
  useEffect(() => {
    if (secs === null) {
      lastTick.current = null;
      return;
    }
    if (secs !== lastTick.current) {
      lastTick.current = secs;
      playSound(secs <= 0 ? 'go' : 'tick');
    }
  }, [secs]);

  const free = t.maxPlayers - t.players.length;
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const invite = async () => {
    const r = await shareInvite(t.code ?? null);
    setInviteMsg(r === 'copied' ? 'Davet metni ve link panoya kopyalandı; mesajla gönderebilirsin.' : r === 'shared' ? 'Davet gönderildi. Arkadaşın linki açıp "Kodla katıl"a kodu yazacak.' : `Kodu arkadaşına söyle: ${t.code}`);
  };
  const [rules, setRules] = useState(false);
  const canBots = c.kind === 'hosted' && t.ownerId === me.id && t.status === 'waiting' && !!c.addBot;
  const botAct = async (what: 'add' | 'remove') => {
    setBusy(true);
    setErr(null);
    try {
      if (what === 'add') await c.addBot!(t.id);
      else await c.removeBot!(t.id);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    setErr(null);
    try {
      await c.request({ t: 'table.leave' });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`ar-root ascreen waiting tier--${t.tier}`}>
      <header className="wr__head">
        <div>
          <span className="wr__badges">
            <TierBadge tier={t.tier} />
            <ModeBadge mode={t.mode} />
          </span>
          <h1>
            {t.locked ? <LockIcon size={18} /> : null} {t.name}
          </h1>
          <p className="amuted asmall">{t.status === 'countdown' ? 'Masa doldu!' : `${free} boş koltuk · oyuncular bekleniyor`}</p>
        </div>
        <button type="button" className="abtn abtn--ghost" onClick={() => void leave()} disabled={busy}>
          <ExitIcon size={18} /> Masadan ayrıl
        </button>
      </header>
      {t.code && c.kind === 'hosted' && !c.local ? (
        <section className="roomcode" aria-label="Oda kodu">
          <div>
            <span className="amuted asmall">{t.private ? 'Özel oda kodu' : 'Oda kodu'}</span>
            <b className="roomcode__n">{t.code.split('').map((d, i) => <i key={i}>{d}</i>)}</b>
          </div>
          <button type="button" className="abtn abtn--gold" onClick={() => void invite()}>
            <PackIcon name="icon_friend" size={22} /> Davet et
          </button>
          {inviteMsg ? <p className="asmall amuted roomcode__msg">{inviteMsg}</p> : null}
        </section>
      ) : null}
      <p className="wr__mode">
        {MODES[t.mode].short}{' '}
        <button type="button" className="linkbtn" onClick={() => setRules(true)}>
          Kurallar
        </button>
      </p>
      {canBots ? (
        <div className="wr__bots">
          <button type="button" className="abtn abtn--primary" disabled={busy || free === 0} onClick={() => void botAct('add')}>
            <PlusIcon size={18} /> Boş koltuğa bot oturt
          </button>
          <button type="button" className="abtn abtn--ghost" disabled={busy || !t.players.some((p) => p.userId.startsWith('bot-'))} onClick={() => void botAct('remove')}>
            Bot kaldır
          </button>
          <p className="asmall amuted">Arkadaş odasında botlar havuza para eklemez; yalnızca gerçek oyuncuların ücreti havuzdadır.</p>
        </div>
      ) : null}
      {rules ? <RulesSheet focus={t.mode} onClose={() => setRules(false)} /> : null}

      <div className={`wr__table wr__table--${t.maxPlayers}`}>
        <div className="wr__felt">
          <div className="wr__pool">
            <span className="amuted asmall">Ödül havuzu</span>
            <Money value={t.prizePool} size={22} className="money--big" />
            <span className="asmall amuted">dolunca <Money value={t.maxPrizePool} size={12} /></span>
          </div>
        </div>
        {Array.from({ length: t.maxPlayers }, (_, i) => {
          const p = t.players.find((x) => x.seat === i);
          return (
            <div key={i} className={`wr__seat wr__seat--${i}${p ? ' is-filled' : ''}`}>
              {p ? (
                <div className="wr__player" key={p.userId}>
                  <Avatar id={p.avatar} size={64} active={p.userId === me.id} />
                  <strong>{p.username}{p.userId === me.id ? ' (sen)' : ''}</strong>
                  <span className="wr__tags">
                    <LevelBadge level={p.level} />
                    {p.userId === t.ownerId ? <span className="wr__owner">Masa sahibi</span> : null}
                    <span className="wr__ready">Hazır</span>
                  </span>
                </div>
              ) : (
                <div className="wr__empty">
                  <span className="wr__emptyav"><UserIcon size={26} /></span>
                  <span className="amuted asmall">Bekleniyor…</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <dl className="wr__info apanel">
        <div><dt>Giriş ücreti</dt><dd><Money value={t.entryFee} /></dd></div>
        <div><dt>Toplam havuz</dt><dd><Money value={t.maxPrizePool} /></dd></div>
        <div><dt><GridIcon size={14} /> Oyun alanı</dt><dd>{t.boardSize}×{t.boardSize}</dd></div>
        <div><dt><MineIcon size={14} /> Mayın</dt><dd>{t.mineCount}</dd></div>
        <div><dt>Kapasite</dt><dd>{t.maxPlayers} kişi</dd></div>
        {t.options ? (
          <>
            <div><dt>Tur süresi</dt><dd>{turnSeconds(t.mode, t.options)} sn</dd></div>
            <div><dt>Can</dt><dd>{matchSettings(t.mode, t.options).lives}</dd></div>
            <div><dt>Kalkan · Sonar</dt><dd>{matchSettings(t.mode, t.options).shields} · {matchSettings(t.mode, t.options).sonars}</dd></div>
            <div><dt>Bonus kutuları</dt><dd>{t.options.bonuses !== false ? '🎁 Açık' : 'Kapalı'}</dd></div>
          </>
        ) : null}
        <div><dt>Hazır oyuncu</dt><dd>{t.players.length} / {t.maxPlayers}</dd></div>
      </dl>
      <p className="poolnote">
        Havuz = {Math.round(t.maxPrizePool / Math.max(1, t.entryFee))} × <Money value={t.entryFee} size={12} /> = <Money value={t.maxPrizePool} size={12} />
        {ECONOMY.houseFeePercent ? ` − %${ECONOMY.houseFeePercent} işletim payı` : ''}. {payoutText(t.maxPlayers)} Başlamadan ayrılırsan ücretin iade edilir.
      </p>
      {err ? <p className="aerror">{err}</p> : null}

      {secs !== null ? (
        <div className="countdown" role="status" aria-live="assertive">
          <span key={secs} className="countdown__n">{secs > 0 ? secs : 'OYUN BAŞLIYOR!'}</span>
        </div>
      ) : null}
    </div>
  );
}
