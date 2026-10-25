/**
 * Mine Duel 2 — "Savaş" sekmesi (ana menü): karakter kaidede, mod seçimi, büyük OYNA düğmesi
 * ve masa sistemine (101 Okey tarzı) kısayollar.
 */
import { useState } from 'react';
import type { Me } from '../arena/protocol';
import type { ArenaMode } from '../arena/modes';
import { MODES, MODE_ORDER } from '../arena/modes';
import { arenaClient } from '../arena/client';
import { playSound } from '../audio/sound';
import { Btn, Chibi } from './ui';
import { BotIcon, FriendsIcon, PlayIcon, PlusIcon, TablesIcon } from './icons';

const MODE_EMOJI: Record<ArenaMode, string> = { classic: '💣', blitz: '⚡', hunter: '🎯', territory: '🗺️', treasure: '💰', chain: '⛓️' };

export function BattleHome({ me, onQuick, onTables, onCreate, onPractice, onFriends, onHero }: { me: Me; onQuick(mode: ArenaMode): void; onTables(): void; onCreate(): void; onPractice(): void; onFriends?(): void; onHero(): void }) {
  const [mode, setMode] = useState<ArenaMode>(() => {
    try {
      const v = window.localStorage.getItem('mine-duel:v2-mode') as ArenaMode | null;
      return v && (MODE_ORDER as readonly string[]).includes(v) ? v : 'classic';
    } catch {
      return 'classic';
    }
  });
  const pick = (m: ArenaMode) => {
    setMode(m);
    playSound('click');
    try {
      window.localStorage.setItem('mine-duel:v2-mode', m);
    } catch {
      /* yok say */
    }
  };
  const c = arenaClient();
  const where = c.p2p ? 'Arkadaş odası' : c.local ? 'Çevrimdışı · botlarla' : c.label;
  return (
    <div className="bh2">
      <div className="bh2__stage">
        <span className="bh2__where">{where}</span>
        <button type="button" className="bh2__hero" onClick={onHero} aria-label="Karakterini değiştir">
          <Chibi id={me.avatar} size={150} pose="idle" />
        </button>
        <div className="bh2__name">
          <strong>{me.username}</strong>
          <small>
            {me.wins} galibiyet · haftalık {me.weeklyPoints} puan
          </small>
        </div>
      </div>

      <div className="bh2__modes" role="radiogroup" aria-label="Oyun modu">
        {MODE_ORDER.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`bh2__mode mode--${m}${mode === m ? ' is-on' : ''}`} onClick={() => pick(m)}>
            <span aria-hidden="true">{MODE_EMOJI[m]}</span>
            {MODES[m].name}
          </button>
        ))}
      </div>
      <p className="bh2__modeinfo">{MODES[mode].short}</p>

      <Btn tone="yellow" size="xl" className="bh2__play" onClick={() => onQuick(mode)}>
        <PlayIcon size={26} /> OYNA
      </Btn>

      <div className="bh2__grid">
        <button type="button" className="tile2 tile2--green" onClick={onTables}>
          <TablesIcon size={40} />
          <b>Masalar</b>
          <small>Katıl · İzle</small>
        </button>
        <button type="button" className="tile2 tile2--blue" onClick={onCreate}>
          <PlusIcon size={36} />
          <b>Masa Aç</b>
          <small>Kurallar senin</small>
        </button>
        {onFriends ? (
          <button type="button" className="tile2 tile2--purple" onClick={onFriends} aria-label="Arkadaşlarla oyna">
            <FriendsIcon size={40} />
            <b>Arkadaşlarla</b>
            <small>Oda kur / katıl</small>
          </button>
        ) : null}
        <button type="button" className="tile2 tile2--dark" onClick={onPractice}>
          <BotIcon size={40} />
          <b>Antrenman</b>
          <small>Botlara karşı</small>
        </button>
      </div>
    </div>
  );
}
