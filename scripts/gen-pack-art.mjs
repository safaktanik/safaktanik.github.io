// SVG varlık paketini (assets/mine-duel-pack) kod içine gömülü veri adreslerine çevirir → src/arena/ui/packArt.ts
// Böylece tek dosyalık sürüm, claude.ai sayfası ve Vite derlemesi aynı görselleri ek dosya olmadan kullanır.
// Kullanım: node scripts/gen-pack-art.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../assets/mine-duel-pack/', import.meta.url).pathname;
const skip = new Set(['08_ui']);
const out = {};
for (const dir of readdirSync(root).sort()) {
  if (skip.has(dir) || !/^\d\d_/.test(dir)) continue;
  for (const f of readdirSync(join(root, dir)).sort()) {
    if (!f.endsWith('.svg')) continue;
    const svg = readFileSync(join(root, dir, f), 'utf8')
      .replace(/<\?xml[^>]*>/, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '') // güvenlik: betik taşımaz
      .replace(/\s+on\w+="[^"]*"/gi, '')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const key = f.replace(/\.svg$/, '');
    out[key] = 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, "'");
  }
}
const body = Object.entries(out)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');
writeFileSync(
  new URL('../src/arena/ui/packArt.ts', import.meta.url),
  `/* Otomatik üretildi: node scripts/gen-pack-art.mjs — elle düzenlemeyin. Kaynak: assets/mine-duel-pack */\nexport const PACK = {\n${body}\n} as const;\nexport type PackKey = keyof typeof PACK;\n`,
);
console.log(Object.keys(out).length, 'görsel');
