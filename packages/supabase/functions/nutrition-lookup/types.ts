/**
 * Shared types for nutrition data lookup adapters
 */

/**
 * Standardized nutrition data structure returned by all adapters
 */
export interface NutritionData {
  food_name: string;
  calories: number | null;
  protein_g: number | null;
  fat_total_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  cholesterol_mg: number | null;
  fat_saturated_g: number | null;
  potassium_mg: number | null;
  fat_trans_g?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  sugar_added_g?: number | null;
  serving_size?: string;
  brand?: string | null;
}

/**
 * Result from a nutrition lookup operation
 */
export interface LookupResult {
  status: 'success' | 'error' | 'ambiguous' | 'not_found';
  product_name?: string;
  nutrition_data?: NutritionData;
  brand?: string | null;
  confidence_score?: number;
  message: string;
  response_type: string;
  source?: 'fdc' | 'off' | 'cache' | 'fallback_data';
  from_cache?: boolean;
  options?: AmbiguousOption[];
  original_query?: string;
}

/**
 * Option presented when multiple products match a query
 */
export interface AmbiguousOption {
  product_name: string;
  brand: string;
  calories: number;
  description?: string;
  fdcId?: number;
  score?: number;
  nutrition_data?: Partial<NutritionData>;
  display_name?: string;
}

/**
 * Scored product for internal ranking
 */
export interface ScoredProduct<T = any> {
  product: T;
  food?: T;
  score: number;
}

/**
 * Popular branded food entry for special handling
 */
export interface PopularBrandedFood {
  name: string;
  brand: string;
  exactTerms?: string[];
}
