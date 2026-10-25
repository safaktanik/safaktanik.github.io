import { describe, expect, it } from 'vitest';
import { ECONOMY, TIERS, boardFor } from '../../src/arena/economy';
import { MODE_MINE_FACTOR } from '../../src/arena/modes';
import { ApiError } from './util';
import { makeKit, mineCell, safeCell } from './testkit';
import type { Kit } from './testkit';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError ? e.code : String(e);
  }
  return 'ok';
};
const acode = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof ApiError ? e.code : String(e)));

/** n kişilik bronz masa kurar, doldurur ve geri sayımı bitirip maçı başlatır. */
async function fullTable(k: Kit, n: 3 | 4, tier: 'bronze' | 'gold' = 'bronze') {
  const users = Array.from({ length: n }, () => k.guest());
  const t = await k.arena.createTable(users[0], { tier, capacity: n });
  for (const u of users.slice(1)) await k.arena.joinTable(u, t.id);
  k.time.advance(ECONOMY.countdownSeconds * 1000);
  const view = k.arena.getTableView(t.id)!;
  return { users, tableId: t.id, matchId: view.matchId! };
}
const cur = (k: Kit, matchId: string) => {
  const s = k.state(matchId);
  return s.players[s.current].userId;
};

describe('hesaplar', () => {
  it('1) misafir girer: rastgele kimlik, avatar, ad ve başlangıç bakiyesi; oturum jetonu doğrulanır', async () => {
    const k = await makeKit();
    const r = k.accounts.createGuest('1.1.1.1');
    expect(r.me.accountType).toBe('guest');
    expect(r.me.balance).toBe(ECONOMY.startingBalance);
    expect(r.me.username.length).toBeGreaterThan(3);
    expect(k.accounts.authenticate(r.token)).toBe(r.me.id);
    expect(k.accounts.authenticate('x'.repeat(43))).toBeNull(); // uydurma jeton geçmez
    // jeton veritabanında düz saklanmaz
    expect(k.db.get('SELECT 1 FROM sessions WHERE token_hash = ?', r.token)).toBeUndefined();
    // başlangıç bakiyesi de işlem kaydıyla gelir
    expect(k.db.get<{ n: number }>("SELECT COUNT(*) n FROM wallet_transactions WHERE user_id = ? AND transaction_type='signup-bonus'", r.me.id)!.n).toBe(1);
  });

  it('2) kalıcı hesap: kayıt, giriş, yanlış parola, parola özeti; misafir yükseltme bakiyeyi korur', async () => {
    const k = await makeKit();
    const reg = await k.accounts.register({ email: 'Ayse@Example.com', password: 'gizli-parola-1', username: 'Ayse' });
    expect(reg.me.accountType).toBe('member');
    const row = k.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', reg.me.id)!;
    expect(row.password_hash.startsWith('scrypt$')).toBe(true);
    expect(row.password_hash).not.toContain('gizli');
    expect(await acode(k.accounts.register({ email: 'ayse@example.com', password: 'baskaparola' }))).toBe('email-taken');
    expect(await acode(k.accounts.register({ email: 'b@example.com', password: 'kisa' }))).toBe('weak-password');
    expect(await acode(k.accounts.login({ email: 'ayse@example.com', password: 'yanlis-parola' }))).toBe('bad-credentials');
    const li = await k.accounts.login({ email: 'AYSE@example.com', password: 'gizli-parola-1' });
    expect(li.me.id).toBe(reg.me.id);

    const g = k.guest();
    k.accounts.claimDaily(g);
    const before = k.accounts.me(g);
    const up = await k.accounts.upgrade(g, { email: 'misafir@example.com', password: 'parola-123' });
    expect(up.id).toBe(g);
    expect(up.accountType).toBe('member');
    expect(up.balance).toBe(before.balance);
    expect(code(() => k.accounts.claimDaily(g))).toBe('already-claimed'); // ödül ikinci kez verilmez
    expect(await acode(k.accounts.upgrade(g, { email: 'x@example.com', password: 'parola-123' }))).toBe('not-guest');
    expect((await k.accounts.login({ email: 'misafir@example.com', password: 'parola-123' })).me.id).toBe(g);
  });

  it('kullanıcı adı benzersiz; avatar sınırlı', async () => {
    const k = await makeKit();
    const a = k.guest();
    const b = k.guest();
    k.accounts.setProfile(a, { username: 'Kaptan_1', avatar: 5 });
    expect(code(() => k.accounts.setProfile(b, { username: 'kaptan_1' }))).toBe('username-taken');
    expect(code(() => k.accounts.setProfile(b, { username: 'a' }))).toBe('bad-username');
    expect(code(() => k.accounts.setProfile(b, { avatar: 99 }))).toBe('bad-avatar');
    expect(k.accounts.me(a).avatar).toBe(5);
  });

  it('günlük ödül günde bir kez; seri artar; ertesi gün yeniden alınır', async () => {
    const k = await makeKit();
    const u = k.guest();
    const r1 = k.accounts.claimDaily(u);
    expect(r1.amount).toBe(ECONOMY.daily.base);
    expect(code(() => k.accounts.claimDaily(u))).toBe('already-claimed');
    k.time.advance(86_400_000);
    const r2 = k.accounts.claimDaily(u);
    expect(r2.streak).toBe(2);
    expect(r2.amount).toBe(ECONOMY.daily.base + ECONOMY.daily.streakBonus);
    expect(k.balance(u)).toBe(ECONOMY.startingBalance + r1.amount + r2.amount);
  });
});

describe('cüzdan', () => {
  it('aynı işlem anahtarı ikinci kez bakiye değiştirmez; bakiye eksiye düşmez', async () => {
    const { applyWalletTx } = await import('./wallet');
    const k = await makeKit();
    const u = k.guest();
    applyWalletTx(k.db, { userId: u, type: 't', amount: -100, key: 'k1', now: 1 });
    const again = applyWalletTx(k.db, { userId: u, type: 't', amount: -100, key: 'k1', now: 1 });
    expect(again.duplicate).toBe(true);
    expect(k.balance(u)).toBe(ECONOMY.startingBalance - 100);
    expect(code(() => applyWalletTx(k.db, { userId: u, type: 't', amount: -1e9, key: 'k2', now: 1 }))).toBe('Error: insufficient');
    expect(k.balance(u)).toBe(ECONOMY.startingBalance - 100);
    const tx = k.db.all<{ balance_before: number; balance_after: number; amount: number }>('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id', u);
    for (const t of tx) expect(t.balance_before + t.amount).toBe(t.balance_after);
  });
});

describe('masalar', () => {
  it('4–5) masa açma ücreti tahsil eder, sahibi ilk koltuğa oturur; diğerleri katılır; lobide görünür', async () => {
    const k = await makeKit();
    const [a, b] = [k.guest(), k.guest()];
    const t = await k.arena.createTable(a, { tier: 'bronze', name: 'Deneme' });
    expect(k.balance(a)).toBe(ECONOMY.startingBalance - TIERS.bronze.fee);
    expect(t.players.map((p) => p.userId)).toEqual([a]);
    expect(t.boardSize).toBe(TIERS.bronze.board);
    expect(t.options).toEqual({ turnSeconds: 20, lives: 3, density: 'normal', sonars: 1, shields: 1, bonuses: true, smokes: 1, freezes: 1 });
    // Son Kalan'da mayın ×1,25 (MODE_MINE_FACTOR): 16 → 20
    expect(t.mineCount).toBe(Math.round(TIERS.bronze.mines * MODE_MINE_FACTOR.classic));
    expect(k.arena.listTables().some((x) => x.id === t.id)).toBe(true);
    const j = await k.arena.joinTable(b, t.id);
    expect(j.players).toHaveLength(2);
    expect(j.prizePool).toBe(2 * TIERS.bronze.fee);
    expect(k.balance(b)).toBe(ECONOMY.startingBalance - TIERS.bronze.fee);
  });

  it('bakiye yetmezse masa açılamaz/katılınamaz; özel ayarlar sınır dışında reddedilir', async () => {
    const k = await makeKit();
    const a = k.guest();
    expect(await acode(k.arena.createTable(a, { tier: 'diamond' }))).toBe('insufficient-funds');
    expect(k.balance(a)).toBe(ECONOMY.startingBalance);
    expect(k.arena.listTables()).toHaveLength(0); // yarım kalan masa yok
    expect(await acode(k.arena.createTable(a, { tier: 'bronze', boardSize: 40 }))).toBe('bad-board');
    expect(await acode(k.arena.createTable(a, { tier: 'bronze', entryFee: 1 }))).toBe('bad-fee');
    expect(await acode(k.arena.createTable(a, { tier: 'bronze', capacity: 5 }))).toBe('bad-capacity');
    expect(await acode(k.arena.createTable(a, { tier: 'bronze', options: { turnSeconds: 7 } }))).toBe('bad-options');
    expect(await acode(k.arena.createTable(a, { tier: 'bronze', options: { lives: 9 } }))).toBe('bad-options');
  });

  it('aynı oyuncu aynı anda iki masada olamaz', async () => {
    const k = await makeKit();
    const [a, b] = [k.guest(), k.guest()];
    const t1 = await k.arena.createTable(a, { tier: 'bronze' });
    expect(await acode(k.arena.createTable(a, { tier: 'bronze' }))).toBe('already-seated');
    const t2 = await k.arena.createTable(b, { tier: 'bronze' });
    expect(await acode(k.arena.joinTable(a, t2.id))).toBe('already-seated');
    expect(await acode(k.arena.joinTable(a, t1.id))).toBe('already-seated');
    expect(k.balance(a)).toBe(ECONOMY.startingBalance - TIERS.bronze.fee); // tek ücret
  });

  it('şifreli masa: yanlış şifre reddedilir; şifre düz saklanmaz', async () => {
    const k = await makeKit();
    const [a, b, c] = [k.guest(), k.guest(), k.guest()];
    const t = await k.arena.createTable(a, { tier: 'bronze', password: 'gizli1' });
    expect(t.locked).toBe(true);
    expect(k.db.get<{ password_hash: string }>('SELECT password_hash FROM tables WHERE id = ?', t.id)!.password_hash).not.toContain('gizli1');
    expect(await acode(k.arena.joinTable(b, t.id, 'yanlis'))).toBe('wrong-password');
    expect(await acode(k.arena.joinTable(b, t.id))).toBe('wrong-password');
    expect(await acode(k.arena.joinTable(c, t.id, 'gizli1'))).toBe('ok');
  });

  it('8) masa dolmadan oyun başlamaz; ayrılan iade alır ve koltuk boşalır; sahiplik devreder; boş masa iptal', async () => {
    const k = await makeKit();
    const [a, b] = [k.guest(), k.guest()];
    const t = await k.arena.createTable(a, { tier: 'bronze' });
    await k.arena.joinTable(b, t.id);
    k.time.advance(60_000);
    expect(k.arena.getTableView(t.id)!.status).toBe('waiting');
    k.arena.leaveTable(a);
    expect(k.balance(a)).toBe(ECONOMY.startingBalance);
    const v = k.arena.getTableView(t.id)!;
    expect(v.players.map((p) => p.userId)).toEqual([b]);
    expect(v.ownerId).toBe(b);
    k.arena.leaveTable(b);
    expect(k.arena.getTableView(t.id)!.status).toBe('cancelled');
    expect(k.balance(b)).toBe(ECONOMY.startingBalance);
  });

  it('6) 3 kişilik masa üçüncü oyuncuyla geri sayıma girer ve sonra başlar; başlamış masaya katılınamaz', async () => {
    const k = await makeKit();
    const users = [k.guest(), k.guest(), k.guest()];
    const t = await k.arena.createTable(users[0], { tier: 'bronze', capacity: 3 });
    await k.arena.joinTable(users[1], t.id);
    await k.arena.joinTable(users[2], t.id);
    expect(k.arena.getTableView(t.id)!.status).toBe('countdown');
    k.time.advance(ECONOMY.countdownSeconds * 1000 - 1);
    expect(k.arena.getTableView(t.id)!.status).toBe('countdown');
    k.time.advance(1);
    const v = k.arena.getTableView(t.id)!;
    expect(v.status).toBe('playing');
    expect(v.matchId).not.toBeNull();
    const late = k.guest();
    expect(await acode(k.arena.joinTable(late, t.id))).toBe('table-not-joinable');
    expect(k.balance(late)).toBe(ECONOMY.startingBalance);
  });

  it('7) 4 kişilik masa dördüncü oyuncuyla başlar; havuz 4 × ücret', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 4);
    const mv = k.arena.matchView(matchId, users[0])!;
    expect(mv.players).toHaveLength(4);
    expect(mv.prizePool).toBe(4 * TIERS.bronze.fee);
    expect(mv.players.every((p) => p.lives === 3)).toBe(true);
  });

  it('geri sayım sırasında biri ayrılırsa maç başlamaz, masa beklemeye döner; aynı masa için ikinci maç açılmaz', async () => {
    const k = await makeKit();
    const users = [k.guest(), k.guest(), k.guest()];
    const t = await k.arena.createTable(users[0], { tier: 'bronze' });
    await k.arena.joinTable(users[1], t.id);
    await k.arena.joinTable(users[2], t.id);
    k.arena.leaveTable(users[2]);
    k.time.advance(10_000);
    expect(k.arena.getTableView(t.id)!.status).toBe('waiting');
    expect(k.db.get<{ n: number }>('SELECT COUNT(*) n FROM matches')!.n).toBe(0);
    await k.arena.joinTable(users[2], t.id);
    k.time.advance(3000);
    expect(k.arena.startMatch(t.id)).toBeNull(); // ikinci başlatma denemesi etkisiz
    expect(k.db.get<{ n: number }>('SELECT COUNT(*) n FROM matches WHERE table_id = ?', t.id)!.n).toBe(1);
    // ayrılıp yeniden katılan oyuncudan ikinci ücret yalnızca ikinci katılım için alındı (iade edilen ilk ücret dahil)
    expect(k.balance(users[2])).toBe(ECONOMY.startingBalance - TIERS.bronze.fee);
  });
});

describe('maç', () => {
  it('9–12) herkes aynı tahtayı görür; sıra doğrulanır; aynı kare iki kez açılamaz', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    const first = cur(k, matchId);
    const wrong = users.find((u) => u !== first)!;
    const cell = safeCell(s);
    expect(code(() => k.arena.move(wrong, matchId, cell))).toBe('not-your-turn');
    k.arena.move(first, matchId, cell);
    const views = users.map((u) => k.arena.matchView(matchId, u)!);
    expect(new Set(views.map((v) => JSON.stringify(v.cells))).size).toBe(1);
    expect(views[0].cells[cell]).toBeGreaterThanOrEqual(0);
    const next = cur(k, matchId);
    expect(next).not.toBe(first);
    expect(code(() => k.arena.move(next, matchId, cell))).toBe('already-open');
    expect(code(() => k.arena.move(next, matchId, 9999))).toBe('out-of-bounds');
    expect(code(() => k.arena.move(k.guest(), matchId, 0))).toBe('not-in-match');
    // mayın konumu görünümlerde yok
    for (const v of views) expect(v.cells.includes(10)).toBe(false);
    expect(JSON.stringify(views[0])).not.toContain('"mines"');
  });

  it('13–15) mayın tam bir can götürür; canı biten elenir ve sırası atlanır; son kalan kazanır', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    const victim = cur(k, matchId);
    k.arena.move(victim, matchId, mineCell(s));
    // ilk mayını kalkan karşılar
    expect(s.players.find((p) => p.userId === victim)!.lives).toBe(3);
    expect(s.players.find((p) => p.userId === victim)!.shield).toBe(0);
    let g0 = 0;
    while (cur(k, matchId) !== victim && g0++ < 10) {
      const u = cur(k, matchId);
      k.arena.move(u, matchId, safeCell(s));
    }
    k.arena.move(victim, matchId, mineCell(s));
    expect(s.players.find((p) => p.userId === victim)!.lives).toBe(2);
    // kurbanın sırası gelene kadar diğerleri güvenli kare açar, kurban her seferinde mayına basar
    let guard = 0;
    while (!s.players.find((p) => p.userId === victim)!.eliminated && guard++ < 50) {
      const u = cur(k, matchId);
      k.arena.move(u, matchId, u === victim ? mineCell(s) : safeCell(s));
    }
    const vp = s.players.find((p) => p.userId === victim)!;
    expect(vp.eliminated).toBe(true);
    expect(vp.lives).toBe(0);
    expect(vp.mineHits).toBe(4); // 1 kalkan + 3 can
    expect(s.phase).toBe('playing'); // diğerleri devam eder
    for (let i = 0; i < 10 && s.phase === 'playing'; i++) expect(cur(k, matchId)).not.toBe(victim);
    expect(code(() => k.arena.move(victim, matchId, safeCell(s)))).toBe('eliminated');
    // ikinci oyuncuyu da ele: son kalan kazanır
    const rest = users.filter((u) => u !== victim);
    const loser = rest[0];
    guard = 0;
    while (s.phase === 'playing' && guard++ < 50) {
      const u = cur(k, matchId);
      k.arena.move(u, matchId, u === loser ? mineCell(s) : safeCell(s));
    }
    expect(s.phase).toBe('finished');
    expect(s.players[s.winnerSeat!].userId).toBe(rest[1]);
  });

  it('16–19) havuz doğru; ödül bir kez; kaybedenlerin ücreti kayıtlı; istatistik ve haftalık sıralama güncellenir', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    const winner = users[2];
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 200) {
      const u = cur(k, matchId);
      k.arena.move(u, matchId, u === winner ? safeCell(s) : mineCell(s));
    }
    expect(s.players[s.winnerSeat!].userId).toBe(winner);
    const pool = 3 * TIERS.bronze.fee;
    const fee = TIERS.bronze.fee;
    const second = k.db.get<{ user_id: string }>('SELECT user_id FROM match_players WHERE match_id = ? AND final_rank = 2', matchId)!.user_id;
    const prizeTx = k.db.all<{ user_id: string; amount: number }>("SELECT user_id, amount FROM wallet_transactions WHERE match_id = ? AND transaction_type = 'match-prize' ORDER BY amount DESC", matchId);
    // 3 kişilik masa: kazanan havuzdan ikincinin ücretini düşerek alır, ikinci ücretini geri alır
    expect(prizeTx).toEqual([{ user_id: winner, amount: pool - fee }, { user_id: second, amount: fee }]);
    // ikinci kesinleştirme denemesi hiçbir şey değiştirmez
    (k.arena as unknown as { settle(m: unknown): void }).settle((k.arena as unknown as { recent: Map<string, unknown> }).recent.get(matchId));
    expect(k.db.get<{ n: number }>("SELECT COUNT(*) n FROM wallet_transactions WHERE transaction_type = 'match-prize'")!.n).toBe(2);
    const first = ECONOMY.firstMatchBonus;
    expect(k.balance(winner)).toBe(ECONOMY.startingBalance - TIERS.bronze.fee + pool - fee + first);
    expect(k.balance(second)).toBe(ECONOMY.startingBalance + first);
    for (const u of users.filter((x) => x !== winner)) {
      if (u !== second) expect(k.balance(u)).toBe(ECONOMY.startingBalance - TIERS.bronze.fee + first);
      expect(k.db.get<{ n: number }>("SELECT COUNT(*) n FROM wallet_transactions WHERE user_id = ? AND transaction_type='entry-fee' AND amount = ?", u, -TIERS.bronze.fee)!.n).toBe(1);
    }
    const me = k.accounts.me(winner);
    expect(me.wins).toBe(1);
    expect(me.gamesPlayed).toBe(1);
    expect(me.xp).toBeGreaterThan(0);
    const lb = k.arena.leaderboard(winner);
    expect(lb.list[0].userId).toBe(winner);
    expect(lb.list[0].points).toBe(ECONOMY.points.byCapacity[3][0]);
    expect(lb.list[0].coinsWon).toBe(pool - fee);
    expect(lb.list.find((r) => r.points < 0)).toBeDefined(); // ilk elenen −5
    const mp = k.db.all<{ final_rank: number }>('SELECT final_rank FROM match_players WHERE match_id = ? ORDER BY final_rank', matchId).map((r) => r.final_rank);
    expect(mp).toEqual([1, 2, 3]);
    const view = k.arena.matchView(matchId, users[0])!;
    expect(view.results).toHaveLength(3);
    expect(view.cells.filter((c) => c === 10 || c === 9).length).toBe(s.mineCount); // bitince mayınlar görünür
    // ikinci maçta ilk maç ödülü tekrar verilmez
    expect(k.db.get<{ n: number }>("SELECT COUNT(*) n FROM wallet_transactions WHERE transaction_type='first-match-bonus' AND user_id = ?", winner)!.n).toBe(1);
  });

  it('süre aşımı sırayı geçirir; üst üste 3 aşımda oyuncu elenir (bağlantısı kopsa da maç sürer)', async () => {
    const k = await makeKit();
    const { matchId } = await fullTable(k, 3);
    const s = k.state(matchId);
    const afk = cur(k, matchId);
    // afk oyuncu her sırasında süresini doldurur, diğerleri oynar (bonus kutusu ekstra tur verse de)
    let timeouts = 0;
    for (let g = 0; g < 40 && s.phase === 'playing' && timeouts < 3; g++) {
      const u = cur(k, matchId);
      if (u === afk) {
        k.time.advance(ECONOMY.turnSeconds * 1000);
        timeouts++;
      } else k.arena.move(u, matchId, safeCell(s));
    }
    const p = s.players.find((x) => x.userId === afk)!;
    expect(p.eliminated).toBe(true);
    expect(p.eliminationReason).toBe('afk');
  });

  it('maç sırasında masadan ayrılan elenir; ücret iade edilmez, havuz değişmez', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const quitter = users.find((u) => u !== cur(k, matchId))!;
    const bal = k.balance(quitter);
    k.arena.leaveTable(quitter);
    const s = k.state(matchId);
    expect(s.players.find((p) => p.userId === quitter)!.eliminationReason).toBe('left');
    expect(k.balance(quitter)).toBe(bal);
    expect(k.arena.matchView(matchId, users[0])!.prizePool).toBe(3 * TIERS.bronze.fee);
  });

  it('elenen/ayrılan oyuncu maçın bitmesini beklemeden yeni masaya oturabilir', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const quitter = users.find((u) => u !== cur(k, matchId))!;
    k.arena.leaveTable(quitter);
    expect(k.state(matchId).phase).toBe('playing'); // diğerleri sürdürüyor
    const t2 = await k.arena.createTable(quitter, { tier: 'bronze', capacity: 3 });
    expect(t2.players.map((p) => p.userId)).toContain(quitter);
  });

  it('sonar: 3×3 alandaki mayınları sayar, hakkı düşer, sırayı değiştirmez; sırası olmayan kullanamaz', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    const me = cur(k, matchId);
    const other = users.find((u) => u !== me)!;
    expect(code(() => k.arena.scanCell(other, matchId, 0))).toBe('not-your-turn');
    const before = s.turnNo;
    const r = k.arena.scanCell(me, matchId, s.size + 1);
    expect(r.area).toHaveLength(9);
    expect(r.count).toBe(r.area.filter((i) => k.state(matchId).mines.includes(i)).length);
    expect(k.state(matchId).turnNo).toBe(before);
    expect(cur(k, matchId)).toBe(me);
    expect(code(() => k.arena.scanCell(me, matchId, 0))).toBe('no-sonar');
    expect(k.arena.matchView(matchId, me)!.players.find((p) => p.userId === me)!.sonar).toBe(0);
  });

  it('güçler: Zaman Dondurma sunucuda süreyi uzatır, Duman sıradakine işler; sırası olmayan kullanamaz', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const me = cur(k, matchId);
    const other = users.find((u) => u !== me)!;
    expect(code(() => k.arena.power(other, matchId, 'freeze'))).toBe('not-your-turn');
    const before = k.arena.matchView(matchId, me)!.turnEndsAt!;
    expect(k.arena.power(me, matchId, 'freeze').extendMs).toBe(10_000);
    expect(k.arena.matchView(matchId, me)!.turnEndsAt).toBe(before + 10_000);
    expect(code(() => k.arena.power(me, matchId, 'freeze'))).toBe('no-power'); // varsayılan 1 hak
    expect(code(() => k.arena.power(me, matchId, 'nuke'))).toBe('bad-request');
    k.arena.power(me, matchId, 'smoke');
    const v = k.arena.matchView(matchId, other)!;
    expect(v.smoke).toEqual({ by: v.players.find((p) => p.userId === me)!.seat, turnNo: v.turnNo + 1 });
    expect(v.lastPower?.kind).toBe('smoke');
    expect(v.players.find((p) => p.userId === me)!.smoke).toBe(0);
  });

  it('20) sunucu yeniden başlarsa: maç durumu veritabanındadır; yarıda kalan maç iade edilerek kapatılır', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    k.arena.move(cur(k, matchId), matchId, safeCell(s));
    const saved = JSON.parse(k.db.get<{ board_state: string }>('SELECT board_state FROM matches WHERE id = ?', matchId)!.board_state);
    expect(saved.cells).toEqual(s.cells);
    expect(k.arena.contextFor(users[1]).matchId).toBe(matchId); // yeniden bağlanan doğru maça döner
    // yeni süreç: canlı durum yok → recover
    const { Arena } = await import('./arena');
    const fresh = new Arena(k.db, k.accounts, { clock: { now: k.time.now }, scheduler: k.time });
    expect(fresh.recover().aborted).toBe(1);
    for (const u of users) expect(k.balance(u)).toBe(ECONOMY.startingBalance);
    expect(fresh.recover().aborted).toBe(0); // ikinci kez iade yok
    for (const u of users) expect(k.balance(u)).toBe(ECONOMY.startingBalance);
  });
});

describe('hemen oyna', () => {
  it('uygun masaya oturtur; ücret üst sınırını aşan masaya asla yerleştirmez', async () => {
    const k = await makeKit();
    const host = k.guest();
    await k.arena.createTable(host, { tier: 'silver' }); // 500
    const u = k.guest();
    const r = k.arena.quickStart(u, { maxFee: 200 });
    expect(r.joined).toBeNull();
    expect(r.queued).toBe(true);
    expect(k.arena.contextFor(u).queue?.tier).toBe('bronze');
    k.arena.quickCancel(u);
    expect(k.arena.contextFor(u).queue).toBeNull();
    expect(k.balance(u)).toBe(ECONOMY.startingBalance); // iptal edilen aramadan ücret yok
    const r2 = k.arena.quickStart(u, { maxFee: 600 });
    expect(r2.joined).not.toBeNull();
  });

  it('kuyrukta kapasite kadar oyuncu birikince masa kurulur ve dolar', async () => {
    const k = await makeKit();
    const users = [k.guest(), k.guest(), k.guest()];
    for (const u of users) k.arena.quickStart(u, { tier: 'bronze' });
    const seats = users.map((u) => k.arena.contextFor(u).table?.id);
    expect(new Set(seats).size).toBe(1);
    expect(seats[0]).toBeDefined();
    expect(k.arena.getTableView(seats[0]!)!.status).toBe('countdown');
  });

  it('bekleme süresi dolarsa oyuncu için herkese açık masa açılır', async () => {
    const k = await makeKit();
    const u = k.guest();
    k.arena.quickStart(u, { tier: 'bronze' });
    k.time.advance(ECONOMY.quickplay.waitSeconds * 1000);
    const ctx = k.arena.contextFor(u);
    expect(ctx.queue).toBeNull();
    expect(ctx.table?.status).toBe('waiting');
  });

  it('bekleme odasında bağlantısı kopan oyuncunun koltuğu süre sonunda iadeyle boşalır', async () => {
    const online = new Set<string>();
    const k = await makeKit({ online: (u) => online.has(u) });
    const [a, b] = [k.guest(), k.guest()];
    online.add(a);
    online.add(b);
    const t = await k.arena.createTable(a, { tier: 'bronze' });
    await k.arena.joinTable(b, t.id);
    online.delete(b);
    k.arena.userOffline(b);
    k.time.advance(30_000);
    expect(k.arena.getTableView(t.id)!.players.map((p) => p.userId)).toEqual([a]);
    expect(k.balance(b)).toBe(ECONOMY.startingBalance);
  });
});

describe('sıralama ve kötüye kullanım', () => {
  it('aynı oyuncu kümesi hafta içinde art arda oynarsa puan önce yarıya iner, sonra sıfırlanır', async () => {
    const k = await makeKit();
    const users = [k.guest(), k.guest(), k.guest()];
    const winner = users[0];
    const pts: number[] = [];
    for (let g = 0; g < 6; g++) {
      const t = await k.arena.createTable(users[0], { tier: 'bronze' });
      await k.arena.joinTable(users[1], t.id);
      await k.arena.joinTable(users[2], t.id);
      k.time.advance(3000);
      const matchId = k.arena.getTableView(t.id)!.matchId!;
      const s = k.state(matchId);
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 300) {
        const u = cur(k, matchId);
        k.arena.move(u, matchId, u === winner ? safeCell(s) : mineCell(s));
      }
      pts.push(k.db.get<{ points_delta: number }>('SELECT points_delta FROM match_players WHERE match_id = ? AND user_id = ?', matchId, winner)!.points_delta);
    }
    expect(pts.slice(0, 3)).toEqual([25, 25, 25]);
    expect(pts.slice(3, 5)).toEqual([13, 13]);
    expect(pts[5]).toBe(0);
  });

  it('haftalık sıfırlama sunucu saatine göre: biten hafta bir kez arşivlenir, ilk 3 ödül alır', async () => {
    const k = await makeKit();
    const { matchId, users } = await fullTable(k, 3);
    const s = k.state(matchId);
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 200) {
      const u = cur(k, matchId);
      k.arena.move(u, matchId, u === users[1] ? safeCell(s) : mineCell(s));
    }
    const week = k.arena.leaderboard(null).week;
    const before = k.balance(users[1]);
    k.time.advance(8 * 86_400_000);
    expect(k.arena.leaderboard(null).list).toHaveLength(0); // yeni hafta: puanlar sıfır
    expect(k.arena.settleWeeks()).toEqual([week]);
    expect(k.arena.settleWeeks()).toEqual([]);
    expect(k.balance(users[1])).toBe(before + ECONOMY.weeklyPrizes[0]);
    expect(k.arena.leaderboard(null, week).list[0].userId).toBe(users[1]); // arşiv duruyor
    expect(k.accounts.me(users[1]).wins).toBe(1); // toplam istatistik korunur
    expect(k.accounts.me(users[1]).bestRank).toBe(1);
  });
});

describe('22) yük: çok oyuncu aynı anda', () => {
  it('60 oyuncu hemen oyna + karışık ayrılmalarla tutarlı kalır; bakiyeler defterle birebir', async () => {
    const k = await makeKit();
    const users = Array.from({ length: 60 }, () => k.guest());
    users.forEach((u, i) => k.arena.quickStart(u, { tier: i % 3 === 0 ? 'any' : 'bronze', maxFee: 1500 }));
    for (const u of users.filter((_, i) => i % 7 === 0)) k.arena.leaveTable(u);
    k.time.advance(20_000);
    // hiçbir oyuncu iki masada değil
    const active = k.db.all<{ user_id: string; n: number }>("SELECT user_id, COUNT(*) n FROM table_players WHERE status IN ('seated','playing') GROUP BY user_id");
    expect(active.every((r) => r.n === 1)).toBe(true);
    // hiçbir masada kapasiteden fazla oyuncu yok, koltuklar benzersiz
    for (const t of k.db.all<{ id: string; max_players: number }>('SELECT id, max_players FROM tables')) {
      const seats = k.db.all<{ seat_number: number }>("SELECT seat_number FROM table_players WHERE table_id = ? AND status IN ('seated','playing')", t.id);
      expect(seats.length).toBeLessThanOrEqual(t.max_players);
      expect(new Set(seats.map((x) => x.seat_number)).size).toBe(seats.length);
    }
    // tüm maçları rastgele oynayarak bitir
    const live = (k.arena as unknown as { live: Map<string, unknown> }).live;
    let guard = 0;
    while (live.size && guard++ < 20_000) {
      for (const id of [...live.keys()]) {
        const s = k.state(id);
        if (s.phase !== 'playing') continue;
        const u = s.players[s.current].userId;
        const hidden = s.cells.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
        k.arena.move(u, id, hidden[(guard * 31) % hidden.length]);
      }
    }
    expect(live.size).toBe(0);
    for (const u of users) {
      const sum = k.db.get<{ s: number }>('SELECT COALESCE(SUM(amount),0) s FROM wallet_transactions WHERE user_id = ?', u)!.s;
      expect(k.balance(u)).toBe(sum);
      expect(k.balance(u)).toBeGreaterThanOrEqual(0);
    }
    // ödüller = havuzlar
    const pools = k.db.get<{ s: number }>("SELECT COALESCE(SUM(prize_pool),0) s FROM matches WHERE status='finished'")!.s;
    const prizes = k.db.get<{ s: number }>("SELECT COALESCE(SUM(amount),0) s FROM wallet_transactions WHERE transaction_type='match-prize'")!.s;
    expect(prizes).toBe(pools);
    expect(pools).toBeGreaterThan(0);
  });
});

describe('kişiselleştirilmiş masa', () => {
  it('2 kişilik masa; tur süresi, can, yoğunluk, sonar ve kalkan masadan gelir', async () => {
    const k = await makeKit();
    const [a, b] = [k.guest(), k.guest()];
    const t = await k.arena.createTable(a, { tier: 'silver', capacity: 2, options: { turnSeconds: 30, lives: 5, density: 'hard', sonars: 3, shields: 0 } });
    expect(t.maxPlayers).toBe(2);
    expect(t.mineCount).toBeGreaterThan(boardFor(TIERS.silver, 2).mines); // çok mayın
    await k.arena.joinTable(b, t.id);
    k.time.advance(ECONOMY.countdownSeconds * 1000);
    const matchId = k.arena.getTableView(t.id)!.matchId!;
    const v = k.arena.matchView(matchId, a)!;
    expect(v.players).toHaveLength(2);
    expect(v.turnSeconds).toBe(30);
    expect(v.players.every((p) => p.lives === 5 && p.sonar === 3 && p.shield === 0)).toBe(true);
    const turn = k.state(matchId).turnNo;
    k.time.advance(20_500);
    expect(k.state(matchId).turnNo).toBe(turn); // 20 sn'de değil
    k.time.advance(10_000);
    expect(k.state(matchId).turnNo).toBe(turn + 1); // 30 sn'de süre doldu
  });
});

describe('yeni modlar (sunucu)', () => {
  it('Mayın Avcısı masası: imha hamlesi sunucuda doğrulanır; Yıldırım tur süresi 8 sn', async () => {
    const k = await makeKit();
    const users = [k.guest(), k.guest(), k.guest()];
    const t = await k.arena.createTable(users[0], { tier: 'bronze', capacity: 3, mode: 'hunter' });
    for (const u of users.slice(1)) await k.arena.joinTable(u, t.id);
    k.time.advance(ECONOMY.countdownSeconds * 1000);
    const matchId = k.arena.getTableView(t.id)!.matchId!;
    const s = k.state(matchId);
    expect(s.mode).toBe('hunter');
    const me = s.players[s.current].userId;
    const mine = s.mines.find((m) => s.cells[m] === 0)!;
    const out = k.arena.move(me, matchId, mine, 'defuse');
    expect(out.kind).toBe('defused');
    expect(k.arena.matchView(matchId, me)!.players.find((p) => p.userId === me)!.defused).toBe(1);
    expect(k.arena.matchView(matchId, me)!.cells[mine]).toBe(11);

    const v = [k.guest(), k.guest(), k.guest()];
    const b = await k.arena.createTable(v[0], { tier: 'bronze', capacity: 3, mode: 'blitz' });
    for (const u of v.slice(1)) await k.arena.joinTable(u, b.id);
    k.time.advance(ECONOMY.countdownSeconds * 1000);
    const bm = k.arena.getTableView(b.id)!.matchId!;
    const view = k.arena.matchView(bm, v[0])!;
    expect(view.turnSeconds).toBe(8);
    expect(view.players.every((p) => p.lives === 2)).toBe(true);
    const turn0 = k.state(bm).turnNo;
    k.time.advance(8100);
    expect(k.state(bm).turnNo).toBe(turn0 + 1); // 8 sn sonra süre aşımı
  });

  it('003 göçü eski verileri korur ve yabancı anahtarlar sağlam kalır', async () => {
    const { openDb, migrate } = await import('./db');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const src = path.join(path.dirname(new URL(import.meta.url).pathname), 'migrations');
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    for (const f of ['001_init.sql', '002_modes.sql']) fs.copyFileSync(path.join(src, f), path.join(old, f));
    const db = await openDb(':memory:');
    migrate(db, old + '/');
    db.run("INSERT INTO users (id, username, username_lc, display_name, avatar, account_type, balance, created_at) VALUES ('u1','Eski','eski','Eski',0,'guest',100,1)");
    db.run("INSERT INTO tables (id,name,tier,difficulty,board_size,mine_count,entry_fee,max_players,status,created_by,created_at,mode) VALUES ('t1','Eski','bronze','normal',12,17,100,3,'waiting','u1',1,'treasure')");
    db.run("INSERT INTO table_players (table_id,user_id,seat_number,status,entry_fee_paid,joined_at) VALUES ('t1','u1',0,'seated',100,1)");
    const done = migrate(db, src + '/');
    expect(done).toContain('003_more_modes.sql');
    expect(db.get<{ mode: string }>("SELECT mode FROM tables WHERE id='t1'")!.mode).toBe('treasure');
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM table_players WHERE table_id='t1'")!.n).toBe(1);
    expect(db.all('PRAGMA foreign_key_check')).toHaveLength(0);
    db.run("UPDATE tables SET mode='hunter' WHERE id='t1'");
    // silme hâlâ zincirleme çalışır (ON DELETE CASCADE)
    db.run("DELETE FROM tables WHERE id='t1'");
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM table_players")!.n).toBe(0);
  });
});
