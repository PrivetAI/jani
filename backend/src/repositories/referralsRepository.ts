import { query } from '../db/pool.js';
import { addBonusMessages } from './usersRepository.js';

export interface ReferralReward {
    id: number;
    referrer_id: number;
    referred_id: number;
    reward_type: 'registration' | 'purchase';
    messages_awarded: number;
    created_at: Date;
}

export interface ReferralStats {
    totalReferrals: number;
    totalMessagesEarned: number;
    registrationRewards: number;
    purchaseRewards: number;
}

const REGISTRATION_BONUS = 30;
const PURCHASE_BONUS = 50;

/**
 * Set referrer for a user (only if not already set)
 */
export const setReferrer = async (userId: number, referrerId: number): Promise<boolean> => {
    // Don't allow self-referral
    if (userId === referrerId) return false;

    const result = await query(
        `UPDATE users SET referred_by = $2 
         WHERE id = $1 AND referred_by IS NULL`,
        [userId, referrerId]
    );
    return (result.rowCount ?? 0) > 0;
};

/**
 * Get referrer ID for a user
 */
export const getReferrer = async (userId: number): Promise<number | null> => {
    const result = await query<{ referred_by: number | null }>(
        'SELECT referred_by FROM users WHERE id = $1',
        [userId]
    );
    return result.rows[0]?.referred_by ?? null;
};

/**
 * Record a referral reward and add bonus messages
 */
export const recordReferralReward = async (
    referrerId: number,
    referredId: number,
    rewardType: 'registration' | 'purchase',
    messagesAwarded: number
): Promise<void> => {
    await query(
        `INSERT INTO referral_rewards (referrer_id, referred_id, reward_type, messages_awarded)
         VALUES ($1, $2, $3, $4)`,
        [referrerId, referredId, rewardType, messagesAwarded]
    );
    await addBonusMessages(referrerId, messagesAwarded);
};

/**
 * Check if purchase reward was already given for this referred user
 */
export const hasReceivedPurchaseReward = async (referredId: number): Promise<boolean> => {
    const result = await query<{ count: string }>(
        `SELECT COUNT(*) FROM referral_rewards 
         WHERE referred_id = $1 AND reward_type = 'purchase'`,
        [referredId]
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
};

/**
 * Process registration referral: +30 to referrer, +30 to referred
 */
export const processRegistrationReferral = async (
    newUserId: number,
    referrerId: number
): Promise<boolean> => {
    // Set referrer
    const wasSet = await setReferrer(newUserId, referrerId);
    if (!wasSet) return false;

    // Give bonus to referrer
    await recordReferralReward(referrerId, newUserId, 'registration', REGISTRATION_BONUS);

    // Give bonus to new user
    await addBonusMessages(newUserId, REGISTRATION_BONUS);

    return true;
};

/**
 * Process purchase referral: +50 to referrer (only first purchase)
 */
export const processPurchaseReferral = async (userId: number): Promise<number | null> => {
    const referrerId = await getReferrer(userId);
    if (!referrerId) return null;

    const alreadyRewarded = await hasReceivedPurchaseReward(userId);
    if (alreadyRewarded) return null;

    await recordReferralReward(referrerId, userId, 'purchase', PURCHASE_BONUS);
    return referrerId;
};

/**
 * Get referral statistics for a user
 */
export const getReferralStats = async (userId: number): Promise<ReferralStats> => {
    const result = await query<{
        total_referrals: string;
        total_messages: string;
        registration_rewards: string;
        purchase_rewards: string;
    }>(
        `SELECT 
            COUNT(DISTINCT referred_id) as total_referrals,
            COALESCE(SUM(messages_awarded), 0) as total_messages,
            COUNT(*) FILTER (WHERE reward_type = 'registration') as registration_rewards,
            COUNT(*) FILTER (WHERE reward_type = 'purchase') as purchase_rewards
         FROM referral_rewards
         WHERE referrer_id = $1`,
        [userId]
    );

    const row = result.rows[0];
    return {
        totalReferrals: Number(row?.total_referrals ?? 0),
        totalMessagesEarned: Number(row?.total_messages ?? 0),
        registrationRewards: Number(row?.registration_rewards ?? 0),
        purchaseRewards: Number(row?.purchase_rewards ?? 0),
    };
};
