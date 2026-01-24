import { query } from '../db/pool.js';

export interface BasicStats {
  totalUsers: number;
  newUsersToday: number;
  activeSubscriptions: number;
  totalMessages: number;
  messagesCount: number;
  topCharactersByUsers: { character_id: number; name: string; users: number }[];
  topCharactersByMessages: { character_id: number; name: string; messages: number }[];
}

const periodToInterval: Record<string, string> = {
  day: '1 day',
  week: '7 day',
  month: '30 day',
};

// Cache stats for 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000;
const statsCache: Map<string, { data: BasicStats; cachedAt: number }> = new Map();

export const loadStats = async (period: keyof typeof periodToInterval = 'day'): Promise<BasicStats> => {
  const cacheKey = `stats_${period}`;
  const cached = statsCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const interval = periodToInterval[period] ?? periodToInterval.day;
  const [
    { rows: totalUsersRows },
    { rows: newUsersRows },
    { rows: activeSubsRows },
    { rows: totalMessagesRows },
    { rows: messagesRows },
  ] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) FROM users'),
    query<{ count: string }>(`SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '1 day'`),
    query<{ count: string }>("SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND end_at > NOW()"),
    query<{ count: string }>("SELECT COUNT(*) FROM dialogs WHERE role = 'user'"),
    query<{ count: string }>(
      `SELECT COUNT(*) FROM dialogs WHERE role = 'user' AND created_at >= NOW() - INTERVAL '${interval}'`
    ),
  ]);

  const [topUsers, topMessages] = await Promise.all([
    query<{ character_id: number; name: string; users: string }>(
      `SELECT c.id as character_id, c.name, COUNT(DISTINCT d.user_id) as users
       FROM characters c
       JOIN dialogs d ON d.character_id = c.id
       WHERE d.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY c.id
       ORDER BY users DESC
       LIMIT 5`
    ),
    query<{ character_id: number; name: string; messages: string }>(
      `SELECT c.id as character_id, c.name, COUNT(d.id) as messages
       FROM characters c
       JOIN dialogs d ON d.character_id = c.id
       WHERE d.created_at >= NOW() - INTERVAL '${interval}'
       GROUP BY c.id
       ORDER BY messages DESC
       LIMIT 5`
    ),
  ]);

  const result: BasicStats = {
    totalUsers: Number(totalUsersRows[0]?.count ?? 0),
    newUsersToday: Number(newUsersRows[0]?.count ?? 0),
    activeSubscriptions: Number(activeSubsRows[0]?.count ?? 0),
    totalMessages: Number(totalMessagesRows[0]?.count ?? 0),
    messagesCount: Number(messagesRows[0]?.count ?? 0),
    topCharactersByUsers: topUsers.rows.map((row: { character_id: number; name: string; users: string }) => ({
      character_id: row.character_id,
      name: row.name,
      users: Number(row.users),
    })),
    topCharactersByMessages: topMessages.rows.map(
      (row: { character_id: number; name: string; messages: string }) => ({
        character_id: row.character_id,
        name: row.name,
        messages: Number(row.messages),
      })
    ),
  };

  statsCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  return result;
};
