import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrismaClient } from './singleton';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const seedsDir = path.join(rootDir, 'seeds');

const prisma = getPrismaClient();

interface CharacterSeed {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  status: string;
  createdBy?: string | null;
  versions: Array<{
    id: string;
    systemPrompt: string;
    style: Record<string, unknown>;
    safetyPolicy: Record<string, unknown>;
    modelPreset: Record<string, unknown>;
    version: number;
    isActive: boolean;
    createdAt: string;
  }>;
  stories: Array<{
    id: string;
    title: string;
    arcJson: Record<string, unknown>;
    isPremium: boolean;
  }>;
}

interface ItemSeed {
  id: string;
  slug: string;
  titleRu: string;
  descriptionRu: string;
  category: string;
  effect: Record<string, unknown>;
  rarity: string;
  isActive: boolean;
  createdAt: string;
  prices: Array<{
    id: string;
    xtrAmount: number;
    tierDiscount: Record<string, unknown>;
    createdAt: string;
  }>;
}

async function loadJson<T>(file: string): Promise<T> {
  const data = await readFile(path.join(seedsDir, file), 'utf-8');
  return JSON.parse(data) as T;
}

async function seedCharacters(): Promise<void> {
  const characters = await loadJson<CharacterSeed[]>('characters.json');
  for (const character of characters) {
    await prisma.character.upsert({
      where: { id: character.id },
      update: {
        slug: character.slug,
        name: character.name,
        visibility: character.visibility as any,
        status: character.status as any,
        createdBy: character.createdBy ?? null,
        versions: {
          deleteMany: {},
          create: character.versions.map((version) => ({
            id: version.id,
            systemPrompt: version.systemPrompt,
            style: version.style,
            safetyPolicy: version.safetyPolicy,
            modelPreset: version.modelPreset,
            version: version.version,
            isActive: version.isActive,
            createdAt: new Date(version.createdAt),
          })),
        },
        stories: {
          deleteMany: {},
          create: character.stories.map((story) => ({
            id: story.id,
            title: story.title,
            arcJson: story.arcJson,
            isPremium: story.isPremium,
          })),
        },
      },
      create: {
        id: character.id,
        slug: character.slug,
        name: character.name,
        visibility: character.visibility as any,
        status: character.status as any,
        createdBy: character.createdBy ?? null,
        versions: {
          create: character.versions.map((version) => ({
            id: version.id,
            systemPrompt: version.systemPrompt,
            style: version.style,
            safetyPolicy: version.safetyPolicy,
            modelPreset: version.modelPreset,
            version: version.version,
            isActive: version.isActive,
            createdAt: new Date(version.createdAt),
          })),
        },
        stories: {
          create: character.stories.map((story) => ({
            id: story.id,
            title: story.title,
            arcJson: story.arcJson,
            isPremium: story.isPremium,
          })),
        },
      },
    });
  }
}

async function seedItems(): Promise<void> {
  const items = await loadJson<ItemSeed[]>('items.json');
  for (const item of items) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: {
        slug: item.slug,
        titleRu: item.titleRu,
        descriptionRu: item.descriptionRu,
        category: item.category as any,
        effect: item.effect,
        rarity: item.rarity as any,
        isActive: item.isActive,
        createdAt: new Date(item.createdAt),
        prices: {
          deleteMany: {},
          create: item.prices.map((price) => ({
            id: price.id,
            xtrAmount: price.xtrAmount,
            tierDiscount: price.tierDiscount,
            createdAt: new Date(price.createdAt),
          })),
        },
      },
      create: {
        id: item.id,
        slug: item.slug,
        titleRu: item.titleRu,
        descriptionRu: item.descriptionRu,
        category: item.category as any,
        effect: item.effect,
        rarity: item.rarity as any,
        isActive: item.isActive,
        createdAt: new Date(item.createdAt),
        prices: {
          create: item.prices.map((price) => ({
            id: price.id,
            xtrAmount: price.xtrAmount,
            tierDiscount: price.tierDiscount,
            createdAt: new Date(price.createdAt),
          })),
        },
      },
    });
  }
}

export async function runSeed(): Promise<void> {
  await seedCharacters();
  await seedItems();
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  runSeed()
    .then(() => {
      console.log('Seed completed');
    })
    .catch((error) => {
      console.error('Seed failed', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
