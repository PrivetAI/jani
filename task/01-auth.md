# Этап 1: Auth & User Management – Telegram Identity Core

**Цель:** обеспечить единый слой идентификации на стороне API с валидацией Telegram Mini App initData, ролевой моделью (user/admin/creator), учётом тарифных прав и суточных квот.

**Время:** 3–4 дня

**Зависит от:** Этап 0 (монорепо + базовая схема БД, Docker)

---

## Acceptance Criteria

- ✅ API валидирует `initData` Mini App / WebApp (FR-SEC-01) и создаёт/обновляет пользователя в `users`.
- ✅ Профиль пользователя хранит роли, тариф (free|plus|pro|ultra), активные пакеты (Story/Memory/Creator) и aggregated-права.
- ✅ Дневной лимит сообщений (`QUOTA_DAILY_LIMIT`) и софт-кэп подписки (`SUBSCRIPTION_UNLIMITED_SOFTCAP`) рассчитываются и возвращаются клиентам (FR-GEN-04, FR-APP-06).
- ✅ CRUD для пользовательских сессий (Mini App, bot deep link, admin) вынесен в `packages/auth` и переиспользуется всеми приложениями.
- ✅ API `/api/me`, `/api/limits`, `/api/admin/users` работают и покрыты unit/integration тестами.
- ✅ Seed создан для 1 администратора и 1 креатора; роли проверяются middleware.

---

## Основной скоуп

### packages/auth
- Реализация валидатора Telegram `initData` (подпись HMAC-SHA256, exp = 1 мин).
- Адаптеры: Mini App (authData), Bot Deep Link (`start=<dialog_id>` → проверка владельца), Admin (email+TOTP, временно — `.env ADMIN_SEED_TOKEN`).
- Интерфейсы `AuthContext`, `SessionMeta`, `Role`.

### packages/shared
- Константы тарифов, пермишены (`Permissions`), расчёт скидок по тарифу.
- Типы для лимитов, пакетов, прав доступа (FR-GEN-03/04).

### packages/database
- Таблицы/модели: `users` (telegram_id, username, locale, roles[]), `user_sessions`, `user_entitlements` (type=subscription|package, expires_at, source), `user_limits` (daily_used, last_reset_at).
- Cron/worker hook для полуночного сброса лимитов (placeholder).

### apps/api
- Эндпоинты:
  - `POST /api/auth/telegram` — принимает `initData`, возвращает JWT (short-lived) + refresh cookie.
  - `GET /api/me` — профиль + активные права.
  - `GET /api/limits` — остаток лимита, CTA текст (FR-APP-06).
  - `GET /api/admin/users` (admin-only) — поиск/фильтры.
- Middleware `requireRole`, `requireEntitlement`.

### apps/pwa & Mini App bootstrap
- Обёртка над `Telegram.WebApp.initData` → вызов `POST /api/auth/telegram`.
- Экран «Подключение…» + обработка ошибок (`invalid_hash`, `expired`).
- Локальное хранение access token (Memory) и refresh по silent-эндпоинту.

### Общие задачи
- Конфиги `.env`: `BOT_USERNAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBAPP_SECRET`.
- Документация по генерации HMAC ключа и тесту в Postman.

---

## Implementation Steps

1. **Data model & Prisma**
   - Добавить модели и миграции (`users`, `user_sessions`, `user_entitlements`, `user_limits`).
   - Seed admin/creator пользователей, связанный `entitlements`.
2. **Auth package**
   - Реализовать `verifyTelegramInitData(initData, botToken)` с кешированием nonce.
   - Экспортировать `issueTokens(user)` (access+refresh, JWT HS256, 15 мин / 30 дней).
3. **API endpoints**
   - Контроллеры auth, profile, limits; подключить middleware.
   - Админский список пользователей + фильтры по ролям/тарифу.
4. **Quota service**
   - Сервис `QuotaService.consume(userId, channel)` и `QuotaService.resetDaily()`.
   - Порог `SUBSCRIPTION_UNLIMITED_SOFTCAP` → мягкий warning (не блокирует).
5. **Client bootstrap**
   - Мини-приложение: после `Telegram.WebApp.ready()` отправить `initData`.
   - PWA dev: мок `initData` (читается из `.env`).
6. **Testing & docs**
   - Unit тесты `verifyTelegramInitData`, `QuotaService`.
   - Insomnia коллекция `Auth.postman_collection.json`.
   - Обновление README/task/00-setup ссылкой на инструкции.

---

## Verification

1. `pnpm db:migrate && pnpm db:seed` создаёт пользователей и роли.
2. В Mini App после загрузки `/api/me` возвращает профиль (role=user, tariff=free).
3. Вручную повысить тариф пользователю → `GET /api/limits` отражает новый лимит и скидку.
4. `/api/admin/users?role=creator` доступен только под seed-админом.
5. Ежедневный reset (ручной вызов скрипта) обнуляет счётчик `daily_used`.

---

## Deliverables

- Обновлённые схемы и миграции Prisma.
- `packages/auth` с unit-тестами.
- REST-эндпоинты `/api/auth/telegram`, `/api/me`, `/api/limits`, `/api/admin/users`.
- Инструкции по подключению Mini App к auth.
- Обновлённый `.env.example` (секреты/лимиты).
