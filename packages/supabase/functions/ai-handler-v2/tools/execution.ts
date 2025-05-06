// Tool execution functions for AI handler
// Export all tool execution functions
// VERSION 2023-08-15-A: Adding serving size fixes

import { setPendingAction } from '../utils/pendingAction.ts'; // Import the helper
import type { SupabaseClient } from '@supabase/supabase-js'; // Fix import as a type import
import { findRecipesByFuzzyName, formatRecipeSearchResults } from '../utils/recipeSearch.ts';
import { extractRecipeName } from '../utils/recipeNameExtractor.ts';
import { ActionType, getConfirmationPolicy } from '../utils/confirmationPolicy.ts';
import { findRecipesByNutrition } from '../utils/recipeSearch.ts';

// Define valid columns for user_recipes table
const USER_RECIPES_VALID_COLUMNS = new Set([
  'id', 'user_id', 'recipe_name', 'description', 'serving_size_description',
  'total_servings', 'calories', 'protein_g', 'fat_total_g', 'carbs_g',
  'fiber_g', 'sugar_g', 'sodium_mg', 'cholesterol_mg', 'fat_saturated_g',
  'potassium_mg', 'created_at', 'updated_at'
]);

/**
 * Calculates nutrition data for a specific portion of a recipe
 */
function calculatePortionNutrition(
  recipeData: Record<string, any>,
  totalServings: number,
  consumedServings: number
): Record<string, any> {
  const scaledData = { ...recipeData };
  const ratio = consumedServings / totalServings;
  
  // Scale all numeric nutrition fields
  for (const key in scaledData) {
    if (
      typeof scaledData[key] === 'number' && 
      key !== 'id' && 
      key !== 'total_servings' && 
      !key.includes('_id') &&
      !key.endsWith('_at')
    ) {
      scaledData[key] = parseFloat((scaledData[key] * ratio).toFixed(1));
    }
  }
  
  return scaledData;
}

// Helper function to normalize nutrient names to keys used in DB
const normalizeNutrientKey = (name: string): string => {
    const lowerName = name.toLowerCase().trim();
    // Simple mapping for common cases
    const mapping: { [key: string]: string } = {
        calories: 'calories',
        calorie: 'calories',
        protein: 'protein_g',
        fat: 'fat_total_g',
        total_fat: 'fat_total_g',
        carbs: 'carbs_g',
        carbohydrate: 'carbs_g',
        carbohydrates: 'carbs_g',
        fiber: 'fiber_g',
        sugar: 'sugar_g',
        sugars: 'sugar_g',
        sodium: 'sodium_mg',
        // Add more mappings as needed based on MASTER_NUTRIENT_LIST and expected user inputs
    };

    if (mapping[lowerName]) {
        return mapping[lowerName];
    }
    
    // If no direct map, check if it already ends with _g, _mg, _mcg
    if (lowerName.match(/_(g|mg|mcg|mcg_rae|mcg_dfe)$/)) {
        return lowerName; // Assume it's already a valid key
    }

    // Fallback: return original if no mapping found (might need refinement)
    console.warn(`[normalizeNutrientKey] Could not normalize: ${name}. Using original.`);
    return name; 
};

export async function filterNutritionDataForUserGoals(nutritionData: Record<string, any>, userId: string, supabaseClient: any): Promise<Record<string, any>> {
    console.log(`Filtering nutrition data for user ${userId}`);
    try {
        const { data: goalsData, error: goalsError } = await supabaseClient
          .from('user_goals')
          .select('nutrient')
          .eq('user_id', userId);

        if (goalsError) {
            console.warn(`Error fetching user goals for filtering: ${goalsError.message}`);
            return { ...nutritionData }; // Return original on error
        }
        if (!goalsData || goalsData.length === 0) {
            console.log(`No goals found for user ${userId}, returning primary nutrients.`);
            // Return only essential nutrients if no goals set
            const essentialKeys = ['calories', 'protein_g', 'fat_total_g', 'carbs_g', 'fiber_g', 'sugar_g', 'sodium_mg'];
            const filtered: Record<string, any> = {};
             essentialKeys.forEach(key => {
                // Check if key exists and value is not null/undefined before adding
                if (nutritionData[key] !== null && nutritionData[key] !== undefined) {
                    filtered[key] = nutritionData[key];
                }
            });
            return filtered;
        }

        const trackedNutrientKeys = new Set(goalsData.map((goal: any) => goal.nutrient));
        trackedNutrientKeys.add('calories'); // Always include calories

        const filteredNutritionData: Record<string, any> = {};
        trackedNutrientKeys.forEach((key) => {
            // Check if key exists and value is not null/undefined before adding
            const stringKey = key as string; // Explicit cast
            if (nutritionData[stringKey] !== null && nutritionData[stringKey] !== undefined) {
                 filteredNutritionData[stringKey] = nutritionData[stringKey];
            }
        });
        console.log(`Filtered to ${Object.keys(filteredNutritionData).length} nutrients based on goals.`);
        return filteredNutritionData;

    } catch (error) {
        console.error(`Unexpected error in filterNutritionDataForUserGoals: ${error instanceof Error ? error.message : String(error)}`);
        return { ...nutritionData }; // Return original on unexpected error
    }
}

export async function executeLogExistingSavedRecipe(
    recipeId: string, 
    recipeName: string, 
    userId: string, 
    supabaseClient: any,
    // Add consumedServings parameter with a default
    consumedServings: number = 1 
): Promise<any> {
    // IMPORTANT DEBUGGING: Log the exact input parameters
    console.log(`[DEBUG_SERVINGS_CRITICAL] executeLogExistingSavedRecipe INPUT PARAMETERS: recipeId=${recipeId}, recipeName=${recipeName}, userId=${userId}, consumedServings=${consumedServings} (${typeof consumedServings})`);
    
    // Handle string type that might come from JSON parsing or other sources
    if (typeof consumedServings === 'string') {
        console.log(`[DEBUG_SERVINGS_CRITICAL] Converting consumedServings from string "${consumedServings}" to number`);
        consumedServings = Number(consumedServings);
    }
    
    // IMPORTANT: Triple ensure consumedServings is a number and not less than 0.5
    if (typeof consumedServings !== 'number' || isNaN(consumedServings)) {
        console.log(`[DEBUG_SERVINGS_CRITICAL] WARNING: consumedServings is not a valid number: ${consumedServings}. Converting to default 1.`);
        consumedServings = 1;
    }
    
    // Make sure it's at least 0.5
    consumedServings = Math.max(0.5, Number(consumedServings));
    console.log(`[DEBUG_SERVINGS_CRITICAL] executeLogExistingSavedRecipe will use ${consumedServings} serving(s) (${typeof consumedServings}) after validation`);
    
    try {
        // Define nutrient columns that EXIST in the user_recipes table (already updated)
        const nutrientColumns = Array.from(USER_RECIPES_VALID_COLUMNS).filter(
            col => col !== 'user_id' && col !== 'recipe_name' && col !== 'id' && col !== 'timestamp' && col !== 'updated_at'
        );
        
        // Query to get the recipe details
        console.log(`[DEBUG_SERVINGS_CRITICAL] Fetching recipe details with columns: ${nutrientColumns.join(', ')}`);
        const { data: recipe, error: recipeError } = await supabaseClient
            .from('user_recipes')
            .select(nutrientColumns.join(','))
            .eq('id', recipeId)
            .eq('user_id', userId)
            .maybeSingle();
            
        if (recipeError) {
            console.error(`Error fetching recipe with ID ${recipeId}:`, recipeError);
            return {
                status: 'error',
                message: `There was an error fetching your recipe: ${recipeError.message}`
            };
        }
        
        if (!recipe) {
            return {
                status: 'error',
                message: `Sorry, I couldn't find a recipe with that ID in your saved recipes.`
            };
        }
        
        // IMPORTANT: Multiply all nutrients by the consumed servings
        console.log(`[DEBUG_SERVINGS_CRITICAL] Multiplying nutrients by ${consumedServings} servings`);
        const nutrientData: Record<string, number> = {};
        
        // Only include numeric fields and multiply them by servings
        for (const col of nutrientColumns) {
            if (typeof recipe[col] === 'number') {
                nutrientData[col] = Number(recipe[col]) * consumedServings;
                console.log(`[DEBUG_SERVINGS_CRITICAL] Scaled ${col}: ${recipe[col]} × ${consumedServings} = ${nutrientData[col]}`);
            }
        }
        
        // Log nutrient values for debugging
        console.log(`[DEBUG_SERVINGS_CRITICAL] Calculated nutrient data:`, JSON.stringify(nutrientData));
        
        // Create the log entry with the current timestamp and scaled nutrients
        const logEntry = {
            user_id: userId,
            food_name: recipeName,
            recipe_id: recipeId,
            timestamp: new Date().toISOString(),
            // CRITICAL FIX: Use only one field for servings
            servings_consumed: Number(consumedServings), // Ensure it's a number
            source: 'saved_recipe', // Add this required field
            ...nutrientData
        };
        
        // Log the entire object being inserted for debugging
        console.log(`[DEBUG_SERVINGS_CRITICAL] Inserting into food_log:`, JSON.stringify(logEntry));
        
        // Insert the new food_log entry
        const { data: logData, error: logError } = await supabaseClient
            .from('food_log')
            .insert(logEntry)
            .select('id');
            
        if (logError) {
            console.error(`Error logging recipe with ID ${recipeId}:`, logError);
            return {
                status: 'error',
                message: `There was an error logging your recipe: ${logError.message}`
            };
        }
        
        // Format plural or singular for servings in the success message
        const servingsText = consumedServings === 1 ? '1 serving' : `${consumedServings} servings`;
        
        // Include the servings value in the return message
        const successMsg = `Logged ${servingsText} of '${recipeName}' successfully.`;
        console.log(`[DEBUG_SERVINGS_CRITICAL] SUCCESS: ${successMsg}`);
        
        return {
            status: 'success',
            message: successMsg,
            log_id: logData && logData[0] ? logData[0].id : null,
            servings: consumedServings // Include servings in response for clarity
        };
    } catch (error) {
        console.error(`Error in executeLogExistingSavedRecipe for recipe ID ${recipeId}:`, error);
        return {
            status: 'error',
            message: `There was an unexpected error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

export async function executeLogGenericFoodItem(foodDescription: string, userId: string, supabaseClient: any, openai: any): Promise<any> {
    console.log(`Executing tool: logGenericFoodItem for description '${foodDescription}' by user ${userId}`);
    // Enhanced input validation
    const cleanedDescription = (foodDescription || '').trim();
    if (!cleanedDescription) {
        return {
            status: 'error',
            message: "I didn't catch what food you want to log. Please describe the food clearly (e.g., '1 banana', 'protein bar', '2 eggs').",
            response_type: 'error_parsing_args'
        };
    }
    // Check for ambiguous foods (e.g., 'sandwich', 'wrap', 'casserole')
    const ambiguousFoods = [
        'sandwich', 'wrap', 'casserole', 'stir fry', 'bake', 'dish', 'meal', 'plate', 'bowl', 'food', 'snack', 'thing', 'stuff'
    ];
    const isAmbiguous = ambiguousFoods.some(word => cleanedDescription.toLowerCase().includes(word));
    if (isAmbiguous) {
        return {
            status: 'error',
            message: `"${cleanedDescription}" is a bit ambiguous. Could you clarify what ingredients or type it is, or specify if it's a standard/pre-made item?`,
            response_type: 'clarification_needed'
        };
    }
    try {
        // Call fetchNutritionData (which internally calls OpenAI)
        const nutritionResult = await fetchNutritionData(cleanedDescription, openai);
        if (nutritionResult.status === 'error' || !nutritionResult.data) {
            console.error("Error fetching nutrition data from helper:", nutritionResult.message);
            return {
                status: 'error',
                message: 'Could not analyze food item.',
                response_type: 'error_nutrition_api'
            };
        }
        const nutritionData = nutritionResult.data;
        // Prepare log entry, including new nutrients
        const logEntry = {
            user_id: userId,
            food_name: nutritionData.food_name || cleanedDescription, // Use name from analysis if available
            calories: nutritionData.calories,
            protein_g: nutritionData.protein_g,
            fat_total_g: nutritionData.fat_total_g,
            carbs_g: nutritionData.carbs_g,
            fiber_g: nutritionData.fiber_g,
            sugar_g: nutritionData.sugar_g,
            sodium_mg: nutritionData.sodium_mg,
            cholesterol_mg: nutritionData.cholesterol_mg,
            fat_saturated_g: nutritionData.fat_saturated_g,
            potassium_mg: nutritionData.potassium_mg,
            omega_3_g: nutritionData.omega_3_g ?? null,
            omega_6_g: nutritionData.omega_6_g ?? null,
            fiber_soluble_g: nutritionData.fiber_soluble_g ?? null,
            source: 'manual',
        };
        // Insert into food_log
        const { data: insertedData, error: insertError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .insert([logEntry])
            .select();
        if (insertError) {
            console.error("Error inserting generic food log:", insertError);
            return {
                status: 'error',
                message: 'Could not log food item.',
                response_type: 'error_db_insert'
            };
        }
        console.log("Logged generic food item:", insertedData);
        // Fetch latest logs for today
        const today = new Date().toISOString().slice(0, 10);
        const { data: todaysLogs } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .select('*')
            .eq('user_id', userId)
            .gte('timestamp', `${today}T00:00:00.000Z`)
            .lt('timestamp', `${today}T23:59:59.999Z`)
            .order('timestamp', { ascending: true });
        return {
            status: 'success',
            logged_food_name: logEntry.food_name,
            message: 'Food item logged.',
            response_type: 'log_success',
            todays_logs: todaysLogs || []
        };
    } catch (error) {
        console.error("Unexpected error in executeLogGenericFoodItem:", error);
        return {
            status: 'error',
            message: `Sorry, something went wrong while logging your food. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeLogPremadeFood(
    foodName: string, 
    calories: number, 
    nutritionData: Record<string, any> | null | undefined, 
    servings: number | null | undefined,
    userId: string, 
    supabaseClient: any
): Promise<any> {
    console.log(`Executing tool: logPremadeFood for '${foodName}' with ${calories} calories for user ${userId}`);
    
    // Input validation
    const cleanedFoodName = (foodName || '').trim();
    if (!cleanedFoodName) {
        return {
            status: 'error',
            message: "Please provide a name for the food you'd like to log.",
            response_type: 'error_parsing_args'
        };
    }
    
    if (!calories || calories <= 0) {
        return {
            status: 'error',
            message: `Please provide a valid calorie amount for ${cleanedFoodName}.`,
            response_type: 'error_parsing_args'
        };
    }
    
    // Check if we need confirmation based on our policy
    const confirmationPolicy = getConfirmationPolicy({
        userId,
        actionType: ActionType.LOG_FOOD,
        itemName: cleanedFoodName,
        confidence: 90, // High confidence since user provided specific nutrition info
        hasCompleteData: Boolean(calories && nutritionData && Object.keys(nutritionData || {}).length >= 3),
        isHighImpact: false
    });
    
    // If confirmation is required, return a prompt for confirmation
    if (confirmationPolicy.requireConfirmation) {
        return {
            status: 'clarification',
            message: confirmationPolicy.confirmationMessage || `Would you like to log ${cleanedFoodName} with ${calories} calories?`,
            response_type: 'confirmation_needed',
            pending_action: {
                type: 'confirm_log_food',
                food_name: cleanedFoodName,
                calories,
                nutrition_data: nutritionData || { calories }
            }
        };
    }
    
    // Otherwise, proceed with logging
    try {
        // Prepare nutrition data
        const finalNutritionData: Record<string, any> = { 
            ...(nutritionData || {}),
            calories // Always ensure calories is set
        };
        
        // Handle servings
        const consumedServings = servings || 1;
        
        // Create the log entry
        const logEntry = {
            user_id: userId,
            food_name: cleanedFoodName,
            servings_consumed: consumedServings, // Use only this field for consistency
            source: 'premade_food',
            ...finalNutritionData
        };
        
        // Insert into database
        const { error: logError } = await supabaseClient
            .from('food_log')
            .insert(logEntry);
        
        if (logError) {
            console.error(`Error inserting food log for '${cleanedFoodName}':`, logError);
            throw new Error(`Database error while logging food: ${logError.message}`);
        }
        
        // Filter nutrition data for response
        const filteredNutrition = await filterNutritionDataForUserGoals(finalNutritionData, userId, supabaseClient);
        
        // Return success
        return {
            status: 'success',
            message: `Logged ${cleanedFoodName} with ${calories} calories.`,
            food_name: cleanedFoodName,
            calories,
            nutrition_data: filteredNutrition,
            response_type: 'food_logged'
        };
    } catch (error) {
        console.error(`Error in executeLogPremadeFood for '${cleanedFoodName}':`, error);
        return {
            status: 'error',
            message: `Failed to log ${cleanedFoodName}: ${error instanceof Error ? error.message : String(error)}`,
            response_type: 'error_logging_food'
        };
    }
}

export async function executeLookupPremadeFood(
    foodName: string,
    userId: string,
    supabaseClient: any
): Promise<any> {
    console.log(`Executing tool: lookupPremadeFood for '${foodName}' by user ${userId}`);
    
    // Clean up the food name
    const cleanedFoodName = (foodName || '').trim();
    if (!cleanedFoodName) {
        return {
            status: 'error',
            message: "I need a food name to search for. Please provide a specific product name.",
            response_type: 'error_parsing_args'
        };
    }
    
    try {
        // 1. First check cache with improved search
        const { data: cachedProducts, error: cacheError } = await supabaseClient
            .from('food_products')
            .select('*')
            .or(`product_name.ilike.%${cleanedFoodName}%,search_term.ilike.%${cleanedFoodName}%`)
            .order('updated_at', { ascending: false })
            .limit(5); // Get top 5 matches for potential ambiguity check
            
        // If we have cached results, score them using the same logic as API results
        if (!cacheError && cachedProducts && cachedProducts.length > 0) {
            console.log(`Cache hits for '${cleanedFoodName}'`);
            const scoredCacheProducts = cachedProducts.map(product => ({
                product: {
                    product_name: product.product_name,
                    brands: product.brand,
                    nutriments: product.nutrition_data
                },
                score: calculateProductScore(product.product_name, product.brand || '', cleanedFoodName, product.nutrition_data)
            }));

            // Filter and check for ambiguity in cache results
            const validCacheProducts = scoredCacheProducts.filter(p => p.score > 50);
            if (validCacheProducts.length > 0) {
                validCacheProducts.sort((a, b) => b.score - a.score);
                const bestCacheMatch = validCacheProducts[0];

                // Check for ambiguity in cache results
                if (validCacheProducts.length > 1) {
                    const secondBestCache = validCacheProducts[1];
                    if (isAmbiguousMatch(bestCacheMatch.score, secondBestCache.score)) {
                        return createAmbiguityResponse(validCacheProducts.slice(0, 3), cleanedFoodName);
                    }
                }

                // Use the best cache match if score is good enough
                if (bestCacheMatch.score >= 80) {
                    console.log(`Using high-confidence cache match: "${bestCacheMatch.product.product_name}" (Score: ${bestCacheMatch.score})`);
                    return {
                        status: 'success',
                        product_name: bestCacheMatch.product.product_name,
                        nutrition_data: bestCacheMatch.product.nutriments,
                        from_cache: true,
                        message: `Found nutrition information for "${bestCacheMatch.product.product_name}".`,
                        response_type: 'product_found',
                        source: 'cache'
                    };
                }
            }
        }
        
        // 2. If not in cache or no good cache match, search Open Food Facts
        console.log(`No confident cache match for '${cleanedFoodName}', querying Open Food Facts API`);
        
        // Extract potential brand name and build a more targeted search
        const searchTerms = cleanedFoodName.split(' ');
        const potentialBrand = searchTerms.slice(0, Math.min(2, searchTerms.length)).join(' ');
        const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanedFoodName)}&brands=${encodeURIComponent(potentialBrand)}&search_simple=1&action=process&json=1&page_size=10`;
        
        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`Open Food Facts API error: ${response.status}`);
        }
        
        const searchResults = await response.json();
        
        // No products found
        if (!searchResults.products || searchResults.products.length === 0) {
            return {
                status: 'error',
                message: `I couldn't find nutrition information for "${cleanedFoodName}". Could you provide the nutrition details from the package?`,
                response_type: 'error_product_not_found'
            };
        }
        
        // Score products using the extracted scoring function
        const scoredProducts = searchResults.products.map(product => ({
            product,
            score: calculateProductScore(
                product.product_name || '',
                product.brands || '',
                cleanedFoodName,
                product.nutriments || {}
            )
        }));
        
        // Filter out low-scoring products
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
        
        // Cache the successful match
        try {
            await supabaseClient
                .from('food_products')
                .insert({
                    product_name: bestProduct.product_name || cleanedFoodName,
                    search_term: cleanedFoodName,
                    nutrition_data: nutritionData,
                    barcode: bestProduct.code || null,
                    source: 'open_food_facts',
                    brand: bestProduct.brands || null,
                    confidence_score: bestMatch.score // Store the confidence score
                });
        } catch (cacheError) {
            console.error("Error caching food product result:", cacheError);
        }
        
        return {
            status: 'success',
            product_name: bestProduct.product_name || cleanedFoodName,
            nutrition_data: nutritionData,
            from_cache: false,
            message: `Found nutrition information for "${bestProduct.product_name || cleanedFoodName}".`,
            response_type: 'product_found',
            source: 'open_food_facts'
        };
        
    } catch (error) {
        console.error("Error in executeLookupPremadeFood:", error);
        return {
            status: 'error',
            message: `I encountered an issue looking up "${cleanedFoodName}". If you have the nutrition information, please provide it directly.`,
            response_type: 'error_api_failure'
        };
    }
}

// Helper function to calculate product match score
function calculateProductScore(productName: string, brand: string, searchTerm: string, nutrition: any): number {
    let score = 0;
    const productNameLower = productName.toLowerCase();
    const brandLower = brand.toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();
    const searchWords = searchTermLower.split(' ').filter(w => w.length > 1);
    const productWords = productNameLower.split(' ').filter(w => w.length > 1);

    // Exact matches (highest priority)
    if (productNameLower === searchTermLower) {
        score += 200;
    }
    // Complete phrase match
    else if (productNameLower.includes(searchTermLower)) {
        score += 150;
    }
    // All search words present
    else if (searchWords.every(word => productNameLower.includes(word))) {
        score += 100;
        // Bonus for words in same order
        if (searchWords.reduce((acc, word, i) => {
            const pos = productNameLower.indexOf(word);
            return acc && pos > -1 && (!i || pos > productNameLower.indexOf(searchWords[i-1]));
        }, true)) {
            score += 30;
        }
    }

    // Brand matching (high priority)
    const brandWords = brandLower.split(' ').filter(w => w.length > 1);
    const searchBrandWords = searchWords.slice(0, 2); // First two words might be brand
    
    // Direct brand match
    if (brandWords.some(bWord => searchBrandWords.includes(bWord))) {
        score += 100;
    }
    // Brand contained in search
    else if (searchTermLower.includes(brandLower)) {
        score += 75;
    }
    // Search term contains part of brand
    else if (brandWords.some(bWord => searchTermLower.includes(bWord))) {
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
        score -= 50; // Penalize missing nutrition
    }

    // Penalize generic terms when specific search
    const genericTerms = ['bar', 'snack', 'drink', 'cereal', 'yogurt'];
    if (searchWords.length > 1 && genericTerms.some(term => productNameLower === term)) {
        score -= 30;
    }

    return score;
}

// Helper function to check if matches are ambiguous
function isAmbiguousMatch(score1: number, score2: number): boolean {
    const scoreDifference = score1 - score2;
    const scoreRatio = score2 / score1;
    return scoreDifference < 30 || scoreRatio > 0.85;
}

// Helper function to create ambiguity response
function createAmbiguityResponse(products: any[], originalQuery: string): any {
    // Enhance options with more data for better selection handling
    const options = products.map(p => {
        const nutritionData = extractNutritionData(p.product);
        return {
            product_name: p.product.product_name || 'Unknown Name',
            brand: p.product.brands || 'Unknown Brand',
            calories: nutritionData.calories || 0,
            // Include minimal nutrition data for logging after selection
            nutrition_data: {
                calories: nutritionData.calories || 0,
                protein_g: nutritionData.protein_g || null,
                fat_total_g: nutritionData.fat_total_g || null,
                carbs_g: nutritionData.carbs_g || null
            }
        };
    });

    return {
        status: 'clarification',
        message: `I found a few possible matches for "${originalQuery}". Which one did you mean?`,
        options,
        original_query: originalQuery,
        response_type: 'multiple_products_found_clarification'
    };
}

// Helper function to extract nutrition data from Open Food Facts product
function extractNutritionData(product: any): Record<string, any> {
    const data: Record<string, any> = {};
    
    // Extract product name
    data.food_name = product.product_name || product.product_name_en || product.generic_name || '';
    
    // Get nutrients object from product
    const nutriments = product.nutriments || {};
    
    // Map Open Food Facts nutrient names to our schema
    // Calories
    if (nutriments['energy-kcal_100g']) {
        data.calories = parseFloat(nutriments['energy-kcal_100g']);
    } else if (nutriments['energy-kcal']) {
        data.calories = parseFloat(nutriments['energy-kcal']);
    } else if (nutriments['energy_100g']) {
        // Convert kJ to kcal (roughly)
        data.calories = parseFloat(nutriments['energy_100g']) * 0.239;
    } else {
        data.calories = null;
    }
    
    // Round calories to nearest whole number
    if (data.calories !== null) {
        data.calories = Math.round(data.calories);
    }
    
    // Macronutrients - using 100g values when available
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
    
    // Convert sodium from g to mg if needed
    if (nutriments.sodium_100g !== undefined) {
        data.sodium_mg = parseFloat(nutriments.sodium_100g) * 1000;
    } else if (nutriments.sodium !== undefined) {
        data.sodium_mg = parseFloat(nutriments.sodium) * 1000;
    } else if (nutriments.salt_100g !== undefined) {
        // Approximate conversion from salt to sodium
        data.sodium_mg = parseFloat(nutriments.salt_100g) * 400;  // ~40% of salt is sodium
    } else {
        data.sodium_mg = null;
    }
    
    // Convert cholesterol from g to mg if needed
    if (nutriments.cholesterol_100g !== undefined) {
        data.cholesterol_mg = parseFloat(nutriments.cholesterol_100g) * 1000;
    } else if (nutriments.cholesterol !== undefined) {
        data.cholesterol_mg = parseFloat(nutriments.cholesterol) * 1000;
    } else {
        data.cholesterol_mg = null;
    }
    
    // Saturated fat
    data.fat_saturated_g = nutriments['saturated-fat_100g'] !== undefined ? parseFloat(nutriments['saturated-fat_100g']) : 
                          (nutriments['saturated-fat'] !== undefined ? parseFloat(nutriments['saturated-fat']) : null);
    
    // Potassium - convert from g to mg if needed
    if (nutriments.potassium_100g !== undefined) {
        data.potassium_mg = parseFloat(nutriments.potassium_100g) * 1000;
    } else if (nutriments.potassium !== undefined) {
        data.potassium_mg = parseFloat(nutriments.potassium) * 1000;
    } else {
        data.potassium_mg = null;
    }
    
    // Round all values to 1 decimal place
    for (const key in data) {
        if (typeof data[key] === 'number' && key !== 'calories') {
            data[key] = Math.round(data[key] * 10) / 10;
        }
    }
    
    // Return the extracted data
    return data;
}

export async function executeFindSavedRecipeByName(query: string, userId: string, supabaseClient: any): Promise<any> {
    console.log(`[DEBUG_SERVINGS_CRITICAL] executeFindSavedRecipeByName for query '${query}' for user ${userId}`);
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
        return {
            status: 'error',
            message: "I didn't catch the recipe name. Please tell me the name or keywords for your saved recipe (e.g., 'chili', 'morning smoothie').",
            found: false,
            response_type: 'error_parsing_args'
        };
    }
    if (trimmedQuery.length < 2) {
        return {
            status: 'error',
            message: "That recipe name is too short. Please provide at least 2 characters to search your saved recipes.",
            found: false,
            response_type: 'error_parsing_args'
        };
    }
    try {
        // ENHANCED APPROACH: Look for serving size patterns in various formats
        let requestedServings = 1; // Default to 1 serving
        let searchQuery = trimmedQuery;
        
        // Enhanced patterns to try (more comprehensive)
        const servingPatterns = [
            /(\d+(?:\.\d+)?)\s*(?:serving|servings)/i,  // "2 servings of..."
            /(\d+(?:\.\d+)?)\s*(?:portion|portions)/i,  // "2 portions of..."
            /(\d+(?:\.\d+)?)\s*(?:cup|cups)/i,          // "2 cups of..."
            /(\d+(?:\.\d+)?)\s*(?:bowl|bowls)/i,        // "2 bowls of..."
            /(\d+(?:\.\d+)?)\s*(?:plate|plates)/i,      // "2 plates of..."
            /log\s+(\d+(?:\.\d+)?)/i,                   // "log 2..."
            /(\d+(?:\.\d+)?)\s*(?:of)/i,                // "2 of..."
            /^(?:log|track|record)\b.*\b(\d+(?:\.\d+)?)\b/i // "log smoothie 2"
        ];
        
        // Try each pattern
        for (const pattern of servingPatterns) {
            const match = trimmedQuery.match(pattern);
            if (match && match[1]) {
                requestedServings = Number(match[1]);
                if (requestedServings <= 0 || isNaN(requestedServings)) {
                    requestedServings = 1;
                }
                console.log(`[DEBUG_SERVINGS_CRITICAL] Found serving size in query: ${requestedServings} from pattern: ${pattern}`);
                break;
            }
        }
        
        // Last resort: just look for any number in the query
        if (requestedServings === 1) {
            const anyNumberMatch = trimmedQuery.match(/\b(\d+(?:\.\d+)?)\b/);
            if (anyNumberMatch && anyNumberMatch[1]) {
                requestedServings = Number(anyNumberMatch[1]);
                console.log(`[DEBUG_SERVINGS_CRITICAL] Last resort - found any number: ${requestedServings} (${typeof requestedServings})`);
            }
        }
        
        // Force serving value to be a number to avoid string conversion issues
        requestedServings = Number(requestedServings);
        
        // Make debug log statement more visible
        console.log(`[DEBUG_SERVINGS_CRITICAL] *** FINAL VALUES TO STORE: servings=${requestedServings} (${typeof requestedServings}), search="${searchQuery}" ***`);
        
        // Use new fuzzy recipe search instead of direct database query
        const searchResults = await findRecipesByFuzzyName(searchQuery, userId, supabaseClient, {
            limit: 5,
            threshold: 60 // Adjust threshold as needed for fuzzy matching
        });
        
        // Log search results for debugging
        console.log(`[DEBUG_SERVINGS_CRITICAL] Fuzzy search for '${searchQuery}' found ${searchResults.length} matches`);
        if (searchResults.length > 0) {
            console.log(`[DEBUG_SERVINGS_CRITICAL] Top match: "${searchResults[0].recipe_name}" (score: ${searchResults[0].similarity})`);
        }
        
        if (!searchResults || searchResults.length === 0) {
            return {
                status: 'success',
                found: false,
                matches: [],
                message: `I couldn't find any saved recipes matching "${searchQuery}". Would you like to create a new recipe instead?`,
                response_type: 'saved_recipe_not_found'
            };
        }
        
        if (searchResults.length === 1) {
            // INCLUDE SERVINGS IN CONFIRMATION MESSAGE
            console.log(`[DEBUG_SERVINGS_CRITICAL] Single match found, adding pending_action with requested_servings=${requestedServings}`);
            
            // Create pending action object with explicit Number conversion
            const pendingAction = {
                type: 'confirm_log_saved_recipe',
                recipe_id: searchResults[0].id,
                recipe_name: searchResults[0].recipe_name,
                requested_servings: Number(requestedServings) // Ensure it's a number type
            };
            
            console.log(`[DEBUG_SERVINGS_CRITICAL] PENDING ACTION OBJECT: ${JSON.stringify(pendingAction)}`);
            
            // Build response with explicit serving information
            const servingsText = requestedServings === 1 ? '1 serving' : `${requestedServings} servings`;
            return {
                status: 'success',
                found: true,
                count: 1,
                matches: searchResults,
                message: `I found your saved recipe "${searchResults[0].recipe_name}". Log ${servingsText} now?`,
                response_type: 'saved_recipe_confirmation_prompt',
                // Explicitly add requested_servings to the top level response
                requested_servings: Number(requestedServings),
                // Add pending action context for the frontend/next turn
                pending_action: pendingAction
            };
        } 
        
        // Multiple matches
        const formattedMessage = formatRecipeSearchResults(searchResults, searchQuery);
        return {
            status: 'success',
            found: true,
            count: searchResults.length,
            matches: searchResults,
            message: `${formattedMessage}\nWhich one would you like to log?`,
            response_type: 'saved_recipe_found_multiple'
        };
    } catch (error) {
        console.error(`Error in executeFindSavedRecipeByName for query '${trimmedQuery}':`, error);
        return {
            status: 'error',
            message: `There was an error searching for your recipe: ${error instanceof Error ? error.message : String(error)}`,
            found: false,
            response_type: 'error_search'
        };
    }
}

export async function executeAnalyzeRecipeIngredients(recipeName: string, ingredientsList: string, userId: string, supabaseClient: any, openai: any): Promise<any> {
    console.log(`Executing tool: analyzeRecipeIngredients for '${recipeName}' by user ${userId}`);
    
    // Clean input parameters
    const cleanedIngredients = (ingredientsList || '').trim();
    
    // Handle missing ingredients
    if (!cleanedIngredients) {
        return {
            status: 'error',
            message: "Please provide a list of ingredients for your recipe (e.g., '1L broth, 2 carrots, 1 potato').",
            response_type: 'error_parsing_args'
        };
    }
    if (cleanedIngredients.length < 5) {
        return {
            status: 'error',
            message: "That ingredient list is too short. Please provide more details (e.g., '1L broth, 2 carrots, 1 potato').",
            response_type: 'error_parsing_args'
        };
    }
    
    // Use our recipe name extractor to get the best name
    const suggestedName = extractRecipeName(recipeName, cleanedIngredients, 'Custom Recipe');
    console.log(`[executeAnalyzeRecipeIngredients] Extracted recipe name "${suggestedName}" from input "${recipeName}"`);
    
    try {
        // Use OpenAI Function Calling for structured analysis
        const analysisPrompt = `Analyze the following recipe ingredients list and estimate the total nutritional content for the *entire recipe*. Provide the total amounts for calories, protein (g), total fat (g), saturated fat (g), carbohydrates (g), fiber (g), soluble fiber (g), sugars (g), sodium (mg), cholesterol (mg), potassium (mg), omega-3 (g), and omega-6 (g). Recipe Name: ${suggestedName}. Ingredients: ${cleanedIngredients}`;
        const analysisCompletion = await openai.chat.completions.create({
            model: "gpt-4o", // Or your preferred model
            messages: [{
                role: "user",
                content: analysisPrompt
            }],
            tools: [{
                type: "function",
                function: {
                    name: "recordRecipeAnalysis",
                    description: "Records the estimated nutritional analysis of a recipe.",
                    parameters: {
                        type: "object",
                        properties: {
                            calories: { type: "number", description: "Total estimated calories (kcal)" },
                            protein_g: { type: "number", description: "Total estimated protein (g)" },
                            fat_total_g: { type: "number", description: "Total estimated fat (g)" },
                            fat_saturated_g: { type: "number", description: "Total estimated saturated fat (g)" },
                            carbs_g: { type: "number", description: "Total estimated carbohydrates (g)" },
                            fiber_g: { type: "number", description: "Total estimated dietary fiber (g)" },
                            fiber_soluble_g: { type: "number", description: "Total estimated soluble fiber (g)" },
                            sugar_g: { type: "number", description: "Total estimated sugars (g)" },
                            sodium_mg: { type: "number", description: "Total estimated sodium (mg)" },
                            cholesterol_mg: { type: "number", description: "Total estimated cholesterol (mg)" },
                            potassium_mg: { type: "number", description: "Total estimated potassium (mg)" },
                            omega_3_g: { type: "number", description: "Total estimated Omega-3 fatty acids (g)" },
                            omega_6_g: { type: "number", description: "Total estimated Omega-6 fatty acids (g)" },
                        },
                    }
                }
            }],
            tool_choice: { type: "function", function: { name: "recordRecipeAnalysis" } }
        });
        const analysisChoice = analysisCompletion.choices[0];
        const toolCall = analysisChoice.message.tool_calls?.[0];
        
        if (!toolCall || toolCall.function.name !== "recordRecipeAnalysis") {
            throw new Error("AI response did not include expected tool call to recordRecipeAnalysis");
        }
        
        let analysisData: Record<string, any> = {};
        let finalRecipeName = suggestedName; // Use the extracted name
        
        try {
            analysisData = JSON.parse(toolCall.function.arguments);
            console.log("Parsed nutrition data:", analysisData);
        } catch (parseError) {
            console.error("Error parsing nutrition data from AI response:", parseError);
            throw new Error("Could not parse nutrition data from AI response.");
        }
        
        // Filter to keep only numeric values
        const filteredAnalysis = Object.fromEntries(
            Object.entries(analysisData).filter(([_, value]) => typeof value === 'number')
        );
        
        // Round values to 1 decimal place
        for (const key in filteredAnalysis) {
            if (typeof filteredAnalysis[key] === 'number') {
                filteredAnalysis[key] = Math.round(filteredAnalysis[key] * 10) / 10;
            }
        }
        
        // Create pending action object for database
        const pendingRecipeAction = {
            type: 'awaiting_serving_info',
            user_id: userId,
            recipe_name: finalRecipeName, // Use the extracted name
            ingredients: cleanedIngredients,
            nutrition_data: filteredAnalysis
        };
        
        // Save pending action to database
        await setPendingAction(userId, pendingRecipeAction, supabaseClient);
        console.log('[EXECUTION DEBUG] Set pending_action for awaiting_serving_info:', JSON.stringify(pendingRecipeAction)); // DEBUG LOG
        
        // Return the response with the recipe name for confirmation
        return {
            status: 'success',
            message: `I've analyzed "${finalRecipeName}" and estimated its nutrition content.`, // Use the extracted name
            response_type: 'recipe_analyzed',
            analysis: filteredAnalysis,
            recipe_name: finalRecipeName // Use the extracted name
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong analyzing your recipe. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function fetchNutritionData(query: string, openai: any): Promise<any> {
    // This function uses OpenAI to estimate nutrition for a generic food item
    const cleanedQuery = (query || '').trim();
    if (!cleanedQuery) {
        return {
            status: 'error',
            message: 'No food description provided.',
            response_type: 'error_parsing_args'
        };
    }
    try {
        const prompt = `Estimate the nutrition for the following food item. Respond ONLY with a valid JSON object, no explanation, no markdown, no commentary. Keys: food_name, calories, protein_g, fat_total_g, carbs_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, fat_saturated_g, potassium_mg, omega_3_g, omega_6_g, fiber_soluble_g. If you are unsure, make a best guess. Food: ${cleanedQuery}`;
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a nutrition estimation assistant. Respond ONLY with a valid JSON object, no explanation, no markdown, no commentary." },
                { role: "user", content: prompt }
            ],
            temperature: 0.2
        });
        const content = response.choices[0].message?.content || '';
        console.log("OpenAI nutrition response content:", content);
        let data: Record<string, any> = {};
        try {
            data = JSON.parse(content);
        } catch (parseError) {
            return {
                status: 'error',
                message: 'Could not parse nutrition data.',
                response_type: 'error_parsing_analysis'
            };
        }
        return {
            status: 'success',
            data,
            message: 'Nutrition data fetched.',
            response_type: 'nutrition_data_fetched'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong fetching nutrition data. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeListLoggedFoods(date: string | undefined, userId: string, supabaseClient: any): Promise<any> {
    console.log(`Executing tool: listLoggedFoods for user ${userId} on date ${date}`);
    let targetDate = date;
    if (!targetDate) {
        targetDate = new Date().toISOString().slice(0, 10);
    }
    try {
        const { data: logs, error } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .select('*')
            .eq('user_id', userId)
            .gte('timestamp', `${targetDate}T00:00:00.000Z`)
            .lt('timestamp', `${targetDate}T23:59:59.999Z`)
            .order('timestamp', { ascending: true });
        if (error) {
            return {
                status: 'error',
                message: 'Could not fetch logged foods.',
                response_type: 'error_database'
            };
        }
        return {
            status: 'success',
            logs: logs || [],
            message: 'Logged foods listed.',
            response_type: 'logged_foods_listed'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong listing your logged foods. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeUndoLastAction(userId: string, supabaseClient: any): Promise<any> {
    console.log(`Executing tool: undoLastAction for user ${userId}`);
    try {
        // Find the most recent log
        const { data: logs, error: fetchError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(1);
        if (fetchError) {
            return {
                status: 'error',
                message: 'Could not fetch last log.',
                response_type: 'error_database'
            };
        }
        if (!logs || logs.length === 0) {
            return {
                status: 'error',
                message: 'No logs found to undo.',
                response_type: 'no_logs_to_undo'
            };
        }
        const lastLog = logs[0];
        // Delete the most recent log
        const { error: deleteError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .delete()
            .eq('id', lastLog.id);
        if (deleteError) {
            return {
                status: 'error',
                message: 'Could not undo last log.',
                response_type: 'error_db_delete'
            };
        }
        return {
            status: 'success',
            undone_log: lastLog,
            message: 'Last log undone.',
            response_type: 'log_undone'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong undoing your last log. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeUpdateUserGoal(nutrient: string, targetValue: number, unit: string | undefined, userId: string, supabaseClient: any): Promise<any> {
    // Normalize the nutrient key FIRST
    const normalizedNutrientKey = normalizeNutrientKey(nutrient);
    console.log(`[EXECUTION] executeUpdateUserGoal called for user ${userId} - Original Nutrient: ${nutrient}, Normalized Key: ${normalizedNutrientKey}, Target: ${targetValue}, Unit: ${unit}`);
    
    if (!normalizedNutrientKey || targetValue === null || targetValue === undefined) {
        console.error('[EXECUTION] executeUpdateUserGoal: Missing normalized nutrient key or targetValue.');
        return {
            status: 'error',
            message: 'Nutrient and target value are required to update goal.',
            response_type: 'error_parsing_args'
        };
    }

    // --- BEGIN UNIT INFERENCE/DEFAULT LOGIC ---
    let finalUnit = unit; // Start with the provided unit

    // If unit is missing, try to infer or default
    if (!finalUnit) {
        console.log(`[EXECUTION] Unit not provided for ${normalizedNutrientKey}. Attempting to infer/default.`);
        // Add specific defaults first
        if (normalizedNutrientKey === 'protein_g' || nutrient.toLowerCase() === 'protein') {
            finalUnit = 'g';
            console.log(`[EXECUTION] Defaulting unit to 'g' for protein.`);
        } else if (normalizedNutrientKey === 'calories' || nutrient.toLowerCase() === 'calories') {
            finalUnit = 'kcal';
             console.log(`[EXECUTION] Defaulting unit to 'kcal' for calories.`);
        } else if (normalizedNutrientKey === 'water_g' || nutrient.toLowerCase() === 'water') {
             finalUnit = 'g'; // Or 'ml'? Assuming 'g' for consistency
             console.log(`[EXECUTION] Defaulting unit to 'g' for water.`);
        }
        // Then try inferring from the key suffix
        else if (normalizedNutrientKey.endsWith('_g')) {
             finalUnit = 'g';
             console.log(`[EXECUTION] Inferring unit 'g' from key ${normalizedNutrientKey}.`);
        } else if (normalizedNutrientKey.endsWith('_mg')) {
             finalUnit = 'mg';
             console.log(`[EXECUTION] Inferring unit 'mg' from key ${normalizedNutrientKey}.`);
        } else if (normalizedNutrientKey.endsWith('_mcg')) {
             finalUnit = 'mcg';
             console.log(`[EXECUTION] Inferring unit 'mcg' from key ${normalizedNutrientKey}.`);
        } else if (normalizedNutrientKey.endsWith('_mcg_rae')) {
             finalUnit = 'mcg_rae';
             console.log(`[EXECUTION] Inferring unit 'mcg_rae' from key ${normalizedNutrientKey}.`);
        } else if (normalizedNutrientKey.endsWith('_mcg_dfe')) {
             finalUnit = 'mcg_dfe';
             console.log(`[EXECUTION] Inferring unit 'mcg_dfe' from key ${normalizedNutrientKey}.`);
        }

        // If still no unit after checks, return an error
        if (!finalUnit) {
            console.error(`[EXECUTION] Could not determine unit for ${normalizedNutrientKey}. Unit is required.`);
            return {
                status: 'error',
                message: `I need a unit (like g, mg, kcal) for the nutrient '${nutrient}'. Please specify the unit.`,
                response_type: 'error_missing_unit'
            };
        }
    }
    // --- END UNIT INFERENCE/DEFAULT LOGIC ---

    const goalData = {
        user_id: userId,
        nutrient: normalizedNutrientKey, // Use normalized key
        target_value: targetValue,
        unit: finalUnit, // Use the determined or provided unit (guaranteed non-null here)
        goal_type: targetValue > 0 ? 'goal' : 'limit'
    };

    try {
        // --- Use UPSERT instead of separate UPDATE/INSERT ---
        console.log('[EXECUTION] Attempting UPSERT for goal:', JSON.stringify(goalData, null, 2));

        const { data: upsertData, error: upsertError } = await supabaseClient
            .from('user_goals')
            .upsert(goalData, {
                onConflict: 'user_id, nutrient' // Specify the columns that define uniqueness
            })
            .select(); // Select the upserted row

        if (upsertError) {
            console.error('[EXECUTION] Supabase UPSERT error:', JSON.stringify(upsertError, null, 2));
            // Check for specific errors if needed, though upsert should handle conflicts
            throw upsertError; // Throw to be caught by the outer catch block
        }

        // Check if data was returned (successful upsert)
        if (upsertData && upsertData.length > 0) {
            console.log('[EXECUTION] Supabase UPSERT successful. Data:', JSON.stringify(upsertData, null, 2));
            // Determine if it was an insert or update based on creation time vs now (optional, usually not needed)
            // For simplicity, just return a generic success message.
            return {
                status: 'success',
                updated_goal: upsertData[0],
                message: 'User goal saved successfully.', // Generic message for upsert
                response_type: 'goal_updated'
            };
        } else {
             // This case might indicate an issue if no data is returned after upsert
             console.error('[EXECUTION] Supabase UPSERT completed but returned no data.');
             return {
                 status: 'error',
                 message: 'Failed to save goal. The operation completed but returned no confirmation.',
                 response_type: 'error_db_no_data'
             };
        }
        // --- End UPSERT logic ---

    } catch (error) {
        console.error(`[EXECUTION] Error in executeUpdateUserGoal: ${error instanceof Error ? error.message : String(error)}`);
        return {
            status: 'error',
            message: `Sorry, something went wrong updating your goal. Please try again. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeSaveLoggedFoodAsRecipe(foodName: string, nutritionData: Record<string, any>, userId: string, supabaseClient: any): Promise<any> {
    console.log(`Executing tool: saveLoggedFoodAsRecipe for user ${userId} - ${foodName}`);
    if (!foodName || !nutritionData) {
        return {
            status: 'error',
            message: 'Food name and nutrition data are required to save as recipe.',
            response_type: 'error_parsing_args'
        };
    }
    try {
        const { data: savedRecipe, error } = await supabaseClient
            .from('user_recipes')
            .insert({
                user_id: userId,
                recipe_name: foodName,
                calories: nutritionData.calories,
                protein_g: nutritionData.protein_g,
                fat_total_g: nutritionData.fat_total_g,
                carbs_g: nutritionData.carbs_g,
                fat_saturated_g: nutritionData.fat_saturated_g,
                fiber_g: nutritionData.fiber_g,
                sugar_g: nutritionData.sugar_g,
                sodium_mg: nutritionData.sodium_mg,
                cholesterol_mg: nutritionData.cholesterol_mg,
                potassium_mg: nutritionData.potassium_mg
                // REMOVED non-existent columns: omega_3_g, omega_6_g, fiber_soluble_g
                // Add other nutrients from nutritionData ONLY if they exist in user_recipes
            })
            .select()
            .single();

        if (error) {
            console.error(`Error saving food '${foodName}' as recipe to user_recipes:`, error);
            const errorMsg = error?.message?.includes('column') && error?.message?.includes('does not exist')
              ? `Database schema mismatch saving to user_recipes: ${error.message}.`
              : 'Could not save as recipe.';
            return {
                status: 'error',
                message: errorMsg,
                response_type: 'error_db_insert'
            };
        }
        return {
            status: 'success',
            saved_recipe: savedRecipe,
            message: 'Food saved as recipe.',
            response_type: 'food_saved_as_recipe'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong saving as recipe. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeDeleteLoggedFood(logId: string | undefined, foodName: string | undefined, userId: string, supabaseClient: any): Promise<any> {
    console.log(`Executing tool: deleteLoggedFood for user ${userId} - logId: ${logId}, foodName: ${foodName}`);
    try {
        let targetLogId = logId;
        // If no logId provided, find the most recent log (optionally filter by foodName)
        if (!targetLogId) {
            let query = supabaseClient
                .from('food_log') // CORRECTED TABLE NAME (singular)
                .select('*')
                .eq('user_id', userId)
                .order('timestamp', { ascending: false })
                .limit(1);
            if (foodName) {
                query = query.ilike('food_name', `%${foodName}%`);
            }
            const { data: logs, error: fetchError } = await query;
            if (fetchError) {
                return {
                    status: 'error',
                    message: 'Could not fetch log to delete.',
                    response_type: 'error_database'
                };
            }
            if (!logs || logs.length === 0) {
                return {
                    status: 'error',
                    message: 'No log found to delete.',
                    response_type: 'no_log_found'
                };
            }
            targetLogId = logs[0].id;
        }
        // Delete the log
        const { error: deleteError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .delete()
            .eq('id', targetLogId);
        if (deleteError) {
            return {
                status: 'error',
                message: 'Could not delete log.',
                response_type: 'error_db_delete'
            };
        }
        return {
            status: 'success',
            deleted_log_id: targetLogId,
            message: 'Log deleted.',
            response_type: 'log_deleted'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong deleting your log. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
} 

/**
 * Fetches the nutrients a user is tracking from their goals
 * @param supabase The Supabase client
 * @param userId The user ID
 * @returns Array of nutrient keys the user is tracking
 */
export async function getUserTrackedNutrients(supabase: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data: goalsData, error: goalsError } = await supabase
      .from('user_goals')
      .select('nutrient') 
      .eq('user_id', userId);

    if (!goalsError && goalsData && goalsData.length > 0) {
      const trackedNutrients = goalsData.map(goal => goal.nutrient);
      console.log('[TOOLS] Fetched tracked nutrients:', trackedNutrients);
      return trackedNutrients;
    } else {
      // Default tracked nutrients if user has none set
      console.log('[TOOLS] No tracked nutrients found, using defaults');
      return ['calories', 'protein_g', 'fat_total_g', 'carbs_g'];
    }
  } catch (e) {
    console.error('[TOOLS] Error fetching tracked nutrients:', e);
    // Default to showing basic macros if error
    return ['calories', 'protein_g', 'fat_total_g', 'carbs_g'];
  }
}

/**
 * Standard mapping of nutrition data fields to display names and units
 */
export const NUTRIENT_DISPLAY_MAP: Record<string, { name: string; unit: string }> = {
  calories: { name: "Calories", unit: "kcal" },
  protein_g: { name: "Protein", unit: "g" },
  fat_total_g: { name: "Fat", unit: "g" },
  carbs_g: { name: "Carbs", unit: "g" },
  fiber_g: { name: "Fiber", unit: "g" },
  sugar_g: { name: "Sugar", unit: "g" },
  sodium_mg: { name: "Sodium", unit: "mg" },
  cholesterol_mg: { name: "Cholesterol", unit: "mg" },
  fat_saturated_g: { name: "Saturated Fat", unit: "g" },
  potassium_mg: { name: "Potassium", unit: "mg" },
  omega_3_g: { name: "Omega-3", unit: "g" },
  omega_6_g: { name: "Omega-6", unit: "g" },
  fiber_soluble_g: { name: "Soluble Fiber", unit: "g" }
};

/**
 * Format nutrition data for display based on tracked nutrients
 */
export function formatNutritionForDisplay(nutritionData: Record<string, any>, trackedNutrients: string[]): string {
  // Always include calories if available
  if (nutritionData.calories !== undefined && !trackedNutrients.includes('calories')) {
    trackedNutrients = ['calories', ...trackedNutrients];
  }
  
  let nutritionSummary = '';
  trackedNutrients.forEach((nutrient, index) => {
    if (nutritionData[nutrient] !== null && nutritionData[nutrient] !== undefined) {
      const displayInfo = NUTRIENT_DISPLAY_MAP[nutrient] || { name: nutrient, unit: '' };
      const prefix = index === 0 ? '' : ', ';
      nutritionSummary += `${prefix}${nutritionData[nutrient]}${displayInfo.unit === 'kcal' ? '' : displayInfo.unit} ${displayInfo.name}`;
    }
  });
  
  return nutritionSummary;
}

export async function executeFindRecipesByNutrition(
  nutrient: string,
  minValue: number | undefined,
  maxValue: number | undefined,
  userId: string,
  supabaseClient: any
): Promise<any> {
  console.log(`Executing tool: findRecipesByNutrition for ${nutrient} between ${minValue || 'min'} and ${maxValue || 'max'}`);
  
  // Normalize nutrient name to key used in DB
  const normalizedNutrient = normalizeNutrientKey(nutrient);
  
  try {
    const results = await findRecipesByNutrition(userId, supabaseClient, {
      nutrient: normalizedNutrient,
      minValue,
      maxValue,
      limit: 5
    });
    
    if (!results || results.length === 0) {
      return {
        status: 'success',
        found: false,
        message: `I couldn't find any recipes with ${nutrient} ${minValue !== undefined ? `above ${minValue}` : ''}${maxValue !== undefined ? `${minValue !== undefined ? ' and' : ''} below ${maxValue}` : ''}.`,
        response_type: 'no_nutrition_recipes_found'
      };
    }
    
    // Format response message
    const nutrientLabel = NUTRIENT_DISPLAY_MAP[normalizedNutrient]?.name || normalizedNutrient;
    const nutrientUnit = NUTRIENT_DISPLAY_MAP[normalizedNutrient]?.unit || '';
    
    const recipeList = results.map((recipe, index) => {
      const nutrientValue = recipe[normalizedNutrient];
      return `${index + 1}. "${recipe.recipe_name}" (${nutrientValue}${nutrientUnit} ${nutrientLabel})`;
    }).join('\n');
    
    return {
      status: 'success',
      found: true,
      count: results.length,
      matches: results,
      message: `Found ${results.length} recipes matching your nutrition criteria:\n${recipeList}\nWould you like to log any of these?`,
      response_type: 'nutrition_recipes_found'
    };
  } catch (error) {
    console.error(`Error in executeFindRecipesByNutrition:`, error);
    return {
      status: 'error',
      message: `Sorry, something went wrong searching recipes by nutrition. Please try again. (${error instanceof Error ? error.message : String(error)})`,
      response_type: 'error_unexpected'
    };
  }
}

export async function executeCreateRecipeVariation(
  baseRecipeId: string | null,
  baseRecipeName: string | null,
  modifications: string,
  userId: string,
  supabaseClient: any,
  openai: any
): Promise<any> {
  console.log(`Executing tool: createRecipeVariation based on ${baseRecipeId ? `ID ${baseRecipeId}` : `name ${baseRecipeName}`} with modifications: ${modifications}`);
  
  try {
    // First, fetch the base recipe either by ID or name
    let baseRecipe = null;
    
    if (baseRecipeId) {
      const { data, error } = await supabaseClient
        .from('user_recipes')
        .select('*')
        .eq('id', baseRecipeId)
        .eq('user_id', userId)
        .single();
        
      if (error || !data) {
        return {
          status: 'error',
          message: `Could not find the base recipe with ID ${baseRecipeId}.`,
          response_type: 'error_recipe_not_found'
        };
      }
      
      baseRecipe = data;
    } else if (baseRecipeName) {
      // Use our existing fuzzy search to find the recipe
      const recipes = await findRecipesByFuzzyName(baseRecipeName, userId, supabaseClient, { limit: 1 });
      
      if (!recipes || recipes.length === 0) {
        return {
          status: 'error',
          message: `Could not find a recipe named "${baseRecipeName}".`,
          response_type: 'error_recipe_not_found'
        };
      }
      
      // Get the full recipe details
      const { data, error } = await supabaseClient
        .from('user_recipes')
        .select('*')
        .eq('id', recipes[0].id)
        .eq('user_id', userId)
        .single();
        
      if (error || !data) {
        return {
          status: 'error',
          message: `Could not fetch details for recipe "${baseRecipeName}".`,
          response_type: 'error_recipe_not_found'
        };
      }
      
      baseRecipe = data;
    } else {
      return {
        status: 'error',
        message: 'Either a recipe ID or name must be provided.',
        response_type: 'error_missing_params'
      };
    }
    
    // Now we have the base recipe, use AI to apply the modifications
    const baseDescription = baseRecipe.description || '';
    
    // Request AI to modify the recipe
    const prompt = `
      Original Recipe: "${baseRecipe.recipe_name}"
      Original Description: "${baseDescription}"
      
      Modifications to make: ${modifications}
      
      Please provide an updated recipe with the modifications applied. 
      Include a new recipe name and description.
    `;
    
    const modificationResult = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a recipe expert assistant. Respond with accurate, detailed, and helpful information about recipes, nutrition, and cooking." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      tools: [{
        type: "function",
        function: {
          name: "updateRecipe",
          description: "Updates a recipe with modifications",
          parameters: {
            type: "object",
            properties: {
              recipe_name: { type: "string", description: "New name for the modified recipe" },
              description: { type: "string", description: "Updated recipe description with modifications" },
              estimation_notes: { type: "string", description: "Notes about nutritional changes due to modifications" }
            },
            required: ["recipe_name", "description"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "updateRecipe" } }
    });
    
    // Process the AI's response
    const toolCall = modificationResult.choices[0].message.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "updateRecipe") {
      throw new Error("AI response did not include expected tool call");
    }
    
    let modifiedRecipe;
    try {
      modifiedRecipe = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      throw new Error("Could not parse AI response for recipe modification");
    }
    
    // Create a copy of the base recipe with updated information
    const newRecipe = {
      ...baseRecipe,
      id: undefined, // Remove ID so a new one is generated
      recipe_name: modifiedRecipe.recipe_name,
      description: modifiedRecipe.description,
      created_at: new Date().toISOString()
    };
    
    // Note: nutrition values aren't updated here since we'd need more detailed analysis
    // In a more complete implementation, you would reanalyze nutrition based on modifications
    
    // Save the new recipe
    const { data: savedRecipe, error: saveError } = await supabaseClient
      .from('user_recipes')
      .insert(newRecipe)
      .select()
      .single();
      
    if (saveError) {
      return {
        status: 'error',
        message: `Could not save the modified recipe: ${saveError.message}`,
        response_type: 'error_db_insert'
      };
    }
    
    return {
      status: 'success',
      message: `Created a new recipe "${modifiedRecipe.recipe_name}" based on "${baseRecipe.recipe_name}" with your modifications.`,
      original_recipe: baseRecipe.recipe_name,
      new_recipe: modifiedRecipe.recipe_name,
      new_recipe_id: savedRecipe.id,
      response_type: 'recipe_variation_created',
      estimation_notes: modifiedRecipe.estimation_notes || 'Nutrition values are estimated based on the original recipe.'
    };
  } catch (error) {
    console.error(`Error in executeCreateRecipeVariation:`, error);
    return {
      status: 'error',
      message: `Sorry, something went wrong creating a recipe variation. Please try again. (${error instanceof Error ? error.message : String(error)})`,
      response_type: 'error_unexpected'
    };
  }
}