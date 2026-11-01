// Mine Duel arena sunucusu: tüm istekler tek bir Arena nesnesine yönlendirilir.
export { Arena } from "./arena.mjs";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Ön kontrol (CORS): izin listesi sabit sitelerin yanında yönetim panelinden eklenenleri de içerdiği için
    // karar Arena nesnesinde verilir.
    if (url.pathname === "/" || url.pathname === "/health") return new Response("Mine Duel arena", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return env.ARENA.get(env.ARENA.idFromName("main")).fetch(req);
  }
};
