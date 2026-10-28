// Mine Duel arena sunucusu: tüm istekler tek bir Arena nesnesine yönlendirilir.
export { Arena } from "./arena.mjs";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      const o = req.headers.get("Origin");
      const ok = o && (env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).includes(o);
      return new Response(null, {
        status: ok ? 204 : 403,
        headers: ok ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {}
      });
    }
    if (url.pathname === "/" || url.pathname === "/health") return new Response("Mine Duel arena", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return env.ARENA.get(env.ARENA.idFromName("main")).fetch(req);
  }
};
