
import { query, pool } from './pool.js';
import { logger } from '../logger.js';

async function migrate() {
    try {
        logger.info('Starting migration...');

        await query(`
            ALTER TABLE characters 
            ADD COLUMN IF NOT EXISTS llm_provider TEXT,
            ADD COLUMN IF NOT EXISTS llm_model TEXT;
        `);

        await query(`
            ALTER TABLE chat_sessions 
            ADD COLUMN IF NOT EXISTS llm_model TEXT;
        `);

        logger.info('Migration added llm columns successfully.');
    } catch (e) {
        logger.error('Migration failed', { error: e });
    } finally {
        await pool.end();
    }
}

migrate();
