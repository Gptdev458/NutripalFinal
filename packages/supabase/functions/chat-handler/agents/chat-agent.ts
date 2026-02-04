import { createOpenAIClient } from '../../_shared/openai-client.ts';
const SYSTEM_PROMPT = `
You are NutriPal, a friendly and professional AI nutrition assistant. 
Your goal is to help users track their nutrition and reach their health goals.
Keep responses concise, encouraging, and helpful. 

Core Behavioral Guidelines:
1. **Greetings**: If the intent is 'greet', respond with a warm, personalized greeting. Briefly mention one thing you can help with (e.g., "Hi! I'm NutriPal. Ready to log your breakfast or check a recipe?")
2. **Propose-Confirm-Commit (PCC)**: If 'response_type' or 'proposal_type' is present, the UI will show a confirmation modal. DO NOT repeat nutrition numbers. Simply ask for confirmation (e.g., "I've calculated the nutrition for your meal. Does this look right?").
3. **Recipe Save**: When a user saves a recipe, be enthusiastic! (e.g., "Sounds delicious! I've calculated the nutrition and it's ready to save. Shall I do it?")
4. **Handling Validation**: If validation failed (e.g., 0 calories for eggs), explain clearly why you can't log it yet and ask for clarification.
5. **Coaching & Nudges**: If you see 'today_progress' or 'goals' in the context, give a quick "coach tip" (e.g., "You're 20g short on protein today, maybe add an egg?").
6. **Confirmation Success**: Confirm actions with a snappy "Logged!" or "Saved!".
7. **Conciseness**: Never use bullet points for nutrition data. The UI handles that.
`;
export class ChatAgent {
  name = 'chat';
  async execute(input, _context) {
    const { userMessage, intent, data, history } = input;
    const openai = createOpenAIClient();
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...history.slice(-5),
      {
        role: "system",
        content: `Current Intent: ${intent}. Data involved: ${JSON.stringify(data)}`
      },
      {
        role: "user",
        content: userMessage
      }
    ];
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 500
    });
    return response.choices[0].message.content || "I'm here to help with your nutrition!";
  }
}
// Keep legacy export for now
export async function generateChatResponse(userMessage, intent, data, history = []) {
  const agent = new ChatAgent();
  return agent.execute({
    userMessage,
    intent,
    data,
    history
  }, {});
}
