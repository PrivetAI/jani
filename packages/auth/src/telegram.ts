import crypto from 'crypto'
import { TelegramUserPayload, TelegramUserSchema } from './types'

const DEFAULT_EXPIRATION_SECONDS = 60

export interface TelegramAuthData {
  user: TelegramUserPayload
  authDate: number
  raw: Record<string, string>
}

const buildDataCheckString = (params: URLSearchParams) => {
  const entries: string[] = []
  params.forEach((value, key) => {
    if (key === 'hash') return
    entries.push(`${key}=${value}`)
  })
  return entries.sort().join('\n')
}

const computeHash = (dataCheckString: string, secret: string) => {
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(secret).digest()
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
}

export const parseInitData = (initData: string) => {
  if (!initData) throw new Error('INIT_DATA_REQUIRED')
  return new URLSearchParams(initData)
}

export const verifyTelegramInitData = (
  initData: string,
  secret: string,
  expirationSeconds: number = DEFAULT_EXPIRATION_SECONDS,
  allowUnsafe = false
): TelegramAuthData => {
  const params = parseInitData(initData)
  const raw: Record<string, string> = {}
  params.forEach((value, key) => {
    raw[key] = value
  })

  const userRaw = params.get('user')
  if (!userRaw) {
    throw new Error('INIT_DATA_USER_MISSING')
  }
  const user = TelegramUserSchema.parse(JSON.parse(userRaw))
  const authDate = Number(params.get('auth_date') || '0') * 1000
  const now = Date.now()

  if (!allowUnsafe) {
    if (!secret) {
      throw new Error('TELEGRAM_SECRET_MISSING')
    }
    const hashFromTelegram = params.get('hash')
    if (!hashFromTelegram) {
      throw new Error('INIT_DATA_HASH_MISSING')
    }
    const dataCheckString = buildDataCheckString(params)
    const signature = computeHash(dataCheckString, secret)
    if (signature !== hashFromTelegram) {
      throw new Error('INIT_DATA_HASH_INVALID')
    }
    if (!authDate || Math.abs(now - authDate) > expirationSeconds * 1000) {
      throw new Error('INIT_DATA_EXPIRED')
    }
  }

  return { user, authDate, raw }
}
