// Lig kuralları: sıralama, terfi/düşme ve ödül hesapları.
import assert from "node:assert/strict";
import { TIERS, SIZE, bots, rank, prize, move } from "../src/league.mjs";

// Terfi ve düşme
assert.equal(move(0, 1), 1); assert.equal(move(0, 3), 1); assert.equal(move(0, 4), 0);
assert.equal(move(0, SIZE), 0, "Bronz'da düşme yok");
assert.equal(move(1, SIZE), -1); assert.equal(move(1, SIZE - 2), -1); assert.equal(move(1, SIZE - 3), 0);
assert.equal(move(TIERS.length - 1, 1), 0, "Elmas'tan yukarı çıkılmaz");

// Ödüller: 1. > 2. > 3. > orta > son 3
const p = [1, 2, 3, 4, SIZE].map(r => prize(0, r));
assert.deepEqual(p, [450, 300, 230, 150, 80]);
assert.ok(prize(3, 1) > prize(2, 1) && prize(2, 1) > prize(1, 1) && prize(1, 1) > prize(0, 1));

// Botlar: aynı hafta/grup için hep aynı; hafta başında 0, ilerledikçe artar, tavanı aşmaz
const wk = "2026-10-26", t0 = Date.parse(wk + "T00:00:00Z"), W = 7 * 864e5;
const a = bots(wk, 0, 1, 9, t0 + W / 2), b = bots(wk, 0, 1, 9, t0 + W / 2);
assert.deepEqual(a, b);
assert.equal(new Set(a.map(x => x.name)).size, 9, "bot adları tekrar etmez");
assert.ok(bots(wk, 0, 1, 9, t0).every(x => x.points === 0));
const end = bots(wk, 0, 1, 9, t0 + W);
end.forEach((x, i) => { assert.ok(x.points >= a[i].points); assert.ok(x.points <= Math.round(TIERS[0].cap * 1.12)); });

// Sıralama: puan, eşitlikte gerçek oyuncu önde
const rows = rank([{ name: "Bot", points: 50, bot: true }, { name: "Sen", points: 50, bot: false }, { name: "Üst", points: 90, bot: true }]);
assert.deepEqual(rows.map(x => [x.name, x.rank]), [["Üst", 1], ["Sen", 2], ["Bot", 3]]);
console.log("✓ lig kuralları doğru");
