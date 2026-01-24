// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
};

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${msg}`, meta ?? '');
  },

  warn: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.warn(`${colors.yellow}[WARN]${colors.reset} ${msg}`, meta ?? '');
  },

  error: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`, meta ?? '');
  },

  llmRequest: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log(`${colors.magenta}[LLM ЗАПРОС]${colors.reset} ${msg}`, meta ?? '');
  },

  llmResponse: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log(`${colors.green}[LLM ОТВЕТ]${colors.reset} ${msg}`, meta ?? '');
  },

  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.DEBUG === '1' || process.env.LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.log(`${colors.cyan}[DEBUG]${colors.reset} ${msg}`, meta ?? '');
    }
  },
};
