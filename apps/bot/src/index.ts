import dotenv from 'dotenv'
import { createTelegramBot } from '@jani/telegram'

dotenv.config()

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set. Bot will not start.')
  process.exit(0)
}

const bot = createTelegramBot({ token, polling: true })

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Привет! Это заглушка бота Jani.')
})

bot.on('message', async (msg) => {
  if (!msg.text) return
  if (msg.text === '/ping') {
    await bot.sendMessage(msg.chat.id, 'pong')
  }
})

console.log('🤖 Telegram bot placeholder is running (polling mode).')
