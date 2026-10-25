#!/usr/bin/env node
/**
 * Yayın paketi: `npm run build` çıktısını (dist/) tek dosyalık index.html'e çevirir
 * ve GitHub Pages klasörüne yazar (varsayılan: ../safaktanik.github.io/yeni).
 * Kullanım:  npm run build && node scripts/build-site.mjs [hedefKlasör] [siteAdresi]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = resolve(process.argv[2] ?? join(root, '..', 'safaktanik.github.io', 'yeni'));
const site = (process.argv[3] ?? 'https://safaktanik.github.io/yeni').replace(/\/$/, '');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Önce "npm run build" çalıştır.');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
// CSS ve JS dosyalarını sayfanın içine göm (tek dosya: her cihazda ve file:// ile çalışır)
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src.replace(/^\.?\//, '')), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
const desc = 'Okey usulü masalarda 2–4 kişilik sıra tabanlı mayın tarlası düellosu. Botlar, güçler, arkadaş odası. Ücretsiz, kurulum yok.';
const meta = `
<meta name="theme-color" content="#0d1527" />
<meta name="description" content="${desc}" />
<link rel="canonical" href="${site}/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Mine Duel 2 · Masalar, botlar, güçler" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${site}/" />
<meta property="og:image" content="${site}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="mineduel-feedback" content="none" />
<link rel="manifest" href="manifest.webmanifest" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Mine Duel 2" />
`;
html = html.replace('</head>', `${meta}</head>`).replace(/<title>[^<]*<\/title>/, '<title>Mine Duel 2 · Neon mayın tarlası düellosu</title>');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
console.log(`yazıldı: ${join(out, 'index.html')} (${Math.round(html.length / 1024)} KB)`);
