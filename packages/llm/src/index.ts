import OpenAI from 'openai'

export type GenerateOptions = {
  model?: string
  prompt: string
}

const createClient = () => {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }
  return new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })
}

export const generateText = async ({ model = 'openrouter/codellama-34b', prompt }: GenerateOptions) => {
  const client = createClient()
  const completion = await client.responses.create({
    model,
    input: prompt,
  })
  return completion.output?.[0]?.content?.[0]?.text ?? ''
}
