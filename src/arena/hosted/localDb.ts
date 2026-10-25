import { createMemoryDb } from './memoryDb';
import type { HDb } from './types';

/**
 * ÇEVRİMDIŞI MASALAR için tarayıcı içi veritabanı: test sunucusuyla aynı `db` yüzeyi, veriler bu cihazın
 * tarayıcısında (localStorage) saklanır. Sunucu yokken (dosyadan açılınca, statik barındırmada) masalar,
 * DUEL COIN, mağaza ve sıralama bununla çalışır; rakipler botlardır.
 */
const KEY = 'mine-duel:local-db:v1';
export const LOCAL_UID = 'yerel-oyuncu';

export function createLocalDb(): HDb {
  const mem = createMemoryDb({
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : null;
      } catch {
        return null;
      }
    },
    save(all) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(all));
      } catch {
        /* depolama kapalı ya da dolu: oturum boyunca bellekte sürer */
      }
    },
  });
  // Tek kişilik cihaz: botların sıralama belgelerini de bu tarayıcı yazar.
  return mem.forUser(LOCAL_UID, { anyWrite: true });
}
