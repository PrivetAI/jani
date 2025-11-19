import TelegramBot from 'node-telegram-bot-api'

type BotOptions = {
  token: string
  polling?: boolean
}

export const createTelegramBot = ({ token, polling = false }: BotOptions) => {
  const bot = new TelegramBot(token, polling ? { polling: true } : { webHook: { port: Number(process.env.PORT) || 3002 } })
  return bot
}

export const sendPlaceholderMessage = async (bot: TelegramBot, chatId: number, text: string) => {
  await bot.sendMessage(chatId, text)
}

export type TelegramBotInstance = TelegramBot
