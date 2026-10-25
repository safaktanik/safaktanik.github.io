import { MODES, MODE_ORDER } from '../modes';
import type { ArenaMode } from '../modes';
import { BoltIcon, ChainIcon, ChestIcon, CrosshairIcon, FlagIcon, SkullIcon } from './icons';
import { Sheet } from './Sheet';

export function ModeIcon({ mode, size = 18 }: { mode: ArenaMode; size?: number }) {
  if (mode === 'territory') return <FlagIcon size={size} />;
  if (mode === 'treasure') return <ChestIcon size={size} />;
  if (mode === 'chain') return <ChainIcon size={size} />;
  if (mode === 'hunter') return <CrosshairIcon size={size} />;
  if (mode === 'blitz') return <BoltIcon size={size} />;
  if (mode === 'shrink') return <span aria-hidden="true" style={{ fontSize: size * 0.9, lineHeight: 1 }}>🌪️</span>;
  return <SkullIcon size={size} />;
}

export function ModeBadge({ mode }: { mode: ArenaMode }) {
  return (
    <span className={`modebadge mode--${mode}`}>
      <ModeIcon mode={mode} size={14} /> {MODES[mode].name}
    </span>
  );
}

/** Mod seçici: her seçenek kısa kuralıyla. */
export function ModePicker({ value, onChange }: { value: ArenaMode; onChange(m: ArenaMode): void }) {
  return (
    <div className="modepick" role="radiogroup" aria-label="Oyun modu">
      {MODE_ORDER.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} className={`modepick__opt mode--${m}${value === m ? ' is-on' : ''}`} onClick={() => onChange(m)}>
          <span className="modepick__icon">
            <ModeIcon mode={m} size={20} />
          </span>
          <strong>{MODES[m].name}</strong>
          <small>{MODES[m].short}</small>
        </button>
      ))}
    </div>
  );
}

export function RulesSheet({ onClose, focus }: { onClose(): void; focus?: ArenaMode }) {
  const order = focus ? [focus, ...MODE_ORDER.filter((m) => m !== focus)] : MODE_ORDER;
  return (
    <Sheet title="Modlar ve kurallar" onClose={onClose}>
      <p className="amuted">
        Her masada 3–4 oyuncu aynı tahtayı paylaşır ve sırayla birer kare açar. Herkesin 3 canı ve 1 kalkanı vardır (Yıldırım ve Daralan Tahta'da 2 can); tur süresi 20 saniyedir (Yıldırım'da 8), art arda 3 kez süresini dolduran elenir.
        Açılan karedeki sayı, çevresindeki 8 karede kaç mayın olduğunu gösterir.
      </p>
      {order.map((m) => (
        <section key={m} className={`rulecard mode--${m}`}>
          <h3>
            <ModeIcon mode={m} size={20} /> {MODES[m].name}
          </h3>
          <ul>
            {MODES[m].rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
