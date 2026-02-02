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
import { RecipeAgent } from './agents/recipe-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'
import { PersistenceService } from './services/persistence-service.ts'
import { SessionService } from './services/session-service.ts'
import { ToolExecutor } from './services/tool-executor.ts'

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
    timezone = 'UTC',
    onStep?: (step: string) => void
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
    const reportStep = (step: string) => {
        thoughts.log(step)
        if (onStep) onStep(step)
    }

    const agentsInvolved: string[] = []
    let response: AgentResponse = {
        status: 'success',
        message: '',
        response_type: 'unknown',
        steps: []
    }

    try {
        // =========================================================
        // STEP 0: Recipe Fast-Path (Before IntentAgent for speed)
        // =========================================================
        const seemsLikeRecipe = message.length > 200 ||
            (message.includes('\n') && message.split('\n').length > 3) ||
            (message.toLowerCase().includes('recipe') && message.length > 50);

        if (seemsLikeRecipe) {
            const consumptionKeywords = ['ate', 'had', 'log', 'consumption', 'portion', 'serving', 'having'];
            const hasConsumption = consumptionKeywords.some(k => message.toLowerCase().includes(k));

            if (!hasConsumption) {
                console.log('[OrchestratorV3] Recipe shortcut triggered (Pre-intent)');
                reportStep('This looks like a recipe! Fast-tracking...');
                const toolExecutor = new ToolExecutor({ userId, supabase, timezone, sessionId });
                const parseResult = await toolExecutor.execute('parse_recipe_text', { recipe_text: message });

                if (parseResult.proposal_type === 'recipe_save' && parseResult.flowState) {
                    await sessionService.savePendingAction(userId, {
                        type: parseResult.proposal_type as any,
                        data: parseResult
                    });

                    // Map to confirmation_recipe_save for frontend
                    response.response_type = 'confirmation_recipe_save';
                    const fs = parseResult.flowState;
                    response.data = {
                        parsed: {
                            recipe_name: fs.parsed.recipe_name,
                            servings: fs.parsed.servings,
                            nutrition_data: fs.batchNutrition,
                            ingredients: fs.ingredientsWithNutrition?.map((ing: any) => ({
                                name: ing.name,
                                amount: ing.amount || ing.quantity || '',
                                unit: ing.unit || '',
                                calories: ing.calories
                            })) || []
                        },
                        preview: message.substring(0, 100) + '...'
                    };

                    const chatAgent = new ChatAgent();
                    response.message = await chatAgent.execute(
                        {
                            userMessage: message,
                            intent: 'save_recipe',
                            data: { proposal: parseResult, toolsUsed: ['parse_recipe_text'] },
                            history: chatHistory
                        },
                        context
                    );

                    response.steps = thoughts.getSteps();
                    return response;
                }
            }
        }

        // =========================================================
        // STEP 1: IntentAgent - Classification (Truncated)
        // =========================================================
        reportStep('Analyzing your request...')
        const intentAgent = new IntentAgent()
        const intentResult = await intentAgent.execute(
            {
                message: message.length > 2000 ? message.substring(0, 2000) + "... [Truncated for speed]" : message,
                history: chatHistory
            },
            context
        )
        agentsInvolved.push('intent')
        console.log('[OrchestratorV3] Intent:', JSON.stringify(intentResult))

        // Handle confirmation of pending actions (fast path)
        const isConfirmationRequest = session.last_response_type?.startsWith('confirmation_');
        const isClarificationRequest = session.last_response_type === 'clarification_needed';

        if ((intentResult.intent as string) === 'confirm' && session.pending_action && (isConfirmationRequest || !isClarificationRequest)) {
            reportStep('Perfect! Processing that for you...')
            console.log('[OrchestratorV3] Fast path: Confirming pending action with message:', message)

            // Extract choice and portion if present (e.g. "Confirm log portion:1.5 servings")
            const choiceMatch = message.match(/Confirm\s+(\w+)/i);
            const portionMatch = message.match(/portion:([\w\s.]+)/i);

            if (choiceMatch) {
                session.pending_action.data.choice = choiceMatch[1].toLowerCase();
            }
            if (portionMatch) {
                session.pending_action.data.portion = portionMatch[1].trim();
            }

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
            reportStep('No problem, cancelling that.')
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
            reportStep('Saying hello!')
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
        // RECIPE LOG SHORTCUT (Post-Intent): If intent is log_recipe and message is large
        // =========================================================
        if (intentResult.intent === 'log_recipe' && (message.length > 500 || intentResult.recipe_text)) {
            const recipeText = intentResult.recipe_text || message;
            console.log('[OrchestratorV3] log_recipe shortcut triggered');
            reportStep('Parsing that recipe for logging...');

            const toolExecutor = new ToolExecutor({ userId, supabase, timezone, sessionId });
            const parseResult = await toolExecutor.execute('parse_recipe_text', { recipe_text: recipeText });

            if (parseResult.proposal_type === 'recipe_save' && parseResult.flowState) {
                // For log_recipe, we still create a recipe_save proposal but with logging context
                await sessionService.savePendingAction(userId, {
                    type: parseResult.proposal_type as any,
                    data: parseResult
                });

                // Check for duplicate/match
                const isMatch = parseResult.response_type === 'pending_duplicate_confirm';

                // Map to confirmation_recipe_save for frontend 
                response.response_type = 'confirmation_recipe_save';
                const fs = parseResult.flowState;
                response.data = {
                    isMatch,
                    existingRecipeName: fs.existingRecipeName,
                    parsed: {
                        recipe_name: fs.parsed.recipe_name,
                        servings: fs.parsed.servings,
                        nutrition_data: fs.batchNutrition,
                        ingredients: fs.ingredientsWithNutrition?.map((ing: any) => ({
                            name: ing.name,
                            amount: ing.amount || ing.quantity || '',
                            unit: ing.unit || '',
                            calories: ing.calories
                        })) || []
                    },
                    preview: message.substring(0, 100) + '...'
                };

                const chatAgent = new ChatAgent();
                response.message = await chatAgent.execute(
                    {
                        userMessage: message,
                        intent: 'log_recipe',
                        data: {
                            proposal: parseResult,
                            toolsUsed: ['parse_recipe_text'],
                            reasoning: isMatch ? `Found matching recipe: ${fs.existingRecipeName}` : 'Parsing recipe to log consumption'
                        },
                        history: chatHistory
                    },
                    context
                );

                response.steps = thoughts.getSteps();
                return response;
            }
        }

        // =========================================================
        // STEP 2: ReasoningAgent - Tool Orchestration & Reasoning
        // =========================================================
        reportStep('Thinking about how to help...')
        const reasoningAgent = new ReasoningAgent()
        const reasoningResult = await reasoningAgent.execute(
            {
                message: message.length > 2000 ? message.substring(0, 2000) + "... [Truncated for speed]" : message,
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
        if (reasoningResult.toolsUsed.includes('lookup_nutrition')) reportStep('Looking up nutrition info...')
        if (reasoningResult.toolsUsed.includes('estimate_nutrition')) reportStep('Estimating nutritional values...')
        if (reasoningResult.toolsUsed.includes('parse_recipe_text')) reportStep('Parsing recipe details...')
        if (reasoningResult.toolsUsed.includes('get_user_goals')) reportStep('Checking your nutrition goals...')
        if (reasoningResult.toolsUsed.includes('propose_food_log')) reportStep('Preparing a log entry for you...')

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
        reportStep('Formatting response...')
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
            } else if (p.type === 'recipe_save' && p.data?.flowState) {
                // Frontend ChatMessageList expects msg.metadata.parsed and preview
                const fs = p.data.flowState;
                response.data.parsed = {
                    recipe_name: fs.parsed.recipe_name,
                    servings: fs.parsed.servings,
                    nutrition_data: fs.batchNutrition,
                    ingredients: fs.ingredientsWithNutrition?.map((ing: any) => ({
                        name: ing.name,
                        amount: ing.amount || ing.quantity || '',
                        unit: ing.unit || '',
                        calories: ing.calories
                    })) || []
                };
                response.data.preview = ""; // Optional preview text if needed
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
                // Delegate to RecipeAgent for robust handling
                const recipeAgent = new RecipeAgent()
                const action: any = (data as any).choice
                    ? { type: 'handle_duplicate', flowState: (data as any).flowState, choice: (data as any).choice }
                    : { type: 'save', parsed: (data as any).flowState?.parsed || data.parsed, mode: 'commit' }

                const saveResult = await recipeAgent.execute(action, context)

                await sessionService.clearPendingAction(userId)

                if (saveResult.type === 'updated') {
                    return {
                        status: 'success',
                        message: `✅ Updated recipe "${saveResult.recipe.recipe_name}"! 📖`,
                        response_type: 'recipe_saved',
                        data: { recipe: saveResult.recipe }
                    }
                } else if (saveResult.type === 'found' && saveResult.skipSave) {
                    // This is the "Log Existing" choice
                    // We need to log it now
                    const recipe = saveResult.recipe
                    const portion = (data as any).portion || `1 serving`

                    // Simple scaling for logging
                    const servings = parseFloat(portion) || 1
                    const scale = servings / (recipe.servings || 1)

                    await db.logFoodItems(userId, [{
                        food_name: recipe.recipe_name,
                        portion: portion,
                        calories: Math.round((recipe.nutrition_data?.calories || 0) * scale),
                        protein_g: (recipe.nutrition_data?.protein_g || 0) * scale,
                        carbs_g: (recipe.nutrition_data?.carbs_g || 0) * scale,
                        fat_total_g: (recipe.nutrition_data?.fat_total_g || 0) * scale,
                        log_time: new Date().toISOString(),
                        recipe_id: recipe.id
                    }])

                    return {
                        status: 'success',
                        message: `✅ Logged ${portion} of "${recipe.recipe_name}"! 🍽️`,
                        response_type: 'recipe_logged',
                        data: { recipe_logged: recipe }
                    }
                }

                return {
                    status: 'success',
                    message: `✅ Saved recipe "${saveResult.recipe?.recipe_name || 'your recipe'}"! You can now log it any time. 📖`,
                    response_type: 'recipe_saved',
                    data: { recipe: saveResult.recipe }
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
