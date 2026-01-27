import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { IntentExtraction } from '../../_shared/types.ts'

const SYSTEM_PROMPT = `
You are a nutrition assistant's intent classifier. Your job is to analyze user messages and classify them into one of the following categories:
- log_food: User wants to log a specific food item or meal.
- log_recipe: User wants to log a recipe they previously saved or a known recipe name.
- save_recipe: User wants to save a new recipe with its ingredients/instructions.
- query_nutrition: User is asking about the nutritional content of a food without logging it.
- update_goals: User wants to change their nutritional goals (calories, macros, etc.).
- clarify: User is providing additional information to a previous request.
- off_topic: User is talking about something unrelated to nutrition or health.

You MUST return a JSON object with the following structure:
{
  "intent": "log_food" | "log_recipe" | "save_recipe" | "query_nutrition" | "update_goals" | "clarify" | "off_topic",
  "food_items": ["item1", "item2"], // Only for log_food, query_nutrition
  "portions": ["portion1", "portion2"], // Corresponds to food_items
  "recipe_text": "text", // Full text for save_recipe or recipe name for log_recipe
  "clarification_needed": "question" // Only if the message is too vague to classify
}

Examples:
1. "I ate 2 apples and a cup of yogurt" -> {"intent": "log_food", "food_items": ["apple", "yogurt"], "portions": ["2", "1 cup"]}
2. "How many calories in a pizza slice?" -> {"intent": "query_nutrition", "food_items": ["pizza slice"], "portions": ["1"]}
3. "Save my Grandma's cookies recipe: 2 cups flour, 1 cup sugar..." -> {"intent": "save_recipe", "recipe_text": "2 cups flour, 1 cup sugar..."}
4. "Set my daily calorie goal to 2000" -> {"intent": "update_goals"}
`;

export async function classifyIntent(message: string): Promise<IntentExtraction> {
  const openai = createOpenAIClient()

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message }
    ],
    response_format: { type: "json_object" }
  })

  const content = response.choices[0].message.content
  if (!content) {
    throw new Error('No content returned from OpenAI')
  }

  return JSON.parse(content) as IntentExtraction
}
