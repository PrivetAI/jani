# Этап 0: Project Setup - Jani

**Цель:** Инициализировать монорепо Turborepo с базовой инфраструктурой

**Время:** 1-2 дня

---

## Acceptance Criteria

- ✅ Turborepo монорепо с pnpm workspaces
- ✅ Docker Compose с PostgreSQL 16 + Redis 7
- ✅ Prisma настроен с pgvector extension
- ✅ Базовая схема БД (users, characters, dialogs, messages)
- ✅ TypeScript конфиги для всех packages/apps
- ✅ ESLint + Prettier
- ✅ Все сервисы запускаются и подключаются к БД

---

## Project Structure

```
jani/
├── apps/
│   ├── api/              # REST API для PWA/Mini App
│   ├── bot/              # Telegram Bot (webhook) - placeholder
│   ├── worker/           # BullMQ worker для LLM jobs
│   ├── pwa/              # React PWA приложение
│   └── admin/            # Admin panel - placeholder
├── packages/
│   ├── database/         # Prisma schema + client
│   ├── shared/           # Shared types, utils, constants
│   ├── telegram/         # Telegram SDK wrapper - placeholder
│   ├── llm/              # OpenRouter client - placeholder
│   └── payments/         # Payment logic - placeholder
├── docker/
│   └── docker-compose.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## Step 1: Initialize Turborepo

### 1.1 Create project

```bash
# Create directory
mkdir jani
cd jani

# Initialize pnpm
pnpm init

# Install Turborepo
pnpm add -D turbo

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF
```

### 1.2 Root package.json

```json
{
  "name": "jani",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "clean": "turbo run clean",
    "db:migrate": "turbo run db:migrate",
    "db:seed": "turbo run db:seed"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "prettier": "^3.2.4",
    "eslint": "^8.56.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### 1.3 Turbo config

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "clean": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

---

## Step 2: TypeScript Configuration

### 2.1 Root tsconfig.json

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@jani/*": ["packages/*/src"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 3: Docker Compose Infrastructure

### 3.1 Create docker-compose.yml

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: jani-postgres
    environment:
      POSTGRES_USER: jani
      POSTGRES_PASSWORD: jani_dev_pass
      POSTGRES_DB: jani_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jani"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: jani-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### 3.2 Init DB script

```sql
-- docker/init-db.sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 3.3 Start infrastructure

```bash
cd docker
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs postgres
```

---

## Step 4: Packages - Database (Prisma)

### 4.1 Initialize package

```bash
mkdir -p packages/database
cd packages/database

pnpm init
```

### 4.2 Package.json

```json
{
  "name": "@jani/database",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.9.0",
    "prisma-extension-pgvector": "^0.1.0"
  },
  "devDependencies": {
    "prisma": "^5.9.0",
    "tsx": "^4.7.0"
  }
}
```

### 4.3 Prisma Schema (базовая версия)

```prisma
// packages/database/prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

// ============================================
// USERS & AUTH
// ============================================

enum UserTier {
  free
  plus
  pro
  ultra
}

enum UserStatus {
  active
  banned
  deleted
}

model User {
  id              String     @id @default(cuid())
  telegramId      BigInt?    @unique
  username        String?
  firstName       String?
  lastName        String?
  
  // Subscription & Limits
  tier            UserTier   @default(free)
  status          UserStatus @default(active)
  dailyQuota      Int        @default(50)
  dailyUsed       Int        @default(0)
  quotaResetAt    DateTime   @default(now())
  
  // Timestamps
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  lastActiveAt    DateTime   @default(now())
  
  // Relations
  dialogs         Dialog[]
  messages        Message[]
  subscriptions   Subscription[]
  transactions    Transaction[]
  inventory       UserInventory[]
  
  @@index([telegramId])
  @@index([tier])
  @@map("users")
}

// ============================================
// CHARACTERS & VERSIONS
// ============================================

enum CharacterVisibility {
  public
  premium
  creator
}

enum CharacterStatus {
  draft
  live
  archived
}

model Character {
  id              String                @id @default(cuid())
  slug            String                @unique
  
  // Metadata
  name            String
  tagline         String?
  description     String
  avatarUrl       String?
  tags            String[]              @default([])
  
  // Access Control
  visibility      CharacterVisibility   @default(public)
  status          CharacterStatus       @default(draft)
  
  // Active version
  activeVersionId String?
  activeVersion   CharacterVersion?     @relation("ActiveVersion", fields: [activeVersionId], references: [id])
  
  // Timestamps
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  
  // Relations
  versions        CharacterVersion[]    @relation("CharacterVersions")
  dialogs         Dialog[]
  stories         Story[]
  
  @@index([status, visibility])
  @@map("characters")
}

model CharacterVersion {
  id              String    @id @default(cuid())
  characterId     String
  version         Int       @default(1)
  
  // Persona (system prompt)
  persona         String    // Full character prompt
  greeting        String?   // Optional greeting message
  
  // Model settings
  temperature     Float     @default(0.8)
  maxTokens       Int       @default(500)
  
  // Metadata
  notes           String?
  createdAt       DateTime  @default(now())
  
  // Relations
  character       Character @relation("CharacterVersions", fields: [characterId], references: [id], onDelete: Cascade)
  activeFor       Character[] @relation("ActiveVersion")
  
  @@unique([characterId, version])
  @@map("character_versions")
}

// ============================================
// DIALOGS & MESSAGES
// ============================================

enum DialogStatus {
  active
  archived
  deleted
}

model Dialog {
  id              String        @id @default(cuid())
  userId          String
  characterId     String
  
  // Story tracking
  storyId         String?
  currentNodeId   String?
  storyFlags      Json          @default("{}")  // {"visited_asylum": true}
  
  // Context
  summary         String?       // Dialog summary
  summaryUpdatedAt DateTime?
  
  // Status
  status          DialogStatus  @default(active)
  messageCount    Int           @default(0)
  
  // Timestamps
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  lastMessageAt   DateTime?
  
  // Relations
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  character       Character     @relation(fields: [characterId], references: [id])
  messages        Message[]
  story           Story?        @relation(fields: [storyId], references: [id])
  
  @@index([userId, status])
  @@index([characterId])
  @@map("dialogs")
}

enum MessageRole {
  user
  assistant
  system
}

model Message {
  id              String      @id @default(cuid())
  dialogId        String
  role            MessageRole
  content         String
  
  // Metadata
  tokensUsed      Int?
  latencyMs       Int?
  model           String?     // OpenRouter model used
  
  // Actions (parsed from envelope)
  actions         Json?       // [{"type": "OFFER_ITEM", "item_id": "..."}]
  
  // Timestamps
  createdAt       DateTime    @default(now())
  
  // Relations
  dialog          Dialog      @relation(fields: [dialogId], references: [id], onDelete: Cascade)
  user            User        @relation(fields: [userId], references: [id])
  userId          String
  
  @@index([dialogId, createdAt])
  @@map("messages")
}

// ============================================
// SUBSCRIPTIONS & PAYMENTS
// ============================================

enum SubscriptionStatus {
  active
  cancelled
  expired
}

model Subscription {
  id              String              @id @default(cuid())
  userId          String
  tier            UserTier
  status          SubscriptionStatus  @default(active)
  
  // Billing
  priceStars      Int                 // Price in Telegram Stars
  
  // Period
  startDate       DateTime            @default(now())
  endDate         DateTime
  autoRenew       Boolean             @default(true)
  
  // Timestamps
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  // Relations
  user            User                @relation(fields: [userId], references: [id])
  
  @@index([userId, status])
  @@map("subscriptions")
}

enum TransactionType {
  subscription
  package
  item
}

enum TransactionStatus {
  pending
  completed
  failed
  refunded
}

model Transaction {
  id                      String            @id @default(cuid())
  userId                  String
  type                    TransactionType
  status                  TransactionStatus @default(pending)
  
  // Payment
  amountStars             Int
  telegramPaymentChargeId String?           @unique
  
  // Metadata
  metadata                Json?             // {item_id, package_type, etc}
  source                  String            @default("telegram") // telegram|pwa-mock
  
  // Refund
  refundedAt              DateTime?
  refundReason            String?
  
  // Timestamps
  createdAt               DateTime          @default(now())
  updatedAt               DateTime          @updatedAt
  
  // Relations
  user                    User              @relation(fields: [userId], references: [id])
  
  @@index([userId, status])
  @@index([telegramPaymentChargeId])
  @@map("transactions")
}

// ============================================
// STORIES (placeholder for later stages)
// ============================================

model Story {
  id              String    @id @default(cuid())
  characterId     String
  slug            String
  title           String
  description     String?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  character       Character @relation(fields: [characterId], references: [id])
  dialogs         Dialog[]
  
  @@unique([characterId, slug])
  @@map("stories")
}

// ============================================
// ITEMS & INVENTORY (placeholder)
// ============================================

enum ItemCategory {
  consumable
  key
  booster
  cosmetic
  utility
}

model Item {
  id              String        @id @default(cuid())
  slug            String        @unique
  name            String
  description     String
  category        ItemCategory
  
  // Pricing
  priceStars      Int
  
  // Effect definition
  effect          Json          // {type: "memory.boost", params: {...}}
  
  // Metadata
  iconUrl         String?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  inventory       UserInventory[]
  
  @@map("items")
}

model UserInventory {
  id              String    @id @default(cuid())
  userId          String
  itemId          String
  
  quantity        Int       @default(1)
  
  // Effect tracking (for active items)
  isActive        Boolean   @default(false)
  activatedAt     DateTime?
  expiresAt       DateTime? // TTL based on effect
  
  acquiredAt      DateTime  @default(now())
  
  user            User      @relation(fields: [userId], references: [id])
  item            Item      @relation(fields: [itemId], references: [id])
  
  @@unique([userId, itemId])
  @@index([userId, isActive])
  @@map("user_inventory")
}
```

### 4.4 Create .env

```bash
# Root .env
DATABASE_URL="postgresql://jani:jani_dev_pass@localhost:5432/jani_dev?schema=public"
REDIS_URL="redis://localhost:6379"

NODE_ENV="development"
```

### 4.5 Initialize Prisma

```bash
cd packages/database

# Generate client
pnpm db:generate

# Create and run migration
pnpm db:migrate
# When prompted, name it: "initial_schema"
```

### 4.6 Create index.ts

```typescript
// packages/database/src/index.ts
import { PrismaClient } from '@prisma/client'

export * from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
```

---

## Step 5: Packages - Shared

### 5.1 Initialize

```bash
mkdir -p packages/shared/src
cd packages/shared
pnpm init
```

### 5.2 Package.json

```json
{
  "name": "@jani/shared",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "^3.22.4"
  }
}
```

### 5.3 Create constants

```typescript
// packages/shared/src/constants.ts
export const QUOTA = {
  DAILY_LIMIT_FREE: 50,
  SUBSCRIPTION_SOFTCAP: 2000,
} as const

export const DISCOUNTS = {
  plus: 0.05,  // 5%
  pro: 0.10,   // 10%
  ultra: 0.15, // 15%
} as const

export const CONTEXT_LIMITS = {
  MAX_PAIRS: 4,  // Last 4 user/assistant pairs
  SUMMARY_MAX_TOKENS: 200,
} as const

export const VECTOR_TOP_K = {
  free: 0,
  plus: 3,
  pro: 5,
  ultra: 7,
} as const

export const TTL_DEFAULTS = {
  MEMORY_BOOST_MESSAGES: 10,
  FASTLANE_MESSAGES: 5,
  STYLE_MOOD_HOURS: 24,
} as const
```

### 5.4 Create types

```typescript
// packages/shared/src/types.ts
import { z } from 'zod'

// Action envelope from LLM
export const ActionSchema = z.object({
  type: z.enum(['OFFER_ITEM', 'CONSUME_ITEM', 'SET_FLAG', 'PROGRESS_STORY']),
  item_id: z.string().optional(),
  flag: z.string().optional(),
  node_id: z.string().optional(),
})

export const ActionEnvelopeSchema = z.object({
  user_visible_text: z.string(),
  actions: z.array(ActionSchema).optional().default([]),
})

export type Action = z.infer<typeof ActionSchema>
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>

// Item effects
export type ItemEffect =
  | { type: 'memory.boost'; topK: number; ttl_messages: number }
  | { type: 'llm.fastlane'; model: string; ttl_messages: number }
  | { type: 'gate.key'; key: string }
  | { type: 'style.mood'; mood: string; ttl_hours: number }

// API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}
```

### 5.5 Create index

```typescript
// packages/shared/src/index.ts
export * from './constants'
export * from './types'
```

---

## Step 6: Apps - API (minimal setup)

### 6.1 Initialize

```bash
mkdir -p apps/api/src
cd apps/api
pnpm init
```

### 6.2 Package.json

```json
{
  "name": "@jani/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@jani/database": "workspace:*",
    "@jani/shared": "workspace:*",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

### 6.3 Create minimal server

```typescript
// apps/api/src/index.ts
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { prisma } from '@jani/database'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' })
  }
})

// Placeholder routes
app.get('/api/v1/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`)
})
```

---

## Step 7: Apps - PWA (minimal setup)

### 7.1 Create React app

```bash
cd apps
pnpm create vite pwa --template react-ts
cd pwa
```

### 7.2 Update package.json

```json
{
  "name": "@jani/pwa",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11"
  }
}
```

### 7.3 Minimal App.tsx

```typescript
// apps/pwa/src/App.tsx
import { useState } from 'react'

function App() {
  const [message, setMessage] = useState('')

  const testApi = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/v1/ping')
      const data = await res.json()
      setMessage(JSON.stringify(data, null, 2))
    } catch (error) {
      setMessage('Failed to connect to API')
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Jani PWA - Setup Check</h1>
      <button onClick={testApi}>Test API Connection</button>
      {message && <pre>{message}</pre>}
    </div>
  )
}

export default App
```

---

## Step 8: Apps - Worker (placeholder)

```bash
mkdir -p apps/worker/src
cd apps/worker
pnpm init
```

```json
{
  "name": "@jani/worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@jani/database": "workspace:*",
    "@jani/shared": "workspace:*",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.2",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

```typescript
// apps/worker/src/index.ts
import { Worker } from 'bullmq'
import Redis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

const worker = new Worker(
  'llm-generation',
  async (job) => {
    console.log('Processing job:', job.id)
    // Placeholder
    return { status: 'completed' }
  },
  { connection }
)

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err)
})

console.log('🔧 Worker started, listening for jobs...')
```

---

## Step 9: Linting & Formatting

### 9.1 ESLint config

```json
// .eslintrc.json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  }
}
```

### 9.2 Prettier config

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## Step 10: Verification

### 10.1 Install all dependencies

```bash
# From root
pnpm install
```

### 10.2 Start infrastructure

```bash
cd docker
docker-compose up -d

# Check health
docker-compose ps
```

### 10.3 Run migrations

```bash
cd packages/database
pnpm db:migrate
```

### 10.4 Start services

Terminal 1:
```bash
cd apps/api
pnpm dev
```

Terminal 2:
```bash
cd apps/pwa
pnpm dev
```

Terminal 3:
```bash
cd apps/worker
pnpm dev
```

### 10.5 Test connections

1. Open http://localhost:5173 (PWA)
2. Click "Test API Connection"
3. Should see `{"message":"pong","timestamp":"..."}`

### 10.6 Check Prisma Studio

```bash
cd packages/database
pnpm db:studio
```

Open http://localhost:5555 and verify tables exist.

---

## Deliverables Checklist

- [ ] Turborepo monorepo structure
- [ ] Docker Compose running (Postgres + Redis)
- [ ] Prisma schema with all base tables
- [ ] API server responding to health check
- [ ] PWA connecting to API
- [ ] Worker placeholder running
- [ ] All TypeScript configs valid
- [ ] ESLint/Prettier configured
- [ ] README.md with setup instructions

---

## Next Steps

После завершения Этапа 0:
1. Commit initial setup
2. Proceed to **Этап 1: Auth & User Management**

---

## Troubleshooting

**Docker не запускается:**
```bash
docker-compose down -v
docker-compose up -d --build
```

**Prisma migration ошибки:**
```bash
pnpm db:push  # Force sync without migration
```

**pnpm install зависает:**
```bash
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Port conflicts:**
```bash
# Change ports in docker-compose.yml
# Update .env DATABASE_URL and REDIS_URL accordingly
```