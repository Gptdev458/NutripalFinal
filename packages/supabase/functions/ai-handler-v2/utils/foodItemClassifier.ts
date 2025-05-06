/**
 * Utility to help determine whether a food description should be treated
 * as a simple food item or a complex recipe requiring analysis
 */

// Constants for classification
const COMPLEX_RECIPE_KEYWORDS = [
  'recipe', 'analyze', 'analyze recipe', 'nutritional analysis', 
  'calculate', 'nutrition information', 'homemade', 'made'
];

const RECIPE_DISH_TYPES = [
  'casserole', 'lasagna', 'stew', 'soup', 'curry', 'pasta dish',
  'bake', 'roast', 'pie', 'cake', 'dessert'
];

const SIMPLE_FOOD_INDICATORS = [
  'sandwich', 'toast', 'wrap', 'salad', 'oatmeal', 'yogurt'
];

/**
 * Determines if a food description should be treated as a complex recipe
 * requiring detailed analysis rather than a simple food item.
 * 
 * @param description The food description from the user
 * @returns true if this should be treated as a complex recipe
 */
export function isComplexRecipe(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  
  // Check for explicit recipe keywords
  if (COMPLEX_RECIPE_KEYWORDS.some(keyword => lowerDesc.includes(keyword))) {
    return true;
  }
  
  // Check for complex dish types
  if (RECIPE_DISH_TYPES.some(dishType => lowerDesc.includes(dishType))) {
    return true;
  }
  
  // If it contains a simple food indicator AND doesn't have many ingredients, treat as simple
  if (SIMPLE_FOOD_INDICATORS.some(indicator => lowerDesc.includes(indicator))) {
    // Count ingredients (rough estimate based on commas and "and")
    const ingredientSeparators = [',', ' and '];
    const separatorCount = ingredientSeparators.reduce(
      (count, separator) => count + (lowerDesc.split(separator).length - 1), 
      0
    );
    
    // If there are few ingredients, it's a simple food
    if (separatorCount <= 3) {
      return false;
    }
  }
  
  // Count ingredients (rough estimate based on commas and "and")
  const ingredientSeparators = [',', ' and '];
  const separatorCount = ingredientSeparators.reduce(
    (count, separator) => count + (lowerDesc.split(separator).length - 1), 
    0
  );
  
  // If there are many ingredients, it might be a complex recipe
  if (separatorCount > 4) {
    return true;
  }
  
  // Otherwise, treat as simple food item
  return false;
}

/**
 * Recommends the appropriate tool to use for a given food description
 */
export function recommendFoodLoggingTool(description: string): 'logGenericFoodItem' | 'analyzeRecipeIngredients' {
  return isComplexRecipe(description) ? 'analyzeRecipeIngredients' : 'logGenericFoodItem';
} 