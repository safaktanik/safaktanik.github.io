/** Karakter listesi (sunucu ve arayüz ortak): ad, renk ve açılma seviyesi. Çizimler ui/characters.tsx'te. */
export interface CharacterInfo {
  id: number;
  name: string;
  /** Tanıtım cümlesi (profil / seçim ekranı). */
  tagline: string;
  /** Arka plan tonu (HSL hue). */
  hue: number;
  /** Bu karakterin açılması için gereken seviye. */
  unlock: number;
  /** Varlık paketindeki çizimli insan karakter (ifadeler ayrı görseller). */
  art?: 'strategist' | 'tactician';
}

export const CHARACTERS: CharacterInfo[] = [
  { id: 0, name: 'Kaptan Fok', tagline: 'Dümenden hiç ayrılmaz, kalkanını hep cilalı tutar.', hue: 205, unlock: 1 },
  { id: 1, name: 'Okta', tagline: 'Sekiz kolu var, sekiz kareyi aynı anda düşünür.', hue: 290, unlock: 1 },
  { id: 2, name: 'Martı Mırtı', tagline: 'Gökten bakar, adayı herkesten önce görür.', hue: 25, unlock: 1 },
  { id: 3, name: 'Tosun', tagline: 'Yavaş ama emin adımlarla; hiç acele etmez.', hue: 120, unlock: 1 },
  { id: 4, name: 'Pofuduk', tagline: 'Kızınca şişer, mayına basınca daha çok şişer.', hue: 48, unlock: 1 },
  { id: 5, name: 'Pıt', tagline: 'Buzdan gelen soğukkanlı strateji ustası.', hue: 195, unlock: 1 },
  { id: 6, name: 'Kıskaç', tagline: 'Yan yan yürür, zinciri hep rakibin köşesine sürer.', hue: 8, unlock: 2 },
  { id: 7, name: 'Bulut', tagline: 'Koca balina; puflayınca sonar bile titrer.', hue: 215, unlock: 3 },
  { id: 8, name: 'Dalga', tagline: 'Deniz atı; sandık kokusunu millerce öteden alır.', hue: 32, unlock: 4 },
  { id: 9, name: 'Diş', tagline: 'Sırıtışı korkutucu ama kalbi yumuşak.', hue: 200, unlock: 5 },
  { id: 10, name: 'Rüzgâr', tagline: 'Vatoz; dalgaların üstünde süzülür, iz bırakmaz.', hue: 175, unlock: 7 },
  { id: 11, name: 'Dalgıç Demir', tagline: 'Pirinç başlıklı efsane dalgıç. En derindeki mayını bile bulur.', hue: 40, unlock: 10 },
  { id: 12, name: 'Stratejist Kaan', tagline: 'Her hamleden önce üç hamle sonrasını düşünür.', hue: 188, unlock: 1, art: 'strategist' },
  { id: 13, name: 'Taktisyen Arda', tagline: 'Rakibini köşeye sıkıştırmayı sever; zincirin ustası.', hue: 28, unlock: 1, art: 'tactician' },
];
export const CHARACTER_COUNT = CHARACTERS.length;

/** Bu seviyede seçilebilir mi? */
export function characterUnlocked(id: number, level: number): boolean {
  const c = CHARACTERS[id];
  return !!c && level >= c.unlock;
}
/** Yeni hesaplara rastgele verilebilecek (seviye 1) karakterler. */
export const STARTER_CHARACTERS = CHARACTERS.filter((c) => c.unlock <= 1).map((c) => c.id);
