# Jani AI Mini App

Минимальная реализация сервиса общения с AI-персонажами по ТЗ. В проект входят:

- **backend** — Node.js + Express, PostgreSQL, Telegram webhook и интеграция с OpenRouter.
- **frontend** — Vite + React SPA (mini app / PWA + простая админка).
- **docker-compose** — запуск Postgres, API и фронтенда одной командой.

## Быстрый старт

1. Создайте файл `.env` на основе `.env.example` и заполните токены Telegram/ OpenRouter.
2. Запустите сервисы:

```bash
docker compose up --build
```

Сервисы:

- API: http://localhost:3000
- Frontend (PWA/WebApp): http://localhost:4173
- Postgres: localhost:5433 (user/password из `.env`).

## Настройка Telegram

1. Укажите `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` и `WEBAPP_URL` (URL фронтенда).
2. Для кнопки WebApp нужен HTTPS: задайте `WEBAPP_PUBLIC_URL` (например, ссылку из ngrok) — это значение уйдёт в inline-кнопки бота. Если не указать, будет использован `WEBAPP_URL`. В docker-compose можно переопределить `WEBAPP_PUBLIC_URL` через env без ребилда.
2. Настройте webhook: `https://your-domain/telegram/webhook` и передайте `secret_token` = `TELEGRAM_WEBHOOK_SECRET`.
3. Для мини-приложения передавайте `initData` в виде строки `window.Telegram.WebApp.initData` во все REST-запросы (фронт делает это автоматически).
4. Для локального теста без внешнего домена можно поднять ngrok как отдельный сервис из docker-compose: задайте `NGROK_AUTHTOKEN` (и опционально `NGROK_DOMAIN`, если нужен кастомный домен), затем `docker compose up ngrok`. Логи ngrok покажут публичный URL. Если включите `TELEGRAM_AUTO_WEBHOOK=true` в `.env`, backend сам будет опрашивать ngrok API и выставлять вебхук на актуальный URL (`<public-url>/telegram/webhook`) с `secret_token=TELEGRAM_WEBHOOK_SECRET`. Или можно задать фиксированный `TELEGRAM_WEBHOOK_EXTERNAL_URL` и автообновление будет использовать его.

## Локальный запуск

```bash
cp .env.example .env
# заполняем TELEGRAM_BOT_TOKEN/USERNAME, OPENROUTER_API_KEY, TELEGRAM_WEBHOOK_SECRET, NGROK_AUTHTOKEN при необходимости

# backend
cd backend && npm install && npm run dev

# frontend (в другом терминале)
cd frontend && npm install && npm run dev

# если нужен публичный URL для бота: в корне
docker compose up ngrok
# вариант 1: включите TELEGRAM_AUTO_WEBHOOK=true — backend сам подтянет URL из ngrok и дернет setWebhook
# вариант 2: вручную дернуть:
# curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
#   -H "Content-Type: application/json" \
#   -d "{\"url\":\"<ngrok-url>/telegram/webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}"
# при перезапуске ngrok адрес меняется — авто-режим решает это, либо повторите setWebhook вручную
```



## Полезные команды

```bash
# backend
cd backend
npm install
npm run dev

# frontend
cd frontend
npm install
npm run dev
```

Перед запуском вне Docker убедитесь, что Postgres доступен и `DATABASE_URL` указывает на него.
