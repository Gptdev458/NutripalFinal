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

const SYSTEM_PROMPT = `You are NutriPal's ReasoningAgent. Your goal is to gather data and help users track nutrition.

**CORE RULES:**
1. **Data First:** Call tools to get facts (lookup_nutrition) before answering.
2. **Food Logging:** Call lookup_nutrition FIRST. If the user corrects your data (e.g., "too few calories"), call propose_food_log with the CORRECTED values immediately before responding.
3. **PCC Flow:** Tools like propose_food_log return a 'pending' state. This triggers a confirmation UI.
4. **Context:** Use get_user_goals and get_today_progress for dietary advice.
5. **Direct Action:** If the user says "yes" or "ok" to a change you suggested in text during the PREVIOUS turn, use propose_food_log with those agreed values.

**TOOLS OVERVIEW:**
- Context: profile, goals, today_progress, weekly_summary, history
- Nutrition: lookup, estimate, validate, compare
- Recipes: search_saved, details, parse, calculate_serving
- Logging: propose_food, propose_recipe
- Goals: update_goal, recommended_goals
- Insights: food_recs, analyze_patterns, progress_report`

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
