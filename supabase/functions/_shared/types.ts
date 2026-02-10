export interface IntentExtraction {
  intent: 'log_food' | 'log_recipe' | 'save_recipe' | 'query_nutrition' | 'update_goals' | 'suggest_goals' | 'clarify' | 'confirm' | 'decline' | 'modify' | 'off_topic' | 'cancel' | 'query_goals' | 'query_progress' | 'dietary_advice' | 'greet'
  confidence?: number  // 0-1 confidence score from IntentAgent
  entities?: string[]  // Extracted entities (food names, portions, etc.)
  food_items?: string[]
  portions?: string[]
  calories?: number
  macros?: { protein?: number, carbs?: number, fat?: number }
  recipe_text?: string
  recipe_portion?: string
  goal_action?: 'add' | 'remove' | 'update' | 'recommend'
  nutrient?: string
  value?: number
  unit?: string
  ambiguity_level?: 'none' | 'low' | 'medium' | 'high'
  ambiguity_reasons?: string[]
  clarification_needed?: string
  modification_details?: string
  modified_items?: { index?: number, item?: string, portion?: string }[]
}

export interface AgentContext {
  userId: string;
  sessionId?: string;
  supabase: any;
  timezone?: string;
  session?: SessionState;
}

export interface Agent<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: AgentContext): Promise<TOutput>;
}

export interface AgentResponse {
  status: 'success' | 'error' | 'ambiguous' | 'clarification' | 'proposal'
  message: string
  response_type: ResponseType
  data?: any
  steps?: string[] // "Thinking" steps for UX
}

/**
 * Response types for the chat system.
 * Recipe flow types: pending_batch_confirm → pending_servings_confirm → confirmation_recipe_save → recipe_saved
 */
export type ResponseType =
  // Food logging
  | 'food_logged'
  | 'confirmation_food_log'
  | 'nutrition_info'
  | 'nutrition_not_found'
  // Recipe management
  | 'pending_batch_confirm'
  | 'pending_servings_confirm'
  | 'pending_duplicate_confirm'
  | 'ready_to_save'
  | 'confirmation_recipe_save'
  | 'confirmation_recipe_log'
  | 'recipe_saved'
  | 'recipe_updated'
  | 'recipe_not_found'
  | 'recipe_logged'
  | 'clarification_needed'
  // Goals
  | 'goal_updated'
  | 'goals_updated'
  | 'goals_summary'
  | 'confirmation_goal_update'
  | 'confirmation_multi_goal_update'
  // General
  | 'chat_response'
  | 'action_cancelled'
  | 'action_confirmed'
  | 'confirmation_failed'
  | 'fatal_error'
  | 'unknown'

export interface FoodLogEntry {
  id?: string
  user_id: string
  food_name: string
  portion?: string  // User-specified portion
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
  recipe_id?: string
  // New Exhaustive Nutrients
  hydration_ml?: number
  fat_poly_g?: number
  fat_mono_g?: number
  omega_3_g?: number
  omega_6_g?: number
  fiber_soluble_g?: number
  magnesium_mg?: number
  phosphorus_mg?: number
  zinc_mg?: number
  copper_mg?: number
  manganese_mg?: number
  selenium_mcg?: number
  vitamin_a_mcg?: number
  vitamin_c_mg?: number
  vitamin_d_mcg?: number
  vitamin_e_mg?: number
  vitamin_k_mcg?: number
  thiamin_mg?: number
  riboflavin_mg?: number
  niacin_mg?: number
  pantothenic_acid_mg?: number
  vitamin_b6_mg?: number
  biotin_mcg?: number
  folate_mcg?: number
  vitamin_b12_mcg?: number
  omega_ratio?: number
  extras?: Record<string, any>
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
  // New Exhaustive Nutrients
  hydration_ml?: number
  fat_poly_g?: number
  fat_mono_g?: number
  omega_3_g?: number
  omega_6_g?: number
  fiber_soluble_g?: number
  magnesium_mg?: number
  phosphorus_mg?: number
  zinc_mg?: number
  copper_mg?: number
  manganese_mg?: number
  selenium_mcg?: number
  vitamin_a_mcg?: number
  vitamin_c_mg?: number
  vitamin_d_mcg?: number
  vitamin_e_mg?: number
  vitamin_k_mcg?: number
  thiamin_mg?: number
  riboflavin_mg?: number
  niacin_mg?: number
  pantothenic_acid_mg?: number
  vitamin_b6_mg?: number
  biotin_mcg?: number
  folate_mcg?: number
  vitamin_b12_mcg?: number
  omega_ratio?: number
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

export interface SessionState {
  user_id: string
  current_mode: 'idle' | 'flow_log_food' | 'flow_recipe_create' | 'flow_recipe_mod' | 'flow_goal_update' | 'flow_clarification'

  // Pending Actions (for confirm/decline flows)
  pending_action?: {
    type: 'food_log' | 'recipe_save' | 'goal_update'
    data: any
    created_at: string
  }

  // Context Buffer (enhanced for Phase 2 memory system)
  buffer: SessionBuffer

  // Agent Memory
  last_agent?: string
  last_intent?: string
  last_response_type?: string

  // Missing Fields for clarification
  missing_fields: string[]
  metadata?: Record<string, any>
}

/**
 * Enhanced Session Buffer for conversation context preservation.
 * Added in Phase 2.1 of the devplan.
 */
export interface SessionBuffer {
  // Recipe flow state (existing)
  flowState?: RecipeFlowState

  // NEW: Recent foods mentioned in conversation (last 5)
  recentFoods?: string[]

  // NEW: Last topic discussed for context awareness
  lastTopic?: 'food' | 'recipe' | 'goals' | 'general'

  // NEW: User corrections to remember preferences
  userCorrections?: Array<{ original: string; corrected: string }>

  // NEW: Active recipe context during recipe flows
  activeRecipeContext?: { name: string; ingredients: string[] }

  // Generic key-value storage for additional data
  [key: string]: any
}

/**
 * Recipe flow state for multi-step recipe creation
 */
export interface RecipeFlowState {
  step?: 'parsing' | 'batch_confirm' | 'servings_confirm' | 'ready_to_save'
  recipeName?: string
  ingredients?: string[]
  totalNutrition?: NutritionData
  batchSize?: { amount: number; unit: string }
  servings?: number
}

