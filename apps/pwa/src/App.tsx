import { useEffect, useState } from 'react'

interface ApiError {
  code: string
  message: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
}

interface UserProfile {
  id: string
  username?: string
  firstName?: string
  lastName?: string
  roles: string[]
  tier: string
  entitlements: string[]
  permissions: {
    premiumContent: boolean
    creatorContent: boolean
    storyPack: boolean
    memoryPack: boolean
  }
}

interface LimitPayload {
  limits: {
    dailyLimit: number
    dailyUsed: number
    softCap: number
    unlimited: boolean
    tier: string
  }
}

interface AuthPayload {
  accessToken: string
  user: UserProfile
}

const getInitData = () => {
  const tg = (window as any).Telegram?.WebApp
  if (tg?.initData) return tg.initData
  return import.meta.env.VITE_MOCK_TELEGRAM_INIT_DATA || ''
}

function App() {
  const [session, setSession] = useState<{ user: UserProfile; token: string } | null>(null)
  const [limits, setLimits] = useState<LimitPayload['limits'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authenticate = async () => {
    const initData = getInitData()
    if (!initData) {
      setError('initData отсутствует. Откройте Mini App внутри Telegram или задайте VITE_MOCK_TELEGRAM_INIT_DATA.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ initData }),
      })
      const body: ApiResponse<AuthPayload> = await res.json()
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error?.message || 'Ошибка авторизации')
      }
      setSession({ user: body.data.user, token: body.data.accessToken })
      await fetchLimits(body.data.accessToken)
    } catch (err: any) {
      setError(err.message || 'Неизвестная ошибка')
      setSession(null)
      setLimits(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchLimits = async (token: string) => {
    const res = await fetch('/api/limits', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    })
    const body: ApiResponse<LimitPayload> = await res.json()
    if (res.ok && body.success && body.data) {
      setLimits(body.data.limits)
    } else {
      setError(body.error?.message || 'Не удалось получить лимиты')
    }
  }

  useEffect(() => {
    void authenticate()
  }, [])

  return (
    <div className="app-shell">
      <header>
        <h1>Jani Mini App</h1>
        <p>Авторизация через Telegram initData + проверка лимитов</p>
        <button onClick={authenticate} disabled={loading}>
          {loading ? 'Подключаемся...' : 'Обновить сессию'}
        </button>
      </header>

      {error && <div className="error-card">{error}</div>}

      {session && (
        <section className="card">
          <h2>Пользователь</h2>
          <p>
            <strong>@{session.user.username ?? 'не указан'}</strong>
          </p>
          <p>
            Роли: <code>{session.user.roles.join(', ')}</code>
          </p>
          <p>Тариф: {session.user.tier}</p>
          <div className="permissions">
            <span className={session.user.permissions.premiumContent ? 'ok' : 'no'}>Premium</span>
            <span className={session.user.permissions.creatorContent ? 'ok' : 'no'}>Creator</span>
            <span className={session.user.permissions.storyPack ? 'ok' : 'no'}>Story Pack</span>
            <span className={session.user.permissions.memoryPack ? 'ok' : 'no'}>Memory Pack</span>
          </div>
        </section>
      )}

      {limits && (
        <section className="card">
          <h2>Лимит сообщений</h2>
          <p>
            {limits.unlimited
              ? 'Безлимитный тариф (soft cap для защиты от абьюза)'
              : `Осталось сообщений: ${Math.max(limits.dailyLimit - limits.dailyUsed, 0)} / ${limits.dailyLimit}`}
          </p>
          <progress max={limits.dailyLimit} value={limits.dailyUsed} />
        </section>
      )}

      {!session && !error && <p>Ожидание авторизации...</p>}
    </div>
  )
}

export default App
