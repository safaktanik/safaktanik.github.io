// Kullanıcı adı ve arena adı denetimi: küfürlü/hakaret içeren adlar sunucuda reddedilir.
// İngilizce: obscenity (MIT, github.com/jo3-l/obscenity) — harf oyunlarını (f4ck, ş→s) da tanır.
// Türkçe: turkce-kufur-karaliste (CC BY-SA 4.0, github.com/ooguz/turkce-kufur-karaliste);
// masum anlamı da olan kelimeler (ana, mal, emi, amina…) yanlış alarm vermesin diye listeden çıkarıldı.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import TR from "./data/tr-names-blocklist.json" with { type: "json" };

const en = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const FOLD = { ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c", â: "a", î: "i", û: "u" };
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i" };
const lower = s => String(s).replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
// "ı" ayrı harf olarak kalır: "sıkı", "sıkıntı" masum; "siki" değil.
const fold = s => s.replace(/[ğüşöçâîû]/g, c => FOLD[c]);
const squeeze = s => s.replace(/(.)\1+/g, "$1"); // "siiiik" → "sik"
// Bitişik biçim: harf oyunları çözülür, harf dışı her şey atılır ("o.r.o.s.p.u", "0r0spu").
const compact = s => squeeze(fold(lower(s)).replace(/[0-9@$!]/g, c => LEET[c] || "").replace(/[^a-zı]/g, ""));
const tokens = s => lower(s).split(/[^\p{L}]+/u).filter(Boolean);

const LONG = [], SHORT_RAW = new Set(), SHORT_FOLD = new Set();
for (const w of TR) {
  const c = compact(w);
  if (!c) continue;
  if (c.length >= 5) LONG.push(c);
  // Kısa kelimeler yalnızca tek başına bir sözcükse yakalanır ("sik" evet, "Sikander" hayır).
  // Türkçe harfli olanlar Türkçe yazımıyla eşleşir ("göt" evet, İngilizce "got" hayır).
  else if (/[ığüşöç]/.test(w)) SHORT_RAW.add(lower(w).replace(/[^\p{L}]/gu, ""));
  else SHORT_FOLD.add(c);
}

export function badName(name) {
  const s = String(name || "");
  if (!s.trim()) return false;
  if (en.hasMatch(s)) return true;
  const c = compact(s);
  for (const w of LONG) if (c.includes(w)) return true;
  for (const t of tokens(s)) {
    if (SHORT_RAW.has(t)) return true;
    if (SHORT_FOLD.has(squeeze(fold(t)))) return true;
  }
  // Rakamlı harf oyunları da tek sözcük olarak denetlenir ("1bne", "s1k").
  for (const t of lower(s).split(/[^\p{L}0-9@$!]+/u)) if (t && SHORT_FOLD.has(compact(t))) return true;
  return false;
}
