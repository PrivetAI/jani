# API Specification: Mini App Chat

Спецификация API endpoints для Mini App чата с AI-персонажами.

---

## 🔑 Авторизация

Все запросы к API должны содержать Telegram WebApp `initData` в заголовке:

```http
x-telegram-init-data: <initDataString>
```

Backend валидирует `initData` и извлекает `telegram_user_id`.

---

## 👤 User Profile API

### Получение профиля

```http
GET /api/profile
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "id": 123,
  "telegramUserId": 456789,
  "username": "alex_user",
  "displayName": "Алексей",
  "nickname": "alexdev",
  "gender": "male",
  "language": "ru",
  "isAdultConfirmed": true,
  "subscription": {
    "status": "active",
    "endAt": "2025-02-01T00:00:00Z"
  },
  "limits": {
    "remaining": 27,
    "total": 50,
    "resetsAt": "2025-01-02T00:00:00Z"
  }
}
```

### Обновление профиля

```http
PATCH /api/profile
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "display_name": "Алексей",
  "nickname": "alexdev",
  "gender": "male",
  "language": "ru"
}
```

**Validation:**
- `nickname`: 3-30 символов, только латинские буквы, цифры и `_`, уникальный

**Response:**
```json
{
  "id": 123,
  "telegramUserId": 456789,
  "username": "alex_user",
  "displayName": "Алексей",
  "nickname": "alexdev",
  "gender": "male",
  "language": "ru",
  "isAdultConfirmed": true,
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### Подтверждение возраста 18+

```http
POST /api/profile/confirm-adult
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "success": true,
  "isAdultConfirmed": true
}
```

### Обновление последнего персонажа

```http
PATCH /api/profile/last-character
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "characterId": 1
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## 🎭 Characters API

### Список персонажей

```http
GET /api/characters?tags=anime,fantasy
x-telegram-init-data: <initDataString>
```

**Query Parameters:**
- `tags` - теги через запятую (кросс-фильтрация)

**Response:**
```json
{
  "characters": [
    {
      "id": 1,
      "name": "Кира",
      "description": "Милая девушка из аниме...",
      "avatarUrl": "/uploads/avatar-123.jpg",
      "accessType": "free",
      "genre": "anime",
      "grammaticalGender": "female",
      "tags": ["anime", "romance", "friendly"],
      "likesCount": 42
    }
  ],
  "includePremium": false
}
```

### Детали персонажа

```http
GET /api/characters/:id
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "character": {
    "id": 1,
    "name": "Кира",
    "description": "Милая девушка из аниме...",
    "avatarUrl": "/uploads/avatar-123.jpg",
    "accessType": "free",
    "genre": "anime",
    "grammaticalGender": "female",
    "tags": ["anime", "romance"],
    "likesCount": 42,
    "dislikesCount": 3,
    "userRating": 1,
    "createdBy": {
      "id": 1,
      "name": "Admin"
    }
  }
}
```

### Оценка персонажа

```http
POST /api/characters/:id/rating
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "rating": 1
}
```

**Values:**
- `1` - лайк
- `-1` - дизлайк
- `null` - убрать оценку

**Response:**
```json
{
  "success": true,
  "likesCount": 43,
  "dislikesCount": 3,
  "userRating": 1
}
```

---

## 🏷️ Tags API

### Список всех тегов

```http
GET /api/tags
```

**Response:**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "anime"
    },
    {
      "id": 2,
      "name": "romance"
    }
  ]
}
```

---

## 💬 Chat API

### Получение истории сообщений

```http
GET /api/chats/:characterId/messages?limit=50&offset=0
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "messages": [
    {
      "id": 123,
      "characterId": 1,
      "role": "user",
      "text": "Привет! Как дела?",
      "createdAt": "2025-01-01T12:00:00Z"
    },
    {
      "id": 124,
      "characterId": 1,
      "role": "assistant",
      "text": "Привет! Всё отлично, спасибо!",
      "createdAt": "2025-01-01T12:00:05Z"
    }
  ],
  "total": 142,
  "hasMore": true
}
```

### Отправка сообщения

```http
POST /api/chats/:characterId/messages
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "message": "Привет! Как дела?"
}
```

**Response:**
```json
{
  "userMessage": {
    "id": 125,
    "role": "user",
    "text": "Привет! Как дела?",
    "createdAt": "2025-01-01T12:05:00Z"
  },
  "assistantMessage": {
    "id": 126,
    "role": "assistant",
    "text": "Привет! Отлично, а у тебя?",
    "createdAt": "2025-01-01T12:05:03Z"
  },
  "limits": {
    "remaining": 48,
    "total": 50,
    "resetsAt": "2025-01-02T00:00:00Z"
  }
}
```

### Забыть недавние сообщения

```http
POST /api/chats/:characterId/forget-recent
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "count": 10
}
```

**Response:**
```json
{
  "success": true,
  "deletedMessagesCount": 10
}
```

---

## 🎮 Chat Session API

### Получение сессии

```http
GET /api/chats/:characterId/session
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "id": 42,
  "userId": 123,
  "characterId": 1,
  "lastMessageAt": "2025-01-01T12:00:00Z",
  "messagesCount": 142,
  "createdAt": "2024-12-01T10:00:00Z",
  "llmModel": null,
  "state": {
    "attraction": 15,
    "trust": 20,
    "affection": 18,
    "dominance": -5,
    "mood": {
      "primary": "playful",
      "intensity": 7
    }
  }
}
```

### Обновление настроек сессии

```http
PATCH /api/chats/:characterId/session
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "llmModel": "gpt-4"
}
```

**Response:** обновлённая сессия

---

## 🧠 Memory API

### Получение всех фактов о пользователе

```http
GET /api/chats/:characterId/memories
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "memories": [
    {
      "id": 1,
      "content": "Работает программистом",
      "importance": 8,
      "createdAt": "2025-01-01T10:00:00Z"
    },
    {
      "id": 2,
      "content": "Предпочитает формальный стиль общения",
      "importance": 6,
      "createdAt": "2025-01-01T11:00:00Z"
    }
  ],
  "total": 8
}
```


### Добавление факта

```http
POST /api/chats/:characterId/memories
Content-Type: application/json
x-telegram-init-data: <initDataString>

{
  "content": "Увлекается аниме и мангой",
  "importance": 7
}
```

**Response:**
```json
{
  "id": 9,
  "content": "Увлекается аниме и мангой",
  "importance": 7,
  "createdAt": "2025-01-01T13:00:00Z"
}
```

### Удаление факта

```http
DELETE /api/chats/:characterId/memories/:memoryId
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deletedId": 9
}
```

### Удаление всех фактов

```http
DELETE /api/chats/:characterId/memories
x-telegram-init-data: <initDataString>
```

**Response:**
```json
{
  "success": true,
  "deletedCount": 8
}
```

---

## 📊 Limits API

### Проверка лимитов

```http
GET /api/limits
x-telegram-init-data: <initDataString>
```

**Response (free user):**
```json
{
  "hasSubscription": false,
  "messagesLimit": {
    "total": 50,
    "used": 23,
    "remaining": 27,
    "resetsAt": "2025-01-02T00:00:00Z"
  },
  "subscription": null
}
```

**Response (premium):**
```json
{
  "hasSubscription": true,
  "messagesLimit": {
    "total": -1,
    "used": 142,
    "remaining": -1,
    "resetsAt": null
  },
  "subscription": {
    "status": "active",
    "startAt": "2025-01-01T00:00:00Z",
    "endAt": "2025-01-31T23:59:59Z"
  }
}
```

---

## 🔌 WebSocket API (Socket.IO)

### Подключение

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    initData: window.Telegram.WebApp.initData
  },
  transports: ['websocket', 'polling']
});
```

### События от клиента

#### chat:send
Отправка сообщения персонажу.

```javascript
socket.emit('chat:send', {
  characterId: 1,
  message: "Привет! Как дела?"
});
```

### События от сервера

#### chat:typing
Персонаж печатает ответ.

```javascript
socket.on('chat:typing', (data) => {
  // data: { characterId: 1 }
  showTypingIndicator();
});
```

#### chat:message
Ответ персонажа получен.

```javascript
socket.on('chat:message', (data) => {
  // data: {
  //   characterId: 1,
  //   userMessage: { role: 'user', text: '...', createdAt: '...' },
  //   assistantMessage: { role: 'assistant', text: '...', createdAt: '...' },
  //   limits: { remaining: 47, total: 50, resetsAt: '...' }
  // }
  appendMessages(data);
  updateLimits(data.limits);
});
```

#### chat:error
Произошла ошибка.

```javascript
socket.on('chat:error', (data) => {
  // data: { error: 'daily_limit_exceeded', message: '...', limits?: {...} }
  showError(data.message);
});
```

---

## 🔧 Admin API

Все admin endpoints требуют `telegramAuth` + `requireAdmin` middleware.

### Загрузка файлов

```http
POST /api/admin/upload
Content-Type: multipart/form-data
x-telegram-init-data: <initDataString>

file: <image file>
```

**Response:**
```json
{
  "url": "/uploads/avatar-1234567890.jpg"
}
```

### Список загруженных файлов

```http
GET /api/admin/uploads
```

**Response:**
```json
{
  "files": [
    {
      "filename": "avatar-123.jpg",
      "url": "/uploads/avatar-123.jpg",
      "size": 102400,
      "createdAt": "2025-01-01T12:00:00Z"
    }
  ],
  "usedFiles": ["avatar-123.jpg"]
}
```

### Удаление неиспользуемых файлов

```http
DELETE /api/admin/uploads/unused
```

### Глобальные настройки

```http
GET /api/admin/settings
```

```http
PUT /api/admin/settings
Content-Type: application/json

{
  "summary_provider": "openrouter",
  "summary_model": "anthropic/claude-3-haiku"
}
```

### Доступные модели

```http
GET /api/admin/gemini-models
GET /api/admin/openai-models
GET /api/admin/openrouter-models
```

### CRUD персонажей

```http
GET /api/admin/characters
POST /api/admin/characters
GET /api/admin/characters/:id
PUT /api/admin/characters/:id
PATCH /api/admin/characters/:id/status
DELETE /api/admin/characters/:id
```

### Управление тегами

```http
GET /api/admin/tags
POST /api/admin/tags
DELETE /api/admin/tags/:id
```

### Статистика

```http
GET /api/admin/stats?period=day
```

### Пользователи

```http
GET /api/admin/users
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

## 🔐 Rate Limits

| Endpoint | Лимит | Окно |
|----------|-------|------|
| `POST /api/chats/:id/messages` | 10 req | 1 мин |
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
