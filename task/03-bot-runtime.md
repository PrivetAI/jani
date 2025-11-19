# Этап 3: Bot & LLM Runtime – Чат, контекст и стриминг

**Цель:** запустить полноценный чат-цикл: Telegram бот получает сообщения, проверяет лимиты/права, ставит задания в очередь, worker собирает контекст (persona + story + summary + 4 пары), вызывает LLM через SSE, бот стримит ответы и управляет статусами диалога.

**Время:** 7–8 дней

**Зависит от:** Этапы 1–2 (auth, каталоги, диалоги)

---

## Acceptance Criteria

- ✅ Бот (FR-BOT-01/02/03/04/05) принимает сообщения через webhook, проверяет лимит, показывает типинг и стримит ответ (не чаще 1/с).
- ✅ Очередь BullMQ координирует задачи: `inbound-message` → `llm-response` → `send`.
- ✅ Контекст промпта соответствует FR-DLG-01: persona → story → summary → последние 4 пары → (факты TBD).
- ✅ Summary пересчитывается после каждого ответа (FR-DLG-02) и хранится в `dialogs.summary`.
- ✅ SSE/OpenRouter клиент в `packages/llm` поддерживает поток токенов, graceful cancel, retry (FR-GEN-06).
- ✅ Action envelope (FR-DLG-04) распарсен и валидируется JSON-schema; при ошибке выводится текст без действий.
- ✅ Логирование (structured) webhook → worker → OpenRouter (FR-OBS-02 частично).
- ✅ Минимальный moderation filter (regex) применяется к входу/выходу (FR-MOD-01 частично).

---

## Основной скоуп

### packages/telegram
- Консерн: webhook verifier, `sendMessage`, `editMessageText`, `answerCallbackQuery`.
- helper `TypingStream` для управления статусом «печатает».

### packages/llm
- Клиент OpenRouter (configurable model), SSE streaming.
- Метод `generateResponse(context, options)` возвращает AsyncIterable токенов.
- Backoff/429 handling, cancellation token.

### packages/story-engine
- Функция `buildPrompt(dialogId)` → Persona + Story directives + Summary + last 4 pairs (messages join from DB).
- Hook `updateSummary(dialogId, responseText)` → вызывает OpenAI gpt-3.5/cheap via worker.

### apps/api
- Endpoint `POST /api/bot/webhook` (Telegram) → валидирует сигнатуру, ставит `inbound-message` в очередь.
- Endpoint `POST /api/dialogs/:id/pause` / `resume` (для будущих фич).

### apps/bot
- Команды:
  - `/start <dialog_id>` — привязка.
  - `/limit` — показывает остаток лимита.
  - `/help` — подсказки.
- Обработчик очереди:
  1. Получить сообщение → проверка лимита (`QuotaService`).
  2. Поставить `llm-response`.
  3. Стримить результат в чат (editMessageText).
  4. Записать сообщение/ответ в `messages`.
  5. Триггер пересчёта summary.

### apps/worker
- BullMQ workers:
  - `inbound-message` — подготовка payload для LLM.
  - `llm-response` — вызов `packages/llm`, эмуляция SSE, парсинг action envelope.
  - `summary-refresh` — async job на обновление summary.
- Error handling → DLQ после 3 попыток (FR-ERR-01).

### packages/memory (foundation)
- Пока только структура для future (Stage 5), но хранит summary & message serialization.

---

## Implementation Steps

1. **Queue infrastructure**
   - Создать `packages/queue` с BullMQ instance, shared job definitions.
   - Конфиги Redis/Backoff в `.env`.
2. **Telegram bot webhook**
   - Настроить Express handler, проверить signature с `TELEGRAM_BOT_TOKEN`.
   - Отвечать 200 мгновенно, job в очередь.
3. **LLM client & streaming**
   - Реализовать SSE клиент + throttle 1/с для editMessage.
   - Имитация «печатает…» через `editMessageText`.
4. **Prompt builder & summary**
   - `buildPrompt` собирает контекст.
   - Summary хранится в `dialogs.summary`, обновляется worker'ом.
5. **Action envelope**
   - JSON schema + validator (AJV).
   - Пока обрабатываем только `user_visible_text` (действия будут на этапе 5), но логируем envelope.
6. **Moderation & errors**
   - Простые регэкспы / стоп-слова → если срабатывает, отправить RU-предупреждение.
   - Любая ошибка → RU-сообщение «Что-то сломалось, нажми Повторить» + inline button (FR-ERR-01).
7. **Testing**
   - Интеграционный тест `bot -> worker -> llm (mock) -> response`.
   - Локальный эмулятор Telegram webhook (npm script).

---

## Verification

1. Отправка сообщения в бота создаёт job в Redis (видно через Bull Board).
2. Ответ приходит стримом (editMessageText каждые ~1с), без превышения лимита.
3. В БД `summary` обновляется, `messages` содержит последние 4 пары.
4. При ошибке LLM пользователь получает RU-ошибку с кнопкой «Повторить».
5. Action envelope JSON с ошибкой → лог WARN, текст показан без действий.

---

## Deliverables

- `packages/telegram`, `packages/llm`, `packages/queue`, обновления `packages/story-engine`.
- Рабочий Telegram бот с webhook и стримингом ответов.
- Worker, собирающий контекст, записывающий summary.
- Документация по запуску bot webhook, troubleshooting SSE, скринкаст чата.
