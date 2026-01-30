import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { Agent, AgentContext, SessionState, IntentExtraction } from '../../_shared/types.ts'

export interface PlannerInput {
    message: string
    intent: IntentExtraction
    history: { role: string, content: string }[]
    session: SessionState
}

export interface PlannerOutput {
    action: 'confirm_pending' | 'cancel_pending' | 'continue_flow' | 'switch_flow' | 'execute'
    target_agent?: 'recipe' | 'nutrition' | 'goals' | 'chat' | 'validator'
    new_mode?: SessionState['current_mode']
    reasoning: string
}

const SYSTEM_PROMPT = `
You are the Context Manager for NutriPal. You decide WHAT TO DO given the user's intent and current session state.

USER INTENT: {{INTENT}}

SESSION STATE:
- Current Mode: {{CURRENT_MODE}}
- Pending Action: {{PENDING_ACTION}}
- Buffer: {{BUFFER_JSON}}
- Last Response Type: {{LAST_RESPONSE_TYPE}}

YOUR JOB: Given the classified intent AND session context, decide the appropriate action.

DECISION RULES:

1. **Confirmation Handling**:
   - If intent is 'confirm' AND pending_action exists → { "action": "confirm_pending" }
   - If intent is 'decline' AND pending_action exists → { "action": "cancel_pending" }

2. **Flow Management**:
   - If current_mode is NOT 'idle' AND message relates to current flow → { "action": "continue_flow" }
   - If current_mode is NOT 'idle' AND message switches topic → { "action": "switch_flow" }

3. **Context Examples**:
   - User is in 'flow_recipe_create' and says "add chicken" → continue_flow (adding to recipe)
   - User is in 'flow_recipe_create' and says "what are my goals?" → switch_flow (context switch)
   - User says "Yes" and pending_action has food_log → confirm_pending

4. **Default**: If no special context → { "action": "execute" }

OUTPUT JSON FORMAT:
{
  "action": "confirm_pending" | "cancel_pending" | "continue_flow" | "switch_flow" | "execute",
  "target_agent": "recipe" | "nutrition" | "goals" | "chat",
  "reasoning": "Brief explanation of decision"
}
`

export class PlannerAgent {
    name = 'planner'

    async execute(input: PlannerInput, context: AgentContext): Promise<PlannerOutput> {
        const openai = createOpenAIClient()

        // Inject state into prompt
        const prompt = SYSTEM_PROMPT
            .replace('{{INTENT}}', JSON.stringify(input.intent))
            .replace('{{CURRENT_MODE}}', input.session.current_mode)
            .replace('{{PENDING_ACTION}}', JSON.stringify(input.session.pending_action || 'none'))
            .replace('{{BUFFER_JSON}}', JSON.stringify(input.session.buffer || {}))
            .replace('{{LAST_RESPONSE_TYPE}}', input.session.last_response_type || 'none')

        const messages = [
            { role: 'system', content: prompt },
            ...input.history.slice(-3),
            { role: 'user', content: input.message }
        ]

        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages as any,
                temperature: 0,
                response_format: { type: 'json_object' }
            })

            const content = completion.choices[0].message.content || '{}'
            return JSON.parse(content) as PlannerOutput
        } catch (error) {
            console.error('[PlannerAgent] Error:', error)
            return {
                action: 'execute',
                target_agent: 'chat',
                reasoning: 'Fallback due to error'
            }
        }
    }
}
