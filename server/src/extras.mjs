// Hesaba bağlı ek veriler: elmas cüzdanı (sunucu belirler) ve arkadaş listesi (her cihazda aynı).
// Elmas kuralları oyundakiyle aynıdır; her ödül sunucunun doğrulayabildiği bir bilgiye dayanır.

const FRAMES = { gold: 30, neon: 40, fire: 50, rainbow: 60 };
const err = code => Object.assign(new Error(code), { code, status: 400 });

export function blankGems() { return { balance: 0, owned: [], frame: null, claims: [], lastLevel: null, log: [] }; }

export function gemView(g) { return { balance: g.balance, owned: g.owned.slice(), frame: g.frame }; }

// Elmasla satın alınabilen şeyler ve fiyatları: kahraman (açılma seviyesi × 8) ve çerçeveler.
export function priceOf(E, item) {
  let m = /^hero:(\d+)$/.exec(item);
  if (m) { const h = E.Sl[+m[1]]; return h && h.unlock > 1 ? h.unlock * 8 : null; }
  m = /^frame:([a-z]+)$/.exec(item);
  return m && FRAMES[m[1]] ? FRAMES[m[1]] : null;
}

function grant(g, n, key, why, out) {
  if (g.claims.includes(key)) return;
  g.balance += n;
  g.claims.push(key);
  if (g.claims.length > 600) g.claims = g.claims.slice(-600);
  g.log.unshift({ n, why, at: Date.now() });
  g.log = g.log.slice(0, 40);
  out.push({ n, why });
}

// Olay → ödül. ctx: { me (sunucudaki profil), claims (motorun ödül anahtarları), now }
export function gemEvent(E, g, kind, arg, ctx) {
  const out = [], days = [E._i(ctx.now), E._i(ctx.now - 864e5)];
  if (kind === "level") {
    const lv = ctx.me?.level | 0;
    if (!lv) return out;
    if (g.lastLevel === null) g.lastLevel = lv;
    else if (lv > g.lastLevel) { const from = g.lastLevel; g.lastLevel = lv; for (let l = from + 1; l <= lv; l++) grant(g, 5, "lvl:" + l, "Seviye " + l + "!", out); }
  } else if (kind === "badge") {
    if (typeof arg !== "string" || !Object.prototype.hasOwnProperty.call(E.ts, arg)) throw err("bad-request");
    grant(g, 3, "badge:" + arg, "Yeni madalya", out);
  } else if (kind === "quests") {
    if (!days.includes(arg)) throw err("bad-request");
    const keys = E.Mp(arg).map(q => `q:${arg}:${q.id}`);
    if (keys.length && keys.every(k => ctx.claims.includes(k))) grant(g, 3, "quests:" + arg, "Günün görevleri tamam", out);
  } else if (kind === "puzzle") {
    if (!days.includes(arg) || !ctx.claims.includes("puzzle:" + arg)) return out;
    grant(g, 1, "pz:" + arg, "Bulmaca çözüldü", out);
    // 7 günlük seri: art arda çözülen günler
    let n = 0, t = Date.parse(arg + "T00:00:00Z");
    while (g.claims.includes("pz:" + new Date(t).toISOString().slice(0, 10))) { n++; t -= 864e5; }
    if (n > 0 && n % 7 === 0) grant(g, 10, "pzs:" + arg, n + " günlük seri", out);
  } else if (kind === "tutorial") {
    if (ctx.claims.includes("tanik-first-duel")) grant(g, 5, "tutorial", "İlk düello", out);
  } else throw err("bad-request");
  return out;
}

export function gemSpend(E, g, item) {
  if (g.owned.includes(item)) return;
  const price = priceOf(E, item);
  if (price === null) throw err("bad-purchase");
  if (g.balance < price) throw err("insufficient-gems");
  g.balance -= price;
  g.owned.push(item);
  g.log.unshift({ n: -price, why: item, at: Date.now() });
  g.log = g.log.slice(0, 40);
}

export function gemFrame(g, id) {
  if (id !== null && !(typeof id === "string" && g.owned.includes("frame:" + id))) throw err("not-owned");
  g.frame = id;
}

// Çevrimdışı cihazda biriken elmaslar çevrimiçi hesaba bir kez, sınırlı olarak aktarılır.
export function gemImport(E, g, snap) {
  if (g.imported) return;
  g.imported = true;
  const bal = Math.max(0, Math.min(100, Math.floor(Number(snap?.balance) || 0)));
  g.balance += bal;
  for (const it of Array.isArray(snap?.owned) ? snap.owned.slice(0, 20) : [])
    if (typeof it === "string" && priceOf(E, it) !== null && !g.owned.includes(it)) g.owned.push(it);
  if (typeof snap?.frame === "string" && g.owned.includes("frame:" + snap.frame)) g.frame = snap.frame;
  if (bal) g.log.unshift({ n: bal, why: "Bu cihazdan aktarıldı", at: Date.now() });
}

// Arkadaş listesi: yalnızca biçim denetlenir (her oyuncu kendi listesini tutar).
export function cleanFriends(f) {
  const one = x => x && typeof x.uid === "string" && x.uid.length <= 40 ? { uid: x.uid, name: String(x.name ?? "Oyuncu").slice(0, 16), avatar: x.avatar | 0, level: (x.level | 0) || 1, at: +x.at || Date.now() } : null;
  const arr = a => (Array.isArray(a) ? a : []).map(one).filter(Boolean).slice(0, 100);
  return { list: arr(f?.list), out: arr(f?.out), inc: arr(f?.inc) };
}
