# Этап 5: Story Engine, Память и предметы – сюжетные гейты и эффекты

**Цель:** завершить логику сюжетных веток, долговременную память, применение предметов/эффектов и action envelope с OFFER/CONSUME/SET_FLAG.

**Время:** 7–8 дней

**Зависит от:** Этапы 2–4 (контент, чат, магазин)

---

## Acceptance Criteria

- ✅ Story engine поддерживает гейты узлов (требует предмет/флаг/пакет) и динамические ветки (FR-APP-01 критерии, FR-SHOP-04).
- ✅ Память: summary + top‑k фактов из долговременной памяти (FR-GEN-05, FR-DLG-01). Memory Pack или тариф ≥ Plus активирует память.
- ✅ Эффекты предметов (FR-SHOP-02/05): `memory.boost`, `llm.fastlane`, `gate.key`, `style.mood` применяются с TTL (по сообщениям или по времени).
- ✅ Action envelope (FR-DLG-04) теперь может инициировать OFFER_ITEM, CONSUME_ITEM, SET_FLAG; неверный JSON → игнор действий.
- ✅ Узел «Приют‑13» (FR-CONT-03) проверяет ключ, предлагает покупку, после покупки продолжает сцену.
- ✅ Логика `summary` учитывает сжатие при нехватке токенов (FR-DLG-03).
- ✅ Модуль семантической памяти хранит факты в pgvector, доступен через `memory.boost`.

---

## Основной скоуп

### packages/memory
- Модель `memory_facts` (dialog_id, embedding vector, ttl_messages, ttl_hours, source_item).
- Методы:
  - `upsertFact(dialogId, text, weight, ttl)` (вызывается Worker'ом).
  - `fetchFacts(dialogId, topK)` → возвращает список с expiration.
- Интеграция с pgvector + OpenAI embeddings (или локальная модель).
- TTL менеджер (при отправке сообщений уменьшает `ttl_messages`).

### packages/story-engine
- DSL описания узлов: `type=dialog`, `requires: { item?, flag?, pack? }`, `effects`.
- Резолвер `getNextNode(dialogId, userState)` → возвращает следующую сцену или `MissingRequirement`.
- Поддержка `StoryPack` прав и Creator-only видимости.
- Управление флагами (`dialog_flags` таблица).

### packages/store
- Обработка эффектов:
  - `memory.boost` → временно повышает `topK`.
  - `llm.fastlane` → переключает модель/температуру для N сообщений.
  - `style.mood` → добавляет tone hint в промпт.
  - `gate.key` → снимает блокировку узла.
- Трекинг TTL и автоматическое удаление после истечения.

### apps/worker
- Расширение pipeline:
  - После генерации ответа → обновить память (top facts).
  - Перед промптом → применить эффекты и собрать контекст.
  - Action envelope обработка: OFFER_ITEM (push), CONSUME_ITEM (списать), SET_FLAG (обновить `dialog_flags`).
- Детальная телеметрия: какие факты/эффекты попали в промпт.

### apps/bot
- Inline кнопка «Купить предмет» → checkout link.
- После покупки ключа — бот автоматически продолжает сцену (разблокирует).
- UI сообщения с описанием активных эффектов (например, «Кристалл памяти активен ещё 8 сообщений»).

### apps/pwa (Mini App)
- Экран диалога (read-only) показывает текущую сцену/требования (если недоступно).
- UI состояния inventory: предметы с TTL, кнопка «использовать» (вызывает API, бот получает событие CONSUME_ITEM).

---

## Implementation Steps

1. **Schema updates**
   - Добавить таблицы `dialog_flags`, `memory_facts`, `user_item_effects`.
   - Миграции TTL и индексов pgvector.
2. **Memory service**
   - Интегрировать embeddings провайдер, конфиги (`MEMORY_EMBEDDING_MODEL`).
   - Тесты для `fetchFacts`/`upsertFact`.
3. **Story engine upgrades**
   - DSL для узлов + резолвер.
   - Пример узла с `requires.gate.key`.
4. **Effect processor**
   - Hook на выдачу предмета → активировать эффект.
   - При каждом message → проверять TTL, уменьшать счётчики.
5. **Action envelope**
   - Поддержать OFFER/CONSUME/SET_FLAG (применяется после валидации).
   - Логи действий для аудита.
6. **Client features**
   - Mini App дает возможность активировать предмет (API call -> bot).
   - Бот отображает состояние гейта/эффектов.
7. **Testing & QA**
   - Интеграционный тест: купить ключ «Приют‑13» → пройти узел.
   - Тест Memory Pack: top-k увеличивается на TTL сообщений.
   - Snapshot логов контекста (persona → story → summary → 4 пары → факты).

---

## Verification

1. Без `plot-key-asylum13` узел закрыт, бот отправляет OFFER_ITEM с deep link.
2. После покупки ключа бот автоматически продолжает сцену (без повторного сообщения).
3. `memory-crystal` добавляет +3 факта на 10 сообщений, затем эффект исчезает.
4. Action envelope с CONSUME_ITEM уменьшает qty, TTL эффектов обновляется.
5. Логи сборки контекста показывают правильный порядок и ограничения по токенам.

---

## Deliverables

- Обновлённые `packages/story-engine`, `packages/memory`, `packages/store`.
- Новые модели БД, миграции и сидинг гейтов.
- Worker + Bot с action envelope и эффектами.
- Mini App UI для управления предметами и отображения требований.
- QA отчёт по сценарию «Приют‑13» и Memory Pack.
