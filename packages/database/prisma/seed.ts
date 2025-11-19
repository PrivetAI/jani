import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ensureDefaultCharacters = async () => {
  const arina = await prisma.character.upsert({
    where: { slug: 'arina-klimova' },
    update: {},
    create: {
      slug: 'arina-klimova',
      name: 'Арина Климова',
      tagline: 'Куратор Архива',
      description: 'Нуард-куратор, проводник по легендам Трамвая.',
      tags: ['нуар', 'расследование'],
      visibility: 'public',
      status: 'live',
      versions: {
        create: {
          version: 1,
          persona: 'Ты Арине Климова, куратор Архива загадочных историй.',
          greeting: 'Привет, я Арина. Готов к расследованию?',
        },
      },
    },
    include: { versions: true },
  })

  const vektor = await prisma.character.upsert({
    where: { slug: 'ilya-vektor' },
    update: {},
    create: {
      slug: 'ilya-vektor',
      name: 'Илья "Вектор" Силантьев',
      tagline: 'Кибер-нуар агент',
      description: 'Проводник по цифровым теням.',
      tags: ['кибер', 'нуар'],
      visibility: 'public',
      status: 'live',
      versions: {
        create: {
          version: 1,
          persona: 'Ты Вектор, циничный агент.',
          greeting: 'Связь установлена. Открываем кейс?',
        },
      },
    },
    include: { versions: true },
  })

  await prisma.character.update({
    where: { id: arina.id },
    data: { activeVersionId: arina.versions[0].id },
  })

  await prisma.character.update({
    where: { id: vektor.id },
    data: { activeVersionId: vektor.versions[0].id },
  })
}

const ensureLimit = async (userId: string) => {
  await prisma.userLimit.upsert({
    where: {
      userId_channel: {
        userId,
        channel: 'default',
      },
    },
    update: {},
    create: {
      userId,
      channel: 'default',
      dailyLimit: 50,
      softCap: 2000,
    },
  })
}

const ensureEntitlement = async (userId: string, slug: string, title: string, scope: 'subscription' | 'pack' | 'item') => {
  await prisma.userEntitlement.upsert({
    where: {
      userId_slug: {
        userId,
        slug,
      },
    },
    update: {},
    create: {
      userId,
      slug,
      scope,
      title,
    },
  })
}

const ensureSeedUsers = async () => {
  const admin = await prisma.user.upsert({
    where: { telegramId: BigInt(9000000001) },
    update: {
      roles: {
        set: ['admin', 'user'],
      },
    },
    create: {
      telegramId: BigInt(9000000001),
      username: 'jani_admin',
      firstName: 'Jani',
      lastName: 'Admin',
      tier: 'ultra',
      roles: ['admin', 'user'],
    },
  })

  const creator = await prisma.user.upsert({
    where: { telegramId: BigInt(9000000002) },
    update: {
      roles: {
        set: ['creator', 'user'],
      },
    },
    create: {
      telegramId: BigInt(9000000002),
      username: 'jani_creator',
      firstName: 'Jani',
      lastName: 'Creator',
      tier: 'plus',
      roles: ['creator', 'user'],
    },
  })

  await ensureLimit(admin.id)
  await ensureLimit(creator.id)

  await ensureEntitlement(admin.id, 'creator-pack', 'Creator Pack', 'pack')
  await ensureEntitlement(admin.id, 'memory-pack', 'Memory Pack', 'pack')
  await ensureEntitlement(creator.id, 'creator-pack', 'Creator Pack', 'pack')
}

async function main() {
  await ensureSeedUsers()
  await ensureDefaultCharacters()
  console.log('Seed completed')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
