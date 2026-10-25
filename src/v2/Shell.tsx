/**
 * Mine Duel 2 — ana kabuk: üst çubuk (ayarlar, seviye, DUEL COIN) + sekme içeriği + alt sekme çubuğu.
 * Masalar, mağaza, karakter ve sıralama mevcut ekranları kullanır; görünümleri v2 temasından gelir.
 */
import { useState } from 'react';
import type { ArenaMode } from '../arena/modes';
import { arenaClient, errorText } from '../arena/client';
import { useArena } from '../arena/ui/common';
import { Leaderboard } from '../arena/ui/Leaderboard';
import { Lobby } from '../arena/ui/Lobby';
import type { LobbyNav } from '../arena/ui/Lobby';
import { Profile } from '../arena/ui/Profile';
import { Settings } from '../arena/ui/Settings';
import { Shop } from '../arena/ui/Shop';
import { Quests } from '../arena/ui/Quests';
import { todaysQuests } from '../arena/quests';
import { playSound } from '../audio/sound';
import type { View } from '../arena/ui/ArenaApp';
import { BattleHome } from './BattleHome';
import { TabBar, TopBar } from './ui';
import type { Tab } from './ui';

const TAB_OF: Record<View, Tab> = { battle: 'battle', lobby: 'battle', shop: 'shop', profile: 'hero', leaderboard: 'rank', settings: 'battle', quests: 'quests' };
const VIEW_OF: Record<Tab, View> = { battle: 'battle', shop: 'shop', hero: 'profile', rank: 'leaderboard', quests: 'quests' };

export function Shell({ view, setView, onExit, onPractice, onFriends, onPuzzle, onCreate, onQuickSheet }: { view: View; setView(v: View): void; onExit(): void; onPractice(): void; onFriends?(): void; onPuzzle?(): void; onCreate(): void; onQuickSheet(): void }) {
  const s = useArena();
  const me = s.me!;
  const c = arenaClient();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const xpFrac = (me.xp - me.xpLevelStart) / Math.max(1, me.xpNext - me.xpLevelStart);

  const quick = async (mode: ArenaMode) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    playSound('go');
    try {
      await c.request({ t: 'quick.start', tier: 'any', mode });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const nav = (n: LobbyNav) => {
    if (n === 'create') return onCreate();
    if (n === 'quick') return onQuickSheet();
    if (n === 'exit') return setView('battle');
    if (n === 'practice') return onPractice();
    setView(n);
  };

  let page;
  switch (view) {
    case 'lobby':
      page = <Lobby onNav={nav} />;
      break;
    case 'leaderboard':
      page = <Leaderboard onBack={() => setView('battle')} />;
      break;
    case 'profile':
      page = <Profile onBack={() => setView('battle')} />;
      break;
    case 'shop':
      page = <Shop onBack={() => setView('battle')} />;
      break;
    case 'settings':
      page = <Settings onBack={() => setView('battle')} onExit={onExit} />;
      break;
    case 'quests':
      page = <Quests onPuzzle={onPuzzle} />;
      break;
    default:
      page = <BattleHome me={me} onQuick={(m) => void quick(m)} onTables={() => setView('lobby')} onCreate={onCreate} onPractice={onPractice} onFriends={onFriends} onPuzzle={onPuzzle} onHero={() => setView('profile')} />;
  }
  // tamamlanıp ödülü alınmamış görev varsa sekmede ünlem
  const questAlert = !!c.grantReward && todaysQuests().some((q) => q.complete && !(c.claimedKeys?.() ?? []).includes(q.key));
  return (
    <div className={`shell2 shell2--${view}`}>
      <TopBar coins={me.balance} level={me.level} xpFrac={xpFrac} onSettings={() => setView('settings')} onCoins={() => setView('shop')} />
      <main className="shell2__main">
        {err ? (
          <p className="aerror shell2__err" role="alert" onClick={() => setErr(null)}>
            {err}
          </p>
        ) : null}
        {page}
      </main>
      <TabBar tab={TAB_OF[view]} onTab={(t) => setView(VIEW_OF[t])} alerts={{ shop: me.dailyAvailable || me.rescueAvailable, quests: questAlert }} />
    </div>
  );
}
