import { useEffect, useRef } from 'react';

/**
 * Parçacık efektleri: tek bir tam ekran tuval (canvas) üzerinde patlama, kalkan, sandık, imha, sonar, seri ve zafer.
 * Herhangi bir yerden `fx('boom', x, y)` ile tetiklenir (ekran koordinatı). "Hareketi azalt" açıksa çizilmez.
 */

export type FxKind = 'boom' | 'shield' | 'chest' | 'defuse' | 'misdefuse' | 'sonar' | 'streak' | 'win' | 'safe';

type PType = 'spark' | 'debris' | 'smoke' | 'drop' | 'ring' | 'coin' | 'star' | 'hex' | 'confetti' | 'flash';
interface P {
  t: PType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  rot: number;
  vr: number;
  drag: number;
}

const listeners = new Set<(k: FxKind, x: number, y: number, scale: number) => void>();
export function fx(kind: FxKind, x: number, y: number, scale = 1): void {
  for (const l of listeners) l(kind, x, y, scale);
}
/** Tahtadaki bir karenin ekran merkezinde efekt. */
export function fxAtCell(kind: FxKind, index: number, scale = 1): void {
  const el = document.querySelector<HTMLElement>(`.mgrid [data-i="${index}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  fx(kind, r.left + r.width / 2, r.top + r.height / 2, scale * Math.max(0.7, Math.min(1.4, r.width / 30)));
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function spawn(kind: FxKind, x: number, y: number, s: number): P[] {
  const out: P[] = [];
  const add = (p: Partial<P> & { t: PType }) =>
    out.push({ x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.8, size: 4, grow: 0, color: '#fff', rot: rnd(0, 6.28), vr: 0, drag: 0.985, ...p });
  const burst = (n: number, speed: [number, number], base: Partial<P> & { t: PType }) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(speed[0], speed[1]) * s;
      add({ ...base, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
  };
  switch (kind) {
    case 'boom':
      add({ t: 'flash', size: 26 * s, grow: 260 * s, max: 0.32, color: '#fff3c4' });
      add({ t: 'ring', size: 10 * s, grow: 420 * s, max: 0.55, color: 'rgba(255,200,120,1)' });
      add({ t: 'ring', size: 6 * s, grow: 260 * s, max: 0.75, color: 'rgba(255,90,60,1)' });
      burst(30, [180, 520], { t: 'spark', max: 0.55, size: 2.6 * s, color: pick(['#fff1a8', '#ffc24d', '#ff8a2a']), drag: 0.94 });
      for (let i = 0; i < 30; i++) out[out.length - 1 - i].color = pick(['#fff1a8', '#ffc24d', '#ff8a2a', '#ff5a3c']);
      burst(14, [120, 330], { t: 'debris', g: 900, max: 1.2, size: 4 * s, vr: rnd(-12, 12), color: pick(['#2b3440', '#3b4655', '#1b222b']), drag: 0.99 });
      for (let i = 0; i < 14; i++) out[out.length - 1 - i].vr = rnd(-14, 14);
      burst(12, [140, 360], { t: 'drop', g: 1100, max: 1.1, size: 3 * s, color: 'rgba(140,215,255,0.95)', drag: 0.99 });
      for (let i = 0; i < 10; i++) add({ t: 'smoke', vx: rnd(-40, 40) * s, vy: rnd(-90, -30) * s, max: rnd(1.1, 1.8), size: rnd(8, 14) * s, grow: rnd(26, 46) * s, color: pick(['90,96,104', '70,74,82', '120,110,100']), drag: 0.97 });
      break;
    case 'shield':
      add({ t: 'hex', size: 14 * s, grow: 120 * s, max: 0.7, color: '#7fe3ff' });
      add({ t: 'ring', size: 8 * s, grow: 300 * s, max: 0.5, color: 'rgba(127,227,255,1)' });
      burst(18, [140, 360], { t: 'spark', max: 0.6, size: 2.4 * s, color: '#bff2ff', drag: 0.93 });
      break;
    case 'chest':
      burst(16, [160, 340], { t: 'coin', g: 900, max: 1.3, size: 5 * s, color: '#ffd34d', drag: 0.99 });
      for (let i = 0; i < 16; i++) out[out.length - 1 - i].vy -= 260 * s;
      burst(12, [60, 200], { t: 'star', max: 0.9, size: 5 * s, color: '#fff3b0', drag: 0.94 });
      break;
    case 'defuse':
      add({ t: 'ring', size: 6 * s, grow: 220 * s, max: 0.6, color: 'rgba(110,255,170,1)' });
      burst(20, [90, 280], { t: 'star', max: 0.8, size: 4 * s, color: pick(['#9dffc6', '#e9fff2', '#4de39a']), drag: 0.93 });
      for (let i = 0; i < 20; i++) out[out.length - 1 - i].color = pick(['#9dffc6', '#e9fff2', '#4de39a']);
      break;
    case 'misdefuse':
      add({ t: 'ring', size: 6 * s, grow: 200 * s, max: 0.5, color: 'rgba(255,80,80,1)' });
      burst(14, [80, 220], { t: 'spark', max: 0.5, size: 2.4 * s, color: '#ff8a7a', drag: 0.92 });
      break;
    case 'sonar':
      for (let k = 0; k < 3; k++) add({ t: 'ring', size: 4 * s, grow: (140 + k * 40) * s, max: 0.9 + k * 0.25, color: 'rgba(110,255,230,1)', life: -k * 0.18 });
      break;
    case 'streak':
      for (let i = 0; i < 22; i++) add({ t: 'spark', vx: rnd(-90, 90) * s, vy: rnd(-380, -160) * s, g: 300, max: rnd(0.5, 0.9), size: rnd(2, 3.5) * s, color: pick(['#ffde6b', '#ff9d2e', '#ff5a2e']), drag: 0.96 });
      break;
    case 'safe':
      burst(8, [40, 120], { t: 'star', max: 0.45, size: 2.6 * s, color: '#b8fff1', drag: 0.9 });
      break;
    case 'win': {
      const w = window.innerWidth;
      for (let i = 0; i < 120; i++)
        out.push({ t: 'confetti', x: rnd(0, w), y: rnd(-80, -10), vx: rnd(-60, 60), vy: rnd(120, 300), g: 160, life: 0, max: rnd(2.2, 3.4), size: rnd(5, 9), grow: 0, color: pick(['#ffd34d', '#4de3c8', '#ff5a7a', '#7fb2ff', '#b98aff', '#ffffff']), rot: rnd(0, 6.28), vr: rnd(-8, 8), drag: 0.995 });
      break;
    }
  }
  return out;
}

function draw(ctx: CanvasRenderingContext2D, p: P): void {
  const k = Math.max(0, p.life / p.max);
  const fade = 1 - k;
  switch (p.t) {
    case 'flash': {
      const r = p.size + p.grow * k;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(255,250,220,${0.95 * fade})`);
      g.addColorStop(0.4, `rgba(255,170,60,${0.6 * fade})`);
      g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ring':
    case 'hex': {
      const r = p.size + p.grow * Math.sqrt(k);
      ctx.strokeStyle = p.color.startsWith('rgba') ? p.color.replace(/,1\)$/, `,${fade})`) : p.color;
      ctx.globalAlpha = p.t === 'hex' ? fade : 1;
      ctx.lineWidth = Math.max(1, 5 * fade);
      ctx.beginPath();
      if (p.t === 'hex') for (let i = 0; i <= 6; i++) ctx[i ? 'lineTo' : 'moveTo'](p.x + Math.cos((i * Math.PI) / 3) * r, p.y + Math.sin((i * Math.PI) / 3) * r);
      else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'spark':
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = fade;
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'smoke': {
      const r = p.size + p.grow * k;
      ctx.fillStyle = `rgba(${p.color},${0.45 * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'drop':
      ctx.fillStyle = p.color;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.7, p.size * 1.3, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'debris':
    case 'confetti':
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.t === 'confetti' ? Math.min(1, fade * 2) : fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.t === 'confetti' ? p.size * 0.55 : p.size * 0.7);
      ctx.restore();
      break;
    case 'coin':
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(Math.abs(Math.cos(p.life * 9)) * 0.8 + 0.2, 1);
      ctx.globalAlpha = Math.min(1, fade * 2);
      ctx.fillStyle = '#f0b52a';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath();
      ctx.arc(-p.size * 0.2, -p.size * 0.2, p.size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    case 'star': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      const r = p.size;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.35 : r;
        ctx.lineTo(Math.cos((i * Math.PI) / 4) * rr, Math.sin((i * Math.PI) / 4) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

/** Tam ekran efekt tuvali; uygulamada bir kez (maç ekranında) bulunur. */
export function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let parts: P[] = [];
    let raf = 0;
    let last = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const loop = (t: number) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
      last = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'lighter';
      parts = parts.filter((p) => {
        p.life += dt;
        if (p.life < 0) return true;
        if (p.life > p.max) return false;
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalCompositeOperation = p.t === 'smoke' || p.t === 'debris' || p.t === 'confetti' || p.t === 'coin' ? 'source-over' : 'lighter';
        draw(ctx, p);
        return true;
      });
      raf = parts.length ? requestAnimationFrame(loop) : 0;
      if (!raf) {
        last = 0;
        ctx.clearRect(0, 0, cv.width, cv.height);
      }
    };
    const on = (k: FxKind, x: number, y: number, s: number) => {
      if (document.documentElement.dataset.motion === 'off' || document.hidden) return;
      parts.push(...spawn(k, x, y, s));
      if (parts.length > 900) parts = parts.slice(-900);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} className="fxcanvas" aria-hidden="true" />;
}
