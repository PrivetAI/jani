CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "CharacterVisibility" AS ENUM ('public', 'premium', 'creator');
CREATE TYPE "CharacterStatus" AS ENUM ('draft', 'live');
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');
CREATE TYPE "DialogStatus" AS ENUM ('open', 'closed');
CREATE TYPE "SubscriptionTier" AS ENUM ('Free', 'Plus', 'Pro', 'Ultra');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'canceled', 'past_due');
CREATE TYPE "PackType" AS ENUM ('Story', 'Memory', 'Creator');
CREATE TYPE "PaymentType" AS ENUM ('oneoff', 'subscription');
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'refunded', 'failed');
CREATE TYPE "QuotaWindow" AS ENUM ('daily', 'rolling24h');
CREATE TYPE "ItemCategory" AS ENUM ('consumable', 'key', 'booster', 'cosmetic', 'utility');
CREATE TYPE "ItemRarity" AS ENUM ('common', 'rare', 'epic', 'legendary');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "tgId" TEXT NOT NULL UNIQUE,
  "locale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Character" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "visibility" "CharacterVisibility" NOT NULL,
  "status" "CharacterStatus" NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CharacterVersion" (
  "id" TEXT PRIMARY KEY,
  "characterId" TEXT NOT NULL REFERENCES "Character"("id") ON DELETE CASCADE,
  "systemPrompt" TEXT NOT NULL,
  "style" JSONB NOT NULL,
  "safetyPolicy" JSONB NOT NULL,
  "modelPreset" JSONB NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CharacterVersion_characterId_isActive_idx" ON "CharacterVersion"("characterId", "isActive");

CREATE TABLE "Story" (
  "id" TEXT PRIMARY KEY,
  "characterId" TEXT NOT NULL REFERENCES "Character"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "arcJson" JSONB NOT NULL,
  "isPremium" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "Dialog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "characterId" TEXT NOT NULL REFERENCES "Character"("id") ON DELETE CASCADE,
  "storyId" TEXT REFERENCES "Story"("id"),
  "status" "DialogStatus" NOT NULL DEFAULT 'open',
  "summary" TEXT,
  "modelOverride" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Dialog_userId_idx" ON "Dialog"("userId");
CREATE INDEX "Dialog_characterId_idx" ON "Dialog"("characterId");

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "dialogId" TEXT NOT NULL REFERENCES "Dialog"("id") ON DELETE CASCADE,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "tokensIn" INTEGER,
  "tokensOut" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Message_dialogId_createdAt_idx" ON "Message"("dialogId", "createdAt");

CREATE TABLE "MemoryEpisodic" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "characterId" TEXT NOT NULL REFERENCES "Character"("id") ON DELETE CASCADE,
  "embedding" vector(1536) NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MemoryEpisodic_userId_characterId_createdAt_idx" ON "MemoryEpisodic"("userId", "characterId", "createdAt");

CREATE TABLE "Subscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tier" "SubscriptionTier" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "renewsAt" TIMESTAMP(3) NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'active'
);

CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

CREATE TABLE "Entitlement" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "pack" "PackType" NOT NULL,
  "meta" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Entitlement_userId_pack_idx" ON "Entitlement"("userId", "pack");

CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" "PaymentType" NOT NULL,
  "xtrAmount" INTEGER NOT NULL,
  "item" TEXT,
  "tier" "SubscriptionTier",
  "tgChargeId" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'paid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

CREATE TABLE "Quota" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "messagesUsed" INTEGER NOT NULL DEFAULT 0,
  "windowType" "QuotaWindow" NOT NULL
);

CREATE UNIQUE INDEX "Quota_userId_windowStart_windowType_key" ON "Quota"("userId", "windowStart", "windowType");

CREATE TABLE "Item" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "titleRu" TEXT NOT NULL,
  "descriptionRu" TEXT NOT NULL,
  "category" "ItemCategory" NOT NULL,
  "effect" JSONB NOT NULL,
  "rarity" "ItemRarity" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ItemPrice" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
  "variant" TEXT,
  "xtrAmount" INTEGER NOT NULL,
  "tierDiscount" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Inventory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Inventory_userId_itemId_key" ON "Inventory"("userId", "itemId");

CREATE TABLE "ActiveEffect" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "dialogId" TEXT REFERENCES "Dialog"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
  "effect" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remainingMessages" INTEGER
);

CREATE INDEX "ActiveEffect_userId_idx" ON "ActiveEffect"("userId");
CREATE INDEX "ActiveEffect_dialogId_idx" ON "ActiveEffect"("dialogId");
