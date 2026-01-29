import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { IntentExtraction, Agent, AgentContext } from '../../_shared/types.ts'

const SYSTEM_PROMPT = `
You are a nutrition assistant's intent classifier. Your job is to analyze user messages and classify them into one of the following categories:
- log_food: User wants to log a specific food item or meal.
- log_recipe: User wants to log a recipe they previously saved or a known recipe name.
- save_recipe: User wants to save a new recipe with its ingredients/instructions. IMPORTANT: If the user provides a detailed list of ingredients or instructions, always prefer 'save_recipe'.
- query_nutrition: User is asking about the nutritional content of a food without logging it.
- update_goals: User wants to add, remove, or edit their nutritional goals (calories, macros, etc.).
- suggest_goals: User wants the AI to recommend or help them set goals based on their profile or objectives.
- clarify: User is providing additional information to a previous request (e.g., specifying a portion size after being asked).
- decline: User is rejecting a proposed action (e.g., "No, cancel", "Don't save", "Never mind").
- confirm: User is agreeing to a proposed action (e.g., "Yes, log it", "Looks good", "Confirm", "Yes, save recipe").
- save_recipe: User wants to save a new recipe with its ingredients/instructions. IMPORTANT: If the user provides a detailed list of ingredients or instructions, always prefer 'save_recipe'. If the user says "Yes, save recipe" in response to a proposal, it is 'confirm'.
- modify: User wants to change details of a proposed action (e.g., "Actually make that 2 eggs", "Change the portion to 100g").
- off_topic: User is talking about something unrelated to nutrition or health.

CRITICAL HEURISTIC: If the user message is long (e.g., > 200 characters) and looks like a list of ingredients (e.g., "2 cups flour, 1 egg, 500g chicken...") or has step-by-step instructions, classify it as 'save_recipe'.
If the user message is short and affirmative (e.g., "Yes", "Save it", "Confirm", "Yes, save recipe"), classify it as 'confirm'.

You MUST return a JSON object with the following structure:
{
  "intent": "log_food" | "log_recipe" | "save_recipe" | "query_nutrition" | "update_goals" | "suggest_goals" | "clarify" | "confirm" | "decline" | "modify" | "off_topic",
  "food_items": ["item1", "item2"], // Only for log_food, query_nutrition, clarify
  "portions": ["portion1", "portion2"], // Corresponds to food_items
  "recipe_text": "text", // Full text for save_recipe or recipe name for log_recipe
  "recipe_portion": "portion", // e.g., "2 servings", "half", "300g". Only for log_recipe
  "goal_action": "add" | "remove" | "update" | "recommend", // Only for update_goals, suggest_goals
  "nutrient": "string", // Nutrient name for goal updates
  "value": number, // Target value for goal updates
  "unit": "string", // Unit for goal updates (e.g., "kcal", "g", "mg")
  "clarification_needed": "question", // Only if the message is too vague to classify
  "modification_details": "string", // Natural language description of what to change for 'modify' intent
  "modified_items": [{ "item": "string", "portion": "string" }] // Optional structured extraction for modifications
}

Examples:
1. "I ate 2 apples and a cup of yogurt" -> {"intent": "log_food", "food_items": ["apple", "yogurt"], "portions": ["2", "1 cup"]}
2. "How many calories in a pizza slice?" -> {"intent": "query_nutrition", "food_items": ["pizza slice"], "portions": ["1"]}
3. "Save my Grandma's cookies recipe: 2 cups flour, 1 cup sugar..." -> {"intent": "save_recipe", "recipe_text": "2 cups flour, 1 cup sugar..."}
4. "Set my daily calorie goal to 2000" -> {"intent": "update_goals", "goal_action": "update", "nutrient": "calories", "value": 2000, "unit": "kcal"}
5. "Help me with my goals and nutrients" -> {"intent": "suggest_goals", "goal_action": "recommend"}
6. "Log a double serving of my saved Lasagna" -> {"intent": "log_recipe", "recipe_text": "Lasagna", "recipe_portion": "double serving"}
7. "Actually it was 3 apples" -> {"intent": "clarify", "food_items": ["apple"], "portions": ["3"]}
8. "Yes, looks good" -> {"intent": "confirm"}
9. "No, wait, I didn't eat that" -> {"intent": "decline"}
10. "Change the chicken to 200g" -> {"intent": "modify", "modification_details": "change chicken to 200g", "modified_items": [{"item": "chicken", "portion": "200g"}]}
11. "it's called tuna pasta" -> {"intent": "log_recipe", "recipe_text": "tuna pasta"}
12. "can you recommend a protein goal?" -> {"intent": "suggest_goals", "goal_action": "recommend"}
13. "make the portion smaller, say half" -> {"intent": "modify", "modification_details": "make portion half", "modified_items": [{"portion": "half"}]}
14. "not 2 eggs, just 1" -> {"intent": "modify", "modification_details": "change 2 eggs to 1", "modified_items": [{"item": "egg", "portion": "1"}]}
15. "Forget about the pizza" -> {"intent": "decline"}
16. "Confirmed, log the salad" -> {"intent": "confirm"}
17. "What's in an avocado?" -> {"intent": "query_nutrition", "food_items": ["avocado"], "portions": ["1"]}
18. "log chicken soup" -> {"intent": "log_recipe", "recipe_text": "chicken soup"}
19. "log my lasagna" -> {"intent": "log_recipe", "recipe_text": "lasagna"}
20. "log 8oz of the soup" -> {"intent": "log_recipe", "recipe_text": "soup", "recipe_portion": "8oz"}
18. "I had some almonds too" -> {"intent": "log_food", "food_items": ["almonds"], "portions": ["some"]}
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
      model: "gpt-4o",
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
