// Canlı sunucu duman testi: profil ve maç oluşturmaz, sıralamayı etkilemez.
// Kullanım: node test/smoke.mjs https://...workers.dev
const BASE = process.argv[2];
const ORIGIN = "https://safaktanik.github.io";
if (!BASE) { console.error("adres gerekli"); process.exit(1); }
const ok = (c, m) => { if (!c) { console.error("HATA:", m); process.exit(1); } console.log("✓", m); };
const H = { "content-type": "application/json", origin: ORIGIN };

const health = await fetch(BASE + "/health");
ok(health.ok, "sunucu ayakta");
const cfg = await (await fetch(BASE + "/api/config", { headers: H })).json();
ok(cfg.ok === true, "ayar ucu çalışıyor (Google: " + (cfg.google ? "açık" : "kapalı") + ")");
if (cfg.google) console.log("  Google istemci kimliği:", JSON.stringify(cfg.google), cfg.google.length + " karakter");
const pre = await fetch(BASE + "/api/auth/guest", { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST" } });
ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === ORIGIN, "oyun sitesine CORS izni var");
const bad = await fetch(BASE + "/api/auth/guest", { method: "POST", headers: { ...H, origin: "https://kotu-site.example" }, body: "{}" });
ok(bad.status === 403, "başka sitelerden hesap açılamıyor");
const g = await (await fetch(BASE + "/api/auth/guest", { method: "POST", headers: H, body: "{}" })).json();
ok(g.token && g.account && g.account.guest, "misafir hesap açıldı");

const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/arena?token=" + encodeURIComponent(g.token), { headers: { origin: ORIGIN } });
let st = null, gems = null; const pend = new Map(); let id = 0;
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === "s") st = m.s; if (m.t === "gems") gems = m.s; if (m.t === "r") pend.get(m.id)?.(m); };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket")); setTimeout(() => rej(new Error("websocket zaman aşımı")), 15000); });
const call = (m, ...a) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ t: "call", id: i, m, a })); });
const t0 = Date.now(); while (!(st && st.lobby && st.lobby.length) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
ok(st && st.needsProfile === true, "canlı bağlantı kuruldu, yeni hesap profil istiyor");
ok(st.lobby.length >= 5, "lobide bot masaları var (" + st.lobby.length + ")");
ok(gems && typeof gems.balance === "number", "hesaba bağlı elmas kaydı geliyor (sunucu güncel)");
const inv = await call("invite", "u_yokboyle123");
ok(!inv.ok && inv.e.code === "not-in-table", "oyun içi davet kuralı çalışıyor");
const lg = await call("league");
ok(!lg.ok && lg.e.code === "no-profile", "çevrimiçi lig ucu var (profilsiz hesaba lig açılmıyor)");
const pc = await call("playerCard", "u_yokboyle123");
ok(!pc.ok && pc.e.code === "not-found", "oyuncu kartı ucu var (" + (pc.ok ? "açıldı" : pc.e.code) + ")");
const r = await call("grantReward", "hile:1", 5000);
ok(!r.ok && r.e.code === "bad-reward", "uydurma ödül reddedildi");
ws.close();
await fetch(BASE + "/api/auth/logout", { method: "POST", headers: { ...H, authorization: "Bearer " + g.token }, body: "{}" });
console.log("CANLI SUNUCU HAZIR");
process.exit(0);
