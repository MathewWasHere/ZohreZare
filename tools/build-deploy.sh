#!/usr/bin/env bash
# ==========================================================================
# build-deploy.sh — ساخت بسته‌ی آماده‌ی آپلود روی cPanel
#
#   اجرا:  bash tools/build-deploy.sh
#   خروجی: dist/                          (نسخه‌ی پروداکشن)
#          zohrezare-cpanel.zip           (همان پوشه، فشرده‌شده)
#
# چه کاری انجام می‌دهد:
#   ۱. فقط فایل‌های لازم سایت را در dist/ کپی می‌کند
#      (server.py، .git، ابزارها و خود zip کنار گذاشته می‌شوند)
#   ۲. اسکریپت توسعه‌ی «PWA cache reset» را از تمام صفحات HTML حذف می‌کند؛
#      این اسکریپت در حالت پروداکشن سرویس‌ورکر را غیرفعال می‌کند.
#   ۳. یک راهنمای نصب فارسی داخل بسته می‌گذارد.
#   ۴. همه‌چیز را بدون پوشه‌ی والد zip می‌کند تا در cPanel مستقیم داخل
#      public_html استخراج شود.
# ==========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
ZIP="$ROOT/zohrezare-cpanel.zip"

cd "$ROOT"

echo "==> پاک‌سازی خروجی قبلی"
rm -rf "$DIST" "$ZIP"
mkdir -p "$DIST"

echo "==> کپی فایل‌های سایت"
tar -cf - \
  --exclude='./.git' \
  --exclude='./.github' \
  --exclude='./dist' \
  --exclude='./tools' \
  --exclude='./node_modules' \
  --exclude='./server.py' \
  --exclude='./.gitignore' \
  --exclude='*.zip' \
  --exclude='.DS_Store' \
  . | (cd "$DIST" && tar -xf -)

echo "==> حذف اسکریپت توسعه‌ای PWA cache reset از صفحات HTML"
python3 - "$DIST" <<'PY'
import pathlib, re, sys

dist = pathlib.Path(sys.argv[1])
# بلوک <script> ... PWA cache reset ... </script> به‌همراه فاصله‌های بعدش
pattern = re.compile(
    r"[ \t]*<script>\s*/\*\s*PWA cache reset.*?</script>\s*",
    re.DOTALL,
)
count = 0
for html in sorted(dist.rglob("*.html")):
    text = html.read_text(encoding="utf-8")
    new, n = pattern.subn("\n", text)
    if n:
        html.write_text(new, encoding="utf-8")
        count += n
        print(f"    - {html.relative_to(dist)}")
print(f"    مجموع بلوک‌های حذف‌شده: {count}")
if count == 0:
    print("    هشدار: هیچ بلوکی پیدا نشد — الگو را بررسی کنید.", file=sys.stderr)
PY

echo "==> بررسی سلامت بسته"
python3 - "$DIST" <<'PY'
import pathlib, sys

dist = pathlib.Path(sys.argv[1])
problems = []

required = [
    "index.html", "about.html", "services.html", "service.html",
    "booking.html", "auth.html", "account.html", "404.html",
    ".htaccess", "manifest.json", "service-worker.js",
    "panel/index.html", "panel/admin/index.html",
]
for rel in required:
    if not (dist / rel).exists():
        problems.append(f"فایل ضروری غایب است: {rel}")

for html in dist.rglob("*.html"):
    text = html.read_text(encoding="utf-8")
    if "PWA cache reset" in text:
        problems.append(f"اسکریپت توسعه‌ای هنوز هست: {html.relative_to(dist)}")
    for bad in ("localhost", "127.0.0.1", ":3000", ":8080"):
        if bad in text:
            problems.append(f"آدرس محلی در {html.relative_to(dist)}: {bad}")

def strip_comments(src: str) -> str:
    """حذف کامنت‌های /* */ و // تا بررسی روی کد واقعی انجام شود."""
    out, i, n = [], 0, len(src)
    while i < n:
        if src.startswith("/*", i):
            end = src.find("*/", i + 2)
            i = n if end == -1 else end + 2
        elif src.startswith("//", i):
            end = src.find("\n", i)
            i = n if end == -1 else end
        else:
            out.append(src[i])
            i += 1
    return "".join(out)

for js in dist.rglob("*.js"):
    code = strip_comments(js.read_text(encoding="utf-8", errors="ignore"))
    for bad in ("http://localhost", "http://127.0.0.1"):
        if bad in code:
            line = next(l.strip() for l in code.splitlines() if bad in l)
            problems.append(f"آدرس محلی در {js.relative_to(dist)}: {line[:70]}")

if problems:
    print("\n!! مشکلات:")
    for p in problems:
        print("   -", p)
    sys.exit(1)
print("    همه‌چیز سالم است.")
PY

echo "==> ساخت فایل zip"
cd "$DIST"
zip -r -q -X "$ZIP" . -x '.DS_Store'
cd "$ROOT"

echo
echo "بسته آماده شد:"
echo "  $ZIP"
du -h "$ZIP" | awk '{print "  حجم: " $1}'
echo "  تعداد فایل: $(unzip -l "$ZIP" | tail -1 | awk '{print $2}')"
