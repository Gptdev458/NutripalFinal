import { IntentAgent } from './agents/intent-agent.ts'
import { ChatAgent } from './agents/chat-agent.ts'
import { InsightAgent } from './agents/insight-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext, IntentExtraction } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'
import { IntentRouter } from './services/intent-router.ts'
import { PersistenceService } from './services/persistence-service.ts'
import { SessionService } from './services/session-service.ts'
import { PlannerAgent } from './agents/planner-agent.ts'
import { RecipeAgent } from './agents/recipe-agent.ts'

/**
 * Main Orchestrator for the Chat Handler.
 * Uses a dual-agent architecture:
 * - IntentAgent: Classifies WHAT the user wants (stateless)
 * - PlannerAgent: Decides WHAT TO DO given context (stateful)
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

  // 1. Load Session State (The Memory Board)
  const session = await sessionService.getSession(userId, sessionId)
  const context: AgentContext = { userId, sessionId, supabase, timezone, session }
  const startTime = Date.now()

  let agentsInvolved: string[] = []
  let response: AgentResponse = {
    status: 'success',
    message: '',
    response_type: 'unknown'
  }
  let dataForChat: any = null
  let intentResult: IntentExtraction | null = null

  try {
    // 2. IntentAgent - Classify WHAT the user wants (ALWAYS runs first)
    console.log('[Orchestrator] Step 1: Intent Classification')
    const intentAgent = new IntentAgent()
    intentResult = await intentAgent.execute({ message, history: chatHistory }, context)
    agentsInvolved.push('intent')
    console.log('[Orchestrator] IntentResult:', JSON.stringify(intentResult))

    // 3. PlannerAgent - Decide WHAT TO DO given context (ALWAYS runs second)
    console.log('[Orchestrator] Step 2: Context Planning')
    const planner = new PlannerAgent()
    const plan = await planner.execute({
      message,
      intent: intentResult,
      history: chatHistory,
      session
    }, context)
    agentsInvolved.push('planner')
    console.log('[Orchestrator] Plan:', JSON.stringify(plan))

    // 4. Execute based on Planner's decision
    console.log('[Orchestrator] Step 3: Execute -', plan.action)

    if (plan.action === 'confirm_pending' && session.pending_action) {
      // User confirmed a pending action (e.g., "Yes, log it")
      console.log('[Orchestrator] Confirming pending action:', session.pending_action.type)
      const pendingData = session.pending_action.data

      dataForChat = await router.route({
        intent: 'confirm',
        ...pendingData
      }, context, agentsInvolved, response, chatHistory)

      await sessionService.clearPendingAction(userId)

    } else if (plan.action === 'cancel_pending') {
      // User declined a pending action
      console.log('[Orchestrator] Cancelling pending action')
      await sessionService.clearPendingAction(userId)
      response.response_type = 'action_cancelled'
      dataForChat = { cancelled: true }

    } else if (plan.action === 'continue_flow' && plan.target_agent === 'recipe') {
      // User is continuing a recipe flow
      console.log('[Orchestrator] Continuing recipe flow')
      agentsInvolved.push('recipe')
      const recipeAgent = new RecipeAgent()

      try {
        dataForChat = await recipeAgent.execute({ type: 'interactive', message }, context)
      } catch (e: any) {
        console.error('[Orchestrator] RecipeAgent error:', e)
        dataForChat = { type: 'error', error: e.message }
      }

      // Persist flow state
      if (dataForChat?.flowState) {
        await sessionService.updateSession(userId, { buffer: { flowState: dataForChat.flowState } })
      }
      if (dataForChat?.type === 'saved' || dataForChat?.type === 'recipe_saved') {
        await sessionService.clearSession(userId)
      }

    } else if (plan.action === 'switch_flow') {
      // User is switching context (e.g., from recipe to goals)
      console.log('[Orchestrator] Switching flow, routing intent')
      dataForChat = await router.route(intentResult, context, agentsInvolved, response, chatHistory)

    } else {
      // Default: Execute the intent through router
      console.log('[Orchestrator] Standard execution via router')
      dataForChat = await router.route(intentResult, context, agentsInvolved, response, chatHistory)
    }

    // 5. Save pending action if response requires confirmation
    if (response.response_type?.includes('confirmation') && intentResult.intent !== 'confirm') {
      console.log('[Orchestrator] Saving pending action for confirmation')
      await sessionService.savePendingAction(userId, {
        type: inferPendingType(intentResult.intent),
        data: dataForChat
      })
    }

    // 6. Update session context
    await sessionService.updateContext(userId, {
      intent: intentResult.intent,
      agent: agentsInvolved[agentsInvolved.length - 1],
      responseType: response.response_type
    })

    // 7. Response Generation (ChatAgent)
    if (!response.message) {
      agentsInvolved.push('chat')
      const chatAgent = new ChatAgent()
      response.message = await chatAgent.execute({
        userMessage: message,
        intent: intentResult.intent,
        data: dataForChat,
        history: chatHistory
      }, context)
    }

    response.data = dataForChat
    console.log('[Orchestrator] Final Response:', JSON.stringify(response))
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

/**
 * Infer the pending action type from the intent
 */
function inferPendingType(intent: string): 'food_log' | 'recipe_save' | 'goal_update' {
  if (intent === 'log_food' || intent === 'log_recipe') return 'food_log'
  if (intent === 'save_recipe') return 'recipe_save'
  if (intent === 'update_goals') return 'goal_update'
  return 'food_log' // Default
}
