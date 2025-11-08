import { PrismaClient } from '@prisma/client';

let instance: PrismaClient | null = null;

export type DatabaseClient = PrismaClient;

export const getPrismaClient = (): PrismaClient => {
  if (!instance) {
    const url = process.env.PG_DSN;
    instance = new PrismaClient({
      datasources: url
        ? {
            db: {
              url,
            },
          }
        : undefined,
    });
  }
  return instance;
};
