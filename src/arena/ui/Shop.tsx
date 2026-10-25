import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import { ECONOMY } from '../economy';
import { playSound } from '../../audio/sound';
import { Coin, Money, Spinner, fmt, useArena } from './common';
import { BackIcon, GiftIcon, LifebuoyIcon } from './icons';

export function Shop({ onBack }: { onBack(): void }) {
  const s = useArena();
  const me = s.me!;
  const c = arenaClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const claim = async (path: string, key: string) => {
    setBusy(key);
    setErr(null);
    setMsg(null);
    try {
      const r = await (path === '/api/rewards/daily' ? c.claimDaily() : c.claimRescue());
      playSound('coins');
      setMsg(`+${fmt(r.amount)} ${ECONOMY.currency} hesabına eklendi.`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="ar-root ascreen shop">
      <header className="ahead">
        <button type="button" className="aback" onClick={onBack}>
          <BackIcon size={18} /> Lobi
        </button>
        <h1>Ödüller</h1>
      </header>
      <div className="shop__bal apanel">
        <Coin size={40} />
        <div>
          <span className="amuted asmall">Bakiyen</span>
          <b>{fmt(me.balance)} {ECONOMY.currencyShort}</b>
        </div>
      </div>

      <article className={`offer${me.dailyAvailable ? ' is-ready' : ''}`}>
        <GiftIcon size={34} />
        <div>
          <h3>Günlük ödül</h3>
          <p className="asmall amuted">
            Her gün bir kez ({c.local ? 'bu cihazın saatiyle' : 'sunucu saatiyle'}). Seri: {me.streak} gün. Art arda gelen her gün +{ECONOMY.daily.streakBonus}, en fazla +{ECONOMY.daily.maxStreakBonus}.
          </p>
        </div>
        <button type="button" className="abtn abtn--gold" disabled={!me.dailyAvailable || busy !== null} onClick={() => void claim('/api/rewards/daily', 'daily')}>
          {busy === 'daily' ? <Spinner /> : null}
          {me.dailyAvailable ? <>Al · <Money value={me.dailyAmount} size={13} /></> : 'Yarın tekrar gel'}
        </button>
      </article>

      <article className={`offer${me.rescueAvailable ? ' is-ready' : ''}`}>
        <LifebuoyIcon size={34} />
        <div>
          <h3>Yardım paketi</h3>
          <p className="asmall amuted">Bakiyen en ucuz masanın giriş ücretinin altına düşerse günde bir kez <Money value={me.rescueAmount} size={12} /> alabilirsin.</p>
        </div>
        <button type="button" className="abtn abtn--primary" disabled={!me.rescueAvailable || busy !== null} onClick={() => void claim('/api/rewards/rescue', 'rescue')}>
          {busy === 'rescue' ? <Spinner /> : null}
          {me.rescueAvailable ? 'Al' : 'Şu an gerekmiyor'}
        </button>
      </article>

      <article className="offer offer--info">
        <Coin size={30} />
        <div>
          <h3>İlk maç ödülü</h3>
          <p className="asmall amuted">İlk maçını bitirdiğinde <Money value={ECONOMY.firstMatchBonus} size={12} /> otomatik eklenir.{c.local ? ' Maç kazanınca havuzu alırsın; 3–4 kişilik masada ikinci olursan giriş ücretin geri gelir.' : ' Haftalık sıralamada ilk 3’e girenler de ödül alır.'}</p>
        </div>
      </article>

      {msg ? <p className="aok">{msg}</p> : null}
      {err ? <p className="aerror">{err}</p> : null}
      <p className="amuted asmall center">{ECONOMY.currency} yalnızca oyun içi sanal puandır. Gerçek parayla satın alma, nakit çekme ya da oyuncular arası transfer yoktur.</p>
    </div>
  );
}
