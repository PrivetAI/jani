export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${msg}`, meta ?? '');
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${msg}`, meta ?? '');
  },
};
