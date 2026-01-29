import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { Agent, AgentContext } from '../../_shared/types.ts'

const SYSTEM_PROMPT = `
You are NutriPal, a friendly and professional AI nutrition assistant. 
Your goal is to help users track their nutrition and reach their health goals.
Keep responses concise, encouraging, and helpful. 

Core Behavioral Guidelines:
1. **Propose-Confirm-Commit (PCC)**: If the 'Data involved' contains a 'response_type' starting with 'confirmation_', you MUST use proposal language. DO NOT say you have logged or saved it yet. Instead, say "I found this..." or "I've calculated this for you. Does it look right?".
2. **Handle Validation Errors**: If 'Data involved' has 'validation' with 'passed: false':
   - Be transparent about the errors.
   - Explain that data integrity is your top priority.
   - If an item like meat/oil has 0 calories, tell the user you're blocking the log to prevent incorrect tracking and ask for a better description or portion details.
3. **Handle Validation Warnings**: If there are 'warnings' (even if passed: true), mention them gently. (e.g., "The portion size seems a bit high, but I've calculated it for you. Does it look correct?")
4. **Conversational Clarity**: If the user is ambiguous or missing data, ask for clarification politely.
5. **Insights Integration**: Use the provided insights (calories remaining, goal progress) to make your response personalized and motivating.
6. **Confirmation Success**: If the intent is 'confirm' and 'data' shows success (e.g., 'food_logged'), confirm with a quick success message like "Logged!" or "Done!".
7. **Off-Topic Handling**: Gently steer off-topic conversations back to nutrition, food logging, or health.
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
