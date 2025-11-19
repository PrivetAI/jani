import { Router } from 'express'
import { prisma } from '@jani/database'
import { requireAuth, requireRole } from '../middleware/auth'
import { z } from 'zod'
import { AuthService } from '@jani/auth'

const router = Router()

const querySchema = z.object({
  role: z.enum(['user', 'admin', 'creator']).optional(),
  tier: z.enum(['free', 'plus', 'pro', 'ultra']).optional(),
  search: z.string().optional(),
})

router.use(requireAuth)
router.use(requireRole('admin'))

router.get('/users', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Неверные параметры' } })
  }

  const { role, tier, search } = parsed.data
  const where: any = {}
  if (role) {
    where.roles = { has: role }
  }
  if (tier) {
    where.tier = tier
  }
  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: { entitlements: true },
  })

  const payload = users.map((user) => AuthService.mapUserToProfile(user, user.entitlements.map((ent) => ent.slug)))

  res.json({ success: true, data: { users: payload } })
})

export default router
