/**
 * Günlük görevler: her gün herkese aynı 3 görev (tarihten seçilir). İlerleme bu cihazda tutulur;
 * ödül (DUEL COIN) arka uçta anahtar başına bir kez verilir (`grantReward`). Antrenman maçları sayılmaz.
 */
import { puzzleDay } from './puzzle';

export type QuestEvent = 'match' | 'win' | 'safe' | 'clean' | 'sonar' | 'pass' | 'force' | 'shrink' | 'puzzle';

export interface QuestDef {
  id: string;
  event: QuestEvent;
  target: number;
  reward: number;
  text: string;
  icon: string;
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'play2', event: 'match', target: 2, reward: 200, text: '2 maç bitir', icon: '🎮' },
  { id: 'play4', event: 'match', target: 4, reward: 400, text: '4 maç bitir', icon: '🎮' },
  { id: 'win1', event: 'win', target: 1, reward: 400, text: 'Bir maç kazan', icon: '🏆' },
  { id: 'safe60', event: 'safe', target: 60, reward: 250, text: 'Toplam 60 güvenli kare aç', icon: '⛏️' },
  { id: 'clean1', event: 'clean', target: 1, reward: 350, text: 'Bir maçı hiç mayına basmadan bitir', icon: '🧠' },
  { id: 'sonar2', event: 'sonar', target: 2, reward: 200, text: '2 kez Sonar kullan', icon: '📡' },
  { id: 'pass1', event: 'pass', target: 1, reward: 150, text: 'Tıkandığında Pas kullan', icon: '⏭️' },
  { id: 'force1', event: 'force', target: 1, reward: 200, text: 'Bir rakibi Zorla ile kısıtla', icon: '👉' },
  { id: 'shrink1', event: 'shrink', target: 1, reward: 300, text: 'Bir Daralan Tahta maçı bitir', icon: '🌪️' },
  { id: 'puzzle1', event: 'puzzle', target: 1, reward: 300, text: 'Günün Bulmacası\'nı çöz', icon: '🧩' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Günün 3 görevi: biri her zaman bulmaca ya da maç görevi değil; aynı olay iki kez çıkmaz. */
export function questsFor(day: string): QuestDef[] {
  const pool = [...QUEST_POOL];
  let x = hash(day) || 1;
  const out: QuestDef[] = [];
  while (out.length < 3 && pool.length) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const q = pool.splice(x % pool.length, 1)[0];
    if (!out.some((o) => o.event === q.event)) out.push(q);
  }
  return out;
}

interface QuestState {
  day: string;
  progress: Record<string, number>;
}
const KEY = 'md2:quests';

function load(day: string): QuestState {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as QuestState | null;
    if (v && v.day === day && v.progress) return v;
  } catch {
    /* yok say */
  }
  return { day, progress: {} };
}
function save(s: QuestState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* yok say */
  }
}

const listeners = new Set<() => void>();
export function onQuestChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bir oyun olayını bugünün görevlerine işler. Tamamlanan görev sayısını döndürür (bildirim için). */
export function recordQuest(event: QuestEvent, amount = 1, now = Date.now()): QuestDef[] {
  const day = puzzleDay(now);
  const s = load(day);
  const done: QuestDef[] = [];
  for (const q of questsFor(day)) {
    if (q.event !== event) continue;
    const before = s.progress[q.id] ?? 0;
    const after = Math.min(q.target, before + amount);
    s.progress[q.id] = after;
    if (before < q.target && after >= q.target) done.push(q);
  }
  save(s);
  for (const l of listeners) l();
  return done;
}

export interface QuestView extends QuestDef {
  progress: number;
  complete: boolean;
  /** Arka uçtaki ödül anahtarı (anahtar başına bir kez). */
  key: string;
}

export function todaysQuests(now = Date.now()): QuestView[] {
  const day = puzzleDay(now);
  const s = load(day);
  return questsFor(day).map((q) => {
    const progress = s.progress[q.id] ?? 0;
    return { ...q, progress, complete: progress >= q.target, key: `q:${day}:${q.id}` };
  });
}
