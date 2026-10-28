// Motor tarayıcı için yazıldı; sunucuda ihtiyaç duyduğu tarayıcı nesnelerinin zararsız karşılıkları.
// Arkadaşlık isteği olayları (tanik:friend) dışarı aktarılır, gerisi sessizce yok sayılır.
const noop = () => {};
const anyObj = () =>
  new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : k === "relList" ? { supports: () => false } : anyObj()),
    apply: () => anyObj(),
    construct: () => anyObj(),
    set: () => true
  });

export const events = { friend: null };

export function install() {
  const g = globalThis;
  if (g.__tgStubs) return;
  g.__tgStubs = true;
  g.window = g;
  const mem = new Map();
  const store = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    key: i => [...mem.keys()][i] ?? null,
    clear: () => mem.clear(),
    get length() { return mem.size; }
  };
  g.localStorage = store;
  g.sessionStorage = store;
  g.Storage = function () {};
  g.Storage.prototype = {};
  g.document = anyObj();
  g.location = { hostname: "arena", protocol: "https:", search: "", hash: "", pathname: "/", origin: "https://arena", href: "https://arena/" };
  g.history = { replaceState: noop, pushState: noop };
  for (const n of ["MutationObserver", "ResizeObserver", "IntersectionObserver", "HTMLElement", "Element", "Node", "Image", "Audio", "AudioContext", "KeyboardEvent", "Notification"])
    if (!g[n]) g[n] = class { constructor() { return anyObj(); } };
  g.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  g.dispatchEvent = ev => { if (ev && ev.type === "tanik:friend" && events.friend) events.friend(ev.detail); return true; };
  g.addEventListener = noop;
  g.removeEventListener = noop;
  g.requestAnimationFrame = f => setTimeout(f, 16);
  g.cancelAnimationFrame = id => clearTimeout(id);
  g.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop });
  g.getComputedStyle = () => anyObj();
  g.innerWidth = 400;
  g.innerHeight = 800;
  g.screen = { width: 400, height: 800 };
}
