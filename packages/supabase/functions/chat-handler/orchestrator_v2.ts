import { IntentAgent } from './agents/intent-agent.ts'
import { ChatAgent } from './agents/chat-agent.ts'
import { InsightAgent } from './agents/insight-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'
import { IntentRouter } from './services/intent-router.ts'
import { PersistenceService } from './services/persistence-service.ts'
import { SessionService } from './services/session-service.ts'
import { PlannerAgent } from './agents/planner-agent.ts'
import { RecipeAgent } from './agents/recipe-agent.ts'

/**
 * Main Orchestrator for the Chat Handler.
 * Coordinates between multiple specialized agents to fulfill user requests using a Router pattern.
 */
export async function orchestrate(
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
  const router = new IntentRouter(db)

  // 1. Load Session State (The Board)
  const session = await sessionService.getSession(userId)
  const context: AgentContext = { userId, sessionId, supabase, timezone, session }
  const startTime = Date.now()

  let agentsInvolved: string[] = ['planner']
  let response: AgentResponse = {
    status: 'success',
    message: '',
    response_type: 'unknown'
  }
  let dataForChat: any = null

  try {
    // 2. Planner (The Brain)
    // Decides what to do based on history + session state
    const planner = new PlannerAgent()
    const plan = await planner.execute({ message, history: chatHistory, session }, context)
    console.log('[Orchestrator] Plan:', JSON.stringify(plan))

    // 3. Execution (The Workers)
    if (plan.action === 'clarify' || plan.target_agent === 'chat') {
      // Planner asks for info directly or delegates to Chat
      response.message = plan.reasoning // Usually clarification question
      response.response_type = 'clarification_needed' // Or chat_response
      agentsInvolved.push('chat')
    }
    else if (plan.target_agent === 'recipe') {
      agentsInvolved.push('recipe')
      // Update session mode if changed
      if (plan.new_mode) {
        await sessionService.updateSession(userId, { current_mode: plan.new_mode })
        session.current_mode = plan.new_mode
      }

      // Check if it's a logging intent (Bridge to Legacy)
      if (plan.extracted_data?.intent === 'log_recipe') {
        console.log('[Orchestrator] Recipe/Log -> Bridging to Legacy Router')
        const bridgeIntent = {
          intent: 'log_recipe',
          recipe_text: plan.extracted_data.recipe_name,
          recipe_portion: plan.extracted_data.portion || '1 serving'
        }
        dataForChat = await router.route(bridgeIntent as any, context, agentsInvolved, response, chatHistory)
      } else {
        // Recipe Creation/Modification (Direct Interactive Mode)
        console.log('[Orchestrator] Recipe/Create -> calling RecipeAgent Direct')
        const recipeAgent = new RecipeAgent()
        // Use the message directly for interactive mode
        const result = await recipeAgent.execute({ type: 'interactive', message }, context)

        dataForChat = result

        // WRITE BACK: Persist flow state to session
        if (result && (result.flowState || result.type === 'needs_confirmation')) {
          const stateToSave = result.flowState
          console.log('[Orchestrator] Persisting Recipe State')
          await sessionService.updateSession(userId, {
            buffer: { flowState: stateToSave }
          })

          // If saved, clear buffer? No, wait until "recipe_saved" response type.
          if (result.type === 'saved' || result.type === 'recipe_saved') {
            console.log('[Orchestrator] Recipe Saved -> Clearing Session')
            await sessionService.clearSession(userId)
          }
        }
      }

    } else {
      // Default / Food Log -> Bridge to Legacy Router
      // The Planner should have extracted "log_food" intent
      console.log('[Orchestrator] Bridging to Legacy Router')
      const bridgeIntent = {
        intent: 'log_food', // Default to log_food if unknown, logic needs hardening
        ...plan.extracted_data
      }
      // If planner output didn't give strict intent, use IntentAgent as fallback?
      // No, let's trust Planner. If it failed, use IntentAgent.
      if (!plan.extracted_data?.intent) {
        const intentAgent = new IntentAgent()
        const intentResult = await intentAgent.execute({ message, history: chatHistory }, context)
        dataForChat = await router.route(intentResult, context, agentsInvolved, response, chatHistory)
      } else {
        dataForChat = await router.route(bridgeIntent as any, context, agentsInvolved, response, chatHistory)
      }
    }

    // 4. Update Session (Write Back)
    // If router modified context.session.buffer (it doesn't yet), save it.
    // Ideally agents return "state_deltas".

    // 5. Response Generation (Chat Agent)
    if (!response.message) {
      agentsInvolved.push('chat')
      const chatAgent = new ChatAgent()
      response.message = await chatAgent.execute({
        userMessage: message,
        intent: plan.extracted_data?.intent || 'unknown',
        data: dataForChat,
        history: chatHistory
      }, context)
    }

    response.data = dataForChat
    persistence.logExecution(userId, sessionId, plan.action, agentsInvolved, startTime, response, message)
    return response

  } catch (error: any) {
    console.error('[Orchestrator] Fatal Error:', error)
    return {
      status: 'error',
      message: `I encountered an unexpected error: ${error.message}.`,
      response_type: 'fatal_error'
    }
  }
}
