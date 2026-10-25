/**
 * Oyunun kayıtları 'md2:' ad alanında tutulur: 'mine-duel:x' → 'md2:mine-duel:x'. Aynı alan adındaki
 * eski sürümün ad alanı olmayan 'mine-duel…' kayıtları açılışta silinir (profil md2'de kalır).
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
    purgeLegacy(window.localStorage, proto.key, del);
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

/** Eski sürümden kalan ad alansız kayıtları siler (yama öncesi `key`/`removeItem` ile). */
function purgeLegacy(store: Storage, key: Storage['key'], del: Storage['removeItem']): void {
  try {
    const old: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const name = key.call(store, i);
      if (name?.startsWith('mine-duel')) old.push(name);
    }
    for (const name of old) del.call(store, name);
  } catch {
    /* depolama yoksa yok say */
  }
}
