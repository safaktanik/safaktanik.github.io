import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash, randomInt } from 'node:crypto';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const rngInt = (n: number) => randomInt(n);

/** scrypt ile parola özeti: `scrypt$<tuz>$<özet>`. Düz metin hiçbir yerde saklanmaz. */
export function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((ok, fail) =>
    scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? fail(e) : ok(`scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`))),
  );
}
export function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return Promise.resolve(false);
  return new Promise((ok) =>
    scrypt(secret, Buffer.from(salt, 'base64url'), 32, { N: 16384, r: 8, p: 1 }, (e, key) => {
      const want = Buffer.from(hash, 'base64url');
      ok(!e && key.length === want.length && timingSafeEqual(key, want));
    }),
  );
}

/** Basit kayan pencere hız sınırı (bellekte). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
    private clock: Clock = systemClock,
  ) {}
  /** true: izin var (ve sayılır). */
  take(key: string): boolean {
    const now = this.clock.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}
