# -*- coding: utf-8 -*-
"""Convert new portfolio JPGs -> optimized webp in site portfolio folder."""
import os
from PIL import Image

SRC = "E:/نمونه کار های اضافه"
DST = "E:/zohrezaree.ir_instagram/assets/img/portfolio"

MAPPING = {
    "قبل شیدینگ لب+درمان  تیرگی و رفع دانه های فوردایس 1.jpg": "lips-03-before",
    "بعد شیدینگ لب+درمان  تیرگی و رفع دانه های فوردایس 1.jpg": "lips-03-after",
    "قبل از شیدینگ لب 2.jpg": "lips-04-before",
    "بعد از شیدینگ لب 2.jpg": "lips-04-after",
    "قبل از شیدینگ لب 3.jpg": "lips-05-before",
    "بعد از شیدینگ لب 3.jpg": "lips-05-after",
    "قبل از کاور تتو قدیمی 2.jpg": "brows-cover-old-before",
    "بعد از کاور تتو قدیمی 2.jpg": "lips-cover-old-after",
    "تینت دائمی لب قبل و بعد.jpg": "lips-tint-composite",
    "خط چشم.jpg": "eyeliner-01",
    "خط چشم.jpg 2.jpg": "eyeliner-02",
    "بن مژه 1.jpg": "lashes-band-01",
    "بن مژه 2.jpg": "lashes-band-02",
    "بن مژه 3.jpg": "lashes-band-03",
    "بن مژه 4.jpg": "lashes-band-04",
    "بن مژه 5.jpg": "lashes-band-05",
    "لیفت و لمینت مژه 1.jpg": "lashes-lift-01",
    "لیفت و لمینت مژه 2.jpg": "lashes-lift-02",
    "لیفت و لمینت مژه 3.jpg": "lashes-lift-03",
    "لیفت و لمینت مژه 4.jpg": "lashes-lift-04",
    "لیفت و لمینت ابرو.jpg": "brows-lift-01",
}

# The client did brows + lips at the same time; 'after' photo reused twice:
# lips-cover-old-after also serves as the brows cover-up 'after'.
# For brows cover-up pair: before = brows-cover-old-before, after = lips-cover-old-after
# (site displays it once as a brows pair and once as a lips pair, as the owner intended).

MAX_SIDE = 1400          # cap longest side (existing site images are ~1200-1600)
WEBP_Q = 78              # quality similar to existing assets

done = 0
for src_name, stem in MAPPING.items():
    p = os.path.join(SRC, src_name)
    if not os.path.exists(p):
        print("MISSING:", src_name)
        continue
    im = Image.open(p)
    im.load()
    # keep EXIF orientation if any, then strip metadata
    try:
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    w, h = im.size
    long_side = max(w, h)
    if long_side > MAX_SIDE:
        ratio = MAX_SIDE / long_side
        im = im.resize((round(w * ratio), round(h * ratio)), Image.LANCZOS)
    out = os.path.join(DST, stem + ".webp")
    im.convert("RGB").save(out, "WEBP", quality=WEBP_Q, method=6)
    kb = os.path.getsize(out) // 1024
    print(f"{stem:<24} {im.size[0]}x{im.size[1]}  ->  {kb} KB")
    done += 1

print(f"\nDone: {done}/{len(MAPPING)}")
