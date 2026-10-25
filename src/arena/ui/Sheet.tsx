import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Alttan açılan panel (mobilde) / ortada pencere (masaüstünde). */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('keydown', k);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="ar-root asheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="asheet__panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="asheet__head">
          <h2>{title}</h2>
          <button type="button" className="aicon" aria-label="Kapat" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="asheet__body">{children}</div>
        {footer ? <footer className="asheet__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Seg<T extends string | number | null>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="aseg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
