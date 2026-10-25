import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactionEvent } from '../protocol';
import { TIERS, TIER_ORDER, boardFor } from '../economy';
import type { TierId } from '../economy';
import type { BotLevel } from '../bot';
import { PracticeGame } from '../practice';
import type { PracticeOptions } from '../practice';
import { ArenaHttpError } from '../client';
import { BackIcon } from './icons';
import { MatchScreen } from './MatchScreen';
import { Seg } from './Sheet';
import { CharacterPicker } from './CharacterPicker';
import { ModePicker } from './ModeUi';
import { isMode } from '../modes';
import { DENSITY, OPTION_CHOICES, minesForTable } from '../tableOptions';
import type { Density } from '../tableOptions';

const KEY = 'mine-duel:arena:practice';
function loadOpts(): PracticeOptions {
  const d: PracticeOptions = { tier: 'bronze', mode: 'classic', opponents: 2, level: 'medium', name: '', avatar: 0, turnSeconds: 20 };
  try {
    const v = { ...d, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}') } as PracticeOptions;
    if (!isMode(v.mode)) v.mode = 'classic';
    return v;
  } catch {
    return d;
  }
}

function Running({ opts, onExit, onAgain }: { opts: PracticeOptions; onExit(): void; onAgain(): void }) {
  const game = useMemo(() => new PracticeGame(opts), [opts]);
  useEffect(() => () => game.dispose(), [game]);
  const subscribe = useCallback((fn: (e: ReactionEvent) => void) => game.onReact(fn), [game]);
  const view = useSyncExternalStore(
    (fn) => game.subscribe(fn),
    () => game.view(),
  );
  return (
    <MatchScreen
      m={view}
      meId="me"
      practice
      now={() => Date.now()}
      move={async (i, action) => {
        try {
          game.move(i, action);
        } catch (e) {
          throw new ArenaHttpError((e as { code?: string }).code ?? 'server-error', 400);
        }
      }}
      scan={async (i) => {
        try {
          return game.scan(i);
        } catch (e) {
          throw new ArenaHttpError((e as { code?: string }).code ?? 'server-error', 400);
        }
      }}
      power={async (k) => {
        try {
          return game.power(k);
        } catch (e) {
          throw new ArenaHttpError((e as { code?: string }).code ?? 'server-error', 400);
        }
      }}
      exit={() => {
        game.quit();
        onExit();
      }}
      react={(e) => game.react(e)}
      subscribeReactions={subscribe}
      onLobby={onExit}
      onAgain={onAgain}
    />
  );
}

/** Sunucu gerektirmeyen antrenman masası (botlara karşı). */
export function Practice({ onExit, intro }: { onExit(): void; intro?: string }) {
  const [opts, setOpts] = useState<PracticeOptions>(loadOpts);
  const [run, setRun] = useState(0);
  const set = (p: Partial<PracticeOptions>) => setOpts((o) => ({ ...o, ...p }));

  if (run > 0) return <Running key={run} opts={opts} onExit={() => setRun(0)} onAgain={() => setRun((r) => r + 1)} />;

  const start = () => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(opts));
    } catch {
      /* yok say */
    }
    setRun(1);
  };
  const t = TIERS[opts.tier];
  return (
    <div className="ar-root ascreen practice">
      <button type="button" className="aback" onClick={onExit}>
        <BackIcon size={18} /> Geri
      </button>
      <header className="ahead">
        <h1>Antrenman masası</h1>
        <p className="amuted">{intro ?? 'Botlara karşı, sunucusuz. Kurallar gerçek masalarla aynı; para ve sıralama puanı yok.'}</p>
      </header>
      <section className="apanel">
        <div className="afgroup">
          <h3>Oyun modu</h3>
          <ModePicker value={opts.mode} onChange={(m) => set({ mode: m })} />
        </div>
        <div className="afgroup">
          <h3>Masa</h3>
          <Seg label="Masa" value={opts.tier} onChange={(v) => set({ tier: v as TierId })} options={TIER_ORDER.map((id) => ({ v: id, label: TIERS[id].label }))} />
          <p className="asmall amuted">
            {boardFor(t, opts.opponents + 1).size}×{boardFor(t, opts.opponents + 1).size} alan, {minesForTable(t, boardFor(t, opts.opponents + 1).size, opts.opponents + 1, opts.density ?? 'normal')} mayın
          </p>
        </div>
        <div className="afgroup">
          <h3>Rakip sayısı</h3>
          <Seg label="Rakip" value={opts.opponents} onChange={(v) => set({ opponents: v as 1 | 2 | 3 })} options={[{ v: 1, label: '1 bot (düello)' }, { v: 2, label: '2 bot (3 kişilik)' }, { v: 3, label: '3 bot (4 kişilik)' }]} />
        </div>
        <div className="afgroup">
          <h3>Bot seviyesi</h3>
          <Seg label="Seviye" value={opts.level} onChange={(v) => set({ level: v as BotLevel })} options={[{ v: 'easy', label: 'Kolay' }, { v: 'medium', label: 'Orta' }, { v: 'hard', label: 'Zor' }]} />
        </div>
        <div className="afgroup">
          <h3>Mayın yoğunluğu</h3>
          <Seg label="Yoğunluk" value={opts.density ?? 'normal'} onChange={(v) => set({ density: v as Density })} options={OPTION_CHOICES.density.map((d) => ({ v: d, label: DENSITY[d].label }))} />
        </div>
        <div className="afgroup">
          <h3>Can</h3>
          <Seg label="Can" value={opts.lives ?? 3} onChange={(v) => set({ lives: v as number })} options={OPTION_CHOICES.lives.map((l) => ({ v: l, label: '♥'.repeat(l) }))} />
        </div>
        <div className="afgroup">
          <h3>Tur süresi</h3>
          <Seg label="Tur süresi" value={opts.turnSeconds} onChange={(v) => set({ turnSeconds: v as number })} options={[{ v: 10, label: '10 sn' }, { v: 20, label: '20 sn' }, { v: 30, label: '30 sn' }, { v: 0, label: 'Süresiz' }]} />
        </div>
        <div className="afgroup">
          <h3>Bonus kutuları</h3>
          <Seg label="Bonus kutuları" value={opts.bonuses === false ? 0 : 1} onChange={(v) => set({ bonuses: v === 1 })} options={[{ v: 1, label: '🎁 Açık' }, { v: 0, label: 'Kapalı' }]} />
        </div>
        <label className="afield">
          <span>Adın</span>
          <input maxLength={16} value={opts.name} placeholder="Sen" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <CharacterPicker value={opts.avatar} onChange={(i) => set({ avatar: i })} />
      </section>
      <button type="button" className="abtn abtn--gold abtn--xl" onClick={start}>
        Antrenmanı başlat
      </button>
    </div>
  );
}
