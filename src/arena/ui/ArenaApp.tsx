import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactionEvent } from '../protocol';
import { setBackend } from '../backend';
import { detectBackend } from '../detect';
import type { Detected } from '../detect';
import type { TierId } from '../economy';
import type { ArenaMode } from '../modes';
import type { ScanResult } from '../mines';
import { AuthScreen } from './AuthScreen';
import { applyMotion, loadMotion, Spinner, useArena } from './common';
import { CreateTable } from './CreateTable';
import { Intro } from './Intro';
import { P2PPlay, codeFromHash } from './P2PPlay';
import { MatchScreen } from './MatchScreen';
import { Practice } from './Practice';
import { Puzzle } from './Puzzle';
import { ProfileSetup } from './ProfileSetup';
import { QuickPlaySheet, Searching } from './QuickPlay';
import { TableRoom } from '../../v2/TableRoom';
import { Shell } from '../../v2/Shell';
import { arenaClient } from '../client';

export type View = 'battle' | 'lobby' | 'leaderboard' | 'profile' | 'shop' | 'settings' | 'quests';

/** Uygulamanın kökü: ana ekran, antrenman ve (arka uç varsa) masalar. */
export function Root() {
  const [detected, setDetected] = useState<Detected | null>(null);
  const [joinCode] = useState(codeFromHash);
  // Akış sade: açılış (OYNA) → ana menü (Savaş sekmesi). Arkadaş odası, antrenman, masalar hep ana menüden açılır.
  const [screen, setScreen] = useState<'intro' | 'tables' | 'practice' | 'p2p' | 'puzzle'>(() => {
    const q = new URLSearchParams(window.location.search);
    // Davet linkiyle (#oda=KOD) gelindiyse doğrudan arkadaş odasına.
    if (codeFromHash()) return 'p2p';
    return q.has('masalar') || q.has('menu') ? 'tables' : q.has('oda') ? 'p2p' : 'intro';
  });

  // Arkadaş odası kendi arka ucunu kurar; geç biten çevrimdışı algılama onu ezmesin
  // (davet linkiyle / sayfa yenilenince açılışta yarış oluyordu: oyuncu yanlış profil ekranına düşüyordu).
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const detect = () => {
    setDetected(null);
    void detectBackend().then((d) => {
      if (screenRef.current === 'p2p') return setDetected(d);
      if (d.kind !== 'none') {
        setBackend(d.backend);
        d.backend.start();
      }
      setDetected(d);
    });
  };
  useEffect(() => {
    applyMotion(loadMotion());
    detect();
  }, []);
  const home = () => setScreen(detected && detected.kind !== 'none' ? 'tables' : 'intro');

  if (screen === 'p2p')
    return (
      <P2PPlay
        initialCode={joinCode}
        onExit={() => {
          setScreen('tables');
          detect(); // çevrimdışı arka ucu geri getir
        }}
        onPractice={() => setScreen('practice')}
      />
    );
  if (screen === 'practice') return <Practice onExit={home} />;
  if (screen === 'puzzle') return <Puzzle onExit={home} />;
  if (screen === 'tables' && detected && detected.kind !== 'none')
    return <Tables onExit={() => setScreen('intro')} onPractice={() => setScreen('practice')} onFriends={() => setScreen('p2p')} onPuzzle={() => setScreen('puzzle')} />;
  if (screen === 'tables' && !detected)
    return (
      <div className="ar-root ascreen center">
        <Spinner />
        <p className="amuted">Hazırlanıyor…</p>
      </div>
    );
  // Sunucu yoksa (yalnızca antrenman) OYNA doğrudan botlara karşı maça götürür.
  return <Intro detected={detected} onPlay={() => setScreen(detected && detected.kind !== 'none' ? 'tables' : 'practice')} />;
}

/** Masa sistemi: ekran, sunucudan gelen duruma göre seçilir (yeniden bağlanınca doğru yere döner). */
export function Tables({ onExit, onPractice, onFriends, onPuzzle }: { onExit(): void; onPractice(): void; onFriends?(): void; onPuzzle?(): void }) {
  const s = useArena();
  const c = arenaClient();
  const [view, setView] = useState<View>('battle');
  const [sheet, setSheet] = useState<null | 'create' | 'quick'>(null);
  const [quickPreset, setQuickPreset] = useState<{ tier?: TierId; mode?: ArenaMode }>({});
  const matchId = s.match?.id ?? null;
  const reactSub = useCallback((fn: (e: ReactionEvent) => void) => c.onReact((e) => e.matchId === matchId && fn(e)), [c, matchId]);

  useEffect(() => {
    if (c.kind === 'server' && c.state.token) {
      c.refreshMe().catch(() => undefined);
      c.start();
    }
  }, [c]);

  if (c.kind === 'server' && !s.token) return <AuthScreen onExit={onExit} onPractice={onPractice} />;
  if (c.kind === 'hosted' && s.needsProfile) return <ProfileSetup onExit={onExit} />;
  if (!s.me)
    return (
      <div className="ar-root ascreen center">
        <Spinner />
        <p className="amuted">{s.conn === 'offline' ? 'Sunucuya bağlanılamıyor, yeniden deneniyor…' : 'Yükleniyor…'}</p>
      </div>
    );



  if (s.match) {
    const m = s.match;
    const subscribeReactions = reactSub;
    return (
      <MatchScreen
        m={m}
        meId={s.me.id}
        weeklyRank={s.me.weeklyRank}
        now={() => c.serverNow()}
        move={(i, action) => c.request({ t: 'move', matchId: m.id, index: i, action })}
        scan={(i) => c.request<ScanResult>({ t: 'scan', matchId: m.id, index: i })}
        exit={async () => {
          await c.leaveMatch();
          setView('battle');
        }}
        power={(kind) => c.request({ t: 'power', matchId: m.id, kind })}
        react={(e) => c.react(m.id, e)}
        subscribeReactions={subscribeReactions}
        onLobby={() => {
          c.clearMatch();
          setView('battle');
        }}
        onAgain={() => {
          c.clearMatch();
          setView('lobby');
          setQuickPreset({ tier: m.tier, mode: m.mode });
          setSheet('quick');
        }}
      />
    );
  }
  if (s.table && (s.table.status === 'waiting' || s.table.status === 'countdown')) return <TableRoom />;
  if (s.queue) return <Searching />;

  return (
    <>
      <Shell
        view={view}
        setView={setView}
        onExit={onExit}
        onPractice={onPractice}
        onFriends={onFriends}
        onPuzzle={onPuzzle}
        onCreate={() => setSheet('create')}
        onQuickSheet={() => {
          setQuickPreset({});
          setSheet('quick');
        }}
      />
      {sheet === 'create' ? <CreateTable onClose={() => setSheet(null)} /> : null}
      {sheet === 'quick' ? <QuickPlaySheet presetTier={quickPreset.tier} presetMode={quickPreset.mode} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
