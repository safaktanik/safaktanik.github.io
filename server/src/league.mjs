// Çevrimiçi lig: her ligde 11 kişilik gruplar. Grup önce gerçek oyuncularla dolar, eksik yerleri botlar tamamlar.
// Hafta sonunda ilk 3 bir üst lige çıkar, son 3 düşer (Bronz'da düşme yok). O hafta oynamayanın ligi değişmez.

export const TIERS = [
  { id: "bronze", name: "Bronz Lig", cap: 110, prize: 150 },
  { id: "silver", name: "Gümüş Lig", cap: 190, prize: 300 },
  { id: "gold", name: "Altın Lig", cap: 300, prize: 600 },
  { id: "diamond", name: "Elmas Lig", cap: 450, prize: 1200 }
];
export const SIZE = 11, REAL_MAX = 10, UP = 3, DOWN = 3, WEEK = 7 * 864e5;
const NAMES = ["Fitil Usta", "Gece Kuşu", "Sessiz Adım", "Demir Pati", "Bayrakçı", "Şanslı Yedi", "Kırmızı Tel", "Soğukkanlı",
  "Radarcı", "Kum Fırtınası", "Çelik Bıyık", "Mavi Duman", "Tıkırtı", "Yıldız Avcısı", "Kapan Ustası", "Karakış"];

function rnd(seed) {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Grup botları: hafta + lig + grup tohumlu; hafta boyunca kendi temposunda puan toplar.
export function bots(week, tier, gid, count, now) {
  const r = rnd(`${week}:${tier}:${gid}`), cap = TIERS[tier].cap, used = new Set(), out = [];
  const f = Math.max(0, Math.min(1, (now - Date.parse(week + "T00:00:00Z")) / WEEK));
  for (let j = 0; j < count; j++) {
    let k; do { k = Math.floor(r() * NAMES.length); } while (used.has(k)); used.add(k);
    const q = 0.12 + r(), pace = 0.7 + r() * 0.5;
    out.push({ id: `lg${gid}-${j}`, name: NAMES[k], avatar: Math.floor(r() * 9), level: tier * 4 + 2 + Math.floor(r() * 4), points: Math.round(cap * q * Math.pow(f, pace)), bot: true });
  }
  return out;
}

export function rank(rows) {
  rows.sort((a, b) => b.points - a.points || (a.bot ? 1 : 0) - (b.bot ? 1 : 0) || String(a.name).localeCompare(String(b.name), "tr"));
  rows.forEach((x, i) => { x.rank = i + 1; });
  return rows;
}

export function prize(tier, r, size = SIZE) {
  const m = r === 1 ? 3 : r === 2 ? 2 : r === 3 ? 1.5 : r <= size - DOWN ? 1 : 0.5;
  return Math.round((TIERS[tier].prize * m) / 10) * 10;
}

export function move(tier, r, size = SIZE) {
  return r <= UP && tier < TIERS.length - 1 ? 1 : r > size - DOWN && tier > 0 ? -1 : 0;
}
