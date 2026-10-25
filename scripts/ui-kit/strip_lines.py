"""Taş/jeton kesimlerinden arkadaki kutunun ince yatay çizgilerini siler:
mavi-gri renkli (ton 205–255°, doygunluk < 0,62) ve dikey opak şeridi ≤ 10 px olan pikseller."""
import colorsys
import sys

from PIL import Image

d = sys.argv[1]
for name in ["coin", "diamond", "gem-green", "gem-purple", "gem-red", "gem-blue"]:
    im = Image.open(f"{d}/{name}.png").convert("RGBA")
    w, h = im.size
    px = im.load()
    # her pikselin içinde bulunduğu dikey opak şeridin uzunluğu
    runlen = [[0] * w for _ in range(h)]
    for x in range(w):
        y = 0
        while y < h:
            if px[x, y][3] > 20:
                y0 = y
                while y < h and px[x, y][3] > 20:
                    y += 1
                for yy in range(y0, y):
                    runlen[yy][x] = y - y0
            else:
                y += 1
    removed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= 20 or runlen[y][x] > 10:
                continue
            hh, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 205 / 360 <= hh <= 255 / 360 and s < 0.62:
                px[x, y] = (0, 0, 0, 0)
                removed += 1
    bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    im.save(f"{d}/{name}.png")
    im.save(f"{d}/{name}.webp", "WEBP", quality=88, method=6)
    print(name, removed, im.size)
