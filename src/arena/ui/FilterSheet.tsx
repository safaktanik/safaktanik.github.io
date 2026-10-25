import { TIERS, TIER_ORDER } from '../economy';
import type { TierId } from '../economy';
import { fmt } from './common';
import { DEFAULT_FILTERS } from './filters';
import type { Filters } from './filters';
import { Seg, Sheet } from './Sheet';
import { MODES, MODE_ORDER } from '../modes';
import type { ArenaMode } from '../modes';

export function FilterSheet({ value, onChange, onClose }: { value: Filters; onChange(f: Filters): void; onClose(): void }) {
  const set = (p: Partial<Filters>) => onChange({ ...value, ...p });
  return (
    <Sheet
      title="Masaları filtrele"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="abtn abtn--ghost" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            Sıfırla
          </button>
          <button type="button" className="abtn abtn--primary" onClick={onClose}>
            Uygula
          </button>
        </>
      }
    >
      <div className="afgroup">
        <h3>Durum</h3>
        <Seg label="Durum" value={value.status} onChange={(v) => set({ status: v })} options={[{ v: 'open', label: 'Bekleyen' }, { v: 'playing', label: 'Başlamış' }, { v: 'all', label: 'Hepsi' }]} />
      </div>
      <div className="afgroup">
        <h3>Oyun modu</h3>
        <Seg label="Oyun modu" value={value.mode ?? 'all'} onChange={(v) => set({ mode: v as ArenaMode | 'all' })} options={[{ v: 'all', label: 'Hepsi' }, ...MODE_ORDER.map((m) => ({ v: m, label: MODES[m].name }))]} />
      </div>
      <div className="afgroup">
        <h3>Zorluk</h3>
        <Seg label="Zorluk" value={value.tier} onChange={(v) => set({ tier: v as TierId | 'all' })} options={[{ v: 'all', label: 'Hepsi' }, ...TIER_ORDER.map((t) => ({ v: t, label: TIERS[t].label }))]} />
      </div>
      <div className="afgroup">
        <h3>En fazla giriş ücreti</h3>
        <Seg label="Giriş ücreti" value={value.maxFee} onChange={(v) => set({ maxFee: v })} options={[{ v: null, label: 'Hepsi' }, ...[100, 500, 1500, 5000].map((f) => ({ v: f, label: `≤ ${fmt(f)}` }))]} />
      </div>
      <div className="afgroup">
        <h3>Oyuncu kapasitesi</h3>
        <Seg label="Kapasite" value={value.capacity} onChange={(v) => set({ capacity: v })} options={[{ v: null, label: 'Hepsi' }, { v: 3, label: '3 kişilik' }, { v: 4, label: '4 kişilik' }]} />
      </div>
      <div className="afgroup">
        <h3>En az boş koltuk</h3>
        <Seg label="Boş koltuk" value={value.minFree} onChange={(v) => set({ minFree: v })} options={[{ v: 0, label: 'Fark etmez' }, { v: 1, label: '1+' }, { v: 2, label: '2+' }, { v: 3, label: '3+' }]} />
      </div>
      <div className="afgroup">
        <h3>Oyun alanı</h3>
        <Seg label="Oyun alanı" value={value.board} onChange={(v) => set({ board: v })} options={[{ v: 'all', label: 'Hepsi' }, { v: 'small', label: '≤ 15×15' }, { v: 'medium', label: '16–22' }, { v: 'large', label: '23+' }]} />
      </div>
    </Sheet>
  );
}
