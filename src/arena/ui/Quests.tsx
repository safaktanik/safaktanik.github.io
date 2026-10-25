import { useEffect, useState } from 'react';
import { arenaClient, errorText } from '../client';
import { onQuestChange, todaysQuests } from '../quests';
import { loadPuzzleHistory, puzzleDay, puzzleStreak } from '../puzzle';
import { playSound } from '../../audio/sound';
import { Money, fmt, useArena } from './common';
import { KIT } from '../../v2/kit';

/** Görevler sekmesi: günün 3 görevi (ilerleme + ödül) ve Günün Bulmacası kısayolu. */
export function Quests({ onPuzzle }: { onPuzzle?(): void }) {
  useArena(); // bakiye değişince yeniden çiz
  const c = arenaClient();
  const [quests, setQuests] = useState(todaysQuests);
  const [claimed, setClaimed] = useState<string[]>(() => c.claimedKeys?.() ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => onQuestChange(() => setQuests(todaysQuests())), []);

  const day = puzzleDay();
  const history = loadPuzzleHistory();
  const solvedToday = history.some((r) => r.day === day && r.won);
  const streak = puzzleStreak(history, day);

  const claim = async (key: string, amount: number) => {
    if (!c.grantReward) return;
    setBusy(key);
    setErr(null);
    setMsg(null);
    try {
      await c.grantReward(key, amount);
      playSound('coins');
      setMsg(`+${fmt(amount)} DUEL COIN hesabına eklendi.`);
      setClaimed((x) => [...x, key]);
    } catch (e) {
      setErr(errorText(e));
      if ((e as { code?: string }).code === 'already-claimed') setClaimed((x) => [...x, key]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ar-root ascreen quests">
      <h1 className="lobby2__title">Görevler</h1>
      <p className="amuted asmall">Her gün 3 yeni görev (gece 00:00'da yenilenir). Antrenman maçları sayılmaz.</p>

      <section className="qlist" aria-label="Günün görevleri">
        {quests.map((q) => {
          const got = claimed.includes(q.key);
          return (
            <article key={q.id} className={`qcard${q.complete ? ' is-done' : ''}${got ? ' is-claimed' : ''}`}>
              <span className="qcard__icon" aria-hidden="true">
                <img className="kit" src={q.complete ? KIT.gemGreen : KIT.gemPurple} alt="" draggable={false} />
                <em>{q.icon}</em>
              </span>
              <div className="qcard__body">
                <strong>{q.text}</strong>
                <div className="qcard__bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress}>
                  <i style={{ width: `${Math.round((q.progress / q.target) * 100)}%` }} />
                </div>
                <small>
                  {fmt(q.progress)} / {fmt(q.target)}
                </small>
              </div>
              {got ? (
                <span className="qcard__ok">✓ Alındı</span>
              ) : (
                <button type="button" className="abtn abtn--gold qcard__claim" disabled={!q.complete || busy !== null || !c.grantReward} onClick={() => void claim(q.key, q.reward)}>
                  <Money value={q.reward} size={13} />
                </button>
              )}
            </article>
          );
        })}
      </section>
      {!c.grantReward ? <p className="amuted asmall">Bu sunucuda görev ödülleri henüz yok.</p> : null}
      {msg ? <p className="aok">{msg}</p> : null}
      {err ? <p className="aerror">{err}</p> : null}

      {onPuzzle ? (
        <button type="button" className="tile2 tile2--purple qpuzzle" onClick={onPuzzle}>
          <span className="qpuzzle__icon" aria-hidden="true">
            🧩
          </span>
          <b>Günün Bulmacası</b>
          <small>{solvedToday ? `Bugün çözüldü ✓${streak > 1 ? ` · 🔥 ${streak} gün` : ''}` : 'Herkese aynı tahta · tahmin yok'}</small>
        </button>
      ) : null}
    </div>
  );
}
