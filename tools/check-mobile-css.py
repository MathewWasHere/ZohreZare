#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-mobile-css.py — بررسی اینکه قوانین CSS موبایل واقعاً برنده می‌شوند

چرا لازم است:
    مدیا‌کوئری به specificity اضافه نمی‌کند. اگر یک قانون پایه بعد از
    بلوک @media نوشته شود، همان برنده می‌شود و استایل موبایل بی‌اثر
    می‌ماند — دقیقاً همان اتفاقی که برای .call-btn__text افتاده بود و
    باعث می‌شد هدر در موبایل از عرض صفحه بیرون بزند.

این اسکریپت مثل مرورگر عمل می‌کند: قوانین منطبق با عرض صفحه را جمع
می‌کند، بر اساس (specificity، ترتیب) برنده را پیدا می‌کند و با مقدار
انتظاری مقایسه می‌کند.

اجرا: python3 tools/check-mobile-css.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS_FILES = ["assets/css/base.css", "assets/css/components.css", "assets/css/pages.css"]


# ----------------------------- پارس CSS -----------------------------

def strip_comments(text):
    return re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)


def parse(text, order_start=0, media=None):
    """(selector, property, value, media, order) برمی‌گرداند."""
    rules = []
    i = 0
    order = order_start
    n = len(text)
    while i < n:
        brace = text.find("{", i)
        if brace == -1:
            break
        prelude = text[i:brace].strip()

        # پیدا کردن } متناظر
        depth = 1
        j = brace + 1
        while j < n and depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        body = text[brace + 1:j - 1]

        if prelude.startswith("@media"):
            cond = prelude[len("@media"):].strip()
            inner, order = parse(body, order, cond if media is None else media + " and " + cond)
            rules.extend(inner)
        elif prelude.startswith("@"):
            pass  # @font-face / @keyframes و غیره
        else:
            for sel in prelude.split(","):
                sel = sel.strip()
                if not sel:
                    continue
                for decl in body.split(";"):
                    if ":" not in decl:
                        continue
                    prop, _, val = decl.partition(":")
                    prop, val = prop.strip(), val.strip()
                    if not prop or prop.startswith("--"):
                        continue
                    order += 1
                    rules.append((sel, prop, val, media, order))
        i = j
    return rules, order


def media_matches(cond, width):
    """آیا مدیا‌کوئری با این عرض صفحه فعال است؟"""
    if not cond:
        return True
    for part in cond.split(" and "):
        part = part.strip().strip("()")
        m = re.match(r"min-width:\s*(\d+)px", part)
        if m and width < int(m.group(1)):
            return False
        m = re.match(r"max-width:\s*(\d+)px", part)
        if m and width > int(m.group(1)):
            return False
        if "prefers-reduced-motion" in part or "hover" in part or "display-mode" in part:
            return False
    return True


# --------------------------- تطبیق سلکتور ---------------------------

def specificity(sel):
    ids = len(re.findall(r"#[\w-]+", sel))
    classes = len(re.findall(r"\.[\w-]+", sel)) + len(re.findall(r"\[[^\]]+\]", sel))
    classes += len(re.findall(r":(?!:)(?!hover|focus|active|not)[\w-]+", sel))
    tags = len(re.findall(r"(?:^|[\s>+~])([a-zA-Z][\w-]*)", sel))
    return (ids, classes, tags)


def parse_compound(part):
    tag = re.match(r"^([a-zA-Z][\w-]*)", part)
    return (tag.group(1) if tag else None), set(re.findall(r"\.([\w-]+)", part))


def matches(sel, element, ancestors):
    """
    element/ancestors: دیکشنری {'tag': 'a', 'classes': {...}}
    فقط ترکیب‌کننده‌های نزول و > پشتیبانی می‌شوند (کافی برای این سایت).
    """
    if re.search(r"::|:hover|:focus|:active|:not|\[", sel):
        return False

    parts = re.split(r"\s*(>)\s*|\s+", sel.strip())
    parts = [p for p in parts if p]
    if not parts:
        return False

    def compound_ok(part, node):
        tag, classes = parse_compound(part)
        if tag and node["tag"] != tag:
            return False
        return classes.issubset(node["classes"])

    if not compound_ok(parts[-1], element):
        return False

    chain = list(reversed(parts[:-1]))
    pool = list(reversed(ancestors))
    idx = 0
    while chain:
        part = chain.pop(0)
        if part == ">":
            parent_sel = chain.pop(0)
            if idx >= len(pool) or not compound_ok(parent_sel, pool[idx]):
                return False
            idx += 1
        else:
            found = False
            while idx < len(pool):
                if compound_ok(part, pool[idx]):
                    idx += 1
                    found = True
                    break
                idx += 1
            if not found:
                return False
    return True


def winner(rules, element, ancestors, prop, width):
    best = None
    for sel, p, val, media, order in rules:
        if p != prop:
            continue
        if not media_matches(media, width):
            continue
        if not matches(sel, element, ancestors):
            continue
        important = "!important" in val
        key = (important, specificity(sel), order)
        if best is None or key > best[0]:
            best = (key, val.replace("!important", "").strip(), sel, media)
    return best


# ------------------------------ تست‌ها ------------------------------

def el(tag, *classes):
    return {"tag": tag, "classes": set(classes)}

HEADER_CHAIN = [el("header", "header"), el("div", "container", "header__inner")]
ACTIONS = HEADER_CHAIN + [el("div", "header__actions")]

TESTS = [
    # (توضیح، عرض، عنصر، اجداد، ویژگی، مقدار انتظاری)
    ("شماره‌ی تماس در موبایل مخفی است",
     360, el("span", "call-btn__text"), ACTIONS + [el("a", "call-btn")], "display", "none"),
    ("شماره‌ی تماس در دسکتاپ دیده می‌شود",
     1280, el("span", "call-btn__text"), ACTIONS + [el("a", "call-btn")], "display", "flex"),
    ("زیرنویس لوگو در موبایل مخفی است",
     360, el("span", "brand__sub", "latin"), HEADER_CHAIN + [el("a", "brand")], "display", "none"),
    ("زیرنویس لوگو در دسکتاپ دیده می‌شود",
     1280, el("span", "brand__sub", "latin"), HEADER_CHAIN + [el("a", "brand")], "display", None),
    ("دکمه‌ی ورود در موبایل از هدر برداشته می‌شود",
     360, el("a", "btn", "btn--ghost", "btn--sm"), ACTIONS, "display", "none"),
    ("دکمه‌ی ورود در تبلت/دسکتاپ دیده می‌شود",
     1280, el("a", "btn", "btn--ghost", "btn--sm"), ACTIONS, "display", "inline-flex"),
    ("دکمه‌ی رزرو در موبایل حذف نمی‌شود",
     360, el("a", "btn", "btn--primary", "btn--sm", "header__cta"), ACTIONS, "display", "inline-flex"),
    ("همبرگر در موبایل حداقل ۴۲ پیکسل است",
     360, el("button", "burger"), ACTIONS, "width", "42px"),
    ("همبرگر در دسکتاپ مخفی است",
     1280, el("button", "burger"), ACTIONS, "display", "none"),
    ("منوی افقی در موبایل مخفی است",
     360, el("nav", "nav"), HEADER_CHAIN, "display", "none"),
    ("منوی افقی در دسکتاپ دیده می‌شود",
     1280, el("nav", "nav"), HEADER_CHAIN, "display", "block"),
    ("ارتفاع نوار هدر از متغیر نوار می‌آید (نه ارتفاع مؤثر با ناچ)",
     360, el("div", "container", "header__inner"), [el("header", "header")],
     "height", "var(--header-bar-h)"),
]


def main():
    rules = []
    order = 0
    for f in CSS_FILES:
        text = strip_comments((ROOT / f).read_text(encoding="utf-8"))
        parsed, order = parse(text, order)
        rules.extend(parsed)

    print(f"{len(rules)} قانون از {len(CSS_FILES)} فایل CSS خوانده شد\n")

    failed = 0
    for desc, width, element, ancestors, prop, expected in TESTS:
        got = winner(rules, element, ancestors, prop, width)
        value = got[1] if got else None
        ok = (value == expected)
        mark = "✓" if ok else "✗"
        print(f"{mark} [{width}px] {desc}")
        if not ok:
            print(f"     انتظار: {expected!r}   واقعی: {value!r}")
            if got:
                print(f"     برنده: «{got[2]}»  در @media {got[3]}")
            failed += 1

    print()
    if failed:
        print(f"{failed} تست شکست خورد.")
        return 1
    print("همه‌ی تست‌های چیدمان موبایل قبول شدند.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
