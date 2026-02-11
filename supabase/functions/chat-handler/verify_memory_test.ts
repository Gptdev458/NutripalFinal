
import { NutritionAgent } from './agents/nutrition-agent.ts';
import { DbService } from './services/db-service.ts';
import { createAdminClient } from '../_shared/supabase-client.ts';

// Mock setup
const mockContext = {
    userId: 'test_user_verify_' + Date.now(),
    supabase: createAdminClient(),
    db: new DbService(createAdminClient())
};

async function runTest() {
    console.log('Starting Memory & Health Verification...');

    // Initialize Agent
    const nutritionAgent = new NutritionAgent();

    // 1. Setup Data - Health Constraint
    console.log('1. Setting up Health Constraint (Allergy: Peanuts)...');
    try {
        await mockContext.db.saveHealthConstraint(mockContext.userId, {
            category: 'allergy', // Assuming unique constraint on user_id + category for now, or just upserting
            constraint: 'peanuts',
            severity: 'high',
            active: true
        });
        console.log('- Saved constraint.');
    } catch (e) {
        console.error('Failed to save constraint:', e);
    }

    // 2. Setup Data - Learned Memory
    console.log('2. Setting up Learned Memory (Fact: "I always eat 2 slices of bread")...');
    try {
        await mockContext.db.saveMemory(mockContext.userId, 'food', 'I always eat 2 slices of bread', 'Verification Script');
        console.log('- Saved memory.');
    } catch (e) {
        console.error('Failed to save memory:', e);
    }

    // 3. Verify Health Check
    console.log('\n3. Testing Health Check (Input: Peanut Butter Sandwich)...');
    const healthConstraints = await mockContext.db.getHealthConstraints(mockContext.userId);
    const result1 = await nutritionAgent.execute({
        items: ['Peanut Butter Sandwich'],
        portions: ['1 sandwich']
    }, {
        ...mockContext,
        healthConstraints: healthConstraints,
        memories: []
    });

    if (result1 && result1.length > 0) {
        const item = result1[0];
        // @ts-ignore
        if (item.health_flags && item.health_flags.length > 0) {
            // @ts-ignore
            console.log('PASS: Health flags detected:', item.health_flags);
        } else {
            console.error('FAIL: No health flags detected for peanut item.');
            console.log('Item:', item);
        }
    } else {
        console.error('FAIL: No result from NutritionAgent.');
    }

    // 4. Verify Memory Application
    console.log('\n4. Testing Memory Application (Input: Bread, Portion: 1 slice)...');
    const memories = await mockContext.db.getMemories(mockContext.userId, ['food']);
    const result2 = await nutritionAgent.execute({
        items: ['Bread'],
        portions: ['1 slice']
    }, {
        ...mockContext,
        healthConstraints: [],
        memories: memories
    });

    if (result2 && result2.length > 0) {
        const item = result2[0];
        // @ts-ignore
        if (item.applied_memory) {
            // @ts-ignore
            console.log('PASS: Memory applied:', item.applied_memory.fact);
            console.log('PASS: Adjusted Portion:', item.serving_size_g + 'g / ' + item.calories + ' cal'); // Check if it scaled
        } else {
            console.error('FAIL: Memory illustration not applied.');
            console.log('Item:', item);
        }
    } else {
        console.error('FAIL: No result from NutritionAgent.');
    }
}

runTest().catch(console.error);
