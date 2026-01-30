/**
 * ReasoningAgent
 * 
 * The intelligent orchestrator that uses OpenAI function calling to:
 * 1. Understand the user's intent (with help from IntentAgent classification)
 * 2. Call tools to gather data from specialized agents
 * 3. Reason across all gathered information
 * 4. Pass results to ChatAgent for final formatting
 * 
 * Flow: IntentAgent → ReasoningAgent → [Tools] → ChatAgent
 */

import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { Agent, AgentContext } from '../../_shared/types.ts'
import { toolDefinitions, ToolName } from '../services/tools.ts'
import { ToolExecutor } from '../services/tool-executor.ts'

export interface ReasoningInput {
    message: string
    intent?: {
        type: string
        confidence?: number
        entities?: string[]
    }
    chatHistory?: Array<{ role: string; content: string }>
}

export interface ReasoningOutput {
    reasoning: string
    toolsUsed: string[]
    data: Record<string, any>
    response?: string
    proposal?: {
        type: string
        id: string
        data: any
    }
}

const SYSTEM_PROMPT = `You are NutriPal's ReasoningAgent - the intelligent core that helps users with nutrition tracking and advice.

**YOUR ROLE:**
You orchestrate tool calls to gather data, then reason across that data to help the user.

**AVAILABLE TOOLS (21 total, 6 categories):**

1. **User Context:** get_user_profile, get_user_goals, get_today_progress, get_weekly_summary, get_food_history
2. **Nutrition:** lookup_nutrition, estimate_nutrition, validate_nutrition, compare_foods
3. **Recipes:** search_saved_recipes, get_recipe_details, parse_recipe_text, calculate_recipe_serving
4. **Logging:** propose_food_log, propose_recipe_log, confirm_pending_log
5. **Goals:** update_user_goal, calculate_recommended_goals
6. **Insights:** get_food_recommendations, analyze_eating_patterns, get_progress_report

**KEY BEHAVIORS:**

1. **Food Logging:** Always call lookup_nutrition FIRST, then propose_food_log with the data
2. **Dietary Advice:** Get user profile + goals + today's progress, then reason about the specific food
3. **Recipe Logging:** Search recipes first, then propose_recipe_log if found
4. **Goal Queries:** Use get_user_goals for "what are my goals"
5. **Progress Queries:** Use get_today_progress and/or get_weekly_summary

**IMPORTANT:**
- Always gather relevant data before making recommendations
- For "can I eat X" questions, get goals AND progress AND lookup the food
- The user's profile contains their goal (lose weight, maintain, gain muscle) - use this!
- Be data-driven in your reasoning
- Your final response should be helpful but the ChatAgent will format it nicely`

export class ReasoningAgent implements Agent<ReasoningInput, ReasoningOutput> {
    name = 'reasoning'
    private openai = createOpenAIClient()

    async execute(input: ReasoningInput, context: AgentContext): Promise<ReasoningOutput> {
        const { message, intent, chatHistory = [] } = input
        const { userId, supabase, timezone, sessionId } = context

        console.log('[ReasoningAgent] Starting with message:', message)
        console.log('[ReasoningAgent] Intent:', intent)

        // Initialize tool executor
        const toolExecutor = new ToolExecutor({
            userId,
            supabase,
            timezone,
            sessionId
        })

        // Build messages array
        const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool', content: string, tool_call_id?: string, name?: string }> = [
            { role: 'system', content: SYSTEM_PROMPT }
        ]

        // Add recent chat history for context (last 6 messages)
        const recentHistory = chatHistory.slice(-6)
        for (const msg of recentHistory) {
            messages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.content
            })
        }

        // Add intent context if available
        let userMessage = message
        if (intent) {
            userMessage = `[Intent: ${intent.type}${intent.entities?.length ? ` | Entities: ${intent.entities.join(', ')}` : ''}]\n\nUser: ${message}`
        }
        messages.push({ role: 'user', content: userMessage })

        // Track tools used and data gathered
        const toolsUsed: string[] = []
        const gatheredData: Record<string, any> = {}

        // Call OpenAI with tools
        let response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            tools: toolDefinitions,
            tool_choice: 'auto',
            max_tokens: 1000
        })

        let assistantMessage = response.choices[0].message

        // Process tool calls iteratively
        let iterations = 0
        const maxIterations = 5 // Safety limit

        while (assistantMessage.tool_calls && iterations < maxIterations) {
            iterations++
            console.log(`[ReasoningAgent] Processing ${assistantMessage.tool_calls.length} tool calls (iteration ${iterations})`)

            // Add assistant message with tool calls
            messages.push(assistantMessage as any)

            // Execute each tool call
            for (const toolCall of assistantMessage.tool_calls) {
                const toolName = toolCall.function.name as ToolName
                const args = JSON.parse(toolCall.function.arguments || '{}')

                console.log(`[ReasoningAgent] Calling tool: ${toolName}`, args)
                toolsUsed.push(toolName)

                try {
                    const result = await toolExecutor.execute(toolName, args)
                    gatheredData[toolName] = result

                    console.log(`[ReasoningAgent] Tool ${toolName} result:`, JSON.stringify(result).slice(0, 200))

                    // Add tool result
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    })
                } catch (error) {
                    console.error(`[ReasoningAgent] Tool ${toolName} error:`, error)
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({ error: true, message: (error as Error).message })
                    })
                }
            }

            // Get next response
            response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages,
                tools: toolDefinitions,
                tool_choice: 'auto',
                max_tokens: 1000
            })

            assistantMessage = response.choices[0].message
        }

        // Extract final response
        const finalResponse = assistantMessage.content || ''
        console.log('[ReasoningAgent] Final response:', finalResponse.slice(0, 200))

        // Check for any proposals in gathered data
        let proposal: ReasoningOutput['proposal'] = undefined
        for (const [toolName, result] of Object.entries(gatheredData)) {
            if (result?.proposal_type && result?.pending) {
                proposal = {
                    type: result.proposal_type,
                    id: result.proposal_id,
                    data: result.data
                }
                break
            }
        }

        return {
            reasoning: finalResponse,
            toolsUsed,
            data: gatheredData,
            response: finalResponse,
            proposal
        }
    }
}
