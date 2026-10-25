/** Kalıcı kullanıcı tercihleri. Tarayıcı depolaması kapalı/dolu olabilir; her erişim korunur. */

const KEY = 'mine-duel:prefs:v1';

export interface Prefs {
  sound: boolean;
  /** Arka plan müziği (maç sırasında, sesler açıkken). */
  music: boolean;
}

const DEFAULTS: Prefs = { sound: true, music: true };

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULTS.sound,
      music: typeof parsed.music === 'boolean' ? parsed.music : DEFAULTS.music,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* depolama kullanılamıyor: tercihler yalnızca bu oturumda geçerli olur */
  }
}
