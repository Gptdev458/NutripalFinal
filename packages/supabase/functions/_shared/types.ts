export interface AgentResponse {
  status: 'success' | 'error' | 'ambiguous' | 'clarification'
  message: string
  response_type: string
  data?: any
}

export interface IntentExtraction {
  intent: 'log_food' | 'log_recipe' | 'save_recipe' | 'query_nutrition' | 'update_goals' | 'clarify' | 'off_topic'
  food_items?: string[]
  portions?: string[]
  recipe_text?: string
  clarification_needed?: string
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
