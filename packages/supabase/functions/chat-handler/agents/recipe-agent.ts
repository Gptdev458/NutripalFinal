import { createAdminClient } from '../../_shared/supabase-client.ts'
import { createOpenAIClient } from '../../_shared/openai-client.ts'

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

export async function findSavedRecipe(userId: string, name: string) {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('user_recipes')
    .select('*, recipe_ingredients(*)')
    .eq('user_id', userId)
    .ilike('recipe_name', `%${name}%`)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[RecipeAgent] Error finding recipe:', error)
    return null
  }

  return data
}

export async function parseRecipeText(text: string): Promise<ParsedRecipe> {
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
      { role: "user", content: text }
    ],
    response_format: { type: "json_object" }
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Failed to parse recipe')

  return JSON.parse(content) as ParsedRecipe
}

export async function saveRecipe(userId: string, parsed: ParsedRecipe) {
  const supabase = createAdminClient()

  const { data: recipe, error: recipeError } = await supabase
    .from('user_recipes')
    .insert({
      user_id: userId,
      recipe_name: parsed.recipe_name,
      servings: parsed.servings,
      instructions: parsed.instructions
    })
    .select()
    .single()

  if (recipeError) throw recipeError

  const ingredients = parsed.ingredients.map(ing => ({
    recipe_id: recipe.id,
    ingredient_name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit
  }))

  const { error: ingError } = await supabase
    .from('recipe_ingredients')
    .insert(ingredients)

  if (ingError) throw ingError

  return recipe
}
