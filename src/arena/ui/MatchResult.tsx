import { useEffect, useRef, useState } from 'react';
import type { MatchView } from '../protocol';
import { playSound } from '../../audio/sound';
import { Avatar, Money, fmt, msToClock, rankLabel } from './common';
import { BadgeArt } from './BadgeArt';
import { BADGES } from '../achievements';
import type { BadgeId } from '../achievements';
import { Btn, Chibi, Ribbon } from '../../v2/ui';
import { CoinIcon } from '../../v2/icons';

function useCountUp(target: number, ms = 1200): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target <= 0 || document.documentElement.dataset.motion === 'off') {
      setV(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const REASON: Record<string, string> = { lives: 'Canları bitti', afk: 'Süre aşımı', left: 'Masadan ayrıldı' };

type Row = NonNullable<MatchView['results']>[number];

/** İlk iki oyuncu modun ana ölçütünde berabereyse, kazananı neyin belirlediğini söyler. */
export function tieBreakNote(mode: MatchView['mode'], endReason: MatchView['endReason'], rows: Row[]): string | null {
  const [a, b] = rows;
  if (!a || !b || a.eliminationReason || b.eliminationReason) return null;
  if (mode === 'treasure') return a.chests === b.chests ? 'Eşitlik: sandık sayısı aynı; daha az mayına basan, sonra daha çok kare açan öne geçti.' : null;
  if (mode === 'hunter') return (a.defused ?? 0) === (b.defused ?? 0) ? 'Eşitlik: imha sayısı aynı; daha az hata yapan öne geçti.' : null;
  if (mode === 'territory') return a.territory === b.territory ? 'Eşitlik: bölge aynı; daha az mayına basan öne geçti.' : null;
  if (endReason !== 'cleared' || a.mineHits !== b.mineHits) return null;
  return a.safeOpened !== b.safeOpened ? 'Eşitlik: mayın sayısı aynı; en çok güvenli kare açan öne geçti.' : 'Eşitlik: mayın ve kare sayısı aynı; kalan can belirledi.';
}

interface Props {
  m: MatchView;
  meId: string | null;
  now(): number;
  practice: boolean;
  /** Bu maçta kazanılan madalyalar. */
  badges?: BadgeId[];
  /** Maç karnesi: bu cihazda tutulan eğlenceli istatistikler (bayrak isabeti, şimşek hamle…). */
  card?: { icon: string; label: string; value: string }[];
  weeklyRank: number | null;
  onLobby(): void;
  onAgain(): void;
}

export function MatchResult({ m, meId, now, practice, weeklyRank, onLobby, onAgain, badges = [], card = [] }: Props) {
  const me = meId ? { id: meId, weeklyRank } : null;
  const winner = m.winnerSeat !== null ? m.players[m.winnerSeat] : null;
  const rows = [...(m.results ?? [])].sort((a, b) => a.rank - b.rank);
  const mine = rows.find((r) => r.userId === me?.id) ?? null;
  const prize = useCountUp(mine?.prize ?? 0);
  const duration = useRef<number | null>(null);
  if (duration.current === null) duration.current = now() - m.startedAt;
  const tieNote = tieBreakNote(m.mode, m.endReason, rows);
  // Sıralamayı belirleyen sayı: modun puanı, klasik modlarda açılan güvenli kare (eşitlik bozucu).
  const scoreLabel = m.mode === 'territory' ? 'Bölge' : m.mode === 'treasure' ? 'Sandık' : m.mode === 'hunter' ? 'İmha' : 'Kare';
  const scoreOf = (r: (typeof rows)[number]) => (m.mode === 'territory' ? r.territory : m.mode === 'treasure' ? r.chests : m.mode === 'hunter' ? (r.defused ?? 0) : r.safeOpened);

  useEffect(() => {
    if (!mine) return;
    playSound(mine.rank === 1 ? 'win' : 'lose');
    if (mine.prize > 0) window.setTimeout(() => playSound('coins'), 700);
  }, [mine]);

  return (
    <div className="mresult" role="dialog" aria-modal="true" aria-label="Maç sonucu">
      <div className="mresult__panel">
        {/* v2: kurdeleli sonuç kahramanı — kazandın / kaybettin / sıra */}
        {(() => {
          const meP = mine ? m.players[mine.seat] : null;
          const out: 'win' | 'lose' | 'mid' | 'watch' = !mine ? 'watch' : mine.rank === 1 ? 'win' : mine.rank === rows.length ? 'lose' : 'mid';
          const hero = meP ?? winner;
          return (
            <div className={`mres2 mres2--${out}`}>
              <Ribbon tone={out === 'win' ? 'yellow' : out === 'lose' ? 'red' : 'blue'}>
                {out === 'win' ? 'KAZANDIN!' : out === 'lose' ? 'KAYBETTİN' : out === 'mid' ? `${mine!.rank}. OLDUN` : 'MAÇ BİTTİ'}
              </Ribbon>
              {hero ? <Chibi id={hero.avatar} size={132} pose={out === 'lose' ? 'dizzy' : out === 'win' || out === 'watch' ? 'win' : 'idle'} pedestal={out !== 'lose'} /> : null}
              {out === 'watch' && winner ? <p className="mres2__who">Kazanan: <b>{winner.username}</b></p> : null}
              {mine && !practice ? (
                <div className="mres2__reward">
                  <span>Ödül:</span>
                  <span className="mres2__coins">
                    <CoinIcon size={44} />
                    <CoinIcon size={44} />
                    <CoinIcon size={44} />
                  </span>
                  <b>x{fmt(prize)}</b>
                </div>
              ) : mine ? (
                <p className="mres2__who">Antrenman maçı · +XP yok, para yok</p>
              ) : null}
              {out !== 'watch' ? (
                <p className="mres2__why">
                  {m.mode === 'hunter'
                    ? 'En çok mayın imha eden kazanır.'
                    : m.endReason === 'treasure' || m.mode === 'treasure'
                      ? 'En çok sandığı olan kazanır.'
                      : m.mode === 'territory' && m.endReason === 'cleared'
                        ? 'En geniş bölgeyi kuran kazanır.'
                        : m.endReason === 'cleared'
                          ? 'Tahta bitti; ayakta kalanlardan en az mayına basan kazanır.'
                          : 'Masada ayakta kalan son oyuncu kazanır.'}
                  {tieNote ? <><br /><b>{tieNote}</b></> : null}
                </p>
              ) : null}
              <div className="mres2__btns">
                <Btn tone="blue" size="lg" onClick={onLobby} ariaLabel={practice ? 'Çık' : 'Lobiye dön'}>
                  {practice ? 'ÇIK' : 'TOPLA'}
                </Btn>
                <Btn tone="yellow" size="lg" onClick={onAgain} ariaLabel="Tekrar oyna">
                  TEKRAR ⟳
                </Btn>
              </div>
              {out === 'win' ? (
                <div className="confetti" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, i) => (
                    <i key={i} style={{ ['--i' as string]: i }} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })()}

        {mine ? (
          practice ? (
          <div className={`mresult__me${mine.rank === 1 ? ' is-win' : ''}`}>
            <div>
              <span className="amuted asmall">Sıran</span>
              <b>{mine.rank}. / {rows.length}</b>
            </div>
            <div>
              <span className="amuted asmall">Açtığın kare</span>
              <b className="pos">{mine.safeOpened}</b>
            </div>
            <div>
              <span className="amuted asmall">Bastığın mayın</span>
              <b className={mine.mineHits ? 'neg' : 'pos'}>{mine.mineHits}</b>
            </div>
            <div>
              <span className="amuted asmall">Hamle</span>
              <b>{mine.moves}</b>
            </div>
          </div>
          ) : (
          <div className={`mresult__me${mine.rank === 1 ? ' is-win' : ''}`}>
            <div>
              <span className="amuted asmall">Kazancın</span>
              <Money value={prize} size={22} className="money--big" />
            </div>
            <div>
              <span className="amuted asmall">Haftalık puan</span>
              <b className={mine.pointsDelta >= 0 ? 'pos' : 'neg'}>{mine.pointsDelta >= 0 ? '+' : ''}{mine.pointsDelta}</b>
            </div>
            <div>
              <span className="amuted asmall">Deneyim</span>
              <b className="pos">+{mine.xp} XP</b>
            </div>
            <div>
              <span className="amuted asmall">Haftalık sıra</span>
              <b>{rankLabel(me?.weeklyRank ?? null)}</b>
            </div>
          </div>
          )
        ) : null}

        {card.length ? (
          <section className="mcard" aria-label="Maç karnen">
            {card.map((c) => (
              <div key={c.label}>
                <span aria-hidden="true">{c.icon}</span>
                <b>{c.value}</b>
                <small>{c.label}</small>
              </div>
            ))}
          </section>
        ) : null}

        {badges.length ? (
          <section className="mbadges" aria-label="Bu maçta kazandığın madalyalar">
            <p className="aeyebrow">Bu maçta kazandığın madalyalar</p>
            <div className="mbadges__row">
              {badges.map((b, i) => (
                <figure key={b} style={{ ['--i' as string]: i }} title={BADGES[b].desc}>
                  <BadgeArt id={b} size={64} />
                  <figcaption>{BADGES[b].name}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <table className="mresult__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Oyuncu</th>
              <th title={scoreLabel === 'Kare' ? 'Açtığı güvenli kare' : undefined}>{scoreLabel}</th>
              {m.mode === 'hunter' ? <th title="Bastığı mayın + yanlış imha">Hata</th> : <th title="Bastığı mayın">Mayın</th>}
              <th>{practice ? 'Açılan' : 'Ödül'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = m.players[r.seat];
              return (
                <tr key={r.userId} className={`${r.rank === 1 ? 'is-win' : ''}${r.userId === me?.id ? ' is-me' : ''}`}>
                  <td>{r.rank}</td>
                  <td>
                    <span className="mresult__who">
                      <Avatar id={p.avatar} size={26} />
                      <span>
                        {p.username}
                        {r.eliminationReason ? <small className="amuted">{REASON[r.eliminationReason]}</small> : null}
                      </span>
                    </span>
                  </td>
                  <td>{scoreOf(r)}</td>
                  <td>{r.mineHits}</td>
                  <td>
                    {practice ? (
                      <b>{r.safeOpened}</b>
                    ) : (
                    <span className="mresult__prize">
                      {r.prize > 0 ? <Money value={r.prize} size={13} /> : <span className="amuted">—</span>}
                      <small className={r.pointsDelta >= 0 ? 'pos' : 'neg'}>{r.pointsDelta >= 0 ? '+' : ''}{r.pointsDelta} puan</small>
                    </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="amuted asmall center">
          Maç süresi {msToClock(duration.current)}, {fmt(m.mineCount)} mayın{practice ? '. Antrenman maçı: para ve sıralama puanı yok.' : <>, havuz <Money value={m.prizePool} size={12} /></>}
        </p>
      </div>
    </div>
  );
}
