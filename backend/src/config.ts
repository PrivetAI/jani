import dotenv from 'dotenv';
import { z } from 'zod';
import { DRIVER_PROMPT } from './prompts/index.js';

dotenv.config();

const defaults = {
  port: 3000,
  freeDailyMessageLimit: 50,
  subscriptionDurationDays: 30,
  webAppUrl: 'http://localhost:4173',
  adminTelegramIds: [] as string[],
  allowDevInitData: false,
  mockInitData: '',
  llmDefaultTemperature: 0.95,
  llmDefaultTopP: 0.9,
  llmDefaultRepetitionPenalty: 1.12,
  chatTokenBudget: 0, // 0 или меньше = не ограничивать бюджет промпта
  chatResponseReserve: 450,
  chatSummaryTokenLimit: 900,
  chatStopSequences: ['User:', '\nUser', '\nПользователь'],
  chatTemperature: 1.02,
  chatTopP: 0.9,
  chatRepetitionPenalty: 1.12,
  summaryTemperature: 0.4,
  summaryTopP: 0.9,
  summaryRepetitionPenalty: 1.05,
  summaryMaxTokens: 0, // 0 или меньше = не ограничивать бюджет промпта
};

const stringToInt = (value: string | undefined, fallback: number, label: string) => {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${label}: "${value}"`);
  }
  return parsed;
};

const stringToFloat = (value: string | undefined, fallback: number, label: string) => {
  if (value === undefined) return fallback;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${label}: "${value}"`);
  }
  return parsed;
};

const envSchema = z.object({
  DATABASE_URL: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_BOT_USERNAME: z.string(),
  OPENROUTER_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PORT: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_EXTERNAL_URL: z.string().optional(),
  TELEGRAM_AUTO_WEBHOOK: z.string().optional(),
  NGROK_API_URL: z.string().optional(),
  ADMIN_TELEGRAM_IDS: z.string().optional(),
  AUTH_ALLOW_DEV_INIT_DATA: z.enum(['true', 'false']).optional(),
  MOCK_TELEGRAM_INIT_DATA: z.string().optional(),
  FREE_DAILY_MESSAGE_LIMIT: z.string().optional(),
  SUBSCRIPTION_DURATION_DAYS: z.string().optional(),
  WEBAPP_URL: z.string().optional(),
  WEBAPP_PUBLIC_URL: z.string().optional(),
  LLM_TEMPERATURE: z.string().optional(),
  LLM_TOP_P: z.string().optional(),
  LLM_REPETITION_PENALTY: z.string().optional(),
  CHAT_TOKEN_BUDGET: z.string().optional(),
  CHAT_RESPONSE_RESERVE: z.string().optional(),
  CHAT_SUMMARY_TOKEN_LIMIT: z.string().optional(),
  CHAT_STOP_SEQUENCES: z.string().optional(),
  CHAT_TEMPERATURE: z.string().optional(),
  CHAT_TOP_P: z.string().optional(),
  CHAT_REPETITION_PENALTY: z.string().optional(),
  SUMMARY_TEMPERATURE: z.string().optional(),
  SUMMARY_TOP_P: z.string().optional(),
  SUMMARY_REPETITION_PENALTY: z.string().optional(),
  SUMMARY_MAX_TOKENS: z.string().optional(),
  DRIVER_PROMPT: z.string().optional(),
});

const env = envSchema.parse(process.env);

const parseStopSequences = (raw: string | undefined) => {
  if (!raw) {
    return defaults.chatStopSequences;
  }
  return raw
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const config = {
  port: stringToInt(env.PORT, defaults.port, 'PORT'),
  databaseUrl: env.DATABASE_URL,
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  telegramBotUsername: env.TELEGRAM_BOT_USERNAME,
  telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? 'dev-secret',
  telegramWebhookExternalUrl: env.TELEGRAM_WEBHOOK_EXTERNAL_URL,
  telegramAutoWebhook: env.TELEGRAM_AUTO_WEBHOOK === 'true',
  ngrokApiUrl: env.NGROK_API_URL ?? 'http://ngrok:4040/api/tunnels',
  adminTelegramIds:
    env.ADMIN_TELEGRAM_IDS?.split(',').map((item) => item.trim()).filter(Boolean) ?? defaults.adminTelegramIds,
  allowDevInitData:
    env.AUTH_ALLOW_DEV_INIT_DATA !== undefined ? env.AUTH_ALLOW_DEV_INIT_DATA === 'true' : defaults.allowDevInitData,
  mockInitData: env.MOCK_TELEGRAM_INIT_DATA ?? defaults.mockInitData,
  openRouterApiKey: env.OPENROUTER_API_KEY,
  freeDailyMessageLimit: stringToInt(env.FREE_DAILY_MESSAGE_LIMIT, defaults.freeDailyMessageLimit, 'FREE_DAILY_MESSAGE_LIMIT'),
  subscriptionDurationDays: stringToInt(
    env.SUBSCRIPTION_DURATION_DAYS,
    defaults.subscriptionDurationDays,
    'SUBSCRIPTION_DURATION_DAYS'
  ),
  webAppUrl: env.WEBAPP_URL ?? defaults.webAppUrl,
  webAppPublicUrl: env.WEBAPP_PUBLIC_URL ?? env.WEBAPP_URL ?? defaults.webAppUrl,
  llmDefaultTemperature: stringToFloat(env.LLM_TEMPERATURE, defaults.llmDefaultTemperature, 'LLM_TEMPERATURE'),
  llmDefaultTopP: stringToFloat(env.LLM_TOP_P, defaults.llmDefaultTopP, 'LLM_TOP_P'),
  llmDefaultRepetitionPenalty: stringToFloat(
    env.LLM_REPETITION_PENALTY,
    defaults.llmDefaultRepetitionPenalty,
    'LLM_REPETITION_PENALTY'
  ),
  geminiApiKey: env.GEMINI_API_KEY,
  openaiApiKey: env.OPENAI_API_KEY,
  chatTokenBudget: stringToInt(env.CHAT_TOKEN_BUDGET, defaults.chatTokenBudget, 'CHAT_TOKEN_BUDGET'),
  chatResponseReserve: stringToInt(env.CHAT_RESPONSE_RESERVE, defaults.chatResponseReserve, 'CHAT_RESPONSE_RESERVE'),
  chatSummaryTokenLimit: stringToInt(
    env.CHAT_SUMMARY_TOKEN_LIMIT,
    defaults.chatSummaryTokenLimit,
    'CHAT_SUMMARY_TOKEN_LIMIT'
  ),
  chatStopSequences: parseStopSequences(env.CHAT_STOP_SEQUENCES),
  chatTemperature: stringToFloat(env.CHAT_TEMPERATURE, defaults.chatTemperature, 'CHAT_TEMPERATURE'),
  chatTopP: stringToFloat(env.CHAT_TOP_P, defaults.chatTopP, 'CHAT_TOP_P'),
  chatRepetitionPenalty: stringToFloat(
    env.CHAT_REPETITION_PENALTY,
    defaults.chatRepetitionPenalty,
    'CHAT_REPETITION_PENALTY'
  ),
  summaryTemperature: stringToFloat(env.SUMMARY_TEMPERATURE, defaults.summaryTemperature, 'SUMMARY_TEMPERATURE'),
  summaryTopP: stringToFloat(env.SUMMARY_TOP_P, defaults.summaryTopP, 'SUMMARY_TOP_P'),
  summaryRepetitionPenalty: stringToFloat(
    env.SUMMARY_REPETITION_PENALTY,
    defaults.summaryRepetitionPenalty,
    'SUMMARY_REPETITION_PENALTY'
  ),
  summaryMaxTokens: stringToInt(env.SUMMARY_MAX_TOKENS, defaults.summaryMaxTokens, 'SUMMARY_MAX_TOKENS'),
  driverPrompt: env.DRIVER_PROMPT ?? DRIVER_PROMPT,
};

export type AppConfig = typeof config;
