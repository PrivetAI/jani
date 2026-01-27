import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { parseInitData } from '../telegram/verify.js';
import { findOrCreateUser, getSubscriptionStatus } from '../modules/index.js';

const HEADER = 'x-telegram-init-data';

const getInitData = (req: Request) => {
  const raw = req.header(HEADER);
  if (raw) {
    return raw;
  }
  if (config.allowDevInitData && config.mockInitData) {
    return config.mockInitData;
  }
  return null;
};

export const telegramAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const initData = getInitData(req);
    if (!initData) {
      return res.status(401).json({ message: 'Unauthorized: missing Telegram init data' });
    }

    const parsed = parseInitData(initData, config.telegramBotToken, config.allowDevInitData);
    const user = await findOrCreateUser(parsed.user);
    const subscription = await getSubscriptionStatus(user.id);
    const isAdmin = config.adminTelegramIds.includes(String(parsed.user.id));

    req.auth = {
      id: user.id,
      telegramUserId: user.telegram_user_id,
      username: user.username ?? undefined,
      isAdmin,
      lastCharacterId: user.last_character_id ?? undefined,
    };

    res.locals.subscription = subscription;

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized', error: (error as Error).message });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth?.isAdmin) {
    return res.status(403).json({ message: 'admin only' });
  }
  return next();
};

/** Validate Telegram initData for WebSocket auth (no Express context) */
export const validateTelegramInitData = async (initData: string) => {
  // Use mock data in dev mode if provided initData matches mock or is empty-ish
  const dataToValidate = (config.allowDevInitData && config.mockInitData)
    ? config.mockInitData
    : initData;

  const parsed = parseInitData(dataToValidate, config.telegramBotToken, config.allowDevInitData);
  const user = await findOrCreateUser(parsed.user);

  return {
    id: user.id,
    telegramUserId: user.telegram_user_id,
    username: user.username ?? undefined,
    isAdmin: config.adminTelegramIds.includes(String(parsed.user.id)),
  };
};

