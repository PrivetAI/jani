import { query } from '../db/pool.js';

export interface AppSetting {
    key: string;
    value: string;
    updated_at: string;
}

/** Get a specific setting */
export const getSetting = async (key: string): Promise<string | null> => {
    const result = await query<AppSetting>(
        'SELECT value FROM app_settings WHERE key = $1',
        [key]
    );
    return result.rows[0]?.value ?? null;
};

/** Get multiple settings */
export const getSettings = async (keys: string[]): Promise<Record<string, string>> => {
    const result = await query<AppSetting>(
        'SELECT key, value FROM app_settings WHERE key = ANY($1)',
        [keys]
    );
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
        settings[row.key] = row.value;
    }
    return settings;
};

/** Get all settings */
export const getAllSettings = async (): Promise<Record<string, string>> => {
    const result = await query<AppSetting>('SELECT key, value FROM app_settings');
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
        settings[row.key] = row.value;
    }
    return settings;
};

/** Set a setting */
export const setSetting = async (key: string, value: string): Promise<void> => {
    await query(
        `INSERT INTO app_settings (key, value, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
    );
};

/** Set multiple settings */
export const setSettings = async (settings: Record<string, string>): Promise<void> => {
    for (const [key, value] of Object.entries(settings)) {
        await setSetting(key, value);
    }
};
