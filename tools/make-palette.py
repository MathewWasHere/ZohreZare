#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-palette.py — ساخت پالت رنگی هویت بصری برند

منبع حقیقت، خودِ کد سایت است: توکن‌ها مستقیم از :root در
assets/css/base.css خوانده می‌شوند، پس پالت هیچ‌وقت با سایت
ناهماهنگ نمی‌شود.

خروجی‌ها در پوشه‌ی docs/:
    palette.html   صفحه‌ی کامل پالت (فارسی، با فونت خود برند)
    palette.json   برای استفاده در ابزارهای طراحی و کد
    palette.png    تصویر قابل اشتراک‌گذاری

اجرا: python3 tools/make-palette.py
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


# --------------------------- خواندن توکن‌ها ---------------------------

def read_tokens():
    text = (ROOT / "assets" / "css" / "base.css").read_text(encoding="utf-8")
    root = text.split(":root {", 1)[1].split("\n}", 1)[0]
    root = re.sub(r"/\*.*?\*/", "", root, flags=re.DOTALL)
    tokens = {}
    for m in re.finditer(r"(--[\w-]+):\s*([^;]+);", root):
        tokens[m.group(1)] = m.group(2).strip()
    return tokens


def resolve(value, tokens, depth=0):
    """var(--x) را تا رسیدن به مقدار واقعی باز می‌کند."""
    if depth > 6:
        return value
    m = re.fullmatch(r"var\((--[\w-]+)\)", value.strip())
    if m:
        return resolve(tokens.get(m.group(1), value), tokens, depth + 1)
    return value.strip()


# ------------------------------ رنگ‌ها ------------------------------

def to_rgb(c):
    c = c.strip()
    m = re.fullmatch(r"#([0-9A-Fa-f]{6})", c)
    if m:
        h = m.group(1)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.fullmatch(r"#([0-9A-Fa-f]{3})", c)
    if m:
        h = m.group(1)
        return tuple(int(ch * 2, 16) for ch in h)
    m = re.match(r"rgba?\(([^)]+)\)", c)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        return tuple(int(float(p)) for p in parts[:3])
    return None


def alpha_of(c):
    m = re.match(r"rgba\(([^)]+)\)", c.strip())
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        if len(parts) == 4:
            return float(parts[3])
    return 1.0


def to_hsl(rgb):
    r, g, b = [v / 255 for v in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return (0, 0, round(l * 100))
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (round(h * 60) % 360, round(s * 100), round(l * 100))


def luminance(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = [ch(v) for v in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(to_rgb(a)), luminance(to_rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def grade(ratio, large=False):
    if large:
        if ratio >= 4.5: return "AAA"
        if ratio >= 3.0: return "AA"
    else:
        if ratio >= 7.0: return "AAA"
        if ratio >= 4.5: return "AA"
        if ratio >= 3.0: return "AA بزرگ"
    return "ناکافی"


# ------------------------------ ساختار ------------------------------

GROUPS = [
    ("رزگلد — رنگ اصلی برند",
     "قلب هویت بصری. دکمه‌های اصلی، لینک‌ها، تیترهای تاکیدی و آیکون‌ها.",
     ["--rose-400", "--rose-500", "--rose-600", "--rose-700"]),
    ("طلایی — رنگ مکمل",
     "لهجه‌ی لوکس؛ جزئیات ظریف مثل خطوط تزیینی و متن روی زمینه‌ی تیره.",
     ["--gold-300", "--gold-500"]),
    ("صورتی ملایم — پس‌زمینه‌های تاکیدی",
     "زمینه‌ی بخش‌های برجسته، برچسب‌ها و حالت hover.",
     ["--blush-100", "--blush-200", "--blush-300"]),
    ("کرم — سطوح و پس‌زمینه",
     "بوم اصلی سایت. تقریباً خنثی تا رزگلد روی آن بدرخشد.",
     ["--bg-elevated", "--cream-50", "--cream-100", "--cream-200", "--cream-300"]),
    ("قهوه‌ای تیره — متن و کنتراست",
     "به‌جای مشکی خالص؛ گرم‌تر و هماهنگ با رزگلد.",
     ["--ink-900", "--ink-800", "--ink-700", "--ink-500",
      "--ink-400", "--ink-300", "--ink-200"]),
    ("رنگ‌های وضعیت",
     "فقط برای پیام‌های سیستمی — موفقیت، خطا و هشدار.",
     ["--success-500", "--success-50", "--danger-500", "--danger-50",
      "--warn-600", "--warn-50"]),
]

ROLES = [
    ("--bg", "پس‌زمینه‌ی اصلی صفحه"),
    ("--bg-soft", "پس‌زمینه‌ی بخش‌های یک‌درمیان"),
    ("--bg-elevated", "کارت‌ها و سطوح بالاتر"),
    ("--text", "متن اصلی"),
    ("--text-soft", "متن ملایم"),
    ("--text-muted", "متن کم‌اهمیت و توضیحات"),
    ("--line", "خطوط و حاشیه‌ها"),
    ("--line-strong", "حاشیه‌های پررنگ‌تر"),
    ("--accent", "رنگ تاکید (دکمه‌ها و لینک‌ها)"),
    ("--accent-soft", "زمینه‌ی ملایم تاکید"),
]

CONTRASTS = [
    ("--text", "--bg", "متن اصلی روی پس‌زمینه", False),
    ("--text-soft", "--bg", "متن ملایم روی پس‌زمینه", False),
    ("--text-muted", "--bg", "متن کم‌اهمیت روی پس‌زمینه", False),
    ("--rose-500", "--bg-elevated", "لینک/تاکید روی سفید", False),
    ("--rose-600", "--bg-elevated", "رزگلد تیره روی سفید", False),
    ("--bg-elevated", "--rose-500", "متن سفید روی دکمه‌ی اصلی", False),
    ("--bg-elevated", "--rose-400", "متن سفید روی رزگلد روشن", False),
    ("--cream-50", "--ink-900", "متن روشن روی زمینه‌ی تیره (فوتر)", False),
    ("--gold-300", "--ink-900", "طلایی روی زمینه‌ی تیره", False),
    ("--gold-500", "--bg-elevated", "طلایی تیره روی سفید", False),
    ("--success-500", "--success-50", "پیام موفقیت", False),
    ("--danger-500", "--danger-50", "پیام خطا", False),
    ("--warn-600", "--warn-50", "پیام هشدار", False),
]

# تن‌های استخراج‌شده از عکس‌های خود برند (نمونه‌برداری با ImageMagick)
PHOTO_TONES = ["#463D34", "#9F6758", "#A58A70", "#A27E83", "#A4A0A2", "#E0A5A5"]


def build_data():
    tokens = read_tokens()
    resolved = {k: resolve(v, tokens) for k, v in tokens.items()}

    def entry(name):
        raw = resolved.get(name, "")
        rgb = to_rgb(raw)
        if rgb is None:
            return None
        return {
            "token": name,
            "value": raw,
            "hex": "#%02X%02X%02X" % rgb,
            "rgb": f"rgb({rgb[0]}, {rgb[1]}, {rgb[2]})",
            "hsl": "hsl(%d, %d%%, %d%%)" % to_hsl(rgb),
            "alpha": alpha_of(raw),
        }

    groups = []
    for title, desc, names in GROUPS:
        items = [e for e in (entry(n) for n in names) if e]
        groups.append({"title": title, "desc": desc, "colors": items})

    roles = []
    for name, desc in ROLES:
        e = entry(name)
        if e:
            e = dict(e, role=desc, maps_to=tokens.get(name, ""))
            roles.append(e)

    checks = []
    for fg, bg, label, large in CONTRASTS:
        f, b = resolved.get(fg), resolved.get(bg)
        if not f or not b:
            continue
        ratio = contrast(f, b)
        checks.append({
            "label": label, "fg": f, "bg": b,
            "fg_token": fg, "bg_token": bg,
            "ratio": ratio, "grade": grade(ratio, large),
        })

    return {"groups": groups, "roles": roles, "contrast": checks,
            "photo_tones": PHOTO_TONES}


# ------------------------------ خروجی‌ها ------------------------------

def swatch_html(c, dark_text=False):
    text_color = "#15100E" if dark_text else "#FFFCFA"
    return f"""
      <article class="sw">
        <div class="sw__chip" style="background:{c['value']};color:{text_color}">
          <span class="sw__hex">{c['hex']}</span>
        </div>
        <div class="sw__meta">
          <code class="sw__token">{c['token']}</code>
          <span class="sw__line">{c['rgb']}</span>
          <span class="sw__line">{c['hsl']}</span>
        </div>
      </article>"""


def build_html(data):
    parts = []
    for g in data["groups"]:
        chips = []
        for c in g["colors"]:
            rgb = to_rgb(c["value"])
            dark_text = luminance(rgb) > 0.45
            chips.append(swatch_html(c, dark_text))
        parts.append(f"""
    <section class="group">
      <h2>{g['title']}</h2>
      <p class="group__desc">{g['desc']}</p>
      <div class="grid">{''.join(chips)}</div>
    </section>""")

    role_rows = "".join(
        f"""
        <tr>
          <td><span class="dot" style="background:{r['value']}"></span><code>{r['token']}</code></td>
          <td class="muted">{r['maps_to']}</td>
          <td><code>{r['hex']}</code></td>
          <td>{r['role']}</td>
        </tr>""" for r in data["roles"])

    contrast_rows = "".join(
        f"""
        <tr>
          <td><span class="pair" style="background:{c['bg']};color:{c['fg']}">نمونه متن</span></td>
          <td>{c['label']}</td>
          <td><strong>{c['ratio']}</strong></td>
          <td><span class="badge badge--{'ok' if c['grade'].startswith(('AA','AAA')) else 'bad'}">{c['grade']}</span></td>
        </tr>""" for c in data["contrast"])

    tones = "".join(
        f'<div class="tone" style="background:{t}"><span>{t}</span></div>'
        for t in data["photo_tones"])

    return f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>پالت رنگی برند | زهره زارع</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="../assets/css/fonts.css">
<style>
  :root {{
    --bg: #FFFCFA; --soft: #FAF4EF; --line: rgba(21,16,14,.14);
    --ink: #15100E; --muted: #6B564C; --rose: #A55C44; --gold: #A9803F;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 48px 24px 80px; background: var(--bg); color: var(--ink);
    font-family: 'IRANYekanX', Tahoma, system-ui, sans-serif; line-height: 1.9;
  }}
  .wrap {{ max-width: 1100px; margin-inline: auto; }}
  header.head {{ text-align: center; margin-bottom: 56px; }}
  .eyebrow {{
    display: inline-block; font-size: 12px; letter-spacing: .28em;
    color: var(--rose); margin-bottom: 10px;
  }}
  h1 {{ font-size: 34px; margin: 0 0 10px; }}
  .head p {{ color: var(--muted); margin: 0; font-size: 15px; }}
  h2 {{ font-size: 20px; margin: 0 0 4px; }}
  .group {{ margin-bottom: 46px; }}
  .group__desc {{ color: var(--muted); font-size: 14px; margin: 0 0 18px; }}
  .grid {{ display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }}
  .sw {{
    border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
    background: #fff;
  }}
  .sw__chip {{
    height: 104px; display: flex; align-items: flex-end; padding: 10px 12px;
  }}
  .sw__hex {{ font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; letter-spacing: .04em; }}
  .sw__meta {{ padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 2px; }}
  .sw__token {{ font-size: 13px; color: var(--ink); font-family: ui-monospace, monospace; }}
  .sw__line {{ font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; direction: ltr; text-align: right; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  th, td {{ text-align: right; padding: 10px 12px; border-bottom: 1px solid var(--line); }}
  th {{ color: var(--muted); font-weight: 500; font-size: 13px; }}
  code {{ font-family: ui-monospace, monospace; font-size: 12.5px; }}
  .muted {{ color: var(--muted); }}
  .dot {{
    display: inline-block; width: 14px; height: 14px; border-radius: 50%;
    border: 1px solid var(--line); margin-left: 8px; vertical-align: -2px;
  }}
  .pair {{
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    font-size: 13px; border: 1px solid var(--line);
  }}
  .badge {{ padding: 2px 10px; border-radius: 999px; font-size: 12px; }}
  .badge--ok {{ background: #E9F2EA; color: #4C7A53; }}
  .badge--bad {{ background: #FBE9E6; color: #A8443A; }}
  .tones {{ display: flex; flex-wrap: wrap; gap: 10px; }}
  .tone {{
    width: 120px; height: 76px; border-radius: 14px; display: flex;
    align-items: flex-end; padding: 8px; border: 1px solid var(--line);
  }}
  .tone span {{
    font-family: ui-monospace, monospace; font-size: 11px; color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,.5);
  }}
  .note {{
    background: var(--soft); border: 1px solid var(--line); border-radius: 16px;
    padding: 18px 20px; font-size: 14px; color: var(--muted); margin-top: 12px;
  }}
  .note strong {{ color: var(--ink); }}
  @media print {{ body {{ padding: 0; }} .sw {{ break-inside: avoid; }} }}
</style>
</head>
<body>
<div class="wrap">

  <header class="head">
    <span class="eyebrow">ZOHRE ZARE — BRAND COLORS</span>
    <h1>پالت رنگی هویت بصری</h1>
    <p>آکادمی تخصصی لب، مژه و ابرو — استخراج‌شده از توکن‌های واقعی سایت</p>
  </header>
{''.join(parts)}

  <section class="group">
    <h2>نقش‌های معنایی</h2>
    <p class="group__desc">
      در کد سایت به‌جای رنگ خام، از این نقش‌ها استفاده می‌شود. برای تغییر
      تم کافی است همین‌ها عوض شوند.
    </p>
    <table>
      <thead><tr><th>نقش</th><th>اشاره به</th><th>مقدار</th><th>کاربرد</th></tr></thead>
      <tbody>{role_rows}</tbody>
    </table>
  </section>

  <section class="group">
    <h2>کنتراست و خوانایی</h2>
    <p class="group__desc">
      نسبت کنتراست بر اساس استاندارد WCAG 2.1. برای متن معمولی حداقل ۴.۵
      لازم است (سطح AA) و برای متن درشت ۳.
    </p>
    <table>
      <thead><tr><th>نمونه</th><th>ترکیب</th><th>نسبت</th><th>سطح</th></tr></thead>
      <tbody>{contrast_rows}</tbody>
    </table>
  </section>

  <section class="group">
    <h2>تن‌های عکاسی برند</h2>
    <p class="group__desc">
      رنگ‌های غالب عکس‌های واقعی سالن. برای انتخاب عکس‌های جدید، نزدیک
      ماندن به این محدوده باعث می‌شود تصاویر با پالت سایت یکدست بمانند.
    </p>
    <div class="tones">{tones}</div>
  </section>

  <div class="note">
    <strong>یادداشت:</strong> این صفحه به‌صورت خودکار از
    <code>assets/css/base.css</code> ساخته می‌شود
    (<code>python3 tools/make-palette.py</code>)، پس همیشه با رنگ‌های
    واقعی سایت هماهنگ است. این پوشه جزو بسته‌ی آپلود روی هاست نیست.
  </div>

</div>
</body>
</html>
"""


def brand_ttf():
    """
    ImageMagick فونت woff2 نمی‌خواند و در این محیط فونت پیش‌فرضی هم
    ندارد؛ پس همان فونت خود برند را موقتاً به ttf تبدیل می‌کنیم تا
    تصویر با تایپوگرافی درست ساخته شود.
    """
    from fontTools.ttLib import TTFont as _TTF
    out = Path(tempfile.gettempdir()) / "zz-palette-font.ttf"
    if not out.exists():
        f = _TTF(ROOT / "assets" / "fonts" / "IRANYekanX-Medium.woff2")
        f.flavor = None
        f.save(out)
    return str(out)


def build_png(data):
    """تصویر قابل اشتراک‌گذاری — فقط برچسب لاتین تا متن فارسی خراب نشود."""
    cols = []
    for g in data["groups"]:
        for c in g["colors"]:
            cols.append((c["token"].replace("--", ""), c["hex"]))

    font = brand_ttf()
    per_row = 6
    cw, ch = 200, 150
    rows = (len(cols) + per_row - 1) // per_row
    width = per_row * cw
    height = rows * ch + 130

    cmd = ["convert", "-size", f"{width}x{height}", "xc:#FFFCFA", "-font", font]
    cmd += ["-fill", "#15100E", "-pointsize", "34", "-gravity", "north",
            "-annotate", "+0+34", "ZOHRE ZARE  |  Brand Colors"]
    cmd += ["-fill", "#A55C44", "-pointsize", "17", "-gravity", "north",
            "-annotate", "+0+82", "LIP & LASH & BROW"]

    for i, (name, hexv) in enumerate(cols):
        x = (i % per_row) * cw
        y = (i // per_row) * ch + 118
        rgb = to_rgb(hexv)
        light = luminance(rgb) > 0.45
        label = "#15100E" if light else "#FFFCFA"
        # رنگ‌های خیلی روشن روی پس‌زمینه‌ی کرم گم می‌شوند؛ خط دور نازک
        # مرزشان را مشخص می‌کند
        cmd += ["-stroke", "rgba(21,16,14,0.16)" if light else "none",
                "-strokewidth", "1"]
        cmd += ["-fill", hexv, "-draw",
                f"roundrectangle {x+10},{y+8} {x+cw-10},{y+ch-14} 14,14"]
        cmd += ["-stroke", "none"]
        cmd += ["-fill", label, "-pointsize", "15", "-gravity", "northwest",
                "-annotate", f"+{x+24}+{y+ch-62}", name]
        cmd += ["-fill", label, "-pointsize", "17", "-gravity", "northwest",
                "-annotate", f"+{x+24}+{y+ch-42}", hexv]

    out = DOCS / "palette.png"
    cmd.append(str(out))
    subprocess.run(cmd, check=True)
    return out


def main():
    DOCS.mkdir(exist_ok=True)
    data = build_data()

    (DOCS / "palette.html").write_text(build_html(data), encoding="utf-8")
    (DOCS / "palette.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    png = build_png(data)

    total = sum(len(g["colors"]) for g in data["groups"])
    print(f"✓ docs/palette.html  ({total} رنگ در {len(data['groups'])} گروه)")
    print("✓ docs/palette.json")
    print(f"✓ {png.relative_to(ROOT)}  ({png.stat().st_size/1024:.0f}KB)")

    bad = [c for c in data["contrast"] if c["grade"] == "ناکافی"]
    if bad:
        print("\nهشدار کنتراست (زیر استاندارد WCAG AA):")
        for c in bad:
            print(f"   - {c['label']}: {c['ratio']}  "
                  f"({c['fg_token']} روی {c['bg_token']})")


if __name__ == "__main__":
    main()
