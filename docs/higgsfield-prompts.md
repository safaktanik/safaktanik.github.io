# Higgsfield ile oyun görselleri üretme rehberi

Oyundaki her görselin kodla çizilmiş (SVG) bir hâli zaten var. Higgsfield'da daha zengin görseller üretip
`src/arena/ui/assets.ts` içindeki **görsel yuvalarına** bağlarsan oyun otomatik olarak onları kullanır.

## 1. Hangi model?

| Ne üreteceksin | Önerilen Higgsfield modeli | Ayar |
| --- | --- | --- |
| Karakterler, mayınlar, logo (tutarlı çizgi stili) | **Nano Banana Pro** (ya da GPT Image 2) | 1:1, 2k. İlk karakteri ürettikten sonra onu *image reference* olarak ekleyip diğerlerini aynı stilde üret |
| Karakter animasyonları (sallanma, sevinme, üzülme) | **AutoSprite Animation** | Karakter görselini ver; `kind: idle` / `custom` (ör. "celebrate", "explode-hurt"), `frame_size: 256`, `remove_bg: ultra` |
| Lobi / açılış arka planı | **Soul Location** ya da Cinema Studio Image 2.5 | 9:16 (telefon) ve 16:9 (masaüstü) |

## 2. Ortak stil cümlesi (her prompt'un başına ekle)

```
Cute stylized mobile game asset, bold clean outlines, soft cel shading, vibrant nautical palette
(deep navy, teal, brass gold, coral red), centered, single subject, plain transparent background,
no text, no watermark, 1:1
```

## 3. Karakterler (yuva: `characters[0..11]`)

| No | Ad | Prompt (stil cümlesinden sonra) |
| --- | --- | --- |
| 0 | Kaptan Fok | `round-faced grey harbor seal wearing a white navy captain hat with a gold anchor badge, whiskers, friendly confident smile, head and shoulders portrait` |
| 1 | Okta | `playful purple octopus with big curious eyes, curling tentacles with pink suction cups, blushing cheeks, head and tentacles portrait` |
| 2 | Martı Mırtı | `cheeky white seagull with orange beak and red sailor neckerchief, raised eyebrow, head and chest portrait` |
| 3 | Tosun | `calm green sea turtle peeking out of a brown hexagon-patterned shell, red bandana on the head, relaxed smile` |
| 4 | Pofuduk | `round yellow pufferfish puffed up with orange spikes, pouty lips, small fins, comic expression` |
| 5 | Pıt | `small penguin with white face and orange beak wearing a red knitted beanie with a white pom-pom` |
| 6 | Kıskaç | `red-orange crab with eyes on stalks and both claws raised proudly, mischievous grin` |
| 7 | Bulut | `chubby blue whale with a water spout on top, light belly stripes, gentle smile, front view` |
| 8 | Dalga | `orange seahorse with a curled tail and a small crest, side profile, cheerful` |
| 9 | Diş | `grey shark with a dorsal fin and a big toothy but friendly grin, front view` |
| 10 | Rüzgâr | `teal manta ray gliding, wide wings, white belly, calm wise eyes, front view` |
| 11 | Dalgıç Demir | `vintage brass deep-sea diving helmet with round glass window showing a brave face inside, rivets, navy diving suit shoulders` |

İfade seti istersen aynı karakter için: `same character, laughing` / `crying with tears` / `shocked` / `wearing sunglasses, cool` / `angry` / `heart eyes`.

## 4. Mayınlar ve efektler

| Yuva | Prompt |
| --- | --- |
| `mine` | `classic naval sea mine, dark steel sphere with brass-tipped horns, rivets, equator band, top-down three-quarter view` |
| `mineLit` | `the same naval sea mine glowing red-hot and cracking, orange sparks bursting out, moment before explosion` |
| `defused` | `defused naval sea mine with horns removed, green safety ring and a green check mark badge` |
| (efekt çizgisi) | `cartoon underwater explosion sprite sheet, 8 frames in a row: white flash, orange fireball, shockwave ring, smoke and bubbles, transparent background` |

## 5. Logo (yuva: `logo`)

```
Game logo emblem for "Mine Duel": brass-rimmed circular sonar screen, glowing teal radar rings,
a cute naval sea mine floating at the center above stylized waves, premium mobile game badge, transparent background
```
(Yazıyı logoya koyma; oyun adı sayfada ayrıca yazılıyor.)

## 6. Oyuna ekleme

1. Görselleri şeffaf arka planlı PNG/WebP olarak indir (kare, en az 256×256).
2. `public/art/` klasörüne koy (ör. `public/art/char-0.png`, `public/art/mine.png`).
3. `src/arena/ui/assets.ts` dosyasını doldur:
   ```ts
   export const ASSETS: AssetSlots = {
     characters: { 0: '/art/char-0.png', 1: '/art/char-1.png' },
     logo: '/art/logo.png',
     mine: '/art/mine.png',
     mineLit: '/art/mine-lit.png',
     defused: '/art/defused.png',
   };
   ```
4. `npm run build`. Boş bırakılan yuvalar kodla çizilmiş hâliyle kalır.

Not: Görsel karakter kullanılınca mutlu/üzgün yüz ifadeleri artık çizimden gelmez; o karakterin ifadeleri için ayrı görseller (ya da AutoSprite animasyonları) gerekir.
