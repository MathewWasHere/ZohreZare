#!/usr/bin/env python3
"""
سرور توسعه — برای دیدن سایت روی همین ماشین.

چه کاری می‌کند:
  • بدون کش سرو می‌کند تا تغییر فایل‌ها فوراً دیده شوند
  • مسیرهای /api/ را ۴۰۴ می‌دهد

چرا /api/ را می‌بندد؟ چون این سرور PHP اجرا نمی‌کند. اگر درخواست‌های
/api/ را باز بگذارد، python فایل‌های .php را به‌صورت متن خام تحویل
می‌دهد — یعنی هم کد سرور بی‌دلیل نمایان می‌شود، هم سایت به‌جای «سرور
در دسترس نیست» پاسخ عجیب می‌گیرد. با ۴۰۴، همان حالتی شبیه‌سازی می‌شود
که روی هاستِ بدون API پیش می‌آید و سایت به حالت localStorage برمی‌گردد.

این فایل داخل بسته‌ی استقرار نمی‌رود (در build-deploy.sh کنار گذاشته
شده است).
"""
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _is_api(self):
        path = self.path.split("?")[0].split("#")[0]
        return path == "/api" or path.startswith("/api/")

    def _deny_api(self):
        self.send_response(404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write('{"ok":false,"message":"API در این پیش‌نمایش اجرا نمی‌شود."}'
                         .encode("utf-8"))

    def do_GET(self):
        if self._is_api():
            return self._deny_api()
        return super().do_GET()

    def do_HEAD(self):
        if self._is_api():
            return self._deny_api()
        return super().do_HEAD()

    def do_POST(self):
        if self._is_api():
            return self._deny_api()
        self.send_error(405, "Only GET/HEAD is supported by the dev server.")


os.chdir("/home/user/ZohreZare")
server = HTTPServer(("0.0.0.0", 3000), DevHandler)
print("Server running on http://0.0.0.0:3000 with no-cache headers")
server.serve_forever()
