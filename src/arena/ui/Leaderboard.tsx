import { useEffect, useState } from 'react';
import { arenaClient, errorText } from '../client';
import { Avatar, LevelBadge, Money, Spinner, fmt, msToClock, useTick } from './common';
import { BackIcon, ClockIcon, CrownIcon } from './icons';

interface Row {
  rank: number;
  userId: string;
  username: string;
  avatar: number;
  level: number;
  points: number;
  wins: number;
  games: number;
  winRate: number;
  coinsWon: number;
}
interface Board {
  week: string;
  list: Row[];
  me: Row | null;
  prizes: number[];
  endsInMs: number;
  serverNow: number;
}

function RowView({ r, me }: { r: Row; me: boolean }) {
  return (
    <li className={`lbrow${me ? ' is-me' : ''}${r.rank <= 3 ? ` top${r.rank}` : ''}`}>
      <span className="lbrow__rank">{r.rank}</span>
      <Avatar id={r.avatar} size={36} />
      <span className="lbrow__name">
        <strong>{r.username}</strong>
        <span className="amuted asmall">
          <LevelBadge level={r.level} /> {r.wins}G / {r.games} maç · %{r.winRate}
        </span>
      </span>
      <span className="lbrow__right">
        <b>{fmt(r.points)} p</b>
        <Money value={r.coinsWon} size={12} />
      </span>
    </li>
  );
}

export function Leaderboard({ onBack }: { onBack(): void }) {
  const [data, setData] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(Date.now());
  useTick(1000);
  useEffect(() => {
    arenaClient()
      .leaderboard()
      .then((d) => {
        setData(d);
        setLoadedAt(Date.now());
      })
      .catch((e) => setErr(errorText(e)));
  }, []);
  const left = data ? data.endsInMs - (Date.now() - loadedAt) : 0;
  const podium = data?.list.slice(0, 3) ?? [];
  return (
    <div className="ar-root ascreen board-screen">
      <header className="ahead">
        <button type="button" className="aback" onClick={onBack}>
          <BackIcon size={18} /> Lobi
        </button>
        <h1>Haftalık sıralama</h1>
      </header>
      {err ? <p className="aerror">{err}</p> : null}
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="lbtop apanel">
            <span>
              <ClockIcon size={16} /> Sıfırlanmaya <b>{msToClock(left)}</b>
            </span>
            {data.prizes.length ? (
            <span className="lbprizes">
              Haftalık ödüller:{' '}
              {data.prizes.map((p, i) => (
                <span key={i}>
                  {i + 1}. <Money value={p} size={12} />
                </span>
              ))}
            </span>
            ) : (
              <span className="amuted">{arenaClient().local ? 'Çevrimdışı sıralama: sen ve botlar. Haftalık ödül dağıtılmaz.' : 'Test sunucusunda haftalık ödül dağıtılmaz.'}</span>
            )}
          </div>
          <div className="podium">
            {[1, 0, 2].map((i) =>
              podium[i] ? (
                <div key={i} className={`podium__p podium__p--${i + 1}`}>
                  {i === 0 ? <CrownIcon size={26} className="podium__crown" /> : null}
                  <Avatar id={podium[i].avatar} size={i === 0 ? 74 : 58} />
                  <strong>{podium[i].username}</strong>
                  <span>{fmt(podium[i].points)} p</span>
                  <i className="podium__step">{i + 1}</i>
                </div>
              ) : (
                <div key={i} className={`podium__p podium__p--${i + 1} podium__p--empty`}>
                  <i className="podium__step">{i + 1}</i>
                </div>
              ),
            )}
          </div>
          {data.list.length === 0 ? <p className="amuted center">Bu hafta henüz maç oynanmadı.</p> : null}
          <ol className="lblist">
            {data.list.map((r) => (
              <RowView key={r.userId} r={r} me={r.userId === data.me?.userId} />
            ))}
          </ol>
          {data.me && !data.list.some((r) => r.userId === data.me!.userId) ? (
            <ol className="lblist lblist--me">
              <RowView r={data.me} me />
            </ol>
          ) : null}
          {!data.me ? <p className="amuted asmall center">Bu hafta bir maç bitirdiğinde burada yerini göreceksin.</p> : null}
          <p className="amuted asmall center">Puan: 1. +25 · 2. +10 · 3. 0 · son sıradaki/erken elenen −5 (4 kişilik masada 3. 0 puan). Aynı oyuncularla çok sık oynanan maçlarda puan azalır. Sıralama her pazartesi 00:00 (UTC) sunucu saatiyle sıfırlanır; arkadaş sıralaması sonraki sürümde.</p>
        </>
      )}
    </div>
  );
}
