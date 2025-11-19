# Jani Monorepo

Turborepo монорепо для Mini App + Telegram бота. Сейчас реализован только **Этап 0** – базовая инфраструктура, которая включает:

- pnpm + Turborepo workspace (`apps/*`, `packages/*`)
- Docker Compose с PostgreSQL 16 (pgvector) и Redis 7
- Prisma схема с таблицами `users`, `characters`, `dialogs`, `messages` и базовыми сущностями монетизации
- Библиотеки `@jani/database`, `@jani/shared`, заглушки `@jani/telegram`, `@jani/llm`, `@jani/payments`
- Приложения: API (Express), PWA (Vite + React), бот-заглушка, worker с BullMQ, admin-заглушка
- ESLint + Prettier конфигурации

## Быстрый старт

1. Скопируйте `.env.example` → `.env` и при необходимости обновите порты/токены.
2. Скопируйте `.env.example` → `.env` и при необходимости обновите токены (Telegram, JWT).

> Значения DATABASE_URL/REDIS_URL указывают на docker-сервисы `postgres` и `redis`. Если запускаете сервисы напрямую на хосте без Compose, замените `postgres`/`redis` на `localhost`.

3. Запустите весь стек (Docker Compose поднимет PostgreSQL, Redis и `pnpm dev`):

```bash
docker compose -f docker/docker-compose.yml up app
```

Первый запуск выполнит `pnpm install` внутри контейнера и запустит `turbo dev`, поэтому API (3001), Mini App (5173), Admin (4173) и бот (3002) станут доступны на хосте.

4. Выполните миграции и сидинг (также через контейнер):

```bash
docker compose -f docker/docker-compose.yml run --rm app pnpm --filter @jani/database db:migrate -- --name init
docker compose -f docker/docker-compose.yml run --rm app pnpm --filter @jani/database db:seed
```

PWA доступна на http://localhost:5173 и сразу проходит Telegram-auth (через mock initData, если не в Mini App).

## Docker сервисы

- PostgreSQL: `postgresql://jani:jani_dev_pass@localhost:5432/jani_dev`
- Redis: `redis://localhost:6379`

`docker/init-db.sql` включает pgvector расширение.

## Структура

```
apps/
  api/      – Express REST API
  bot/      – Telegram bot placeholder
  worker/   – BullMQ worker
  pwa/      – React PWA (Vite)
  admin/    – Admin placeholder
packages/
  database/ – Prisma schema + client
  shared/   – Общие константы/типы
  telegram/ – Telegram helper (заглушка)
  llm/      – OpenRouter client (заглушка)
  payments/ – Mock payments helper
```

## Полезные команды

| Команда | Описание |
| --- | --- |
| `docker compose -f docker/docker-compose.yml up app` | Единый запуск всех приложений + инфраструктуры |
| `pnpm lint` | Запустить ESLint для всех пакетов |
| `pnpm db:migrate` | Прогнать миграции Prisma через Turbo |
| `pnpm db:seed` | Сидинг базовых персонажей |

## Дальнейшие шаги

Следующий этап – `task/01-auth.md`: внедрение авторизации, ролей и лимитов. Перед началом убедитесь, что инфраструктура работает и базовые сервисы (API, worker, PWA) проходят smoke-тесты.

## Auth API (Этап 1)

- `POST /api/auth/telegram` — принимает `initData` (из Mini App) и возвращает `{ user, accessToken }`. Refresh токен хранится в httpOnly cookie.
- `POST /api/auth/refresh` — обновляет access token (использует cookie `jid`).
- `POST /api/auth/logout` — отзывает refresh-сессию.
- `GET /api/me` — профиль пользователя (roles, tier, entitlements, permissions).
- `GET /api/limits` — оставшийся дневной лимит и soft cap.
- `GET /api/admin/users` — список пользователей (доступ только роли `admin`).

Для локальных тестов можно использовать `MOCK_TELEGRAM_INIT_DATA` из `.env`. Проверка подписи отключается, если `AUTH_ALLOW_DEV_INIT_DATA=true` (только для dev-сред).

> `TELEGRAM_WEBAPP_SECRET` должен совпадать с токеном бота (или секретом Mini App) — он используется для HMAC проверки `initData` в соответствии с [Telegram WebApp auth](https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app).
