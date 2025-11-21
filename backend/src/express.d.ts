import type { AuthenticatedUser } from './types.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthenticatedUser;
  }
}
