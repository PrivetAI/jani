import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import { prisma } from '@jani/database'
import authRouter from './routes/auth'
import profileRouter from './routes/profile'
import adminRouter from './routes/admin'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(helmet())
app.use(cors({ credentials: true, origin: true }))
app.use(cookieParser())
app.use(express.json())

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() })
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: `${error}` })
  }
})

app.get('/api/v1/ping', (_req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api', profileRouter)
app.use('/api/admin', adminRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API error:', err)
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Внутренняя ошибка сервера' } })
})

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`)
})
