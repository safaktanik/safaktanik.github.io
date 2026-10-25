import { nodeClient, probeServer } from './client';
import type { ServerProbe } from './client';
import type { ArenaBackend } from './backend';
import { HostedBackend } from './hosted/hostedBackend';
import { connectDevStore } from './hosted/devStore';
import type { HDb, HRoom } from './hosted/types';
import { LOCAL_UID, createLocalDb } from './hosted/localDb';

export type Detected =
  | { kind: 'hosted'; backend: ArenaBackend; dev: boolean; local?: boolean; reason?: Exclude<ServerProbe, 'ok'> | 'signed-out' }
  | { kind: 'server'; backend: ArenaBackend }
  | { kind: 'none'; reason: Exclude<ServerProbe, 'ok'> | 'signed-out' };

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

function devUid(): string {
  try {
    const k = 'mine-duel:dev-uid';
    const v = window.sessionStorage.getItem(k) ?? `dev${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(k, v);
    return v;
  } catch {
    return `dev${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Hangi arka uçla oynanacağını bulur:
 *  1. claude.ai'de yayınlanan sayfa → paylaşılan veritabanı üzerindeki TEST SUNUCUSU
 *  2. `?teststore=ws://…` → yerel test deposu (geliştirme/otomatik test)
 *  3. aynı adreste çalışan gerçek oyun sunucusu (npm start)
 *  4. hiçbiri → yalnızca antrenman
 */
export async function detectBackend(): Promise<Detected> {
  const params = new URLSearchParams(window.location.search);
  const ts = params.get('teststore');
  if (ts) {
    const uid = params.get('uid') || devUid();
    try {
      const { db, room } = await connectDevStore(ts, uid);
      return { kind: 'hosted', backend: new HostedBackend(db, uid, {}, room), dev: true };
    } catch {
      return { kind: 'none', reason: 'no-server' };
    }
  }
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host && typeof host.use === 'function') {
    // Oda (emoji) açılışı bekletmez: hazır olunca bağlanır.
    const roomP = Promise.resolve()
      .then(() => host.use('room'))
      .catch(() => null) as Promise<HRoom | null>;
    const [db, user] = (await Promise.all([host.use('db').catch(() => null), host.use('user').catch(() => null)])) as [HDb | null, { id(): Promise<string | null>; can?(c: string): Promise<boolean | null> } | null];
    if (db) {
      const uid = user ? await user.id().catch(() => null) : null;
      if (uid) {
        const b = new HostedBackend(db, uid, {}, null);
        void roomP.then((r) => r && b.setRoom(r));
        // Yalnızca görüntüleme yetkisi varsa oyuncu yazamaz: arayüz bunu açıkça söyler.
        void user?.can?.('data.write').then((ok) => ok === false && b.markReadOnly()).catch(() => undefined);
        return { kind: 'hosted', backend: b, dev: false };
      }
      return local('signed-out');
    }
  }
  // GitHub Pages yalnızca statik dosya sunar: oyun sunucusu yoktur, /api/config isteği konsola 404 düşürür.
  if (/\.github\.io$/i.test(window.location.hostname)) return local('no-server');
  const probe = await probeServer();
  if (probe === 'ok') return { kind: 'server', backend: nodeClient() };
  return local(probe);
}

/** Sunucu yoksa: masalar, para, mağaza ve sıralama bu cihazda çalışır (rakipler bot). */
function local(reason: Exclude<ServerProbe, 'ok'> | 'signed-out'): Detected {
  return { kind: 'hosted', backend: new HostedBackend(createLocalDb(), LOCAL_UID, { local: true }), dev: false, local: true, reason };
}
