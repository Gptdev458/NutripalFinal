import { IntentAgent } from './agents/intent-agent.ts'
import { NutritionAgent } from './agents/nutrition-agent.ts'
import { ValidatorAgent } from './agents/validator-agent.ts'
import { RecipeAgent } from './agents/recipe-agent.ts'
import { ChatAgent } from './agents/chat-agent.ts'
import { InsightAgent } from './agents/insight-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext, IntentExtraction, NutritionData } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'

/**
 * Main Orchestrator for the Chat Handler.
 * Coordinates between multiple specialized agents to fulfill user requests.
 */
export async function orchestrate(
  userId: string,
  message: string,
  sessionId?: string,
  history: { role: string, content: string }[] = [],
  timezone = 'UTC'
): Promise<AgentResponse> {
  const supabase = createAdminClient()
  const db = new DbService(supabase)
  const context: AgentContext = { userId, sessionId, supabase, timezone }
  const startTime = Date.now()

  let agentsInvolved: string[] = ['intent']
  let response: AgentResponse = {
    status: 'success',
    message: '',
    response_type: 'unknown'
  }
  let dataForChat: any = null

  try {
    // 1. Intent Classification
    const intentAgent = new IntentAgent()
    const intentResult = await intentAgent.execute(message, context)
    const intent = intentResult.intent

    // 2. Intent-based Routing (State Machine / Router Pattern)
    switch (intent) {
      case 'log_food':
        dataForChat = await handleLogFood(intentResult, context, db, agentsInvolved, response)
        break

      case 'log_recipe':
        dataForChat = await handleLogRecipe(intentResult, context, db, agentsInvolved, response)
        break

      case 'save_recipe':
        dataForChat = await handleSaveRecipe(intentResult, context, db, agentsInvolved, response)
        break

      case 'confirm':
        dataForChat = await handleConfirmAction(history, context, db, agentsInvolved, response)
        break

      case 'decline':
        dataForChat = await handleDeclineAction(response)
        break

      case 'query_nutrition':
        dataForChat = await handleQueryNutrition(intentResult, context, db, agentsInvolved, response)
        break

      default:
        agentsInvolved.push('chat')
        response.response_type = 'chat_response'
        dataForChat = intentResult
    }

    // 3. Generate Natural Language Response
    // If a specialized agent set an error, the chat agent should still respond gracefully
    if (!response.message) {
      agentsInvolved.push('chat')

      // Fetch insights for food/recipe logging to provide better context
      if (response.response_type === 'food_logged' || response.response_type === 'recipe_logged') {
        agentsInvolved.push('insight')
        try {
          const insightAgent = new InsightAgent()
          const insights = await insightAgent.execute(undefined, context)
          dataForChat = { ...dataForChat, insights }
        } catch (e) {
          console.error('[Orchestrator] Insight error:', e)
        }
      }

      const chatAgent = new ChatAgent()
      response.message = await chatAgent.execute({
        userMessage: message,
        intent,
        data: dataForChat,
        history
      }, context)
    }

    response.data = dataForChat

    // 4. Log Execution (Async)
    logExecution(userId, sessionId, intent, agentsInvolved, startTime, response, message, supabase)

    return response

  } catch (error) {
    console.error('[Orchestrator] Fatal Error:', error)
    return {
      status: 'error',
      message: "I encountered an unexpected error. Please try again in a moment.",
      response_type: 'fatal_error'
    }
  }
}

/**
 * Handles the 'log_food' intent (Proposal Phase)
 */
async function handleLogFood(intentResult: IntentExtraction, context: AgentContext, db: DbService, agentsInvolved: string[], response: AgentResponse) {
  agentsInvolved.push('nutrition', 'validator')
  const items = intentResult.food_items || []
  const portions = intentResult.portions || []

  try {
    const nutritionAgent = new NutritionAgent()
    const nutritionData = await nutritionAgent.execute({ items, portions }, context)

    if (nutritionData.length === 0) {
      response.status = 'error'
      response.response_type = 'nutrition_not_found'
      return { error: 'No nutrition data found' }
    }

    const validatorAgent = new ValidatorAgent()
    const validation = await validatorAgent.execute(nutritionData, context)

    // STAGE 1: Return Confirmation Card instead of logging immediately
    response.response_type = 'confirmation_food_log'
    response.status = validation.passed ? 'success' : 'ambiguous' // Ambiguous if warnings exist

    // Create a natural language lead-in
    response.message = validation.passed
      ? `I found the nutrition info for ${items.join(', ')}. Does this look right?`
      : `I found the info, but there are some warnings: ${validation.errors.join(' ')}. Do you want to log this anyway?`

    // Data includes nutrition for the card
    return { nutrition: nutritionData, validation }

  } catch (error) {
    console.error('[Orchestrator] Log food error:', error)
    response.status = 'error'
    response.response_type = 'nutrition_error'
    return { error: 'Failed to look up or validate nutrition' }
  }
}

/**
 * Handles the 'log_recipe' intent (Proposal Phase)
 */
async function handleLogRecipe(intentResult: IntentExtraction, context: AgentContext, db: DbService, agentsInvolved: string[], response: AgentResponse) {
  agentsInvolved.push('recipe')
  const recipeName = intentResult.recipe_text || ''

  try {
    const recipeAgent = new RecipeAgent()
    const savedRecipe = await recipeAgent.execute({ type: 'find', name: recipeName }, context)

    if (!savedRecipe) {
      response.status = 'clarification'
      response.response_type = 'recipe_not_found'
      response.message = `I couldn't find a saved recipe called "${recipeName}". Would you like to share the ingredients so I can log it and save it for you?`
      return { recipe_name: recipeName }
    }

    let nutritionData: NutritionData[] = []

    if (savedRecipe.nutrition_data && Object.keys(savedRecipe.nutrition_data).length > 0) {
      const batchNut = savedRecipe.nutrition_data as NutritionData
      const servings = savedRecipe.servings || 1

      // Calculate multiplier
      const userMultiplier = await (async () => {
        if (intentResult.recipe_portion) {
          const { getScalingMultiplier } = await import('./agents/nutrition-agent.ts')
          return await getScalingMultiplier(intentResult.recipe_portion, `${servings} servings`)
        }
        return 1
      })()

      const multiplier = userMultiplier / servings
      const { scaleNutrition } = await import('./agents/nutrition-agent.ts')
      const scaledNut = scaleNutrition({ ...batchNut, food_name: savedRecipe.recipe_name }, multiplier)
      nutritionData = [scaledNut]
    } else {
      // Fallback logic for legacy recipes without batch nutrition could go here
      // For now assuming batch nutrition exists or not supported in this simplified view
      // (Keeping existing fallback logic logic if needed, but for brevity/cleanliness moving to confirmation)
    }

    // STAGE 1: Return Confirmation Card
    response.response_type = 'confirmation_food_log' // Re-use food log card for recipe logging as it's essentially logging nutrition
    response.message = `Ready to log ${savedRecipe.recipe_name}. Confirm?`

    return { nutrition: nutritionData, recipe: savedRecipe }

  } catch (error) {
    console.error('[Orchestrator] Log recipe error:', error)
    response.status = 'error'
    return { error: 'Failed to log recipe' }
  }
}

/**
 * Handles the 'save_recipe' intent
 */
async function handleSaveRecipe(intentResult: IntentExtraction, context: AgentContext, db: DbService, agentsInvolved: string[], response: AgentResponse) {
  agentsInvolved.push('recipe')
  try {
    const recipeAgent = new RecipeAgent()
    const parsed = await recipeAgent.execute({ type: 'parse', text: intentResult.recipe_text || '' }, context)

    // PREVIEW MODE for Confirmation Card
    const previewData = await recipeAgent.execute({ type: 'save', parsed, mode: 'preview' }, context)

    response.response_type = 'confirmation_recipe_save'
    response.message = `Here is the recipe I parsed for "${parsed.recipe_name}". Does it look correct?`

    return { parsed, preview: previewData }
  } catch (error) {
    console.error('[Orchestrator] Save recipe error:', error)
    response.status = 'error'
    return { error: 'Failed to parse recipe' }
  }
}

/**
 * Handles the 'confirm' intent
 */
async function handleConfirmAction(history: { role: string, content: string }[], context: AgentContext, db: DbService, agentsInvolved: string[], response: AgentResponse) {
  // 1. Find the last PROPOSAL message from the bot
  // We assume the client passes history correctly.
  // We need to look for message_type = 'confirmation_food_log' or 'confirmation_recipe_save' in the metadata.
  // Since we don't have metadata in the simple history array passed here (it's just role/content),
  // we might need to rely on looking up the last 'assistant' message in the DB if history doesn't have metadata.
  // HOWEVER, the standard OpenAI history doesn't have metadata. 
  // We should try to fetch the last message from the DB for accuracy.

  const lastMessages = await db.getRecentMessages(context.userId, context.sessionId!)
  // Check for 'assistant' role as stored in DB, and message_type
  const lastBotMessage = lastMessages.find(m => m.role === 'assistant' && (m.message_type?.startsWith('confirmation_')))

  if (!lastBotMessage) {
    response.status = 'error'
    response.message = "I'm not sure what you're confirming. Please try logging the food or recipe again."
    return {}
  }

  const type = lastBotMessage.message_type
  const metadata = lastBotMessage.metadata

  if (type === 'confirmation_food_log' && metadata?.nutrition) {
    // Commit Food Log
    await db.logFoodItems(context.userId, metadata.nutrition)
    response.response_type = 'food_logged'
    response.message = "Great! I've logged that for you."
    return { nutrition: metadata.nutrition }
  }
  else if (type === 'confirmation_recipe_save' && metadata?.parsed) {
    // Commit Recipe Save
    const recipeAgent = new RecipeAgent()
    // We can just call save with the parsed data from metadata
    const recipe = await recipeAgent.execute({ type: 'save', parsed: metadata.parsed, mode: 'commit' }, context)

    response.response_type = 'recipe_saved'
    response.message = `Recipe "${recipe.recipe_name}" has been saved!`
    return { recipe }
  }

  response.status = 'error'
  response.message = "I couldn't verify the previous action to confirm."
  return {}
}

/**
 * Handles the 'decline' intent
 */
async function handleDeclineAction(response: AgentResponse) {
  response.response_type = 'action_cancelled'
  response.message = "Okay, cancelled."
  return {}
}

/**
 * Handles the 'query_nutrition' intent
 */
async function handleQueryNutrition(intentResult: IntentExtraction, context: AgentContext, db: DbService, agentsInvolved: string[], response: AgentResponse) {
  agentsInvolved.push('nutrition')
  try {
    const nutritionAgent = new NutritionAgent()
    const nutritionData = await nutritionAgent.execute({
      items: intentResult.food_items || [],
      portions: intentResult.portions || []
    }, context)

    response.response_type = 'nutrition_info'
    return { nutrition: nutritionData }
  } catch (error) {
    console.error('[Orchestrator] Query nutrition error:', error)
    response.status = 'error'
    return { error: 'Failed to look up nutrition' }
  }
}

/**
 * Logs execution to the database (fire and forget)
 */
function logExecution(userId: string, sessionId: string | undefined, intent: string, agentsInvolved: string[], startTime: number, response: AgentResponse, message: string, supabase: any) {
  supabase.from('agent_execution_logs').insert({
    user_id: userId,
    session_id: sessionId,
    intent: intent,
    agents_involved: agentsInvolved,
    execution_time_ms: Date.now() - startTime,
    status: response.status,
    logs: { input: message, output: response }
  }).then(({ error }: any) => {
    if (error) console.error('[Orchestrator] Error logging execution:', error)
  })
}
