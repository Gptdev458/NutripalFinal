import { createAdminClient } from '../../_shared/supabase-client.ts'
import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { NutritionAgent } from './nutrition-agent.ts'
import { Agent, AgentContext, NutritionData } from '../../_shared/types.ts'

export interface ParsedRecipe {
  recipe_name: string
  servings: number
  ingredients: {
    name: string
    quantity: number
    unit: string
  }[]
  instructions?: string
}

export type RecipeAction =
  | { type: 'find', name: string }
  | { type: 'parse', text: string }
  | { type: 'save', parsed: ParsedRecipe, mode?: 'preview' | 'commit' };

export class RecipeAgent implements Agent<RecipeAction, any> {
  name = 'recipe'

  async execute(action: RecipeAction, context: AgentContext): Promise<any> {
    const { userId, supabase: contextSupabase } = context
    const supabase = contextSupabase || createAdminClient()

    if (action.type === 'find') {
      const { data, error } = await supabase
        .from('user_recipes')
        .select('*, recipe_ingredients(*)')
        .eq('user_id', userId)
        .ilike('recipe_name', `%${action.name}%`)
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('[RecipeAgent] Error finding recipe:', error)
        return null
      }
      return data
    }

    if (action.type === 'parse') {
      const openai = createOpenAIClient()
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Extract recipe details from the provided text. 
Return a JSON object:
{
  "recipe_name": "string",
  "servings": number,
  "ingredients": [
    { "name": "string", "quantity": number, "unit": "string" }
  ],
  "instructions": "string"
}
If servings is not mentioned, default to 1.`
          },
          { role: "user", content: action.text }
        ],
        response_format: { type: "json_object" }
      })

      const content = response.choices[0].message.content
      if (!content) throw new Error('Failed to parse recipe')
      return JSON.parse(content) as ParsedRecipe
    }

    if (action.type === 'save') {
      const { parsed, mode = 'commit' } = action
      // 1. Calculate nutrition for all ingredients
      const ingredientNames = parsed.ingredients.map(ing => ing.name)
      const ingredientPortions = parsed.ingredients.map(ing => `${ing.quantity} ${ing.unit}`)

      let batchNutrition: any = {}
      let ingredientsWithNutrition: any[] = []

      try {
        const nutritionAgent = new NutritionAgent()
        // Execute lookup for all ingredients
        const nutritionResults = await nutritionAgent.execute({ items: ingredientNames, portions: ingredientPortions }, context)

        // Match results back to ingredients
        parsed.ingredients.forEach((ing, index) => {
          const nut = nutritionResults.find(n =>
            n.food_name.toLowerCase().includes(ing.name.toLowerCase()) ||
            ing.name.toLowerCase().includes(n.food_name.toLowerCase())
          ) || nutritionResults[index]

          if (nut) {
            ingredientsWithNutrition.push({
              ...ing,
              nutrition: nut
            })

            Object.keys(nut).forEach(key => {
              if (typeof (nut as any)[key] === 'number') {
                batchNutrition[key] = (batchNutrition[key] || 0) + (nut as any)[key]
              }
            })
          } else {
            ingredientsWithNutrition.push({ ...ing, nutrition: null })
          }
        })

        // Round totals
        Object.keys(batchNutrition).forEach(key => {
          if (typeof batchNutrition[key] === 'number') {
            batchNutrition[key] = Math.round(batchNutrition[key] * 10) / 10
          }
        })
      } catch (err) {
        console.error('[RecipeAgent] Error calculating recipe nutrition:', err)
      }

      // If in preview mode, return the calculated data without saving
      if (mode === 'preview') {
        return {
          recipe: {
            recipe_name: parsed.recipe_name,
            servings: parsed.servings,
            instructions: parsed.instructions,
            nutrition_data: batchNutrition
          },
          ingredients: ingredientsWithNutrition
        }
      }

      // 2. Insert recipe
      const { data: recipe, error: recipeError } = await supabase
        .from('user_recipes')
        .insert({
          user_id: userId,
          recipe_name: parsed.recipe_name,
          servings: parsed.servings,
          instructions: parsed.instructions,
          nutrition_data: batchNutrition
        })
        .select()
        .single()

      if (recipeError) throw recipeError

      // 3. Insert ingredients with their nutrition
      const ingredients = ingredientsWithNutrition.map(ing => ({
        recipe_id: recipe.id,
        ingredient_name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        nutrition_data: ing.nutrition
      }))

      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredients)

      if (ingError) throw ingError

      return recipe
    }
  }
}

// Legacy exports
export async function findSavedRecipe(userId: string, name: string) {
  const agent = new RecipeAgent()
  return agent.execute({ type: 'find', name }, { userId, supabase: createAdminClient() } as any)
}

export async function parseRecipeText(text: string) {
  const agent = new RecipeAgent()
  return agent.execute({ type: 'parse', text }, {} as any)
}

export async function saveRecipe(userId: string, parsed: ParsedRecipe) {
  const agent = new RecipeAgent()
  return agent.execute({ type: 'save', parsed }, { userId, supabase: createAdminClient() } as any)
}
