// Hesap güvenliği: şifre özeti (PBKDF2), oturum anahtarları ve Google kimlik doğrulaması.
const enc = new TextEncoder();
const ITER = 100000;

export function b64u(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export function randomId(bytes = 24) {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(s) {
  return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function hashPassword(pw, salt = randomId(16)) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITER }, key, 256);
  return { salt, hash: b64u(bits) };
}

// Sabit süreli karşılaştırma: zamanlama farkından bilgi sızmasın.
export function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function normEmail(e) {
  const v = String(e ?? "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(v) ? v : null;
}

export function validPassword(p) {
  return typeof p === "string" && p.length >= 8 && p.length <= 128;
}

// Google kimlik belirteci (ID token) doğrulaması: imza, alıcı, yayıncı ve süre.
let certs = null, certsAt = 0;
async function googleKeys() {
  if (certs && Date.now() - certsAt < 3600e3) return certs;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!r.ok) throw new Error("google-certs");
  certs = (await r.json()).keys;
  certsAt = Date.now();
  return certs;
}

export async function verifyGoogle(idToken, clientId) {
  if (!clientId) throw new Error("google-disabled");
  const parts = String(idToken ?? "").split(".");
  if (parts.length !== 3) throw new Error("bad-token");
  const head = JSON.parse(new TextDecoder().decode(fromB64u(parts[0])));
  const body = JSON.parse(new TextDecoder().decode(fromB64u(parts[1])));
  if (head.alg !== "RS256") throw new Error("bad-token");
  const jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) throw new Error("bad-token");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad-token");
  const now = Math.floor(Date.now() / 1000);
  if (body.aud !== clientId) throw new Error("bad-token");
  if (body.iss !== "accounts.google.com" && body.iss !== "https://accounts.google.com") throw new Error("bad-token");
  if (!(body.exp > now - 60)) throw new Error("expired-token");
  return { sub: String(body.sub), email: body.email_verified ? normEmail(body.email) : null, name: body.given_name || body.name || null };
}
