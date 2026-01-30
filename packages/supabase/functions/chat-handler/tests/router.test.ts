import { IntentRouter } from '../services/intent-router.ts'
import { DbService } from '../services/db-service.ts'
import { AgentResponse, AgentContext, IntentExtraction } from '../../_shared/types.ts'

// Simple mock for DbService
const mockDb = {
    getRecentMessages: async () => [],
    logFoodItems: async () => { },
    saveRecipe: async () => ({ id: '123', recipe_name: 'Test' })
} as any

async function testRouter() {
    console.log('--- Testing IntentRouter ---')
    const router = new IntentRouter(mockDb as DbService)

    const context: AgentContext = { userId: 'user1', supabase: {} as any }
    const agentsInvolved: string[] = []
    const response: AgentResponse = { status: 'success', message: '', response_type: 'unknown' }

    console.log('1. Testing log_food intent...')
    const intentResult: IntentExtraction = {
        intent: 'log_food',
        food_items: ['apple'],
        portions: ['1']
    }

    try {
        const data = await router.route(intentResult, context, agentsInvolved, response)
        console.log('   Status:', response.status)
        console.log('   Response Type:', response.response_type)
        console.log('   Data nutrition found:', !!data.nutrition)
    } catch (e: any) {
        console.error('   Error in log_food test:', e.message)
        // Note: This might fail if agents rely on OpenAI/Supabase which aren't mocked here
    }

    console.log('--- Router test finished ---')
}

// In a real environment, we'd use Deno.test()
// For now, this serves as a logic check
// testRouter()
