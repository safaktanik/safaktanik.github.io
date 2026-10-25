"""Jeton / elmas / taş kesimlerinden arkadaki gri sayaç kutusu parçasını ayıklar:
düşük doygunluklu ve koyu-orta parlaklıktaki pikselleri siler, en büyük bağlı parçayı tutar."""
import colorsys
import sys
from collections import deque

from PIL import Image

d = sys.argv[1]
for name in ["coin", "diamond", "gem-green", "gem-purple", "gem-red", "gem-blue"]:
    im = Image.open(f"{d}/{name}.png").convert("RGBA")
    w, h = im.size
    px = im.load()
    keep = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            # sayaç kutusu: mavi-gri (#4b5579 / #5b6690) ve koyu lacivert (#2a2c48)
            grey = s < 0.42 and v < 0.62
            keep[y][x] = not grey
    # en büyük bağlı parça
    seen = [[False] * w for _ in range(h)]
    best = []
    for y in range(h):
        for x in range(w):
            if keep[y][x] and not seen[y][x]:
                comp, q = [], deque([(x, y)])
                seen[y][x] = True
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and keep[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for x, y in best:
        op[x, y] = px[x, y]
    # parça içindeki küçük delikleri (ör. taşın içindeki koyu gölge) geri doldur: satır bazında sol-sağ sınır arası
    rows = {}
    for x, y in best:
        lo, hi = rows.get(y, (x, x))
        rows[y] = (min(lo, x), max(hi, x))
    for y, (lo, hi) in rows.items():
        for x in range(lo, hi + 1):
            if op[x, y][3] == 0 and px[x, y][3] > 0:
                op[x, y] = px[x, y]
    bb = out.getchannel("A").getbbox()
    out = out.crop(bb)
    out.save(f"{d}/{name}.png")
    out.save(f"{d}/{name}.webp", "WEBP", quality=88, method=6)
    print(name, out.size)
