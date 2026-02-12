
import { NutritionAgent } from './agents/nutrition-agent.ts';

// Mock Supabase Client
const mockSupabase = {
    from: (table: string) => ({
        select: () => ({
            ilike: () => ({
                limit: () => ({
                    maybeSingle: async () => ({ data: null }) // Cache miss
                })
            }),
            eq: () => ({
                eq: () => ({
                    limit: () => ({
                        maybeSingle: async () => ({ data: null }) // Unit conversion miss
                    })
                }),
                single: async () => ({ data: null })
            })
        }),
        insert: async () => ({ data: null, error: null })
    })
};

// Mock Context
const mockContext = {
    userId: 'test_user_verify',
    supabase: mockSupabase as any,
    db: {
        markMemoryUsed: async () => { },
        getHealthConstraints: async () => [],
        getMemories: async () => []
    } as any
};

async function runTest() {
    console.log('Starting Memory Verification (Specific Portion Context) [MOCKED]...');

    const nutritionAgent = new NutritionAgent();

    // The logic failure happens when:
    // 1. Portion is specific "200 ml"
    // 2. Memory exists "I usually drink my coffee with two tsp of sugar"

    // We expect the agent to apply this memory even though the portion is "200 ml".
    // Currently logic says: if portion is specific, do NOT apply memory.

    const memoryParams = {
        id: 'mem_1',
        user_id: mockContext.userId,
        category: 'food',
        fact: 'I usually drink my coffee with two tsp of sugar',
        source: 'user_input',
        created_at: new Date().toISOString()
    };

    console.log('Test Scenario:');
    console.log('- Memory:', memoryParams.fact);
    console.log('- Input:', 'instant coffee');
    console.log('- Portion:', '200 ml');

    const result = await nutritionAgent.execute({
        items: ['instant coffee'],
        portions: ['200 ml']
    }, {
        ...mockContext,
        memories: [memoryParams], // Pass memory directly
        healthConstraints: []
    });

    if (result && result.length > 0) {
        const item = result[0];
        console.log('\nResult:', {
            food_name: item.food_name,
            calories: item.calories,
            sugar_g: item.sugar_g,
            applied_memory: item.applied_memory ? item.applied_memory.fact : null
        });

        if (item.applied_memory) {
            console.log('\nPASS: Memory was applied!');
        } else {
            console.error('\nFAIL: Memory was NOT applied.');
        }
    } else {
        console.error('FAIL: No result from NutritionAgent.');
    }
}

runTest().catch(console.error);
