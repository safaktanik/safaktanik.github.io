/**
 * Mağaza kozmetikleri: tahta temaları (yalnızca görünüm; oyuna etkisi yok). Alım arka uçta coin harcar
 * (`purchase`), takılı tema bu cihazda saklanır. Tema maç ekranında ve Günün Bulmacası'nda görünür.
 */
export interface BoardTheme {
  id: string;
  name: string;
  price: number;
  desc: string;
  /** Mağaza önizlemesi: kapalı kare ve açık kare renkleri. */
  swatch: [string, string];
}

export const THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Klasik', price: 0, desc: 'Lavanta taş kareler', swatch: ['#8793da', '#262946'] },
  { id: 'neon', name: 'Neon', price: 1500, desc: 'Gece mavisi, parlayan kenarlar', swatch: ['#2a1b5e', '#0a0f22'] },
  { id: 'ice', name: 'Buzul', price: 2500, desc: 'Buz mavisi kristal kareler', swatch: ['#a8e6ff', '#123047'] },
  { id: 'gold', name: 'Altın', price: 4000, desc: 'Parlak altın kareler', swatch: ['#ffcf4a', '#2b2010'] },
  { id: 'lava', name: 'Lav', price: 6000, desc: 'Kızgın lav taşları', swatch: ['#ff6a2a', '#2a0d08'] },
];

const KEY = 'md2:theme';

export function equippedTheme(): string {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && THEMES.some((t) => t.id === v) ? v : 'classic';
  } catch {
    return 'classic';
  }
}

export function equipTheme(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* yok say */
  }
}

/** Tahta kapsayıcısına eklenecek sınıf (klasikte boş). */
export function themeClass(id = equippedTheme()): string {
  return id === 'classic' ? '' : ` theme--${id}`;
}
