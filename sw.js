/* Mine Duel önbellek katmanı.
   Oyun sayfası önce cihazdaki kopyadan açılır, yenisi arka planda iner; güncelleme düğmesi (?u=) ve
   internet varken ilk açılış her zaman ağdan gelir. version.json hiçbir zaman önbellekten okunmaz. */
var CACHE = "mine-duel-v1";
var CORE = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function home() { return new URL("./", self.registration.scope).pathname; }

function fresh(url) {
  return fetch(url, { cache: "no-cache" }).then(function (res) {
    if (res.ok && res.type === "basic") { var cl = res.clone(); caches.open(CACHE).then(function (c) { c.put("./", cl); }); }
    return res;
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (req.mode === "navigate") {
    if (u.pathname !== home() && u.pathname !== home() + "index.html") return;
    var net = fresh(home());
    if (u.searchParams.has("u")) { e.respondWith(net.catch(function () { return caches.match("./"); })); return; }
    e.waitUntil(net.catch(function () {}));
    e.respondWith(caches.match("./").then(function (hit) { return hit || net; }));
    return;
  }
  var rel = u.pathname.slice(home().length);
  if (CORE.indexOf(rel) > 0 && !u.search) {
    e.respondWith(caches.match(rel).then(function (hit) { return hit || fetch(req); }));
  }
});
