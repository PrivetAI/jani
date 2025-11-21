import { query } from '../db/pool.js';

export interface BasicStats {
  totalUsers: number;
  activeSubscriptions: number;
  messagesCount: number;
  topCharactersByUsers: { character_id: number; name: string; users: number }[];
  topCharactersByMessages: { character_id: number; name: string; messages: number }[];
}

const periodToInterval: Record<string, string> = {
  day: '1 day',
  week: '7 day',
  month: '30 day',
};

export const loadStats = async (period: keyof typeof periodToInterval = 'day'): Promise<BasicStats> => {
  const interval = periodToInterval[period] ?? periodToInterval.day;
  const [{ rows: totalUsersRows }, { rows: activeSubsRows }, { rows: messagesRows }] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) FROM users'),
    query<{ count: string }>("SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND end_at > NOW()"),
    query<{ count: string }>(
      `SELECT COUNT(*) FROM dialogs WHERE created_at >= NOW() - INTERVAL '${interval}'`
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

  return {
    totalUsers: Number(totalUsersRows[0]?.count ?? 0),
    activeSubscriptions: Number(activeSubsRows[0]?.count ?? 0),
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
};
