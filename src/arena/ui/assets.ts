/**
 * GÖRSEL YUVALARI: Higgsfield (ya da başka bir araç) ile üretilen görselleri buraya bağlayın.
 * Bir yuva boşsa oyun kodla çizilmiş SVG'yi kullanır; doluysa o görseli gösterir.
 * Dosyaları `public/art/` klasörüne koyup yolunu yazın (ör. '/art/char-0.png') ya da tam https adresi verin.
 * Önerilen biçim: şeffaf arka planlı PNG/WebP, kare, en az 256×256. Prompt listesi: docs/higgsfield-prompts.md
 */
export interface AssetSlots {
  /** Karakter numarası → görsel (0–11). Mutlu/üzgün ifadeler yalnızca SVG karakterlerde değişir. */
  characters: Partial<Record<number, string>>;
  logo?: string;
  /** Tahtadaki mayın (bitişte açılan) ve patlamış mayın. */
  mine?: string;
  mineLit?: string;
  defused?: string;
}

export const ASSETS: AssetSlots = {
  characters: {},
};
