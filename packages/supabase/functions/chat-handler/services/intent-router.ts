import { IntentExtraction, AgentContext, AgentResponse, NutritionData } from '../../_shared/types.ts'
import { DbService } from './db-service.ts'
import { NutritionAgent, scaleNutrition } from '../agents/nutrition-agent.ts'
import { ValidatorAgent } from '../agents/validator-agent.ts'
import { RecipeAgent } from '../agents/recipe-agent.ts'

export class IntentRouter {
    constructor(private db: DbService) { }

    async route(
        intentResult: IntentExtraction,
        context: AgentContext,
        agentsInvolved: string[],
        response: AgentResponse,
        history: { role: string, content: string }[] = []
    ): Promise<any> {
        const { intent } = intentResult

        switch (intent) {
            case 'log_food':
                return await this.handleLogFood(intentResult, context, agentsInvolved, response)

            case 'log_recipe':
                return await this.handleLogRecipe(intentResult, context, agentsInvolved, response)

            case 'save_recipe':
                return await this.handleSaveRecipe(intentResult, context, agentsInvolved, response)

            case 'confirm':
                return await this.handleConfirmAction(history, context, agentsInvolved, response)

            case 'clarify':
            case 'modify':
                return await this.handleClarify(intentResult, context, agentsInvolved, response)

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

    private async handleClarify(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse): Promise<any> {
        // Fetch last message to see what we are clarifying
        const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
        const lastBotMessage = lastMessages.find((m: any) => m.role === 'assistant' && (m.message_type?.startsWith('confirmation_')))

        if (!lastBotMessage) {
            // If no previous confirmation, treat it as a new log food request
            return await this.handleLogFood(intentResult, context, agentsInvolved, response)
        }

        const { message_type: type, metadata } = lastBotMessage

        if (type === 'confirmation_food_log' && metadata?.nutrition) {
            // Merge changes into existing nutrition data
            agentsInvolved.push('nutrition', 'validator')
            const nutritionAgent = new NutritionAgent()

            // Re-execute nutrition agent with merged items/portions
            // For now, let's just use the clarify info as the NEW info if it contains food_items
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
        // Heuristic: if there's only one "food item" but it's very long, or many items (> 5), it might be a recipe
        const items = intentResult.food_items || []
        const portions = intentResult.portions || []

        const isLikelyRecipe = items.length > 5 || (items.length === 1 && items[0].length > 100)

        if (isLikelyRecipe) {
            console.log('[IntentRouter] handleLogFood detected a likely recipe, redirecting to handleSaveRecipe')
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

        const recipeAgent = new RecipeAgent()
        const savedRecipe = await recipeAgent.execute({ type: 'find', name: recipeName }, context)

        if (!savedRecipe) {
            response.status = 'clarification'
            response.response_type = 'recipe_not_found'
            response.message = `I couldn't find a saved recipe called "${recipeName}". Would you like to share the ingredients so I can log it and save it for you?`
            return { recipe_name: recipeName }
        }

        let nutritionData: any[] = []
        if (savedRecipe.nutrition_data && Object.keys(savedRecipe.nutrition_data).length > 0) {
            const servings = savedRecipe.servings || 1
            const userMultiplier = await (async () => {
                if (intentResult.recipe_portion) {
                    const { getScalingMultiplier } = await import('../agents/nutrition-agent.ts')
                    return await getScalingMultiplier(intentResult.recipe_portion, `${servings} servings`)
                }
                return 1
            })()

            const multiplier = userMultiplier / servings
            const scaledNut = scaleNutrition({ ...savedRecipe.nutrition_data, food_name: savedRecipe.recipe_name }, multiplier)
            nutritionData = [scaledNut]
        }

        response.response_type = 'confirmation_food_log'
        response.message = `Ready to log ${savedRecipe.recipe_name}. Confirm?`
        return { nutrition: nutritionData, recipe: savedRecipe }
    }

    private async handleSaveRecipe(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        agentsInvolved.push('recipe')
        const recipeAgent = new RecipeAgent()

        // If recipe_text is missing, try to find it in history
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

        const parsed = await recipeAgent.execute({ type: 'parse', text: recipeText }, context)
        const previewData = await recipeAgent.execute({ type: 'save', parsed, mode: 'preview' }, context)

        response.response_type = 'confirmation_recipe_save'
        response.message = `Here is the recipe I parsed for "${parsed.recipe_name}". Does it look correct?`
        return { parsed, preview: previewData }
    }

    private async handleUpdateGoal(intentResult: IntentExtraction, context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        const { nutrient, value, unit } = intentResult

        // Robust check for missing or invalid values
        if (!nutrient || value === undefined || value === null || isNaN(Number(value))) {
            console.warn('[IntentRouter] Invalid goal update request:', { nutrient, value, unit })
            response.status = 'clarification'
            response.message = "I couldn't quite catch the goal you want to set. Could you specify the nutrient and value? (e.g. 'set calories to 2500')"
            return {}
        }

        // Prevent health goals from leaking into nutritional goals table
        const healthGoals = ['comprehensive', 'weight_loss', 'muscle_gain', 'maintenance']
        if (healthGoals.includes(nutrient.toLowerCase())) {
            // Save to profile instead of user_goals
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

        // Fetch current profile to make better suggestions
        const { data: profile, error: profileError } = await this.db.supabase
            .from('user_profiles')
            .select('*')
            .eq('id', context.userId)
            .single()

        if (profileError) {
            console.warn('[IntentRouter] Profile fetch error:', profileError)
        }

        let goals = [
            { nutrient: 'calories', value: 2000, unit: 'kcal' },
            { nutrient: 'protein', value: 150, unit: 'g' },
            { nutrient: 'carbs', value: 200, unit: 'g' },
            { nutrient: 'fat', value: 70, unit: 'g' }
        ]

        if (profile) {
            // Simple logic: if male and weight > 80, bump protein
            if (profile.gender === 'male' && profile.weight_kg > 80) {
                goals = goals.map(g => g.nutrient === 'protein' ? { ...g, value: 180 } : g)
            }
        }

        response.status = 'proposal'
        response.response_type = 'confirmation_multi_goal_update'
        response.message = "I've calculated some optimal goals for you based on common standards. Would you like me to set them up?"

        return { goals }
    }

    private async handleConfirmAction(history: any[], context: AgentContext, agentsInvolved: string[], response: AgentResponse) {
        const lastMessages = await this.db.getRecentMessages(context.userId, context.sessionId!)
        const lastBotMessage = lastMessages.find((m: any) => m.role === 'assistant' && (m.message_type?.startsWith('confirmation_')))

        if (!lastBotMessage) {
            response.status = 'error'
            response.message = "I'm not sure what you're confirming. Please try logging the food or recipe again."
            return {}
        }

        const { message_type: type, metadata } = lastBotMessage

        if (type === 'confirmation_food_log' && metadata?.nutrition) {
            await this.db.logFoodItems(context.userId, metadata.nutrition)
            response.response_type = 'food_logged'
            response.message = "Great! I've logged that for you."
            return { nutrition: metadata.nutrition }
        } else if (type === 'confirmation_recipe_save' && metadata?.parsed) {
            const lastUserMessage = history[history.length - 1]?.content?.toLowerCase() || ''
            const shouldSave = !lastUserMessage.includes("don't save")
            const shouldLog = true // Default for this flow is to log as well

            let recipe = null
            if (shouldSave) {
                const recipeAgent = new RecipeAgent()
                recipe = await recipeAgent.execute({ type: 'save', parsed: metadata.parsed, mode: 'commit' }, context)
            }

            // Log it as well
            if (shouldLog && metadata.preview?.recipe?.nutrition_data) {
                // If it has servings, log 1 serving by default or scale it
                // For now, let's log the full 'preview' nutrition data which is for 1 "recipe"
                // But wait, preview.recipe.nutrition_data is the SUM of all ingredients.
                // If the recipe is 4 servings, this is the nutrition for 4 servings.
                const servings = metadata.parsed.servings || 1
                const nutritionForOneServing = { ...metadata.preview.recipe.nutrition_data }

                // Scale to 1 serving if multiple servings defined
                if (servings > 1) {
                    const scaled = scaleNutrition(nutritionForOneServing, 1 / servings)
                    await this.db.logFoodItems(context.userId, [scaled])
                } else {
                    await this.db.logFoodItems(context.userId, [nutritionForOneServing])
                }
            }

            response.response_type = shouldSave ? 'recipe_saved' : 'food_logged'
            response.message = shouldSave
                ? `Recipe "${metadata.parsed.recipe_name}" has been saved and logged (1 serving)!`
                : `Logged 1 serving of "${metadata.parsed.recipe_name}" (without saving the recipe).`

            return { recipe, logged: true }
        } else if (type === 'confirmation_goal_update' && metadata?.nutrient && metadata?.value !== undefined && metadata?.value !== null) {
            const normalizedNutrient = metadata.nutrient.toLowerCase()
            await this.db.updateUserGoal(context.userId, normalizedNutrient, metadata.value, metadata.unit || 'units')
            response.response_type = 'goal_updated'
            response.message = `Your daily ${metadata.nutrient} goal has been confirmed and set to ${metadata.value} ${metadata.unit || ''}.`
            return { nutrient: metadata.nutrient, value: metadata.value, unit: metadata.unit }
        } else if (type === 'confirmation_multi_goal_update' && metadata?.goals) {
            // Safety check for metadata.goals
            const validGoals = (metadata.goals as any[]).filter(g => g.nutrient && g.value !== null && g.value !== undefined && !isNaN(Number(g.value)))
            if (validGoals.length === 0) {
                response.status = 'error'
                response.message = "I couldn't find any valid goals to confirm."
                return {}
            }
            const normalizedGoals = validGoals.map(g => ({ ...g, nutrient: g.nutrient.toLowerCase() }))
            await this.db.updateUserGoals(context.userId, normalizedGoals)
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
