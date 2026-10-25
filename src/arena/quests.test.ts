import { beforeEach, describe, expect, it } from 'vitest';
import { QUEST_POOL, questsFor, recordQuest, todaysQuests } from './quests';

// vitest node ortamı: basit localStorage
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
};

describe('günlük görevler', () => {
  beforeEach(() => store.clear());

  it('her gün herkese aynı 3 görev; aynı olay iki kez çıkmaz', () => {
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2026, 9, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const q = questsFor(day);
      expect(q).toHaveLength(3);
      expect(new Set(q.map((x) => x.event)).size).toBe(3);
      expect(questsFor(day)).toEqual(q);
    }
    expect(QUEST_POOL.every((q) => q.reward > 0 && q.target > 0)).toBe(true);
  });

  it('olaylar ilerletir, hedefte durur, tamamlanınca bir kez bildirilir; ertesi gün sıfırlanır', () => {
    const now = Date.UTC(2026, 9, 25, 10);
    const [q] = todaysQuests(now);
    const step = q.event === 'safe' ? 30 : 1;
    let completed = 0;
    for (let k = 0; k < q.target / step + 3; k++) completed += recordQuest(q.event, step, now).filter((x) => x.id === q.id).length;
    expect(completed).toBe(1);
    const v = todaysQuests(now).find((x) => x.id === q.id)!;
    expect(v.progress).toBe(q.target);
    expect(v.complete).toBe(true);
    expect(v.key).toBe(`q:2026-10-25:${q.id}`);
    // ertesi gün
    expect(todaysQuests(now + 86_400_000).every((x) => x.progress === 0)).toBe(true);
  });
});
