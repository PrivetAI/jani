# API Specification: Mini App Chat

Спецификация новых и изменённых API endpoints для функционала чата в Mini App.

---

## 🔑 Авторизация

Все запросы к API должны содержать Telegram WebApp `initData` в заголовке:

```http
Authorization: tma <initDataString>
```

Backend валидирует `initData` и извлекает `telegram_user_id`.

---

## 👤 User Profile API

### Обновление профиля

```http
PATCH /api/users/profile
Content-Type: application/json
Authorization: tma <initDataString>

{
  "display_name": "Алексей",
  "gender": "male",
  "language": "ru"
}
```

**Response:**
```json
{
  "id": 123,
  "telegram_user_id": 456789,
  "username": "alex_user",
  "display_name": "Алексей",
  "gender": "male",
  "language": "ru",
  "is_adult_confirmed": true,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Подтверждение возраста 18+

```http
POST /api/users/confirm-adult
Content-Type: application/json
Authorization: tma <initDataString>

{
  "confirmed": true
}
```

**Response:**
```json
{
  "success": true,
  "is_adult_confirmed": true
}
```

---

## 🎭 Characters API (расширенный)

### Список персонажей с фильтрами

```http
GET /api/characters?genre=romance&rating=sfw&sort=popular&tags=anime,fantasy
Authorization: tma <initDataString>
```

**Query Parameters:**
- `genre` - жанр (romance, anime, fantasy, mentor)
- `rating` - контент (sfw, nsfw)
- `access_type` - тип доступа (free, premium)
- `tags` - теги через запятую
- `sort` - сортировка (popular, new, recommended)
- `limit` - количество (default: 50)
- `offset` - смещение для пагинации

**Response:**
```json
{
  "characters": [
    {
      "id": 1,
      "name": "Кира",
      "description_long": "Милая девушка из аниме...",
      "avatar_url": "/characters/kira.jpg",
      "access_type": "free",
      "genre": "anime",
      "content_rating": "sfw",
      "tags": ["anime", "romance", "friendly"],
      "popularity_score": 1250,
      "messages_count": 5000,
      "is_active": true
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

### Поиск персонажей

```http
GET /api/characters/search?q=аниме+девушка
Authorization: tma <initDataString>
```

**Response:** аналогично списку персонажей

### Список тегов

```http
GET /api/tags
```

**Response:**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "anime",
      "category": "genre",
      "usage_count": 25
    },
    {
      "id": 2,
      "name": "romance",
      "category": "theme",
      "usage_count": 40
    }
  ]
}
```

### Теги по категории

```http
GET /api/tags/genre
```

**Response:** список тегов для указанной категории

---

## 💬 Chat API (новый)

### Получение истории сообщений

```http
GET /api/chats/:characterId/messages?limit=50&offset=0
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "messages": [
    {
      "id": 123,
      "character_id": 1,
      "role": "user",
      "message_text": "Привет! Как дела?",
      "created_at": "2025-01-01T12:00:00Z",
      "tokens_used": null,
      "model_used": null
    },
    {
      "id": 124,
      "character_id": 1,
      "role": "assistant",
      "message_text": "Привет! Всё отлично, спасибо!",
      "created_at": "2025-01-01T12:00:05Z",
      "tokens_used": 25,
      "model_used": "gpt-3.5-turbo",
      "is_regenerated": false
    }
  ],
  "total": 142,
  "has_more": true
}
```

### Отправка сообщения

```http
POST /api/chats/:characterId/messages
Content-Type: application/json
Authorization: tma <initDataString>

{
  "message": "Привет! Как дела?"
}
```

**Response:**
```json
{
  "user_message": {
    "id": 125,
    "role": "user",
    "message_text": "Привет! Как дела?",
    "created_at": "2025-01-01T12:05:00Z"
  },
  "assistant_message": {
    "id": 126,
    "role": "assistant",
    "message_text": "Привет! Отлично, а у тебя?",
    "created_at": "2025-01-01T12:05:03Z",
    "tokens_used": 28,
    "model_used": "gpt-3.5-turbo"
  },
  "limits": {
    "remaining": 48,
    "total": 50,
    "resets_at": "2025-01-02T00:00:00Z"
  }
}
```

**Errors:**
```json
// Лимит исчерпан
{
  "error": "daily_limit_exceeded",
  "message": "Дневной лимит 50 сообщений исчерпан",
  "limits": {
    "remaining": 0,
    "total": 50,
    "resets_at": "2025-01-02T00:00:00Z"
  }
}

// Нет доступа к премиум персонажу
{
  "error": "premium_required",
  "message": "Для доступа к этому персонажу нужна подписка"
}
```

### Регенерация последнего ответа

```http
POST /api/chats/:characterId/regenerate
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "message": {
    "id": 127,
    "role": "assistant",
    "message_text": "Привет! У меня всё замечательно!",
    "created_at": "2025-01-01T12:06:00Z",
    "is_regenerated": true
  }
}
```

### Удаление сообщения

```http
DELETE /api/chats/:characterId/messages/:messageId
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deleted_count": 1
}
```

### Новая сцена (soft reset)

Удаляет последние сообщения, сохраняя долговременную память.

```http
POST /api/chats/:characterId/new-scene
Content-Type: application/json
Authorization: tma <initDataString>

{
  "messages_to_keep": 0
}
```

**Response:**
```json
{
  "success": true,
  "deleted_messages_count": 15,
  "memories_preserved": 8
}
```

### Полный сброс чата

Удаляет всю историю и память для персонажа.

```http
POST /api/chats/:characterId/reset
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deleted_messages_count": 142,
  "deleted_memories_count": 8
}
```

---

## 🎮 Chat Session API

### Получение сессии

```http
GET /api/chats/:characterId/session
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "id": 42,
  "user_id": 123,
  "character_id": 1,
  "relationship_type": "friend",
  "mood_preference": "sweet",
  "last_message_at": "2025-01-01T12:00:00Z",
  "messages_count": 142,
  "created_at": "2024-12-01T10:00:00Z"
}
```

### Обновление настроек сессии

```http
PATCH /api/chats/:characterId/session
Content-Type: application/json
Authorization: tma <initDataString>

{
  "relationship_type": "partner",
  "mood_preference": "playful"
}
```

**Allowed values:**
- `relationship_type`: neutral, friend, partner, colleague, mentor
- `mood_preference`: neutral, sweet, sarcastic, formal, playful

**Response:** обновлённая сессия

---

## 🧠 Memory API

### Получение всех фактов о пользователе

```http
GET /api/chats/:characterId/memories
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "memories": [
    {
      "id": 1,
      "memory_type": "fact",
      "content": "Работает программистом",
      "importance": 8,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": 2,
      "memory_type": "preference",
      "content": "Предпочитает формальный стиль общения",
      "importance": 6,
      "created_at": "2025-01-01T11:00:00Z"
    },
    {
      "id": 3,
      "memory_type": "emotion",
      "content": "Часто грустит по понедельникам",
      "importance": 5,
      "created_at": "2025-01-01T12:00:00Z"
    }
  ],
  "total": 8
}
```

**Memory types:**
- `fact` - объективный факт о пользователе
- `preference` - предпочтение пользователя
- `emotion` - эмоциональное состояние
- `relationship` - характер отношений

### Добавление факта

```http
POST /api/chats/:characterId/memories
Content-Type: application/json
Authorization: tma <initDataString>

{
  "content": "Увлекается аниме и мангой",
  "memory_type": "preference",
  "importance": 7
}
```

**Response:**
```json
{
  "id": 9,
  "memory_type": "preference",
  "content": "Увлекается аниме и мангой",
  "importance": 7,
  "created_at": "2025-01-01T13:00:00Z"
}
```

### Удаление конкретного факта

```http
DELETE /api/chats/:characterId/memories/:memoryId
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deleted_id": 9
}
```

### Удаление всех фактов

```http
DELETE /api/chats/:characterId/memories
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deleted_count": 8
}
```

### Забыть недавние сообщения

Удаляет последние N сообщений из истории.

```http
POST /api/chats/:characterId/forget-recent
Content-Type: application/json
Authorization: tma <initDataString>

{
  "count": 10
}
```

**Response:**
```json
{
  "success": true,
  "deleted_messages_count": 10
}
```

---

## 📊 Limits API

### Проверка лимитов

```http
GET /api/users/limits
Authorization: tma <initDataString>
```

**Response:**
```json
{
  "has_subscription": false,
  "messages_limit": {
    "total": 50,
    "used": 23,
    "remaining": 27,
    "resets_at": "2025-01-02T00:00:00Z"
  },
  "subscription": null
}
```

**With subscription:**
```json
{
  "has_subscription": true,
  "messages_limit": {
    "total": -1,
    "used": 142,
    "remaining": -1,
    "resets_at": null
  },
  "subscription": {
    "status": "active",
    "start_at": "2025-01-01T00:00:00Z",
    "end_at": "2025-01-31T23:59:59Z"
  }
}
```

---

## 🔌 WebSocket API

### Подключение

```
WS /api/ws/chat/:characterId
Query params: ?initData=<tmaInitDataString>
```

### События от сервера

#### message.new
Новое сообщение добавлено в чат.

```json
{
  "event": "message.new",
  "data": {
    "id": 128,
    "role": "assistant",
    "message_text": "Привет!",
    "created_at": "2025-01-01T13:00:00Z"
  }
}
```

#### message.typing
Персонаж печатает ответ.

```json
{
  "event": "message.typing",
  "data": {
    "character_id": 1,
    "is_typing": true
  }
}
```

#### message.complete
Генерация ответа завершена.

```json
{
  "event": "message.complete",
  "data": {
    "message_id": 128,
    "tokens_used": 35
  }
}
```

#### error
Произошла ошибка.

```json
{
  "event": "error",
  "data": {
    "code": "daily_limit_exceeded",
    "message": "Дневной лимит исчерпан"
  }
}
```

### События от клиента

#### send_message
Отправка сообщения.

```json
{
  "event": "send_message",
  "data": {
    "message": "Привет! Как дела?"
  }
}
```

---

## 📝 Коды ошибок

| Код | Описание | HTTP Status |
|-----|----------|-------------|
| `unauthorized` | Невалидный initData | 401 |
| `character_not_found` | Персонаж не найден | 404 |
| `premium_required` | Нужна подписка для доступа | 403 |
| `daily_limit_exceeded` | Лимит сообщений исчерпан | 429 |
| `invalid_input` | Невалидные данные | 400 |
| `llm_error` | Ошибка LLM API | 502 |
| `rate_limit` | Слишком много запросов | 429 |

---

## 🧪 Примеры использования

### Типичный флоу чата

```typescript
// 1. Получить историю сообщений
const history = await fetch('/api/chats/1/messages?limit=20', {
  headers: { Authorization: `tma ${window.Telegram.WebApp.initData}` }
});

// 2. Открыть WebSocket соединение
const ws = new WebSocket(
  `wss://api.example.com/api/ws/chat/1?initData=${window.Telegram.WebApp.initData}`
);

ws.onmessage = (event) => {
  const { event: eventType, data } = JSON.parse(event.data);
  
  if (eventType === 'message.new') {
    appendMessage(data);
  } else if (eventType === 'message.typing') {
    showTypingIndicator(data.is_typing);
  }
};

// 3. Отправить сообщение
ws.send(JSON.stringify({
  event: 'send_message',
  data: { message: 'Привет!' }
}));

// 4. Проверить лимиты
const limits = await fetch('/api/users/limits', {
  headers: { Authorization: `tma ${window.Telegram.WebApp.initData}` }
});
```

### Управление памятью

```typescript
// Получить все факты
const memories = await fetch('/api/chats/1/memories', {
  headers: { Authorization: `tma ${initData}` }
});

// Удалить конкретный факт
await fetch('/api/chats/1/memories/5', {
  method: 'DELETE',
  headers: { Authorization: `tma ${initData}` }
});

// Забыть всё
await fetch('/api/chats/1/memories', {
  method: 'DELETE',
  headers: { Authorization: `tma ${initData}` }
});

// Забыть последние 5 сообщений
await fetch('/api/chats/1/forget-recent', {
  method: 'POST',
  headers: { 
    Authorization: `tma ${initData}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ count: 5 })
});
```

### Изменение настроек сессии

```typescript
// Поменять отношения на "партнёр" и настроение на "игривый"
await fetch('/api/chats/1/session', {
  method: 'PATCH',
  headers: {
    Authorization: `tma ${initData}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    relationship_type: 'partner',
    mood_preference: 'playful'
  })
});
```

---

## 🔐 Rate Limits

| Endpoint | Лимит | Окно |
|----------|-------|------|
| `POST /api/chats/:id/messages` | 10 req | 1 мин |
| `POST /api/chats/:id/regenerate` | 5 req | 1 мин |
| `GET /api/characters*` | 60 req | 1 мин |
| `GET /api/chats/:id/messages` | 30 req | 1 мин |
| WebSocket messages | 30 msg | 1 мин |

При превышении лимита возвращается:
```json
{
  "error": "rate_limit",
  "message": "Слишком много запросов, подождите",
  "retry_after": 45
}
```

---

## 📚 Дополнительная информация

### Формирование контекста LLM

Backend автоматически формирует контекст для LLM из:
1. Системного промпта персонажа
2. Профиля пользователя (имя, пол, язык)
3. Долговременной памяти (важные факты)
4. Настроек сессии (отношения, настроение)
5. Последних 8 сообщений диалога

### Кэширование

Следующие данные кэшируются:
- Данные персонажей (5 мин)
- Лимиты пользователей (1 мин)
- Системные промпты (бессрочно)
- Теги (10 мин)

### Версионирование API

API версионируется через заголовок:
```http
API-Version: 1.0
```

При breaking changes версия увеличится до 2.0.
