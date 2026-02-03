/**
 * ReasoningAgent
 * 
 * The intelligent orchestrator that uses OpenAI function calling to:
 * 1. Understand the user's intent (with help from IntentAgent classification)
 * 2. Call tools to gather data from specialized agents
 * 3. Reason across all gathered information
 * 4. Pass results to ChatAgent for final formatting
 * 
 * Flow: IntentAgent -> ReasoningAgent -> [Tools] -> ChatAgent
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

const SYSTEM_PROMPT = `You are NutriPal's ReasoningAgent, the brain of an intelligent nutrition assistant.

**IMPORTANT: SPEED & ACTION ORIENTATION**
1. **Recipe Detection:** If a user provides a long text with multiple ingredients, instructions, or says "here is my recipe", IMMEDIATELY use 'parse_recipe_text'. Do NOT use 'lookup_nutrition' for whole recipes.
2. **PCC Pattern (The Golden Rule):** You MUST NOT describe nutrition in text without also calling a proposal tool. 
   - For single items/meals: Call 'propose_food_log'.
   - For whole recipes: Call 'parse_recipe_text' (which creates its own proposal).
   - For saved recipes: Call 'propose_recipe_log'.
3. **AI-First Nutrition:** Use 'lookup_nutrition' for quick estimates. APIs are secondary.
4. **Proactive Advice:** Check 'get_user_goals' and 'get_today_progress' to provide personalized advice.

**TOOLS OVERVIEW:**
- Context: profile, goals, today_progress, weekly_summary, history
- Nutrition: lookup, estimate, validate, compare
- Recipes: search_saved, details, parse_recipe_text, calculate_recipe_serving
- Logging: propose_food_log, propose_recipe_log
- Goals: update_user_goal, calculate_recommended_goals
- Insights: get_food_recommendations, analyze_eating_patterns, get_progress_report`

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
        const pendingAction = context.session?.pending_action

        let contextPrefix = ''
        if (intent) {
            contextPrefix += `[Intent: ${intent.type}${intent.entities?.length ? ` | Entities: ${intent.entities.join(', ')}` : ''}]`
        }
        if (pendingAction) {
            contextPrefix += ` [Pending Action: ${pendingAction.type} | Data: ${JSON.stringify(pendingAction.data)}]`
        }

        if (contextPrefix) {
            userMessage = `${contextPrefix}\n\nUser: ${message}`
        }
        messages.push({ role: 'user', content: userMessage })

        // Track tools used and data gathered
        const toolsUsed: string[] = []
        const gatheredData: Record<string, any> = {}

        // Call OpenAI with tools
        let response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
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
                model: 'gpt-4o-mini',
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
        for (const [_toolName, result] of Object.entries(gatheredData)) {
            if (result?.proposal_type && result?.pending) {
                // Preserve flowState if present at root or in data
                const proposalData = result.data || {}
                if (result.flowState && !proposalData.flowState) {
                    proposalData.flowState = result.flowState
                }

                proposal = {
                    type: result.proposal_type,
                    id: result.proposal_id || result.id || `prop_${Date.now()}`,
                    data: proposalData
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
