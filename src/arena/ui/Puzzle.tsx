import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { PUZZLE, PuzzleGame, loadPuzzleHistory, puzzleDay, puzzleFor, puzzleShareText, puzzleStreak, savePuzzleResult } from '../puzzle';
import type { PuzzleRecord } from '../puzzle';
import { recordQuest } from '../quests';
import { themeClass } from '../cosmetics';
import { playSound } from '../../audio/sound';
import { msToClock } from './common';
import { BackIcon } from './icons';
import { FlagIcon2 } from '../../v2/icons';

/** Günün Bulmacası: herkese aynı, tahmin gerektirmeyen tek kişilik tahta. */
export function Puzzle({ onExit }: { onExit(): void }) {
  const day = useMemo(() => puzzleDay(), []);
  const board = useMemo(() => puzzleFor(day), [day]);
  const [game, setGame] = useState(() => new PuzzleGame(board));
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const [flags, setFlags] = useState<Set<number>>(() => new Set());
  const [flagMode, setFlagMode] = useState(false);
  const [history, setHistory] = useState<PuzzleRecord[]>(loadPuzzleHistory);
  const [note, setNote] = useState<string | null>(null);
  const today = history.find((r) => r.day === day) ?? null;
  const streak = puzzleStreak(history, day);
  const best = history.filter((r) => r.won).reduce<number | null>((m, r) => (m === null ? r.timeMs : Math.min(m, r.timeMs)), null);
  const practiceRun = useRef(false);

  // süre göstergesi
  useEffect(() => {
    if (game.phase !== 'playing' || game.startedAt === null) return;
    const id = window.setInterval(redraw, 500);
    return () => window.clearInterval(id);
  }, [game, game.phase, game.startedAt]);

  const view = game.view();
  const size = board.size;
  const cellPx = Math.max(22, Math.min(38, Math.floor((Math.min(window.innerWidth, 560) - 48) / size)));
  const minesLeft = PUZZLE.mines - flags.size - game.boom.size;

  const finish = (g: PuzzleGame) => {
    if (practiceRun.current) return;
    const rec: PuzzleRecord = { day, won: g.phase === 'won', timeMs: g.elapsedMs(), mistakes: g.mistakes };
    setHistory(savePuzzleResult(rec));
    if (rec.won) recordQuest('puzzle');
  };

  const toggleFlag = (i: number) => {
    if (view[i] !== -1 || game.phase !== 'playing') return;
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
    playSound('flag');
  };

  const onCell = (i: number) => {
    if (game.phase !== 'playing' || view[i] !== -1) return;
    if (flagMode) return toggleFlag(i);
    if (flags.has(i)) return;
    const r = game.reveal(i);
    if (r === 'mine') {
      playSound('boom');
      navigator.vibrate?.([90, 50, 160]);
      setNote((game.phase as string) === 'lost' ? '💥 Üçüncü mayın: bulmaca bitti' : `💥 Mayın! +${PUZZLE.penaltyMs / 1000} sn ceza (${game.lives} hak kaldı)`);
    } else if (r === 'safe') playSound('reveal');
    if (game.phase !== 'playing') {
      playSound(game.phase === 'won' ? 'win' : 'lose');
      finish(game);
    }
    redraw();
  };

  // basılı tutunca bayrak (telefon); sağ tık (masaüstü)
  const press = useRef<{ i: number; t: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = Number((e.target as HTMLElement).closest('[data-i]')?.getAttribute('data-i'));
    if (Number.isNaN(i)) return;
    press.current = { i, t: window.setTimeout(() => {
      toggleFlag(i);
      press.current = null;
    }, 420) };
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.t);
    const i = Number((e.target as HTMLElement).closest('[data-i]')?.getAttribute('data-i'));
    if (i === p.i) onCell(i);
  };
  const onContext = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const i = Number((e.target as HTMLElement).closest('[data-i]')?.getAttribute('data-i'));
    if (!Number.isNaN(i)) toggleFlag(i);
  };

  const share = async () => {
    if (!today) return;
    const text = `${puzzleShareText(today, streak)}\n${window.location.origin}${window.location.pathname}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share) return void (await nav.share({ title: 'Mine Duel · Günün Bulmacası', text }));
    } catch {
      /* iptal */
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote('Sonuç panoya kopyalandı');
    } catch {
      setNote(text);
    }
  };

  const again = () => {
    // günün sonucu ilk denemedir; tekrar oynamak yalnızca alıştırma
    practiceRun.current = true;
    setGame(new PuzzleGame(board));
    setFlags(new Set());
    setNote('Alıştırma: günün sonucun değişmez');
  };

  const [y, mo, d] = day.split('-');
  return (
    <div className="ar-root ascreen puzzle">
      <button type="button" className="aback" onClick={onExit}>
        <BackIcon size={18} /> Ana menü
      </button>
      <header className="ahead puzzle__head">
        <h1>🧩 Günün Bulmacası</h1>
        <p className="amuted">
          {d}.{mo}.{y} · herkese aynı tahta. Tahmin gerekmez: her kare mantıkla bulunur. Mayına basmak +{PUZZLE.penaltyMs / 1000} sn, 3 hakkın var.
        </p>
      </header>

      <div className="puzzle__bar" role="status">
        <span title="Süre">⏱ {msToClock(game.elapsedMs())}</span>
        <span title="Hak">{'❤️'.repeat(game.lives)}{'🖤'.repeat(PUZZLE.lives - game.lives)}</span>
        <span title="Kalan mayın">💣 {minesLeft}</span>
        <button type="button" className={`abtn ${flagMode ? 'abtn--gold' : 'abtn--ghost'} puzzle__flag`} aria-pressed={flagMode} onClick={() => setFlagMode((f) => !f)}>
          <FlagIcon2 size={18} /> {flagMode ? 'Bayrak açık' : 'Bayrak'}
        </button>
      </div>

      <div className={`match puzzle__wrap${themeClass()}`}>
        <div className="mboard puzzle__board">
          <div
            className={`mgrid${game.phase === 'playing' ? ' is-live' : ''}`}
            style={{ gridTemplateColumns: `repeat(${size}, ${cellPx}px)`, gridAutoRows: `${cellPx}px`, fontSize: Math.max(10, Math.round(cellPx * 0.52)) }}
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerLeave={() => press.current && (window.clearTimeout(press.current.t), (press.current = null))}
            onContextMenu={onContext}
            role="grid"
            aria-label={`Bulmaca ${size}×${size}`}
          >
            {view.map((v, i) => {
              const flagged = v === -1 && flags.has(i);
              const cls = v === -1 ? `mc mc--hidden${flagged ? ' mc--flag' : ''}` : v === 9 ? 'mc mc--boom' : v === 10 ? 'mc mc--mine' : `mc mc--open n${v}`;
              return (
                <button key={i} type="button" className={cls} data-i={i} tabIndex={-1} aria-label={`${Math.floor(i / size) + 1}. satır, ${(i % size) + 1}. sütun`}>
                  {flagged ? <FlagIcon2 size={Math.round(cellPx * 0.62)} /> : v === 9 ? '💥' : v === 10 ? '💣' : v > 0 && v <= 8 ? v : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {note ? (
        <p className="puzzle__note" role="status" onClick={() => setNote(null)}>
          {note}
        </p>
      ) : null}

      {game.phase !== 'playing' ? (
        <section className="apanel puzzle__done">
          <h2>{game.phase === 'won' ? '🎉 Çözdün!' : '💥 Mayınlar kazandı'}</h2>
          {today ? (
            <p>
              Günün sonucu: <b>{today.won ? msToClock(today.timeMs) : 'çözülemedi'}</b>
              {today.won ? ` · ${today.mistakes} hata` : ''}
              {streak > 1 ? ` · 🔥 ${streak} gün üst üste` : ''}
            </p>
          ) : null}
          <div className="puzzle__acts">
            {today ? (
              <button type="button" className="abtn abtn--gold" onClick={() => void share()}>
                Sonucu paylaş
              </button>
            ) : null}
            <button type="button" className="abtn abtn--ghost" onClick={again}>
              Tekrar dene (alıştırma)
            </button>
          </div>
        </section>
      ) : today && !practiceRun.current ? (
        <p className="amuted asmall center">Bugünkü sonucun: {today.won ? msToClock(today.timeMs) : 'çözülemedi'}. Bu oyun alıştırma sayılır.</p>
      ) : null}

      <p className="amuted asmall center">
        {best !== null ? `En iyi süren: ${msToClock(best)} · ` : ''}Seri: {streak} gün · Yeni bulmaca her gece 00:00'da
      </p>
    </div>
  );
}
