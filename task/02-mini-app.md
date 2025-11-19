# Этап 2: Mini App Core – Каталог, Диалоги, Магазин (просмотр)

**Цель:** реализовать пользовательский поток в Mini App/PWA: просмотр каталога персонажей, карточки, создание диалога и экраны лимита/магазина/пакетов без реальных оплат.

**Время:** 5–6 дней

**Зависит от:** Этап 1 (авторизация) + базовые таблицы персонажей/диалогов из Этапа 0

---

## Acceptance Criteria

- ✅ Каталог персонажей (FR-APP-01) с поиском, фильтрами по тегам и пейволлам (premium, creator-only).
- ✅ Карточка персонажа (FR-APP-02) отображает описание, теги, открытые арки/эпизоды, Story Pack бейджи.
- ✅ Создание диалога (FR-APP-03) через `POST /api/dialogs`, ответ содержит `dialog_id` и deep-link `https://t.me/<bot>?start=<dialog_id>`.
- ✅ Экран «Магазин» (FR-APP-04) показывает категории предметов, цену ★XTR, скидку по тарифу, наличие у пользователя.
- ✅ Экран «Покупки» (FR-APP-05) выводит подписки и пакеты (Story/Memory/Creator) с CTA «Скоро» (до этапа 4).
- ✅ Экран «Лимит» (FR-APP-06) показывает остаток дневного лимита и кнопку апгрейда.
- ✅ Seed контента (FR-CONT-01/02/03): персонажи Арина и Вектор, арки, предметы, пример гейта «Приют‑13» (ключ пока только отображается).
- ✅ PWA dev-режим отображает баннер «Mock payments only» (FR-PWA-02 частично).

---

## Основной скоуп

### packages/database
- Расширить Prisma схемы:
  - `characters` (visibility, tags, persona JSON, versioning).
  - `stories`, `story_arcs`, `story_nodes` (минимальная структура с типами узлов и requires).
  - `items` (category, effect JSON, price_xtr, slug).
  - `subscriptions`, `packs`.
  - `dialogs` (status, character_id, story_arc_id, deep_link_token).
- Seed скрипты для персонажей/предметов/арок, сохранённые в `/prisma/seed`.

### packages/story-engine (новый)
- DTO `CharacterSummary`, `StoryArc`, `StoryNode`.
- Функции `listCharacters(filter)`, `getCharacter(id)`, `createDialog(userId, characterId, arcId?)`.
- Модуль пока без LLM/branching, только CRUD и проверка видимости.

### apps/api
- REST endpoints:
  - `GET /api/characters` + query-параметры (search, tags, show_hidden=bool).
  - `GET /api/characters/:id`.
  - `POST /api/dialogs` (проверяет право на видимость персонажа).
  - `GET /api/store/items` (категории + наличие пользователя).
  - `GET /api/store/packs`.
  - `GET /api/limits`.
- Deep-link генерация: `dialog.deepLink = "https://t.me/${BOT_USERNAME}?start=${dialog.startToken}"`.
- Респонсы на RU, соответствуют UI текстам.

### apps/pwa (Mini App UI)
- **Экран Каталога**
  - Сетка карточек, фильтры (chips) + поиск.
  - Плашки «Premium», «Creator-only», «Story Pack».
  - Скелетоны/loader.
- **Карточка персонажа**
  - Детали персонажа, список арок, CTA «Начать диалог».
  - Отображение требований (напр. Story Pack) с disabled CTA.
- **Создание диалога**
  - POST → показать deep link + CTA «Открыть бота».
  - Toast с копированием ссылки для PWA.
- **Магазин / Покупки / Лимит**
  - UI списков + расчёт скидок (без покупки).
  - Бейдж «Требует Creator Pack» и подсказки.
  - Баннер «Оплаты доступны на этапе 4» для dev.
- Состояние загрузки/ошибок, повтор запросов.

### apps/bot (deep-link bootstrap)
- Роутинг `start=<dialog_id>`: проверка существования диалога, приветственное сообщение с именем персонажа.
- Логирование переходов (telemetry).

### Documentation & tooling
- Обновить Postman коллекцию (`Characters`, `Dialogs`, `Store`).
- Добавить сторибуки/скриншоты основных экранов в README Mini App.
- Описать seed контента и как обновлять (scripts).

---

## Implementation Steps

1. **Schema & seed**
   - Дописать Prisma модели + миграции.
   - Реализовать сидинг персонажей, предметов, арок (JSON файлы в `/seed-data`).
2. **Story engine package**
   - CRUD-helpers + фильтрация по тарифу/пакету.
   - Генератор deep-link токена (`uuid.v4`, TTL=60 мин до создания диалога).
3. **API endpoints**
   - Контроллеры characters/store/dialogs.
   - Кеширование каталога (Redis) с инвалидацией по версии персонажа.
4. **PWA/Mini App UI**
   - Экран каталога и карточки.
   - Экран магазина/покупок/лимита.
   - Диалог создания + deeplink handing.
5. **Bot greeting**
   - Обработчик `/start` → приветствие и подсказка.
6. **QA & docs**
   - E2E тест (Playwright) для потока «открыть персонажа → создать диалог».
   - Скриншоты и видео демо для product review.

---

## Verification

1. `GET /api/characters?search=Куратор` возвращает Арину, скрывает creator-only без пакета.
2. `POST /api/dialogs` для персонажа с Story Pack без пакета → `403 story_pack_required`.
3. После успешного `POST /api/dialogs` deep-link открывает бота и показывает приветствие.
4. Экран «Магазин» показывает предметы, наличие отмечено (пример: ключ «Приют‑13» недоступен пока не куплен).
5. Экран лимитов показывает остаток `daily_used`.

---

## Deliverables

- Обновлённая Prisma схема + seed скрипты.
- `packages/story-engine` (CRUD, helper utilities).
- REST API для каталога/диалогов/магазина.
- Mini App UI (catalog, character card, create dialog, store, limit).
- Бот приветствия по deep-link.
- Документация (Postman коллекция, README обновления).
