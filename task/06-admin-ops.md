# Этап 6: Admin Panel & Operations – Контент, цены, возвраты, наблюдаемость

**Цель:** предоставить сотрудникам админку для управления персонажами/историями/предметами/ценами, проводить возвраты, видеть отчёты и телеметрию, а также усилить модерацию и аудит.

**Время:** 8–10 дней

**Зависит от:** Этапы 1–5

---

## Acceptance Criteria

- ✅ Админка (`apps/admin`) покрывает CRUD персонажей, историй, предметов, пакетов, подписок (FR-ADM-01..04).
- ✅ Платежи/возвраты отображаются, доступна кнопка `Refund` → автоматическая ревокация прав/предметов ≤60 сек (FR-ADM-05).
- ✅ Отчёты и метрики: токены/стоимость, ошибки, p95 латентность, 429, hit-rate кэша (FR-ADM-06, FR-OBS-01).
- ✅ Трейсы webhook → очередь → оркестратор → LLM → бот доступны в APM (FR-OBS-02).
- ✅ Аудит изменений персонажей/цен/контента (`audit_log` + UI) (FR-OBS-03).
- ✅ Улучшенные фильтры модерации (FR-MOD-01): словари, список стоп-фраз, возможность флага «review».
- ✅ Ошибки LLM/очереди отображаются в Ops dashboard, есть DLQ viewer (FR-ERR-01 расширено).

---

## Основной скоуп

### packages/admin-api (новый слой)
- GraphQL или REST интерфейс с RBAC (role=admin/creator).
- CRUD сервисы: characters, stories, items, packs, pricing tiers.
- Версионирование персонажей (draft/live), публикация, preview.

### apps/admin
- React + MUI/Ant Design панели:
  - Dashboard (метрики, лимиты).
  - Characters editor (tabs: base info, persona JSON, story arcs tree, gating).
  - Items/Packs/Subs editors (формы + JSON effect editor).
  - Payments/Refunds list.
  - Reports (token usage, cost per user).
  - Audit log viewer.
- Creator role: ограниченный UI (доступ только к своим персонажам).

### packages/database
- Таблицы: `audit_logs`, `story_versions`, `pricing_history`, `moderation_flags`.
- View/Materialized view для отчётов (tokens usage aggregated).

### Observability stack
- Prometheus/Grafana или OpenTelemetry exporter.
- Metrics: `bot_inbound_rps`, `worker_latency_ms`, `llm_tokens`, `queue_depth`.
- Tracing: instrument API, bot, worker.
- Alert rules (YAML/docs) для основных ошибок.

### Moderation
- Расширить фильтры: конфиг через admin (regex + шаблоны).
- UI для просмотра flagged messages, возможность пометить/разблокировать.

### Refunds/Support
- API `POST /api/admin/refunds/:orderId`.
- Worker job `processRefund` → revoke rights, log audit.
- Admin UI кнопка Refund + обязательное поле причины.

### Documentation
- Runbook «Как откатить персонажа», «Как сделать refund», «Как читать метрики».
- Diagrams: content publishing workflow, observability pipeline.

---

## Implementation Steps

1. **Schema & audit**
   - Добавить таблицы `audit_logs`, `story_versions`, реплики для отчётов.
2. **Admin backend**
   - Выделить `apps/api` namespace `/admin/*`, middleware `requireRole('admin')`.
   - CRUD endpoints/GraphQL resolvers.
3. **Admin UI**
   - Scaffold React app, применить компонентную библиотеку.
   - Реализовать страницы и формы с валидацией (JSON editor).
4. **Observability**
   - Подключить OpenTelemetry SDK, экспорт в Jaeger/OTel collector.
   - Настроить Prometheus metrics + Grafana dashboard.
5. **Moderation tools**
   - Конфиг стоп-слов через admin.
   - Экран flagged messages.
6. **Refund flow**
   - API + worker-job revoke rights.
   - UI кнопка Refund, подтверждение и логирование.
7. **Docs & training**
   - Руководства по работе с админкой и мониторингом.

---

## Verification

1. Админ может создать/редактировать персонажа, опубликовать новую версию → Mini App видит обновления сразу.
2. Refund по заказу Story Pack снимает право в течение ≤60 сек, запись появляется в audit log.
3. Grafana дашборд показывает rps/latency/429, оповещение срабатывает при превышении.
4. Отмеченное сообщение в модерации появляется в интерфейсе, можно снять флаг.
5. Creator роль видит только свои персонажи, не видит цены/платежи.

---

## Deliverables

- `apps/admin` (UI) + `/admin` backend API.
- Набор дашбордов/алертов, Otel/Prometheus конфигурации.
- Модерация UI и API.
- Refund tooling и runbooks.
- Обновлённая документация (админ, мониторинг, модерация).
