import { CHARACTERS, Character, charOf } from './characters';
import { LockIcon } from './icons';

/** Karakter seçici: büyük önizleme + ızgara. `level` verilirse üst seviye karakterler kilitli görünür. */
export function CharacterPicker({ value, onChange, level = 99 }: { value: number; onChange(id: number): void; level?: number }) {
  const cur = charOf(value);
  return (
    <div className="charpick">
      <div className="charpick__hero">
        <Character id={cur.id} size={96} mood="happy" key={cur.id} />
        <div>
          <strong>{cur.name}</strong>
          <p className="asmall amuted">{cur.tagline}</p>
        </div>
      </div>
      <div className="charpick__grid" role="radiogroup" aria-label="Karakter">
        {CHARACTERS.map((c) => {
          const locked = level < c.unlock;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={value === c.id}
              aria-label={locked ? `${c.name} (seviye ${c.unlock})` : c.name}
              className={`charpick__opt${value === c.id ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
              disabled={locked}
              onClick={() => onChange(c.id)}
            >
              <Character id={c.id} size={52} mood={value === c.id ? 'happy' : 'idle'} animate={value === c.id} />
              <span>{c.name}</span>
              {locked ? (
                <em>
                  <LockIcon size={12} /> Sv {c.unlock}
                </em>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
