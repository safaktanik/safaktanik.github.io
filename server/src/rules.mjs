// Oyuncunun sunucudaki motora gönderebileceği çağrılar ve ödüllerin sunucu tarafı doğrulaması.
// Ödül ve fiyatlar istemciden gelir; burada güvenilir kaynaklarla (görev listesi, dükkan) karşılaştırılır.

export const METHODS = new Set([
  "createProfile", "updateProfile", "claimDaily", "claimRescue", "grantReward", "purchase",
  "request", "move", "scanCell", "power", "react", "leaveMatch", "clearMatch", "stopWatching",
  "joinByCode", "addBot", "removeBot", "leaderboard", "recentMatches", "transactions", "refreshMe", "friendSend", "watchLobby"
]);

const REQUESTS = new Set(["table.create", "table.join", "table.leave", "table.ready", "table.watch", "quick.start", "quick.cancel", "lobby.sub", "move", "scan", "power"]);

const err = code => Object.assign(new Error(code), { code, status: 400 });

// Motor, tarayıcıdaki arayüzün doğru türde değer gönderdiğini varsayar; sunucuda türler önceden denetlenir.
// (Örn. masa ücreti olarak yazı gönderilirse sınır kontrolleri atlanıyor ve bakiyeler bozuluyordu.)
const str = (v, max = 64) => typeof v === "string" && v.length <= max;
const optStr = (v, max = 64) => v === undefined || v === null || str(v, max);
const int = v => Number.isInteger(v);
const optInt = v => v === undefined || v === null || int(v);
const optBool = v => v === undefined || typeof v === "boolean";
const optNum = v => v === undefined || v === null || (typeof v === "number" && Number.isFinite(v));
const bad = ok => { if (!ok) throw err("bad-request"); };

function shape(method, a) {
  switch (method) {
    case "createProfile": return bad(str(a[0], 40) && int(a[1]));
    case "updateProfile": { const p = a[0]; return bad(p && typeof p === "object" && !Array.isArray(p) && optStr(p.username, 40) && optInt(p.avatar)); }
    case "move": return bad(str(a[0]) && int(a[1]) && optStr(a[2], 16));
    case "scanCell": return bad(str(a[0]) && int(a[1]));
    case "power": return bad(str(a[0]) && str(a[1], 16));
    case "react": return bad(str(a[0]) && str(a[1], 16));
    case "joinByCode": return bad(str(a[0], 16));
    case "addBot": case "removeBot": return bad(str(a[0]));
    case "purchase": return bad(str(a[0]) && int(a[1]));
    case "request": {
      const r = a[0];
      if (r.t === "table.create") return bad(optStr(r.tier, 16) && optStr(r.mode, 16) && optStr(r.name, 60) && optStr(r.password, 40) && optInt(r.entryFee) && optInt(r.boardSize) && optInt(r.capacity) && optBool(r.private) && (r.options === undefined || r.options === null || (typeof r.options === "object" && !Array.isArray(r.options))));
      if (r.t === "table.join") return bad(str(r.tableId) && optStr(r.password, 40));
      if (r.t === "table.ready") return bad(typeof r.ready === "boolean");
      if (r.t === "table.watch") return bad(str(r.tableId));
      if (r.t === "quick.start") return bad(optStr(r.tier, 16) && optStr(r.mode, 16) && optNum(r.maxFee));
      if (r.t === "move") return bad(str(r.matchId) && int(r.index) && optStr(r.action, 16));
      if (r.t === "scan") return bad(str(r.matchId) && int(r.index));
      if (r.t === "power") return bad(str(r.matchId) && str(r.kind, 16));
      return;
    }
  }
}

export function check(E, method, args, now = Date.now(), mul = { quest: 1, puzzle: 1 }) {
  if (!METHODS.has(method)) throw err("bad-request");
  if (!Array.isArray(args) || args.length > 6) throw err("bad-request");
  if (method === "request") {
    const r = args[0];
    if (!r || typeof r !== "object" || !REQUESTS.has(r.t)) throw err("bad-request");
  }
  shape(method, args);
  if (method === "grantReward") {
    const [key, amount] = args;
    if (typeof key !== "string" || !Number.isInteger(amount) || amount <= 0) throw err("bad-request");
    const days = [E._i(now), E._i(now - 864e5)];
    // İlk düello rehberinin ödülü: hesap başına bir kez (motor aynı anahtarı ikinci kez kabul etmez).
    if (key === "tanik-first-duel") { if (amount !== 250) throw err("bad-reward"); return; }
    let m = /^puzzle:(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m) {
      // Günün Bulmacası: bugün ya da dün (saat farkı payı), en fazla 300 (etkinlikte çarpanla).
      if (!days.includes(m[1]) || amount > Math.round(300 * Math.max(1, mul.puzzle || 1))) throw err("bad-reward");
      return;
    }
    m = /^q:(\d{4}-\d{2}-\d{2}):([a-z0-9]+)$/.exec(key);
    if (m) {
      // Günün görevleri: o günün listesinde olmalı ve ödül birebir aynı olmalı.
      if (!days.includes(m[1])) throw err("bad-reward");
      const q = E.Mp(m[1]).find(x => x.id === m[2]);
      // Etkinlik varsa çarpanlı miktar da kabul edilir (etkinlik başlarken/biterken açık kalan ekranlar için ikisi de).
      if (!q || (q.reward !== amount && Math.round(q.reward * (mul.quest || 1)) !== amount)) throw err("bad-reward");
      return;
    }
    throw err("bad-reward");
  }
  if (method === "purchase") {
    const [item, price] = args;
    const it = E.Bd.find(x => x.id === item);
    if (!it || it.price !== price) throw err("bad-purchase");
  }
}
