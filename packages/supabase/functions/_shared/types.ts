export interface IntentExtraction {
  intent: 'log_food' | 'log_recipe' | 'save_recipe' | 'query_nutrition' | 'update_goals' | 'clarify' | 'off_topic' | 'confirm' | 'decline' | 'modify'
  food_items?: string[]
  portions?: string[]
  recipe_text?: string
  recipe_portion?: string
  clarification_needed?: string
  // For modify intent
  modification_details?: string
  modified_items?: { index: number, item?: string, portion?: string }[]
}

export interface AgentContext {
  userId: string;
  sessionId?: string;
  supabase: any;
  timezone?: string;
}

export interface Agent<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: AgentContext): Promise<TOutput>;
}

export interface AgentResponse {
  status: 'success' | 'error' | 'ambiguous' | 'clarification'
  message: string
  response_type: string // 'food_logged' | 'confirmation_food_log' | 'confirmation_recipe_save' | ...
  data?: any
}

export interface FoodLogEntry {
  id?: string
  user_id: string
  food_name: string
  calories: number
  protein_g: number
  fat_total_g: number
  carbs_g: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  fat_saturated_g?: number
  cholesterol_mg?: number
  potassium_mg?: number
  fat_trans_g?: number
  calcium_mg?: number
  iron_mg?: number
  sugar_added_g?: number
  serving_size?: string
  meal_type?: string
  log_time?: string
}

export interface UserGoal {
  id?: string
  user_id: string
  nutrient: string
  target_value: number
  unit: string
  goal_type: 'goal' | 'limit'
}

export interface NutritionData {
  food_name: string
  calories: number
  protein_g: number
  fat_total_g: number
  carbs_g: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  fat_saturated_g?: number
  cholesterol_mg?: number
  potassium_mg?: number
  fat_trans_g?: number
  calcium_mg?: number
  iron_mg?: number
  sugar_added_g?: number
  serving_size?: string
}

export interface ValidationResult {
  passed: boolean
  warnings: string[]
  errors: string[]
}

export interface InsightResult {
  daily_totals: Record<string, number>
  goal_progress: Record<string, number>
  suggestions: string[]
  patterns?: string[]
}
