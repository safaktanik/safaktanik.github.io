/** claude.ai `db` yeteneğinin bu oyunda kullanılan alt kümesi (yerel test deposu da aynısını uygular). */
export interface HDocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface HQuerySnap {
  docs: HDocSnap[];
}
export interface HAcquire {
  acquired: boolean;
  expiresAt?: string;
}
export interface HDocRef {
  id: string;
  path: string;
  get(): Promise<HDocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  acquire(o: { holder: string; ttlMs?: number }): Promise<HAcquire>;
  onSnapshot(next: (s: HDocSnap) => void, error?: (e: { code: string }) => void): () => void;
}
export interface HQuery {
  where(field: string, op: string, value: unknown): HQuery;
  orderBy(field: string, dir?: 'asc' | 'desc'): HQuery;
  limit(n: number): HQuery;
  get(): Promise<HQuerySnap>;
  onSnapshot(next: (s: HQuerySnap) => void, error?: (e: { code: string }) => void): () => void;
}
export interface HCollection extends HQuery {
  doc(id?: string): HDocRef;
}
/** claude.ai `room` yeteneğinin kullanılan alt kümesi: anlık, saklanmayan olaylar (emoji). */
export interface HRoomMsg {
  data?: unknown;
  by?: string | null;
}
export interface HNamedRoom {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, fn: (m: HRoomMsg) => void, onError?: (e: { code: string }) => void): () => void;
  leave(): Promise<void>;
}
export interface HRoom {
  join(name: string): Promise<HNamedRoom>;
}

export interface HDb {
  doc(path: string): HDocRef;
  collection(path: string): HCollection;
  /** Ortak saat (ms): depoyu barındıran tarafın saatine göre. Yoksa cihaz saati kullanılır. */
  now?(): number;
  /** Saat henüz eşitlenmediyse false (süreye bağlı kararlar beklenir). */
  synced?(): boolean;
}
