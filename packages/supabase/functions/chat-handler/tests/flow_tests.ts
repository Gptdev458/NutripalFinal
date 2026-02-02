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

Deno.test("Phase 1: ThoughtLogger handles steps", async () => {
    const userId = "test-user-id"
    const message = "How many calories in an apple?"

    const result = await orchestrateV3(userId, message, "test-session", [], "UTC")

    assertExists(result.steps)
    // Should have steps for thinking and looking up/estimating
    assertEquals(result.steps.length > 1, true)
    console.log("Steps taken:", result.steps)
})
