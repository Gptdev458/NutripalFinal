import { classifyIntent } from './agents/intent-agent.ts'
import { getNutritionForItems } from './agents/nutrition-agent.ts'
import { validateNutritionData } from './agents/validator-agent.ts'
import { findSavedRecipe, parseRecipeText, saveRecipe } from './agents/recipe-agent.ts'
import { generateChatResponse } from './agents/chat-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, NutritionData } from '../_shared/types.ts'

export async function orchestrate(
  userId: string, 
  message: string, 
  sessionId?: string,
  history: { role: string, content: string }[] = []
): Promise<AgentResponse> {
  const supabase = createAdminClient()
  const startTime = Date.now()
  let agentsInvolved: string[] = ['intent']

  try {
    // 1. Intent Classification
    const intentResult = await classifyIntent(message)
    const intent = intentResult.intent

    let response: AgentResponse = {
      status: 'success',
      message: '',
      response_type: 'unknown'
    }
    let dataForChat: any = null

    // 2. Intent-based Routing
    if (intent === 'log_food') {
      // ... existing code ...
    } else if (intent === 'log_recipe') {
      agentsInvolved.push('recipe', 'nutrition', 'validator')
      const recipeName = intentResult.recipe_text || message
      const savedRecipe = await findSavedRecipe(userId, recipeName)

      if (savedRecipe) {
        // Fetch all ingredients for the recipe
        const { data: ingredients } = await supabase
          .from('recipe_ingredients')
          .select('*')
          .eq('recipe_id', savedRecipe.id)

        if (ingredients && ingredients.length > 0) {
          const items = ingredients.map(ing => ing.ingredient_name)
          const portions = ingredients.map(ing => `${ing.quantity} ${ing.unit}`)
          
          const nutritionData = await getNutritionForItems(items, portions)
          const validation = validateNutritionData(nutritionData)

          if (validation.passed) {
            for (const item of nutritionData) {
              await supabase.from('food_log').insert({
                user_id: userId,
                food_name: `${savedRecipe.recipe_name}: ${item.food_name}`,
                calories: item.calories,
                protein_g: item.protein_g,
                carbs_g: item.carbs_g,
                fat_total_g: item.fat_total_g,
                fiber_g: item.fiber_g,
                sugar_g: item.sugar_g,
                sodium_mg: item.sodium_mg,
                serving_size: item.serving_size
              })
            }
            dataForChat = { nutrition: nutritionData, recipe: savedRecipe }
            response.status = 'success'
            response.response_type = 'recipe_logged'
          } else {
            response = {
              status: 'error',
              message: `Validation failed for recipe: ${validation.errors.join(' ')}`,
              response_type: 'validation_error'
            }
          }
        } else {
          response = { status: 'error', message: "This recipe has no ingredients.", response_type: 'empty_recipe' }
        }
      } else {
        response = { status: 'error', message: `Could not find recipe: ${recipeName}`, response_type: 'recipe_not_found' }
      }

    } else if (intent === 'save_recipe') {
      agentsInvolved.push('recipe')
      const parsed = await parseRecipeText(intentResult.recipe_text || message)
      const recipe = await saveRecipe(userId, parsed)
      dataForChat = { recipe: recipe, parsed: parsed }
      response.status = 'success'
      response.response_type = 'recipe_saved'

    } else if (intent === 'query_nutrition') {
      agentsInvolved.push('nutrition')
      const items = intentResult.food_items || []
      const portions = intentResult.portions || []
      const nutritionData = await getNutritionForItems(items, portions)
      dataForChat = { nutrition: nutritionData }
      response.status = 'success'
      response.response_type = 'nutrition_info'

    } else {
      agentsInvolved.push('chat')
      response.status = 'success'
      response.response_type = 'chat_response'
    }

    // 3. Generate Natural Language Response if not already set by error/clarification
    if (!response.message) {
      agentsInvolved.push('chat')
      response.message = await generateChatResponse(message, intent, dataForChat || intentResult, history)
    }
    response.data = dataForChat || intentResult

    // 4. Log Execution
    await supabase.from('agent_execution_logs').insert({
      user_id: userId,
      session_id: sessionId,
      intent: intent,
      agents_involved: agentsInvolved,
      execution_time_ms: Date.now() - startTime,
      status: response.status,
      logs: { input: message, output: response }
    })

    return response

  } catch (error) {
    console.error('[Orchestrator] Error:', error)
    throw error
  }
}
