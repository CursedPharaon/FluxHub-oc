#!/usr/bin/env python3
"""
FluxHub — JSONBin.io proxy server
BIN ID: 6a90a8efda38895dfe19be69
Проксирует запросы фронтенда к JSONBin, чтобы API KEY не торчал в браузере.

Endpoints:
  GET  /api/db        -> GET https://api.jsonbin.io/v3/b/<BIN>/latest
  GET  /api/db/latest -> alias
  PUT  /api/db        -> PUT https://api.jsonbin.io/v3/b/<BIN>
  GET  /api/health    -> healthcheck
  /*                 -> static files (index.html, css/, js/)

Запуск:
  python server.py              # :8000
  python server.py --port 3000
  python server.py --host 0.0.0.0 --port 8000

Деплой: любой хостинг с Python (Render, Railway, VPS, etc.)
"""
import http.server
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse, parse_qs

# ===== CONFIG — реальный BIN и KEY (не показывать в клиенте!) =====
BIN_ID = "6a90a8efda38895dfe19be69"
API_KEY = "$2a$10$LWOYmBp7ytOchSh0Nv0oY.WqaUwwSiPWlvSWB12sBmXmAVlt9..ly"
JSONBIN_URL = f"https://api.jsonbin.io/v3/b/{BIN_ID}"
JSONBIN_LATEST = f"{JSONBIN_URL}/latest"

DEFAULT_DATA = {
    "users": [
        {
            "id": "u_super",
            "username": "cursed_dev",
            "email": "cursed@fluxhub.dev",
            "password": "12345678",
            "avatar": "https://i.pravatar.cc/200?u=cursed_dev",
            "role": "superadmin",
            "bannedUntil": None,
            "createdAt": 0,
            "bio": "Founder & Super Admin of FluxHub 👑"
        }
    ],
    "games": []
}

class FluxHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")
        sys.stdout.flush()

    def end_headers(self):
        # CORS
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Master-Key, X-Bin-Meta, X-Access-Key")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/api/db", "/api/db/latest", "/api/bins/" + BIN_ID):
            self.proxy_get_jsonbin()
            return
        if path == "/api/health":
            self.send_json({"status": "ok", "bin": BIN_ID, "service": "FluxHub JSONBin proxy"})
            return
        if path == "/api/config":
            # отдаём клиенту только безопасные поля (без ключа!)
            self.send_json({"binId": BIN_ID, "apiBase": "/api", "superadmin": "cursed_dev"})
            return
        # static files
        return super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/api/db", "/api/db/latest"):
            self.proxy_put_jsonbin()
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        # поддержка POST как PUT для совместимости
        parsed = urlparse(self.path)
        if parsed.path in ("/api/db", "/api/db/latest"):
            self.proxy_put_jsonbin()
            return
        self.send_error(404, "Not Found")

    # ---- proxy helpers ----
    def proxy_get_jsonbin(self):
        try:
            req = urllib.request.Request(
                JSONBIN_LATEST,
                headers={
                    "X-Master-Key": API_KEY,
                    "X-Bin-Meta": "false",
                    "Content-Type": "application/json",
                },
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read()
                data = json.loads(body.decode("utf-8"))
                # jsonbin может вернуть {record: {...}} или сам {...}
                record = data.get("record", data) if isinstance(data, dict) else data
                # ensure superadmin exist
                self.ensure_superadmin(record)
                # если record пустой/кривой — вернём как есть
                self.send_json(record)
                print(f"[proxy GET] OK {len(body)} bytes")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore") if e.fp else str(e)
            print(f"[proxy GET] HTTPError {e.code}: {body[:500]}")
            # 404 = bin пустой, отдадим DEFAULT_DATA и попробуем создать
            if e.code == 404:
                self.ensure_superadmin(DEFAULT_DATA)
                self.send_json(DEFAULT_DATA)
            else:
                self.send_response(e.code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": body}, ensure_ascii=False).encode())
        except Exception as e:
            print(f"[proxy GET] error: {e}")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}, ensure_ascii=False).encode())

    def proxy_put_jsonbin(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except:
            payload = {}
        # ensure superadmin before save
        if isinstance(payload, dict):
            self.ensure_superadmin(payload)

        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            req = urllib.request.Request(
                JSONBIN_URL,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Master-Key": API_KEY,
                    "X-Bin-Meta": "false",
                },
                method="PUT",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_body = resp.read()
                self.send_response(resp.status if hasattr(resp, 'status') else 200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                # возвращаем ответ от jsonbin или наш payload
                try:
                    j = json.loads(resp_body.decode("utf-8"))
                    self.wfile.write(json.dumps(j, ensure_ascii=False).encode())
                except:
                    self.wfile.write(resp_body)
                print(f"[proxy PUT] OK saved {len(body)} bytes")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore") if e.fp else str(e)
            print(f"[proxy PUT] HTTPError {e.code}: {err_body[:500]}")
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": err_body}, ensure_ascii=False).encode())
        except Exception as e:
            print(f"[proxy PUT] error: {e}")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}, ensure_ascii=False).encode())

    def ensure_superadmin(self, record):
        """Гарантирует что cursed_dev супер-админ и не забанен"""
        if not isinstance(record, dict):
            return
        users = record.get("users")
        if not isinstance(users, list):
            record["users"] = users = []
        u = next((x for x in users if x.get("username") == "cursed_dev"), None)
        if not u:
            import time
            new_u = dict(DEFAULT_DATA["users"][0])
            new_u["createdAt"] = int(time.time() * 1000)
            users.insert(0, new_u)
            print("[ensure] created superadmin cursed_dev")
        else:
            # форсируем роль и разбан
            if u.get("role") != "superadmin":
                u["role"] = "superadmin"
            if u.get("bannedUntil") is not None:
                u["bannedUntil"] = None
            if not u.get("password"):
                u["password"] = "12345678"
            if not u.get("email"):
                u["email"] = "cursed@fluxhub.dev"

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run():
    import argparse
    parser = argparse.ArgumentParser(description="FluxHub JSONBin proxy")
    parser.add_argument("--host", default="0.0.0.0", help="host")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="port")
    parser.add_argument("--dir", default=".", help="static dir")
    args = parser.parse_args()

    os.chdir(args.dir)
    addr = (args.host, args.port)
    httpd = http.server.ThreadingHTTPServer(addr, FluxHandler)
    print(f"🚀 FluxHub server running at http://{args.host}:{args.port}/")
    print(f"   BIN ID: {BIN_ID}")
    print(f"   Proxy:  /api/db  -> {JSONBIN_URL}")
    print(f"   Health: /api/health")
    print(f"   Static: {os.path.abspath('.')}")
    print(f"   Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Shutting down")
        httpd.shutdown()

if __name__ == "__main__":
    run()
