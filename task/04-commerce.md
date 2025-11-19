# Этап 4: Commerce & Monetization – Подписки, пакеты, магазин, оплаты

**Цель:** реализовать монетизацию: подписки (Free/Plus/Pro/Ultra), пакеты (Story/Memory/Creator), магазин предметов с инвентарём, интеграция Telegram Stars (XTR) и mock-платежи для PWA/PWA-dev.

**Время:** 8–9 дней

**Зависит от:** Этапы 1–3 (auth, UI, чат)

---

## Acceptance Criteria

- ✅ Подписки, пакеты, предметы описаны в БД и отображаются в Mini App/PWA (FR-GEN-03, FR-APP-04/05).
- ✅ Пользователь может инициировать оплату Stars, получить инвойс, после успешного `paid`-callback права/предметы активируются мгновенно (FR-GEN-03, FR-SHOP-03).
- ✅ Подписки снимают лимит, дают скидку (Plus 5%, Pro 10%, Ultra 15%), разрешают premium/creator контент (FR-APP-01 критерии).
- ✅ Покупка Story/Memory/Creator Packs выдает соответствующие права (FR-APP-01/02, FR-DLG-01, FR-8/9).
- ✅ Магазин предметов пополняет инвентарь, расходуемые предметы уменьшают qty с идемпотентностью (FR-SHOP-03).
- ✅ Bot/offers: при недостатке права отправляется OFFER_ITEM (inline кнопка «Купить») (FR-SHOP-04, FR-DLG-04).
- ✅ Mock-платежи для PWA-dev (FR-PWA-03) сохраняют `source=pwa-mock`, баннер предупреждения видим.
- ✅ Refund API готово к использованию (будет доступно в админке на этапе 6).

---

## Основной скоуп

### packages/payments
- Telegram Stars клиент:
  - Создание инвойса (`createInvoiceLink`).
  - Хук `onPayment` (webhook).
  - Проверка `payload` + `currency=XTR`.
- Mock payments provider для PWA (in-memory + dev DB flag).
- Payment orchestrator:
  - `PurchaseOrder` (subscription|pack|item).
  - Статусы: pending → paid → fulfilled → failed.
  - Идемпотентность по `payload_id`.

### packages/store
- Управление правами/инвентарём:
  - `grantEntitlement(userId, type, metadata)`.
  - `grantItem(userId, itemId, qty)`.
  - `consumeItem(userId, itemId, qty)`.
  - Расчёт скидки по тарифу.
- DSL для эффектов (memory.boost, llm.fastlane, gate.key...) — пока только сохранение (активация в этапе 5).

### packages/story-engine
- Проверка прав для персонажей/арок/узлов, интеграция с entitlements и предметами.
- Helper `getMissingRequirements(dialogId)` → используется ботом для формирования оффера.

### apps/api
- Эндпоинты:
  - `POST /api/store/checkout` → создаёт заказ + invoice link.
  - `POST /api/store/mock-payment` (dev) → ручное подтверждение.
  - Webhook `/api/payments/telegram`.
  - `GET /api/store/inventory`.
  - `POST /api/refunds` (admin only, без UI пока).
- ACID-транзакции (Prisma) при выдаче прав/предметов.

### apps/pwa (Mini App UI)
- Магазин → кнопка «Оплатить» вызывает `checkout`.
- После успешной покупки UI обновляет наличие, показывает toast.
- Экран «Покупки» → отображать активные подписки/пакеты, даты истечения.
- Экран предметов → показать qty/active effects.
- PWA dev → кнопка «Simulate mock payment» после checkout.

### apps/bot
- Обработка `OFFER_ITEM` из action envelope: inline-кнопка «Купить».
- Если пользователь без подписки достиг лимита — кнопка «Оформить подписку» (deep link → store).
- После `CONSUME_ITEM` (будет в этапе 5) инвентарь обновляется (закладка).

### apps/worker
- Джоб `applyOrderFulfillment`.
- Очередь `payment-events` для финализации выдачи и push уведомлений.

---

## Implementation Steps

1. **Data layer**
   - Добавить таблицы `orders`, `payments`, `inventory`, `rights_history`.
   - Написать миграции и seed тарифов/пакетов/цен.
2. **Payments integration**
   - Настроить Telegram BotFather → получить `PAYMENTS_PROVIDER_TOKEN`.
   - Реализовать `/api/payments/telegram` webhook (signature, idempotency).
3. **Store services**
   - Создать `packages/store` с методами grant/consume.
   - Подготовить эффекты (JSON) + schema.
4. **API & UI**
   - Checkout endpoints + UI потоки.
   - Inventory endpoint + UI badges.
   - Mock payment flow.
5. **Bot offers**
   - При недоступном узле/персонаже → бот предлагает покупку (inline keyboard → checkout link).
6. **Testing & docs**
   - Интеграционный тест оплаты (mock + реальный в sandBox).
   - Тесты идемпотентности и возврата (refund script).
   - Обновить Postman (Payments).

---

## Verification

1. Покупка Story Pack через Stars → мгновенный доступ к заблокированной арке.
2. Покупка Memory Pack → отображается как активная, даёт скидку, запись в `user_entitlements`.
3. Покупка предмета «plot-key-asylum13» → `inventory` qty=1, UI отмечает «Есть».
4. В PWA-dev mock-payment (без Stars) помечает `source=pwa-mock`, баннер предупреждения отображается.
5. Refund API (manual call) снимает право/предмет не дольше 60 сек (worker job).

---

## Deliverables

- `packages/payments` и `packages/store` (unit-tests).
- Telegram payments webhook и checkout endpoints.
- Mini App UI с реальными оплатами + mock режим в dev.
- Обновлённый бот (предложения покупки).
- Документация по настройке платежей/тестированию, диаграмма потоков.
