import { query } from '../db/pool.js';

export interface SubscriptionRecord {
  id: number;
  user_id: number;
  status: 'active' | 'expired';
  start_at: string;
  end_at: string;
  created_at: string;
}

const mapSubscription = (row: any): SubscriptionRecord => ({
  id: row.id,
  user_id: row.user_id,
  status: row.status,
  start_at: row.start_at,
  end_at: row.end_at,
  created_at: row.created_at,
});

export const expireFinishedSubscriptions = async (userId?: number) => {
  if (typeof userId === 'number') {
    await query("UPDATE subscriptions SET status = 'expired' WHERE user_id = $1 AND status = 'active' AND end_at <= NOW()", [userId]);
    return;
  }
  await query("UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND end_at <= NOW()");
};

export const getActiveSubscription = async (userId: number): Promise<SubscriptionRecord | null> => {
  await expireFinishedSubscriptions(userId);
  const result = await query<SubscriptionRecord>(
    `SELECT * FROM subscriptions
     WHERE user_id = $1 AND status = 'active'
     ORDER BY end_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows.length ? mapSubscription(result.rows[0]) : null;
};

export const getSubscriptionStatus = async (userId: number) => {
  await expireFinishedSubscriptions(userId);
  const result = await query<SubscriptionRecord>(
    `SELECT * FROM subscriptions
     WHERE user_id = $1
     ORDER BY end_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!result.rows.length) {
    return { status: 'none' as const, end_at: null };
  }
  const record = mapSubscription(result.rows[0]);
  return { status: record.status, end_at: record.end_at };
};

export const createSubscription = async (
  userId: number,
  durationDays: number
): Promise<SubscriptionRecord> => {
  await query("UPDATE subscriptions SET status = 'expired' WHERE user_id = $1 AND status = 'active'", [userId]);

  const start = new Date();
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + durationDays);

  const result = await query<SubscriptionRecord>(
    `INSERT INTO subscriptions (user_id, status, start_at, end_at)
     VALUES ($1, 'active', $2, $3) RETURNING *`,
    [userId, start.toISOString(), end.toISOString()]
  );

  return mapSubscription(result.rows[0]);
};
