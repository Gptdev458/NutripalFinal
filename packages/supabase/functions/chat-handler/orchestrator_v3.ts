/**
 * Orchestrator V3 - Hybrid Multi-Agent Architecture
 * 
 * Flow: User Message → IntentAgent → ReasoningAgent → ChatAgent → Response
 * 
 * Key differences from V2:
 * - IntentAgent still classifies intent (fast, cheap gpt-4o-mini)
 * - ReasoningAgent replaces PlannerAgent + IntentRouter
 * - ReasoningAgent uses tools that wrap specialized agents
 * - ChatAgent still handles final response formatting
 * - PCC pattern preserved via proposal tools
 */

import { IntentAgent } from './agents/intent-agent.ts'
import { ChatAgent } from './agents/chat-agent.ts'
import { ReasoningAgent } from './agents/reasoning-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'
import { PersistenceService } from './services/persistence-service.ts'
import { SessionService } from './services/session-service.ts'

class ThoughtLogger {
    private steps: string[] = []
    log(step: string) {
        console.log(`[ThoughtLogger] ${step}`)
        this.steps.push(step)
    }
    getSteps() { return this.steps }
}

/**
 * Main Orchestrator V3 for the Chat Handler.
 * Uses hybrid multi-agent architecture:
 * - IntentAgent: Fast classification (gpt-4o-mini)
 * - ReasoningAgent: Tool orchestration and reasoning (gpt-4o)
 * - ChatAgent: Response formatting with personality (gpt-4o-mini)
 */
export async function orchestrateV3(
    userId: string,
    message: string,
    sessionId?: string,
    chatHistory: { role: string, content: string }[] = [],
    timezone = 'UTC'
): Promise<AgentResponse> {
    const supabase = createAdminClient()
    const db = new DbService(supabase)
    const persistence = new PersistenceService(supabase)
    const sessionService = new SessionService(supabase)

    // Load session state
    const session = await sessionService.getSession(userId, sessionId)
    const context: AgentContext = { userId, sessionId, supabase, timezone, session }
    const startTime = Date.now()
    const thoughts = new ThoughtLogger()

    const agentsInvolved: string[] = []
    let response: AgentResponse = {
        status: 'success',
        message: '',
        response_type: 'unknown',
        steps: []
    }

    try {
        // =========================================================
        // STEP 1: IntentAgent - Fast Classification
        // =========================================================
        thoughts.log('Analyzing your request...')
        const intentAgent = new IntentAgent()
        const intentResult = await intentAgent.execute(
            { message, history: chatHistory },
            context
        )
        agentsInvolved.push('intent')
        console.log('[OrchestratorV3] Intent:', JSON.stringify(intentResult))

        // Handle confirmation of pending actions (fast path)
        // FIX: The fast path should handle confirmation_ types
        const isConfirmationRequest = session.last_response_type?.startsWith('confirmation_');
        const isClarificationRequest = session.last_response_type === 'clarification_needed';

        if (intentResult.intent === 'confirm' && session.pending_action && (isConfirmationRequest || !isClarificationRequest)) {
            thoughts.log('Perfect! Logging that for you...')
            console.log('[OrchestratorV3] Fast path: Confirming pending action')
            const confirmResult = await handlePendingConfirmation(
                session.pending_action,
                userId,
                sessionService,
                db,
                context
            )
            confirmResult.steps = thoughts.getSteps()
            return confirmResult
        }

        if (intentResult.intent === 'cancel' || intentResult.intent === 'decline') {
            thoughts.log('No problem, cancelling that.')
            console.log('[OrchestratorV3] Fast path: Cancelling pending action')
            await sessionService.clearPendingAction(userId)
            return {
                status: 'success',
                message: 'No problem! Let me know what else I can help with.',
                response_type: 'action_cancelled',
                steps: thoughts.getSteps()
            }
        }

        // Fast Path for greetings
        if (intentResult.intent === 'greet' && chatHistory.length < 2) {
            console.log('[OrchestratorV3] Fast path: Greeting detected')
            thoughts.log('Saying hello!')
            const chatAgent = new ChatAgent()
            response.message = await chatAgent.execute(
                { userMessage: message, intent: 'greet', data: { reasoning: 'Greeting user' }, history: chatHistory },
                context
            )
            response.response_type = 'chat_response'
            response.steps = thoughts.getSteps()
            return response
        }

        // =========================================================
        // STEP 2: ReasoningAgent - Tool Orchestration & Reasoning
        // =========================================================
        thoughts.log('Thinking about how to help...')
        const reasoningAgent = new ReasoningAgent()
        const reasoningResult = await reasoningAgent.execute(
            {
                message,
                intent: {
                    type: intentResult.intent,
                    confidence: intentResult.confidence,
                    entities: intentResult.entities
                },
                chatHistory
            },
            context
        )
        agentsInvolved.push('reasoning')
        agentsInvolved.push(...reasoningResult.toolsUsed)

        // Log specific tool actions as thoughts
        if (reasoningResult.toolsUsed.includes('lookup_nutrition')) thoughts.log('Looking up nutrition info...')
        if (reasoningResult.toolsUsed.includes('estimate_nutrition')) thoughts.log('Estimating nutritional values...')
        if (reasoningResult.toolsUsed.includes('parse_recipe_text')) thoughts.log('Parsing recipe details...')
        if (reasoningResult.toolsUsed.includes('get_user_goals')) thoughts.log('Checking your nutrition goals...')
        if (reasoningResult.toolsUsed.includes('propose_food_log')) thoughts.log('Preparing a log entry for you...')

        // Handle proposals (PCC pattern)
        if (reasoningResult.proposal) {
            console.log('[OrchestratorV3] Proposal detected:', reasoningResult.proposal.type)
            await sessionService.savePendingAction(userId, {
                type: reasoningResult.proposal.type as any,
                data: reasoningResult.proposal.data
            })
            response.response_type = `confirmation_${reasoningResult.proposal.type}` as any
        }

        // =========================================================
        // STEP 3: ChatAgent - Response Formatting
        // =========================================================
        thoughts.log('Formatting response...')
        const chatAgent = new ChatAgent()

        // Build data for ChatAgent
        const dataForChat = {
            reasoning: reasoningResult.reasoning,
            proposal: reasoningResult.proposal,
            toolsUsed: reasoningResult.toolsUsed,
            data: reasoningResult.data
        }

        response.message = await chatAgent.execute(
            {
                userMessage: message,
                intent: intentResult.intent,
                data: dataForChat,
                history: chatHistory
            },
            context
        )
        agentsInvolved.push('chat')

        // =========================================================
        // STEP 4: Finalize Response & Map to Frontend
        // =========================================================
        response.data = {
            ...reasoningResult.data,
            proposal: reasoningResult.proposal
        }

        // Map proposal data to specific keys the frontend UI expects for modals
        if (reasoningResult.proposal) {
            const p = reasoningResult.proposal;
            console.log(`[OrchestratorV3] Mapping proposal type ${p.type} for frontend`);

            if (p.type === 'food_log') {
                // Frontend ChatMessageList expects msg.metadata.nutrition (array)
                response.data.nutrition = [p.data];
                response.response_type = 'confirmation_food_log';
            } else if (p.type === 'recipe_log') {
                // Map recipe_log to confirmation_food_log but with recipe context
                // This allows us to reuse the FoodLogConfirmation component which is perfect for displaying kcal/macros
                response.data.nutrition = [{
                    food_name: p.data.recipe_name,
                    calories: p.data.calories,
                    protein_g: p.data.protein_g,
                    carbs_g: p.data.carbs_g,
                    fat_total_g: p.data.fat_total_g,
                    serving_size: `${p.data.servings} serving(s)`
                }];
                response.response_type = 'confirmation_food_log';
            } else if (p.type === 'recipe_save') {
                // Frontend ChatMessageList expects msg.metadata.parsed and preview
                response.data.parsed = {
                    recipe_name: p.data.recipeName,
                    servings: p.data.servings,
                    nutrition_data: p.data.totalNutrition,
                };
                response.data.preview = {
                    ingredients: p.data.ingredients?.map((ing: any) => ({
                        name: ing.name,
                        quantity: ing.amount,
                        unit: ing.unit,
                        nutrition: { calories: ing.calories }
                    })) || []
                };
                response.response_type = 'confirmation_recipe_save';
            } else if (p.type === 'goal_update') {
                response.response_type = 'confirmation_goal_update';
            }
        }

        // Update session context
        await sessionService.updateContext(userId, {
            intent: intentResult.intent,
            agent: 'reasoning',
            responseType: response.response_type
        })

        response.steps = thoughts.getSteps()
        console.log('[OrchestratorV3] Response ready:', response.message?.slice(0, 100))
        // =========================================================
        // STEP 5: Context Preservation (Phase 2.2)
        // Extract entities and update buffer for future context
        // =========================================================
        const foodEntities = extractFoodEntities(intentResult, reasoningResult.data)
        const topic = classifyTopic(intentResult.intent)

        if (foodEntities.length > 0 || topic) {
            await sessionService.updateBuffer(userId, {
                recentFoods: foodEntities,
                lastTopic: topic
            })
        }

        console.log('[OrchestratorV3] Response ready:', response.message?.slice(0, 100))
        persistence.logExecution(userId, sessionId, 'reasoning', agentsInvolved, startTime, response, message)

        return response

    } catch (error: any) {
        console.error('[OrchestratorV3] Fatal Error:', error)
        return {
            status: 'error',
            message: `I encountered an unexpected error. Please try again. (${error.message})`,
            response_type: 'fatal_error'
        }
    }
}

/**
 * Handle confirmation of pending actions (food log, recipe log, goal update)
 */
async function handlePendingConfirmation(
    pendingAction: { type: string, data: any },
    userId: string,
    sessionService: SessionService,
    db: DbService,
    context: AgentContext
): Promise<AgentResponse> {
    const { type, data } = pendingAction

    try {
        switch (type) {
            case 'food_log':
                await db.logFoodItems(userId, [{
                    food_name: data.food_name,
                    portion: data.portion,
                    calories: data.calories,
                    protein_g: data.protein_g,
                    carbs_g: data.carbs_g,
                    fat_total_g: data.fat_g,
                    fiber_g: data.fiber_g,
                    sugar_g: data.sugar_g,
                    log_time: new Date().toISOString()
                }])
                await sessionService.clearPendingAction(userId)
                return {
                    status: 'success',
                    message: `✅ Logged ${data.food_name} (${data.calories} cal)! Great choice! 🎉`,
                    response_type: 'food_logged',
                    data: { food_logged: data }
                }

            case 'recipe_log':
                await db.logFoodItems(userId, [{
                    food_name: data.recipe_name,
                    portion: `${data.servings} serving(s)`,
                    calories: data.calories,
                    protein_g: data.protein_g,
                    carbs_g: data.carbs_g,
                    fat_total_g: data.fat_g,
                    log_time: new Date().toISOString(),
                    recipe_id: data.recipe_id
                }])
                await sessionService.clearPendingAction(userId)
                return {
                    status: 'success',
                    message: `✅ Logged ${data.servings} serving(s) of ${data.recipe_name}! 🍽️`,
                    response_type: 'recipe_logged',
                    data: { recipe_logged: data }
                }

            case 'goal_update':
                await db.updateUserGoal(userId, data.nutrient, data.target_value, data.unit)
                await sessionService.clearPendingAction(userId)
                return {
                    status: 'success',
                    message: `✅ Updated your ${data.nutrient} goal to ${data.target_value}${data.unit}! 🎯`,
                    response_type: 'goal_updated',
                    data: { goal_updated: data }
                }

            case 'recipe_save':
                // For recipe save, we insert into user_recipes and then recipe_ingredients
                const { data: newRecipe, error: recipeError } = await db.supabase
                    .from('user_recipes')
                    .insert([{
                        user_id: userId,
                        recipe_name: data.recipeName,
                        servings: data.servings,
                        total_batch_calories: data.totalNutrition.calories,
                        total_batch_protein: data.totalNutrition.protein_g,
                        total_batch_carbs: data.totalNutrition.carbs_g,
                        total_batch_fat: data.totalNutrition.fat_total_g,
                        nutrition_data: data.totalNutrition,
                        per_serving_nutrition: data.perServingNutrition
                    }])
                    .select('id')
                    .single()

                if (recipeError) throw recipeError

                if (data.ingredients && data.ingredients.length > 0) {
                    await db.supabase
                        .from('recipe_ingredients')
                        .insert(data.ingredients.map((ing: any) => ({
                            recipe_id: newRecipe.id,
                            ingredient_name: ing.name,
                            amount: ing.amount,
                            unit: ing.unit,
                            calories: ing.calories
                        })))
                }

                await sessionService.clearPendingAction(userId)
                return {
                    status: 'success',
                    message: `✅ Saved recipe "${data.recipeName}"! You can now log it any time. 📖`,
                    response_type: 'recipe_saved',
                    data: { recipe: newRecipe }
                }

            default:
                await sessionService.clearPendingAction(userId)
                return {
                    status: 'success',
                    message: 'Done! ✅',
                    response_type: 'action_confirmed'
                }
        }
    } catch (error: any) {
        console.error('[OrchestratorV3] Confirmation error:', error)
        return {
            status: 'error',
            message: `Failed to save: ${error.message}. Please try again.`,
            response_type: 'confirmation_failed'
        }
    }
}

/**
 * Extract food entity names from intent result and gathered data.
 * Phase 2.2: These are stored in the buffer for context preservation.
 */
function extractFoodEntities(intentResult: any, gatheredData: Record<string, any>): string[] {
    const foods: string[] = []

    // Extract from intent entities
    if (intentResult.food_items && Array.isArray(intentResult.food_items)) {
        foods.push(...intentResult.food_items)
    }
    if (intentResult.entities && Array.isArray(intentResult.entities)) {
        // Entities might contain food names
        foods.push(...intentResult.entities.filter((e: string) =>
            !['today', 'yesterday', 'tomorrow', 'morning', 'evening', 'lunch', 'dinner', 'breakfast'].includes(e.toLowerCase())
        ))
    }

    // Extract from nutrition lookup results
    if (gatheredData?.lookup_nutrition?.food_name) {
        foods.push(gatheredData.lookup_nutrition.food_name)
    }
    if (gatheredData?.propose_food_log?.data?.food_name) {
        foods.push(gatheredData.propose_food_log.data.food_name)
    }

    // Deduplicate and clean
    return [...new Set(foods.filter(f => f && f.length > 0))]
}

/**
 * Classify the topic of conversation based on intent.
 * Phase 2.2: Used to track conversation context.
 */
function classifyTopic(intent: string): 'food' | 'recipe' | 'goals' | 'general' | undefined {
    if (['log_food', 'query_nutrition', 'dietary_advice'].includes(intent)) {
        return 'food'
    }
    if (['log_recipe', 'save_recipe'].includes(intent)) {
        return 'recipe'
    }
    if (['query_goals', 'update_goals', 'suggest_goals'].includes(intent)) {
        return 'goals'
    }
    if (['off_topic', 'clarify'].includes(intent)) {
        return 'general'
    }
    return undefined
}

// Export default for easy switching between versions
export { orchestrateV3 as orchestrate }
