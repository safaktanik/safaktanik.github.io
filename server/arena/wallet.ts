import type { Db } from './db';

export class WalletError extends Error {
  constructor(public code: 'insufficient' | 'no-user') {
    super(code);
  }
}

export interface TxInput {
  userId: string;
  type: string;
  /** İşaretli miktar: eksi = tahsilat, artı = ödeme. */
  amount: number;
  /** Aynı anahtar ikinci kez gönderilirse bakiye değişmez. */
  key: string;
  matchId?: string | null;
  tableId?: string | null;
  now: number;
}

export interface TxResult {
  duplicate: boolean;
  balance: number;
}

/**
 * Tek bakiye değişikliği: kayıt + bakiye güncellemesi birlikte yapılır. Çağıran bir transaction içinde olmalıdır
 * (burada da `tx` açılır; iç içe ise SAVEPOINT olur). Bakiye eksiye düşemez.
 */
export function applyWalletTx(db: Db, t: TxInput): TxResult {
  if (!Number.isInteger(t.amount)) throw new Error('bad-amount');
  return db.tx(() => {
    const existing = db.get<{ balance_after: number }>('SELECT balance_after FROM wallet_transactions WHERE idempotency_key = ?', t.key);
    if (existing) {
      const u = db.get<{ balance: number }>('SELECT balance FROM users WHERE id = ?', t.userId);
      return { duplicate: true, balance: u?.balance ?? existing.balance_after };
    }
    const u = db.get<{ balance: number }>('SELECT balance FROM users WHERE id = ?', t.userId);
    if (!u) throw new WalletError('no-user');
    const after = u.balance + t.amount;
    if (after < 0) throw new WalletError('insufficient');
    db.run('UPDATE users SET balance = ? WHERE id = ?', after, t.userId);
    db.run(
      `INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_before, balance_after, match_id, table_id, idempotency_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      t.userId,
      t.type,
      t.amount,
      u.balance,
      after,
      t.matchId ?? null,
      t.tableId ?? null,
      t.key,
      t.now,
    );
    return { duplicate: false, balance: after };
  });
}

export function listTransactions(db: Db, userId: string, limit = 30) {
  return db.all<{ id: number; transaction_type: string; amount: number; balance_before: number; balance_after: number; match_id: string | null; table_id: string | null; created_at: number }>(
    'SELECT id, transaction_type, amount, balance_before, balance_after, match_id, table_id, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    userId,
    limit,
  );
}
