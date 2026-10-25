import { useEffect, useState } from 'react';
import { arenaClient, errorText } from '../client';
import { CharacterPicker } from './CharacterPicker';
import { BadgeArt } from './BadgeArt';
import { BADGES, BADGE_ORDER, loadBadges } from '../achievements';
import { TIERS } from '../economy';
import type { TierId } from '../economy';
import { Avatar, LevelBadge, Money, Spinner, TierBadge, fmt, rankLabel, useArena } from './common';
import { BackIcon } from './icons';

interface MatchRow {
  match_id: string;
  final_rank: number;
  prize: number;
  points_delta: number;
  mines_triggered: number;
  turn_count: number;
  finished_at: number;
  tier: TierId;
  table_name: string;
  players: number;
}
interface TxRow {
  id: number;
  transaction_type: string;
  amount: number;
  balance_after: number;
  created_at: number;
}
const TX_LABEL: Record<string, string> = {
  'signup-bonus': 'Başlangıç bakiyesi',
  'entry-fee': 'Masa giriş ücreti',
  'entry-refund': 'Giriş ücreti iadesi',
  'abort-refund': 'Yarıda kalan maç iadesi',
  'match-prize': 'Maç ödülü',
  'first-match-bonus': 'İlk maç ödülü',
  'daily-reward': 'Günlük ödül',
  'rescue-pack': 'Yardım paketi',
  'weekly-prize': 'Haftalık sıralama ödülü',
  'entry-refund ': 'Giriş ücreti iadesi',
};
const dt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Profile({ onBack }: { onBack(): void }) {
  const s = useArena();
  const me = s.me!;
  const [book] = useState(loadBadges);
  const c = arenaClient();
  const [name, setName] = useState(me.username);
  const [avatar, setAvatar] = useState(me.avatar);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [txs, setTxs] = useState<TxRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    c.recentMatches().then((r) => setMatches(r as MatchRow[]), () => setMatches([]));
    c.transactions().then((r) => setTxs(r as TxRow[]), () => setTxs([]));
  }, [c, me.gamesPlayed, me.balance]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const progress = me.xpNext > me.xpLevelStart ? (me.xp - me.xpLevelStart) / (me.xpNext - me.xpLevelStart) : 0;

  return (
    <div className="ar-root ascreen profile">
      <header className="ahead">
        <button type="button" className="aback" onClick={onBack}>
          <BackIcon size={18} /> Lobi
        </button>
        <h1>Profil</h1>
      </header>

      <section className="pcardx apanel">
        <Avatar id={me.avatar} size={84} />
        <div>
          <h2>{me.username}</h2>
          <p className="amuted asmall">{c.local ? 'Çevrimdışı profil: bu cihazda saklanır' : c.kind === 'hosted' ? 'Test sunucusu: hesabın claude.ai hesabındır' : me.accountType === 'guest' ? 'Misafir hesap' : `Kalıcı hesap: ${me.email ?? ''}`}</p>
          <div className="xpbar" aria-label={`Seviye ${me.level}, ${me.xp} XP`}>
            <LevelBadge level={me.level} />
            <span className="xpbar__track"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
            <small>{fmt(me.xp)} / {fmt(me.xpNext)} XP</small>
          </div>
        </div>
      </section>

      <dl className="pstats">
        <div><dt>Galibiyet</dt><dd>{fmt(me.wins)}</dd></div>
        <div><dt>Mağlubiyet</dt><dd>{fmt(me.losses)}</dd></div>
        <div><dt>Maç</dt><dd>{fmt(me.gamesPlayed)}</dd></div>
        <div><dt>Kazanma oranı</dt><dd>%{me.winRate}</dd></div>
        <div><dt>Bakiye</dt><dd><Money value={me.balance} size={14} /></dd></div>
        <div><dt>Haftalık sıra</dt><dd>{rankLabel(me.weeklyRank)} · {me.weeklyPoints} p</dd></div>
        <div><dt>En iyi sıra</dt><dd>{rankLabel(me.bestRank)}</dd></div>
      </dl>

      <section className="apanel">
        <h3>Madalya koleksiyonu</h3>
        <div className="badgebook">
          {BADGE_ORDER.map((b) => (
            <figure key={b} className={book[b] ? 'is-on' : ''} title={BADGES[b].desc}>
              <BadgeArt id={b} size={52} />
              <figcaption>
                {BADGES[b].name}
                <small>{book[b] ? `×${book[b]}` : BADGES[b].desc}</small>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="asmall amuted">Madalyalar maç sonunda kazanılır ve bu cihazda saklanır.</p>
      </section>

      <section className="apanel">
        <h3>Kullanıcı adı ve karakter</h3>
        <label className="afield">
          <span>Kullanıcı adı</span>
          <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <CharacterPicker value={avatar} onChange={setAvatar} level={me.level} />
        <button type="button" className="abtn abtn--primary" disabled={busy || (name === me.username && avatar === me.avatar)} onClick={() => void run(() => c.updateProfile({ username: name, avatar }), 'Profil kaydedildi.')}>
          Kaydet
        </button>
      </section>

      {c.kind === 'server' && me.accountType === 'guest' ? (
        <section className="apanel">
          <h3>Kalıcı hesaba dönüştür</h3>
          <p className="asmall amuted">Bakiyen, istatistiklerin ve haftalık sıralaman aynı kimlikle korunur. Böylece başka cihazdan da giriş yapabilirsin.</p>
          <label className="afield">
            <span>E-posta</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="afield">
            <span>Parola (en az 8 karakter)</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="button" className="abtn abtn--gold" disabled={busy || !email || password.length < 8} onClick={() => void run(() => c.upgrade(email, password), 'Hesabın kalıcı hale geldi.')}>
            {busy ? <Spinner /> : null} Hesabı kaydet
          </button>
        </section>
      ) : null}
      {msg ? <p className="aok">{msg}</p> : null}
      {err ? <p className="aerror">{err}</p> : null}

      <section className="apanel">
        <h3>Son maçlar</h3>
        {!matches ? <Spinner /> : matches.length === 0 ? <p className="amuted asmall">Henüz biten maç yok.</p> : (
          <ul className="hist">
            {matches.map((m) => (
              <li key={m.match_id} className={m.final_rank === 1 ? 'is-win' : ''}>
                <span className="hist__rank">{m.final_rank}.</span>
                <span className="hist__mid">
                  <TierBadge tier={m.tier} small /> {m.table_name}
                  <small className="amuted"> · {m.players} kişi · {m.turn_count} hamle · {m.mines_triggered} mayın · {dt.format(m.finished_at)}</small>
                </span>
                <span className="hist__r">
                  {m.prize ? <Money value={m.prize} size={12} /> : null}
                  <small className={m.points_delta >= 0 ? 'pos' : 'neg'}>{m.points_delta >= 0 ? '+' : ''}{m.points_delta} p</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="apanel">
        <h3>Bakiye hareketleri</h3>
        {!txs ? <Spinner /> : (
          <ul className="txs">
            {txs.map((t) => (
              <li key={t.id}>
                <span>{TX_LABEL[t.transaction_type] ?? t.transaction_type}<small className="amuted"> · {dt.format(t.created_at)}</small></span>
                <b className={t.amount >= 0 ? 'pos' : 'neg'}>{t.amount >= 0 ? '+' : ''}{fmt(t.amount)}</b>
                <small className="amuted">{fmt(t.balance_after)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="amuted asmall center">Masa türleri: {Object.values(TIERS).map((t) => t.label).join(' · ')}</p>
    </div>
  );
}
