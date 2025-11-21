export interface TelegramInitUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramInitData {
  user: TelegramInitUser;
  query_id?: string;
  auth_date: string;
  hash: string;
}

export interface AuthenticatedUser {
  id: number;
  telegramUserId: number;
  username?: string;
  isAdmin: boolean;
  lastCharacterId?: number | null;
}
