import { query } from '../db/pool.js';

export interface PaymentRecord {
  id: number;
  user_id: number;
  amount_stars: number;
  telegram_payment_id: string | null;
  status: 'pending' | 'success' | 'canceled' | 'error';
  created_at: string;
}

const mapPayment = (row: any): PaymentRecord => ({
  id: row.id,
  user_id: row.user_id,
  amount_stars: row.amount_stars,
  telegram_payment_id: row.telegram_payment_id,
  status: row.status,
  created_at: row.created_at,
});

export const recordPayment = async (
  userId: number,
  amount: number,
  status: PaymentRecord['status'],
  telegramPaymentId?: string | null
): Promise<PaymentRecord> => {
  const result = await query<PaymentRecord>(
    `INSERT INTO payments (user_id, amount_stars, status, telegram_payment_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, amount, status, telegramPaymentId ?? null]
  );
  return mapPayment(result.rows[0]);
};
