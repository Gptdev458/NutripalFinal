// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Import necessary libraries
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { OpenAI } from "npm:openai@^4.47.1";

// Define CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define AI Persona with updated instructions for follow-ups
const AI_PERSONA = `You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses. When completing a successful logging action or answering a question helpfully, end your response with a brief, encouraging, natural-sounding follow-up like 'Keep up the great work!' or 'Anything else today?'.
If the user mentions more than one food in a message, call the logging tool once for each food, not as a combined description.`;

// Define Master Nutrient Keys Directly
const MASTER_NUTRIENT_KEYS = [
  "calories", "water_g", "protein_g", "fat_total_g", "carbs_g",
  "fat_saturated_g", "fat_polyunsaturated_g", "fat_monounsaturated_g", "fat_trans_g",
  "omega_3_g", "omega_6_g",
  "fiber_g", "fiber_soluble_g",
  "sugar_g", "sugar_added_g", "cholesterol_mg", "sodium_mg",
  "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg",
  "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "vitamin_a_mcg_rae",
  "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg", "vitamin_c_mg", "thiamin_mg",
  "riboflavin_mg", "niacin_mg", "pantothenic_acid_mg", "vitamin_b6_mg",
  "biotin_mcg", "folate_mcg_dfe", "vitamin_b12_mcg"
];

// Define available tools for OpenAI function calling
const availableTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'logGenericFoodItem',
            description: "Logs a single, simple food item. If the user mentions multiple foods in one message (e.g., 'log a banana and an apple'), call this tool separately for each food item. Use this ONLY when the item is clearly simple OR explicitly stated as standard/pre-packaged. **DO NOT use** for dishes that typically require multiple ingredients (like 'fried rice', 'soup', 'salad', 'pasta', 'smoothie', 'casserole') UNLESS the user provides specific context indicating it's standard/pre-made OR you are explicitly told to log it as a generic item after asking for clarification.",
            parameters: {
                type: 'object',
                properties: {
                    food_description: {
                        type: 'string',
                        description: "The user's description of the food they ate, including quantity if provided. E.g., 'a bowl of oatmeal with berries', '2 slices of toast with peanut butter'."
                    }
                },
                required: ['food_description']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'findSavedRecipeByName',
            description: "Searches the user's saved recipes by name. **Use this FIRST** whenever the user asks to log a specific named item (e.g., 'log my morning smoothie', 'add the chili recipe', 'log post workout shake') as they might have saved it before. Only use other tools if this search finds nothing or the user confirms it's not saved.",
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: "The name or keywords from the user's message to search for in their saved recipes. E.g., 'morning smoothie', 'chili', 'post workout shake'."
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyzeRecipeIngredients',
            description: "Analyzes the ingredients of a recipe to estimate nutrition. Use this tool when: 1) The user explicitly provides ingredients for a dish. 2) The user mentions making a dish themselves (e.g., 'my homemade soup'). 3) The user confirms they want to analyze a dish that typically requires multiple ingredients (like 'fried rice', 'soup', 'salad', 'pasta', 'smoothie') after being asked for clarification. Requires the recipe name and the list of ingredients." ,
            parameters: {
                type: 'object',
                properties: {
                    recipe_name: {
                        type: 'string',
                        description: "The name the user gives the recipe, or a suggested name like 'Custom Recipe' if they don't provide one."
                    },
                    ingredients_list: {
                        type: 'string',
                        description: "The full list of ingredients provided by the user. E.g., '1 tbsp olive oil, 1 onion chopped...'."
                    }
                },
                required: ['recipe_name', 'ingredients_list']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'clarifyDishType',
            description: "Use this function ONLY when the user mentions a general dish name that usually requires multiple ingredients (e.g., 'fried rice', 'soup', 'salad', 'pasta', 'curry') AND **does not** provide ingredients or specify if it's homemade/standard/pre-packaged, AND a search for a saved recipe with that name is unlikely to succeed or has already failed. This tool asks the user for clarification. **Do not use** for items like 'smoothie' or 'shake' initially; try `findSavedRecipeByName` first for those.",
            parameters: {
                type: 'object',
                properties: {
                    dish_name: {
                        type: 'string',
                        description: "The ambiguous dish name mentioned by the user (e.g., 'fried rice', 'vegetable soup').",
                    },
                },
                required: ['dish_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'logExistingSavedRecipe',
            description: "Logs a specific saved recipe identified by its ID to the user's food diary. This function is typically called *after* `findSavedRecipeByName` has confirmed a specific recipe and the user agrees to log it.",
            parameters: {
                type: 'object',
                properties: {
                    recipe_id: {
                        type: 'string', // Assuming UUIDs are handled as strings here
                        description: "The unique identifier (UUID) of the user's saved recipe."
                    },
                    recipe_name: {
                        type: 'string',
                        description: "The name of the saved recipe being logged, used for confirmation messages."
                    }
                },
                required: ['recipe_id', 'recipe_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'answerGeneralQuestion',
            description: "Provides information or answers general health, nutrition, or app usage questions not related to logging specific foods or recipes. Use for queries like 'how much protein should I eat?', 'is avocado healthy?', 'how do I set goals?'.",
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: "The user's question."
                    }
                },
                required: ['question']
            }
        }
    }
];

// Recipe detection constants
const recipeKeywords = [
  'my', 'made', 'homemade', 'recipe', "i cooked", "i prepared", "i baked", "whipped up",
  "fried", "mixed", "prepared", "created", "assembled", "dish", "meal", "platter"
];
const recipeDishNames = [
  'fried rice', 'smoothie', 'stir-fry', 'stir fry', 'casserole', 'bake',
  'salad', 'soup', 'stew', 'curry', 'bowl', 'pasta', 'noodles', 'risotto',
  'goulash', 'chili', 'fajitas', 'tacos', 'burrito', 'enchiladas', 'quesadilla',
  'sandwich', 'burger', 'wrap', 'pizza', 'pie', 'quiche', 'frittata', 'omelette',
  'scramble', 'hash', 'paella', 'jambalaya', 'lasagna', 'moussaka',
  'shepherd\'s pie', 'cottage pie', 'pot roast', 'meatloaf', 'tagine',
  'biryani', 'pilaf', 'congee', 'ramen', 'pho', 'dumplings', 'sushi roll',
  'chicken and rice', 'beef and broccoli', 'salmon and vegetables',
  'eggs benedict', 'shakshuka', 'parfait', 'oatmeal with toppings',
  'pancakes', 'waffles', 'french toast', 'cake', 'muffins', 'cookies',
  'brownies', 'scones', 'bread'
];

// --- HELPER FUNCTIONS & TOOL EXECUTION ---

// Define a more specific return type for tool execution results
type ToolResult = {
    status: 'success' | 'error';
    message?: string; // Optional error message or success confirmation message
    [key: string]: any; // Allow other properties like logged_recipe_name, analysis, etc.
}

/** Filters nutrition data based on user's tracked goals */
async function filterNutritionDataForUserGoals(nutritionData: Record<string, any>, userId: string, supabaseClient: SupabaseClient): Promise<Record<string, any>> {
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

        const trackedNutrientKeys = new Set(goalsData.map(goal => goal.nutrient));
        trackedNutrientKeys.add('calories'); // Always include calories

        const filteredNutritionData: Record<string, any> = {};
        trackedNutrientKeys.forEach(key => {
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

/** Logs a recipe already saved by the user (Tool: logExistingSavedRecipe) */
async function executeLogExistingSavedRecipe(recipeId: string, recipeName: string, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Executing tool: logExistingSavedRecipe for ID '${recipeId}' (Name: '${recipeName}') for user ${userId}`);
    if (!recipeId || !recipeName) {
        return { status: 'error', message: 'Recipe ID and Name are required.', response_type: 'error_parsing_args' };
    }
    try {
        // 1. Fetch the recipe details including nutrition columns directly
        const { data: recipeData, error: recipeFetchError } = await supabaseClient
            .from('user_recipes') // Correct table
            .select('*') // Select all columns, including nutrient columns
            .eq('id', recipeId)
            .eq('user_id', userId)
            .single();

        if (recipeFetchError) {
            console.error(`Error fetching saved recipe ${recipeId}:`, recipeFetchError);
            return { status: 'error', message: `Database error fetching recipe: ${recipeFetchError.message}` };
        }
        if (!recipeData) {
            return { status: 'error', message: `Saved recipe with ID ${recipeId} not found.` };
        }

        // 3. Log using the fetched data from recipeData directly
        const { data: logData, error: logError } = await supabaseClient
            .from('food_log')
            .insert({
                user_id: userId,
                food_name: recipeData.recipe_name, 
                timestamp: new Date().toISOString(),
                source: 'saved_recipe',
                recipe_id: recipeId,
                // Add back nutrient columns
                calories: recipeData.calories,
                water_g: recipeData.water_g,
                protein_g: recipeData.protein_g,
                fat_total_g: recipeData.fat_total_g,
                carbs_g: recipeData.carbs_g,
                fat_saturated_g: recipeData.fat_saturated_g,
                fat_polyunsaturated_g: recipeData.fat_polyunsaturated_g,
                fat_monounsaturated_g: recipeData.fat_monounsaturated_g,
                fat_trans_g: recipeData.fat_trans_g,
                fiber_g: recipeData.fiber_g,
                sugar_g: recipeData.sugar_g,
                sugar_added_g: recipeData.sugar_added_g,
                cholesterol_mg: recipeData.cholesterol_mg,
                sodium_mg: recipeData.sodium_mg,
                potassium_mg: recipeData.potassium_mg,
                calcium_mg: recipeData.calcium_mg,
                iron_mg: recipeData.iron_mg,
                magnesium_mg: recipeData.magnesium_mg,
                phosphorus_mg: recipeData.phosphorus_mg,
                zinc_mg: recipeData.zinc_mg,
                copper_mg: recipeData.copper_mg,
                manganese_mg: recipeData.manganese_mg,
                selenium_mcg: recipeData.selenium_mcg,
                vitamin_a_mcg_rae: recipeData.vitamin_a_mcg_rae,
                vitamin_d_mcg: recipeData.vitamin_d_mcg,
                vitamin_e_mg: recipeData.vitamin_e_mg,
                vitamin_k_mcg: recipeData.vitamin_k_mcg,
                vitamin_c_mg: recipeData.vitamin_c_mg,
                thiamin_mg: recipeData.thiamin_mg,
                riboflavin_mg: recipeData.riboflavin_mg,
                niacin_mg: recipeData.niacin_mg,
                pantothenic_acid_mg: recipeData.pantothenic_acid_mg,
                vitamin_b6_mg: recipeData.vitamin_b6_mg,
                biotin_mcg: recipeData.biotin_mcg,
                folate_mcg_dfe: recipeData.folate_mcg_dfe,
                vitamin_b12_mcg: recipeData.vitamin_b12_mcg
            })
            .select(); 

        if (logError) {
            console.error(`Error logging saved recipe ${recipeId}:`, logError);
            return { status: 'error', message: `Database error logging recipe: ${logError.message}` };
        }

        console.log(`Successfully logged saved recipe '${recipeName}' (ID: ${recipeId})`);
        // Return minimal success data; OpenAI will craft the user message
        return { status: 'success', logged_recipe_name: recipeData.recipe_name };
    } catch (error) {
        console.error(`Unexpected error in executeLogExistingSavedRecipe for recipe ID ${recipeId}:`, error);
        return { status: 'error', message: `Unexpected error processing saved recipe: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/** Gets nutrition data for a generic food item using OpenAI (Tool: logGenericFoodItem) */
async function executeLogGenericFoodItem(foodDescription: string, userId: string, supabaseClient: SupabaseClient, openai: OpenAI): Promise<ToolResult> {
    console.log(`Executing tool: logGenericFoodItem for description '${foodDescription}' by user ${userId}`);
    if (!foodDescription) {
        return { status: 'error', message: 'Food description is required.', response_type: 'error_parsing_args' };
    }
    try {
        // Call fetchNutritionData (which internally calls OpenAI)
        const nutritionResult = await fetchNutritionData(foodDescription, openai);
        if (nutritionResult.status === 'error' || !nutritionResult.data) {
            console.error("Error fetching nutrition data from helper:", nutritionResult.message);
            // Return a more user-friendly message if possible
            return { status: 'error', message: nutritionResult.message || "Couldn't analyze the food item.", response_type: 'error_nutrition_api' };
        }

        const nutritionData = nutritionResult.data;

        // Prepare log entry, including new nutrients
        const logEntry = {
            user_id: userId,
            food_name: nutritionData.food_name || foodDescription, // Use name from analysis if available
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
            // ADDED NEW NUTRIENTS
            omega_3_g: nutritionData.omega_3_g ?? null, // Default to null if not returned
            omega_6_g: nutritionData.omega_6_g ?? null,
            fiber_soluble_g: nutritionData.fiber_soluble_g ?? null,
            // Add other nutrients if they are being returned by fetchNutritionData
            source: 'manual', // Always set a non-null source for generic food logs
        };

        // Insert into food_log
        const { data: insertedData, error: insertError } = await supabaseClient
            .from('food_log')
            .insert([logEntry])
            .select();

        if (insertError) {
            console.error("Error inserting generic food log:", insertError);
            return { status: 'error', message: `Database error logging item: ${insertError.message}`, response_type: 'error_db_insert' };
        }

        console.log("Logged generic food item:", insertedData);
        return { status: 'success', message: `Logged: ${logEntry.food_name}.`, response_type: 'log_success' };

    } catch (error) {
        console.error("Unexpected error in executeLogGenericFoodItem:", error);
        return { status: 'error', message: `Unexpected error logging item: ${error.message}`, response_type: 'error_unexpected' };
    }
}

/** Stores the conversation turn in the database */
async function storeConversation(userId: string, userMessage: string | null, aiResponse: any, supabaseClient: SupabaseClient) {
    // Define types that should NOT be stored as final turns
    const intermediateResponseTypes = ['recipe_analysis_prompt', 'saved_recipe_confirmation_prompt', 'clarification_needed_recipe', 'prompting_for_saved_name', 'saved_recipe_proactive_confirm', 'saved_recipe_proactive_multiple'];

    const isFinalResponseType = aiResponse?.response_type && !intermediateResponseTypes.includes(aiResponse.response_type);

    // Skip storage if conditions aren't met
    if (!userMessage || !aiResponse?.message || aiResponse.status !== 'success' || !isFinalResponseType) {
        console.log(`Skipping conversation storage (No user msg: ${!userMessage}, No AI msg: ${!aiResponse?.message}, AI Status: ${aiResponse?.status}, Response Type: ${aiResponse.response_type})`);
        return;
    }
    console.log("Storing final conversation turn.");
    try {
        const timestamp = new Date().toISOString();
        const inserts = [
            { user_id: userId, message: userMessage, sender: 'user', created_at: timestamp },
            {
                user_id: userId,
                message: aiResponse.message,
                sender: 'ai',
                // Ensure response_metadata exists, default to null if response_type is missing
                response_metadata: { response_type: aiResponse.response_type || null },
                created_at: timestamp
            }
        ];
        // Ensure table name 'conversations' is correct
        const { error } = await supabaseClient.from('conversations').insert(inserts);
        if (error) {
            // --- MODIFIED ERROR LOGGING ---
            console.error("DB Error storing conversation turn (Full Error Object):", JSON.stringify(error, null, 2));
            // console.error("DB Error storing conversation turn:", error.message); // <-- Original line
        } else {
            console.log("Conversation turn stored successfully.");
        }
    } catch (dbError) {
        // Log the caught exception as well
        console.error("Exception during conversation storage:", JSON.stringify(dbError, null, 2));
    }
}

/** Finds saved recipes by name (Tool: findSavedRecipeByName) */
async function executeFindSavedRecipeByName(query: string, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Executing tool: findSavedRecipeByName for query '${query}' for user ${userId}`);
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
        return { status: 'error', message: 'Recipe name cannot be empty.', found: false };
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
            throw new Error(`Database error during recipe search: ${fetchError.message}`);
        } else {
            console.log(`Query successful. Found ${matches?.length ?? 0} recipes matching '${trimmedQuery}'.`);
        }

        if (!matches || matches.length === 0) {
            console.log(`No saved recipes found matching '${trimmedQuery}'.`);
            return { status: 'success', found: false, matches: [] };
        }

        console.log(`Found ${matches.length} recipe(s) matching '${trimmedQuery}'.`);
        return {
            status: 'success',
            found: true,
            count: matches.length,
            matches: matches // Now includes {id, recipe_name, description}
        };

    } catch (error) {
        console.error(`Error in executeFindSavedRecipeByName for query '${trimmedQuery}':`, error);
        return { status: 'error', message: `Sorry, I couldn't search your recipes right now. ${error instanceof Error ? error.message : String(error)}` };
    }
}

/** Analyzes recipe ingredients using OpenAI (Tool: analyzeRecipeIngredients) */
async function executeAnalyzeRecipeIngredients(recipeName: string, ingredientsList: string, userId: string, supabaseClient: SupabaseClient, openai: OpenAI): Promise<ToolResult> {
    console.log(`Executing tool: analyzeRecipeIngredients for '${recipeName}' by user ${userId}`);
    if (!recipeName || !ingredientsList) {
        return { status: 'error', message: 'Recipe name and ingredients list are required.', response_type: 'error_parsing_args' };
    }
    try {
        // Use OpenAI Function Calling for structured analysis
        const analysisPrompt = `Analyze the following recipe ingredients list and estimate the total nutritional content for the *entire recipe*. Provide the total amounts for calories, protein (g), total fat (g), saturated fat (g), carbohydrates (g), fiber (g), soluble fiber (g), sugars (g), sodium (mg), cholesterol (mg), potassium (mg), omega-3 (g), and omega-6 (g). Recipe Name: ${recipeName}. Ingredients: ${ingredientsList}`;

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
                            fiber_soluble_g: { type: "number", description: "Total estimated soluble fiber (g)" }, // Added
                            sugar_g: { type: "number", description: "Total estimated sugars (g)" },
                            sodium_mg: { type: "number", description: "Total estimated sodium (mg)" },
                            cholesterol_mg: { type: "number", description: "Total estimated cholesterol (mg)" },
                            potassium_mg: { type: "number", description: "Total estimated potassium (mg)" },
                            omega_3_g: { type: "number", description: "Total estimated Omega-3 fatty acids (g)" }, // Added
                            omega_6_g: { type: "number", description: "Total estimated Omega-6 fatty acids (g)" }, // Added
                            // Add others if needed
                        },
                        // required: [...] // Define required fields if necessary
                    }
                }
            }],
            tool_choice: { type: "function", function: { name: "recordRecipeAnalysis" } }
        });

        const analysisChoice = analysisCompletion.choices[0];
        const functionCall = analysisChoice?.message?.tool_calls?.[0]?.function;

        if (!functionCall || !functionCall.arguments) {
            console.error("OpenAI did not return expected function call for recipe analysis:", analysisCompletion);
            return { status: 'error', message: "Could not analyze recipe nutrition. OpenAI response format error.", response_type: 'error_openai_format' };
        }

        let analysisData: Record<string, any> = {};
        try {
            analysisData = JSON.parse(functionCall.arguments);
            analysisData.recipe_name = recipeName; // Add recipe name back
            analysisData.ingredients = ingredientsList; // Add ingredients for potential saving
            analysisData.user_id = userId; // Add user_id

             // Extract new nutrients, defaulting to null
             analysisData.omega_3_g = analysisData.omega_3_g ?? null;
             analysisData.omega_6_g = analysisData.omega_6_g ?? null;
             analysisData.fiber_soluble_g = analysisData.fiber_soluble_g ?? null;

        } catch (parseError) {
            console.error("Error parsing recipe analysis arguments:", parseError, functionCall.arguments);
            return { status: 'error', message: "Could not parse recipe analysis results.", response_type: 'error_parsing_analysis' };
        }

        // Filter based on user goals before presenting for confirmation
        const filteredAnalysis = await filterNutritionDataForUserGoals(analysisData, userId, supabaseClient);

        console.log("Recipe analysis successful:", analysisData); // Log full analysis

        // Return analysis data to present to user for confirmation (Save/Log/Cancel)
        return {
            status: 'success',
            message: `Here is the estimated nutrition for '${recipeName}'. What would you like to do?`,
            analysis: filteredAnalysis, // Send filtered data for display
            full_analysis: analysisData, // Send full data for saving/logging
            response_type: 'recipe_analysis_prompt',
            pending_action: { type: 'confirm_recipe_log', analysis: analysisData } // Store full analysis for next step
        };

    } catch (error) {
        console.error("Unexpected error in executeAnalyzeRecipeIngredients:", error);
        return { status: 'error', message: `Unexpected error analyzing recipe: ${error.message}`, response_type: 'error_unexpected' };
    }
}

/** Answers a general question (Tool: answerGeneralQuestion) */
async function executeAnswerGeneralQuestion(question: string, userId: string, supabaseClient: SupabaseClient, openai: OpenAI): Promise<ToolResult> {
    console.log(`Executing tool: answerGeneralQuestion for user ${userId}. Question: "${question}"`);
    const cleanedQuestion = (question || '').trim();

    if (!cleanedQuestion) {
        return { status: 'error', message: 'Question cannot be empty.' };
    }

    try {
        // 1. (Optional) Fetch context - e.g., User Goals
        let contextMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        try {
            const { data: goals, error: goalsError } = await supabaseClient
                .from('user_goals')
                .select('nutrient, target_value, unit')
                .eq('user_id', userId);

            if (goalsError) {
                console.warn("Could not fetch user goals for context:", goalsError.message);
            } else if (goals && goals.length > 0) {
                const goalSummary = goals.map(g => `${g.nutrient}: ${g.target_value}${g.unit || ''}`).join(', ');
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
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: AI_PERSONA },
            ...contextMessages, // Add context if fetched
            { role: "user", content: cleanedQuestion }
        ];

        // 3. Call OpenAI for a direct answer (no tools needed here)
        console.log("Calling OpenAI for general question answer...");
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Good balance of cost and capability
            messages: messages,
            temperature: 0.7, // Allow more conversational creativity
            // No 'tools' or 'tool_choice' specified
        });

        const answerContent = response.choices[0].message?.content || "Sorry, I couldn't formulate a response to that question.";
        console.log("Received answer from OpenAI.");

        return { status: 'success', answer: answerContent };

    } catch (error) {
        console.error(`Error in executeAnswerGeneralQuestion for question "${cleanedQuestion}":`, error);
        return { status: 'error', message: `Sorry, I encountered an error trying to answer your question. ${error instanceof Error ? error.message : String(error)}` };
    }
}

/** Saves analysis data to user_recipes and logs it (Helper for recipe analysis flow) */
async function saveAndLogRecipe(analysisData: any, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Executing helper: saveAndLogRecipe for recipe '${analysisData?.recipe_name}' by user ${userId}`);
    if (!analysisData || !userId) {
        return { status: 'error', message: 'Missing analysis data or user ID for save/log.', response_type: 'error_internal_state' };
    }
    try {
        // 1. Prepare data for user_recipes (ensure all needed columns are included)
        const recipeRecord = {
            user_id: userId,
            recipe_name: analysisData.recipe_name,
            description: analysisData.description || null, // Assuming description might exist
            ingredients: analysisData.ingredients || null,
            calories: analysisData.calories,
            protein_g: analysisData.protein_g,
            fat_total_g: analysisData.fat_total_g,
            carbs_g: analysisData.carbs_g,
            fiber_g: analysisData.fiber_g,
            sugar_g: analysisData.sugar_g,
            sodium_mg: analysisData.sodium_mg,
            cholesterol_mg: analysisData.cholesterol_mg,
            fat_saturated_g: analysisData.fat_saturated_g,
            potassium_mg: analysisData.potassium_mg,
            // ADDED NEW NUTRIENTS
            omega_3_g: analysisData.omega_3_g ?? null,
            omega_6_g: analysisData.omega_6_g ?? null,
            fiber_soluble_g: analysisData.fiber_soluble_g ?? null,
            // Add others if needed in user_recipes table
        };

        // 2. Upsert into user_recipes
        const { data: recipeUpsertData, error: recipeUpsertError } = await supabaseClient
            .from('user_recipes')
            .upsert(recipeRecord, { onConflict: 'user_id, recipe_name' }) // Upsert based on user and name
            .select('id') // Select the ID after upsert
            .single();

        if (recipeUpsertError) {
            console.error("Error upserting recipe:", recipeUpsertError);
            throw new Error(`Failed to save recipe details: ${recipeUpsertError.message}`);
        }
        if (!recipeUpsertData || !recipeUpsertData.id) {
            console.error("Recipe upsert did not return an ID.", recipeUpsertData);
            throw new Error("Failed to get recipe ID after saving.");
        }
        const savedRecipeId = recipeUpsertData.id;
        console.log(`Recipe saved/updated successfully with ID: ${savedRecipeId}`);

        // 3. Prepare data for food_log (reference saved recipe ID)
        const logEntry = { ...recipeRecord, recipe_id: savedRecipeId, source: 'analyzed_recipe' }; // Include recipe_id and source
        delete logEntry.description; // Remove fields not in food_log
        delete logEntry.ingredients;

        // 4. Insert into food_log
        const { data: logInsertData, error: logInsertError } = await supabaseClient
            .from('food_log')
            .insert([logEntry]) // Pass logEntry wrapped in an array
            .select();

        if (logInsertError) {
            console.error("Error inserting recipe log:", logInsertError);
            // Note: Recipe was saved, but logging failed. Inform user.
            return { status: 'error', message: `Recipe '${recipeRecord.recipe_name}' saved, but failed to log: ${logInsertError.message}. You can log it later from Saved Recipes.`, response_type: 'error_db_insert_partial' };
        }

        console.log("Recipe logged successfully:", logInsertData);
        return { status: 'success', message: `Recipe '${recipeRecord.recipe_name}' saved and logged successfully!`, response_type: 'save_log_success' };

    } catch (error) {
        console.error("Unexpected error in saveAndLogRecipe:", error);
        return { status: 'error', message: `Error saving/logging recipe: ${error.message}`, response_type: 'error_unexpected' };
    }
}

/** Logs analyzed recipe data without saving to user_recipes (Helper for recipe analysis flow) */
async function logOnlyAnalyzedRecipe(analysisData: any, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Executing helper: logOnlyAnalyzedRecipe for recipe '${analysisData?.recipe_name}' by user ${userId}`);
     if (!analysisData || !userId) {
        return { status: 'error', message: 'Missing analysis data or user ID for logging.', response_type: 'error_internal_state' };
    }
    try {
        // Prepare data for food_log (directly from analysis)
         const logEntry = {
            user_id: userId,
            food_name: analysisData.recipe_name || 'Analyzed Recipe',
            calories: analysisData.calories,
            protein_g: analysisData.protein_g,
            fat_total_g: analysisData.fat_total_g,
            carbs_g: analysisData.carbs_g,
            fiber_g: analysisData.fiber_g,
            sugar_g: analysisData.sugar_g,
            sodium_mg: analysisData.sodium_mg,
            cholesterol_mg: analysisData.cholesterol_mg,
            fat_saturated_g: analysisData.fat_saturated_g,
            potassium_mg: analysisData.potassium_mg,
            // ADDED NEW NUTRIENTS
            omega_3_g: analysisData.omega_3_g ?? null,
            omega_6_g: analysisData.omega_6_g ?? null,
            fiber_soluble_g: analysisData.fiber_soluble_g ?? null,
            // Add others as needed
            // Do NOT include recipe_id as it wasn't saved
            source: 'analyzed_recipe', // Always set a non-null source for analyzed recipe logs
        };

        // Insert into food_log
        const { data: logInsertData, error: logInsertError } = await supabaseClient
            .from('food_log')
            .insert([logEntry])
            .select();

        if (logInsertError) {
            console.error("Error inserting analyzed recipe log:", logInsertError);
            throw new Error(`Failed to log analyzed recipe: ${logInsertError.message}`);
        }

        console.log("Analyzed recipe logged successfully:", logInsertData);
        return { status: 'success', message: `Logged '${logEntry.food_name}' successfully!`, response_type: 'log_only_success' };

    } catch (error) {
        console.error("Unexpected error in logOnlyAnalyzedRecipe:", error);
        return { status: 'error', message: `Error logging analyzed recipe: ${error.message}`, response_type: 'error_unexpected' };
    }
}

/** Fetches nutrition data using OpenAI function calling */
async function fetchNutritionData(query: string, openai: OpenAI): Promise<ToolResult & { data?: Record<string, any> }> {
    console.log(`Fetching nutrition data for query: "${query}"`);
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Or your preferred model
            messages: [
                { role: "system", content: "You are a nutrition data extraction assistant." },
                { role: "user", content: `Provide estimated nutritional information for: ${query}` }
            ],
            tools: [{
                type: "function",
                function: {
                    name: "recordNutritionData",
                    description: "Records the estimated nutritional information for a food item.",
                    parameters: {
                        type: "object",
                        properties: {
                            food_name: { type: "string", description: "The identified food name." },
                            calories: { type: "number", description: "Estimated calories (kcal)" },
                            protein_g: { type: "number", description: "Estimated protein (g)" },
                            fat_total_g: { type: "number", description: "Estimated total fat (g)" },
                            fat_saturated_g: { type: "number", description: "Estimated saturated fat (g)" },
                            carbs_g: { type: "number", description: "Estimated carbohydrates (g)" },
                            fiber_g: { type: "number", description: "Estimated dietary fiber (g)" },
                            fiber_soluble_g: { type: "number", description: "Estimated soluble fiber (g)" }, // Added
                            sugar_g: { type: "number", description: "Estimated sugars (g)" },
                            sodium_mg: { type: "number", description: "Estimated sodium (mg)" },
                            cholesterol_mg: { type: "number", description: "Estimated cholesterol (mg)" },
                            potassium_mg: { type: "number", description: "Estimated potassium (mg)" },
                            omega_3_g: { type: "number", description: "Estimated Omega-3 fatty acids (g)" }, // Added
                            omega_6_g: { type: "number", description: "Estimated Omega-6 fatty acids (g)" }, // Added
                            // Add other relevant MASTER_NUTRIENT_KEYS here if needed
                        },
                        // required: [...] // Define required fields if necessary
                    }
                }
            }],
            tool_choice: { type: "function", function: { name: "recordNutritionData" } }
        });

        const choice = completion.choices[0];
        const functionCall = choice?.message?.tool_calls?.[0]?.function;

        if (!functionCall || !functionCall.arguments) {
            console.error("OpenAI did not return expected function call for nutrition data:", completion);
            return { status: 'error', message: "Could not get nutrition data. OpenAI response format error." };
        }

        try {
            const nutritionData = JSON.parse(functionCall.arguments);
            // Extract new nutrients, defaulting to null
            nutritionData.omega_3_g = nutritionData.omega_3_g ?? null;
            nutritionData.omega_6_g = nutritionData.omega_6_g ?? null;
            nutritionData.fiber_soluble_g = nutritionData.fiber_soluble_g ?? null;

            console.log("Parsed nutrition data:", nutritionData);
            return { status: 'success', data: nutritionData };
        } catch (parseError) {
            console.error("Error parsing nutrition data arguments:", parseError, functionCall.arguments);
            return { status: 'error', message: "Could not parse nutrition data results." };
        }

    } catch (error) {
        console.error(`Error fetching nutrition data from OpenAI for query "${query}":`, error);
        return { status: 'error', message: `OpenAI API error: ${error.message}` };
    }
}

// --- End Helper Functions & Tool Execution ---

// --- Frontend Guidance Comments ---
/*
Response Structure:
{
  status: 'success' | 'error',
  message: string,                  // The primary text to display to the user in the chat.
  response_type: string,            // Helps the frontend decide UI actions (see list below).
  pending_action?: { ... },         // Included when AI needs user confirmation.
  context_for_reply?: { ... }       // Included for saved recipe confirmation prompt.
}

Possible `response_type` values:
- item_logged: Generic item logged successfully.
- saved_recipe_found_multiple: Multiple saved recipes found, asking user to clarify.
- saved_recipe_confirmation_prompt: Exactly one saved recipe found, asking user to confirm logging. (Includes `context_for_reply: { recipe_id, recipe_name }`)
- saved_recipe_logged: User confirmed logging a found saved recipe.
- recipe_analysis_prompt: Recipe analyzed, asking user to Save&Log/LogOnly/Cancel. (Includes `pending_action: { type: 'log_analyzed_recipe', analysis: {...} }`)
- recipe_saved_logged: User confirmed Save&Log for analyzed recipe.
- recipe_logged_only: User confirmed LogOnly for analyzed recipe.
- answer_provided: AI answered a general question.
- clarification_needed_recipe: AI needs user to clarify if a dish is homemade/standard. (Includes `context_for_reply: { awaiting_clarification_for: dish_name }`)
- clarification_needed: General AI request for more information.
- action_cancelled: User cancelled a multi-step action.
- error_database, error_openai, error_tool_execution, error_unknown, error_parsing_args, error_auth, error_config, error_request: Various error types.

Client Handling:
- `saved_recipe_confirmation_prompt`: Show `message`. Provide button/action to send next request with `action: 'confirm_log_saved_recipe'` and the received `context_for_reply` data included in the *new* request's `context` field.
- `recipe_analysis_prompt`: Show `message`. Provide buttons/actions for 'Save & Log', 'Log Only', 'Cancel'. Send user choice as next `message`, including the original `pending_action` object in the *new* request's `context.pending_action` field.
- `clarification_needed_recipe`: Show `message`. User response will be sent as the next `message`. Include the received `context_for_reply` in the *new* request's `context` field to give OpenAI context about what was being clarified.
- Other success types: Display `message`.
- Error types: Display `message` as an error.
*/
// --- End Frontend Guidance ---

// =================================================================
// --- Main Request Handler ---
// =================================================================
Deno.serve(async (req: Request) => {
  // console.log("Minimal Deno.serve handler invoked"); // Log entry

  // --- Bypassing all original logic for debugging ---

  // /* // <-- Keep outer comment block start

  // --- Initialize outside try block ---
  let userId: string;
  let supabaseClient: SupabaseClient;
  let responseData: any = null;
  let userMessageForStorage: string | null = null;
  let requestHandled = false;
  const MAX_HISTORY_MESSAGES = 8;

  try { // <-- START of main try block
    // -----------------------------------------------------------------
    // --- 1. Initialization & Request Parsing ---
    // -----------------------------------------------------------------
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    // --- Authorization Header Check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

    // --- Initialize Supabase Client ---
    // (Error handling included)
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase ENV variables');
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    } catch (error) {
        console.error('Critical Error: Initializing Supabase client failed:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Server configuration issue.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- Verify User Authentication ---
    // (Error handling included)
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('User not found for the provided token.');
        userId = user.id;
        console.log(`Authenticated user: ${userId}`);
    } catch (error) {
        console.error('Authentication error:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Authentication failed.' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Parse Request Body ---
    // (Error handling included)
    let message: string | undefined;
    let context: any; // Now used for direct action context & pending_action container
    let action: string | undefined; // Legacy action / Direct action trigger
    let conversation_history: any[] = []; // Optional from client
    let pending_action: any = null; // Specifically for multi-turn actions like recipe confirm

    try {
        const requestData = await req.json();
        message = requestData?.message; // The primary user input for V2
        action = requestData?.action; // Kept for bridge compatibility/direct actions
        context = requestData?.context; // Container for pending_action or direct action data
        conversation_history = Array.isArray(requestData?.conversation_history) ? requestData.conversation_history : [];
        // Extract pending_action from the context if present
        pending_action = context?.pending_action;

        userMessageForStorage = message ?? action ?? 'No message/action provided'; // Store user input for logging

        // Pass previous clarification context along if present
        const previousContext = context?.awaiting_clarification_for ? ` (User was asked to clarify: ${context.awaiting_clarification_for})` : '';
        if (!message && typeof action !== 'string' && !pending_action) {
             throw new Error('Request must include a message, action, or pending_action.');
        }
        console.log(`Request received - Message: "${message}", Action: ${action}, Pending Action Type: ${pending_action?.type}, Previous Context: ${previousContext}`);

    } catch (error) {
        console.error('Error parsing request body:', error);
        return new Response( JSON.stringify({ status: 'error', message: `Invalid request: ${error.message}`, response_type: 'error_request' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- Initialize OpenAI Client ---
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
        console.error("Critical Error: OPENAI_API_KEY missing");
        return new Response( JSON.stringify({ status: 'error', message: 'AI service configuration error.', response_type: 'error_config' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // -----------------------------------------------------------------
    // --- 2. Handle Pre-OpenAI Actions (Confirmations, Direct Actions) ---
    // -----------------------------------------------------------------

    // --- Handle Expected Saved Recipe Name ---
    if (context?.expecting_saved_recipe_name && message) {
        console.log("Handling expected saved recipe name: Searching for", message);
        const toolResult = await executeFindSavedRecipeByName(message, userId, supabaseClient);

        // Handle results of findSavedRecipeByName
        if (toolResult.status === 'success') {
            if (toolResult.count === 1) {
                // Single recipe found: Ask for confirmation
                const matchedRecipe = toolResult.matches[0];
                responseData = {
                    status: 'success',
                    message: `I found your saved recipe '${matchedRecipe.recipe_name}'. Should I log it for you?`,
                    response_type: 'saved_recipe_confirmation_prompt',
                    context_for_reply: {
                        recipe_id: matchedRecipe.id,
                        recipe_name: matchedRecipe.recipe_name
                    }
                };
            } else if (toolResult.count > 1) {
                // Multiple recipes found: Ask user to clarify
                const recipeNames = toolResult.matches.map((r: any) => r.recipe_name).join(", ");
                responseData = {
                    status: 'success',
                    message: `I found a few saved recipes matching that: ${recipeNames}. Which one did you mean?`,
                    response_type: 'saved_recipe_found_multiple'
                };
            } else {
                // No recipes found
                responseData = {
                    status: 'success', // Still success, but informing user
                    message: `I couldn't find a saved recipe named "${message}". You can list ingredients to log it, or try searching again.`,
                    response_type: 'saved_recipe_not_found'
                };
            }
        } else {
            // Error during search
            responseData = {
                status: 'error',
                message: toolResult.message || "Sorry, I couldn't search your saved recipes right now.",
                response_type: 'error_tool_execution'
            };
        }
        requestHandled = true;
    }

    // --- Handle Pending Recipe Confirmation ---
    else if (pending_action?.type === 'log_analyzed_recipe' && pending_action.analysis && message) {
        console.log("Handling pending action: log_analyzed_recipe");
        const userResponse = message.toLowerCase();
        if (/(save and log|save it|yes|confirm|sounds good|do it)/i.test(userResponse)) {
            console.log("User confirmed SAVE and log.");
            responseData = await saveAndLogRecipe(pending_action.analysis, userId, supabaseClient);
            // Set specific response type on success/error within the helper or here
            if (responseData.status === 'success') responseData.response_type = 'recipe_saved_logged';
            else responseData.response_type = responseData.response_type || 'error_database'; // Default error type
        } else if (/(just log|log only|don't save|only log)/i.test(userResponse)) {
            console.log("User confirmed LOG ONLY.");
            responseData = await logOnlyAnalyzedRecipe(pending_action.analysis, userId, supabaseClient);
            if (responseData.status === 'success') responseData.response_type = 'recipe_logged_only';
            else responseData.response_type = responseData.response_type || 'error_database';
        } else { // Assume cancellation or unclear response
            console.log("User cancelled or gave unclear response.");
            responseData = { status: 'success', message: "Okay, cancelling that. What else can I help with?", response_type: 'action_cancelled' };
        }
        requestHandled = true; // Mark as handled, skip OpenAI calls
    }

    // --- Handle Direct Action: Confirm Log Saved Recipe (From saved_recipe_confirmation_prompt) ---
    else if (!requestHandled && action === 'confirm_log_saved_recipe' && context?.recipe_id && context?.recipe_name) {
        console.log(`Handling direct action: confirm_log_saved_recipe ID: ${context.recipe_id}`);
        const toolResult = await executeLogExistingSavedRecipe(context.recipe_id, context.recipe_name, userId, supabaseClient);
        // Convert tool result object into a final responseData object
        if (toolResult.status === 'success') {
            responseData = {
                status: 'success',
                message: `Okay, logged your saved recipe '${toolResult.logged_recipe_name}'.`, // Follow-up added by OpenAI persona instruction now
                response_type: 'saved_recipe_logged' // Specific type for FE
            };
                        } else {
            responseData = {
                status: 'error',
                message: toolResult.message || 'Sorry, could not log that saved recipe.',
                response_type: 'error_tool_execution' // More specific error
            };
        }
        requestHandled = true;
    }
    // --- Add other 'else if (action === ...)' blocks here for legacy actions if needed ---

    // -----------------------------------------------------------------
    // --- 3. Main OpenAI Tool Calling Flow ---
    // -----------------------------------------------------------------
    if (!requestHandled && message) { 
        console.log("Starting main OpenAI tool calling flow.");
        // --- Prepare messages array ---
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: AI_PERSONA },
        ];

        // Append conversation history (limited)
        const historyToAppend = conversation_history.slice(-MAX_HISTORY_MESSAGES);
        historyToAppend.forEach(msg => {
            if (msg.sender === 'user' && msg.text) {
                messages.push({ role: 'user', content: msg.text });
            } else if (msg.sender === 'ai' && msg.text) {
                // Map 'ai' to 'assistant'. Ignore tool calls in history for simplicity now.
                messages.push({ role: 'assistant', content: msg.text });
            }
        });

        // Add context if clarifying a previous dish
        if (context?.awaiting_clarification_for) {
            messages.push({ role: 'system', content: `Context: The user is responding to a request to clarify the dish "${context.awaiting_clarification_for}".` });
        }

        // Append current user message
        messages.push({ role: "user", content: message });

        // --- Check for specific clarification response ("It's saved") ---
        const savedRecipeKeywords = /saved|recipe we saved|already saved|i saved it/i; // Regex to detect 'saved' intent
        if (context?.awaiting_clarification_for && message && savedRecipeKeywords.test(message)) {
            console.log("Detected user wants to log a saved recipe after clarification. Asking for name.");
            responseData = {
                status: 'success',
                message: `Great! Can you let me know the name or description of the saved recipe for "${context.awaiting_clarification_for}"? I can help you log it!`,
                response_type: 'prompting_for_saved_name', // New response type
                context_for_reply: {
                    expecting_saved_recipe_name: true,
                    original_dish: context.awaiting_clarification_for // Keep original dish context
                }
            };
            requestHandled = true; // Mark as handled to skip OpenAI call below
        }
        // --- End Check ---

        // --- Proceed with OpenAI ONLY if not handled above ---
        if (!requestHandled) {
          console.log("Entering main OpenAI processing block.");
          try {
              // --- First OpenAI Call (Intent/Tool Detection) ---
              console.log("Making first OpenAI call with tools...");
              const response = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: messages,
                  tools: availableTools,
                  tool_choice: "auto",
              });

              const responseMessage = response.choices[0].message;
              messages.push(responseMessage);

              // --- Process Response: Check for Tool Calls ---
              if (responseMessage.tool_calls) {
                  console.log(`OpenAI requested tool call(s): ${responseMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);

                  // --- Proactive Saved Recipe Check for ClarifyDishType Intent ---
                  const clarifyToolCall = responseMessage.tool_calls.find(tc => tc.function.name === 'clarifyDishType');
                  if (clarifyToolCall) {
                      console.log("Intercepting clarifyDishType intent for proactive saved recipe search.");
                      let dishNameToSearch: string | undefined;
                      try {
                          const args = JSON.parse(clarifyToolCall.function.arguments);
                          dishNameToSearch = args.dish_name;
                      } catch (parseError) {
                          console.error("Failed to parse args for intercepted clarifyDishType:", parseError);
                      }

                      if (dishNameToSearch) {
                          const findResult = await executeFindSavedRecipeByName(dishNameToSearch, userId, supabaseClient);
                          if (findResult.status === 'success' && findResult.found) {
                              if (findResult.count === 1) {
                                  console.log("Proactive search found 1 match. Prompting confirmation.");
                                  const matchedRecipe = findResult.matches[0];
                                  responseData = {
                                      status: 'success',
                                      message: `I found a saved recipe called '${matchedRecipe.recipe_name}'. Is this the one you want to log?`,
                                      response_type: 'saved_recipe_proactive_confirm',
                                      context_for_reply: { 
                                          recipe_id: matchedRecipe.id, 
                                          recipe_name: matchedRecipe.recipe_name 
                                      }
                                  };
                                  requestHandled = true;
                              } else { // Multiple matches
                                  console.log(`Proactive search found ${findResult.count} matches. Prompting selection.`);
                                  const limitedMatches = findResult.matches.slice(0, 5);
                                  // --- Modify message generation to potentially include description --- 
                                  const recipeOptionsText = limitedMatches.map((r: any) => 
                                      r.description 
                                          ? `'${r.recipe_name}' (${r.description.substring(0, 30)}${r.description.length > 30 ? '...' : ''})` 
                                          : `'${r.recipe_name}'`
                                  ).join(", ");
                                  responseData = {
                                      status: 'success',
                                      // Updated message to show description snippets
                                      message: `I found a few saved recipes matching '${dishNameToSearch}': ${recipeOptionsText}. Which one did you mean, or is it something else?`,
                                      response_type: 'saved_recipe_proactive_multiple',
                                      // Ensure the full matches array (including description) is passed
                                      context_for_reply: { matches: limitedMatches } // Pass the full limitedMatches including description
                                  };
                                  requestHandled = true;
                              }
                          } else {
                             console.log(`Proactive search for '${dishNameToSearch}' found no matches or failed. Proceeding with normal flow (likely clarification).`);
                             // Do nothing here, let the normal tool loop handle clarifyDishType or subsequent steps
                          }
                      } else {
                           console.warn("Could not extract dish_name from intercepted clarifyDishType call.");
                      }
                  } // --- End Proactive Check ---

                  // --- Execute Tool Calls (if not handled by proactive check) ---
                  if (!requestHandled) {
                      const logResults: { success: string[]; failed: { food: string; reason: string }[] } = { success: [], failed: [] };
                      for (const toolCall of responseMessage.tool_calls) {
                          const functionName = toolCall.function.name;
                          let functionArgs: any;
                          try {
                              functionArgs = JSON.parse(toolCall.function.arguments);
                          } catch (parseError) {
                             // ... argument parsing error handling ...
                          }

                          let toolResult: ToolResult | null = null;
                          console.log(`Executing tool: ${functionName} with args:`, functionArgs);

                          // --- Handle ACTUAL clarifyDishType call (only if proactive search found nothing) ---
                          if (functionName === 'clarifyDishType') {
                              console.log(`Handling actual clarifyDishType call (proactive search found nothing).`);
                              responseData = {
                                  status: 'success',
                                  message: `Okay, for "${functionArgs.dish_name}", is that a recipe you made or a standard item? If you made it, please list the ingredients so I can analyze it accurately. Otherwise, tell me it's a standard item.`,
                                  response_type: 'clarification_needed_recipe',
                                  context_for_reply: { awaiting_clarification_for: functionArgs.dish_name }
                              };
                              requestHandled = true;
                          } else {
                              // --- Execute other tools --- 
                              switch (functionName) {
                                  case 'logGenericFoodItem':
                                      toolResult = await executeLogGenericFoodItem(functionArgs.food_description, userId, supabaseClient, openai);
                                      if (toolResult && toolResult.status === 'success') {
                                          logResults.success.push(functionArgs.food_description);
                                      } else {
                                          logResults.failed.push({ food: functionArgs.food_description, reason: toolResult?.message || 'Unknown error' });
                                      }
                                      break;
                                  case 'findSavedRecipeByName':
                                      toolResult = await executeFindSavedRecipeByName(functionArgs.query, userId, supabaseClient);
                                      break;
                                  case 'analyzeRecipeIngredients':
                                      toolResult = await executeAnalyzeRecipeIngredients(functionArgs.recipe_name, functionArgs.ingredients_list, userId, supabaseClient, openai);
                                      break;
                                  case 'logExistingSavedRecipe':
                                      toolResult = await executeLogExistingSavedRecipe(functionArgs.recipe_id, functionArgs.recipe_name, userId, supabaseClient);
                                      break;
                                  case 'answerGeneralQuestion':
                                      toolResult = await executeAnswerGeneralQuestion(functionArgs.question, userId, supabaseClient, openai);
                                      break;
                                  default:
                                      console.error(`Unknown tool called: ${functionName}`);
                                      toolResult = { status: 'error', message: `Internal error: Unknown tool requested (${functionName}).` };
                              }
                          }

                          // --- Handle specific tool results IF NOT CLARIFICATION ---
                          if (toolResult) { 
                              // --- START NEW HANDLING BLOCK for findSavedRecipeByName ---
                              if (!requestHandled && functionName === 'findSavedRecipeByName' && toolResult.status === 'success' && toolResult.found) {
                                  if (toolResult.count === 1) {
                                      console.log("Handling findSavedRecipeByName result: 1 match found.");
                                      const matchedRecipe = toolResult.matches[0];
                                      responseData = {
                                          status: 'success',
                                          message: `I found your saved recipe '${matchedRecipe.recipe_name}'. Should I log it for you?`,
                                          response_type: 'saved_recipe_confirmation_prompt',
                                          context_for_reply: {
                                              recipe_id: matchedRecipe.id,
                                              recipe_name: matchedRecipe.recipe_name
                                          }
                                      };
                                      requestHandled = true;
                                  } else { // Multiple matches
                                      console.log(`Handling findSavedRecipeByName result: ${toolResult.count} matches found.`);
                                      const limitedMatches = toolResult.matches.slice(0, 5);
                                      const recipeOptionsText = limitedMatches.map((r: any) => 
                                          r.description 
                                              ? `'${r.recipe_name}' (${r.description.substring(0, 30)}${r.description.length > 30 ? '...' : ''})` 
                                              : `'${r.recipe_name}'`
                                      ).join(", ");
                                      responseData = {
                                          status: 'success',
                                          message: `I found a few saved recipes matching that: ${recipeOptionsText}. Which one did you mean?`,
                                          response_type: 'saved_recipe_found_multiple',
                                          context_for_reply: { matches: limitedMatches }
                                      };
                                      requestHandled = true;
                                  }
                              }
                              // --- END NEW HANDLING BLOCK ---

                              // --- Special Handling for Analyze Recipe Result --- 
                              if (!requestHandled && functionName === 'analyzeRecipeIngredients' && toolResult.status === 'success' && toolResult.analysis) {
                                  console.log("AnalyzeRecipeIngredients succeeded. Preparing recipe analysis prompt.");
                                  responseData = {
                                      status: 'success',
                                      // Message summarizing analysis - AI will generate a better one in the confirmation step if saved/logged.
                                      message: `I've analyzed the ingredients for "${toolResult.analysis.recipe_name || 'your recipe'}". It has approximately ${toolResult.analysis.nutrition_estimate?.calories || 'N/A'} calories. Would you like to Save & Log this recipe, Log it Once, or Cancel?`,
                                      response_type: 'recipe_analysis_prompt',
                                      pending_action: { 
                                          type: 'log_analyzed_recipe',
                                          analysis: toolResult.analysis // Pass the full analysis data
                                      }
                                  };
                                  requestHandled = true; // Mark as handled to skip the second OpenAI call
                              }
                              // --- End Special Handling ---
                              
                              // --- Append general tool result for the second OpenAI call (only if not handled above) ---
                              if (!requestHandled) { // Only append if analyzeRecipeIngredients or findSavedRecipeByName didn't handle it
                                  const toolResultContent = JSON.stringify(toolResult);
                                  messages.push({
                                      tool_call_id: toolCall.id,
                                      role: "tool",
                                      content: toolResultContent,
                                  });
                              }
                          }
                      } // End of for loop through tool calls
                      // --- Aggregate log results for user feedback ---
                      if (logResults.success.length > 0 && logResults.failed.length === 0) {
                        responseData = {
                          status: 'success',
                          message: `Logged: ${logResults.success.join(' and ')}! Great job keeping track of your food today. Keep up the great work! Anything else today?`,
                          response_type: 'item_logged',
                        };
                        requestHandled = true;
                      } else if (logResults.success.length > 0 && logResults.failed.length > 0) {
                        responseData = {
                          status: 'success',
                          message: `Logged: ${logResults.success.join(' and ')}. Failed to log: ${logResults.failed.map(f => f.food + ' (' + f.reason + ')').join(', ')}.`,
                          response_type: 'item_logged',
                        };
                        requestHandled = true;
                      } else if (logResults.success.length === 0 && logResults.failed.length > 0) {
                        responseData = {
                          status: 'error',
                          message: `Failed to log: ${logResults.failed.map(f => f.food + ' (' + f.reason + ')').join(', ')}.`,
                          response_type: 'error_db_insert',
                        };
                        requestHandled = true;
                      }
                  }

                  // --- Second OpenAI Call (if not handled by confirmation/proactive prompts/analysis prompt) ---
                  if (!requestHandled) {
                     console.log("Making second OpenAI call with tool results...");
                     const finalApiResponse = await openai.chat.completions.create({
                         model: "gpt-4o-mini", // Or your preferred model
                         messages: messages, // messages array now includes tool results
                         temperature: 0.7,
                         // No tools needed here, just generating text
                     });
                     const finalResponseMessage = finalApiResponse.choices[0].message?.content;
                     console.log("Received final response from OpenAI after tool execution:", finalResponseMessage);

                     // --- Fix: Assign the result to responseData ---
                     // Determine response type based on the tool call(s) that were actually executed.
                     // We need the initial responseMessage object from the first OpenAI call to reliably know the tools.
                     // Let's find the successfully executed tool name (assuming one for now in this flow)
                     let successfulToolName = null;
                     if (messages.some(m => m.role === 'tool' && m.tool_call_id)) {
                       // Find the original tool call name linked to the result
                       const toolResultMessage = messages.find(m => m.role === 'tool');
                       if (toolResultMessage?.tool_call_id) {
                         const originalToolCall = responseMessage.tool_calls?.find(tc => tc.id === toolResultMessage.tool_call_id);
                         if (originalToolCall) {
                            successfulToolName = originalToolCall.function.name;
                         }
                       }
                     }
                     
                     let finalResponseType = 'generic_success'; // Default
                     if (successfulToolName === 'logGenericFoodItem') {
                         finalResponseType = 'item_logged';
                     } else if (successfulToolName === 'logExistingSavedRecipe') {
                         finalResponseType = 'saved_recipe_logged';
                     } else if (successfulToolName === 'answerGeneralQuestion') {
                         finalResponseType = 'answer_provided';
                     } 
                     
                     responseData = {
                         status: 'success',
                         message: finalResponseMessage || "Okay, action completed.", // Add a fallback
                         response_type: finalResponseType
                     };
                     console.log(`Assigned final responseData with type: ${finalResponseType}`);
                     // --- End Fix ---

                  } // --- End of Second OpenAI call block ---

                  // Ensure responseData is set if a confirmation path was taken earlier
                  if (!responseData && requestHandled) {
                     // ... safety check ...
                  }

              } else { // --- No tool calls requested ---
                  console.log("No tool calls requested by OpenAI. Using direct response.");
                  const directReply = responseMessage.content;
                  // Check if the direct reply is valid before assigning
                  if (directReply && typeof directReply === 'string' && directReply.trim().length > 0) {
                      responseData = {
                          status: 'success',
                          message: directReply, // Use the valid reply
                          // Heuristic for response_type based on question mark
                          response_type: message?.includes('?') || directReply.includes('?') ? 'answer_provided' : 'clarification_needed'
                      };
                      console.log("Assigned direct response:", responseData);
                  } else {
                     // Handle cases where content is null, empty, or not a string
                     console.error("OpenAI provided no usable content in direct response:", responseMessage);
                     responseData = {
                         status: 'error',
                         message: "Sorry, I couldn't generate a response for that.",
                         response_type: 'error_openai'
                     };
                  }
              }
          } catch (error) { // Catch errors during OpenAI calls or tool execution
               console.error("Error during OpenAI processing or tool execution:", error);
               responseData = { status: 'error', message: `Sorry, I encountered an issue processing that: ${error instanceof Error ? error.message : String(error)}`, response_type: 'error_openai' };
          }
        } // End inner if(!requestHandled)
    } else if (!requestHandled && !message) {
        // Handle cases where only an action or context was sent without a message
        console.warn("Request not handled and no message provided for OpenAI flow.");
        responseData = { status: 'error', message: 'Unclear request. Please provide a message.', response_type: 'error_request' };
    }

    // -----------------------------------------------------------------
    // --- 4. Final Response Formatting and Return ---
    // -----------------------------------------------------------------
    // Fallback if no responseData was generated
    if (!responseData) {
      console.error("Execution Error: Reached response stage without generating responseData.");
      responseData = { status: 'error', message: 'Internal server error: Could not process request.', response_type: 'error_unknown' };
    }

    // Ensure necessary fields exist in the final response object
    if (!responseData.status) responseData.status = 'error';
    if (!responseData.message) responseData.message = responseData.status === 'success' ? 'Okay.' : 'An unknown error occurred.';
    if (!responseData.response_type) responseData.response_type = responseData.status === 'error' ? 'error_unknown' : 'generic_success'; // Assign error type if status is error

    // Clear pending_action unless it was specifically set in *this* turn (recipe analysis prompt)
    if (responseData.response_type !== 'recipe_analysis_prompt') {
      responseData.pending_action = null;
    }

    // Ensure context_for_reply only exists for specific prompt types
    const allowedContextTypes = [
        'saved_recipe_confirmation_prompt', 
        'clarification_needed_recipe', 
        'prompting_for_saved_name', 
        'saved_recipe_proactive_confirm', 
        'saved_recipe_proactive_multiple'
    ];
    if (!allowedContextTypes.includes(responseData.response_type)) {
        console.log(`Cleaning context_for_reply for response_type: ${responseData.response_type}`);
        delete responseData.context_for_reply;
    }

    // --- Store Final Conversation Turn (Add null check) ---
    // --- Re-enable Conversation Storage ---
    const intermediateResponseTypes = ['recipe_analysis_prompt', 'saved_recipe_confirmation_prompt', 'clarification_needed_recipe', 'prompting_for_saved_name', 'saved_recipe_proactive_confirm', 'saved_recipe_proactive_multiple'];
    if (responseData && userMessageForStorage) {
        if (responseData.status === 'success' && !intermediateResponseTypes.includes(responseData.response_type)) {
            await storeConversation(userId, userMessageForStorage, responseData, supabaseClient);
        } else {
            console.log("Skipping conversation storage (intermediate step or error status).");
        }
    } else {
        console.log(`Skipping conversation storage (responseData is ${responseData ? 'present' : 'null'}, userMessageForStorage is ${userMessageForStorage ? 'present' : 'null'}).`);
    }
    // --- End Re-enable ---

    // --- Determine final HTTP status and Return Response ---
    const finalStatus = responseData.status === 'success' ? 200 : 500;

    // --- Add Log --- 
    console.log("DEBUG: Final responseData before stringify:", JSON.stringify(responseData, null, 2));
    // --- End Log --- 
    console.log(`Responding with status: ${finalStatus}, type: ${responseData.response_type}`);
    // Return using the final responseData object
    return new Response(
        JSON.stringify(responseData),
        { status: finalStatus, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (error) { // <-- Catch block for the main try
    console.error('--- Unhandled Top-Level Error ---:', error);
    // Ensure a response is always sent
    const errorResponse = { status: 'error', message: `Server error: ${error instanceof Error ? error.message : String(error)}`, response_type: 'error_unknown' }; // Generic server error
    return new Response(JSON.stringify(errorResponse), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } // End of the catch block
}); // End of Deno.serve call