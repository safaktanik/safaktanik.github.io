// Arena: tüm oyuncuların paylaştığı dünya. Hesaplar, oturumlar ve oyun verisi bu nesnenin SQLite deposunda durur.
// Her bağlı oyuncu için sunucuda bir motor örneği (zo) çalışır; oyuncu yalnızca niyetini gönderir, kuralları sunucu uygular.
import { DurableObject } from "cloudflare:workers";
import { install, events } from "./stubs.mjs";
import { METHODS, check } from "./rules.mjs";
import { randomId, sha256, hashPassword, sameString, normEmail, validPassword, verifyGoogle } from "./auth.mjs";

const IDLE_MS = 5 * 60e3;

export class Arena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.users = new Map();
    this.rooms = new Map();
    this.hits = new Map();
    this.ready = ctx.blockConcurrencyWhile(() => this.init());
  }

  async init() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, json TEXT NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS accounts(uid TEXT PRIMARY KEY, email TEXT UNIQUE, salt TEXT, hash TEXT, google TEXT UNIQUE, guest INTEGER NOT NULL, created INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS tokens(th TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL)");
    // Çevrimdışı oyuncuya giden arkadaşlık mesajları bağlandığında iletilir.
    sql.exec("CREATE TABLE IF NOT EXISTS inbox(id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, msg TEXT NOT NULL, at INTEGER NOT NULL)");
    install();
    globalThis.__tgFillMs = Number(this.env.FILL_MS ?? 8000);
    this.E = await import("./engine.gen.mjs");
    const initial = {};
    for (const r of sql.exec("SELECT path, json FROM docs")) initial[r.path] = JSON.parse(r.json);
    this.saved = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
    this.store = this.E.gC({ load: () => initial, save: all => this.persist(all) });
    // Lobideki bot masalarını kuran sunucu örneği.
    this.sys = this.makeZo("sys-arena", false);
  }

  persist(all) {
    const sql = this.ctx.storage.sql, seen = new Set();
    for (const [k, v] of Object.entries(all)) {
      seen.add(k);
      const j = JSON.stringify(v);
      if (this.saved.get(k) !== j) {
        sql.exec("INSERT INTO docs(path, json) VALUES(?, ?) ON CONFLICT(path) DO UPDATE SET json = excluded.json", k, j);
        this.saved.set(k, j);
      }
    }
    for (const k of [...this.saved.keys()]) if (!seen.has(k)) { sql.exec("DELETE FROM docs WHERE path = ?", k); this.saved.delete(k); }
  }

  makeZo(uid, player) {
    const z = new this.E.zo(this.store.forUser(uid, { anyWrite: true }), uid, { local: true }, this.roomFor(uid));
    if (player) z.noSeed = true;
    z.start();
    return z;
  }

  // Masa odası: emojiler ve arkadaşlık istekleri aynı masadaki oyunculara iletilir.
  roomFor(uid) {
    return {
      join: async name => {
        const mine = [];
        return {
          emit: async (topic, data) => {
            const subs = this.rooms.get(name)?.get(topic);
            if (subs) for (const s of [...subs]) if (s.uid !== uid) this.deliver(s, { data, by: uid });
          },
          on: (topic, cb) => {
            let r = this.rooms.get(name);
            if (!r) this.rooms.set(name, (r = new Map()));
            let t = r.get(topic);
            if (!t) r.set(topic, (t = new Set()));
            const s = { uid, cb };
            t.add(s);
            mine.push([name, topic, s]);
            return () => t.delete(s);
          },
          leave: async () => { for (const [n, tp, s] of mine) this.rooms.get(n)?.get(tp)?.delete(s); }
        };
      }
    };
  }

  deliver(s, msg) {
    events.friend = d => this.send(s.uid, { t: "friend", d });
    try { s.cb(msg); } catch {} finally { events.friend = null; }
  }

  // ---------------------------------------------------------------- bağlantılar
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    if (url.pathname === "/arena") return this.socket(req, url);
    return this.api(req, url);
  }

  async socket(req, url) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("websocket gerekli", { status: 426 });
    if (!this.originOk(req)) return new Response("izin yok", { status: 403 });
    const uid = await this.uidOf(url.searchParams.get("token"));
    if (!uid) return new Response("oturum geçersiz", { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.attach(uid, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  attach(uid, ws) {
    let u = this.users.get(uid);
    if (!u) {
      u = { z: this.makeZo(uid, true), socks: new Set(), idle: null, pushT: null, last: "", calls: [] };
      this.users.set(uid, u);
      u.unsub = u.z.subscribe(() => this.push(uid));
      u.unreact = u.z.onReact(evt => this.send(uid, { t: "react", evt }));
    }
    clearTimeout(u.idle);
    u.idle = null;
    u.socks.add(ws);
    ws.send(JSON.stringify({ t: "hello", uid, now: Date.now() }));
    this.push(uid, ws);
    this.flushInbox(uid, ws);
    ws.addEventListener("message", ev => this.onMessage(uid, ws, ev.data));
    const bye = () => {
      if (!u.socks.delete(ws)) return;
      if (!u.socks.size) u.idle = setTimeout(() => this.drop(uid), IDLE_MS);
    };
    ws.addEventListener("close", bye);
    ws.addEventListener("error", bye);
  }

  drop(uid) {
    const u = this.users.get(uid);
    if (!u || u.socks.size) return;
    u.unsub && u.unsub();
    u.unreact && u.unreact();
    u.z.stop();
    this.users.delete(uid);
  }

  flushInbox(uid, ws) {
    const sql = this.ctx.storage.sql, cut = Date.now() - 14 * 864e5;
    const rows = [...sql.exec("SELECT id, msg, at FROM inbox WHERE uid = ? ORDER BY id", uid)];
    for (const r of rows) if (r.at > cut) try { ws.send(r.msg); } catch {}
    if (rows.length) sql.exec("DELETE FROM inbox WHERE uid = ?", uid);
  }

  online(uid) { const u = this.users.get(uid); return !!u && u.socks.size > 0; }

  // Oyuncunun durumu: menüde, bir masada bekliyor ya da maçta.
  // Oyuncunun oturduğu masa: motorun takip ettiği masa ya da (yeni kurulduysa) oyuncu kaydındaki masa.
  tableOf(uid) {
    const z = this.users.get(uid)?.z;
    if (z?.tableDoc) return z.tableDoc;
    const at = this.store.docs.get(`players/${uid}`)?.seatAt;
    return at ? this.store.docs.get(`tables/${at}`) ?? null : null;
  }

  status(uid) {
    const t = this.tableOf(uid);
    if (!t) return "menu";
    if (t.status === "playing" && t.match) {
      const p = t.match.s.players.find(x => x.userId === uid);
      return p && !p.eliminated ? "match" : "menu";
    }
    return (t.status === "waiting" || t.status === "countdown") && t.seats.some(x => x.uid === uid) ? "table" : "menu";
  }

  profile(uid) {
    const me = this.users.get(uid)?.z.state.me;
    if (!me) throw Object.assign(new Error("no-profile"), { code: "no-profile", status: 400 });
    return { name: me.username, avatar: me.avatar, level: me.level };
  }

  // Motor dışındaki çağrılar: arkadaş durumu, doğrudan arkadaşlık mesajı ve oyun içi davet.
  arenaCall(uid, m, a) {
    const u = this.users.get(uid), now = Date.now(), uidOk = x => typeof x === "string" && /^u_[A-Za-z0-9_-]{6,24}$/.test(x) && x !== uid;
    const bad = code => Object.assign(new Error(code), { code, status: 400 });
    if (m === "presence") {
      const list = Array.isArray(a[0]) ? a[0].filter(x => typeof x === "string").slice(0, 100) : [];
      const out = {};
      for (const id of list) {
        const p = this.store.docs.get(`players/${id}`);
        out[id] = { on: this.online(id), st: this.online(id) ? this.status(id) : "off", name: p?.name ?? null, avatar: p?.avatar ?? null };
      }
      return out;
    }
    if (m === "friendTo") {
      const q = a[0] ?? {};
      if (!["req", "ok", "no", "cancel", "del"].includes(q.t) || !uidOk(q.to)) throw bad("bad-request");
      u.friendHits = (u.friendHits ?? []).filter(t => now - t < 60e3);
      if (u.friendHits.length >= 20) throw bad("rate-limited");
      u.friendHits.push(now);
      const f = JSON.stringify({ t: "friend", d: { t: q.t, from: uid, ...this.profile(uid) } });
      if (this.online(q.to)) this.send(q.to, JSON.parse(f));
      else {
        const sql = this.ctx.storage.sql;
        if ([...sql.exec("SELECT COUNT(*) AS n FROM inbox WHERE uid = ?", q.to)][0].n < 50) sql.exec("INSERT INTO inbox(uid, msg, at) VALUES(?, ?, ?)", q.to, f, now);
      }
      return true;
    }
    if (m === "invite") {
      const to = a[0];
      if (!uidOk(to)) throw bad("bad-request");
      const t = this.tableOf(uid);
      if (!t || !(t.status === "waiting" || t.status === "countdown") || !t.seats.some(x => x.uid === uid) || !t.code) throw bad("not-in-table");
      if (!this.online(to)) throw bad("friend-offline");
      u.invites = u.invites ?? new Map();
      if (now - (u.invites.get(to) ?? 0) < 15e3) throw bad("rate-limited");
      u.invites.set(to, now);
      this.send(to, { t: "invite", d: { from: uid, ...this.profile(uid), code: t.code, table: t.name, mode: t.mode, fee: t.entryFee, seats: t.seats.length, max: t.maxPlayers } });
      return true;
    }
    throw bad("bad-request");
  }

  frame(u) {
    return JSON.stringify({ t: "s", s: u.z.state, x: { claims: u.z.claimedKeys(), owned: u.z.ownedItems() }, now: Date.now() });
  }

  // Durum değiştikçe oyuncunun tüm cihazlarına güncel görünüm gönderilir (kısa aralıklarla birleştirilerek).
  push(uid, only) {
    const u = this.users.get(uid);
    if (!u) return;
    if (only) { try { const f = this.frame(u); u.last = f; only.send(f); } catch {} return; }
    if (u.pushT) return;
    u.pushT = setTimeout(() => {
      u.pushT = null;
      const f = this.frame(u);
      if (f === u.last) return;
      u.last = f;
      for (const ws of u.socks) try { ws.send(f); } catch {}
    }, 40);
  }

  send(uid, msg) {
    const u = this.users.get(uid);
    if (!u) return;
    const f = JSON.stringify(msg);
    for (const ws of u.socks) try { ws.send(f); } catch {}
  }

  async onMessage(uid, ws, raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "ping") return ws.send(JSON.stringify({ t: "pong", now: Date.now() }));
    if (msg.t !== "call" || typeof msg.id !== "number") return;
    const u = this.users.get(uid);
    const reply = r => { try { ws.send(JSON.stringify({ t: "r", id: msg.id, ...r })); } catch {} };
    // Saniyede en fazla 15 çağrı.
    const now = Date.now();
    u.calls = u.calls.filter(t => now - t < 1000);
    if (u.calls.length >= 15) return reply({ ok: false, e: { code: "rate-limited", status: 429 } });
    u.calls.push(now);
    try {
      if (msg.m === "presence" || msg.m === "friendTo" || msg.m === "invite") {
        reply({ ok: true, v: this.arenaCall(uid, msg.m, Array.isArray(msg.a) ? msg.a : []) });
        return;
      }
      check(this.E, msg.m, msg.a ?? []);
      const v = await u.z[msg.m](...(msg.a ?? []));
      reply({ ok: true, v: v === undefined ? null : v });
      this.push(uid);
    } catch (e) {
      reply({ ok: false, e: { code: e?.code ?? "server-error", status: e?.status ?? 500 } });
    }
  }

  // ---------------------------------------------------------------- hesaplar
  originOk(req) {
    const o = req.headers.get("Origin");
    if (!o) return true;
    return (this.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).includes(o);
  }

  cors(req, res) {
    const o = req.headers.get("Origin");
    if (o && this.originOk(req)) {
      res.headers.set("Access-Control-Allow-Origin", o);
      res.headers.set("Vary", "Origin");
    }
    return res;
  }

  json(req, body, status = 200) {
    return this.cors(req, new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }));
  }

  limited(req, max = 20) {
    const ip = req.headers.get("CF-Connecting-IP") ?? "yerel", now = Date.now();
    const h = (this.hits.get(ip) ?? []).filter(t => now - t < 60e3);
    h.push(now);
    this.hits.set(ip, h);
    if (this.hits.size > 5000) this.hits.clear();
    return h.length > max;
  }

  async uidOf(token) {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
    const th = await sha256(token);
    const row = [...this.ctx.storage.sql.exec("SELECT uid, seen FROM tokens WHERE th = ?", th)][0];
    if (!row) return null;
    if (Date.now() - row.seen > 864e5) this.ctx.storage.sql.exec("UPDATE tokens SET seen = ? WHERE th = ?", Date.now(), th);
    return row.uid;
  }

  async issue(uid) {
    const token = randomId(32), now = Date.now();
    this.ctx.storage.sql.exec("INSERT INTO tokens(th, uid, created, seen) VALUES(?, ?, ?, ?)", await sha256(token), uid, now, now);
    return token;
  }

  account(uid) {
    const a = [...this.ctx.storage.sql.exec("SELECT uid, email, google, guest FROM accounts WHERE uid = ?", uid)][0];
    return a ? { uid: a.uid, email: a.email ?? null, google: !!a.google, guest: !!a.guest } : null;
  }

  // Panelden yapıştırılan değerin sonundaki boşluk ya da satır sonu Google'da "istemci bulunamadı" hatası verir.
  googleId() { return String(this.env.GOOGLE_CLIENT_ID ?? "").trim(); }

  newUid() { return "u_" + randomId(9); }

  async api(req, url) {
    const p = url.pathname, sql = this.ctx.storage.sql;
    if (req.method === "GET" && p === "/api/config")
      return this.json(req, { ok: true, google: this.googleId() || null, online: this.users.size });
    if (!p.startsWith("/api/auth/")) return this.json(req, { error: "not-found" }, 404);
    if (!this.originOk(req)) return this.json(req, { error: "forbidden-origin" }, 403);
    if (this.limited(req)) return this.json(req, { error: "rate-limited" }, 429);
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const done = async uid => this.json(req, { token: await this.issue(uid), account: this.account(uid) });
    try {
      if (req.method === "GET" && p === "/api/auth/me") {
        const uid = await this.uidOf(bearer);
        return uid ? this.json(req, { account: this.account(uid) }) : this.json(req, { error: "unauthorized" }, 401);
      }
      if (req.method !== "POST") return this.json(req, { error: "not-found" }, 404);
      if (p === "/api/auth/guest") {
        const uid = this.newUid();
        sql.exec("INSERT INTO accounts(uid, guest, created) VALUES(?, 1, ?)", uid, Date.now());
        return done(uid);
      }
      if (p === "/api/auth/register" || p === "/api/auth/upgrade") {
        const email = normEmail(body.email);
        if (!email) return this.json(req, { error: "bad-email" }, 400);
        if (!validPassword(body.password)) return this.json(req, { error: "weak-password" }, 400);
        if ([...sql.exec("SELECT 1 FROM accounts WHERE email = ?", email)].length) return this.json(req, { error: "email-taken" }, 409);
        const { salt, hash } = await hashPassword(body.password);
        if (p === "/api/auth/register") {
          const uid = this.newUid();
          sql.exec("INSERT INTO accounts(uid, email, salt, hash, guest, created) VALUES(?, ?, ?, ?, 0, ?)", uid, email, salt, hash, Date.now());
          return done(uid);
        }
        const uid = await this.uidOf(bearer);
        if (!uid) return this.json(req, { error: "unauthorized" }, 401);
        if (this.account(uid)?.email) return this.json(req, { error: "already-linked" }, 409);
        sql.exec("UPDATE accounts SET email = ?, salt = ?, hash = ?, guest = 0 WHERE uid = ?", email, salt, hash, uid);
        return this.json(req, { account: this.account(uid) });
      }
      if (p === "/api/auth/login") {
        const email = normEmail(body.email);
        const row = email && [...sql.exec("SELECT uid, salt, hash FROM accounts WHERE email = ?", email)][0];
        const { hash } = await hashPassword(String(body.password ?? ""), row ? row.salt : "yok");
        if (!row || !sameString(hash, row.hash)) return this.json(req, { error: "bad-credentials" }, 401);
        return done(row.uid);
      }
      if (p === "/api/auth/google") {
        const g = await verifyGoogle(body.credential, this.googleId());
        const found = [...sql.exec("SELECT uid FROM accounts WHERE google = ?", g.sub)][0];
        const me = bearer ? await this.uidOf(bearer) : null;
        if (found) {
          if (me && me !== found.uid) return this.json(req, { error: "google-in-use" }, 409);
          return done(found.uid);
        }
        if (me) {
          sql.exec("UPDATE accounts SET google = ?, guest = 0 WHERE uid = ?", g.sub, me);
          return this.json(req, { account: this.account(me) });
        }
        const uid = this.newUid();
        sql.exec("INSERT INTO accounts(uid, google, guest, created) VALUES(?, ?, 0, ?)", uid, g.sub, Date.now());
        return done(uid);
      }
      if (p === "/api/auth/logout") {
        if (bearer) sql.exec("DELETE FROM tokens WHERE th = ?", await sha256(bearer));
        return this.json(req, { ok: true });
      }
      return this.json(req, { error: "not-found" }, 404);
    } catch (e) {
      const code = String(e?.message ?? "");
      if (/token|google/.test(code)) return this.json(req, { error: code }, 401);
      return this.json(req, { error: "server-error" }, 500);
    }
  }
}
