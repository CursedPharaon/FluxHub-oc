#!/usr/bin/env python3
"""
FluxHub — Real Database server (SQLite + PostgreSQL)
Заменяет JSONBin на нормальную БД. Данные живут на сервере и доступны с любого устройства/аккаунта.

- По умолчанию: SQLite файл data/fluxhub.db (создается автоматически)
- Если задан DATABASE_URL (postgres://...), используется PostgreSQL (psycopg2)
- API:
    GET  /api/health          -> {status, db, users, games, superadmin}
    GET  /api/config          -> {apiBase, superadmin}
    GET  /api/db              -> {users, games, chats}  (полный дамп, для совместимости)
    PUT  /api/db              -> сохранить дамп
    POST /api/db              -> alias PUT
    POST /api/auth/register   -> {username,email,password} -> {user, token}
    POST /api/auth/login      -> {login,password} -> {user, token}
    GET  /api/auth/me         -> Authorization: Bearer <token> -> user
    GET  /*                   -> static files
- Пароли хранятся как PBKDF2-SHA256 (fallback plain для старых записей, авто-миграция при логине)
- Все JSONBin константы удалены.
"""
import base64
import hashlib
import http.server
import hmac
import json
import os
import sys
import time
import sqlite3
import urllib.parse
from urllib.parse import urlparse

# ===== CONFIG =====
SUPERADMIN = "cursed_dev"
DEFAULT_SUPERADMIN_EMAIL = "cursed@fluxhub.dev"
DEFAULT_SUPERADMIN_PASS = "12345678"
SECRET_KEY = os.environ.get("FLUX_SECRET", "fluxhub-secret-2026-change-me")
DB_PATH = os.environ.get("FLUX_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "fluxhub.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "")

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
            "bio": "Founder & Super Admin of FluxHub 👑",
            "friends": [],
            "friendRequestsIncoming": [],
            "friendRequestsOutgoing": [],
            "privacy": {"friendsVisibility": "all", "gamesVisibility": "all"},
            "settings": {"notifyFriendRequest": True, "notifyMessages": True, "soundEnabled": True, "showOnline": True, "language": "ru"},
            "library": []
        }
    ],
    "games": [
        {
            "id": "g_demo1",
            "title": "NEON DRIFTER",
            "description": "Гони на неоновом шоссе, уворачивайся от препятствий и ставь рекорды скорости.",
            "category": "racing",
            "tags": ["neon","arcade","retro"],
            "author": "FluxTeam",
            "authorId": "u_super",
            "logo": "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=600&q=80",
            "screenshots": [
                "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&q=80",
                "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80"
            ],
            "htmlCode": "<canvas id='c' width='800' height='400' style='width:100%;background:#000;display:block'></canvas>",
            "cssCode": "body{margin:0;background:#000;color:#fff}",
            "jsCode": "console.log('demo')",
            "archiveName": "",
            "archiveExt": "zip",
            "archiveEntry": "",
            "files": None,
            "fileList": [],
            "archiveRaw": None,
            "archiveSize": 0,
            "status": "approved",
            "createdAt": int(time.time()*1000)-86400000*2,
            "plays": 3421,
            "likes": ["u_super"],
            "rating": 4.8,
            "comments": [],
            "rejectReason": ""
        },
        {
            "id": "g_demo2",
            "title": "VOID SHOOTER",
            "description": "Космический шутер.",
            "category": "shooter",
            "tags": ["space","shooter","hardcore"],
            "author": "cursed_dev",
            "authorId": "u_super",
            "logo": "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&q=80",
            "screenshots": ["https://images.unsplash.com/photo-1451187580459-43490279c429?w=800&q=80"],
            "htmlCode": "<div>VOID</div>",
            "cssCode": "",
            "jsCode": "",
            "archiveName": "",
            "archiveExt": "zip",
            "archiveEntry": "",
            "files": None,
            "fileList": [],
            "archiveRaw": None,
            "archiveSize": 0,
            "status": "approved",
            "createdAt": int(time.time()*1000)-86400000,
            "plays": 1280,
            "likes": [],
            "rating": 4.5,
            "comments": [],
            "rejectReason": ""
        }
    ],
    "chats": []
}

# ===== DB Abstraction (SQLite default, PostgreSQL optional) =====
IS_POSTGRES = False
_pg_conn = None

def _detect_postgres():
    global IS_POSTGRES
    if DATABASE_URL and DATABASE_URL.startswith(("postgres://", "postgresql://")):
        try:
            import psycopg2  # noqa: F401
            IS_POSTGRES = True
            return True
        except ImportError:
            print("[DB] DATABASE_URL set but psycopg2 not installed -> fallback to SQLite")
            return False
    return False

_detect_postgres()

# --- password helpers ---
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, 120000)
    return f"pbkdf2${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"

def verify_password(stored: str, provided: str) -> bool:
    if not stored:
        return False
    if stored.startswith("pbkdf2$"):
        try:
            _, b64_salt, b64_hash = stored.split("$", 2)
            salt = base64.b64decode(b64_salt)
            expected = base64.b64decode(b64_hash)
            dk = hashlib.pbkdf2_hmac('sha256', provided.encode('utf-8'), salt, 120000)
            return hmac.compare_digest(dk, expected)
        except Exception:
            return False
    else:
        # legacy plain
        return stored == provided

def needs_rehash(stored: str) -> bool:
    return not stored.startswith("pbkdf2$")

# --- token helpers (simple HMAC, no JWT dep) ---
def make_token(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time())}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

def verify_token(token: str):
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded).decode()
        parts = raw.rsplit(".", 1)
        if len(parts) != 2:
            return None
        payload, sig = parts
        expect = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expect):
            return None
        user_id = payload.split(".", 1)[0]
        return user_id
    except Exception:
        return None

# --- SQLite helpers ---
def get_sqlite_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn

_sqlite_conn = None
def get_conn():
    global _sqlite_conn, _pg_conn
    if IS_POSTGRES:
        import psycopg2
        import psycopg2.extras
        if _pg_conn is None or _pg_conn.closed:
            _pg_conn = psycopg2.connect(DATABASE_URL)
            _pg_conn.autocommit = True
        return _pg_conn
    else:
        if _sqlite_conn is None:
            _sqlite_conn = get_sqlite_conn()
        return _sqlite_conn

def db_execute(query, params=(), fetch=False, fetch_one=False):
    if IS_POSTGRES:
        import psycopg2.extras
        # translate ? to %s for postgres
        q = query.replace("?", "%s")
        conn = get_conn()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(q, params)
            if fetch:
                return cur.fetchall()
            if fetch_one:
                return cur.fetchone()
            # for inserts, rowcount
            return cur.rowcount
    else:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(query, params)
        if fetch or fetch_one:
            if fetch_one:
                row = cur.fetchone()
                return dict(row) if row else None
            else:
                rows = cur.fetchall()
                return [dict(r) for r in rows]
        else:
            conn.commit()
            return cur.rowcount

def init_db():
    if IS_POSTGRES:
        db_execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT,
                role TEXT,
                banned_until BIGINT,
                created_at BIGINT,
                bio TEXT,
                friends TEXT,
                friend_requests_incoming TEXT,
                friend_requests_outgoing TEXT,
                privacy TEXT,
                settings TEXT,
                library TEXT
            )
        """)
        db_execute("""
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                category TEXT,
                tags TEXT,
                author TEXT,
                author_id TEXT,
                logo TEXT,
                screenshots TEXT,
                archive_name TEXT,
                archive_ext TEXT,
                archive_entry TEXT,
                files TEXT,
                file_list TEXT,
                archive_raw TEXT,
                archive_size BIGINT,
                html_code TEXT,
                css_code TEXT,
                js_code TEXT,
                status TEXT,
                created_at BIGINT,
                plays BIGINT,
                likes TEXT,
                rating REAL,
                comments TEXT,
                reject_reason TEXT
            )
        """)
        db_execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                participants TEXT,
                messages TEXT,
                created_at BIGINT
            )
        """)
    else:
        db_execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT,
                role TEXT,
                banned_until INTEGER,
                created_at INTEGER,
                bio TEXT,
                friends TEXT,
                friend_requests_incoming TEXT,
                friend_requests_outgoing TEXT,
                privacy TEXT,
                settings TEXT,
                library TEXT
            )
        """)
        db_execute("""
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                category TEXT,
                tags TEXT,
                author TEXT,
                author_id TEXT,
                logo TEXT,
                screenshots TEXT,
                archive_name TEXT,
                archive_ext TEXT,
                archive_entry TEXT,
                files TEXT,
                file_list TEXT,
                archive_raw TEXT,
                archive_size INTEGER,
                html_code TEXT,
                css_code TEXT,
                js_code TEXT,
                status TEXT,
                created_at INTEGER,
                plays INTEGER,
                likes TEXT,
                rating REAL,
                comments TEXT,
                reject_reason TEXT
            )
        """)
        db_execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                participants TEXT,
                messages TEXT,
                created_at INTEGER
            )
        """)
    # seed if empty
    cnt = db_execute("SELECT COUNT(*) as c FROM users", fetch_one=True)
    c = cnt["c"] if isinstance(cnt, dict) else cnt[0] if cnt else 0
    # psycopg RealDict returns dict
    if isinstance(c, dict):
        c = list(c.values())[0]
    if c == 0:
        print("[DB] Seeding default data (superadmin + demos)")
        record = DEFAULT_DATA
        save_record(record)
    else:
        # ensure superadmin exists
        ensure_superadmin_db()

def ensure_superadmin_db():
    row = db_execute("SELECT * FROM users WHERE username = ?", (SUPERADMIN,), fetch_one=True)
    if not row:
        u = DEFAULT_DATA["users"][0]
        # hash password if needed
        pw = u["password"]
        if needs_rehash(pw):
            pw = hash_password(pw)
        db_execute("""
            INSERT INTO users (id, username, email, password, avatar, role, banned_until, created_at, bio, friends, friend_requests_incoming, friend_requests_outgoing, privacy, settings, library)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            u["id"], u["username"], u["email"], pw, u["avatar"], "superadmin", None, int(time.time()*1000), u["bio"],
            json.dumps(u.get("friends", [])), json.dumps(u.get("friendRequestsIncoming", [])),
            json.dumps(u.get("friendRequestsOutgoing", [])), json.dumps(u.get("privacy", {})),
            json.dumps(u.get("settings", {})), json.dumps(u.get("library", []))
        ))
        print("[DB] Created superadmin cursed_dev")
        return True
    else:
        # fix role/ban
        need = False
        updates = {}
        if row["role"] != "superadmin":
            updates["role"] = "superadmin"
            need = True
        if row["banned_until"] is not None:
            updates["banned_until"] = None
            need = True
        # also ensure password exists
        if not row["password"]:
            updates["password"] = hash_password(DEFAULT_SUPERADMIN_PASS)
            need = True
        if need:
            set_clause = ", ".join([f"{k}=?" for k in updates.keys()])
            db_execute(f"UPDATE users SET {set_clause} WHERE id=?", (*updates.values(), row["id"]))
            print("[DB] Fixed superadmin")
            return True
    return False

def row_to_user(row):
    if not row:
        return None
    d = dict(row) if not isinstance(row, dict) else row
    # sqlite returns dict, pg returns dict
    return {
        "id": d["id"],
        "username": d["username"],
        "email": d["email"],
        "password": d["password"],
        "avatar": d["avatar"],
        "role": d["role"],
        "bannedUntil": d["banned_until"],
        "createdAt": d["created_at"],
        "bio": d["bio"],
        "friends": json.loads(d["friends"] or "[]"),
        "friendRequestsIncoming": json.loads(d["friend_requests_incoming"] or "[]"),
        "friendRequestsOutgoing": json.loads(d["friend_requests_outgoing"] or "[]"),
        "privacy": json.loads(d["privacy"] or '{"friendsVisibility":"all","gamesVisibility":"all"}'),
        "settings": json.loads(d["settings"] or '{"notifyFriendRequest":true,"notifyMessages":true,"soundEnabled":true,"showOnline":true,"language":"ru"}'),
        "library": json.loads(d["library"] or "[]"),
    }

def row_to_game(row):
    d = dict(row) if not isinstance(row, dict) else row
    return {
        "id": d["id"],
        "title": d["title"],
        "description": d["description"],
        "category": d["category"],
        "tags": json.loads(d["tags"] or "[]"),
        "author": d["author"],
        "authorId": d["author_id"],
        "logo": d["logo"],
        "screenshots": json.loads(d["screenshots"] or "[]"),
        "archiveName": d["archive_name"],
        "archiveExt": d["archive_ext"],
        "archiveEntry": d["archive_entry"],
        "files": json.loads(d["files"]) if d["files"] else None,
        "fileList": json.loads(d["file_list"] or "[]"),
        "archiveRaw": d["archive_raw"],
        "archiveSize": d["archive_size"] or 0,
        "htmlCode": d["html_code"] or "",
        "cssCode": d["css_code"] or "",
        "jsCode": d["js_code"] or "",
        "status": d["status"],
        "createdAt": d["created_at"],
        "plays": d["plays"] or 0,
        "likes": json.loads(d["likes"] or "[]"),
        "rating": d["rating"] or 0,
        "comments": json.loads(d["comments"] or "[]"),
        "rejectReason": d["reject_reason"] or "",
    }

def row_to_chat(row):
    d = dict(row) if not isinstance(row, dict) else row
    return {
        "id": d["id"],
        "participants": json.loads(d["participants"] or "[]"),
        "messages": json.loads(d["messages"] or "[]"),
    }

def load_record():
    users_rows = db_execute("SELECT * FROM users", fetch=True) or []
    games_rows = db_execute("SELECT * FROM games ORDER BY created_at DESC", fetch=True) or []
    chats_rows = db_execute("SELECT * FROM chats", fetch=True) or []
    users = [row_to_user(r) for r in users_rows]
    games = [row_to_game(r) for r in games_rows]
    chats = [row_to_chat(r) for r in chats_rows]
    # ensure defaults/cleanup similar to old ensure_superadmin
    changed = False
    # dedup & clean
    ids = set(u["id"] for u in users)
    game_ids = set(g["id"] for g in games)
    for u in users:
        orig_f = list(u["friends"])
        u["friends"] = [i for i in u["friends"] if i in ids and i != u["id"]]
        u["friends"] = list(dict.fromkeys(u["friends"]))
        if u["friends"] != orig_f:
            changed = True
        orig_i = list(u["friendRequestsIncoming"])
        u["friendRequestsIncoming"] = [i for i in u["friendRequestsIncoming"] if i in ids and i != u["id"] and i not in u["friends"]]
        u["friendRequestsIncoming"] = list(dict.fromkeys(u["friendRequestsIncoming"]))
        if u["friendRequestsIncoming"] != orig_i:
            changed = True
        orig_o = list(u["friendRequestsOutgoing"])
        u["friendRequestsOutgoing"] = [i for i in u["friendRequestsOutgoing"] if i in ids and i != u["id"] and i not in u["friends"]]
        u["friendRequestsOutgoing"] = list(dict.fromkeys(u["friendRequestsOutgoing"]))
        if u["friendRequestsOutgoing"] != orig_o:
            changed = True
        # library
        if not isinstance(u["library"], list):
            u["library"] = []
            changed = True
        else:
            dedup = list(dict.fromkeys(u["library"]))
            filtered = [i for i in dedup if i in game_ids] if game_ids else dedup
            if filtered != u["library"]:
                u["library"] = filtered
                changed = True
    # chats validation
    valid_chats = []
    for c in chats:
        if not isinstance(c.get("participants"), list) or len(c["participants"]) != 2:
            changed = True
            continue
        if c["participants"][0] not in ids or c["participants"][1] not in ids:
            changed = True
            continue
        if not isinstance(c.get("messages"), list):
            c["messages"] = []
            changed = True
        valid_chats.append(c)
    if len(valid_chats) != len(chats):
        chats = valid_chats
        changed = True
    # superadmin guarantee
    u = next((x for x in users if x.get("username") == SUPERADMIN), None)
    if not u:
        su = dict(DEFAULT_DATA["users"][0])
        su["createdAt"] = int(time.time()*1000)
        # hash
        if needs_rehash(su["password"]):
            su["password"] = hash_password(su["password"])
        users.insert(0, su)
        changed = True
    else:
        if u.get("role") != "superadmin":
            u["role"] = "superadmin"
            changed = True
        if u.get("bannedUntil") is not None:
            u["bannedUntil"] = None
            changed = True
    if changed:
        # persist cleaned
        save_record({"users": users, "games": games, "chats": chats})
    return {"users": users, "games": games, "chats": chats}

def save_record(record):
    users = record.get("users", [])
    games = record.get("games", [])
    chats = record.get("chats", [])
    # ensure superadmin before save (reuse logic lightly)
    # hash passwords that are plain
    for u in users:
        if "password" in u and u["password"] and needs_rehash(u["password"]):
            u["password"] = hash_password(u["password"])
    # replace tables in transaction
    if IS_POSTGRES:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("BEGIN")
            try:
                cur.execute("DELETE FROM chats")
                cur.execute("DELETE FROM games")
                cur.execute("DELETE FROM users")
                for u in users:
                    cur.execute("""
                        INSERT INTO users (id, username, email, password, avatar, role, banned_until, created_at, bio, friends, friend_requests_incoming, friend_requests_outgoing, privacy, settings, library)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        u.get("id"), u.get("username"), u.get("email"), u.get("password"), u.get("avatar"), u.get("role"),
                        u.get("bannedUntil"), u.get("createdAt"), u.get("bio"),
                        json.dumps(u.get("friends", [])), json.dumps(u.get("friendRequestsIncoming", [])),
                        json.dumps(u.get("friendRequestsOutgoing", [])), json.dumps(u.get("privacy", {})), json.dumps(u.get("settings", {})), json.dumps(u.get("library", []))
                    ))
                for g in games:
                    cur.execute("""
                        INSERT INTO games (id, title, description, category, tags, author, author_id, logo, screenshots, archive_name, archive_ext, archive_entry, files, file_list, archive_raw, archive_size, html_code, css_code, js_code, status, created_at, plays, likes, rating, comments, reject_reason)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (
                        g.get("id"), g.get("title"), g.get("description"), g.get("category"), json.dumps(g.get("tags", [])),
                        g.get("author"), g.get("authorId"), g.get("logo"), json.dumps(g.get("screenshots", [])),
                        g.get("archiveName"), g.get("archiveExt"), g.get("archiveEntry"), json.dumps(g.get("files")) if g.get("files") else None,
                        json.dumps(g.get("fileList", [])), g.get("archiveRaw"), g.get("archiveSize", 0),
                        g.get("htmlCode"), g.get("cssCode"), g.get("jsCode"), g.get("status"), g.get("createdAt"), g.get("plays",0),
                        json.dumps(g.get("likes", [])), g.get("rating",0), json.dumps(g.get("comments",[])), g.get("rejectReason","")
                    ))
                for c in chats:
                    cur.execute("""
                        INSERT INTO chats (id, participants, messages, created_at) VALUES (%s,%s,%s,%s)
                    """, (c.get("id"), json.dumps(c.get("participants",[])), json.dumps(c.get("messages",[])), c.get("createdAt", int(time.time()*1000))))
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
    else:
        conn = get_conn()
        cur = conn.cursor()
        try:
            cur.execute("BEGIN")
            cur.execute("DELETE FROM chats")
            cur.execute("DELETE FROM games")
            cur.execute("DELETE FROM users")
            for u in users:
                cur.execute("""
                    INSERT INTO users (id, username, email, password, avatar, role, banned_until, created_at, bio, friends, friend_requests_incoming, friend_requests_outgoing, privacy, settings, library)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    u.get("id"), u.get("username"), u.get("email"), u.get("password"), u.get("avatar"), u.get("role"),
                    u.get("bannedUntil"), u.get("createdAt"), u.get("bio"),
                    json.dumps(u.get("friends", [])), json.dumps(u.get("friendRequestsIncoming", [])),
                    json.dumps(u.get("friendRequestsOutgoing", [])), json.dumps(u.get("privacy", {})), json.dumps(u.get("settings", {})), json.dumps(u.get("library", []))
                ))
            for g in games:
                cur.execute("""
                    INSERT INTO games (id, title, description, category, tags, author, author_id, logo, screenshots, archive_name, archive_ext, archive_entry, files, file_list, archive_raw, archive_size, html_code, css_code, js_code, status, created_at, plays, likes, rating, comments, reject_reason)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    g.get("id"), g.get("title"), g.get("description"), g.get("category"), json.dumps(g.get("tags", [])),
                    g.get("author"), g.get("authorId"), g.get("logo"), json.dumps(g.get("screenshots", [])),
                    g.get("archiveName"), g.get("archiveExt"), g.get("archiveEntry"), json.dumps(g.get("files")) if g.get("files") else None,
                    json.dumps(g.get("fileList", [])), g.get("archiveRaw"), g.get("archiveSize", 0),
                    g.get("htmlCode"), g.get("cssCode"), g.get("jsCode"), g.get("status"), g.get("createdAt"), g.get("plays",0),
                    json.dumps(g.get("likes", [])), g.get("rating",0), json.dumps(g.get("comments",[])), g.get("rejectReason","")
                ))
            for c in chats:
                cur.execute("""
                    INSERT INTO chats (id, participants, messages, created_at) VALUES (?,?,?,?)
                """, (c.get("id"), json.dumps(c.get("participants",[])), json.dumps(c.get("messages",[])), c.get("createdAt", int(time.time()*1000))))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"[DB save_record error] {e}")
            raise e

# ===== HTTP Handler =====
class FluxHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")
        sys.stdout.flush()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bin-Meta, X-Master-Key, X-Access-Key")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/api/db", "/api/db/latest"):
            self.handle_get_db()
            return
        if path == "/api/health":
            rec = load_record()
            db_type = "postgres" if IS_POSTGRES else "sqlite"
            self.send_json({"status": "ok", "db": db_type, "users": len(rec["users"]), "games": len(rec["games"]), "chats": len(rec["chats"]), "superadmin": SUPERADMIN})
            return
        if path == "/api/config":
            self.send_json({"apiBase": "/api", "superadmin": SUPERADMIN, "db": "postgres" if IS_POSTGRES else "sqlite"})
            return
        if path == "/api/auth/me":
            self.handle_auth_me()
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/auth/register":
            self.handle_register()
            return
        if path == "/api/auth/login":
            self.handle_login()
            return
        if path in ("/api/db", "/api/db/latest"):
            self.handle_put_db()
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/api/db", "/api/db/latest"):
            self.handle_put_db()
            return
        self.send_error(404, "Not Found")

    def do_DELETE(self):
        self.send_error(404, "Not Found")

    # ---- helpers ----
    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8")) if raw else {}
        except:
            return {}

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_get_db(self):
        try:
            rec = load_record()
            self.send_json(rec)
            print(f"[GET /api/db] OK users={len(rec['users'])} games={len(rec['games'])} chats={len(rec['chats'])}")
        except Exception as e:
            print(f"[GET /api/db] error {e}")
            import traceback; traceback.print_exc()
            self.send_json({"error": str(e)}, 500)

    def handle_put_db(self):
        payload = self.read_json_body()
        if not isinstance(payload, dict):
            self.send_json({"error": "invalid payload"}, 400)
            return
        # ensure defaults
        if "users" not in payload or not isinstance(payload["users"], list):
            payload["users"] = []
        if "games" not in payload or not isinstance(payload["games"], list):
            payload["games"] = []
        if "chats" not in payload or not isinstance(payload["chats"], list):
            payload["chats"] = []
        try:
            save_record(payload)
            self.send_json({"status": "ok", "users": len(payload["users"]), "games": len(payload["games"])})
            print(f"[PUT /api/db] saved users={len(payload['users'])} games={len(payload['games'])}")
        except Exception as e:
            print(f"[PUT /api/db] error {e}")
            import traceback; traceback.print_exc()
            self.send_json({"error": str(e)}, 500)

    def handle_register(self):
        data = self.read_json_body()
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip()
        password = data.get("password") or ""
        if not username or not email or not password:
            self.send_json({"error": "Заполни все поля"}, 400)
            return
        if len(username) < 3:
            self.send_json({"error": "Ник минимум 3 символа"}, 400)
            return
        if len(password) < 6:
            self.send_json({"error": "Пароль минимум 6 символов"}, 400)
            return
        if username.lower() == SUPERADMIN.lower():
            self.send_json({"error": "Этот ник зарезервирован 👑"}, 400)
            return
        # check uniqueness
        existing = db_execute("SELECT id FROM users WHERE lower(username)=lower(?)", (username,), fetch_one=True)
        if existing:
            self.send_json({"error": "Ник уже занят"}, 409)
            return
        existing = db_execute("SELECT id FROM users WHERE lower(email)=lower(?)", (email,), fetch_one=True)
        if existing:
            self.send_json({"error": "Email уже используется"}, 409)
            return
        uid = f"u_{os.urandom(4).hex()}_{int(time.time()*1000)%1000000}"
        hashed = hash_password(password)
        now = int(time.time()*1000)
        try:
            db_execute("""
                INSERT INTO users (id, username, email, password, avatar, role, banned_until, created_at, bio, friends, friend_requests_incoming, friend_requests_outgoing, privacy, settings, library)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                uid, username, email, hashed, f"https://i.pravatar.cc/200?u={username}", "user", None, now, "Новый игрок FluxHub 🎮",
                json.dumps([]), json.dumps([]), json.dumps([]),
                json.dumps({"friendsVisibility":"all","gamesVisibility":"all"}),
                json.dumps({"notifyFriendRequest":True,"notifyMessages":True,"soundEnabled":True,"showOnline":True,"language":"ru"}),
                json.dumps([])
            ))
            user = row_to_user(db_execute("SELECT * FROM users WHERE id=?", (uid,), fetch_one=True))
            # don't expose password hash
            user_safe = {k:v for k,v in user.items() if k!="password"}
            token = make_token(uid)
            self.send_json({"user": user_safe, "token": token})
            print(f"[register] {username} {uid}")
        except Exception as e:
            print(f"[register error] {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_login(self):
        data = self.read_json_body()
        login = (data.get("login") or data.get("username") or data.get("email") or "").strip()
        password = data.get("password") or ""
        if not login or not password:
            self.send_json({"error": "Заполни все поля"}, 400)
            return
        row = db_execute("SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)", (login, login), fetch_one=True)
        if not row:
            self.send_json({"error": "Неверный ник/email или пароль"}, 401)
            return
        user = row_to_user(row)
        if not verify_password(user["password"], password):
            self.send_json({"error": "Неверный ник/email или пароль"}, 401)
            return
        # check ban
        if user["bannedUntil"] and int(time.time()*1000) < user["bannedUntil"]:
            self.send_json({"error": f"Ты забанен", "bannedUntil": user["bannedUntil"]}, 403)
            return
        # auto rehash if plain
        if needs_rehash(row["password"]):
            new_hash = hash_password(password)
            db_execute("UPDATE users SET password=? WHERE id=?", (new_hash, user["id"]))
            print(f"[login] rehashed password for {user['username']}")
        user_safe = {k:v for k,v in user.items() if k!="password"}
        token = make_token(user["id"])
        self.send_json({"user": user_safe, "token": token})
        print(f"[login] {user['username']}")

    def handle_auth_me(self):
        auth = self.headers.get("Authorization", "")
        token = ""
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
        else:
            token = self.headers.get("X-Auth-Token", "") or urlparse(self.path).query
            # try query token
            qs = urllib.parse.parse_qs(urlparse(self.path).query)
            token = qs.get("token", [""])[0] or token
        if not token:
            self.send_json({"error": "no token"}, 401)
            return
        uid = verify_token(token)
        if not uid:
            self.send_json({"error": "invalid token"}, 401)
            return
        row = db_execute("SELECT * FROM users WHERE id=?", (uid,), fetch_one=True)
        if not row:
            self.send_json({"error": "user not found"}, 404)
            return
        user = row_to_user(row)
        user_safe = {k:v for k,v in user.items() if k!="password"}
        self.send_json({"user": user_safe})

def run():
    import argparse
    parser = argparse.ArgumentParser(description="FluxHub Real DB server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    parser.add_argument("--dir", default=".")
    args = parser.parse_args()
    os.chdir(args.dir)
    init_db()
    addr = (args.host, args.port)
    httpd = http.server.ThreadingHTTPServer(addr, FluxHandler)
    db_type = "PostgreSQL" if IS_POSTGRES else f"SQLite ({DB_PATH})"
    print(f"🚀 FluxHub server running at http://{args.host}:{args.port}/")
    print(f"   DB: {db_type}")
    print(f"   Endpoints: /api/db (GET/PUT), /api/auth/register, /api/auth/login, /api/health")
    print(f"   Static: {os.path.abspath('.')}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Shutting down")
        httpd.shutdown()

if __name__ == "__main__":
    run()
