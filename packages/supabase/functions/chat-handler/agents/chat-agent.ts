import { createOpenAIClient } from '../../_shared/openai-client.ts'

const SYSTEM_PROMPT = `
You are NutriPal, a friendly and professional nutrition assistant. 
Your goal is to help users track their nutrition and reach their health goals.
Keep responses concise, encouraging, and helpful. 

Guidelines:
1. If food was logged, confirm it and maybe give a small tip or encouragement.
2. If a recipe was saved, confirm the name and number of ingredients.
3. If the user is asking a nutrition question, answer it clearly based on the data provided.
4. If the user is off-topic, gently guide them back to talking about food, nutrition, or their health goals.
5. If you need more information (clarification), ask for it politely.
`

export async function generateChatResponse(
  userMessage: string, 
  intent: string, 
  data: any, 
  history: { role: string, content: string }[] = []
): Promise<string> {
  const openai = createOpenAIClient()

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-5), // Last 5 messages for context
    { 
      role: "system", 
      content: `Current Intent: ${intent}. Data involved: ${JSON.stringify(data)}` 
    },
    { role: "user", content: userMessage }
  ]

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages as any,
    max_tokens: 500,
  })

  return response.choices[0].message.content || "I'm here to help with your nutrition!"
}
