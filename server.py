#!/usr/bin/env python3
"""Simple HTTP server with no-cache headers for development."""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

os.chdir("/home/user/ZohreZare")
server = HTTPServer(("0.0.0.0", 3000), NoCacheHandler)
print("Server running on http://0.0.0.0:3000 with no-cache headers")
server.serve_forever()
