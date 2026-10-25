import { useEffect, useMemo, useState } from 'react';
import { arenaClient, errorText } from '../client';
import { PackIcon } from './PackIcon';
import { FriendPlaySheet } from './FriendPlay';
import { ECONOMY, TIERS, TIER_ORDER } from '../economy';
import type { TierId } from '../economy';
import type { Me, TableView } from '../protocol';
import { playSound } from '../../audio/sound';
import { Avatar, Coin, IconBtn, LevelBadge, Money, Spinner, TierBadge, fmt, rankLabel, useArena , ReadOnlyNote } from './common';
import { activeFilterCount, applyFilters, loadFilters, saveFilters } from './filters';
import type { Filters } from './filters';
import { BagIcon, FilterIcon, GridIcon, LockIcon, MineIcon, PlusIcon, SeatsIcon, TrophyIcon, UserIcon } from './icons';
import { FilterSheet } from './FilterSheet';
import { PasswordPrompt } from './CreateTable';
import { ModeBadge } from './ModeUi';
import { shareInvite } from '../share';

export type LobbyNav = 'leaderboard' | 'profile' | 'shop' | 'settings' | 'create' | 'quick' | 'exit' | 'practice';

export function LobbyHeader({ me, onNav }: { me: Me; onNav(n: LobbyNav): void }) {
  return (
    <header className="lhead">
      <button type="button" className="lhead__me" onClick={() => onNav('profile')} aria-label="Profil">
        <Avatar id={me.avatar} size={48} />
        <span className="lhead__id">
          <strong>{me.username}</strong>
          <span className="lhead__meta">
            <LevelBadge level={me.level} />
            <span title="Toplam galibiyet">
              <TrophyIcon size={13} /> {fmt(me.wins)}
            </span>
            <span title="Haftalık sıra">Hafta {rankLabel(me.weeklyRank)}</span>
          </span>
        </span>
      </button>
      <button type="button" className="lhead__bal" onClick={() => onNav('shop')} aria-label="Bakiye ve mağaza">
        <Coin size={22} />
        <b data-testid="balance">{fmt(me.balance)}</b>
        <span className="lhead__plus">
          <PlusIcon size={14} />
        </span>
      </button>
      <div className="lhead__tools">
        <IconBtn label="Mağaza" onClick={() => onNav('shop')} badge={me.dailyAvailable || me.rescueAvailable}>
          <BagIcon />
        </IconBtn>
        <IconBtn label="Ayarlar" onClick={() => onNav('settings')}>
          <PackIcon name="icon_settings" size={24} />
        </IconBtn>
      </div>
    </header>
  );
}

const STATUS_TEXT: Record<TableView['status'], string> = {
  waiting: 'Rakip bekleniyor',
  countdown: 'Başlıyor…',
  playing: 'Oyunda',
  finished: 'Bitti',
  cancelled: 'Kapandı',
};

export function TableCard({ t, me, onJoin, busy, onWatch, onInvite }: { t: TableView; me: Me; onJoin(t: TableView): void; busy: boolean; onWatch?(t: TableView): void; onInvite?(t: TableView): void }) {
  const free = t.maxPlayers - t.players.length;
  const joinable = t.status === 'waiting' && free > 0;
  const afford = me.balance >= t.entryFee;
  return (
    <article className={`tcard tier--${t.tier}${t.status === 'playing' ? ' tcard--playing' : ''}`} data-table={t.id}>
      <div className="tcard__glow" aria-hidden="true" />
      <header className="tcard__head">
        <TierBadge tier={t.tier} />
        <h3 title={t.name}>
          {t.locked ? <LockIcon size={14} /> : null} {t.name}
        </h3>
        <span className={`tstatus tstatus--${t.status}`}>{STATUS_TEXT[t.status]}</span>
      </header>
      <ModeBadge mode={t.mode} />
      <div className="tcard__body">
        <dl className="tcard__stats">
          <div>
            <dt>Giriş</dt>
            <dd><Money value={t.entryFee} size={15} /></dd>
          </div>
          <div className="tcard__pool">
            <dt>Ödül havuzu</dt>
            <dd><Money value={t.maxPrizePool} size={15} /></dd>
          </div>
          <div>
            <dt><GridIcon size={13} /> Alan</dt>
            <dd>{t.boardSize}×{t.boardSize}</dd>
          </div>
          <div>
            <dt><MineIcon size={13} /> Mayın</dt>
            <dd>{t.mineCount}</dd>
          </div>
        </dl>
        {t.options ? (
          <p className="tcard__opts">
            <span>⏱ {t.options.turnSeconds} sn</span>
            <span>♥ {t.options.lives}</span>
            <span>🛡 {t.options.shields}</span>
            <span>📡 {t.options.sonars}</span>
            {t.options.smokes ? <span>🌫️ {t.options.smokes}</span> : null}
            {t.options.freezes ? <span>❄️ {t.options.freezes}</span> : null}
            {t.options.bonuses !== false ? <span>🎁 Bonus</span> : null}
            {t.options.density !== 'normal' ? <span>{t.options.density === 'hard' ? 'Çok mayın' : 'Az mayın'}</span> : null}
          </p>
        ) : null}
        <div className="tcard__seats" aria-label={`${t.players.length}/${t.maxPlayers} oyuncu`}>
          {Array.from({ length: t.maxPlayers }, (_, i) => {
            const p = t.players.find((x) => x.seat === i);
            return p ? (
              <span key={i} className="tseat" title={`${p.username} · Sv ${p.level}`}>
                <Avatar id={p.avatar} size={34} />
              </span>
            ) : (
              <span key={i} className="tseat tseat--empty" aria-hidden="true">
                <UserIcon size={16} />
              </span>
            );
          })}
          <span className="tcard__count">
            <SeatsIcon size={14} /> {t.players.length}/{t.maxPlayers}
          </span>
        </div>
      </div>
      <div className="tcard__acts">
        {t.status === 'playing' && onWatch ? (
          <button type="button" className="abtn abtn--primary tcard__watch" disabled={busy} onClick={() => onWatch(t)}>
            👁 İzle
          </button>
        ) : (
          <button
            type="button"
            className="abtn abtn--gold tcard__join"
            disabled={!joinable || !afford || busy}
            onClick={() => onJoin(t)}
            title={!afford && joinable ? 'Bakiye yetersiz' : undefined}
          >
            {t.status === 'playing' ? 'Oyunda' : !joinable ? 'Dolu' : !afford ? 'Bakiye yetersiz' : 'Masaya katıl'}
          </button>
        )}
        {joinable && onInvite ? (
          <button type="button" className="abtn abtn--ghost tcard__invite" onClick={() => onInvite(t)} aria-label="Arkadaşını davet et">
            👥 Davet
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function Lobby({ onNav }: { onNav(n: LobbyNav): void }) {
  const s = useArena();
  const me = s.me!;
  const c = arenaClient();
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState<TableView | null>(null);
  const [friend, setFriend] = useState<null | 'create' | 'join'>(null);

  useEffect(() => {
    c.watchLobby(true);
    return () => c.watchLobby(false);
  }, [c]);

  const list = useMemo(() => applyFilters(s.lobby, filters), [s.lobby, filters]);
  const setF = (f: Filters) => {
    setFilters(f);
    saveFilters(f);
  };

  const join = async (t: TableView, password?: string) => {
    if (t.locked && password === undefined) return setPw(t);
    setBusy(true);
    setErr(null);
    try {
      await c.request({ t: 'table.join', tableId: t.id, password });
      playSound('seat');
      setPw(null);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const watch = async (t: TableView) => {
    setBusy(true);
    setErr(null);
    try {
      await c.request({ t: 'table.watch', tableId: t.id });
      playSound('go');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const nFilters = activeFilterCount(filters);

  return (
    <div className="ar-root ascreen lobby">
      {/* üst çubuk (bakiye, ayarlar) ve alt menü v2 kabuğunda */}
      <h1 className="lobby2__title">Masalar</h1>
      <ReadOnlyNote />

      {c.joinByCode && !c.local && !c.p2p ? (
        <section className="friendcard">
          <div className="friendcard__art" aria-hidden="true">
            <PackIcon name="icon_friend" size={44} />
          </div>
          <div className="friendcard__txt">
            <strong>Arkadaşınla oyna</strong>
            <small>Özel oda kur, 4 haneli kodu gönder; arkadaşın kodla katılsın.</small>
          </div>
          <div className="friendcard__btns">
            <button type="button" className="abtn abtn--gold" onClick={() => setFriend('create')}>
              Oda kur
            </button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setFriend('join')}>
              Kodla katıl
            </button>
          </div>
        </section>
      ) : c.local ? (
        <p className="friendnote asmall">Bu ekran çevrimdışı modda (rakipler bot). Arkadaşlarınla oynamak için ana ekrandan “Arkadaşlarla oyna”yı seç.</p>
      ) : null}

      <nav className="ltabs" aria-label="Masa türü">
        {(['all', ...TIER_ORDER] as (TierId | 'all')[]).map((tier) => (
          <button
            key={tier}
            type="button"
            className={`ltab${filters.tier === tier ? ' is-on' : ''}${tier !== 'all' ? ` tier--${tier}` : ''}`}
            onClick={() => setF({ ...filters, tier })}
          >
            {tier === 'all' ? 'Tümü' : TIERS[tier].label}
            {tier !== 'all' ? <small>{fmt(TIERS[tier].fee)}</small> : null}
          </button>
        ))}
      </nav>

      <div className="lbar">
        <span className="amuted asmall">
          {s.lobbyLoaded ? `${list.length} masa` : 'Masalar yükleniyor…'}
          {s.online >= 0 ? ` · ${s.online} çevrimiçi` : ''}
          {s.conn !== 'online' ? <em className="lconn"> · {s.conn === 'offline' ? 'bağlantı yok, yeniden deneniyor' : 'bağlanıyor'}</em> : null}
        </span>
        <button type="button" className={`chip${nFilters ? ' chip--on' : ''}`} onClick={() => setSheet(true)}>
          <FilterIcon size={15} /> Filtre{nFilters ? ` (${nFilters})` : ''}
        </button>
      </div>

      {err ? <p className="aerror" role="alert">{err}</p> : null}

      <section className="tlist" aria-label="Masalar">
        {!s.lobbyLoaded ? (
          <div className="tlist__empty"><Spinner /></div>
        ) : list.length === 0 ? (
          <div className="tlist__empty">
            <p>Bu filtrelere uyan masa yok.</p>
            <p className="amuted asmall">Yeni bir masa aç ya da “Hemen oyna” ile eşleş.</p>
          </div>
        ) : (
          list.map((t) => (
            <TableCard
              key={t.id}
              t={t}
              me={me}
              busy={busy}
              onJoin={(x) => void join(x)}
              onWatch={c.kind === 'hosted' ? (x) => void watch(x) : undefined}
              onInvite={c.p2p || c.kind === 'hosted' ? (x) => void shareInvite(x.code ?? document.documentElement.dataset.roomCode ?? null) : undefined}
            />
          ))
        )}
      </section>

      <div className="lobby2__acts">
        <button type="button" className="abtn abtn--gold" onClick={() => onNav('create')}>
          + Masa aç
        </button>
        <button type="button" className="abtn abtn--primary" onClick={() => onNav('quick')}>
          ⚡ Hemen oyna
        </button>
      </div>

      {friend ? <FriendPlaySheet start={friend} onClose={() => setFriend(null)} /> : null}
      {sheet ? <FilterSheet value={filters} onChange={setF} onClose={() => setSheet(false)} /> : null}
      {pw ? <PasswordPrompt table={pw} busy={busy} onCancel={() => setPw(null)} onSubmit={(p) => void join(pw, p)} /> : null}
      <p className="lfoot amuted asmall">
        {ECONOMY.currency} yalnızca oyun içi sanal puandır; gerçek parayla alınıp satılamaz.
        {c.p2p ? ' Arkadaş odası: veriler odayı kuran telefonda tutulur; o sayfa açık kaldıkça oda sürer.' : c.local ? ' Çevrimdışı: rakipler bot, veriler bu tarayıcıda saklanır.' : c.kind === 'hosted' ? ' Test sunucusu: kurallar tarayıcılarda uygulanır, hileye karşı korumalı değildir.' : ''}
      </p>
    </div>
  );
}
