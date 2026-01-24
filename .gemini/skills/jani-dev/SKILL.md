---
name: jani-dev
description: Development workflow for Jani AI project. Use when working on any task in this codebase - starting dev environment, making changes, testing, deploying. Covers conventions, commands, and where to find documentation.
---

# Jani Development Workflow

## Quick Commands

```bash
# Development
cd backend && npm run dev      # API + WebSocket: localhost:3000
cd frontend && npm run dev     # Web: localhost:5173

# Docker (full stack)
docker-compose up --build      # Postgres:5433, API:3000, Web:4173

# Production deploy
./deploy.sh                    # Deploy to VPS
```

## Project Documentation

Before diving into code, check existing docs:
- `FEATURES.md` — Full feature list and how they work
- `API_SPEC.md` — REST and WebSocket API specification  
- `ROADMAP.md` — Future plans and priorities
- `.env.example` — All environment variables

## Development Process

### 1. Before Starting
- Check `FEATURES.md` to understand existing functionality
- Check `ROADMAP.md` for context on priorities
- Изучить код, а не полагаться на описания — код = source of truth

### 2. Making Changes

**Backend changes:**
- Routes: `backend/src/routes/`
- Business logic: `backend/src/services/`
- Database: `backend/src/repositories/`
- Migrations: `backend/migrations/`

**Frontend changes:**
- Pages: `frontend/src/pages/`
- Components: `frontend/src/components/`
- API client: `frontend/src/lib/`

### 3. Testing
```bash
# Backend build check
cd backend && npm run build

# Frontend build check  
cd frontend && npm run build
```

### 4. After Significant Changes
- Update `FEATURES.md` if adding/changing features
- Update `API_SPEC.md` if changing API
- Update `ROADMAP.md` if completing roadmap items

## Conventions

### Code Style
- TypeScript for both backend and frontend
- Async/await over callbacks
- Descriptive variable names (Russian comments OK)

### Database
- New tables require migration in `backend/migrations/`
- Use repositories for all DB access, not direct queries in services

### API
- All endpoints require Telegram auth (`x-telegram-init-data` header)
- Admin endpoints additionally check `ADMIN_TELEGRAM_IDS`

## Docker Services

```yaml
postgres   # Database (port 5433 local, 5432 in container)
backend    # API + WebSocket
frontend   # Vite dev server or production build
ngrok      # Tunnel for Telegram webhook (dev only)
backup     # Automated DB backups (prod only)
```

## Environment

Key variables (see `.env.example` for full list):
- `DATABASE_URL` — PostgreSQL connection
- `TELEGRAM_BOT_TOKEN` — Bot token
- `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` — LLM providers
- `ADMIN_TELEGRAM_IDS` — Comma-separated admin Telegram IDs
