/** Mayın tarlası masa modları. Kurallar motorda (mines.ts); burası adlar ve açıklamalar. */
export type ArenaMode = 'classic' | 'territory' | 'treasure' | 'chain' | 'hunter' | 'blitz';
export const MODE_ORDER: ArenaMode[] = ['classic', 'blitz', 'hunter', 'territory', 'treasure', 'chain'];

export interface ModeInfo {
  id: ArenaMode;
  name: string;
  /** Tek cümlelik özet (masa kartı, seçim listesi). */
  short: string;
  /** Kurallar ekranı için madde madde. */
  rules: string[];
}

export const MODES: Record<ArenaMode, ModeInfo> = {
  classic: {
    id: 'classic',
    name: 'Son Kalan',
    short: 'Ortak tahta, 3 can. Son kalan kazanır; tahta biterse en az mayına basan kazanır.',
    rules: [
      'Herkes aynı tahtada sırayla bir kare açar; sayı, çevredeki 8 karedeki mayın sayısıdır.',
      'Mayına basan 1 can kaybeder; 3 canı biten elenir.',
      'Ayakta kalan son oyuncu kazanır. Tahta biterse ayakta kalanlardan en az mayına basan kazanır; eşitlikte en çok güvenli kare açan.',
      'Maç sonuna kadar elenmeyen oyuncu haftalık puan kaybetmez.',
    ],
  },
  territory: {
    id: 'territory',
    name: 'Bölge Savaşı',
    short: 'Açtığın her güvenli kare senin rengine boyanır. Tahta bitince en geniş bölge kazanır.',
    rules: [
      'Açtığın kareler (boş alan yayılması dahil) senin bölgen olur ve tahtada senin renginle görünür.',
      'Sıfırlı bir kare açıp büyük alan yaymak, tek tek kare açmaktan çok daha değerlidir.',
      'Mayına basan 1 can kaybeder; canı biten elenir ama bölgesi tahtada kalır.',
      'Tahta bitince hayatta kalanlar arasında en geniş bölge kazanır (eşitlikte az mayına basan); tek kişi kalırsa o kazanır.',
    ],
  },
  treasure: {
    id: 'treasure',
    name: 'Hazine Avı',
    short: 'Tahtada gizli sandıklar var. Mayına basan bir sandığını kaybeder. En çok sandık kazanır.',
    rules: [
      'Bazı güvenli karelerde gizli sandık var; açan (ya da yayılmayla açılırsa hamleyi yapan) sandığı alır.',
      'Sayılar yalnızca mayınları sayar; sandıklar ipucu vermez.',
      'Mayına basan 1 can ve 1 sandık kaybeder. Canı biten elenir, sandıkları sayılmaya devam eder.',
      'Tüm sandıklar bulununca maç biter; en çok sandığı olan kazanır (eşitlikte hayatta olan, sonra az mayına basan).',
    ],
  },
  chain: {
    id: 'chain',
    name: 'Zincir',
    short: 'Bir önceki hamlenin hemen yanından açmak zorundasın. Rakibini tehlikeli köşeye sür.',
    rules: [
      'Sıradaki oyuncu, bir önceki hamlede açılan karelerin hemen yanındaki (8 komşu) gizli karelerden birini açmak zorundadır.',
      'Önceki hamle mayına bastıysa zincir o mayının çevresinden devam eder.',
      'Zincirde açılabilecek kare kalmazsa sıradaki oyuncu tahtada istediği yeri açar.',
      'Mayına basan 1 can kaybeder; ayakta kalan son oyuncu kazanır. Tahta biterse en az mayına basan kazanır.',
    ],
  },
  hunter: {
    id: 'hunter',
    name: 'Mayın Avcısı',
    short: 'Kare açmak yerine mayın imha edebilirsin. Doğru imha puan, yanlışı can götürür.',
    rules: [
      'Sıran gelince ya bir kare açarsın ya da mayın olduğunu düşündüğün kareyi İMHA edersin.',
      'Doğru imha: mayın etkisiz kalır, sana 1 puan. Yanlış imha (kare güvenliyse): kare açılır ve 1 can kaybedersin.',
      'Açtığın kare mayınsa her zamanki gibi 1 can kaybedersin (puan yok).',
      'Bütün mayınlar imha edilince ya da patlayınca maç biter; en çok mayın imha eden kazanır.',
    ],
  },
  blitz: {
    id: 'blitz',
    name: 'Yıldırım',
    short: 'Tur süresi 8 saniye, 2 can. Hızlı düşün, hızlı aç; son kalan ya da en az mayına basan kazanır.',
    rules: [
      'Son Kalan kurallarıyla oynanır ama her tur yalnızca 8 saniyedir.',
      'Herkesin 2 canı ve 1 kalkanı vardır; sonar yoktur.',
      'Süre dolarsa sıra geçer; üst üste 3 süre aşımı eleme sebebidir.',
    ],
  },
};

/**
 * Moda göre mayın çarpanı. Son Kalan ve Yıldırım'da ×1,5: eski yoğunlukta iyi oynayan herkes tahmin
 * yapmadan bitirebiliyor, maçların %83–91'i "0 mayın" eşitliğiyle bitiyordu. ×1,5'te eşitlik %31–47'ye iner,
 * iyi oynayanın kazanma oranı %51–80'e çıkar; maçlar ~%50 uzar (src/arena/variants.sim.ts, 300'er maç).
 * ×1,25 canlıda denendi, Gümüş'te eşitlik hâlâ sık çıktı. Diğer modların dengesi ayrı.
 */
export const MODE_MINE_FACTOR: Record<ArenaMode, number> = { classic: 1.5, blitz: 1.5, hunter: 1, territory: 1, treasure: 1, chain: 1 };

/** Moda göre tur süresi (sn). */
export function turnSecondsFor(mode: ArenaMode, base: number): number {
  return mode === 'blitz' ? 8 : base;
}

export function isMode(v: unknown): v is ArenaMode {
  return typeof v === 'string' && (MODE_ORDER as string[]).includes(v);
}
