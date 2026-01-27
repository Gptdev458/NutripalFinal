/**
 * Open Food Facts API integration
 * Provides functions to search and extract nutrition data from the Open Food Facts API
 */

import type { NutritionData, LookupResult, AmbiguousOption, ScoredProduct } from './types.ts';

/**
 * Extract potential brand name from a food query
 */
function extractPotentialBrand(query: string): string {
  const commonBrands = [
    'nabisco', 'oreo', 'kellogg', 'general mills', 'kraft', 'heinz', 
    'campbell', 'nestle', 'hershey', 'coca-cola', 'pepsi', 'frito-lay',
    'quaker', 'betty crocker', 'pillsbury', 'mccormick', 'tyson',
    'dole', 'progresso', 'hormel', 'yoplait', 'starbucks', 'lipton'
  ];
  
  const queryLower = query.toLowerCase();
  
  for (const brand of commonBrands) {
    if (queryLower.includes(brand)) {
      return brand;
    }
  }
  
  const words = query.split(/\s+/);
  if (words.length >= 2 && words[0].length >= 3) {
    return words[0];
  }
  
  return '';
}

/**
 * Calculate product match score for Open Food Facts results
 */
export function calculateProductScore(
  productName: string, 
  brand: string, 
  searchTerm: string, 
  nutrition: any
): number {
  let score = 0;
  const productNameLower = productName.toLowerCase();
  const brandLower = brand.toLowerCase();
  const searchTermLower = searchTerm.toLowerCase();
  const searchWords = searchTermLower.split(' ').filter(w => w.length > 1);
  const productWords = productNameLower.split(' ').filter(w => w.length > 1);

  // Exact matches (highest priority)
  if (productNameLower === searchTermLower) {
    score += 200;
  } else if (productNameLower.includes(searchTermLower)) {
    score += 150;
  } else if (searchWords.every(word => productNameLower.includes(word))) {
    score += 100;
    // Bonus for words in same order
    if (searchWords.reduce((acc, word, i) => {
      const pos = productNameLower.indexOf(word);
      return acc && pos > -1 && (!i || pos > productNameLower.indexOf(searchWords[i-1]));
    }, true)) {
      score += 30;
    }
  }

  // Brand matching
  const brandWords = brandLower.split(' ').filter(w => w.length > 1);
  const searchBrandWords = searchWords.slice(0, 2);
  
  if (brandWords.some(bWord => searchBrandWords.includes(bWord))) {
    score += 100;
  } else if (searchTermLower.includes(brandLower)) {
    score += 75;
  } else if (brandWords.some(bWord => searchTermLower.includes(bWord))) {
    score += 50;
  }

  // Word overlap scoring
  const commonWords = searchWords.filter(word => productWords.includes(word));
  score += commonWords.length * 20;

  // Nutrition data quality
  if (nutrition) {
    if (nutrition.calories || nutrition['energy-kcal_100g']) {
      score += 30;
    }
    if (nutrition.protein_g || nutrition.proteins_100g) {
      score += 10;
    }
    if (nutrition.carbs_g || nutrition.carbohydrates_100g) {
      score += 10;
    }
    if (nutrition.fat_total_g || nutrition.fat_100g) {
      score += 10;
    }
  } else {
    score -= 50;
  }

  // Penalize generic terms
  const genericTerms = ['bar', 'snack', 'drink', 'cereal', 'yogurt'];
  if (searchWords.length > 1 && genericTerms.some(term => productNameLower === term)) {
    score -= 30;
  }

  return score;
}

/**
 * Checks if two product scores are close enough to be considered ambiguous
 */
export function isAmbiguousMatch(score1: number, score2: number): boolean {
  const scoreDifference = score1 - score2;
  const scoreRatio = score2 / score1;
  return scoreDifference < 30 || scoreRatio > 0.85;
}

/**
 * Deduplicate product search results
 */
function deduplicateProducts(products: ScoredProduct[]): ScoredProduct[] {
  const uniqueMap = new Map<string, ScoredProduct>();
  
  products.forEach(p => {
    const productName = (p.product?.product_name || '').trim();
    const normalizedName = productName.toLowerCase().replace(/\s+/g, ' ');
    
    if (!uniqueMap.has(normalizedName) || p.score > (uniqueMap.get(normalizedName)?.score || 0)) {
      uniqueMap.set(normalizedName, p);
    }
  });
  
  return Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Create ambiguity response for multiple product matches
 */
function createAmbiguityResponse(products: ScoredProduct[], originalQuery: string): LookupResult {
  const uniqueProducts = deduplicateProducts(products);
  const topOptions = uniqueProducts.slice(0, 3);
  
  const options: AmbiguousOption[] = topOptions.map((p) => {
    const nutritionData = extractNutritionData(p.product);
    return {
      product_name: p.product.product_name || 'Unknown Product',
      brand: p.product.brands || 'Unknown Brand',
      calories: nutritionData.calories || 0,
      display_name: `${p.product.product_name || 'Unknown Product'}${p.product.brands ? ` (${p.product.brands})` : ''}`,
      nutrition_data: {
        calories: nutritionData.calories || 0,
        protein_g: nutritionData.protein_g || null,
        fat_total_g: nutritionData.fat_total_g || null,
        carbs_g: nutritionData.carbs_g || null
      }
    };
  });

  const formattedOptions = options.map((opt, idx) => 
    `${idx + 1}. ${opt.display_name}${opt.calories ? ` - ${opt.calories} calories` : ''}`
  ).join('\n');

  return {
    status: 'ambiguous',
    message: `I found a few possible matches for "${originalQuery}". Which one did you mean?\n\n${formattedOptions}\n\nOr provide more details?`,
    options,
    original_query: originalQuery,
    response_type: 'multiple_products_found_clarification'
  };
}

/**
 * Extract nutrition data from Open Food Facts product
 */
export function extractNutritionData(product: any): NutritionData {
  const data: Record<string, any> = {
    food_name: product.product_name || product.product_name_en || product.generic_name || '',
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
  };
  
  const nutriments = product.nutriments || {};
  
  // Calories
  if (nutriments['energy-kcal_100g']) {
    data.calories = parseFloat(nutriments['energy-kcal_100g']);
  } else if (nutriments['energy-kcal']) {
    data.calories = parseFloat(nutriments['energy-kcal']);
  } else if (nutriments['energy_100g']) {
    data.calories = parseFloat(nutriments['energy_100g']) * 0.239; // kJ to kcal
  }
  
  if (data.calories !== null) {
    data.calories = Math.round(data.calories);
  }
  
  // Macronutrients
  data.protein_g = nutriments.proteins_100g !== undefined ? parseFloat(nutriments.proteins_100g) : 
                  (nutriments.proteins !== undefined ? parseFloat(nutriments.proteins) : null);
  
  data.fat_total_g = nutriments.fat_100g !== undefined ? parseFloat(nutriments.fat_100g) : 
                     (nutriments.fat !== undefined ? parseFloat(nutriments.fat) : null);
  
  data.carbs_g = nutriments.carbohydrates_100g !== undefined ? parseFloat(nutriments.carbohydrates_100g) : 
                (nutriments.carbohydrates !== undefined ? parseFloat(nutriments.carbohydrates) : null);
  
  // Other nutrients
  data.fiber_g = nutriments.fiber_100g !== undefined ? parseFloat(nutriments.fiber_100g) : 
                (nutriments.fiber !== undefined ? parseFloat(nutriments.fiber) : null);
  
  data.sugar_g = nutriments.sugars_100g !== undefined ? parseFloat(nutriments.sugars_100g) : 
                (nutriments.sugars !== undefined ? parseFloat(nutriments.sugars) : null);
  
  // Sodium (convert g to mg)
  if (nutriments.sodium_100g !== undefined) {
    data.sodium_mg = parseFloat(nutriments.sodium_100g) * 1000;
  } else if (nutriments.sodium !== undefined) {
    data.sodium_mg = parseFloat(nutriments.sodium) * 1000;
  } else if (nutriments.salt_100g !== undefined) {
    data.sodium_mg = parseFloat(nutriments.salt_100g) * 400;
  }
  
  // Cholesterol (convert g to mg)
  if (nutriments.cholesterol_100g !== undefined) {
    data.cholesterol_mg = parseFloat(nutriments.cholesterol_100g) * 1000;
  } else if (nutriments.cholesterol !== undefined) {
    data.cholesterol_mg = parseFloat(nutriments.cholesterol) * 1000;
  }
  
  // Saturated fat
  data.fat_saturated_g = nutriments['saturated-fat_100g'] !== undefined ? parseFloat(nutriments['saturated-fat_100g']) : 
                        (nutriments['saturated-fat'] !== undefined ? parseFloat(nutriments['saturated-fat']) : null);
  
  // Potassium (convert g to mg)
  if (nutriments.potassium_100g !== undefined) {
    data.potassium_mg = parseFloat(nutriments.potassium_100g) * 1000;
  } else if (nutriments.potassium !== undefined) {
    data.potassium_mg = parseFloat(nutriments.potassium) * 1000;
  }
  
  // Round values
  for (const key in data) {
    if (typeof data[key] === 'number' && key !== 'calories') {
      data[key] = Math.round(data[key] * 10) / 10;
    }
  }
  
  return data as NutritionData;
}

/**
 * Look up nutrition information using Open Food Facts API
 */
export async function lookupOpenFoodFacts(
  foodName: string,
  isPrioritySearch: boolean = false
): Promise<LookupResult> {
  const cleanedFoodName = (foodName || '').trim();
  
  if (!cleanedFoodName) {
    return {
      status: 'error',
      message: 'Please provide a food name to look up.',
      response_type: 'error_missing_food_name'
    };
  }
  
  try {
    const potentialBrand = extractPotentialBrand(cleanedFoodName);
    
    let searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanedFoodName)}&search_simple=1&action=process&json=1&page_size=10`;
    
    if (potentialBrand) {
      searchUrl += `&brands=${encodeURIComponent(potentialBrand)}`;
    }
    
    if (isPrioritySearch) {
      searchUrl = searchUrl.replace('page_size=10', 'page_size=25');
    }
    
    console.log(`[OFF] Searching: ${cleanedFoodName}`);
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error(`[OFF] API error: ${response.status}`);
      return {
        status: 'error',
        message: `I couldn't find nutrition information for "${cleanedFoodName}". Could you provide the nutrition details from the package?`,
        response_type: 'error_api_failure'
      };
    }
    
    const searchResults = await response.json();
    
    if (!searchResults.products || searchResults.products.length === 0) {
      return {
        status: 'not_found',
        message: `I couldn't find nutrition information for "${cleanedFoodName}". Could you provide the nutrition details from the package?`,
        response_type: 'error_product_not_found'
      };
    }
    
    // Score products
    const scoredProducts: ScoredProduct[] = searchResults.products.map((product: any) => ({
      product,
      score: calculateProductScore(
        product.product_name || '', 
        product.brands || '', 
        cleanedFoodName,
        product.nutriments || {}
      )
    }));
    
    // Filter low-scoring products
    const validProducts = scoredProducts.filter(p => p.score > 50);
    
    if (validProducts.length === 0) {
      return {
        status: 'error',
        message: `I couldn't find a good match for "${cleanedFoodName}". Could you provide the nutrition details from the package?`,
        response_type: 'error_product_not_found'
      };
    }
    
    // Sort by score
    validProducts.sort((a, b) => b.score - a.score);
    const bestMatch = validProducts[0];
    
    // Check for ambiguous matches
    if (validProducts.length > 1) {
      const secondBest = validProducts[1];
      if (isAmbiguousMatch(bestMatch.score, secondBest.score)) {
        return createAmbiguityResponse(validProducts.slice(0, 3), cleanedFoodName);
      }
    }
    
    // Process best match
    const bestProduct = bestMatch.product;
    const nutritionData = extractNutritionData(bestProduct);
    
    // Verify essential nutrition data
    if (!nutritionData.calories) {
      return {
        status: 'error',
        message: `I found "${bestProduct.product_name || cleanedFoodName}" but couldn't get complete nutrition information. Could you provide the details from the package?`,
        response_type: 'error_incomplete_nutrition'
      };
    }
    
    return {
      status: 'success',
      product_name: bestProduct.product_name || cleanedFoodName,
      nutrition_data: nutritionData,
      from_cache: false,
      message: `Found nutrition information for "${bestProduct.product_name || cleanedFoodName}".`,
      response_type: 'product_found',
      source: 'off'
    };
  } catch (error) {
    console.error("[OFF] Error in lookup:", error);
    return {
      status: 'error',
      message: `Sorry, I encountered an error looking up nutrition information. Please try again.`,
      response_type: 'error_unexpected'
    };
  }
}
