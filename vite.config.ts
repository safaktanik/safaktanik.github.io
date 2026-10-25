import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Geliştirmede masa sistemi (HTTP /api ve WebSocket /arena) 8787'deki oyun sunucusuna yönlendirilir;
// böylece arayüz ve sunucu aynı adres gibi çalışır (CORS gerekmez).
const target = process.env.ARENA_SERVER ?? 'http://127.0.0.1:8787';

export default defineConfig({
  // Göreli yollar: site kökte de alt klasörde de çalışsın.
  base: './',
  plugins: [react()],
  // Site tek dosya (scripts/build-site.mjs yalnızca index.html'i yayınlar): arayüz seti görselleri
  // (en büyüğü ~8 KB) ayrı dosya olarak çıkarsa yayında kırık görünür; hepsi data: adresi olarak gömülsün.
  build: { assetsInlineLimit: 64 * 1024 },
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/arena': { target: target.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    environment: 'node',
    testTimeout: 30_000,
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
