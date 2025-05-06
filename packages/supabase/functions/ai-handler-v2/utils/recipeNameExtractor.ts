// Recipe name extraction and suggestion utilities

import { tokenize } from './stringMatcher.ts';

/**
 * Common food types that help identify recipe names
 */
export const FOOD_TYPES = [
  'smoothie', 'shake', 'soup', 'salad', 'sandwich', 'wrap', 'bowl',
  'pasta', 'curry', 'stew', 'casserole', 'stir-fry', 'burger', 'taco',
  'sauce', 'dressing', 'dip', 'bread', 'cake', 'cookie', 'dessert', 
  'breakfast', 'lunch', 'dinner', 'snack', 'meal', 'recipe'
];

/**
 * Common name patterns used when naming recipes
 */
const NAME_PATTERNS = [
  // "name it X" patterns
  /(?:name|call|title|label|save) it ['"]?([^'"]+)['"]?/i,
  /['"]([^'"]+)['"](?:.*)(?:recipe|dish)/i,
  
  // Labeled patterns
  /recipe name:?\s+['"]?([^'"]+)['"]?/i,
  
  // Possessive patterns
  /(?:my|your) ([a-z]+ (?:smoothie|salad|soup|stew|recipe|dish))/i,
  
  // Prepositional patterns
  /(?:for|as) (?:my|the) ([a-z]+ (?:smoothie|salad|soup|stew|recipe|dish))/i
];

/**
 * Extracts explicit recipe name from a user message
 * Detects phrases like "name it X", "call it Y", etc.
 */
export function extractExplicitRecipeName(message: string): string | null {
  if (!message) return null;
  
  // Check each pattern for explicit naming
  for (const pattern of NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Derives a recipe name from the ingredients list
 * Uses main ingredients and cooking method to suggest a name
 */
export function deriveNameFromIngredients(ingredients: string): string | null {
  if (!ingredients) return null;
  
  // Tokenize ingredients
  const tokens = tokenize(ingredients);
  if (tokens.length === 0) return null;
  
  // Common key ingredients to highlight in names
  const keyIngredients = [
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
    'tofu', 'tempeh', 'seitan', 'beans', 'lentils', 'chickpeas',
    'quinoa', 'rice', 'pasta', 'noodles', 'potato', 'sweet potato',
    'avocado', 'spinach', 'kale', 'broccoli', 'cauliflower',
    'carrot', 'tomato', 'mushroom', 'onion', 'garlic',
    'banana', 'apple', 'berry', 'strawberry', 'blueberry',
    'chocolate', 'vanilla', 'cinnamon', 'peanut butter'
  ];
  
  // Cooking methods to include in names
  const cookingMethods = [
    'roasted', 'grilled', 'baked', 'fried', 'sautéed', 'steamed',
    'stir-fried', 'boiled', 'poached', 'broiled', 'slow-cooked'
  ];
  
  // Find key ingredients in the list
  const foundIngredients = keyIngredients.filter(item => 
    tokens.some(token => token.includes(item) || item.includes(token))
  );
  
  // Find cooking methods mentioned
  const foundMethod = cookingMethods.find(method => 
    ingredients.toLowerCase().includes(method)
  );
  
  // If we found both ingredients and a method, combine them
  if (foundIngredients.length > 0) {
    // Get the top 2 ingredients max
    const mainIngredients = foundIngredients.slice(0, 2);
    
    if (foundMethod) {
      return `${foundMethod} ${mainIngredients.join(' & ')}`;
    } else {
      // Try to detect food type
      const foodType = FOOD_TYPES.find(type => 
        ingredients.toLowerCase().includes(type)
      );
      
      if (foodType) {
        return `${mainIngredients.join(' & ')} ${foodType}`;
      } else {
        return `${mainIngredients.join(' & ')} recipe`;
      }
    }
  }
  
  return null;
}

/**
 * Extracts a recipe name from user message and/or ingredients
 * First tries to find an explicit name, then falls back to derived name
 */
export function extractRecipeName(
  message: string, 
  ingredients?: string,
  defaultName: string = 'Custom Recipe'
): string {
  // Try explicit name first
  const explicitName = extractExplicitRecipeName(message);
  if (explicitName) {
    return capitalizeWords(explicitName);
  }
  
  // Try to derive from ingredients
  if (ingredients) {
    const derivedName = deriveNameFromIngredients(ingredients);
    if (derivedName) {
      return capitalizeWords(derivedName);
    }
  }
  
  // Try to extract food type directly from message
  const foodTypeFromMessage = extractFoodTypeFromMessage(message);
  if (foodTypeFromMessage) {
    return capitalizeWords(foodTypeFromMessage);
  }
  
  // Fall back to default name
  return defaultName;
}

/**
 * Extracts food type directly from message
 * E.g., "I had a chicken sandwich" -> "Chicken Sandwich"
 */
function extractFoodTypeFromMessage(message: string): string | null {
  if (!message) return null;
  
  // Check for food types in the message
  for (const foodType of FOOD_TYPES) {
    // Look for "<adjective> <food type>" pattern
    const pattern = new RegExp(`([a-z]+)\\s+${foodType}`, 'i');
    const match = message.match(pattern);
    if (match && match[1]) {
      // Make sure the adjective isn't a stop word
      const adjective = match[1].toLowerCase();
      if (!['the', 'a', 'an', 'my', 'your', 'our', 'some'].includes(adjective)) {
        return `${adjective} ${foodType}`;
      }
    }
    
    // Check if the food type is in the message with context
    if (message.toLowerCase().includes(foodType)) {
      // Extract context around the food type
      const words = message.split(/\s+/);
      const typeIndex = words.findIndex(word => 
        word.toLowerCase().includes(foodType)
      );
      
      if (typeIndex >= 0) {
        // Look for descriptive words before the food type
        if (typeIndex > 0 && !['the', 'a', 'an', 'my', 'your', 'our', 'some'].includes(words[typeIndex-1].toLowerCase())) {
          return `${words[typeIndex-1]} ${words[typeIndex]}`;
        } else {
          return capitalizeWords(foodType);
        }
      }
    }
  }
  
  return null;
}

/**
 * Capitalizes the first letter of each word in a string
 */
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
} 