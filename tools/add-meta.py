#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add-meta.py — افزودن متاتگ‌های اشتراک‌گذاری و سئو به صفحات سایت

اجرا: python3 tools/add-meta.py

چه چیزی اضافه می‌شود:
  • Open Graph و Twitter Card — تا وقتی لینک سایت در واتساپ، تلگرام،
    اینستاگرام یا پیامک فرستاده می‌شود، عنوان + توضیح + تصویر نمایش
    داده شود (الان فقط یک لینک خشک دیده می‌شود).
  • canonical — جلوگیری از محتوای تکراری در گوگل
  • preload فونت‌های اصلی — متن سریع‌تر ظاهر می‌شود
  • داده‌ی ساختاریافته‌ی LocalBusiness در صفحه‌ی اصلی — برای نمایش
    آدرس، تلفن و ساعت کاری در نتایج گوگل و گوگل‌مپ

اسکریپت idempotent است: اگر متاتگ‌ها از قبل باشند دوباره اضافه نمی‌شود.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://zohrezare.ir"
OG_IMAGE = f"{SITE}/assets/img/og-cover.jpg"
MARKER = "<!-- meta: اشتراک‌گذاری و سئو -->"

# صفحه: (آدرس canonical یا None، آیا og بگیرد)
PAGES = {
    "index.html":    ("/",             True),
    "about.html":    ("/about.html",   True),
    "services.html": ("/services.html", True),
    "booking.html":  ("/booking.html", True),
    # صفحه‌ی جزئیات خدمت با پارامتر ?id= کار می‌کند؛ canonical ثابت
    # باعث می‌شود گوگل همه‌ی خدمات را یک صفحه ببیند، پس canonical ندارد.
    "service.html":  (None,            True),
}

# فونت‌هایی که بیشترین کاربرد را دارند (وزن ۴۰۰ و ۵۰۰ و ۶۰۰)
PRELOAD_FONTS = [
    "IRANYekanX-Regular.woff2",
    "IRANYekanX-Medium.woff2",
]

LOCAL_BUSINESS = """<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BeautySalon",
  "name": "آکادمی تخصصی زهره زارع",
  "description": "خدمات تخصصی لب، مژه و ابرو با طراحی متناسب با فرم چهره",
  "image": "%(img)s",
  "url": "%(site)s/",
  "telephone": "+989178399055",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "مصلی، روبه‌روی تأمین اجتماعی، جنب دفتر پیشخوان حسینی",
    "addressLocality": "فسا",
    "addressRegion": "فارس",
    "addressCountry": "IR"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 28.947972,
    "longitude": 53.635556
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"],
    "description": "فقط با تعیین وقت قبلی"
  },
  "sameAs": [
    "https://www.instagram.com/zohrezaree.ir/",
    "https://t.me/Zohrezare198260"
  ]
}
</script>""" % {"img": OG_IMAGE, "site": SITE}


def extract(pattern, text, default=""):
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1).strip() if m else default


def build_block(path: Path, canonical, title, desc, font_prefix):
    lines = [MARKER]

    if canonical:
        lines.append(f'<link rel="canonical" href="{SITE}{canonical}">')

    lines += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="زهره زارع">',
        '<meta property="og:locale" content="fa_IR">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{desc}">',
    ]
    if canonical:
        lines.append(f'<meta property="og:url" content="{SITE}{canonical}">')
    lines += [
        f'<meta property="og:image" content="{OG_IMAGE}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="اجرای خدمات تخصصی ابرو در آکادمی زهره زارع">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{title}">',
        f'<meta name="twitter:description" content="{desc}">',
        f'<meta name="twitter:image" content="{OG_IMAGE}">',
    ]

    for font in PRELOAD_FONTS:
        lines.append(
            f'<link rel="preload" href="{font_prefix}assets/fonts/{font}" '
            'as="font" type="font/woff2" crossorigin>'
        )

    return "\n".join(lines)


def main():
    changed = 0
    for name, (canonical, want_og) in PAGES.items():
        path = ROOT / name
        if not path.exists():
            print(f"!! پیدا نشد: {name}")
            continue

        text = path.read_text(encoding="utf-8")
        if MARKER in text:
            print(f"·  {name} — از قبل دارد")
            continue

        title = extract(r"<title>(.*?)</title>", text)
        desc = extract(r'<meta name="description" content="(.*?)">', text)
        if not title or not desc:
            print(f"!! {name} — عنوان یا توضیح پیدا نشد، رد شد")
            continue

        block = build_block(path, canonical, title, desc, "")
        if name == "index.html":
            block += "\n" + LOCAL_BUSINESS

        # بعد از تگ description درج می‌شود
        anchor = f'<meta name="description" content="{desc}">'
        text = text.replace(anchor, anchor + "\n\n" + block, 1)
        path.write_text(text, encoding="utf-8")
        print(f"✓  {name}")
        changed += 1

    # صفحه‌ی ورود نباید در گوگل ایندکس شود
    auth = ROOT / "auth.html"
    if auth.exists():
        t = auth.read_text(encoding="utf-8")
        if 'name="robots"' not in t:
            t = t.replace("<title>", '<meta name="robots" content="noindex, follow">\n<title>', 1)
            auth.write_text(t, encoding="utf-8")
            print("✓  auth.html — noindex اضافه شد")
            changed += 1

    print(f"\n{changed} فایل تغییر کرد.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
