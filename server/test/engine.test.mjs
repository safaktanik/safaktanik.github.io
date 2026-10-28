// Hızlı motor testi (Cloudflare gerekmez): sunucu motoru iki oyuncuyla bir maçı baştan sona oynatır.
import { install } from "../src/stubs.mjs";
install();
const { zo, gC } = await import("../src/engine.gen.mjs");

const fail = m => { console.error("HATA:", m); process.exit(1); };
const store = gC(null);
const mk = uid => { const z = new zo(store.forUser(uid, { anyWrite: true }), uid, { local: true }); z.noSeed = true; z.start(); return z; };
const wait = (f, ms = 20000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { let v; try { v = f(); } catch {} if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error("zaman aşımı")); } }, 30); });

const A = mk("u_a"), B = mk("u_b");
await wait(() => A.playerLoaded && B.playerLoaded);
await A.createProfile("Deneme", 0);
await B.createProfile("Rakip", 1);
await wait(() => A.state.me && B.state.me);
const tv = await A.request({ t: "table.create", tier: "bronze", mode: "classic", name: "Test", capacity: 2, private: true });
await B.joinByCode(tv.code);
await A.setReady(true);
await B.setReady(true);
await wait(() => A.state.match && A.state.match.phase === "playing", 30000);
let moves = 0;
while (A.state.match && A.state.match.phase === "playing" && moves < 500) {
  const me = [A, B].find(z => z.state.match && z.state.match.current === z.state.match.viewerSeat);
  if (!me) { await new Promise(r => setTimeout(r, 20)); continue; }
  const v = me.state.match, hid = v.cells.map((c, i) => (c === -1 ? i : -1)).filter(i => i >= 0);
  try { await me.move(v.id, hid[Math.floor(Math.random() * hid.length)], "open"); moves++; } catch {}
}
await wait(() => A.state.match && A.state.match.phase === "finished", 20000).catch(() => fail("maç bitmedi"));
if (!A.state.match.results || A.state.match.results.length !== 2) fail("sonuç yok");
console.log(`✓ motor çalışıyor: ${moves} hamlede maç bitti`);
process.exit(0);
