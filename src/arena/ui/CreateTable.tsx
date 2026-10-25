import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import { ECONOMY, TIERS, TIER_ORDER, boardFor, boardRange, feeRange, payoutText } from '../economy';
import { DEFAULT_OPTIONS, DENSITY, OPTION_CHOICES, minesForTable } from '../tableOptions';
import type { Density, TableOptions } from '../tableOptions';
import type { TierId } from '../economy';
import type { TableView } from '../protocol';
import { playSound } from '../../audio/sound';
import { Money, Spinner, fmt, useArena } from './common';
import { Seg, Sheet } from './Sheet';
import { ModePicker } from './ModeUi';
import type { ArenaMode } from '../modes';

const TIER_NOTES: Record<TierId, string> = {
  bronze: 'Yeni başlayanlara · kısa maçlar',
  silver: 'Orta seviye · daha geniş alan',
  gold: 'Deneyimli · stratejik kararlar',
  diamond: 'İleri seviye · rekabetçi',
};

export function CreateTable({ onClose }: { onClose(): void }) {
  const s = useArena();
  const me = s.me!;
  const [tier, setTier] = useState<TierId>('bronze');
  const [mode, setMode] = useState<ArenaMode>('classic');
  const def = TIERS[tier];
  const [name, setName] = useState('');
  const [board, setBoard] = useState(def.board);
  const [fee, setFee] = useState(def.fee);
  const [cap, setCap] = useState<2 | 3 | 4>(def.capacity);
  const [opts, setOpts] = useState<TableOptions>({ ...DEFAULT_OPTIONS });
  const setO = (p: Partial<TableOptions>) => setOpts((o) => ({ ...o, ...p }));
  const blitz = mode === 'blitz';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickTier = (t: TierId) => {
    setTier(t);
    setBoard(TIERS[t].board);
    setFee(TIERS[t].fee);
    setCap(TIERS[t].capacity);
  };
  const br = boardRange(def);
  const fr = feeRange(def);
  const mines = minesForTable(def, board, cap, opts.density, mode);
  const step = Math.max(10, Math.round(def.fee / 10));
  const afford = me.balance >= fee;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await arenaClient().request<TableView>({ t: 'table.create', tier, mode, name: name.trim() || undefined, boardSize: board, entryFee: fee, capacity: cap, password: password || undefined, options: opts });
      playSound('seat');
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Masa aç"
      onClose={onClose}
      footer={
        <>
          <span className="asmall amuted">Bakiye: <Money value={me.balance} size={13} /></span>
          <button type="button" className="abtn abtn--gold" disabled={busy || !afford} onClick={() => void create()}>
            {busy ? <Spinner /> : null} Masayı oluştur · <Money value={fee} size={14} />
          </button>
        </>
      }
    >
      <label className="afield">
        <span>Masa adı</span>
        <input maxLength={ECONOMY.custom.nameMax} value={name} placeholder={`${def.label} Masa`} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="afgroup">
        <h3>Oyun modu</h3>
        <ModePicker value={mode} onChange={setMode} />
      </div>
      <div className="afgroup">
        <h3>Zorluk</h3>
        <div className="tierpick">
          {TIER_ORDER.map((t) => (
            <button key={t} type="button" className={`tierpick__opt tier--${t}${tier === t ? ' is-on' : ''}`} onClick={() => pickTier(t)} aria-pressed={tier === t}>
              <strong>{TIERS[t].label}</strong>
              <small>{boardFor(TIERS[t], t === tier ? cap : TIERS[t].capacity).size}×{boardFor(TIERS[t], t === tier ? cap : TIERS[t].capacity).size} · {minesForTable(TIERS[t], boardFor(TIERS[t], t === tier ? cap : TIERS[t].capacity).size, t === tier ? cap : TIERS[t].capacity, 'normal', mode)} mayın</small>
              <small>{TIER_NOTES[t]}</small>
              <Money value={TIERS[t].fee} size={13} />
            </button>
          ))}
        </div>
      </div>
      <div className="afgroup">
        <h3>
          Oyun alanı: <b>{board}×{board}</b> · {mines} mayın
        </h3>
        <input type="range" min={br.min} max={br.max} value={board} onChange={(e) => setBoard(Number(e.target.value))} aria-label="Oyun alanı" />
        <p className="asmall amuted">Alan {br.min}×{br.min} ile {br.max}×{br.max} arasında seçilebilir. Mayın sayısı alanla birlikte büyür; oranı aşağıdaki “Mayın yoğunluğu” belirler.</p>
      </div>
      <div className="afgroup">
        <h3>
          Giriş ücreti: <Money value={fee} size={14} />
        </h3>
        <input type="range" min={fr.min} max={fr.max} step={step} value={fee} onChange={(e) => setFee(Math.min(fr.max, Math.max(fr.min, Number(e.target.value))))} aria-label="Giriş ücreti" />
        <p className="asmall amuted">İzin verilen aralık: {fmt(fr.min)}–{fmt(fr.max)}.</p>
      </div>
      <div className="afgroup">
        <h3>Oyuncu kapasitesi</h3>
        <Seg label="Kapasite" value={cap} onChange={(v) => { setCap(v); setBoard(boardFor(def, v).size); }} options={[{ v: 2, label: '2 · düello' }, { v: 3, label: '3 kişi' }, { v: 4, label: '4 kişi' }]} />
      </div>
      <div className="afgroup">
        <h3>Mayın yoğunluğu</h3>
        <Seg label="Yoğunluk" value={opts.density} onChange={(v) => setO({ density: v as Density })} options={OPTION_CHOICES.density.map((d) => ({ v: d, label: DENSITY[d].label }))} />
      </div>
      <div className="afgroup">
        <h3>Tur süresi {blitz ? <small className="amuted">(Yıldırım: en fazla 8 sn)</small> : null}</h3>
        <Seg label="Tur süresi" value={opts.turnSeconds} onChange={(v) => setO({ turnSeconds: v as number })} options={OPTION_CHOICES.turnSeconds.map((t) => ({ v: t, label: `${t} sn` }))} />
      </div>
      <div className="afgroup">
        <h3>Can {blitz || mode === 'shrink' ? <small className="amuted">({blitz ? 'Yıldırım' : 'Daralan Tahta'}: en fazla 2)</small> : null}</h3>
        <Seg label="Can" value={opts.lives} onChange={(v) => setO({ lives: v as number })} options={OPTION_CHOICES.lives.map((l) => ({ v: l, label: '♥'.repeat(l) }))} />
      </div>
      <div className="afgroup optgrid">
        <div>
          <h3>Kalkan</h3>
          <Seg label="Kalkan" value={opts.shields} onChange={(v) => setO({ shields: v as number })} options={OPTION_CHOICES.shields.map((n) => ({ v: n, label: n ? `${n}` : 'Yok' }))} />
        </div>
        <div>
          <h3>Sonar {blitz ? <small className="amuted">(Yıldırım'da yok)</small> : null}</h3>
          <Seg label="Sonar" value={opts.sonars} onChange={(v) => setO({ sonars: v as number })} options={OPTION_CHOICES.sonars.map((n) => ({ v: n, label: n ? `${n}` : 'Yok' }))} />
        </div>
      </div>
      <div className="afgroup optgrid">
        <div>
          <h3>⏭️ Pas</h3>
          <Seg label="Pas" value={opts.passes} onChange={(v) => setO({ passes: v as number })} options={OPTION_CHOICES.passes.map((n) => ({ v: n, label: n ? `${n}` : 'Yok' }))} />
        </div>
        <div>
          <h3>👉 Zorla {mode === 'chain' || mode === 'shrink' ? <small className="amuted">({mode === 'chain' ? 'Zincir' : 'Daralan Tahta'}'da yok)</small> : null}</h3>
          <Seg label="Zorla" value={opts.forces} onChange={(v) => setO({ forces: v as number })} options={OPTION_CHOICES.forces.map((n) => ({ v: n, label: n ? `${n}` : 'Yok' }))} />
        </div>
      </div>
      <p className="asmall amuted">Güç kuralları: Pas sıranı geçer, riski sıradakine bırakır. Zorla'yı hamlenden önce kurarsın: sıradaki rakip, açtığın karelerin hemen yanından açmak zorunda kalır.</p>
      <div className="afgroup">
        <h3>Bonus kutuları</h3>
        <Seg label="Bonus kutuları" value={opts.bonuses ? 1 : 0} onChange={(v) => setO({ bonuses: v === 1 })} options={[{ v: 1, label: '🎁 Açık' }, { v: 0, label: 'Kapalı' }]} />
        <p className="asmall amuted">Tahtaya gizli kutular serpilir: açan +1 kalkan, +1 sonar, +1 can ya da ekstra tur kazanır.</p>
      </div>
      <label className="afield">
        <span>Oda şifresi (isteğe bağlı)</span>
        <input type="password" autoComplete="new-password" maxLength={ECONOMY.custom.passwordMax} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Boş bırakılırsa herkese açık" />
      </label>
      <div className="poolnote">
        Ödül havuzu: {cap} × <Money value={fee} size={13} /> = <Money value={cap * fee} size={13} />
        {ECONOMY.houseFeePercent ? ` (işletim payı %${ECONOMY.houseFeePercent})` : ' · işletim payı yok'}. {payoutText(cap)}
      </div>
      <p className="asmall amuted">Giriş ücreti masayı açınca tahsil edilir. Oyun başlamadan ayrılırsan tamamı iade edilir.</p>
      {!afford ? <p className="aerror">Bakiyen bu giriş ücreti için yetmiyor.</p> : null}
      {err ? <p className="aerror" role="alert">{err}</p> : null}
    </Sheet>
  );
}

export function PasswordPrompt({ table, busy, onSubmit, onCancel }: { table: TableView; busy: boolean; onSubmit(p: string): void; onCancel(): void }) {
  const [p, setP] = useState('');
  return (
    <Sheet
      title={`${table.name} · şifreli masa`}
      onClose={onCancel}
      footer={
        <button type="button" className="abtn abtn--primary" disabled={busy || !p} onClick={() => onSubmit(p)}>
          Katıl
        </button>
      }
    >
      <label className="afield">
        <span>Masa şifresi</span>
        <input type="password" autoFocus value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && p && onSubmit(p)} />
      </label>
    </Sheet>
  );
}
