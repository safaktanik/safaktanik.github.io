"""Freepik oyun arayüz setini (8837930.ai) arka plansız ve metinsiz işleyip parçalara böler.
Kullanım: python cut_kit.py <ai> <çıkış klasörü>
Koordinatlar 2000 px genişlikteki önizlemeden (x1,5 → 3000 px işleme)."""
import io
import sys

import pymupdf
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
# katmanlar: 0 Texts, 1 Objects, 2 Background → yalnızca nesneler
for ui in doc.layer_ui_configs():
    doc.set_layer_ui_config(ui["number"], action=0 if ui["text"] == "Objects" else 2)
page = doc[0]
pix = page.get_pixmap(matrix=pymupdf.Matrix(4, 4), alpha=True)
full = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
full.save(f"{out}/_full.png")

# ad: (x0, y0, x1, y1) önizleme (2000×1333) koordinatı
BOX = {
    "medal-1": (150, 120, 405, 400),
    "medal-2": (420, 120, 675, 400),
    "medal-3": (690, 120, 945, 400),
    "title": (1180, 150, 1695, 305),
    "card-orange": (1090, 345, 1300, 615),
    "card-purple": (1330, 345, 1540, 615),
    "card-green": (1570, 345, 1780, 615),
    "tag-orange": (1090, 615, 1300, 685),
    "tag-purple": (1330, 615, 1540, 685),
    "tag-green": (1570, 615, 1780, 685),
    "arrow-l-small": (1005, 465, 1075, 540),
    "arrow-r-small": (1800, 465, 1870, 540),
    "loading-tab": (375, 460, 700, 525),
    "bar-striped": (140, 515, 940, 615),
    "bar-segments": (140, 700, 940, 800),
    "coin": (1035, 740, 1185, 895),
    "diamond": (1435, 745, 1600, 900),
    "gem-green": (130, 890, 240, 1025),
    "gem-purple": (550, 890, 660, 1025),
    "gem-red": (130, 1070, 240, 1205),
    "gem-blue": (550, 1070, 660, 1205),
    "plus": (415, 900, 525, 1012),
    "arrow-up": (1035, 930, 1140, 1060),
    "arrow-down": (1165, 930, 1270, 1060),
    "arrow-right": (1295, 945, 1425, 1050),
    "arrow-left": (1455, 945, 1585, 1050),
    "btn-a": (1030, 1083, 1140, 1200),
    "btn-b": (1178, 1083, 1288, 1200),
    "btn-c": (1325, 1083, 1435, 1200),
    "btn-d": (1473, 1083, 1583, 1200),
    "btn-light": (1610, 940, 1830, 1018),
}

# çakışan komşular: kırpılmış kutu içinde bile yalnızca en büyük bağlı parçayı tutmak yerine
# kutuları dar tuttuk; alfa kenar boşluğu kırpılır.
for name, (x0, y0, x1, y1) in BOX.items():
    c = full.crop((int(x0 * 1.5), int(y0 * 1.5), int(x1 * 1.5), int(y1 * 1.5)))
    bb = c.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bb:
        c = c.crop(bb)
    # oyunda en çok ~2x görüntü boyu: uzun kenar en fazla 360 px
    s = 360 / max(c.size)
    if s < 1:
        c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
    c.save(f"{out}/{name}.webp", "WEBP", quality=88, method=6)
    c.save(f"{out}/{name}.png")
    print(name, c.size)
