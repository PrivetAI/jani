import { Worker } from 'bullmq'
import Redis from 'ioredis'
import dotenv from 'dotenv'
import { prisma } from '@jani/database'

dotenv.config()

const redisUrl = process.env.REDIS_URL

if (!redisUrl) {
  throw new Error('REDIS_URL is not defined')
}

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
})

const worker = new Worker(
  'llm-generation',
  async (job) => {
    console.log('Processing job:', job.name, job.id)
    // Placeholder: simulate work
    await new Promise((resolve) => setTimeout(resolve, 1000))
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

const verifyDatabaseConnection = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('📦 Prisma connected for worker tasks')
  } catch (error) {
    console.error('Failed to verify database connection from worker', error)
  }
}

void verifyDatabaseConnection()

console.log('🔧 Worker started, listening for jobs...')
