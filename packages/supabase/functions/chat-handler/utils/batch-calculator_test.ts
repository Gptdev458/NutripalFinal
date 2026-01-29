/**
 * Batch Calculator Tests
 * 
 * Run with: deno test packages/supabase/functions/chat-handler/utils/batch-calculator_test.ts
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
    calculateBatchSize,
    generateBatchConfirmationPrompt,
    parseBatchSizeResponse,
    type Ingredient
} from './batch-calculator.ts'

Deno.test('calculateBatchSize - weight-based ingredients', () => {
    const ingredients: Ingredient[] = [
        { name: 'chicken breast', quantity: 500, unit: 'g' },
        { name: 'rice', quantity: 200, unit: 'g' },
        { name: 'vegetables', quantity: 300, unit: 'g' },
    ]

    const result = calculateBatchSize(ingredients)

    assertEquals(result.totalGrams, 1000)
    assertEquals(result.confidence, 'high')
    assertEquals(result.estimatedSize, '1.0kg')
    assertEquals(result.unconvertedIngredients.length, 0)
})

Deno.test('calculateBatchSize - volume-based ingredients', () => {
    const ingredients: Ingredient[] = [
        { name: 'chicken broth', quantity: 4, unit: 'cups' },
        { name: 'milk', quantity: 1, unit: 'cup' },
    ]

    const result = calculateBatchSize(ingredients)

    // 4 cups = 946ml, 1 cup = 237ml = total ~1183ml
    assertExists(result.totalMl)
    assertEquals(result.totalMl > 1000, true)
})

Deno.test('calculateBatchSize - mixed units', () => {
    const ingredients: Ingredient[] = [
        { name: 'flour', quantity: 2, unit: 'cups' },
        { name: 'butter', quantity: 100, unit: 'g' },
        { name: 'eggs', quantity: 2, unit: 'eggs' },
    ]

    const result = calculateBatchSize(ingredients)

    // Should convert at least some ingredients
    assertEquals(result.totalGrams > 0, true)
    assertEquals(result.confidence !== 'low', true)
})

Deno.test('calculateBatchSize - countable items', () => {
    const ingredients: Ingredient[] = [
        { name: 'eggs', quantity: 3, unit: 'large' },
        { name: 'banana', quantity: 2, unit: 'whole' },
    ]

    const result = calculateBatchSize(ingredients)

    // 3 eggs @ 50g = 150g, 2 bananas @ 118g = 236g, total = 386g
    assertEquals(result.totalGrams > 350, true)
    assertEquals(result.totalGrams < 450, true)
})

Deno.test('calculateBatchSize - unconvertible ingredients', () => {
    const ingredients: Ingredient[] = [
        { name: 'mysterious spice', quantity: 1, unit: 'pinch' },
        { name: 'special sauce', quantity: 2, unit: 'dollop' },
    ]

    const result = calculateBatchSize(ingredients)

    assertEquals(result.unconvertedIngredients.length, 2)
    assertEquals(result.confidence, 'low')
})

Deno.test('calculateBatchSize - soup recipe', () => {
    const ingredients: Ingredient[] = [
        { name: 'chicken broth', quantity: 1, unit: 'liter' },
        { name: 'chicken breast', quantity: 500, unit: 'g' },
        { name: 'onion', quantity: 1, unit: 'whole' },
        { name: 'carrots', quantity: 2, unit: 'whole' },
        { name: 'salt', quantity: 1, unit: 'tsp' },
    ]

    const result = calculateBatchSize(ingredients)

    // Should estimate well over 1kg for a soup
    assertEquals(result.totalGrams > 1500, true)
    assertEquals(result.confidence !== 'low', true)
})

Deno.test('generateBatchConfirmationPrompt - high confidence', () => {
    const result = {
        totalGrams: 1500,
        totalMl: 0,
        estimatedSize: '1.5kg',
        ingredientBreakdown: [],
        unconvertedIngredients: [],
        confidence: 'high' as const,
    }

    const prompt = generateBatchConfirmationPrompt(result)

    assertEquals(prompt.includes('1.5kg'), true)
    assertEquals(prompt.includes('Is this correct'), true)
})

Deno.test('generateBatchConfirmationPrompt - low confidence', () => {
    const result = {
        totalGrams: 500,
        totalMl: 0,
        estimatedSize: '500g',
        ingredientBreakdown: [],
        unconvertedIngredients: ['mystery ingredient', 'weird spice'],
        confidence: 'low' as const,
    }

    const prompt = generateBatchConfirmationPrompt(result)

    assertEquals(prompt.includes('mystery ingredient'), true)
    assertEquals(prompt.includes('weird spice'), true)
})

Deno.test('parseBatchSizeResponse - confirmation', () => {
    assertEquals(parseBatchSizeResponse('yes').confirmed, true)
    assertEquals(parseBatchSizeResponse('Yeah').confirmed, true)
    assertEquals(parseBatchSizeResponse('correct').confirmed, true)
    assertEquals(parseBatchSizeResponse('looks good').confirmed, true)
})

Deno.test('parseBatchSizeResponse - correction with size', () => {
    const result1 = parseBatchSizeResponse('no, it makes about 2 liters')
    assertEquals(result1.confirmed, false)
    assertEquals(result1.ml, 2000)

    const result2 = parseBatchSizeResponse('actually 1.5kg')
    assertEquals(result2.confirmed, false)
    assertEquals(result2.grams, 1500)
})

Deno.test('parseBatchSizeResponse - unclear rejection', () => {
    const result = parseBatchSizeResponse('I am not sure')
    assertEquals(result.confirmed, false)
    assertEquals(result.grams, undefined)
})
