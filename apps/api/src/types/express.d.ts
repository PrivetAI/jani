import type { AuthClaims } from '@jani/auth'

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims
    }
  }
}

export {}
