/**
 * Mine Duel 2, eski sürümle aynı alan adında (safaktanik.github.io) yayınlanır. Tarayıcı deposu alan adına
 * göre paylaşıldığı için v2'nin kayıtları ayrı bir ad alanında tutulur: 'mine-duel:x' → 'md2:mine-duel:x'.
 * Böylece iki sürüm birbirinin profilini / ayarını bozmaz.
 */
const NS = 'md2:';
export function installStorageNamespace(): void {
  try {
    const proto = Storage.prototype;
    if ((proto as unknown as { __md2?: boolean }).__md2) return;
    const get = proto.getItem;
    const set = proto.setItem;
    const del = proto.removeItem;
    const k = (key: string) => (key.startsWith('mine-duel') ? NS + key : key);
    proto.getItem = function (key: string) {
      return get.call(this, k(key));
    };
    proto.setItem = function (key: string, value: string) {
      return set.call(this, k(key), value);
    };
    proto.removeItem = function (key: string) {
      return del.call(this, k(key));
    };
    (proto as unknown as { __md2?: boolean }).__md2 = true;
  } catch {
    /* depolama yoksa yok say */
  }
}
