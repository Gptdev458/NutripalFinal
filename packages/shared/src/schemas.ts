import { z } from 'zod';

export const AgentResponseSchema = z.object({
    status: z.enum(['success', 'error', 'ambiguous', 'clarification', 'proposal']),
    message: z.string(),
    response_type: z.string(),
    data: z.any().optional(),
});

export const IntentExtractionSchema = z.object({
    intent: z.enum([
        'log_food', 'log_recipe', 'save_recipe', 'query_nutrition',
        'update_goals', 'suggest_goals', 'clarify', 'confirm',
        'decline', 'modify', 'off_topic'
    ]),
    food_items: z.array(z.string()).optional(),
    portions: z.array(z.string()).optional(),
    recipe_text: z.string().optional(),
    recipe_portion: z.string().optional(),
    goal_action: z.enum(['add', 'remove', 'update', 'recommend']).optional(),
    nutrient: z.string().optional(),
    value: z.number().optional(),
    unit: z.string().optional(),
    clarification_needed: z.string().optional(),
    modification_details: z.string().optional(),
    modified_items: z.array(z.object({
        index: z.number().optional(),
        item: z.string().optional(),
        portion: z.string().optional(),
    })).optional(),
});

export const NutritionDataSchema = z.object({
    calories: z.number().optional().nullable(),
    protein_g: z.number().optional().nullable(),
    fat_total_g: z.number().optional().nullable(),
    carbs_g: z.number().optional().nullable(),
    fiber_g: z.number().optional().nullable(),
    sugar_g: z.number().optional().nullable(),
    sodium_mg: z.number().optional().nullable(),
    serving_size: z.string().optional().nullable(),
});
