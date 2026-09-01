#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
optimize-images.py — بهینه‌سازی تصاویر سایت با حفظ کیفیت دیداری

اجرا:  python3 tools/optimize-images.py            (اعمال تغییرات)
       python3 tools/optimize-images.py --dry-run  (فقط گزارش)

منطق کار:
  برای هر تصویر یک نسخه‌ی بهینه ساخته می‌شود (در صورت نیاز کوچک‌سازی +
  فشرده‌سازی مجدد). نسخه‌ی جدید فقط وقتی جایگزین می‌شود که هر دو شرط
  برقرار باشد:

      ۱. حداقل ۱۰٪ حجم کم کند
      ۲. کیفیت دیداری حفظ شود (PSNR ≥ ۳۸ دسی‌بل نسبت به اصل)

  PSNR بالای ۳۸ یعنی تفاوت با چشم غیرقابل تشخیص است. اگر شرطی برقرار
  نباشد فایل اصلی دست‌نخورده می‌ماند. به همین دلیل اجرای دوباره‌ی این
  اسکریپت باعث افت کیفیت تدریجی نمی‌شود (چون بار دوم صرفه‌جویی < ۱۰٪
  می‌شود و رد می‌شود).
"""

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"

DRY_RUN = "--dry-run" in sys.argv

MIN_SAVING = 0.10   # حداقل ۱۰٪ صرفه‌جویی
MIN_PSNR = 38.0     # حداقل کیفیت قابل قبول

# تصاویری که نباید دست بخورند
SKIP = {
    "favicon.svg",
    "logo.png",          # آیکون PWA در manifest — باید PNG بماند
    "logo-header.png",   # کوچک است و شفافیت دارد
}


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def psnr(a: Path, b: Path) -> float:
    """کیفیت نسخه‌ی جدید در مقایسه با اصل (دسی‌بل)."""
    res = run(["compare", "-metric", "PSNR", str(a), str(b), "null:"])
    out = (res.stderr or res.stdout).strip().split()[0]
    try:
        return float(out)
    except ValueError:
        return float("inf") if out.startswith("inf") else 0.0


def dims(p: Path):
    res = run(["identify", "-format", "%w %h", str(p)])
    w, h = res.stdout.split()
    return int(w), int(h)


def build_candidate(src: Path, dst: Path, max_edge: int, quality: int):
    cmd = ["convert", str(src), "-strip", "-auto-orient"]
    w, h = dims(src)
    resized = max(w, h) > max_edge
    if resized:
        cmd += ["-filter", "Lanczos", "-resize", f"{max_edge}x{max_edge}>"]
    if dst.suffix == ".webp":
        cmd += ["-quality", str(quality), "-define", "webp:method=6"]
    else:
        cmd += ["-quality", str(quality), "-interlace", "Plane",
                "-sampling-factor", "4:2:0"]
    cmd.append(str(dst))
    return run(cmd), resized


def build_reference(src: Path, dst: Path, max_edge: int):
    """
    مرجع مقایسه: همان تصویر با همان کوچک‌سازی ولی بدون فشرده‌سازی با اتلاف.

    کوچک‌سازی یک تصمیم عمدی است و نباید به‌عنوان «افت کیفیت» شمرده شود؛
    چیزی که باید سنجیده شود فقط افت ناشی از فشرده‌سازی است. بدون این کار
    PSNR برای هر تصویر کوچک‌شده بی‌معنا (حدود ۱۲ دسی‌بل) گزارش می‌شد.
    """
    return run(["convert", str(src), "-strip", "-auto-orient",
                "-filter", "Lanczos", "-resize", f"{max_edge}x{max_edge}>",
                str(dst)])


def process(src: Path, max_edge: int, quality: int, new_suffix=None):
    """یک تصویر را بهینه می‌کند. خروجی: (وضعیت، بایت قبل، بایت بعد)"""
    if src.name in SKIP or not src.exists():
        return "skip", 0, 0

    before = src.stat().st_size
    suffix = new_suffix or src.suffix
    with tempfile.TemporaryDirectory() as td:
        cand = Path(td) / (src.stem + suffix)
        res, resized = build_candidate(src, cand, max_edge, quality)
        if res.returncode != 0 or not cand.exists():
            return f"خطا: {res.stderr.strip()[:60]}", before, before

        after = cand.stat().st_size
        saving = 1 - after / before

        ref = src
        if resized:
            ref = Path(td) / (src.stem + "-ref.png")
            build_reference(src, ref, max_edge)
        q = psnr(ref, cand)

        target = src if new_suffix is None else src.with_suffix(new_suffix)
        note = " (کوچک‌سازی‌شده)" if resized else ""

        if saving < MIN_SAVING:
            return f"رد شد (صرفه‌جویی فقط {saving:.0%})", before, before
        if q < MIN_PSNR:
            return f"رد شد (افت کیفیت PSNR={q:.1f})", before, before

        if not DRY_RUN:
            target.write_bytes(cand.read_bytes())
        return f"ok PSNR={q:.1f}{note}", before, after


def human(n):
    return f"{n/1024/1024:.2f}MB" if n >= 1024 * 1024 else f"{n/1024:.0f}KB"


def main():
    if DRY_RUN:
        print(">>> حالت آزمایشی — هیچ فایلی تغییر نمی‌کند\n")

    total_before = total_after = 0
    jobs = []

    # ۱) گالری نمونه‌کارها: بندانگشتی مربعی در گرید نمایش داده می‌شود،
    #    پس ۱۲۰۰ پیکسل حتی برای صفحه‌های رتینا هم کافی است.
    jobs += [(p, 1200, 82, None) for p in sorted((IMG / "portfolio").glob("*.webp"))]

    # ۲) تصاویر عمومی JPEG
    jobs += [(p, 1600, 84, None) for p in sorted(IMG.glob("*.jpg"))]

    # ۳) PNG های عکس‌محور → WebP (بیشترین صرفه‌جویی؛ شفافیت حفظ می‌شود)
    jobs += [(p, 1400, 84, ".webp") for p in sorted(IMG.glob("*.png"))]

    for src, max_edge, quality, new_suffix in jobs:
        status, before, after = process(src, max_edge, quality, new_suffix)
        if status == "skip":
            continue
        total_before += before
        total_after += after
        mark = "✓" if status.startswith("ok") else "·"
        rel = src.relative_to(ROOT)
        if status.startswith("ok"):
            print(f"{mark} {rel}  {human(before)} → {human(after)}  ({status})")
        else:
            print(f"{mark} {rel}  {human(before)}  {status}")

    print("\n" + "=" * 62)
    print(f"مجموع: {human(total_before)} → {human(total_after)}"
          f"   (صرفه‌جویی {human(total_before - total_after)}"
          f" ≈ {(1 - total_after / total_before):.0%})")


if __name__ == "__main__":
    main()
