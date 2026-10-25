"""Yalnızca en büyük bağlı opak parçayı tutar (kalan kırıntıları siler)."""
import sys
from collections import deque

from PIL import Image

d = sys.argv[1]
for name in sys.argv[2:]:
    im = Image.open(f"{d}/{name}.png").convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    best: list[int] = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i] or px[x, y][3] <= 20:
                continue
            comp, q = [], deque([i])
            seen[i] = 1
            while q:
                j = q.popleft()
                comp.append(j)
                cx, cy = j % w, j // w
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    k = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[k] and px[nx, ny][3] > 20:
                        seen[k] = 1
                        q.append(k)
            if len(comp) > len(best):
                best = comp
    keep = bytearray(w * h)
    for j in best:
        keep[j] = 1
    # en büyük parçaya komşu yumuşak kenar piksellerini (alfa ≤ 20) koru
    for y in range(h):
        for x in range(w):
            if keep[y * w + x]:
                continue
            a = px[x, y][3]
            near = any(0 <= x + dx < w and 0 <= y + dy < h and keep[(y + dy) * w + x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if not (a <= 20 and near):
                px[x, y] = (0, 0, 0, 0)
    im = im.crop(im.getchannel("A").getbbox())
    im.save(f"{d}/{name}.png")
    im.save(f"{d}/{name}.webp", "WEBP", quality=88, method=6)
    print(name, im.size)
