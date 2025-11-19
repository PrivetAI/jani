import { prisma } from '@jani/database'
import { LimitStatus } from '@jani/shared'

const DEFAULT_DAILY_LIMIT = 50
const DEFAULT_SOFT_CAP = 2000

export const getLimitStatus = async (userId: string): Promise<LimitStatus> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { limits: true },
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  let limit = user.limits.find((entry) => entry.channel === 'default')
  if (!limit) {
    limit = await prisma.userLimit.create({
      data: {
        userId: user.id,
        channel: 'default',
        dailyLimit: DEFAULT_DAILY_LIMIT,
        softCap: DEFAULT_SOFT_CAP,
      },
    })
  }

  const unlimited = user.tier !== 'free'
  const dailyLimit = unlimited ? limit.softCap : limit.dailyLimit

  return {
    dailyLimit,
    dailyUsed: limit.dailyUsed,
    softCap: limit.softCap,
    unlimited,
    tier: user.tier,
  }
}
