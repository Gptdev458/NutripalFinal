// Tool execution functions for AI handler
// Export all tool execution functions

import { setPendingAction } from '../utils/pendingAction.ts'; // Import the helper

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

export async function executeLogExistingSavedRecipe(recipeId: string, recipeName: string, userId: string, supabaseClient: any): Promise<any> {
    console.log(`Attempting to log saved recipe ID: ${recipeId} (Name: ${recipeName}) for user: ${userId}`);
    try {
        // Define nutrient columns that EXIST in BOTH user_recipes and food_log (based on provided schema)
        // Excludes: omega_3_g, omega_6_g, fiber_soluble_g (missing from user_recipes)
        const nutrientColumns = [
          'calories', 'water_g', 'protein_g', 'fat_total_g', 'carbs_g',
          'fat_saturated_g', 'fat_polyunsaturated_g', 'fat_monounsaturated_g', 'fat_trans_g',
          'fiber_g', 'sugar_g', 'sugar_added_g', 'cholesterol_mg', 'sodium_mg',
          'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'phosphorus_mg',
          'zinc_mg', 'copper_mg', 'manganese_mg', 'selenium_mcg', 'vitamin_a_mcg_rae',
          'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_k_mcg', 'vitamin_c_mg', 'thiamin_mg',
          'riboflavin_mg', 'niacin_mg', 'pantothenic_acid_mg', 'vitamin_b6_mg',
          'biotin_mcg', 'folate_mcg_dfe', 'vitamin_b12_mcg'
          // Note: omega_3_g, omega_6_g, fiber_soluble_g exist in food_log but not user_recipes
        ];
        const selectColumns = ['recipe_name', ...nutrientColumns];

        // Fetch recipe details using the defined columns from user_recipes
        const { data: recipeData, error: recipeError } = await supabaseClient
          .from('user_recipes')
          .select(selectColumns.join(', '))
          .eq('id', recipeId)
          .eq('user_id', userId)
          .single();

        if (recipeError || !recipeData) {
          console.error(`Error fetching recipe details for ID ${recipeId}:`, recipeError);
          const errorMsg = recipeError?.message?.includes('column') && recipeError?.message?.includes('does not exist')
            ? `Database schema mismatch fetching from user_recipes: ${recipeError.message}.`
            : `Could not find saved recipe details for '${recipeName}'.`;
          throw new Error(errorMsg);
        }

        // Prepare the insert object for food_logs using columns that exist in food_logs
        const logEntry: Record<string, any> = {
          user_id: userId,
          food_name: recipeData.recipe_name,
          // timestamp and created_at will default to now()
          source: 'saved_recipe',
          recipe_id: recipeId
        };

        // Add nutrient values from recipeData to logEntry
        nutrientColumns.forEach(col => {
          // Check if the column exists in recipeData and is not null/undefined
          if (recipeData[col] !== null && recipeData[col] !== undefined) {
            logEntry[col] = recipeData[col];
          }
        });

        // Log the exact data being sent before attempting insert
        console.log("Attempting to insert into food_log:", JSON.stringify(logEntry, null, 2)); // Keep this log for now

        // Insert the log entry with individual nutrient columns into food_log
        const { error: logError } = await supabaseClient
          .from('food_log') // CORRECTED TABLE NAME (singular)
          .insert(logEntry);

        if (logError) {
          // Log the detailed error object from Supabase
          console.error(`Error inserting log for recipe ID ${recipeId} into food_log:`, JSON.stringify(logError, null, 2));
          const errorMsg = logError?.message?.includes('column') && logError?.message?.includes('does not exist')
            ? `Database schema mismatch inserting into food_log: ${logError.message}.`
            : logError?.message
            ? `Database error inserting log: ${logError.message}`
            : `Database error while trying to log '${recipeData.recipe_name}'.`;
          throw new Error(errorMsg);
        }

        console.log(`Successfully logged recipe ID ${recipeId} with individual nutrients into food_log for user ${userId}`);

        // Prepare confirmation data (filter nutrients for display)
        const confirmationNutrition = await filterNutritionDataForUserGoals(logEntry, userId, supabaseClient);

        return {
          status: 'success',
          message: 'Recipe logged successfully.',
          logged_recipe_id: recipeId,
          logged_recipe_name: recipeData.recipe_name,
          nutrition_data: confirmationNutrition, // Return filtered nutrients
          response_type: 'saved_recipe_logged'
        };
    } catch (error) {
        console.error(`executeLogExistingSavedRecipe failed for recipe ID ${recipeId}:`, error);
        return {
          status: 'error',
          message: error instanceof Error ? error.message : 'An unknown error occurred while logging the recipe.',
          response_type: 'error_logging_recipe'
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

export async function executeFindSavedRecipeByName(query: string, userId: string, supabaseClient: any): Promise<any> {
    console.log(`Executing tool: findSavedRecipeByName for query '${query}' for user ${userId}`);
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
        const { data: matches, error: fetchError } = await supabaseClient
            .from('user_recipes')
            .select('id, recipe_name, description')
            .eq('user_id', userId)
            .ilike('recipe_name', `%${trimmedQuery}%`)
            .limit(5);
        if (fetchError) {
            console.error(`DB Error searching recipes for query '${trimmedQuery}':`, fetchError.message);
            return {
                status: 'error',
                message: `Sorry, I couldn't search your recipes right now. Please try again later. (${fetchError.message})`,
                found: false,
                response_type: 'error_database'
            };
        }
        if (!matches || matches.length === 0) {
            return {
                status: 'success',
                found: false,
                matches: [],
                message: 'No saved recipes found.',
                response_type: 'saved_recipe_not_found'
            };
        }
        if (matches.length === 1) {
            return {
                status: 'success',
                found: true,
                count: 1,
                matches: matches,
                message: 'One saved recipe found.',
                response_type: 'saved_recipe_confirmation_prompt',
                // Add pending action context for the frontend/next turn
                pending_action: {
                    type: 'confirm_log_saved_recipe',
                    recipe_id: matches[0].id,
                    recipe_name: matches[0].recipe_name
                }
            };
        }
        // Multiple matches
        const recipeNames = matches.map((r: any) => r.recipe_name).join(', ');
        return {
            status: 'success',
            found: true,
            count: matches.length,
            matches: matches,
            message: 'Multiple saved recipes found.',
            response_type: 'saved_recipe_found_multiple'
        };
    } catch (error) {
        console.error(`Error in executeFindSavedRecipeByName for query '${trimmedQuery}':`, error);
        return {
            status: 'error',
            message: `Sorry, something went wrong searching your recipes. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            found: false,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeAnalyzeRecipeIngredients(recipeName: string, ingredientsList: string, userId: string, supabaseClient: any, openai: any): Promise<any> {
    console.log(`Executing tool: analyzeRecipeIngredients for '${recipeName}' by user ${userId}`);
    const cleanedName = (recipeName || '').trim();
    const cleanedIngredients = (ingredientsList || '').trim();
    if (!cleanedName) {
        return {
            status: 'error',
            message: "Please provide a name for your recipe (e.g., 'chicken soup', 'veggie stir fry').",
            response_type: 'error_parsing_args'
        };
    }
    if (cleanedName.length < 2) {
        return {
            status: 'error',
            message: "That recipe name is too short. Please use at least 2 characters.",
            response_type: 'error_parsing_args'
        };
    }
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
    try {
        // Use OpenAI Function Calling for structured analysis
        const analysisPrompt = `Analyze the following recipe ingredients list and estimate the total nutritional content for the *entire recipe*. Provide the total amounts for calories, protein (g), total fat (g), saturated fat (g), carbohydrates (g), fiber (g), soluble fiber (g), sugars (g), sodium (mg), cholesterol (mg), potassium (mg), omega-3 (g), and omega-6 (g). Recipe Name: ${cleanedName}. Ingredients: ${cleanedIngredients}`;
        const analysisCompletion = await openai.chat.completions.create({
            model: "gpt-4o", // Or your preferred model
            messages: [
                { role: "system", content: "You are a helpful nutrition analysis assistant." },
                { role: "user", content: analysisPrompt }
            ],
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
        const functionCall = analysisChoice?.message?.tool_calls?.[0]?.function;
        if (!functionCall || !functionCall.arguments) {
            return {
                status: 'error',
                message: 'Could not analyze recipe.',
                response_type: 'error_openai_format'
            };
        }
        let analysisData: Record<string, any> = {};
        try {
            analysisData = JSON.parse(functionCall.arguments);
            analysisData.recipe_name = cleanedName;
            analysisData.ingredients = cleanedIngredients;
            analysisData.user_id = userId;
            analysisData.omega_3_g = analysisData.omega_3_g ?? null;
            analysisData.omega_6_g = analysisData.omega_6_g ?? null;
            analysisData.fiber_soluble_g = analysisData.fiber_soluble_g ?? null;
        } catch (parseError) {
            return {
                status: 'error',
                message: 'Could not parse nutrition analysis results.',
                response_type: 'error_parsing_analysis'
            };
        }
        // Filter based on user goals before presenting for confirmation
        const filteredAnalysis = await filterNutritionDataForUserGoals(analysisData, userId, supabaseClient);

        // *** SET PENDING ACTION before returning ***
        const pendingRecipeAction = { type: 'log_analyzed_recipe', analysis: analysisData };
        await setPendingAction(userId, pendingRecipeAction, supabaseClient);
        console.log('[EXECUTION DEBUG] Set pending_action for log_analyzed_recipe:', JSON.stringify(pendingRecipeAction)); // DEBUG LOG

        return {
            status: 'success',
            analysis: filteredAnalysis, // Return filtered data for display
            message: 'Recipe analyzed. Please confirm if you want to log or save it.', // Adjusted message slightly
            response_type: 'recipe_analysis_prompt',
            // pending_action is now set in the DB, no need to return it here explicitly
            // pending_action: pendingRecipeAction 
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong analyzing your recipe. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function executeAnswerGeneralQuestion(question: string, userId: string, supabaseClient: any, openai: any): Promise<any> {
    console.log(`Executing tool: answerGeneralQuestion for user ${userId}. Question: "${question}"`);
    const cleanedQuestion = (question || '').trim();
    if (!cleanedQuestion) {
        return {
            status: 'error',
            message: "Please ask a question about nutrition, health, or how to use the app.",
            response_type: 'error_parsing_args'
        };
    }
    // Optionally, filter out questions that are clearly off-topic or medical advice
    const offTopicPatterns = [
        /diagnose|diagnosis|prescribe|prescription|disease|cure|treat|treatment|emergency|urgent|pain|doctor|hospital|medicine|medication|drug|surgery|operation|side effect|symptom|symptoms/i
    ];
    if (offTopicPatterns.some(re => re.test(cleanedQuestion))) {
        return {
            status: 'error',
            message: "I'm here to help with nutrition, healthy habits, and using the app, but I can't provide medical advice or diagnoses. Please ask about food, nutrition, or app features!",
            response_type: 'error_scope'
        };
    }
    try {
        // 1. (Optional) Fetch context - e.g., User Goals
        let contextMessages: any[] = [];
        try {
            const { data: goals, error: goalsError } = await supabaseClient
                .from('user_goals')
                .select('nutrient, target_value, unit')
                .eq('user_id', userId);
            if (goalsError) {
                console.warn("Could not fetch user goals for context:", goalsError.message);
            } else if (goals && goals.length > 0) {
                const goalSummary = goals.map((g: any) => `${g.nutrient}: ${g.target_value}${g.unit || ''}`).join(', ');
                contextMessages.push({
                    role: 'system',
                    content: `User's current goals (for context, if relevant): ${goalSummary}`
                });
                console.log("Added user goals context to prompt.");
            }
        } catch (contextError) {
            console.warn("Error fetching context for question:", contextError);
        }
        // 2. Construct messages for OpenAI
        const messages: any[] = [
            { role: "system", content: "You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses. Help users log foods, analyze recipes, and answer nutrition questions. Use the available tools to take actions as needed. Always confirm actions with the user when appropriate, and encourage healthy habits. If you need clarification, ask clear and friendly questions. Never provide medical advice. End each successful interaction with a brief, positive follow-up like 'Anything else today?' or 'Keep up the great work!'" },
            ...contextMessages,
            { role: "user", content: cleanedQuestion }
        ];
        // 3. Call OpenAI for a direct answer (no tools needed here)
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.7,
        });
        const answerContent = response.choices[0].message?.content || "Sorry, I couldn't formulate a response to that question.";
        return {
            status: 'success',
            answer: answerContent,
            message: 'General question answered.',
            response_type: 'answer_provided'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, I couldn't answer your question. Please try again or ask about something else. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function saveAndLogRecipe(analysisData: any, userId: string, supabaseClient: any): Promise<any> {
    console.log(`[EXECUTION] saveAndLogRecipe called for user ${userId}`);
    console.log(`[EXECUTION] Received analysisData:`, JSON.stringify(analysisData, null, 2));
    if (!analysisData || !analysisData.recipe_name || !analysisData.calories) {
        return {
            status: 'error',
            message: 'Missing required analysis data to save and log recipe.',
            response_type: 'error_missing_data'
        };
    }
    try {
        // Save as recipe - ONLY insert columns that EXIST in user_recipes
        const { data: savedRecipe, error: saveError } = await supabaseClient
            .from('user_recipes')
            .insert({
                user_id: userId,
                recipe_name: analysisData.recipe_name,
                calories: analysisData.calories,
                protein_g: analysisData.protein_g,
                fat_total_g: analysisData.fat_total_g,
                carbs_g: analysisData.carbs_g,
                fat_saturated_g: analysisData.fat_saturated_g,
                fiber_g: analysisData.fiber_g,
                // fiber_soluble_g: analysisData.fiber_soluble_g, // Does not exist in user_recipes
                sugar_g: analysisData.sugar_g,
                sodium_mg: analysisData.sodium_mg,
                cholesterol_mg: analysisData.cholesterol_mg,
                potassium_mg: analysisData.potassium_mg,
                // omega_3_g: analysisData.omega_3_g, // Does not exist in user_recipes
                // omega_6_g: analysisData.omega_6_g, // Does not exist in user_recipes
                // ingredients: analysisData.ingredients // Does not exist in user_recipes
                // Add other existing user_recipes nutrient columns if needed and available in analysisData
            })
            .select('id') // Only select id, as other columns might not be returned by default
            .single();

        if (saveError) {
            console.error(`Error saving recipe '${analysisData.recipe_name}' to user_recipes:`, saveError);
            const errorMsg = saveError?.message?.includes('column') && saveError?.message?.includes('does not exist')
              ? `Database schema mismatch saving to user_recipes: ${saveError.message}.`
              : 'Could not save recipe.';
            return {
                status: 'error',
                message: errorMsg,
                response_type: 'error_db_insert'
            };
        }

        // Log the saved recipe - Insert into food_log (which HAS omega/soluble fiber columns)
        const logEntry: Record<string, any> = {
                user_id: userId,
                food_name: analysisData.recipe_name,
                // timestamp defaults to now()
                source: 'saved_recipe',
                recipe_id: savedRecipe.id,
                calories: analysisData.calories,
                protein_g: analysisData.protein_g,
                fat_total_g: analysisData.fat_total_g,
                carbs_g: analysisData.carbs_g,
                fat_saturated_g: analysisData.fat_saturated_g,
                fiber_g: analysisData.fiber_g,
                fiber_soluble_g: analysisData.fiber_soluble_g, // Exists in food_log
                sugar_g: analysisData.sugar_g,
                sodium_mg: analysisData.sodium_mg,
                cholesterol_mg: analysisData.cholesterol_mg,
                potassium_mg: analysisData.potassium_mg,
                omega_3_g: analysisData.omega_3_g, // Exists in food_log
                omega_6_g: analysisData.omega_6_g // Exists in food_log
                // Add all other relevant nutrients from analysisData that exist in food_log
            };
        // Add all other nutrients from analysisData if they exist in logEntry schema
        Object.keys(analysisData).forEach(key => {
             // Add if it's a nutrient column expected in food_log and not already added
            if (!logEntry.hasOwnProperty(key) && key.match(/_g$|_mg$|_mcg$/) && analysisData[key] !== null && analysisData[key] !== undefined) {
                 logEntry[key] = analysisData[key];
            }
        });

        const { data: logData, error: logError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .insert(logEntry)
            .select(); // Select the inserted log data

        if (logError) {
            return {
                status: 'error',
                message: 'Could not log saved recipe.',
                response_type: 'error_db_insert'
            };
        }
        return {
            status: 'success',
            saved_recipe: savedRecipe,
            message: 'Recipe saved and logged.',
            response_type: 'recipe_saved_and_logged'
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong saving and logging your recipe. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
            response_type: 'error_unexpected'
        };
    }
}

export async function logOnlyAnalyzedRecipe(analysisData: any, userId: string, supabaseClient: any): Promise<any> {
    console.log(`[EXECUTION] logOnlyAnalyzedRecipe called for user ${userId}`);
    console.log(`[EXECUTION] Received analysisData:`, JSON.stringify(analysisData, null, 2));
    if (!analysisData || !analysisData.recipe_name || !analysisData.calories) {
        return {
            status: 'error',
            message: 'Missing required analysis data to log recipe.',
            response_type: 'error_missing_data'
        };
    }
    try {
        // Log the analyzed recipe directly
        const { data: logData, error: logError } = await supabaseClient
            .from('food_log') // CORRECTED TABLE NAME (singular)
            .insert({
                user_id: userId,
                food_name: analysisData.recipe_name,
                timestamp: new Date().toISOString(),
                source: 'analyzed_recipe',
                calories: analysisData.calories,
                protein_g: analysisData.protein_g,
                fat_total_g: analysisData.fat_total_g,
                carbs_g: analysisData.carbs_g,
                fat_saturated_g: analysisData.fat_saturated_g,
                fiber_g: analysisData.fiber_g,
                fiber_soluble_g: analysisData.fiber_soluble_g,
                sugar_g: analysisData.sugar_g,
                sodium_mg: analysisData.sodium_mg,
                cholesterol_mg: analysisData.cholesterol_mg,
                potassium_mg: analysisData.potassium_mg,
                omega_3_g: analysisData.omega_3_g,
                omega_6_g: analysisData.omega_6_g
            })
            .select();
        if (logError) {
            return {
                status: 'error',
                message: 'Could not log analyzed recipe.',
                response_type: 'error_db_insert'
            };
        }
        return {
            status: 'success',
            message: 'Analyzed recipe logged.',
            response_type: 'analyzed_recipe_logged',
            log: logData
        };
    } catch (error) {
        return {
            status: 'error',
            message: `Sorry, something went wrong logging your analyzed recipe. Please try again or ask for help. (${error instanceof Error ? error.message : String(error)})`,
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