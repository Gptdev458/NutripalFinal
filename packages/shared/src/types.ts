// packages/shared/src/types.ts
import type { Session, User } from '@supabase/supabase-js';

// Re-export Supabase types for consistent usage
export type { Session as AuthSession, User as AuthUser };

// Define allowed string literal types based on usage in profileUtils and calculate-goals
export type Sex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type HealthGoal = 'weight_loss' | 'weight_gain' | 'maintenance';

// User profile data matching the database table 'user_profiles' and function inputs
export interface UserProfile {
  user_id: string; // Primary key, links to auth.users
  created_at?: string; // Timestamps usually handled by DB
  updated_at?: string;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  sex?: Sex | null;
  activity_level?: ActivityLevel | null;
  health_goal?: HealthGoal | null;
  // Add any other custom fields from your 'user_profiles' table here
}

// Structure for the calculated nutritional goals
// Based on the return value of the 'calculate-goals' function
export interface NutritionalGoals {
  calories: number;
  protein_g: number;
  fat_total_g: number;
  carbs_g: number;
  fiber_g: number;
  fat_saturated_g: number;
  sodium_mg: number; // Added from getGeneralGuidelines
  sugar_added_g: number; // Added from getGeneralGuidelines
  vitamin_d_mcg: number; // Added from getGeneralGuidelines
  calcium_mg: number; // Added from getGeneralGuidelines
  iron_mg: number; // Added from getGeneralGuidelines
  // Add other calculated/guideline nutrients if the function provides them
}

// Represents the structure returned by calculateNutritionalGoals utility
export interface CalculatedGoalsResponse {
    recommendations: NutritionalGoals;
} 