import { PACK } from './packArt';
import type { PackKey } from './packArt';

/** Varlık paketindeki arka plan ve kare görsellerini CSS değişkeni olarak tanımlar (bir kez, açılışta). */
export function installPackTheme(): void {
  const root = document.documentElement.style;
  const set = (name: string, key: PackKey) => root.setProperty(name, `url("${PACK[key]}")`);
  set('--art-bg-menu', 'background_menu');
  set('--art-bg-game', 'background_gameplay');
  set('--art-bg-victory', 'background_victory');
  set('--art-tile-closed', 'tile_closed');
  set('--art-tile-hover', 'tile_hover');
  set('--art-tile-flag', 'tile_flagged');
  set('--art-tile-question', 'tile_question');
  set('--art-tile-radar', 'tile_radar');
  set('--art-tile-protected', 'tile_protected');
  set('--art-tile-winning', 'tile_winning');
  // sekme simgesi
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = PACK.app_icon;
}
