import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { IntentExtraction, Agent, AgentContext } from '../../_shared/types.ts'

const SYSTEM_PROMPT = `
You are a nutrition assistant's intent classifier. Your job is to analyze user messages and classify them into one of the following categories:
- log_food: User wants to log a specific food item or meal.
- log_recipe: User wants to log a recipe they previously saved.
- save_recipe: User wants to save a new recipe with its ingredients/instructions.
- query_nutrition: User is asking about the nutritional content of a food without logging it.
- update_goals: User wants to add, remove, or edit their nutritional goals.
- suggest_goals: User wants goals recommendations.
- clarify: User is providing MISSING information that the AI previously asked for (e.g., specifying a portion size after being asked "How much?").
- modify: User is CHANGING or CORRECTING information that has already been proposed or identified (e.g., "Actually make that 2 eggs", "No, it was 300g", "I meant the small one").
- decline: User is rejecting a proposed action or wanting to stop the current flow entirely.
- confirm: User is agreeing to a proposed action (e.g., "Yes", "Log it", "Save it").
- greet: User is just saying hello or starting a conversation (e.g., "Hi", "Hello", "Hey NutriPal").
- off_topic: User is talking about something unrelated to nutrition, food logging, or health goals.

INTENT PRIORITIZATION & FLOW BREAKING:
1. If a user asks a question while in a "confirm" flow (e.g., "How many calories are in this?"), classify it as 'query_nutrition' rather than 'confirm/clarify'.
2. If a user provides a new food item while in a flow (e.g., "I also had a banana"), classify it as 'log_food'.
3. 'modify' takes precedence over 'confirm' if any contradictory details are present.

You MUST return a JSON object:
{
  "intent": "log_food" | "log_recipe" | "save_recipe" | "query_nutrition" | "update_goals" | "suggest_goals" | "clarify" | "confirm" | "decline" | "modify" | "greet" | "off_topic",
  "food_items": string[], 
  "portions": string[], 
  "calories": number,
  "macros": { "protein": number, "carbs": number, "fat": number },
  "recipe_text": string,
  "recipe_portion": string,
  "goal_action": "add" | "remove" | "update" | "recommend",
  "nutrient": string,
  "value": number,
  "unit": string,
  "modification_details": string,
  "modified_items": [{ "item": "string", "portion": "string" }]
}

Examples:
1. "Actually it was 3 apples" (Proposed: 1 apple) -> {"intent": "modify", "modification_details": "change quantity to 3", "modified_items": [{"item": "apple", "portion": "3"}]}
2. "No, use 100g instead" -> {"intent": "modify", "modification_details": "change weight to 100g", "modified_items": [{"portion": "100g"}]}
3. "Wait, how much protein is in this?" -> {"intent": "query_nutrition", "food_items": ["this"]}
4. "1 cup" (Asked: "How much rice?") -> {"intent": "clarify", "portions": ["1 cup"]}
5. "Stop this" -> {"intent": "decline"}
6. "Change the chicken to salmon" -> {"intent": "modify", "modification_details": "change chicken to salmon", "modified_items": [{"item": "salmon"}]}
7. "Log a waffle for 110 calories" -> {"intent": "log_food", "food_items": ["waffle"], "calories": 110}
8. "Had a protein shake: 200 kcal, 30g protein" -> {"intent": "log_food", "food_items": ["protein shake"], "calories": 200, "macros": {"protein": 30}}
9. "Just 500 kcal" -> {"intent": "log_food", "calories": 500}
`;

export class IntentAgent implements Agent<{ message: string, history: any[] }, IntentExtraction> {
  name = 'intent'

  async execute(input: { message: string, history: any[] }, _context: AgentContext): Promise<IntentExtraction> {
    const { message, history } = input
    const openai = createOpenAIClient()

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-5), // Last 5 messages for context
      { role: "user", content: message }
    ]

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages as any,
      response_format: { type: "json_object" }
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('No content returned from OpenAI')
    }

    return JSON.parse(content) as IntentExtraction
  }
}

// Keep legacy export for now to avoid breaking orchestrator immediately
export async function classifyIntent(message: string): Promise<IntentExtraction> {
  const agent = new IntentAgent()
  return agent.execute({ message, history: [] }, {} as any)
}
