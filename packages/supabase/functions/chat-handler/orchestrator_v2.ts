import { IntentAgent } from './agents/intent-agent.ts'
import { ChatAgent } from './agents/chat-agent.ts'
import { InsightAgent } from './agents/insight-agent.ts'
import { createAdminClient } from '../_shared/supabase-client.ts'
import { AgentResponse, AgentContext } from '../_shared/types.ts'
import { DbService } from './services/db-service.ts'
import { IntentRouter } from './services/intent-router.ts'
import { PersistenceService } from './services/persistence-service.ts'

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
  const router = new IntentRouter(db)
  const context: AgentContext = { userId, sessionId, supabase, timezone }
  const startTime = Date.now()

  let agentsInvolved: string[] = ['intent']
  let response: AgentResponse = {
    status: 'success',
    message: '',
    response_type: 'unknown'
  }
  let dataForChat: any = null
  let intent = 'unknown'

  try {
    // 1. Intent Classification
    const intentAgent = new IntentAgent()
    const intentResult = await intentAgent.execute({ message, history: chatHistory }, context)
    intent = intentResult.intent

    // 2. Intent-based Routing
    console.log('[Orchestrator] Routing intent:', intent)
    dataForChat = await router.route(intentResult, context, agentsInvolved, response, chatHistory)
    console.log('[Orchestrator] Route data:', JSON.stringify(dataForChat))

    // 3. Generate Natural Language Response
    // If a specialized agent hasn't set a message yet, use ChatAgent
    if (!response.message) {
      agentsInvolved.push('chat')

      // Fetch insights for food/recipe logging to provide better context
      if (response.response_type === 'food_logged' || response.response_type === 'recipe_logged') {
        agentsInvolved.push('insight')
        try {
          const insightAgent = new InsightAgent()
          const insights = await insightAgent.execute(undefined, context)
          dataForChat = { ...dataForChat, insights }
        } catch (e) {
          console.error('[Orchestrator] Insight error:', e)
        }
      }

      const chatAgent = new ChatAgent()
      response.message = await chatAgent.execute({
        userMessage: message,
        intent,
        data: dataForChat,
        history: chatHistory
      }, context)
    }

    response.data = dataForChat

    // 4. Log Execution (Background)
    persistence.logExecution(userId, sessionId, intent, agentsInvolved, startTime, response, message)

    return response

  } catch (error: any) {
    console.error('[Orchestrator] Fatal Error:', error)

    // Attempt to log even on error, but carefully
    try {
      await persistence.logExecution(userId, sessionId, intent, agentsInvolved, startTime, {
        status: 'error',
        message: error.message || 'Unknown error',
        response_type: 'fatal_error'
      }, message)
    } catch (logLogErr) {
      console.error('[Orchestrator] Error logging the error:', logLogErr)
    }

    return {
      status: 'error',
      message: `I encountered an unexpected error: ${error.message || 'Please try again.'}. I've logged it and will look into it.`,
      response_type: 'fatal_error'
    }
  }
}
