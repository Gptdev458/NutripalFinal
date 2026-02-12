import { orchestrateV3 } from '../orchestrator_v3.ts'
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"

// Mock Supabase and OpenAI would be ideal, but for now we'll do a structural check
// or rely on the console logs if running in a real environment.

Deno.test("Phase 1: Greeting Fast-Path", async () => {
    const userId = "test-user-id"
    const message = "Hello NutriPal!"

    // We expect this to be fast because ReasoningAgent is skipped
    const startTime = Date.now()
    const result = await orchestrateV3(userId, message, "test-session", [], "UTC")
    const duration = Date.now() - startTime

    console.log(`Greeting duration: ${duration}ms`)

    assertEquals(result.status, 'success')
    assertExists(result.steps)
    // Should have steps like "Analyzing your request...", "Saying hello!"
    assertEquals(result.steps.includes('Saying hello!'), true)
})

Deno.test("Phase 1: onStep callback is called", async () => {
    const userId = "test-user-id"
    const message = "How many calories in an apple?"
    const steps: string[] = []

    const onStep = (step: string) => {
        steps.push(step)
    }

    await orchestrateV3(userId, message, "test-session", [], "UTC", onStep)

    console.log("Captured steps during test:", steps)
    assertEquals(steps.length > 0, true)
    assertEquals(steps.includes('Analyzing your request...'), true)
})

Deno.test("Phase 1: Recipe Shortcut Detection", async () => {
    const userId = "test-user-id"
    // Multiple ingredients and lines should trigger shortcut
    const message = "Lemon-Dill Mediterranean Chicken Soup\n- 2 chicken breasts\n- 1 cup dill\n- 1 lemon\nInstructions: boil it all."

    const steps: string[] = []
    const onStep = (step: string) => {
        steps.push(step)
    }

    const result = await orchestrateV3(userId, message, "test-session", [], "UTC", onStep)

    console.log("Recipe steps:", steps)
    assertEquals(steps.includes('This looks like a recipe! Parsing details...'), true)
    assertEquals(result.response_type, 'confirmation_recipe_save')
})

Deno.test("Feature 9: Day Classification Injection", async () => {
    // This test simulates the orchestrator flow with day classification
    const userId = "test-user-id"
    const message = "How is my sodium doing?"

    // NOTE: In a real test, we would mock DbService.getDayClassification to return { day_type: 'travel' }
    // and verify that ChatAgent receives this context.

    console.log("To verify Feature 9 manually:")
    console.log("1. Set 'travel' day in DB for today")
    console.log("2. Ask 'How am I doing?'")
    console.log("3. Check if response mentions travel context")
})
