import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { Agent, AgentContext, SessionState } from '../../_shared/types.ts'

export interface PlannerInput {
    message: string
    history: { role: string, content: string }[]
    session: SessionState
}

export interface PlannerOutput {
    action: 'continue_flow' | 'switch_flow' | 'clarify' | 'execute_single_turn' | 'unknown'
    target_agent?: 'recipe' | 'nutrition' | 'insight' | 'chat' | 'validator'
    new_mode?: SessionState['current_mode']
    reasoning: string
    extracted_data?: any
}

const SYSTEM_PROMPT = `
You are the Brain of NutriPal. Your job is to MANAGE STATE and ROUTE INTENTS.
You have a persistent "Session Board" (the user's current context).

Current Session Mode: {{CURRENT_MODE}}
Current Buffer: {{BUFFER_JSON}}

RULES:
1. **Context Awareness**: 
   - If the user is in 'flow_recipe_create' and says "add chicken", it means "Add chicken to the recipe", NOT "Log chicken to diary".
   - If the user says "Wait, what are my goals?", it is a CONTEXT SWITCH. You must 'switch_flow' but KEEP the recipe buffer.

2. **Intelligent Routing**:
   - "I ate an apple" -> agent: nutrition (log_food)
   - "Create a lasagna recipe" -> agent: recipe (create), new_mode: flow_recipe_create
   - "Actually, make it 4 servings" -> agent: recipe (update), mode: flow_recipe_create

3. **Ambiguity Handling**:
   - IF the input is vague ("soup"), and no active flow -> ask for clarification.
   - IF the input is "chicken" (generic) -> check if it's an ingredient add (if in recipe flow) or a food log.

OUTPUT JSON FORMAT:
{
  "action": "continue_flow" | "switch_flow" | "clarify",
  "target_agent": "recipe" | "nutrition" | "chat",
  "new_mode": "idle" | "flow_recipe_create" | ...,
  "reasoning": "User is modifying the current recipe draft.",
  "extracted_data": { ...any extracted entities... }
}
`

export class PlannerAgent {
    name = 'planner'

    async execute(input: PlannerInput, context: AgentContext): Promise<PlannerOutput> {
        const openai = createOpenAIClient()

        // Inject state into prompt
        const prompt = SYSTEM_PROMPT
            .replace('{{CURRENT_MODE}}', input.session.current_mode)
            .replace('{{BUFFER_JSON}}', JSON.stringify(input.session.buffer))

        const messages = [
            { role: 'system', content: prompt },
            ...input.history.slice(-3), // Short history for context
            { role: 'user', content: input.message }
        ]

        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Fast, cheap reasoning
                messages: messages as any,
                temperature: 0,
                response_format: { type: 'json_object' }
            })

            const content = completion.choices[0].message.content || '{}'
            return JSON.parse(content) as PlannerOutput
        } catch (error) {
            console.error('[PlannerAgent] Error type:', error)
            return {
                action: 'unknown',
                target_agent: 'chat',
                reasoning: 'Fallback due to error'
            }
        }
    }
}
