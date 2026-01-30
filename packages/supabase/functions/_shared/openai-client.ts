import OpenAI from 'https://deno.land/x/openai@v4.53.2/mod.ts'

export const createOpenAIClient = () => {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  return new OpenAI({
    apiKey,
    maxRetries: 3,
    timeout: 15 * 1000, // 15 seconds
  })
}
