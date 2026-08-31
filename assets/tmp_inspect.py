# -*- coding: utf-8 -*-
"""Inspect + convert new portfolio photos (JPG -> webp, optimized)."""
import os
import sys
from PIL import Image

SRC = "E:/نمونه کار های اضافه"
DST = "E:/zohrezaree.ir_instagram/assets/img/portfolio"

# Mapping: Persian source filename -> english target stem
MAPPING = {
    "قبل شیدینگ لب+درمان  تیرگی و رفع دانه های فوردایس 1.jpg": "lips-03-before",
    "بعد شیدینگ لب+درمان  تیرگی و رفع دانه های فوردایس 1.jpg": "lips-03-after",
    "قبل از شیدینگ لب 2.jpg": "lips-04-before",
    "بعد از شیدینگ لب 2.jpg": "lips-04-after",
    "قبل از شیدینگ لب 3.jpg": "lips-05-before",
    "بعد از شیدینگ لب 3.jpg": "lips-05-after",
    "قبل از کاور تتو قدیمی 2.jpg": "lips-cover-old-before",
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

# Pairs that go together (before/after) — used for report
def main():
    rows = []
    for src_name, stem in MAPPING.items():
        p = os.path.join(SRC, src_name)
        if not os.path.exists(p):
            print("MISSING:", src_name)
            continue
        try:
            im = Image.open(p)
            im.load()
            w, h = im.size
            rows.append((src_name, stem, im.format, im.mode, w, h, os.path.getsize(p)))
        except Exception as e:
            print("ERROR:", src_name, e)
    print(f"{'src':<58} {'target':<22} {'fmt':<5} {'mode':<6} {'WxH':<12} {'KB':>6}")
    for src_name, stem, fmt, mode, w, h, size in rows:
        kb = size // 1024
        print(f"{src_name:<58} {stem:<22} {fmt:<5} {mode:<6} {f'{w}x{h}':<12} {kb:>6}")
    print(f"\nTotal: {len(rows)} images")

if __name__ == "__main__":
    main()
