export interface IntentExtraction {
  intent: 'log_food' | 'log_recipe' | 'save_recipe' | 'query_nutrition' | 'update_goals' | 'suggest_goals' | 'clarify' | 'confirm' | 'decline' | 'modify' | 'off_topic'
  food_items?: string[]
  portions?: string[]
  recipe_text?: string
  recipe_portion?: string
  goal_action?: 'add' | 'remove' | 'update' | 'recommend'
  nutrient?: string
  value?: number
  unit?: string
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
  | 'fatal_error'
  | 'unknown'

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

export interface SessionState {
  user_id: string
  current_mode: 'idle' | 'flow_log_food' | 'flow_recipe_create' | 'flow_recipe_mod' | 'flow_goal_query' | 'flow_ambiguous'
  buffer: Record<string, any>
  missing_fields: string[]
  last_agent?: string
  metadata?: Record<string, any>
}
