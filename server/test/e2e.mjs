// Uçtan uca test: iki hesap sunucuya bağlanır, kodla aynı masaya oturur ve maçı bitirir.
// Kullanım: node test/e2e.mjs [http://localhost:8787]
const BASE = process.argv[2] ?? "http://localhost:8787";
const ORIGIN = "http://localhost:8765";
const ok = (c, m) => { if (!c) { console.error("HATA:", m); process.exit(1); } console.log("✓", m); };

async function api(path, body, token) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: ORIGIN, ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

function client(token) {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/arena?token=" + encodeURIComponent(token), { headers: { origin: ORIGIN } });
  const c = { state: null, x: null, pending: new Map(), id: 0, events: [] };
  c.open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === "s") { c.state = m.s; c.x = m.x; }
    else if (m.t === "r") { const p = c.pending.get(m.id); c.pending.delete(m.id); m.ok ? p.res(m.v) : p.rej(Object.assign(new Error(m.e.code), m.e)); }
    else c.events.push(m);
  };
  c.call = (method, ...a) => new Promise((res, rej) => { const id = ++c.id; c.pending.set(id, { res, rej }); ws.send(JSON.stringify({ t: "call", id, m: method, a })); });
  c.close = () => ws.close();
  return c;
}
const wait = (f, ms = 20000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { let v; try { v = f(); } catch {} if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error("zaman aşımı")); } }, 40); });

const g1 = await api("/api/auth/guest", {}), g2 = await api("/api/auth/guest", {});
ok(g1.status === 200 && g1.body.token && g1.body.account.guest, "misafir hesap açıldı");
const bad = await api("/api/auth/me", null, "x".repeat(40));
ok(bad.status === 401, "geçersiz anahtar reddedildi");

const A = client(g1.body.token), B = client(g2.body.token);
await A.open; await B.open;
await wait(() => A.state && B.state);
ok(A.state.needsProfile === true, "yeni hesap profil istiyor");
await A.call("createProfile", "Ali", 0); await B.call("createProfile", "Bora", 1);
await wait(() => A.state.me && B.state.me);
ok(A.state.me.balance === 3000, "başlangıç bakiyesi 3000");
await wait(() => A.state.lobby && A.state.lobby.length > 0);
ok(A.state.lobby.length >= 5, `lobide bot masaları var (${A.state.lobby.length})`);

// Hile denemeleri sunucuda reddedilmeli.
const cheat = async (m, ...a) => { try { await A.call(m, ...a); return "geçti"; } catch (e) { return e.code; } };
ok(await cheat("grantReward", "hile:1", 5000) === "bad-reward", "uydurma ödül reddedildi");
ok(await cheat("grantReward", "puzzle:2020-01-01", 300) === "bad-reward", "eski bulmaca ödülü reddedildi");
ok(await cheat("purchase", "neon", 0) === "bad-purchase", "bedava tema reddedildi");
ok(await cheat("stop") === "bad-request", "izinsiz çağrı reddedildi");

// Özel oda: A kurar, B kodla girer; oda botla dolmamalı.
const tv = await A.call("request", { t: "table.create", tier: "bronze", mode: "classic", name: "Test Odası", capacity: 2, private: true });
ok(tv && tv.code, "özel oda kuruldu, kod " + tv.code);
await B.call("joinByCode", tv.code);
await wait(() => A.state.table && A.state.table.players.length === 2);
ok(A.state.table.players.every(p => !p.bot), "odada yalnızca iki gerçek oyuncu var");
await A.call("request", { t: "table.ready", ready: true }); await B.call("request", { t: "table.ready", ready: true });
await wait(() => A.state.match && A.state.match.phase === "playing", 30000);
ok(true, "maç başladı");
A.call("react", A.state.match.id, "😎").catch(() => {});
await wait(() => B.events.some(e => e.t === "react"), 5000).then(() => ok(true, "emoji rakibe ulaştı")).catch(() => ok(false, "emoji ulaşmadı"));

let moves = 0;
while (A.state.match && A.state.match.phase === "playing" && moves < 400) {
  const me = [A, B].find(c => c.state.match && c.state.match.current === c.state.match.viewerSeat && c.state.match.phase === "playing");
  if (!me) { await new Promise(r => setTimeout(r, 30)); continue; }
  const v = me.state.match, hid = v.cells.map((c, i) => (c === -1 ? i : -1)).filter(i => i >= 0);
  try { await me.call("move", v.id, hid[Math.floor(Math.random() * hid.length)], "open"); moves++; } catch (e) { if (e.code !== "not-your-turn") console.log("hamle:", e.code); }
  await new Promise(r => setTimeout(r, 60));
}
await wait(() => A.state.match && A.state.match.phase === "finished", 20000);
ok(true, `maç bitti (${moves} hamle): ` + A.state.match.results.map(r => `${r.username} #${r.rank} +${r.prize}`).join(", "));
await new Promise(r => setTimeout(r, 1500));
ok(A.state.me.balance + B.state.me.balance > 6000 - 200, `bakiyeler güncellendi: ${A.state.me.balance} / ${B.state.me.balance}`);

// Yeniden bağlanınca durum korunur; misafir hesap kalıcıya çevrilir ve e-postayla girilir.
A.close();
const up = await api("/api/auth/upgrade", { email: "ali" + Date.now() + "@ornek.com", password: "gizli-sifre-1" }, g1.body.token);
ok(up.status === 200 && up.body.account.email && !up.body.account.guest, "misafir hesap kalıcıya çevrildi");
const lg = await api("/api/auth/login", { email: up.body.account.email, password: "gizli-sifre-1" });
ok(lg.status === 200 && lg.body.account.uid === g1.body.account.uid, "e-postayla giriş aynı hesaba açıldı");
const wrong = await api("/api/auth/login", { email: up.body.account.email, password: "yanlis-sifre" });
ok(wrong.status === 401, "yanlış şifre reddedildi");
const A2 = client(lg.body.token); await A2.open; await wait(() => A2.state && A2.state.me);
ok(A2.state.me.username === "Ali" && A2.state.me.balance === A.state.me.balance, "yeni cihazda aynı profil ve bakiye");
A2.close(); B.close();
console.log("TÜM TESTLER GEÇTİ");
process.exit(0);
