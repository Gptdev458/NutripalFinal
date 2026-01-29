/**
 * Food Data Central (USDA) API integration
 * Provides functions to search and extract nutrition data from the USDA Food Data Central API
 */

import type { NutritionData, LookupResult, AmbiguousOption, PopularBrandedFood } from './types.ts';

/**
 * Map of FDC nutrient IDs to our internal nutrition field names
 */
export const nutrientIdMap: Record<number, string> = {
  1008: 'calories',        // Energy (KCAL)
  1003: 'protein_g',       // Protein
  1004: 'fat_total_g',     // Total lipid (fat)
  1005: 'carbs_g',         // Carbohydrate, by difference
  1079: 'fiber_g',         // Fiber, total dietary
  2000: 'sugar_g',         // Total Sugars
  1093: 'sodium_mg',       // Sodium, Na
  1253: 'cholesterol_mg',  // Cholesterol
  1258: 'fat_saturated_g', // Fatty acids, total saturated
  1092: 'potassium_mg',    // Potassium, K
  1257: 'fat_trans_g',     // Fatty acids, total trans
  1087: 'calcium_mg',      // Calcium, Ca
  1089: 'iron_mg',         // Iron, Fe
  1235: 'sugar_added_g',   // Sugars, added
};

/**
 * Common food nutrition fallbacks for popular branded items
 */
export const commonFoodNutritionFallbacks: Record<string, NutritionData> = {
  'oreo cookies': {
    food_name: 'Oreo Cookies',
    calories: 140,
    protein_g: 1,
    fat_total_g: 7,
    carbs_g: 21,
    fiber_g: 0.8,
    sugar_g: 13,
    sodium_mg: 140,
    fat_saturated_g: 2,
    cholesterol_mg: null,
    potassium_mg: null,
    serving_size: '3 cookies (34g)'
  },
  'regular oreo cookies': {
    food_name: 'Regular Oreo Cookies',
    calories: 140,
    protein_g: 1,
    fat_total_g: 7,
    carbs_g: 21,
    fiber_g: 0.8,
    sugar_g: 13,
    sodium_mg: 140,
    fat_saturated_g: 2,
    cholesterol_mg: null,
    potassium_mg: null,
    serving_size: '3 cookies (34g)'
  }
};

/**
 * List of popular branded products that might need special handling
 */
export const popularBrandedFoods: PopularBrandedFood[] = [
  // Cookies and Snacks
  { name: 'oreo', brand: 'nabisco', exactTerms: ['oreo cookies', 'regular oreo cookies'] },
  { name: 'chips ahoy', brand: 'nabisco' },
  { name: 'ritz crackers', brand: 'nabisco' },
  { name: 'doritos', brand: 'frito-lay' },
  { name: 'cheetos', brand: 'frito-lay' },
  { name: 'lays potato chips', brand: 'frito-lay' },
  { name: 'pringles', brand: 'kelloggs' },

  // Cereals
  { name: 'cheerios', brand: 'general mills' },
  { name: 'lucky charms', brand: 'general mills' },
  { name: 'frosted flakes', brand: 'kelloggs' },
  { name: 'special k', brand: 'kelloggs' },

  // Beverages
  { name: 'coca cola', brand: 'coca-cola' },
  { name: 'pepsi', brand: 'pepsico' },
  { name: 'gatorade', brand: 'pepsico' },
  { name: 'sprite', brand: 'coca-cola' },
  { name: 'mountain dew', brand: 'pepsico' },

  // Dairy and Condiments
  { name: 'kraft mac and cheese', brand: 'kraft' },
  { name: 'philadelphia cream cheese', brand: 'kraft' },
  { name: 'heinz ketchup', brand: 'kraft heinz' },
  { name: 'hellmanns mayonnaise', brand: 'unilever' },

  // Frozen Foods
  { name: 'ben and jerrys', brand: 'unilever' },
  { name: 'hot pockets', brand: 'nestle' },
  { name: 'digiorno pizza', brand: 'nestle' }
];

/**
 * Get Food Data Central API key from environment or fallback
 */
export function getFDCApiKey(): string {
  try {
    // @ts-ignore: Deno Deploy compatibility
    const envApiKey = typeof Deno !== 'undefined' ? Deno.env.get("FOOD_DATA_CENTRAL_API_KEY") : undefined;

    if (envApiKey) {
      return envApiKey;
    }
  } catch (error) {
    console.warn("Error retrieving API key from environment, using fallback key", error);
  }
  // Fallback to demo key (rate limited)
  return 'DEMO_KEY';
}

/**
 * Score a Food Data Central product based on relevance to search query
 */
export function calculateFDCProductScore(
  description: string,
  brand: string,
  searchTerm: string,
  nutrients: any[]
): number {
  let score = 0;

  const productNameLower = description.toLowerCase();
  const brandLower = (brand || '').toLowerCase();
  const searchWords = searchTerm.toLowerCase().split(/\s+/);

  // Basic word matching
  for (const word of searchWords) {
    if (word.length > 2 && productNameLower.includes(word)) {
      score += 30 / searchWords.length;
    }
  }

  // Exact match bonus
  if (productNameLower === searchTerm.toLowerCase()) {
    score += 50;
  }

  // Brand matching
  if (brand) {
    for (const word of searchWords) {
      if (word.length > 2 && brandLower.includes(word)) {
        score += 15;
        break;
      }
    }
  } else {
    score -= 10;
  }

  // Nutrition data quality
  if (nutrients && nutrients.length > 0) {
    const hasCalories = nutrients.some(n => n.nutrientId === 1008 && n.value > 0);
    const hasProtein = nutrients.some(n => n.nutrientId === 1003 && n.value !== undefined);
    const hasCarbs = nutrients.some(n => n.nutrientId === 1005 && n.value !== undefined);
    const hasFat = nutrients.some(n => n.nutrientId === 1004 && n.value !== undefined);

    if (hasCalories) {
      score += 30;
    } else {
      score -= 50;
    }

    if (hasProtein) score += 10;
    if (hasCarbs) score += 10;
    if (hasFat) score += 10;

    if (nutrients.length < 5) {
      score -= 20;
    }
  } else {
    score -= 50;
  }

  // Penalize generic terms
  const genericTerms = ['bar', 'snack', 'drink', 'cereal', 'yogurt'];
  if (searchWords.length > 1 && genericTerms.some(term => productNameLower === term)) {
    score -= 30;
  }

  // Boost for major brands
  const majorBrands = ['mondelez', 'nabisco', 'kraft', 'kellogg', 'general mills', 'nestle', 'pepsico'];
  if (brandLower && majorBrands.some(b => brandLower.includes(b))) {
    score += 15;
  }

  // Penalize wrong product types
  const unwantedSubstrings = ['ice cream', 'cereal', 'cones', 'cheesecake', 'pudding', 'milkshake', 'cake'];
  if (searchTerm.toLowerCase().includes('cookie') || searchTerm.toLowerCase().includes('oreo')) {
    for (const substring of unwantedSubstrings) {
      if (productNameLower.includes(substring)) {
        score -= 30;
        break;
      }
    }
  }

  return score;
}

/**
 * Extract standardized nutrition data from a Food Data Central food item
 */
export function extractNutritionDataFromFDC(food: any): NutritionData {
  const data: Record<string, any> = {
    food_name: food.description || '',
    calories: null,
    protein_g: null,
    fat_total_g: null,
    carbs_g: null,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    cholesterol_mg: null,
    fat_saturated_g: null,
    potassium_mg: null,
    // Add extra metadata for scaling
    serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : undefined,
    brand: food.brandOwner || food.brandName || null,
  };

  // If servingSize is missing but we have household serving info, use that as a label
  if (!data.serving_size && food.householdServingFullText) {
    data.serving_size = food.householdServingFullText;
  }

  // Handle Foundation/Legacy foods which are usually per 100g
  if (!data.serving_size && (food.dataType === 'Foundation' || food.dataType === 'SR Legacy')) {
    data.serving_size = '100g';
  }

  // Process each nutrient
  if (food.foodNutrients && Array.isArray(food.foodNutrients)) {
    food.foodNutrients.forEach((nutrient: any) => {
      // Different FDC API versions use different field names for nutrient ID
      const nutrientId = nutrient.nutrientId || (nutrient.nutrient ? nutrient.nutrient.id : null);
      const value = nutrient.value !== undefined ? nutrient.value : (nutrient.amount !== undefined ? nutrient.amount : null);

      if (nutrientId && nutrientIdMap[nutrientId] && value !== null) {
        data[nutrientIdMap[nutrientId]] = parseFloat(value);
      }
    });
  }

  // Round calories to nearest whole number
  if (data.calories !== null) {
    data.calories = Math.round(data.calories);
  }

  // Round other values to 1 decimal place
  for (const key in data) {
    if (typeof data[key] === 'number' && key !== 'calories') {
      data[key] = Math.round(data[key] * 10) / 10;
    }
  }

  return data as NutritionData;
}

/**
 * Creates an ambiguity response when multiple foods match the search query
 */
export function createFDCAmbiguityResponse(validProducts: any[], searchTerm: string): LookupResult {
  const options: AmbiguousOption[] = validProducts.map(p => ({
    product_name: p.food.description || 'Unknown product',
    brand: p.food.brandOwner || p.food.brandName || 'Unknown brand',
    calories: 0,
    score: p.score,
    fdcId: p.food.fdcId
  }));

  return {
    status: 'ambiguous',
    options,
    message: `I found multiple potential matches for "${searchTerm}". Please select the correct one:`,
    response_type: 'ambiguous_product'
  };
}

/**
 * Checks if two product scores are close enough to be considered ambiguous
 */
export function isAmbiguousMatch(score1: number, score2: number): boolean {
  if (score1 > 90) {
    return (score1 - score2) < 15;
  }
  return (score1 - score2) < 10;
}

/**
 * Determines if a search query is likely for a basic ingredient
 */
function isBasicIngredient(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  const basicIngredientTerms = [
    'chicken', 'beef', 'pork', 'fish', 'turkey', 'lamb',
    'apple', 'banana', 'orange', 'grape', 'berry', 'fruit',
    'broccoli', 'spinach', 'carrot', 'potato', 'vegetable',
    'rice', 'pasta', 'bread', 'egg', 'milk', 'cheese',
    'raw', 'fresh', 'boiled', 'steamed', 'grilled', 'baked'
  ];

  return basicIngredientTerms.some(term => lowerQuery.includes(term));
}

/**
 * Checks if a search term matches any popular branded food
 */
export function matchPopularBrandedFood(searchTerm: string): PopularBrandedFood | null {
  const lowerSearchTerm = searchTerm.toLowerCase();

  const exactMatch = popularBrandedFoods.find(item => lowerSearchTerm === item.name);
  if (exactMatch) return exactMatch;

  const exactTermMatch = popularBrandedFoods.find(item =>
    item.exactTerms && item.exactTerms.some(term => term === lowerSearchTerm)
  );
  if (exactTermMatch) return exactTermMatch;

  const containsMatch = popularBrandedFoods.find(item => {
    return lowerSearchTerm.includes(item.name) || item.name.includes(lowerSearchTerm);
  });

  return containsMatch || null;
}

/**
 * Search Food Data Central API for foods matching the query
 */
export async function searchFoodDataCentral(query: string): Promise<any> {
  const apiKey = getFDCApiKey();

  const shouldIncludeStandardFoods = isBasicIngredient(query);

  let dataTypeParam = 'Branded';
  if (shouldIncludeStandardFoods) {
    dataTypeParam = 'Branded,Foundation,SR%20Legacy';
  }

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&dataType=${dataTypeParam}&pageSize=15`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Food Data Central API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Look up nutrition information for a food using Food Data Central
 */
export async function lookupFoodDataCentral(foodName: string): Promise<LookupResult> {
  console.log(`[FDC] Looking up: '${foodName}'`);

  const cleanedFoodName = (foodName || '').trim();
  if (!cleanedFoodName) {
    return {
      status: 'error',
      message: 'Please provide a food name to look up.',
      response_type: 'error_missing_food_name'
    };
  }

  try {
    // Check for fallback data first
    const fallbackKey = cleanedFoodName.toLowerCase();
    if (commonFoodNutritionFallbacks[fallbackKey]) {
      console.log(`[FDC] Using fallback nutrition data for '${cleanedFoodName}'`);
      return {
        status: 'success',
        product_name: commonFoodNutritionFallbacks[fallbackKey].food_name,
        nutrition_data: commonFoodNutritionFallbacks[fallbackKey],
        from_cache: false,
        message: `Found nutrition information for "${commonFoodNutritionFallbacks[fallbackKey].food_name}".`,
        response_type: 'product_found',
        source: 'fallback_data'
      };
    }

    // Check if this is a popular branded food
    const popularFoodMatch = matchPopularBrandedFood(cleanedFoodName);
    const isPopularFood = !!popularFoodMatch;

    // Search Food Data Central
    console.log(`[FDC] Querying API for '${cleanedFoodName}'`);
    const searchResults = await searchFoodDataCentral(cleanedFoodName);

    if (!searchResults.foods || searchResults.foods.length === 0) {
      console.log(`[FDC] No results found for '${cleanedFoodName}'`);
      return {
        status: 'not_found',
        message: `No results found in Food Data Central for '${cleanedFoodName}'`,
        response_type: 'not_found_in_fdc'
      };
    }

    // Score products
    const scoredProducts = searchResults.foods.map((food: any) => ({
      food,
      score: calculateFDCProductScore(
        food.description || '',
        food.brandOwner || food.brandName || '',
        cleanedFoodName,
        food.foodNutrients || []
      )
    }));

    // Filter low-scoring products
    const validProducts = scoredProducts.filter((p: any) => p.score > 50);

    if ((validProducts.length === 0 || !validProducts.some((p: any) => p.score > 80)) && isPopularFood) {
      console.log(`[FDC] No high confidence match for popular food '${cleanedFoodName}'`);
      return {
        status: 'not_found',
        message: `No good matches for '${cleanedFoodName}' in Food Data Central`,
        response_type: 'not_found_in_fdc'
      };
    }

    if (validProducts.length === 0) {
      return {
        status: 'error',
        message: `I couldn't find a good match for "${cleanedFoodName}". Could you provide the nutrition details from the package?`,
        response_type: 'error_product_not_found'
      };
    }

    // Sort by score
    validProducts.sort((a: any, b: any) => b.score - a.score);
    const bestMatch = validProducts[0];

    // Check for ambiguous matches
    if (validProducts.length > 1) {
      const secondBest = validProducts[1];
      if (isAmbiguousMatch(bestMatch.score, secondBest.score)) {
        return createFDCAmbiguityResponse(validProducts.slice(0, 3), cleanedFoodName);
      }
    }

    // Process best match
    const bestFood = bestMatch.food;
    const nutritionData = extractNutritionDataFromFDC(bestFood);

    // Check for missing critical nutrients
    const hasMissingCriticalNutrients =
      nutritionData.calories === null ||
      nutritionData.protein_g === null ||
      nutritionData.fat_total_g === null ||
      nutritionData.carbs_g === null;

    if (hasMissingCriticalNutrients && isPopularFood) {
      console.log(`[FDC] Found match but missing critical nutrients for '${cleanedFoodName}'`);
      return {
        status: 'not_found',
        message: `Found match for '${cleanedFoodName}' in FDC but missing critical nutrients`,
        response_type: 'insufficient_data_in_fdc'
      };
    }

    return {
      status: 'success',
      product_name: bestFood.description || cleanedFoodName,
      brand: bestFood.brandOwner || bestFood.brandName || null,
      nutrition_data: nutritionData,
      confidence_score: bestMatch.score,
      message: `Found nutrition information for "${bestFood.description || cleanedFoodName}".`,
      response_type: 'product_found',
      source: 'fdc'
    };

  } catch (error) {
    console.error(`[FDC] Error looking up food '${cleanedFoodName}':`, error);
    return {
      status: 'error',
      message: `I encountered an error looking up "${cleanedFoodName}". Could you try a different food item?`,
      response_type: 'error_api_failure'
    };
  }
}
