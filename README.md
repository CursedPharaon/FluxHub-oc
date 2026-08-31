# FluxHub — Игровая платформа как Steam

FluxHub — полноценная веб-платформа для публикации и игры в HTML/JS игры. Дизайн в стиле Steam + неон, glassmorphism, тёмная тема.

## 🚀 Реальная база данных — кросс-девайс аккаунты
- **SQLite по умолчанию** (`data/fluxhub.db`) — создается автоматически, WAL journal, хранит *все*: пользователи, игры, чаты, друзья, библиотеки
- **PostgreSQL опционально** — если задан `DATABASE_URL=postgresql://...` (например Render, Railway, Supabase, Neon). Требует `psycopg2-binary`
- **Пароли хешируются** PBKDF2-SHA256 (старые plain автоматически мигрируют при логине)
- **Токены** HMAC-подпись (без JWT-либы), хранятся в `localStorage` как `flux_token`
- **Все устройства**: войди с любого девайса с тем же логином/паролем — библиотека, друзья, чаты подтянутся с сервера
- **Вытеснен JSONbin** — весь `server.py` переписан, никаких `BIN_ID`/`API_KEY`, никакого прокси к jsonbin.io

### API сервера (`server.py`)
```
GET  /api/health          -> {status, db:"sqlite"|"postgres", users, games, chats}
GET  /api/config          -> {apiBase, superadmin}
GET  /api/db              -> {users, games, chats}    (дамп для фронта, совместимость)
PUT  /api/db              -> сохранить дамп
POST /api/auth/register   -> {username,email,password} -> {user, token}
POST /api/auth/login      -> {login,password} -> {user, token}
GET  /api/auth/me         -> Authorization: Bearer <token> -> user
```

## 🚀 Фишки
- Магазин с категориями, поиском, сортировкой
- Библиотека — теперь `DB.users[].library`, синхронизируется на все устройства
- Публикация игр: архив .zip с `index.html` → модерация
- Игра в iframe с fullscreen
- Лайки, комменты, plays
- Авторизация: регистрация/вход через `/api/auth/*`
- Админ-панель: модерация, юзеры, баны, `cursed_dev` superadmin
- Друзья / заявки / чаты (только между друзьями)
- Приватность и настройки

## 📁 Структура
```
index.html
server.py       — Real DB сервер (SQLite/PostgreSQL), статика + API
data/fluxhub.db — SQLite файл (создается автоматически, gitignored)
requirements.txt
docker-compose.yml — Postgres + App
Dockerfile
css/style.css
js/config.js    — API_BASE + SUPERADMIN (без ключей)
js/storage.js   — load/save через /api/db + localStorage кэш
js/auth.js      — регистрация/логин через /api/auth/* + кросс-девайс токены
js/games.js / admin.js / social.js / app.js
```

## 🔑 Переменные окружения
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname  # опционально, иначе SQLite
FLUX_DB_PATH=./data/fluxhub.db                         # путь к SQLite
FLUX_SECRET=super-secret-change-me                     # для подписи токенов
PORT=8000
```

## 🧪 Локальный запуск

### Вариант 1 — SQLite (по умолчанию, ничего не нужно ставить)
```bash
python server.py          # http://localhost:8000
# данные сохранятся в ./data/fluxhub.db и доступны с любого устройства после логина
python server.py --port 3000
```

### Вариант 2 — PostgreSQL локально через Docker
```bash
docker compose up --build
# app http://localhost:8000, db fluxhub/fluxhub
```

### Вариант 3 — деплой на Render/Railway/Fly
- Укажи `DATABASE_URL` из панели Postgres (Supabase/Neon/Render Postgres)
- Команда запуска: `python server.py --host 0.0.0.0 --port $PORT`
- `psycopg2-binary` уже в `requirements.txt`

## 📦 Миграция со старого JSONbin
- Старые `BIN_ID` больше не используются
- При первом запуске сервер сидит `DEFAULT_DATA` (superadmin + 2 демо-игры)
- Если у тебя был дамп из JSONbin — импортируй его `PUT /api/db` (можно скриптом `curl -X PUT http://localhost:8000/api/db -H "Content-Type: application/json" -d @dump.json`)

## 👑 Superadmin
- Ник: `cursed_dev` (создается автоматически, нельзя забанить, роль `superadmin`)

## 📜 Лицензия
MIT
