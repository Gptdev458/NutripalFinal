/**
 * Nutrition Lookup Module
 * 
 * Provides unified access to nutrition data from multiple sources:
 * - USDA Food Data Central (FDC)
 * - Open Food Facts (OFF)
 * 
 * This module is designed to be reusable across different backend implementations.
 */

// Re-export types
export type { 
  NutritionData, 
  LookupResult, 
  AmbiguousOption, 
  ScoredProduct,
  PopularBrandedFood 
} from './types.ts';

// Export Food Data Central functions
export {
  nutrientIdMap,
  commonFoodNutritionFallbacks,
  popularBrandedFoods,
  getFDCApiKey,
  calculateFDCProductScore,
  extractNutritionDataFromFDC,
  createFDCAmbiguityResponse,
  isAmbiguousMatch as isFDCAmbiguousMatch,
  matchPopularBrandedFood,
  searchFoodDataCentral,
  lookupFoodDataCentral
} from './food-data-central.ts';

// Export Open Food Facts functions
export {
  calculateProductScore as calculateOFFProductScore,
  isAmbiguousMatch as isOFFAmbiguousMatch,
  extractNutritionData as extractOFFNutritionData,
  lookupOpenFoodFacts
} from './open-food-facts.ts';

/**
 * Look up nutrition information for a food, trying multiple sources
 * 
 * Order of lookup:
 * 1. Food Data Central (USDA)
 * 2. Open Food Facts (fallback)
 */
import { lookupFoodDataCentral } from './food-data-central.ts';
import { lookupOpenFoodFacts } from './open-food-facts.ts';
import type { LookupResult } from './types.ts';

export async function lookupNutrition(foodName: string): Promise<LookupResult> {
  console.log(`[NutritionLookup] Looking up: '${foodName}'`);
  
  // Try Food Data Central first
  const fdcResult = await lookupFoodDataCentral(foodName);
  
  // If successful or ambiguous, return the result
  if (fdcResult.status === 'success' || fdcResult.status === 'ambiguous') {
    return fdcResult;
  }
  
  // If not found or error in FDC, try Open Food Facts
  console.log(`[NutritionLookup] FDC failed with status '${fdcResult.status}', trying Open Food Facts`);
  const offResult = await lookupOpenFoodFacts(foodName);
  
  return offResult;
}
