import { loadPrefs, savePrefs } from '../app/prefs';

/**
 * Küçük, rahatsız etmeyen ses efektleri. Ses dosyası yoktur; Web Audio ile üretilir.
 * Tarayıcılar sesi ilk kullanıcı etkileşiminden önce engellediği için bağlam tembel oluşturulur.
 */

export type SoundId = 'click' | 'aim' | 'splash' | 'hit' | 'sunk' | 'boom' | 'place' | 'turn' | 'win' | 'lose' | 'reveal' | 'tick' | 'go' | 'seat' | 'coins' | 'out' | 'shield' | 'sonar' | 'pop' | 'streak' | 'warn' | 'flag' | 'unflag' | 'timeup' | 'bonus' | 'extra' | 'zap' | 'heart' | 'right' | 'wrong' | 'pass' | 'force';

interface Tone {
  /** Başlangıç frekansı (Hz). */
  f: number;
  /** Verilirse süre boyunca bu frekansa kayar. */
  to?: number;
  /** Başlangıç gecikmesi (sn). */
  at: number;
  /** Süre (sn). */
  dur: number;
  type?: OscillatorType;
  vol?: number;
}

const SOUNDS: Record<SoundId, Tone[]> = {
  click: [{ f: 440, at: 0, dur: 0.04, type: 'sine', vol: 0.5 }],
  aim: [{ f: 640, to: 720, at: 0, dur: 0.05, type: 'sine', vol: 0.45 }],
  place: [{ f: 300, to: 220, at: 0, dur: 0.08, type: 'triangle', vol: 0.6 }],
  // Boş atış: yumuşak su sıçraması.
  splash: [
    { f: 420, to: 180, at: 0, dur: 0.18, type: 'sine', vol: 0.55 },
    { f: 300, to: 140, at: 0.05, dur: 0.2, type: 'triangle', vol: 0.25 },
  ],
  // Gemiye isabet: keskin, yüksek "tak".
  hit: [
    { f: 880, to: 520, at: 0, dur: 0.1, type: 'square', vol: 0.5 },
    { f: 660, at: 0.08, dur: 0.14, type: 'triangle', vol: 0.6 },
  ],
  sunk: [
    { f: 523, at: 0, dur: 0.1, type: 'triangle' },
    { f: 392, at: 0.1, dur: 0.1, type: 'triangle' },
    { f: 262, at: 0.2, dur: 0.3, type: 'triangle' },
  ],
  // Mayın patlaması: alçak, gürültülü gümbürtü (isabetten belirgin biçimde farklı).
  boom: [
    { f: 140, to: 38, at: 0, dur: 0.55, type: 'sawtooth', vol: 1.2 },
    { f: 90, to: 30, at: 0.02, dur: 0.6, type: 'square', vol: 0.8 },
    { f: 60, to: 28, at: 0.08, dur: 0.5, type: 'sine', vol: 1 },
  ],
  turn: [{ f: 330, to: 392, at: 0, dur: 0.09, type: 'sine', vol: 0.5 }],
  // Güvenli kare: yumuşak, yükselen "tık".
  reveal: [{ f: 520, to: 780, at: 0, dur: 0.07, type: 'sine', vol: 0.5 }],
  tick: [{ f: 880, at: 0, dur: 0.05, type: 'square', vol: 0.25 }],
  go: [
    { f: 523, at: 0, dur: 0.1, type: 'triangle' },
    { f: 784, at: 0.1, dur: 0.22, type: 'triangle' },
  ],
  seat: [{ f: 392, to: 523, at: 0, dur: 0.12, type: 'triangle', vol: 0.6 }],
  coins: [
    { f: 1319, at: 0, dur: 0.06, type: 'square', vol: 0.3 },
    { f: 1568, at: 0.07, dur: 0.06, type: 'square', vol: 0.3 },
    { f: 2093, at: 0.14, dur: 0.12, type: 'square', vol: 0.3 },
  ],
  // Kalkan: metalik "çang".
  shield: [
    { f: 1200, to: 900, at: 0, dur: 0.18, type: 'square', vol: 0.35 },
    { f: 1800, to: 1500, at: 0.01, dur: 0.3, type: 'triangle', vol: 0.4 },
    { f: 150, to: 60, at: 0, dur: 0.25, type: 'sawtooth', vol: 0.5 },
  ],
  // Sonar: denizaltı "ping"i ve yankısı.
  sonar: [
    { f: 1480, at: 0, dur: 0.35, type: 'sine', vol: 0.7 },
    { f: 1480, at: 0.45, dur: 0.3, type: 'sine', vol: 0.25 },
  ],
  pop: [{ f: 600, to: 1100, at: 0, dur: 0.07, type: 'sine', vol: 0.45 }],
  // Süre azalıyor: son 3 saniyede ikili, tiz uyarı.
  warn: [
    { f: 1320, at: 0, dur: 0.07, type: 'square', vol: 0.55 },
    { f: 1320, at: 0.12, dur: 0.07, type: 'square', vol: 0.55 },
  ],
  timeup: [
    { f: 440, to: 220, at: 0, dur: 0.35, type: 'sawtooth', vol: 0.5 },
  ],
  flag: [
    { f: 700, to: 980, at: 0, dur: 0.06, type: 'triangle', vol: 0.55 },
    { f: 1180, at: 0.06, dur: 0.05, type: 'sine', vol: 0.35 },
  ],
  // Bonus kutusu: parlak arpej.
  bonus: [
    { f: 784, at: 0, dur: 0.07, type: 'triangle', vol: 0.5 },
    { f: 988, at: 0.07, dur: 0.07, type: 'triangle', vol: 0.5 },
    { f: 1319, at: 0.14, dur: 0.07, type: 'triangle', vol: 0.5 },
    { f: 1568, at: 0.21, dur: 0.22, type: 'sine', vol: 0.55 },
  ],
  // Ekstra tur: yükselen "vuuup".
  extra: [
    { f: 300, to: 1200, at: 0, dur: 0.28, type: 'sawtooth', vol: 0.3 },
    { f: 1200, at: 0.28, dur: 0.12, type: 'sine', vol: 0.5 },
  ],
  // Şimşek hamle: elektrikli çıtırtı.
  zap: [
    { f: 2400, to: 600, at: 0, dur: 0.09, type: 'sawtooth', vol: 0.35 },
    { f: 1800, to: 900, at: 0.08, dur: 0.1, type: 'square', vol: 0.25 },
  ],
  // Son can: kalp atışı (lüb-düb).
  heart: [
    { f: 70, to: 50, at: 0, dur: 0.12, type: 'sine', vol: 1 },
    { f: 60, to: 42, at: 0.2, dur: 0.14, type: 'sine', vol: 0.8 },
  ],
  // Pas: hızlı, yukarı kayan "fırlatma"
  pass: [
    { f: 300, to: 900, at: 0, dur: 0.22, type: 'triangle', vol: 0.4 },
    { f: 600, to: 1400, at: 0.08, dur: 0.2, type: 'sine', vol: 0.25 },
  ],
  // Zorla: iki kalın vuruş (kapan kurulur)
  force: [
    { f: 220, to: 160, at: 0, dur: 0.12, type: 'square', vol: 0.25 },
    { f: 330, to: 240, at: 0.14, dur: 0.16, type: 'square', vol: 0.25 },
    { f: 660, at: 0.3, dur: 0.18, type: 'triangle', vol: 0.3 },
  ],
  right: [
    { f: 660, at: 0, dur: 0.08, type: 'triangle', vol: 0.5 },
    { f: 990, at: 0.09, dur: 0.14, type: 'triangle', vol: 0.5 },
  ],
  wrong: [{ f: 220, to: 160, at: 0, dur: 0.22, type: 'square', vol: 0.3 }],
  unflag: [{ f: 900, to: 600, at: 0, dur: 0.07, type: 'triangle', vol: 0.45 }],
  streak: [
    { f: 659, at: 0, dur: 0.07, type: 'triangle' },
    { f: 880, at: 0.07, dur: 0.07, type: 'triangle' },
    { f: 1175, at: 0.14, dur: 0.16, type: 'triangle' },
  ],
  out: [
    { f: 300, to: 120, at: 0, dur: 0.4, type: 'sawtooth', vol: 0.5 },
    { f: 200, to: 80, at: 0.15, dur: 0.45, type: 'sine', vol: 0.7 },
  ],
  win: [
    { f: 523, at: 0, dur: 0.14, type: 'triangle' },
    { f: 659, at: 0.13, dur: 0.14, type: 'triangle' },
    { f: 784, at: 0.26, dur: 0.14, type: 'triangle' },
    { f: 1047, at: 0.39, dur: 0.35, type: 'triangle' },
  ],
  lose: [
    { f: 392, at: 0, dur: 0.18, type: 'sine' },
    { f: 330, at: 0.17, dur: 0.18, type: 'sine' },
    { f: 262, at: 0.34, dur: 0.35, type: 'sine' },
  ],
};

const MASTER_VOLUME = 0.09;

let enabled: boolean | null = null;
let ctx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  if (enabled === null) enabled = loadPrefs().sound;
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  if (!on) silentEl?.pause();
  enabled = on;
  savePrefs({ sound: on });
  if (!on) stopMusic();
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function playSound(id: SoundId): void {
  if (!isSoundEnabled()) return;
  const ac = context();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') void ac.resume();
    const start = ac.currentTime + 0.005;
    for (const tone of SOUNDS[id]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t0 = start + tone.at;
      const t1 = t0 + tone.dur;
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.f, t0);
      if (tone.to) osc.frequency.linearRampToValueAtTime(tone.to, t1);
      const peak = MASTER_VOLUME * (tone.vol ?? 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, tone.dur / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  } catch {
    /* ses çalınamazsa oyun etkilenmesin */
  }
}

/**
 * iPhone/Safari: ses bağlamı yalnızca bir dokunuşun içinde açılabilir. İlk dokunuşta bağlamı oluşturup
 * sessiz bir tampon çalarak "kilidi açar"; sonraki sesler (botların hamleleri dahil) çalışır.
 * Telefon sessize alınmışsa (yan anahtar) iOS Web Audio'yu yine susturur.
 */
/**
 * iPhone sessiz modu: Safari web seslerini "zil sesi" sayar ve yan tuş sessizdeyken susturur.
 * iOS 17+ için ses oturumu "playback" yapılır (oyun sesi medya sesi gibi çalar). Eski iOS'ta aynı etkiyi
 * sessiz bir <audio> öğesi sağlar. Ses seviyesi yine telefonun medya ses tuşlarıyla ayarlanır.
 */
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let silentEl: HTMLAudioElement | null = null;
function silentWavUrl(): string {
  const n = 4000; // 0,5 sn, 8 kHz, 8 bit mono
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, 'data');
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function iosPlayback(): void {
  if (!isIOS || !isSoundEnabled()) return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) {
      nav.audioSession.type = 'playback';
      return;
    }
  } catch {
    /* eski sürüm */
  }
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('x-webkit-airplay', 'deny');
      silentEl.loop = true;
      silentEl.preload = 'auto';
      silentEl.src = silentWavUrl();
    }
    if (silentEl.paused) void silentEl.play().catch(() => undefined);
  } catch {
    /* yok say */
  }
}

export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    iosPlayback();
    const ac = context();
    if (!ac) return;
    try {
      if (ac.state === 'suspended') void ac.resume();
      const b = ac.createBuffer(1, 1, 22050);
      const src = ac.createBufferSource();
      src.buffer = b;
      src.connect(ac.destination);
      src.start(0);
    } catch {
      /* yok say */
    }
    if (ac.state === 'running') {
      window.removeEventListener('touchend', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('touchend', unlock, true);
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // Safari arka plandan dönünce bağlamı askıya alabilir.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
      if (silentEl) iosPlayback();
    } else {
      // arka planda pil harcamasın
      silentEl?.pause();
      if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
    }
  });
}

/* ------------------------------------------------------------------ arka plan müziği */

/**
 * Hafif, üretilmiş "derin deniz" müziği: yumuşak akor dokusu + ara sıra uzak sonar sesi.
 * Dosya indirmez; sesler kapalıysa ya da müzik kapatıldıysa çalmaz. Sıra sende ve süre azalırken tempo hafifçe artar.
 */
let musicOn: boolean | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicGain: GainNode | null = null;
let tension = 0;
const CHORDS = [
  [110, 164.8, 220, 277.2],
  [98, 146.8, 196, 246.9],
  [87.3, 130.8, 174.6, 220],
  [103.8, 155.6, 207.7, 261.6],
];
export function isMusicEnabled(): boolean {
  if (musicOn === null) musicOn = loadPrefs().music;
  return musicOn;
}
export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  savePrefs({ music: on });
  if (!on) stopMusic();
}
/** 0 = sakin, 1 = sıra sende, 2 = süre azalıyor. */
export function setMusicTension(t: number): void {
  tension = t;
}
export function startMusic(): void {
  if (musicTimer || !isSoundEnabled() || !isMusicEnabled()) return;
  const ac = context();
  if (!ac) return;
  musicGain = ac.createGain();
  musicGain.gain.value = 0.0001;
  musicGain.connect(ac.destination);
  musicGain.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 2);
  let step = 0;
  const play = () => {
    if (!isSoundEnabled() || !isMusicEnabled() || !musicGain) return;
    if (ac.state === 'suspended') return;
    const t0 = ac.currentTime + 0.05;
    const chord = CHORDS[Math.floor(step / 2) % CHORDS.length];
    const len = tension >= 2 ? 1.1 : tension === 1 ? 1.6 : 2.2;
    for (const f of chord) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + len * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len * 1.4);
      o.connect(g).connect(musicGain);
      o.start(t0);
      o.stop(t0 + len * 1.5);
    }
    // nabız: gerilim arttıkça hızlanan alçak vuruş
    if (tension > 0) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(70, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
      g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(musicGain);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
    if (step % 5 === 3) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 1480;
      g.gain.setValueAtTime(0.0001, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      o.connect(g).connect(musicGain);
      o.start(t0 + 0.4);
      o.stop(t0 + 1.5);
    }
    step++;
  };
  play();
  let last = Date.now();
  musicTimer = setInterval(() => {
    const every = tension >= 2 ? 1100 : tension === 1 ? 1600 : 2200;
    if (Date.now() - last >= every) {
      last = Date.now();
      play();
    }
  }, 200);
}
export function stopMusic(): void {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  const g = musicGain;
  musicGain = null;
  if (g && ctx) {
    try {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      setTimeout(() => g.disconnect(), 800);
    } catch {
      g.disconnect();
    }
  }
}
