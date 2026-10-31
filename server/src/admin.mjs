// Yönetim paneli: yalnızca yönetici e-postalarıyla (ADMIN_EMAILS) Google girişi yapanlar kullanır.
// Her işlem kim/ne zaman/neden bilgisiyle adminlog tablosuna yazılır.
import { randomId, sha256, verifyGoogle, sameString } from "./auth.mjs";
import { TIERS } from "./league.mjs";

const TOKEN_MS = 12 * 3600e3;
const DAY = 864e5;
const MOD_ACTIONS = new Set(["stats", "search", "player", "rename", "warn", "ban", "unban", "kick", "reports", "report", "feedback", "feedbackDone", "suspicious", "me"]);
const err = (code, status = 400) => Object.assign(new Error(code), { code, status });

// "a@b.com, mod:c@d.com" → { "a@b.com": "admin", "c@d.com": "mod" }
function maskEmail(e) {
  const [u, d] = String(e).split("@");
  return d ? u.slice(0, 1) + "***@" + d : "***";
}
function maskEmails(v) {
  if (Array.isArray(v)) return v.map(maskEmails);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = k === "email" && typeof v[k] === "string" && v[k].includes("@") && !/@yerel$/.test(v[k]) ? maskEmail(v[k]) : maskEmails(v[k]);
    return o;
  }
  return v;
}

export function adminList(env) {
  const out = {};
  for (const raw of String(env.ADMIN_EMAILS ?? "").split(",")) {
    const s = raw.trim().toLowerCase();
    if (!s) continue;
    const mod = s.startsWith("mod:");
    const email = mod ? s.slice(4).trim() : s;
    if (email.includes("@")) out[email] = mod ? "mod" : "admin";
  }
  return out;
}

// Ekonomi ayarlarının varsayılanları (oyunun kendi değerleri).
export const ECO_DEFAULT = { daily: 250, streak: 50, maxStreak: 250, prizeMul: 1, questMul: 1, puzzleMul: 1, eventName: "", eventUntil: 0 };

export function initAdmin(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS admin_tokens(th TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, expires INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS adminlog(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, email TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT)");
  sql.exec("CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, json TEXT NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, by TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'open', handled_by TEXT, handled_at INTEGER, outcome TEXT)");
  sql.exec("CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, uid TEXT, kind TEXT, stars INTEGER, text TEXT NOT NULL, name TEXT, device TEXT, version TEXT, status TEXT NOT NULL DEFAULT 'new')");
  sql.exec("CREATE TABLE IF NOT EXISTS signups(uid TEXT PRIMARY KEY, iph TEXT, at INTEGER NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS activity(day TEXT NOT NULL, uid TEXT NOT NULL, PRIMARY KEY(day, uid))");
  sql.exec("CREATE TABLE IF NOT EXISTS daily(day TEXT NOT NULL, k TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY(day, k))");
  sql.exec("CREATE TABLE IF NOT EXISTS dmatch(day TEXT NOT NULL, mid TEXT NOT NULL, PRIMARY KEY(day, mid))");
}

export class Admin {
  constructor(arena) { this.A = arena; }
  get sql() { return this.A.ctx.storage.sql; }
  get E() { return this.A.E; }
  day(t = Date.now()) { return this.E._i(t); }

  // ------------------------------------------------------------ ayarlar (duyuru, bakım, ekonomi, lig)
  cfg(key) {
    if (!this.cache) {
      this.cache = {};
      for (const r of this.sql.exec("SELECT key, json FROM config")) this.cache[r.key] = JSON.parse(r.json);
    }
    return key ? this.cache[key] ?? null : this.cache;
  }
  setCfg(key, v) {
    this.cfg();
    if (v === null) { this.sql.exec("DELETE FROM config WHERE key = ?", key); delete this.cache[key]; }
    else { this.sql.exec("INSERT INTO config(key, json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json", key, JSON.stringify(v)); this.cache[key] = v; }
    this.apply();
  }
  eco() { return { ...ECO_DEFAULT, ...(this.cfg("eco") ?? {}) }; }
  // Etkinlik süresi dolmuşsa çarpanlar 1'e döner.
  mul() {
    const e = this.eco(), on = e.eventUntil > Date.now();
    return { prize: on ? e.prizeMul : 1, quest: on ? e.questMul : 1, puzzle: on ? e.puzzleMul : 1, event: on ? { name: e.eventName || "Etkinlik", until: e.eventUntil } : null };
  }
  // Oyunculara giden herkese açık ayarlar.
  publicCfg() {
    const a = this.cfg("announce"), m = this.cfg("maint"), now = Date.now();
    return {
      announce: a && (!a.until || a.until > now) ? { id: a.id, text: a.text, tone: a.tone, until: a.until || 0 } : null,
      maint: m && m.on ? { msg: m.msg || "" } : null,
      mul: this.mul()
    };
  }
  // Ekonomi ayarlarını sunucudaki oyun motoruna uygular ve bağlı oyunculara duyurur.
  apply() {
    const e = this.eco(), K = this.E.K;
    if (K && K.daily) { K.daily.base = e.daily; K.daily.streakBonus = e.streak; K.daily.maxStreakBonus = e.maxStreak; }
    globalThis.__tgPrizeMul = this.mul().prize;
    const f = JSON.stringify({ t: "cfg", c: this.publicCfg() });
    for (const [uid, u] of this.A.users) {
      // Günlük ödül miktarı gibi türetilen değerler yeni ayarla yeniden hesaplanır.
      try { u.z.recompute && u.z.recompute(); } catch {}
      if (uid.startsWith("u_")) this.A.push(uid);
      for (const ws of u.socks) try { ws.send(f); } catch {}
    }
  }
  maintenance() { const m = this.cfg("maint"); return !!(m && m.on); }

  // ------------------------------------------------------------ istatistik kayıtları
  seen(uid) {
    try { this.sql.exec("INSERT OR IGNORE INTO activity(day, uid) VALUES(?, ?)", this.day(), uid); } catch {}
  }
  bump(k, n = 1, day = this.day()) {
    this.sql.exec("INSERT INTO daily(day, k, v) VALUES(?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET v = v + excluded.v", day, k, n);
  }
  // Oyuncu kaydındaki yeni maç ve bakiye hareketleri günlük sayaçlara eklenir.
  track(uid, u) {
    const p = this.A.store.docs.get(`players/${uid}`);
    if (!p) return;
    const r = p.recent?.[0], t = p.tx?.[0];
    if (u.trk === undefined) { u.trk = { r: r?.match_id ?? null, t: t?.id ?? null }; return; }
    if (r && r.match_id !== u.trk.r) {
      const d = this.day(r.finished_at);
      if (this.sql.exec("INSERT OR IGNORE INTO dmatch(day, mid) VALUES(?, ?)", d, r.match_id).rowsWritten > 0) { this.bump("match", 1, d); this.bump("mode:" + (r.mode || "classic"), 1, d); }
      u.trk.r = r.match_id;
    }
    if (t && t.id !== u.trk.t) {
      for (const x of p.tx) {
        if (x.id === u.trk.t) break;
        this.bump((x.amount >= 0 ? "in:" : "out:") + x.transaction_type, Math.abs(x.amount | 0), this.day(x.created_at));
      }
      u.trk.t = t.id;
    }
  }
  async signup(uid, req) {
    const ip = req.headers.get("CF-Connecting-IP") ?? "";
    this.sql.exec("INSERT OR IGNORE INTO signups(uid, iph, at) VALUES(?, ?, ?)", uid, ip ? (await sha256("ip:" + ip)).slice(0, 16) : null, Date.now());
  }
  prune() {
    const cut = this.day(Date.now() - 60 * DAY);
    this.sql.exec("DELETE FROM activity WHERE day < ?", cut);
    this.sql.exec("DELETE FROM dmatch WHERE day < ?", cut);
    this.sql.exec("UPDATE signups SET iph = NULL WHERE at < ?", Date.now() - 30 * DAY);
  }

  // ------------------------------------------------------------ moderasyon durumu
  mod(uid) { const x = this.A.extras(uid); return (x.mod ??= { ban: null, warns: [], notes: [] }); }
  banned(uid) {
    const b = this.mod(uid).ban;
    if (!b) return null;
    if (b.until && b.until <= Date.now()) { this.mod(uid).ban = null; this.A.saveExtras(uid); return null; }
    return b;
  }
  kick(uid, msg) {
    const u = this.A.users.get(uid);
    if (!u) return 0;
    let n = 0;
    for (const ws of [...u.socks]) { try { if (msg) ws.send(JSON.stringify(msg)); ws.close(4003, "admin"); } catch {} n++; }
    return n;
  }
  // Bağlanınca okunmamış yönetici mesajları iletilir.
  deliverNotices(uid, ws) {
    const m = this.mod(uid), un = m.warns.filter(w => !w.seen);
    if (!un.length) return;
    for (const w of un) { try { ws.send(JSON.stringify({ t: "notice", d: { text: w.text, at: w.at } })); } catch {} w.seen = Date.now(); }
    this.A.saveExtras(uid);
  }

  // ------------------------------------------------------------ oyuncu tarafı: şikayet ve geri bildirim
  report(uid, a) {
    const target = a[0], reason = a[1], note = String(a[2] ?? "").slice(0, 300);
    if (typeof target !== "string" || !/^u_[A-Za-z0-9_-]{6,24}$/.test(target) || target === uid) throw err("bad-request");
    if (!["name", "cheat", "behavior", "other"].includes(reason)) throw err("bad-request");
    if (!this.A.store.docs.get(`players/${target}`)) throw err("not-found");
    const today = [...this.sql.exec("SELECT COUNT(*) AS n FROM reports WHERE by = ? AND at > ?", uid, Date.now() - DAY)][0].n;
    if (today >= 10) throw err("rate-limited", 429);
    if ([...this.sql.exec("SELECT 1 FROM reports WHERE by = ? AND target = ? AND status = 'open'", uid, target)].length) return { dup: true };
    this.sql.exec("INSERT INTO reports(at, by, target, reason, note) VALUES(?, ?, ?, ?, ?)", Date.now(), uid, target, reason, note || null);
    return { ok: true };
  }
  async feedbackIn(req, body, uid) {
    const text = String(body.mesaj ?? "").trim().slice(0, 3000), stars = Math.max(0, Math.min(5, body.puan | 0));
    if (!text && !stars) throw err("bad-request");
    const kind = String(body.tur ?? "").slice(0, 30), name = String(body.isim ?? "").slice(0, 40), device = String(body.cihaz ?? "").slice(0, 300), version = String(body.surum ?? "").slice(0, 20);
    if ([...this.sql.exec("SELECT COUNT(*) AS n FROM feedback")][0].n > 5000) {
      this.sql.exec("DELETE FROM feedback WHERE id IN (SELECT id FROM feedback WHERE status = 'done' ORDER BY id LIMIT 500)");
      // Hepsi okunmamışsa en eskiler silinir (sahte gönderimlerle depo şişmesin).
      if ([...this.sql.exec("SELECT COUNT(*) AS n FROM feedback")][0].n > 5000) this.sql.exec("DELETE FROM feedback WHERE id IN (SELECT id FROM feedback ORDER BY id LIMIT 500)");
    }
    this.sql.exec("INSERT INTO feedback(at, uid, kind, stars, text, name, device, version) VALUES(?, ?, ?, ?, ?, ?, ?, ?)", Date.now(), uid, kind, stars, text || "(yalnızca puan)", name || null, device || null, version || null);
  }

  // ------------------------------------------------------------ giriş
  async login(body, req) {
    const list = adminList(this.A.env);
    const dev = String(this.A.env.ADMIN_DEV_KEY ?? "");
    if (dev && body.devKey) {
      if (!sameString(String(body.devKey), dev)) throw err("forbidden", 403);
      return this.issue(String(body.email || "gelistirici@yerel").toLowerCase(), body.role === "mod" ? "mod" : "admin");
    }
    const g = await verifyGoogle(body.credential, this.A.googleId());
    const role = g.email && list[g.email];
    if (!role) { this.log(g.email || "?", "login-denied", null, null); throw Object.assign(err("not-admin", 403), { email: g.email || null }); }
    return this.issue(g.email, role);
  }
  async issue(email, role) {
    const token = randomId(32);
    this.sql.exec("DELETE FROM admin_tokens WHERE expires < ?", Date.now());
    this.sql.exec("INSERT INTO admin_tokens(th, email, role, expires) VALUES(?, ?, ?, ?)", await sha256("adm:" + token), email, role, Date.now() + TOKEN_MS);
    this.log(email, "login", null, { role });
    return { token, email, role, expires: Date.now() + TOKEN_MS };
  }
  async who(bearer) {
    if (typeof bearer !== "string" || bearer.length < 20 || bearer.length > 100) return null;
    const r = [...this.sql.exec("SELECT email, role, expires FROM admin_tokens WHERE th = ?", await sha256("adm:" + bearer))][0];
    if (!r || r.expires < Date.now()) return null;
    // Yetki her istekte yeniden denetlenir: listeden çıkarılan yönetici hemen erişimini kaybeder.
    const role = this.A.env.ADMIN_DEV_KEY && r.email.endsWith("@yerel") ? r.role : adminList(this.A.env)[r.email];
    return role ? { email: r.email, role: role === "admin" && r.role === "mod" ? "mod" : role } : null;
  }
  log(email, action, target, detail) {
    this.sql.exec("INSERT INTO adminlog(at, email, action, target, detail) VALUES(?, ?, ?, ?, ?)", Date.now(), email, action, target ?? null, detail ? JSON.stringify(detail) : null);
  }

  // ------------------------------------------------------------ panel işlemleri
  async run(me, action, a) {
    if (me.role !== "admin" && !MOD_ACTIONS.has(action)) throw err("forbidden", 403);
    const fn = this["do_" + action];
    if (typeof fn !== "function") throw err("not-found", 404);
    if (!a || typeof a !== "object" || Array.isArray(a)) a = {};
    const v = await fn.call(this, a, me);
    // Moderatör oyuncu e-postalarını tam görmez (kişisel veri; moderasyon için gerekmez).
    return me.role === "admin" || action === "me" ? v : maskEmails(v);
  }

  do_me(a, me) { return me; }

  do_stats() {
    const sql = this.sql, now = Date.now(), days = [];
    for (let i = 6; i >= 0; i--) days.push(this.day(now - i * DAY));
    const count = (q, ...p) => [...sql.exec(q, ...p)][0].n;
    const per = days.map(d => ({
      day: d,
      active: count("SELECT COUNT(*) AS n FROM activity WHERE day = ?", d),
      matches: [...sql.exec("SELECT v FROM daily WHERE day = ? AND k = 'match'", d)][0]?.v ?? 0,
      signups: count("SELECT COUNT(*) AS n FROM accounts WHERE created >= ? AND created < ?", Date.parse(d + "T00:00:00+03:00"), Date.parse(d + "T00:00:00+03:00") + DAY)
    }));
    const today = days[6], modes = {}, coins = { in: {}, out: {} };
    for (const r of sql.exec("SELECT k, v FROM daily WHERE day = ?", today)) {
      if (r.k.startsWith("mode:")) modes[r.k.slice(5)] = r.v;
      else if (r.k.startsWith("in:")) coins.in[r.k.slice(3)] = r.v;
      else if (r.k.startsWith("out:")) coins.out[r.k.slice(4)] = r.v;
    }
    let online = 0;
    for (const u of this.A.users.values()) if (u.socks.size) online++;
    let profiles = 0;
    for (const k of this.A.store.docs.keys()) if (k.startsWith("players/u_")) profiles++;
    return {
      online, today, per, modes, coins,
      active7: count("SELECT COUNT(DISTINCT uid) AS n FROM activity WHERE day >= ?", days[0]),
      accounts: count("SELECT COUNT(*) AS n FROM accounts"), profiles,
      openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      newFeedback: count("SELECT COUNT(*) AS n FROM feedback WHERE status = 'new'"),
      banned: [...sql.exec("SELECT json FROM extras")].filter(r => { const m = JSON.parse(r.json).mod; return m && m.ban && (!m.ban.until || m.ban.until > now); }).length
    };
  }

  row(uid) {
    const p = this.A.store.docs.get(`players/${uid}`), acc = this.A.account(uid);
    const b = this.banned(uid);
    return {
      uid, name: p?.name ?? null, avatar: p?.avatar ?? 0, level: p ? this.E.Us(p.xp | 0) : 0, balance: p?.balance ?? 0,
      games: p?.games ?? 0, wins: p?.wins ?? 0, email: acc?.email ?? null, google: !!acc?.google, guest: !!acc?.guest,
      online: this.A.online(uid), banned: b ? { until: b.until || 0 } : null
    };
  }

  do_search(a, me) {
    const q = String(a.q ?? "").trim().toLowerCase().slice(0, 60), out = [], seen = new Set();
    const add = uid => { if (!seen.has(uid) && this.A.account(uid)) { seen.add(uid); out.push(this.row(uid)); } };
    if (!q) {
      for (const u of this.A.users.keys()) if (u.startsWith("u_") && this.A.online(u)) add(u);
      for (const r of this.sql.exec("SELECT uid FROM accounts ORDER BY created DESC LIMIT 30")) add(r.uid);
      return out.slice(0, 50);
    }
    const raw = String(a.q ?? "").trim();
    if (/^u_[a-z0-9_-]+$/i.test(raw)) add(raw);
    // E-postayla arama yalnızca yönetici için (moderatör bir adresin kayıtlı olup olmadığını öğrenemesin).
    if (me.role === "admin") for (const r of this.sql.exec("SELECT uid FROM accounts WHERE email LIKE ? LIMIT 20", `%${q}%`)) add(r.uid);
    for (const [k, v] of this.A.store.docs) {
      if (out.length >= 50) break;
      if (k.startsWith("players/u_") && String(v.name ?? "").toLowerCase().includes(q)) add(k.slice(8));
    }
    return out;
  }

  do_player(a) {
    const uid = String(a.uid ?? "");
    const acc = this.A.account(uid);
    if (!acc) throw err("not-found", 404);
    const p = this.A.store.docs.get(`players/${uid}`) ?? null, x = this.A.extras(uid), sql = this.sql;
    const tok = [...sql.exec("SELECT COUNT(*) AS n, MAX(seen) AS last FROM tokens WHERE uid = ?", uid)][0];
    const created = [...sql.exec("SELECT created FROM accounts WHERE uid = ?", uid)][0]?.created ?? null;
    const L = x.league;
    return {
      ...this.row(uid), created, sessions: tok.n, lastSeen: tok.last ?? null,
      status: this.A.online(uid) ? this.A.status(uid) : "off",
      profile: p ? { name: p.name, avatar: p.avatar, xp: p.xp, level: this.E.Us(p.xp | 0), balance: p.balance, wins: p.wins, losses: p.losses, games: p.games, best: p.best, week: p.week, wPoints: p.wPoints, streak: p.streak, lastDaily: p.lastDaily, createdAt: p.createdAt } : null,
      recent: (p?.recent ?? []).slice(0, 12), tx: (p?.tx ?? []).slice(0, 25),
      gems: { balance: x.gems.balance, owned: x.gems.owned, frame: x.gems.frame, log: (x.gems.log ?? []).slice(0, 15) },
      friends: (x.friends?.list ?? []).map(f => ({ uid: f.uid, name: f.name })),
      league: L ? { week: L.week, tier: TIERS[L.tier]?.name ?? null, gid: L.gid, pts: L.pts } : null,
      mod: { ban: this.banned(uid), warns: this.mod(uid).warns.slice(-10), notes: this.mod(uid).notes.slice(-10) },
      reports: [...sql.exec("SELECT id, at, by, reason, note, status FROM reports WHERE target = ? ORDER BY id DESC LIMIT 10", uid)],
      log: [...sql.exec("SELECT at, email, action, detail FROM adminlog WHERE target = ? ORDER BY id DESC LIMIT 15", uid)]
    };
  }

  need(a) {
    const uid = String(a.uid ?? "");
    if (!this.A.account(uid)) throw err("not-found", 404);
    return uid;
  }
  reason(a, min = 3) {
    const r = String(a.reason ?? "").trim().slice(0, 300);
    if (r.length < min) throw err("reason-required");
    return r;
  }
  async writePlayer(uid, f) {
    const path = `players/${uid}`, cur = this.A.store.docs.get(path);
    if (!cur) throw err("no-profile");
    const next = f(JSON.parse(JSON.stringify(cur)));
    await this.A.store.forUser("admin", { anyWrite: true }).doc(path).set(next);
    return next;
  }

  async do_rename(a, me) {
    const uid = this.need(a), name = String(a.name ?? "").trim();
    if (!/^[\p{L}\p{N}_ ]{3,16}$/u.test(name)) throw err("bad-username");
    const reason = this.reason(a);
    let old = null;
    await this.writePlayer(uid, p => { old = p.name; p.name = name; return p; });
    this.mod(uid).warns.push({ text: `Kullanıcı adın yönetici tarafından "${name}" olarak değiştirildi. Gerekçe: ${reason}`, at: Date.now(), by: me.email });
    this.A.saveExtras(uid);
    this.pushNotices(uid);
    this.log(me.email, "rename", uid, { from: old, to: name, reason });
    return this.row(uid);
  }

  do_warn(a, me) {
    const uid = this.need(a), text = String(a.text ?? "").trim().slice(0, 500);
    if (text.length < 3) throw err("text-required");
    this.mod(uid).warns.push({ text, at: Date.now(), by: me.email });
    this.A.saveExtras(uid);
    this.pushNotices(uid);
    this.log(me.email, "warn", uid, { text });
    return { ok: true, delivered: this.A.online(uid) };
  }
  pushNotices(uid) {
    const u = this.A.users.get(uid);
    if (u) for (const ws of u.socks) this.deliverNotices(uid, ws);
  }

  do_ban(a, me) {
    const uid = this.need(a), reason = this.reason(a), hours = Number(a.hours) || 0;
    if (hours <= 0 && me.role !== "admin") throw err("forbidden", 403);
    if (me.role !== "admin" && hours > 7 * 24) throw err("forbidden", 403);
    const until = hours > 0 ? Date.now() + Math.min(hours, 24 * 365) * 3600e3 : 0;
    this.mod(uid).ban = { until, reason, by: me.email, at: Date.now() };
    this.A.saveExtras(uid);
    const kicked = this.kick(uid, { t: "banned", d: { until, reason } });
    this.log(me.email, "ban", uid, { hours: hours || "kalıcı", reason });
    return { ok: true, until, kicked };
  }
  do_unban(a, me) {
    const uid = this.need(a);
    this.mod(uid).ban = null;
    this.A.saveExtras(uid);
    this.log(me.email, "unban", uid, { reason: String(a.reason ?? "").slice(0, 300) || null });
    return { ok: true };
  }
  do_kick(a, me) {
    const uid = this.need(a);
    const n = [...this.sql.exec("SELECT COUNT(*) AS n FROM tokens WHERE uid = ?", uid)][0].n;
    this.sql.exec("DELETE FROM tokens WHERE uid = ?", uid);
    const kicked = this.kick(uid, { t: "signedout", d: { reason: "admin" } });
    this.log(me.email, "logout-all", uid, { sessions: n });
    return { ok: true, sessions: n, kicked };
  }

  async do_adjust(a, me) {
    const uid = this.need(a), reason = this.reason(a);
    const coins = Math.trunc(Number(a.coins) || 0), gems = Math.trunc(Number(a.gems) || 0);
    if (!coins && !gems) throw err("nothing-to-do");
    if (Math.abs(coins) > 1e6 || Math.abs(gems) > 10000) throw err("too-large");
    let bal = null;
    if (coins) {
      await this.writePlayer(uid, p => {
        // Bozulmuş (sayı olmayan) bakiye düzeltmede sıfırdan başlar.
        if (typeof p.balance !== "number" || !Number.isFinite(p.balance)) p.balance = 0;
        if (p.balance + coins < 0) throw err("insufficient-funds");
        p.balance += coins;
        p.tx = [{ id: "x" + randomId(9), transaction_type: "admin-adjust", amount: coins, balance_after: p.balance, created_at: Date.now() }, ...(p.tx ?? [])].slice(0, 40);
        bal = p.balance;
        return p;
      });
    }
    if (gems) {
      const g = this.A.extras(uid).gems;
      if (g.balance + gems < 0) throw err("insufficient-gems");
      g.balance += gems;
      g.log.unshift({ n: gems, why: "Yönetici düzeltmesi", at: Date.now() });
      g.log = g.log.slice(0, 40);
      this.A.saveExtras(uid);
      this.A.send(uid, { t: "gems", s: { balance: g.balance, owned: g.owned.slice(), frame: g.frame }, granted: gems > 0 ? [{ n: gems, why: "Yönetici düzeltmesi" }] : [] });
    }
    this.log(me.email, "adjust", uid, { coins, gems, reason });
    return { ok: true, balance: bal, gems: this.A.extras(uid).gems.balance };
  }

  async do_deleteAccount(a, me) {
    const uid = this.need(a), reason = this.reason(a), sql = this.sql;
    const name = this.A.store.docs.get(`players/${uid}`)?.name ?? null;
    if (String(a.confirm ?? "") !== (name ?? uid)) throw err("confirm-mismatch");
    this.kick(uid, { t: "signedout", d: { reason: "deleted" } });
    const u = this.A.users.get(uid);
    if (u) { clearTimeout(u.idle); u.socks.clear(); this.A.drop(uid); }
    const db = this.A.store.forUser("admin", { anyWrite: true });
    for (const k of [...this.A.store.docs.keys()]) if (k === `players/${uid}` || k.startsWith(`players/${uid}/`)) await db.doc(k).delete();
    for (const q of ["DELETE FROM tokens WHERE uid = ?", "DELETE FROM extras WHERE uid = ?", "DELETE FROM lmembers WHERE uid = ?", "DELETE FROM inbox WHERE uid = ?", "DELETE FROM signups WHERE uid = ?", "DELETE FROM activity WHERE uid = ?", "UPDATE feedback SET uid = NULL WHERE uid = ?", "DELETE FROM accounts WHERE uid = ?"]) sql.exec(q, uid);
    this.A.extrasCache.delete(uid);
    // Silinen oyuncu başkalarının arkadaş listelerinden ve bekleyen isteklerinden de çıkarılır.
    for (const row of [...sql.exec("SELECT uid FROM extras WHERE json LIKE ?", `%"${uid}"%`)]) {
      const x = this.A.extras(row.uid), f = x.friends;
      if (!f) continue;
      for (const k of ["list", "out", "inc"]) if (Array.isArray(f[k])) f[k] = f[k].filter(e => e.uid !== uid);
      this.A.saveExtras(row.uid);
      this.A.send(row.uid, { t: "friends", s: f });
    }
    this.log(me.email, "delete-account", uid, { name, reason });
    return { ok: true };
  }

  // ---- 2. aşama
  do_settings() {
    return { announce: this.cfg("announce"), maint: this.cfg("maint"), eco: this.eco(), ecoDefault: ECO_DEFAULT, league: { botMul: this.cfg("league")?.botMul ?? 1 }, live: this.publicCfg() };
  }
  do_announce(a, me) {
    if (a.clear) { this.setCfg("announce", null); this.log(me.email, "announce-clear", null, null); return this.do_settings(); }
    const text = String(a.text ?? "").trim().slice(0, 200);
    if (text.length < 3) throw err("text-required");
    const tone = ["info", "event", "warn"].includes(a.tone) ? a.tone : "info";
    const until = Number(a.until) > Date.now() ? Number(a.until) : 0;
    this.setCfg("announce", { id: randomId(6), text, tone, until, by: me.email, at: Date.now() });
    this.log(me.email, "announce", null, { text, tone, until });
    return this.do_settings();
  }
  do_maint(a, me) {
    const on = !!a.on, msg = String(a.msg ?? "").trim().slice(0, 200);
    this.setCfg("maint", { on, msg, by: me.email, at: Date.now() });
    this.log(me.email, on ? "maint-on" : "maint-off", null, { msg });
    return this.do_settings();
  }
  do_eco(a, me) {
    if (a.reset) { this.setCfg("eco", null); this.log(me.email, "eco-reset", null, null); return this.do_settings(); }
    const n = (k, lo, hi) => { const v = Number(a[k]); if (!Number.isFinite(v) || v < lo || v > hi) throw err("bad-" + k); return v; };
    const eco = {
      daily: Math.round(n("daily", 0, 5000)), streak: Math.round(n("streak", 0, 1000)), maxStreak: Math.round(n("maxStreak", 0, 5000)),
      prizeMul: n("prizeMul", 1, 3), questMul: n("questMul", 1, 3), puzzleMul: n("puzzleMul", 1, 3),
      eventName: String(a.eventName ?? "").trim().slice(0, 40), eventUntil: Number(a.eventUntil) > Date.now() ? Math.min(Number(a.eventUntil), Date.now() + 14 * DAY) : 0
    };
    this.setCfg("eco", eco);
    this.log(me.email, "eco", null, eco);
    return this.do_settings();
  }
  do_leagueCfg(a, me) {
    const m = Number(a.botMul);
    if (!Number.isFinite(m) || m < 0.5 || m > 1.5) throw err("bad-botMul");
    this.setCfg("league", { botMul: Math.round(m * 100) / 100 });
    this.log(me.email, "league-bots", null, { botMul: m });
    return this.do_settings();
  }
  do_leagueView(a) {
    const wk = this.E.tl(this.A.leagueNow()), now = this.A.leagueNow(), out = [];
    for (let t = 0; t < TIERS.length; t++) {
      const groups = [...this.sql.exec("SELECT gid, COUNT(*) AS n FROM lmembers WHERE week = ? AND tier = ? GROUP BY gid ORDER BY gid", wk, t)];
      out.push({ tier: TIERS[t].name, groups: groups.map(g => ({ gid: g.gid, real: g.n })) });
    }
    let rows = null;
    if (a.tier !== undefined && a.gid !== undefined) {
      const t = Number(a.tier), g = Number(a.gid);
      if (!Number.isInteger(t) || t < 0 || t >= TIERS.length || !Number.isInteger(g) || g < 0) throw err("bad-request");
      rows = this.A.groupRows(wk, t, g, now, null);
    }
    return { week: wk, endsInMs: Date.parse(wk + "T00:00:00Z") + 7 * DAY - now, tiers: out, rows, botMul: this.cfg("league")?.botMul ?? 1 };
  }

  // ---- 3. aşama
  do_reports(a) {
    const st = a.status === "all" ? null : a.status === "done" ? "done" : "open";
    const rows = [...(st ? this.sql.exec("SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 100", st) : this.sql.exec("SELECT * FROM reports ORDER BY id DESC LIMIT 100"))];
    const nm = uid => this.A.store.docs.get(`players/${uid}`)?.name ?? "(silinmiş)";
    return rows.map(r => ({ ...r, byName: nm(r.by), targetName: nm(r.target), targetReports: [...this.sql.exec("SELECT COUNT(*) AS n FROM reports WHERE target = ?", r.target)][0].n }));
  }
  do_report(a, me) {
    const id = Number(a.id), outcome = String(a.outcome ?? "").slice(0, 200);
    if (!["dismissed", "actioned"].includes(a.result)) throw err("bad-request");
    this.sql.exec("UPDATE reports SET status = 'done', handled_by = ?, handled_at = ?, outcome = ? WHERE id = ?", me.email, Date.now(), `${a.result}${outcome ? ": " + outcome : ""}`, id);
    this.log(me.email, "report-" + a.result, null, { id, outcome });
    return { ok: true };
  }
  do_feedback(a) {
    const st = a.status === "all" ? null : a.status === "done" ? "done" : "new";
    const rows = [...(st ? this.sql.exec("SELECT * FROM feedback WHERE status = ? ORDER BY id DESC LIMIT 100", st) : this.sql.exec("SELECT * FROM feedback ORDER BY id DESC LIMIT 100"))];
    return rows.map(r => ({ ...r, playerName: r.uid ? this.A.store.docs.get(`players/${r.uid}`)?.name ?? null : null }));
  }
  do_feedbackDone(a, me) {
    this.sql.exec("UPDATE feedback SET status = 'done' WHERE id = ?", Number(a.id));
    this.log(me.email, "feedback-done", null, { id: Number(a.id) });
    return { ok: true };
  }
  do_suspicious() {
    const sql = this.sql, nm = uid => this.A.store.docs.get(`players/${uid}`)?.name ?? uid;
    // Aynı ağdan son 7 günde 4+ hesap
    const ips = [...sql.exec("SELECT iph, COUNT(*) AS n FROM signups WHERE iph IS NOT NULL AND at > ? GROUP BY iph HAVING n >= 4 ORDER BY n DESC LIMIT 20", Date.now() - 7 * DAY)]
      .map(r => ({ n: r.n, players: [...sql.exec("SELECT uid FROM signups WHERE iph = ? ORDER BY at DESC LIMIT 12", r.iph)].map(x => ({ uid: x.uid, name: nm(x.uid) })) }));
    const winners = [], pairs = new Map(), rich = [], broken = [];
    for (const [k, p] of this.A.store.docs) {
      if (!k.startsWith("players/u_") || k.split("/").length !== 2) continue;
      const uid = k.slice(8);
      if ((p.games | 0) >= 20 && p.wins / p.games >= 0.85) winners.push({ uid, name: p.name, games: p.games, rate: Math.round((p.wins * 100) / p.games) });
      const c = {};
      for (const r of p.recent ?? []) if (r.players === 2 && r.group && String(r.group).startsWith("u_")) c[r.group] = (c[r.group] | 0) + 1;
      for (const [o, n] of Object.entries(c)) if (n >= 6) { const key = [uid, o].sort().join("|"); pairs.set(key, Math.max(pairs.get(key) ?? 0, n)); }
      if ((p.balance | 0) >= 50000) rich.push({ uid, name: p.name, balance: p.balance });
      if (typeof p.balance !== "number" || !Number.isFinite(p.balance) || !Number.isInteger(p.balance) || p.balance < 0) broken.push({ uid, name: p.name, balance: String(p.balance) });
    }
    return {
      ips,
      winners: winners.sort((a, b) => b.rate - a.rate).slice(0, 20),
      pairs: [...pairs].map(([k, n]) => { const [a, b] = k.split("|"); return { a: { uid: a, name: nm(a) }, b: { uid: b, name: nm(b) }, n }; }).slice(0, 20),
      rich: rich.sort((a, b) => b.balance - a.balance).slice(0, 10),
      broken: broken.slice(0, 50)
    };
  }
  do_log(a) {
    const before = Number(a.before) || Number.MAX_SAFE_INTEGER;
    return [...this.sql.exec("SELECT * FROM adminlog WHERE id < ? ORDER BY id DESC LIMIT 100", before)];
  }
}
