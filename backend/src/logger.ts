import fs from 'fs';
import path from 'path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
};

// Log directory - use /app/logs in Docker, or ./logs locally
const LOG_DIR = process.env.LOG_DIR || './logs';

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch {
  // Ignore - will log to console only
}

// Get current date string for log filename (YYYY-MM-DD)
const getDateString = () => new Date().toISOString().split('T')[0];

// Get current log file path
const getLogFilePath = (date?: string) => path.join(LOG_DIR, `${date || getDateString()}.log`);

// Format log entry as single line
const formatLogEntry = (level: string, msg: string, meta?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${msg}${metaStr}`;
};

// Write to log file (async to not block)
const writeToFile = (entry: string) => {
  try {
    const logFile = getLogFilePath();
    fs.appendFile(logFile, entry + '\n', (err) => {
      if (err && process.env.DEBUG === '1') {
        console.error('Failed to write to log file:', err.message);
      }
    });
  } catch {
    // Ignore file write errors
  }
};

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    const entry = formatLogEntry('INFO', msg, meta);
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${msg}`, meta ?? '');
    writeToFile(entry);
  },

  warn: (msg: string, meta?: Record<string, unknown>) => {
    const entry = formatLogEntry('WARN', msg, meta);
    // eslint-disable-next-line no-console
    console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`, meta ?? '');
    writeToFile(entry);
  },

  error: (msg: string, meta?: Record<string, unknown>) => {
    const entry = formatLogEntry('ERROR', msg, meta);
    // eslint-disable-next-line no-console
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`, meta ?? '');
    writeToFile(entry);
  },

  llmRequest: (msg: string, meta?: Record<string, unknown>) => {
    const entry = formatLogEntry('LLM_REQ', msg, meta);
    // eslint-disable-next-line no-console
    console.log(`${colors.magenta}[LLM ЗАПРОС]${colors.reset} ${msg}`, meta ?? '');
    writeToFile(entry);
  },

  llmResponse: (msg: string, meta?: Record<string, unknown>) => {
    const entry = formatLogEntry('LLM_RES', msg, meta);
    // eslint-disable-next-line no-console
    console.log(`${colors.green}[LLM ОТВЕТ]${colors.reset} ${msg}`, meta ?? '');
    writeToFile(entry);
  },

  debug: (msg: string, meta?: Record<string, unknown>) => {
    // Only log when DEBUG=1 or LOG_LEVEL=debug
    if (process.env.DEBUG === '1' || process.env.LOG_LEVEL === 'debug') {
      const entry = formatLogEntry('DEBUG', msg, meta);
      // eslint-disable-next-line no-console
      console.log(`${colors.cyan}[DEBUG]${colors.reset} ${msg}`, meta ?? '');
      writeToFile(entry);
    }
  },

  // Chat-specific logging (for tracking user messages)
  chat: (userId: number, characterId: number, role: 'user' | 'assistant', message: string) => {
    const entry = formatLogEntry('CHAT', `[U:${userId} C:${characterId}] ${role}: ${message.slice(0, 500)}`);
    writeToFile(entry);
  },
};

// === Log Sender to Telegram ===

export const getYesterdayLogPath = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  return { path: getLogFilePath(dateStr), date: dateStr };
};

export const sendLogToTelegram = async (botToken: string, chatId: string): Promise<boolean> => {
  const { path: logPath, date } = getYesterdayLogPath();

  if (!fs.existsSync(logPath)) {
    logger.info(`No log file found for ${date}, skipping send`);
    return true;
  }

  const stats = fs.statSync(logPath);
  if (stats.size === 0) {
    logger.info(`Log file for ${date} is empty, skipping send`);
    return true;
  }

  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', `📋 Logs for ${date}`);
    form.append('document', fs.createReadStream(logPath), `logs_${date}.txt`);

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      {
        method: 'POST',
        body: form as unknown as BodyInit,
      }
    );

    const result = await response.json() as { ok: boolean };

    if (result.ok) {
      logger.info(`Logs for ${date} sent to Telegram successfully`);
      // Delete the log file after successful send
      fs.unlinkSync(logPath);
      return true;
    } else {
      logger.error(`Failed to send logs to Telegram`, { result });
      return false;
    }
  } catch (err) {
    logger.error(`Error sending logs to Telegram`, { error: (err as Error).message });
    return false;
  }
};
