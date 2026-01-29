import { IntentExtraction, AgentContext, AgentResponse, NutritionData } from '../../_shared/types.ts'
import { DbService } from './db-service.ts'
import { NutritionAgent, scaleNutrition } from '../agents/nutrition-agent.ts'
import { ValidatorAgent } from '../agents/validator-agent.ts'
import { RecipeAgent, RecipeFlowState, RecipeActionResult, ParsedRecipe } from '../agents/recipe-agent.ts'

export class IntentRouter {
    constructor(private db: DbService) { }

    async route(
        intentResult: IntentExtraction,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse,
        chatHistory: { role: string, content: string }[] = []
    ): Promise<any> {
        const { intent } = intentResult

        // First, check if there's a pending recipe flow that needs handling
        const pendingFlow = await this.checkPendingRecipeFlow(context)
        if (pendingFlow) {
            console.log(`[IntentRouter] Resuming pending recipe flow: ${pendingFlow.step}`)
            return await this.handlePendingRecipeFlow(pendingFlow, intentResult, context, agentsInvolved, response, chatHistory)
        }

        switch (intent) {
            case 'log_food':
                return await this.handleLogFood(intentResult, context, agentsInvolved, response)

            case 'log_recipe':
                return await this.handleLogRecipe(intentResult, context, agentsInvolved, response)

            case 'save_recipe':
                return await this.handleSaveRecipe(intentResult, context, agentsInvolved, response)

            case 'confirm':
                return await this.handleConfirmAction(chatHistory, context, agentsInvolved, response)

            case 'clarify':
            case 'modify':
                return await this.handleClarify(intentResult, context, agentsInvolved, response, chatHistory)

            case 'decline':
                return await this.handleDeclineAction(response)

            case 'query_nutrition':
                return await this.handleQueryNutrition(intentResult, context, agentsInvolved, response)

            case 'update_goals':
                return await this.handleUpdateGoal(intentResult, context, agentsInvolved, response)

            case 'suggest_goals':
                return await this.handleSuggestGoals(intentResult, context, agentsInvolved, response)

            default:
                agentsInvolved.push('chat')
                response.response_type = 'chat_response'
                return intentResult
        }
    }

    /**
     * Check if there's a pending recipe flow awaiting user response
     */
    private async checkPendingRecipeFlow(context: AgentContext): Promise<RecipeFlowState | null> {
        const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
        // Find the absolute last assistant message
        const lastBotMessage = lastMessages.find((m: any) => m.role === 'assistant')

        if (!lastBotMessage) return null

        // If the latest bot message is already a confirmation modal, we are NOT in a pending flow anymore
        // (The 'confirm' intent will handle the modal response instead)
        if (lastBotMessage.message_type?.startsWith('confirmation_')) {
            return null
        }

        // Only return if it's one of our transitionary states
        if (lastBotMessage.message_type === 'pending_batch_confirm' ||
            lastBotMessage.message_type === 'pending_servings_confirm' ||
            lastBotMessage.message_type === 'pending_duplicate_confirm') {
            return lastBotMessage.metadata?.flowState as RecipeFlowState
        }

        return null
    }

    /**
     * Handle ongoing recipe flow based on the current step
     */
    private async handlePendingRecipeFlow(
        flowState: RecipeFlowState,
        intentResult: IntentExtraction,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse,
        chatHistory: { role: string, content: string }[] = []
    ): Promise<any> {
        // 1. MUST CHECK FOR INTENT CHANGES FIRST - This allows breaking the flow

        // If the user is declining or switching topics, break the flow
        if (intentResult.intent === 'decline') {
            console.log('[IntentRouter] Breaking flow for decline intent')
            return await this.handleDeclineAction(response)
        }

        // If it's a strong intent that isn't confirmation-related or clarify/modify, break the flow
        // and handle the new intent instead.
        if (intentResult.intent !== 'confirm' &&
            intentResult.intent !== 'modify' &&
            intentResult.intent !== 'clarify') {

            console.log(`[IntentRouter] Breaking pending recipe flow (${flowState.step}) for new intent: ${intentResult.intent}`)

            switch (intentResult.intent) {
                case 'log_food': return await this.handleLogFood(intentResult, context, agentsInvolved, response);
                case 'log_recipe': return await this.handleLogRecipe(intentResult, context, agentsInvolved, response);
                case 'save_recipe': return await this.handleSaveRecipe(intentResult, context, agentsInvolved, response);
                case 'query_nutrition': return await this.handleQueryNutrition(intentResult, context, agentsInvolved, response);
                case 'update_goals': return await this.handleUpdateGoal(intentResult, context, agentsInvolved, response);
                case 'suggest_goals': return await this.handleSuggestGoals(intentResult, context, agentsInvolved, response);
                default:
                    // For off_topic or anything else, just behave like it's a new request
                    agentsInvolved.push('chat');
                    response.response_type = 'chat_response';
                    return intentResult;
            }
        }

        // 2. ONLY IF INTENT IS confirm/modify/clarify DO WE CONTINUE THE FLOW
        const lastUserMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].content : ''

        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        if (flowState.step === 'pending_batch_confirm') {
            return await this.handleRecipeBatchConfirmation(flowState, lastUserMessage, context, agentsInvolved, response)
        }

        if (flowState.step === 'pending_servings_confirm') {
            return await this.handleRecipeServingConfirmation(flowState, lastUserMessage, context, agentsInvolved, response)
        }

        if (flowState.step === 'pending_duplicate_confirm') {
            return await this.handleRecipeDuplicateChoice(flowState, lastUserMessage, context, agentsInvolved, response)
        }

        // If we are already ready to save, don't fall back to handleSaveRecipe (which re-parses)
        if (flowState.step === 'ready_to_save') {
            response.response_type = 'confirmation_recipe_save'
            response.message = `Ready to save "${flowState.parsed?.recipe_name}"?`
            return {
                flowState,
                parsed: flowState.parsed,
                preview: {
                    recipe: flowState.parsed,
                    ingredients: flowState.ingredientsWithNutrition
                }
            }
        }

        // Shouldn't reach here, but fallback safety
        return await this.handleSaveRecipe(intentResult, context, agentsInvolved, response)
    }

    /**
     * Handle batch size confirmation response
     */
    private async handleRecipeBatchConfirmation(
        flowState: RecipeFlowState,
        userResponse: string,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse
    ): Promise<any> {
        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        const result = await recipeAgent.execute(
            { type: 'confirm_batch', flowState, userResponse },
            context
        ) as RecipeActionResult

        if (result.type === 'needs_confirmation') {
            response.response_type = result.flowState!.step as any
            response.message = result.prompt!
            response.data = { flowState: result.flowState }
            return { flowState: result.flowState }
        }

        if (result.type === 'saved') {
            response.response_type = 'recipe_saved'
            response.message = result.prompt!
            return { recipe: result.recipe }
        }

        // Error case
        response.status = 'error'
        response.message = result.error || 'An error occurred while processing the recipe.'
        return {}
    }

    /**
     * Handle servings confirmation response
     */
    private async handleRecipeServingConfirmation(
        flowState: RecipeFlowState,
        userResponse: string,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse
    ): Promise<any> {
        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        const result = await recipeAgent.execute(
            { type: 'confirm_servings', flowState, userResponse },
            context
        ) as RecipeActionResult

        if (result.type === 'needs_confirmation') {
            if (result.flowState?.step === 'ready_to_save') {
                response.response_type = 'confirmation_recipe_save'
                response.message = result.prompt!
                response.data = {
                    flowState: result.flowState,
                    parsed: {
                        ...result.flowState.parsed,
                        nutrition_data: result.flowState.batchNutrition
                    },
                    preview: {
                        recipe: {
                            recipe_name: result.flowState.parsed?.recipe_name,
                            nutrition_data: result.flowState.batchNutrition,
                            servings: result.flowState.parsed?.servings
                        },
                        ingredients: result.flowState.ingredientsWithNutrition
                    }
                }
                return response.data
            }

            // Need to ask again for servings
            response.response_type = 'pending_servings_confirm'
            response.message = result.prompt!
            response.data = { flowState: result.flowState }
            return { flowState: result.flowState }
        }

        if (result.type === 'saved') {
            response.response_type = 'recipe_saved'
            response.message = result.prompt!
            response.data = { recipe: result.recipe }
            return { recipe: result.recipe }
        }

        // Error case
        response.status = 'error'
        response.message = result.error || 'An error occurred while saving the recipe.'
        return {}
    }

    /**
     * Handle duplicate recipe choice: update, new, or log
     */
    private async handleRecipeDuplicateChoice(
        flowState: RecipeFlowState,
        userResponse: string,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse
    ): Promise<any> {
        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        // Parse user's choice from their message
        const lower = userResponse.toLowerCase()
        let choice: 'update' | 'new' | 'log' = 'new' // default

        if (lower.includes('update') || lower.includes('replace')) {
            choice = 'update'
        } else if (lower.includes('log') || lower.includes('existing')) {
            choice = 'log'
        } else if (lower.includes('new') || lower.includes('save') || lower.includes('keep')) {
            choice = 'new'
        }

        const result = await recipeAgent.execute(
            { type: 'handle_duplicate', flowState, choice },
            context
        ) as RecipeActionResult

        if (result.type === 'updated') {
            response.response_type = 'recipe_updated'
            response.message = `Updated "${result.recipe?.recipe_name}"!`
            return { recipe: result.recipe }
        }

        if (result.type === 'saved') {
            response.response_type = 'recipe_saved'
            response.message = `Saved as "${result.recipe?.recipe_name}"!`
            return { recipe: result.recipe }
        }

        if (result.type === 'found' && result.skipSave) {
            // User chose to just log the existing recipe
            response.response_type = 'clarification_needed'
            response.message = `OK! How much of "${result.recipe?.recipe_name}" did you have? (e.g., "1 serving", "1 cup", "half")`
            response.data = { recipe: result.recipe, awaiting_portion: true }
            return { recipe: result.recipe, awaiting_portion: true }
        }

        if (result.type === 'error') {
            response.status = 'error'
            response.message = result.error || 'Failed to process recipe.'
            return {}
        }

        return {}
    }

    private async handleClarify(
        intentResult: IntentExtraction,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse,
        chatHistory: { role: string, content: string }[] = []
    ): Promise<any> {
        // Fetch last message to see what we are clarifying
        const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
        const lastBotMessage = lastMessages.find((m: any) => m.role === 'assistant' && (m.message_type?.startsWith('confirmation_') || m.message_type?.startsWith('pending_')))

        if (!lastBotMessage) {
            // If no previous confirmation, treat it as a new log food request
            return await this.handleLogFood(intentResult, context, agentsInvolved, response)
        }

        const { message_type: type, metadata } = lastBotMessage

        // If the user says "it's my recipe", they are likely clarifying that the previous food search should have been a recipe search
        const userMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].content.toLowerCase() : ''
        if (userMessage.includes('recipe') && type === 'nutrition_not_found') {
            const recipeName = metadata?.food_items?.[0] || lastMessages.find((m: any) => m.role === 'user')?.content || ''
            if (recipeName) {
                console.log(`[IntentRouter] handleClarify redirecting to log_recipe for "${recipeName}"`)
                const modifiedIntent: IntentExtraction = {
                    ...intentResult,
                    intent: 'log_recipe',
                    recipe_text: recipeName,
                }
                return await this.handleLogRecipe(modifiedIntent, context, agentsInvolved, response)
            }
        }

        // Handle pending recipe flows as clarify/modify actions
        if (type === 'pending_batch_confirm' && metadata?.flowState) {
            const lastUserMsg = lastMessages.find((m: any) => m.role === 'user')
            return await this.handleRecipeBatchConfirmation(metadata.flowState, lastUserMsg?.content || '', context, agentsInvolved, response)
        }

        if (type === 'pending_servings_confirm' && metadata?.flowState) {
            const lastUserMsg = lastMessages.find((m: any) => m.role === 'user')
            return await this.handleRecipeServingConfirmation(metadata.flowState, lastUserMsg?.content || '', context, agentsInvolved, response)
        }

        // Handle recipe portion clarification
        if (type === 'clarification_needed' && metadata?.recipe && metadata?.awaiting_portion) {
            // Extract portion from user's response
            const lastUserMsg = lastMessages.find((m: any) => m.role === 'user')
            const portion = intentResult.portions?.[0] || intentResult.food_items?.[0] || lastUserMsg?.content || '1 serving'
            // Re-call handleLogRecipe with the portion
            const modifiedIntent: IntentExtraction = {
                ...intentResult,
                intent: 'log_recipe',
                recipe_text: metadata.recipe.recipe_name,
                recipe_portion: portion
            }
            return await this.handleLogRecipe(modifiedIntent, context, agentsInvolved, response)
        }

        if (type === 'confirmation_food_log' && metadata?.nutrition) {
            // Merge changes into existing nutrition data
            agentsInvolved.push('nutrition', 'validator')
            const nutritionAgent = new NutritionAgent()

            // Re-execute nutrition agent with merged items/portions
            const items = intentResult.food_items || []
            const portions = intentResult.portions || []

            if (items.length > 0) {
                const nutritionData = await nutritionAgent.execute({ items, portions }, context)
                const validatorAgent = new ValidatorAgent()
                const validation = await validatorAgent.execute(nutritionData, context)

                response.response_type = 'confirmation_food_log'
                response.status = validation.passed ? 'success' : 'ambiguous'
                response.message = `Updated! I've adjusted it to ${items.join(', ')}. Does this look right now?`
                return { nutrition: nutritionData, validation }
            }
        }

        // Fallback to chat
        agentsInvolved.push('chat')
        response.response_type = 'chat_response'
        response.message = "I'm not exactly sure what to change. Could you please state the full meal again?"
        return intentResult
    }

    private async handleLogFood(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        const items = intentResult.food_items || []
        const portions = intentResult.portions || []

        const isLikelyRecipe = items.length > 5 || (items.length === 1 && items[0].length > 100)

        if (isLikelyRecipe || (items.length === 1 && items[0].length < 100)) {
            const recipeAgent = new RecipeAgent()
            const findResult = await recipeAgent.execute({ type: 'find', name: items[0] || '' }, context) as RecipeActionResult

            if (findResult.type === 'found' && findResult.recipe) {
                console.log(`[IntentRouter] handleLogFood found saved recipe match: "${findResult.recipe.recipe_name}" for "${items[0]}"`)
                const modifiedIntent: IntentExtraction = {
                    ...intentResult,
                    intent: 'log_recipe',
                    recipe_text: findResult.recipe.recipe_name,
                    recipe_portion: portions[0] || '1 serving'
                }
                return await this.handleLogRecipe(modifiedIntent, context, agentsInvolved, response)
            }
        }

        if (isLikelyRecipe) {
            return await this.handleSaveRecipe(intentResult, context, agentsInvolved, response)
        }

        agentsInvolved.push('nutrition', 'validator')
        const nutritionAgent = new NutritionAgent()
        const nutritionData = await nutritionAgent.execute({ items, portions }, context)

        if (nutritionData.length === 0) {
            response.status = 'error'
            response.response_type = 'nutrition_not_found'
            return { error: 'No nutrition data found' }
        }

        const validatorAgent = new ValidatorAgent()
        const validation = await validatorAgent.execute(nutritionData, context)

        response.response_type = 'confirmation_food_log'
        response.status = validation.passed ? 'success' : 'ambiguous'

        response.message = validation.passed
            ? `I found the nutrition info for ${items.join(', ')}. Does this look right?`
            : `I found the info, but there are some warnings: ${validation.errors.join(' ')}. Do you want to log this anyway?`

        return { nutrition: nutritionData, validation }
    }

    private async handleLogRecipe(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        agentsInvolved.push('recipe')
        const recipeName = intentResult.recipe_text || ''

        const looksLikeFullRecipe = recipeName.length > 200 ||
            /\d+\s*(cup|tbsp|tsp|oz|lb|g|kg|ml|liter|teaspoon|tablespoon)/i.test(recipeName) ||
            (recipeName.split(',').length > 3 && /\d/.test(recipeName))

        if (looksLikeFullRecipe) {
            const modifiedIntent: IntentExtraction = {
                ...intentResult,
                intent: 'save_recipe',
                recipe_text: recipeName
            }
            return await this.handleSaveRecipe(modifiedIntent, context, agentsInvolved, response)
        }

        const recipeAgent = new RecipeAgent()
        const findResult = await recipeAgent.execute({ type: 'find', name: recipeName }, context) as RecipeActionResult

        if (findResult.type === 'not_found' || !findResult.recipe) {
            response.status = 'clarification'
            response.response_type = 'recipe_not_found'
            response.message = `I couldn't find a saved recipe called "${recipeName}". Would you like to share the ingredients so I can log it and save it for you?`
            return { recipe_name: recipeName }
        }

        const savedRecipe = findResult.recipe

        if (!intentResult.recipe_portion) {
            response.status = 'clarification'
            response.response_type = 'clarification_needed'
            response.message = `How much of ${savedRecipe.recipe_name} did you have? (e.g., "1 cup", "8 oz", "half", "1 serving")`
            response.data = { recipe: savedRecipe, awaiting_portion: true }
            return { recipe: savedRecipe, awaiting_portion: true }
        }

        let nutritionData: any[] = []
        if (savedRecipe.nutrition_data && Object.keys(savedRecipe.nutrition_data).length > 0) {
            const servings = savedRecipe.servings || 1
            const userMultiplier = await (async () => {
                if (intentResult.recipe_portion) {
                    const { getScalingMultiplier } = await import('../agents/nutrition-agent.ts')
                    const batchReference = savedRecipe.total_batch_size || `${servings} servings`
                    return await getScalingMultiplier(intentResult.recipe_portion, batchReference)
                }
                return 1
            })()

            const scaledNut = scaleNutrition({ ...savedRecipe.nutrition_data, food_name: savedRecipe.recipe_name }, userMultiplier)
            nutritionData = [scaledNut]
        }

        response.response_type = 'confirmation_food_log'
        response.message = `Ready to log ${savedRecipe.recipe_name}. Confirm?`
        return { nutrition: nutritionData, recipe: savedRecipe }
    }

    private async handleSaveRecipe(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        let recipeText = intentResult.recipe_text || ''
        if (!recipeText) {
            const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
            const lastUserMessageWithRecipe = lastMessages.find((m: any) => m.role === 'user' && (m.content.toLowerCase().includes('recipe') || m.content.length > 50))
            if (lastUserMessageWithRecipe) {
                recipeText = lastUserMessageWithRecipe.content
            }
        }

        if (!recipeText) {
            response.status = 'clarification'
            response.message = "Could you please provide the recipe details again? I couldn't find the text to save."
            return {}
        }

        const result = await recipeAgent.execute({ type: 'parse', text: recipeText }, context) as RecipeActionResult

        if (result.type === 'needs_confirmation') {
            response.response_type = result.flowState!.step as any
            response.message = result.prompt!
            response.data = { flowState: result.flowState }
            return { flowState: result.flowState, parsed: result.flowState?.parsed }
        }

        if (result.type === 'error') {
            response.status = 'error'
            response.message = result.error || 'Failed to parse recipe.'
            return {}
        }
    }

    private async handleUpdateGoal(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        const { nutrient, value, unit } = intentResult

        if (!nutrient || value === undefined || value === null || isNaN(Number(value))) {
            response.status = 'clarification'
            response.message = "I couldn't quite catch the goal you want to set. Could you specify the nutrient and value? (e.g. 'set calories to 2500')"
            return {}
        }

        const healthGoals = ['comprehensive', 'weight_loss', 'muscle_gain', 'maintenance']
        if (healthGoals.includes(nutrient.toLowerCase())) {
            await this.db.updateUserProfile(context.userId, { health_goal: nutrient.toLowerCase() })
            response.response_type = 'goal_updated'
            response.message = `I've updated your overall health goal to ${nutrient}. This will help me give better suggestions!`
            return { health_goal: nutrient }
        }

        const validator = new ValidatorAgent()
        const validation = validator.validateGoal(nutrient, value, unit || '')

        if (!validation.passed) {
            response.status = 'error'
            response.message = `I can't set that goal: ${validation.errors.join(' ')}`
            return {}
        }

        if (validation.warnings.length > 0) {
            response.status = 'proposal'
            response.response_type = 'confirmation_goal_update'
            response.message = `${validation.warnings.join(' ')} Are you sure you want to set your ${nutrient} goal to ${value} ${unit || ''}?`
            return { nutrient, value, unit }
        }

        const normalizedNutrient = nutrient.toLowerCase()
        await this.db.updateUserGoal(context.userId, normalizedNutrient, value, unit || 'units')

        response.response_type = 'goal_updated'
        response.message = `Your daily ${nutrient} goal is now set to ${value} ${unit || ''}.`
        return { nutrient, value, unit }
    }

    private async handleSuggestGoals(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        agentsInvolved.push('insight')

        const { data: profile } = await this.db.supabase
            .from('user_profiles')
            .select('*')
            .eq('id', context.userId)
            .single()

        let goals = [
            { nutrient: 'calories', value: 2000, unit: 'kcal' },
            { nutrient: 'protein', value: 150, unit: 'g' },
            { nutrient: 'carbs', value: 200, unit: 'g' },
            { nutrient: 'fat', value: 70, unit: 'g' }
        ]

        if (profile) {
            if (profile.gender === 'male' && profile.weight_kg > 80) {
                goals = goals.map(g => g.nutrient === 'protein' ? { ...g, value: 180 } : g)
            }
        }

        response.status = 'proposal'
        response.response_type = 'confirmation_multi_goal_update'
        response.message = "I've calculated some optimal goals for you based on common standards. Would you like me to set them up?"

        return { goals }
    }

    private async handleConfirmAction(chatHistory: any[], context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
        const lastBotMessage = lastMessages.find((m: any) => m.role === 'assistant' && (m.message_type?.startsWith('confirmation_') || m.message_type?.startsWith('pending_')))

        if (!lastBotMessage) {
            response.status = 'error'
            response.message = "I'm not sure what you're confirming. Please try logging the food or recipe again."
            return {}
        }

        const { message_type: type, metadata } = lastBotMessage

        if (type === 'pending_batch_confirm' && metadata?.flowState) {
            return await this.handleRecipeBatchConfirmation(metadata.flowState, 'yes', context, agentsInvolved, response)
        }

        if (type === 'pending_servings_confirm' && metadata?.flowState) {
            return await this.handleRecipeServingConfirmation(metadata.flowState, 'yes', context, agentsInvolved, response)
        }

        if (type === 'confirmation_food_log' && metadata?.nutrition) {
            await this.db.logFoodItems(context.userId, metadata.nutrition)
            response.response_type = 'food_logged'
            response.message = "Great! I've logged that for you."
            return { nutrition: metadata.nutrition }
        } else if (type === 'confirmation_recipe_save' && metadata?.parsed) {
            const recipeAgent = new RecipeAgent()
            const saveResult = await recipeAgent.execute({ type: 'save', parsed: metadata.parsed, mode: 'commit' }, context) as RecipeActionResult
            const recipe = saveResult.recipe

            if (metadata.preview?.recipe?.nutrition_data) {
                const servings = metadata.parsed.servings || 1

                // Use pre-calculated per_serving_nutrition if available, otherwise scale
                let nutritionForOneServing: any

                if (metadata.parsed.per_serving_nutrition) {
                    nutritionForOneServing = { ...metadata.parsed.per_serving_nutrition }
                } else {
                    nutritionForOneServing = { ...metadata.preview.recipe.nutrition_data }
                    if (servings > 1) {
                        nutritionForOneServing = scaleNutrition(nutritionForOneServing, 1 / servings)
                    }
                }

                nutritionForOneServing.food_name = metadata.parsed.recipe_name
                await this.db.logFoodItems(context.userId, [nutritionForOneServing])
            }

            response.response_type = 'recipe_saved'
            response.message = `Recipe "${metadata.parsed.recipe_name}" has been saved and logged (1 serving)!`
            return { recipe, logged: true }
        } else if (type === 'confirmation_goal_update' && metadata?.nutrient && metadata?.value !== undefined) {
            await this.db.updateUserGoal(context.userId, metadata.nutrient.toLowerCase(), metadata.value, metadata.unit || 'units')
            response.response_type = 'goal_updated'
            response.message = `Your daily ${metadata.nutrient} goal has been confirmed and set to ${metadata.value} ${metadata.unit || ''}.`
            return { nutrient: metadata.nutrient, value: metadata.value, unit: metadata.unit }
        } else if (type === 'confirmation_multi_goal_update' && metadata?.goals) {
            const validGoals = (metadata.goals as any[]).filter(g => g.nutrient && g.value !== null && g.value !== undefined)
            if (validGoals.length === 0) {
                response.status = 'error'
                response.message = "I couldn't find any valid goals to confirm."
                return {}
            }
            await this.db.updateUserGoals(context.userId, validGoals.map(g => ({ ...g, nutrient: g.nutrient.toLowerCase() })))
            response.response_type = 'goals_updated'
            response.message = "All suggested goals have been set up for you!"
            return { goals: validGoals }
        }

        response.status = 'error'
        response.message = "I couldn't verify the previous action to confirm."
        return {}
    }

    private async handleDeclineAction(response: AgentResponse) {
        response.response_type = 'action_cancelled'
        response.message = "Okay, cancelled."
        return {}
    }

    private async handleQueryNutrition(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        agentsInvolved.push('nutrition')
        const nutritionAgent = new NutritionAgent()
        const nutritionData = await nutritionAgent.execute({
            items: intentResult.food_items || [],
            portions: intentResult.portions || []
        }, context)

        response.response_type = 'nutrition_info'
        return { nutrition: nutritionData }
    }
}
