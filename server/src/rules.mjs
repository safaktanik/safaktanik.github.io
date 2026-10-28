// Oyuncunun sunucudaki motora gönderebileceği çağrılar ve ödüllerin sunucu tarafı doğrulaması.
// Ödül ve fiyatlar istemciden gelir; burada güvenilir kaynaklarla (görev listesi, dükkan) karşılaştırılır.

export const METHODS = new Set([
  "createProfile", "updateProfile", "claimDaily", "claimRescue", "grantReward", "purchase",
  "request", "move", "scanCell", "power", "react", "leaveMatch", "clearMatch", "stopWatching",
  "joinByCode", "addBot", "removeBot", "leaderboard", "recentMatches", "transactions", "refreshMe", "friendSend"
]);

const REQUESTS = new Set(["table.create", "table.join", "table.leave", "table.ready", "table.watch", "quick.start", "quick.cancel", "lobby.sub"]);

const err = code => Object.assign(new Error(code), { code, status: 400 });

export function check(E, method, args, now = Date.now()) {
  if (!METHODS.has(method)) throw err("bad-request");
  if (!Array.isArray(args) || args.length > 6) throw err("bad-request");
  if (method === "request") {
    const r = args[0];
    if (!r || typeof r !== "object" || !REQUESTS.has(r.t)) throw err("bad-request");
  }
  if (method === "grantReward") {
    const [key, amount] = args;
    if (typeof key !== "string" || !Number.isInteger(amount) || amount <= 0) throw err("bad-request");
    const days = [E._i(now), E._i(now - 864e5)];
    let m = /^puzzle:(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m) {
      // Günün Bulmacası: bugün ya da dün (saat farkı payı), en fazla 600.
      if (!days.includes(m[1]) || amount > 600) throw err("bad-reward");
      return;
    }
    m = /^q:(\d{4}-\d{2}-\d{2}):([a-z0-9]+)$/.exec(key);
    if (m) {
      // Günün görevleri: o günün listesinde olmalı ve ödül birebir aynı olmalı.
      if (!days.includes(m[1])) throw err("bad-reward");
      const q = E.Mp(m[1]).find(x => x.id === m[2]);
      if (!q || q.reward !== amount) throw err("bad-reward");
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
