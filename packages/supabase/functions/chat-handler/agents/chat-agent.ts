import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { Agent, AgentContext } from '../../_shared/types.ts'

const SYSTEM_PROMPT = `
You are NutriPal, a friendly and professional nutrition assistant. 
Your goal is to help users track their nutrition and reach their health goals.
Keep responses concise, encouraging, and helpful. 

Guidelines:
1. If the Current Intent is 'confirm' or the Data indicates a specialized action was completed (e.g., response_type is 'food_logged', 'recipe_saved', 'goal_updated'), use "confirmed" language (e.g., "Logged!", "Saved!", "Done!").
2. If the response_type starts with 'confirmation_' (e.g., 'confirmation_food_log', 'confirmation_recipe_save'), use "proposal" language. DO NOT say you have logged or saved it yet. Instead, say something like "I've found this..." or "I've parsed this recipe for you, does it look right?" and wait for their confirmation.
3. If food was logged, maybe give a small tip or encouragement.
4. If a recipe was saved, confirm the name and number of ingredients.
5. If the user is asking a nutrition question, answer it clearly based on the data provided.
6. If the user is off-topic, gently guide them back to talking about food, nutrition, or their health goals.
7. If you need more information (clarification), ask for it politely.
8. Use the provided insights (if any) to make your response more personalized.
`

export interface ChatInput {
  userMessage: string
  intent: string
  data: any
  history: { role: string, content: string }[]
}

export class ChatAgent implements Agent<ChatInput, string> {
  name = 'chat'

  async execute(input: ChatInput, _context: AgentContext): Promise<string> {
    const { userMessage, intent, data, history } = input
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
}

// Keep legacy export for now
export async function generateChatResponse(
  userMessage: string,
  intent: string,
  data: any,
  history: { role: string, content: string }[] = []
): Promise<string> {
  const agent = new ChatAgent()
  return agent.execute({ userMessage, intent, data, history }, {} as any)
}
