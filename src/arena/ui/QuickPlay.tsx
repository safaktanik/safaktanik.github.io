import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import { TIERS, TIER_ORDER } from '../economy';
import type { TierId } from '../economy';
import { Money, Spinner, TierBadge, msToClock, useArena, useTick } from './common';
import { Seg, Sheet } from './Sheet';
import { BoltIcon } from './icons';
import { ModePicker } from './ModeUi';
import type { ArenaMode } from '../modes';
import { isMode } from '../modes';

const PREF_KEY = 'mine-duel:arena:quick';
function loadPref(): { tier: TierId | 'any'; maxFee: number; mode?: ArenaMode } {
  try {
    const v = JSON.parse(window.localStorage.getItem(PREF_KEY) ?? 'null');
    if (v && typeof v.maxFee === 'number') return v;
  } catch {
    /* yok say */
  }
  return { tier: 'any', maxFee: 500 };
}

/** Eşleştirme tercihi: oyuncu istemediği yüksek ücretli masaya yerleştirilmez (üst sınır). */
export function QuickPlaySheet({ onClose, presetTier, presetMode }: { onClose(): void; presetTier?: TierId; presetMode?: ArenaMode }) {
  const s = useArena();
  const me = s.me!;
  const pref = loadPref();
  const [tier, setTier] = useState<TierId | 'any'>(presetTier ?? pref.tier);
  const [mode, setMode] = useState<ArenaMode>(presetMode ?? (isMode(pref.mode) ? pref.mode : 'classic'));
  const [maxFee, setMaxFee] = useState<number>(presetTier ? TIERS[presetTier].fee : pref.maxFee);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ tier, maxFee, mode }));
    } catch {
      /* yok say */
    }
    try {
      await arenaClient().request({ t: 'quick.start', tier, maxFee, mode });
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const fees = [100, 500, 1500, 5000];
  return (
    <Sheet
      title="Hemen oyna"
      onClose={onClose}
      footer={
        <button type="button" className="abtn abtn--gold abtn--lg" disabled={busy} onClick={() => void go()}>
          {busy ? <Spinner /> : <BoltIcon size={18} />} Eşleşme ara
        </button>
      }
    >
      <div className="afgroup">
        <h3>Oyun modu</h3>
        <ModePicker value={mode} onChange={setMode} />
      </div>
      <div className="afgroup">
        <h3>Masa türü</h3>
        <Seg label="Masa türü" value={tier} onChange={(v) => setTier(v)} options={[{ v: 'any', label: 'Fark etmez' }, ...TIER_ORDER.map((t) => ({ v: t, label: TIERS[t].label }))]} />
      </div>
      <div className="afgroup">
        <h3>En fazla ödeyeceğim giriş ücreti</h3>
        <Seg label="Üst sınır" value={maxFee} onChange={(v) => setMaxFee(v)} options={fees.map((f) => ({ v: f, label: `≤ ${f.toLocaleString('tr-TR')}` }))} />
        <p className="asmall amuted">
          Bakiyen <Money value={me.balance} size={13} />. Bu sınırın ve bakiyenin üstündeki masalara asla yerleştirilmezsin. Uygun masa yoksa senin için herkese açık bir masa açılır ya da (oyun sunucusunda) eşleşme kuyruğuna alınırsın.
        </p>
      </div>
      {err ? <p className="aerror" role="alert">{err}</p> : null}
    </Sheet>
  );
}

export function Searching() {
  const s = useArena();
  const q = s.queue!;
  useTick(500);
  const [busy, setBusy] = useState(false);
  const elapsed = Date.now() - q.since;
  return (
    <div className="ar-root ascreen searching">
      <div className="radar" aria-hidden="true">
        <i className="radar__sweep" />
        <i className="radar__ring" />
        <i className="radar__ring radar__ring--2" />
        <i className="radar__blip" />
      </div>
      <h1>Rakip aranıyor…</h1>
      <div className="apanel searching__info">
        <div><span>Masa türü</span><TierBadge tier={q.tier} /></div>
        <div><span>Giriş ücreti</span><Money value={q.entryFee} /></div>
        <div><span>Kuyrukta bekleyen</span><b>{q.waitingPlayers} / {q.capacity}</b></div>
        <div><span>Geçen süre</span><b>{msToClock(elapsed)}</b></div>
      </div>
      <p className="amuted asmall center">Giriş ücreti yalnızca bir masaya oturduğunda alınır. İptal edersen hiçbir ücret kesilmez.</p>
      <button
        type="button"
        className="abtn abtn--ghost abtn--lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await arenaClient().request({ t: 'quick.cancel' });
          } finally {
            setBusy(false);
          }
        }}
      >
        İptal
      </button>
    </div>
  );
}
