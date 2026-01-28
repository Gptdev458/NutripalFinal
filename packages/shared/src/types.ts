// packages/shared/src/types.ts
import type { Session, User } from '@supabase/supabase-js';

// Re-export Supabase types for consistent usage
export type { Session as AuthSession, User as AuthUser };

// Define allowed string literal types based on usage in profileUtils and calculate-goals
export type Sex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type HealthGoal = 'weight_loss' | 'weight_gain' | 'maintenance';

// User profile data matching the database table 'user_profiles'
export interface UserProfile {
  id: string; // Primary key, links to auth.users
  full_name?: string | null;
  age?: number | null;
  gender?: string | null; // male, female, other
  height_cm?: number | null;
  weight_kg?: number | null;
  activity_level?: ActivityLevel | null;
  dietary_preferences?: string[] | null;
  health_goal?: HealthGoal | null;
  created_at?: string;
  updated_at?: string;
}

// User goals (one row per nutrient for flexibility)
export interface UserGoal {
  id?: string;
  user_id: string;
  nutrient: string;
  target_value: number;
  unit: string;
  goal_type: 'goal' | 'limit';
  created_at?: string;
  updated_at?: string;
}

// Food log entry
export interface FoodLogEntry {
  id: string;
  user_id: string;
  food_name: string;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_total_g?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  fat_saturated_g?: number | null;
  cholesterol_mg?: number | null;
  potassium_mg?: number | null;
  fat_trans_g?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  sugar_added_g?: number | null;
  serving_size?: string | null;
  meal_type?: string | null;
  log_time: string;
  created_at?: string;
  updated_at?: string;
}

// Agent system types
export interface AgentResponse {
  status: 'success' | 'error' | 'ambiguous' | 'clarification' | 'proposal'
  message: string
  response_type: string
  data?: any
}

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

export interface ParsedRecipe {
  recipe_name: string
  servings: number
  ingredients: {
    name: string
    quantity: number
    unit: string
    nutrition?: NutritionData | null
  }[]
  instructions?: string
  total_nutrition?: Record<string, number>
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

// Structure for the calculated nutritional goals
export interface NutritionalGoals {
  calories: number;
  protein_g: number;
  fat_total_g: number;
  carbs_g: number;
  fiber_g: number;
  fat_saturated_g: number;
  sodium_mg: number;
  sugar_added_g: number;
  vitamin_d_mcg: number;
  calcium_mg: number;
  iron_mg: number;
}

export interface CalculatedGoalsResponse {
  recommendations: NutritionalGoals;
}
