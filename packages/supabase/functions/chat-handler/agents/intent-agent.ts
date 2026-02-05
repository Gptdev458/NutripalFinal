import { createOpenAIClient } from '../../_shared/openai-client.ts';
const SYSTEM_PROMPT = `
You are a nutrition assistant's intent classifier. Your job is to analyze user messages and classify them into one of the following categories:
- log_food: User wants to log a specific food item or meal.
- log_recipe: User wants to log a recipe they previously saved.
- save_recipe: User wants to save a new recipe.
- query_nutrition: User is asking about nutritional content.
- update_goals: User wants to edit goals.
- suggest_goals: User wants recommendations.
- clarify: User providing missing info for a pending item.
- modify: User changing/correcting info for a pending item.
- decline: User rejecting the current action or suggestion.
- confirm: User explicitly agreeing to the PREVIOUSLY mentioned item (e.g., "yes", "do it", "looks good").
- greet: Hello.
- off_topic: Unrelated.

CRITICAL: If the user message describes a NEW food item (e.g., "log chicken"), it MUST be classified as "log_food", even if there is an active confirmation modal for a different item. Do NOT classify a message as "confirm" if it contains new food names that were not part of the previous turn.

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
`;
export class IntentAgent {
  name = 'intent';
  async execute(input, _context) {
    const { message, history } = input;
    const openai = createOpenAIClient();
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...history.slice(-5),
      {
        role: "user",
        content: message
      }
    ];
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      response_format: {
        type: "json_object"
      }
    });
    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");
    return JSON.parse(content);
  }
}
