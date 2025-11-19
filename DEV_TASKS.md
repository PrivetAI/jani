# Roadmap: Jani Mini App + Bot

| Этап | Название | Основной результат | Ссылка |
| --- | --- | --- | --- |
| 0 | Project Setup | Turborepo, Docker, базовые сервисы | `task/00-setup.md` |
| 1 | Auth & User Management | Telegram auth, роли, лимиты, base API | `task/01-auth.md` |
| 2 | Mini App Core | Каталог, карточки, создание диалогов, магазин UI | `task/02-mini-app.md` |
| 3 | Bot & LLM Runtime | Очереди, промпт-билдинг, стриминг ответов | `task/03-bot-runtime.md` |
| 4 | Commerce & Monetization | Подписки/пакеты/предметы, Telegram Stars оплаты | `task/04-commerce.md` |
| 5 | Story & Memory Engine | Гейты, эффекты предметов, долговременная память | `task/05-story-memory.md` |
| 6 | Admin & Operations | Админка, возвраты, наблюдаемость, модерация | `task/06-admin-ops.md` |
| 7 | PWA & Release | PWA режим, безопасность, error handling, launch | `task/07-pwa-release.md` |

## Принципы модульности

- **apps/** – независимые поверхности (api, bot, worker, pwa, admin), каждая команда может выпускать свой пакет.
- **packages/** – изолированные домены: `auth`, `story-engine`, `store`, `payments`, `memory`, `telegram`, `llm`, `shared`.
- **Infra** – Docker Compose (PostgreSQL, Redis) + Observability (Prometheus/Grafana/OTel).
- Каждый этап завершает вертикальный инкремент и оставляет систему рабочей в проде.

## Legend

- FR-* ссылки указывают на требования из `task/spec.md`.
- Примерная длительность дана для команды 4–5 человек (full-time).
- Зависимости: каждый новый этап полагается на завершение предыдущих.
