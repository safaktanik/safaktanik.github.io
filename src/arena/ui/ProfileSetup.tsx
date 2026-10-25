import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import { ECONOMY } from '../economy';
import type { HostedBackend } from '../hosted/hostedBackend';
import { Coin, ReadOnlyNote, Spinner, fmt } from './common';
import { CharacterPicker } from './CharacterPicker';
import { STARTER_CHARACTERS } from '../characterData';
import { BackIcon } from './icons';

const LAST_KEY = 'mine-duel:last-profile';

/** Test sunucusunda ilk giriş: oyun içi ad ve avatar. Kimlik claude.ai hesabından gelir. */
export function ProfileSetup({ onExit }: { onExit(): void }) {
  // Daha önce (ör. çevrimdışı masalarda) seçilen ad ve karakter hatırlanır: arkadaş odasında tekrar yazmak gerekmez.
  const remembered = (() => {
    try {
      return JSON.parse(window.localStorage.getItem(LAST_KEY) ?? 'null') as { name?: string; avatar?: number } | null;
    } catch {
      return null;
    }
  })();
  const [name, setName] = useState(remembered?.name ?? '');
  const [avatar, setAvatar] = useState(() => (typeof remembered?.avatar === 'number' ? remembered.avatar : STARTER_CHARACTERS[Math.floor(Math.random() * STARTER_CHARACTERS.length)]));
  const [busy, setBusy] = useState(false);
  const local = !!arenaClient().local;
  const p2p = !!arenaClient().p2p;
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await (arenaClient() as HostedBackend).createProfile(name, avatar);
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify({ name: name.trim(), avatar }));
      } catch {
        /* yok say */
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ar-root ascreen practice">
      <button type="button" className="aback" onClick={onExit}>
        <BackIcon size={18} /> Ana ekran
      </button>
      <header className="ahead">
        <h1>{p2p ? 'Arkadaş odasına hoş geldin' : local ? 'Kaptan, hoş geldin' : 'Test sunucusuna hoş geldin'}</h1>
        <p className="amuted">
          {p2p ? (
            <>
              Masalarda görünecek adını ve karakterini seç. Profilin bu odayı kuran telefonda saklanır; aynı kişi odayı tekrar kurduğunda bakiyen yerinde olur. Başlangıçta <Coin size={14} /> {fmt(ECONOMY.startingBalance)} DUEL COIN alırsın.
            </>
          ) : local ? (
            <>
              Masalarda görünecek adını ve avatarını seç. Sunucu olmadığı için masalarda rakiplerin botlardır; bakiyen, mağaza ve sıralama bu cihazda saklanır. Başlangıçta <Coin size={14} /> {fmt(ECONOMY.startingBalance)} DUEL COIN alırsın.
            </>
          ) : (
            <>
              Masalarda görünecek adını ve avatarını seç. Hesabın claude.ai hesabındır; başlangıçta <Coin size={14} /> {fmt(ECONOMY.startingBalance)} test parası alırsın.
            </>
          )}
        </p>
      </header>
      <ReadOnlyNote />
      <section className="apanel">
        <label className="afield">
          <span>Oyun adın (3–16 karakter)</span>
          <input maxLength={16} value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="ör. Kaptan Ayşe" />
        </label>
        <CharacterPicker value={avatar} onChange={setAvatar} level={1} />
      </section>
      {err ? <p className="aerror">{err}</p> : null}
      <button type="button" className="abtn abtn--gold abtn--xl" disabled={busy || name.trim().length < 3} onClick={() => void save()}>
        {busy ? <Spinner /> : null} Profili oluştur
      </button>
    </div>
  );
}
