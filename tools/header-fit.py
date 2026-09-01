#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
شبیه‌ساز عرض ردیف هدر.

در این محیط هیچ موتور مرورگری در دسترس نیست، پس برای اینکه مطمئن شویم
دکمه‌های هدر روی گوشی‌های باریک از لبه بیرون نمی‌زنند، عرض هر عنصر را
از روی متریک واقعی فونت برند (IRANYekanX) و مقادیر CSS حساب می‌کنیم.

اگر «باقی‌مانده» منفی شود یعنی ردیف سرریز می‌کند و چون html/body دارای
overflow-x: hidden هستند، به‌جای اسکرول، دکمه‌ی آخر بریده می‌شود.
"""

from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = TTFont(ROOT / "assets/fonts/IRANYekanX-Medium.woff2")
UPM = FONT["head"].unitsPerEm
CMAP = FONT.getBestCmap()
HMTX = FONT["hmtx"]

LOGO_RATIO = 900 / 241  # نسبت ابعاد فایل لوگو


def text_w(s, px):
    """عرض تقریبی متن با فونت برند در اندازه‌ی دلخواه."""
    total = 0
    for ch in s:
        gid = CMAP.get(ord(ch))
        if gid:
            total += HMTX[gid][0]
    return total / UPM * px


def layout(vw):
    """مقادیر مؤثر CSS در عرض دیدگاه vw — آینه‌ی بلوک انتهای components.css."""
    c = {
        "pad": 24,          # .container padding-inline (--sp-5)
        "logo_h": 30,
        "inner_gap": 16,    # .header__inner gap (--sp-4)
        "act_gap": 8,       # .header__actions gap (--sp-2)
        "cb_pad_s": 8.8, "cb_pad_e": 13.6, "cb_gap": 8,
        "cb_icon": 30,
        "label_px": 10, "show_label": True,
        "num_px": 13, "show_num": True,
        "cta_pad": 16, "cta_px": 13,
        "burger": 44,
        "show_login": True, "login_pad": 16, "login_px": 13,
        "show_nav": True,
    }

    if vw <= 859:
        c.update(show_nav=False, cb_pad_s=6.4, cb_pad_e=11.2, cb_gap=6.4,
                 cb_icon=27, cta_pad=12, cta_px=12, login_pad=11.2,
                 login_px=12, burger=42)
    if vw <= 699:
        c.update(show_num=False, label_px=11)
    if vw <= 560:
        c.update(show_login=False, act_gap=6, logo_h=27)
    if vw <= 480:
        c.update(pad=16, logo_h=24, cb_pad_s=5.1, cb_pad_e=9.6, cb_gap=5.1,
                 cb_icon=24, label_px=10.4, inner_gap=8, act_gap=5,
                 cta_pad=9.6)
    if vw <= 380:
        c.update(logo_h=22, cb_icon=0, cb_pad_s=9.6, cb_pad_e=9.6,
                 cb_gap=0, cta_pad=8)
    if vw <= 340:
        c.update(show_label=False, cb_icon=24, cb_pad_s=6.4, cb_pad_e=6.4)
    return c


def measure(vw):
    c = layout(vw)
    content = vw - 2 * c["pad"]

    brand = c["logo_h"] * LOGO_RATIO

    # دکمه‌ی تماس
    inner = 0
    if c["cb_icon"]:
        inner += c["cb_icon"]
    text_parts = []
    if c["show_label"]:
        text_parts.append(text_w("مشاوره رایگان", c["label_px"]))
    if c["show_num"]:
        text_parts.append(text_w("۰۹۱۷ ۸۳۹ ۹۰۵۵", c["num_px"]))
    if text_parts:
        # وقتی هر دو خط هستند ستونی می‌چینند، پس عرض = بزرگ‌ترین خط
        block = max(text_parts) if len(text_parts) > 1 else text_parts[0]
        if c["cb_icon"]:
            inner += c["cb_gap"]
        inner += block
    call = c["cb_pad_s"] + inner + c["cb_pad_e"] + 2  # ۲ = خط دور

    cta = 2 * c["cta_pad"] + text_w("رزرو نوبت", c["cta_px"]) + 2

    items = [call, cta, c["burger"]]
    if c["show_login"]:
        items.append(2 * c["login_pad"] + text_w("ورود", c["login_px"]) + 2)

    actions = sum(items) + c["act_gap"] * (len(items) - 1)
    used = brand + c["inner_gap"] + actions
    return content, used, content - used, c


def main():
    widths = [320, 340, 360, 375, 390, 412, 430, 480, 540, 600, 700, 820]
    print(f"{'عرض':>5} {'فضا':>7} {'مصرف':>7} {'باقی‌مانده':>11}  وضعیت / متن دکمه‌ی تماس")
    bad = 0
    for vw in widths:
        content, used, free, c = measure(vw)
        if c["show_num"]:
            what = "مشاوره رایگان + شماره"
        elif c["show_label"]:
            what = "مشاوره رایگان" + ("" if c["cb_icon"] else " (بدون آیکون)")
        else:
            what = "فقط آیکون"
        ok = "✓" if free >= 6 else ("!" if free >= 0 else "✗")
        if free < 6:
            bad += 1
        print(f"{vw:>5} {content:>7.0f} {used:>7.0f} {free:>11.1f}  {ok} {what}")
    print()
    print("همه‌ی عرض‌ها حداقل ۶ پیکسل فضای آزاد دارند ✓" if not bad
          else f"{bad} عرض بدون حاشیه‌ی امن ✗")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
