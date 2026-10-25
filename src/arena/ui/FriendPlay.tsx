import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import type { ArenaMode } from '../modes';
import type { TableView } from '../protocol';
import { ModePicker } from './ModeUi';
import { Seg, Sheet } from './Sheet';
import { Spinner } from './common';

/** Arkadaşla oyna: özel oda kur (kod üretir) ya da arkadaşının kodunu girip katıl. */
export function FriendPlaySheet({ onClose, start = 'create' }: { onClose(): void; start?: 'create' | 'join' }) {
  const c = arenaClient();
  const [tab, setTab] = useState<'create' | 'join'>(start);
  const [mode, setMode] = useState<ArenaMode>('classic');
  const [cap, setCap] = useState<2 | 3 | 4>(2);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const me = c.state.me;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await c.request<TableView>({ t: 'table.create', tier: 'bronze', mode, capacity: cap, name: `${me?.username ?? 'Arkadaş'} odası`.slice(0, 24), private: true });
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      await c.joinByCode!(code);
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Arkadaşınla oyna"
      onClose={onClose}
      footer={
        tab === 'create' ? (
          <button type="button" className="abtn abtn--gold abtn--lg" disabled={busy} onClick={() => void create()}>
            {busy ? <Spinner /> : null} Oda kur ve kodu al
          </button>
        ) : (
          <button type="button" className="abtn abtn--gold abtn--lg" disabled={busy || code.length !== 4} onClick={() => void join()}>
            {busy ? <Spinner /> : null} Odaya katıl
          </button>
        )
      }
    >
      <div className="aseg friendtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'is-on' : ''} onClick={() => setTab('create')}>
          Oda kur
        </button>
        <button type="button" role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'is-on' : ''} onClick={() => setTab('join')}>
          Kodla katıl
        </button>
      </div>
      {tab === 'create' ? (
        <>
          <p className="amuted asmall">Özel bir oda kurulur ve 4 haneli bir kod alırsın. Kodu (ya da davet linkini) arkadaşına gönder; o "Kodla katıl" ile gelir. Oda lobide görünmez.</p>
          <div className="afgroup">
            <h3>Kaç kişi?</h3>
            <Seg label="Kişi sayısı" value={cap} onChange={(v) => setCap(v as 2 | 3 | 4)} options={[{ v: 2, label: '2 · düello' }, { v: 3, label: '3 kişi' }, { v: 4, label: '4 kişi' }]} />
            <p className="asmall amuted">3–4 kişide boş koltuklara bot oturtabilirsin. Giriş ücreti: Bronz masa (100 DUEL COIN).</p>
          </div>
          <div className="afgroup">
            <h3>Mod</h3>
            <ModePicker value={mode} onChange={setMode} />
          </div>
        </>
      ) : (
        <>
          <p className="amuted asmall">Arkadaşının sana gönderdiği 4 haneli oda kodunu yaz.</p>
          <label className="afield codefield">
            <span>Oda kodu</span>
            <input inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} value={code} placeholder="1234" autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
        </>
      )}
      {err ? <p className="aerror">{err}</p> : null}
    </Sheet>
  );
}
