# Этап 7: PWA режим, безопасность и релиз – Production Ready

**Цель:** довести продукт до production-ready состояния: полноценный PWA режим с mock-платежами, строгая безопасность (initData, secrets, ролевая модель), обработка ошибок, финальные QA-циклы и запуск.

**Время:** 6–7 дней

**Зависит от:** Этапы 1–6

---

## Acceptance Criteria

- ✅ PWA build (vite) с manifest, service worker, оффлайн splash, баннер «Реальные платежи доступны только в Telegram» на всех экранах (FR-PWA-01/02/03).
- ✅ PWA mock-purchase flow полностью повторяет выдачу прав/предметов (source=`pwa-mock`) (FR-PWA-03).
- ✅ Безопасность: initData проверяется сервером (уже сделано) + HSTS, CSP, Secrets management, roll-out чек-лист (FR-SEC-01/02).
- ✅ Ошибки LLM/сетевые отображаются корректно (FR-ERR-01) и имеют retry очередь/DLQ ручки.
- ✅ Модерация и фильтры интегрированы в прод пайплайн, логируются без PII (FR-MOD-01, FR-SEC-02).
- ✅ Pen-test & load-test чек-листы пройдены, результаты задокументированы.
- ✅ Launch runbook и SLA/SLO утверждены, алерты проверены.

---

## Основной скоуп

### PWA build
- Manifest: `name`, `short_name`, RU локализация, иконки, theme/background color.
- Service worker (Workbox): cache shell, stale-while-revalidate для API (dev), skip waiting.
- `APP_MODE` switch (telegram|miniappprod|pwa-dev) влияет на платежи, баннеры и feature flags.
- Mock payments UI: после checkout кнопка «Подтвердить оплату», выдаёт права (через Stage 4 API).
- QA: Lighthouse PWA score ≥ 95.

### Security hardening
- CSP headers: ограничить источники (self, telegram widgets).
- HTTPS-only cookies, sameSite=lax/strict.
- Rotate secrets docs + script.
- Vault/Sealed secrets integration (k8s/Render) для prod.
- Background job для очистки лишних PII (FR-SEC-02 journaling).

### Error handling & resiliency
- Стандартизовать RU error toasts/screens (Mini App/PWA) с CTA «Повторить» (FR-ERR-01).
- DLQ viewer + retry кнопка в admin.
- Chaos test: отключить LLM → убедиться, что fallback сообщение работает.

### QA / Load / Launch
- Integration tests suite (Playwright) covering end-to-end: каталог → покупка → бот → гейт.
- K6/Locust нагрузочный тест (LLM mock) до N RPS, метрики фиксируются.
- Pen-test чеклист (OWASP MASVS для Mini App/PWA).
- Launch checklist + rollback plan (Git tag, feature flag gating).

### Documentation & handover
- Обновлённые инструкции по локальному запуску PWA dev / mock payments.
- Security report, threat model.
- SLA/SLO документ (uptime, latency, outage playbook).

---

## Implementation Steps

1. **PWA enhancements**
   - Добавить manifest, SW, icons, offline fallback, APP_MODE switch.
   - Баннер предупреждения (component) выводится во всех экранах PWA dev.
2. **Mock payments UX**
   - UI шаг «Оплату подтвердил» → вызывает `/api/store/mock-payment`.
   - Обновить inventory view и журнал покупок.
3. **Security hardening**
   - Включить helmet middleware с CSP/HSTS.
   - Secrets rotation guide + scripts.
   - Проверить отсутствие PII в логах (masking).
4. **Error/Retry**
   - Унифицированные error components, повтор запроса.
   - DLQ viewer в admin (использует очередь из этапа 3).
5. **Testing & launch**
   - Lighthouse, K6, pen-test чеклисты.
   - Финальный dry-run запуска (Infra + bot webhook + payments).
   - Обновить README + runbooks.

---

## Verification

1. PWA можно установить на десктоп/мобильный, баннер предупреждает о mock-платежах.
2. Offline (airplane mode) показывает fallback экран, при восстановлении синхронизируется.
3. CSP/HSTS отражены в ответах (`curl -I`), cookies secure.
4. DLQ job можно перезапустить из admin, ошибки отображаются в RU.
5. Load test отчёт подтверждает SLA, launch checklist заполнен и подписан.

---

## Deliverables

- PWA manifest/service worker, mock-платёж UX, APP_MODE переключатель.
- Security hardening (headers, secrets, threat model).
- Error handling компоненты + DLQ tooling.
- QA отчёты (Lighthouse, нагрузочное, pen-test) и launch runbook.
