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
const AI_PERSONA = "You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses. When completing a successful logging action or answering a question helpfully, end your response with a brief, encouraging, natural-sounding follow-up like 'Keep up the great work!' or 'Anything else today?'.";

// Define Master Nutrient Keys Directly
const MASTER_NUTRIENT_KEYS = [
  "calories", "water_g", "protein_g", "fat_total_g", "carbs_g",
  "fat_saturated_g", "fat_polyunsaturated_g", "fat_monounsaturated_g", "fat_trans_g",
  "fiber_g", "sugar_g", "sugar_added_g", "cholesterol_mg", "sodium_mg",
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
            description: "Logs a single, simple food item (e.g., 'an apple', 'coffee with milk', 'slice of cheese') or a pre-packaged/standard meal where ingredients aren't needed (e.g., 'McDonalds Big Mac', 'Amy's frozen burrito' IF specified like that). Use this ONLY when the item is clearly simple OR explicitly stated as standard/pre-packaged. **DO NOT use** for dishes that typically require multiple ingredients (like 'fried rice', 'soup', 'salad', 'pasta', 'smoothie', 'casserole') UNLESS the user provides specific context indicating it's standard/pre-made OR you are explicitly told to log it as a generic item after asking for clarification." ,
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

/** Estimates nutrition for a generic item and logs it (Tool: logGenericFoodItem) */
async function executeLogGenericFoodItem(foodDescription: string, userId: string, supabaseClient: SupabaseClient, openai: OpenAI): Promise<ToolResult> {
    console.log(`Executing tool: logGenericFoodItem for '${foodDescription}' for user ${userId}`);
    const cleanedFoodDescription = (foodDescription || "Food item").trim();
    if (!cleanedFoodDescription) {
         return { status: 'error', message: 'Food description cannot be empty.' };
    }

    try {
        // 1. Call OpenAI for nutrition estimate ONLY
        console.log(`Calling OpenAI for nutrition estimation of: "${cleanedFoodDescription}"`);
        // Simplified prompt focusing only on nutrition JSON based on description
        const foodPrompt = `Estimate nutritional content for "${cleanedFoodDescription}". Respond ONLY with JSON: { ${MASTER_NUTRIENT_KEYS.map(k => `"${k}": number|null`).join(", ")} }. Use null if unknown. No extra text.`;
        const foodResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use cheaper/faster model for estimation
            messages: [{ role: "system", content: foodPrompt }],
            temperature: 0.2, // Lower temperature for more deterministic nutrition estimates
            response_format: { type: "json_object" }
        });
        const foodResponseContent = foodResponse.choices[0].message?.content || '';
        console.log("Raw OpenAI nutrition response:", foodResponseContent);

        let parsedNutrition: Record<string, any> = {};
        try {
            parsedNutrition = JSON.parse(foodResponseContent);
        } catch (parseError) {
            console.error("Failed to parse JSON from OpenAI nutrition response:", foodResponseContent, parseError);
            throw new Error("AI response for nutrition was not valid JSON.");
        }

        // 2. Filter Nutrition Data
        const nutritionToLog = await filterNutritionDataForUserGoals(parsedNutrition, userId, supabaseClient);

        // 3. Prepare Log Entry - Use the cleaned foodDescription as the primary name
        const foodLogEntry = {
          user_id: userId,
          food_name: cleanedFoodDescription,
          timestamp: new Date().toISOString(),
          source: 'ai_tool_item',
          recipe_id: null,
          ...nutritionToLog,
        };

        // 4. Insert into food_log
        console.log(`Attempting to insert generic food log entry for: "${cleanedFoodDescription}"`);
        const { data: newLogEntry, error: logError } = await supabaseClient
          .from('food_log')
          .insert(foodLogEntry)
          .select('id') // Select only ID back
          .single();

        if (logError || !newLogEntry) {
          console.error("Supabase DB insert error or no data returned for generic item:", logError?.message);
          throw new Error(`DB Error: ${logError?.message || 'Failed to retrieve log ID after insert'}`);
        }

        console.log(`Generic food log entry inserted successfully. ID: ${newLogEntry.id}`);
        // Return success status and the original description logged
        return { status: 'success', logged_item_description: cleanedFoodDescription };

     } catch (error) {
          console.error(`Error in executeLogGenericFoodItem for "${cleanedFoodDescription}":`, error);
           // Return error status and message
           return { status: 'error', message: `Sorry, I had trouble logging '${cleanedFoodDescription}'. ${error instanceof Error ? error.message : String(error)}` };
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
        // Ensure table name 'chat_messages' is correct
        const { error } = await supabaseClient.from('chat_messages').insert(inserts);
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

/** Analyzes ingredients to estimate nutrition (Tool: analyzeRecipeIngredients) */
async function executeAnalyzeRecipeIngredients(recipeName: string, ingredientsList: string, userId: string, supabaseClient: SupabaseClient, openai: OpenAI): Promise<ToolResult> {
    console.log(`Executing tool: analyzeRecipeIngredients for recipe '${recipeName}' by user ${userId}`);
    const cleanedRecipeName = (recipeName || 'Custom Recipe').trim();
    const cleanedIngredients = (ingredientsList || '').trim();

    if (!cleanedIngredients) {
        return { status: 'error', message: 'Ingredients list cannot be empty for analysis.' };
    }

    try {
        // 1. Call OpenAI for nutrition estimate
        console.log(`Calling OpenAI for recipe analysis: "${cleanedRecipeName}", Ingredients: "${cleanedIngredients.substring(0, 100)}..."`); // Log truncated ingredients
        const nutrientPrompt = `User recipe name: "${cleanedRecipeName}", Ingredients: "${cleanedIngredients}". Estimate nutritional content. Respond ONLY with valid JSON format like this: {"recipe_name": "${cleanedRecipeName}", "description": "User provided ingredients: ${cleanedIngredients.substring(0, 50)}...", ${MASTER_NUTRIENT_KEYS.map(k => `"${k}": number|null`).join(", ")}}. Use null for unknown values. Ensure the output is strictly JSON, with no surrounding text or explanations.`;

        const nutrientResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use a capable model for analysis
            messages: [{ role: "system", content: nutrientPrompt }],
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const nutritionContent = nutrientResponse.choices[0].message?.content || '';
        console.log("Raw OpenAI recipe analysis response:", nutritionContent);

        let parsedNutrition: Record<string, any> = {};
        try {
            parsedNutrition = JSON.parse(nutritionContent);
        } catch (parseError) {
            console.error("Failed to parse JSON from OpenAI recipe analysis:", nutritionContent, parseError);
            throw new Error("AI response for recipe analysis was not valid JSON.");
        }

        // Ensure essential keys exist, even if null
        const finalNutritionEstimate: Record<string, any> = {};
        MASTER_NUTRIENT_KEYS.forEach(key => {
             finalNutritionEstimate[key] = parsedNutrition[key] === undefined || parsedNutrition[key] === null ? null : parsedNutrition[key];
        });

        // 2. Return success with analysis data, requiring confirmation
        const analysisResult = {
            recipe_name: parsedNutrition.recipe_name || cleanedRecipeName, // Prefer AI's interpreted name or fall back
            description: parsedNutrition.description || `Ingredients: ${cleanedIngredients.substring(0, 100)}...`, // Prefer AI description or fall back
            nutrition_estimate: finalNutritionEstimate // The processed nutrition object
        };

        console.log(`Recipe analysis successful for '${cleanedRecipeName}'. Ready for user confirmation.`);
        return {
            status: 'success',
            confirmation_needed: true, // Signal to OpenAI to ask user to save/log
            analysis: analysisResult
        };

    } catch (error) {
        console.error(`Error in executeAnalyzeRecipeIngredients for recipe '${cleanedRecipeName}':`, error);
        return { status: 'error', message: `Sorry, I couldn't analyze the recipe '${cleanedRecipeName}'. ${error instanceof Error ? error.message : String(error)}` };
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

/** Saves a newly analyzed recipe and logs it (Internal Helper) */
async function saveAndLogRecipe(analysisData: any, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Internal Helper: saveAndLogRecipe for '${analysisData?.recipe_name}' by user ${userId}`);
    if (!analysisData || !analysisData.recipe_name || !analysisData.nutrition_estimate) {
        console.error("SaveAndLog: Invalid analysisData provided.");
        return { status: 'error', message: 'Missing required recipe data for saving and logging.' };
    }

    const { recipe_name, description, nutrition_estimate } = analysisData;
    const cleanedRecipeName = recipe_name.trim();
    let newRecipeId: string | null = null;

    try {
        // 1. Save to user_recipes
        const recipeToSave: Record<string, any> = {
            user_id: userId,
            recipe_name: cleanedRecipeName,
            description: description || '', // Use provided description or empty string
        };
        // Add all nutrient keys from the estimate
        MASTER_NUTRIENT_KEYS.forEach(key => {
             recipeToSave[key] = nutrition_estimate[key] === undefined ? null : nutrition_estimate[key];
        });

        console.log(`Saving recipe '${cleanedRecipeName}' to user_recipes.`);
        const { data: savedRecipe, error: saveError } = await supabaseClient
            .from('user_recipes')
            .insert(recipeToSave)
            .select('id') // Select the ID of the newly inserted row
            .single();

        if (saveError || !savedRecipe?.id) {
            console.error(`DB Error saving recipe '${cleanedRecipeName}':`, saveError?.message);
            throw new Error(`Failed to save recipe to database: ${saveError?.message || 'No ID returned'}`);
        }
        newRecipeId = savedRecipe.id;
        console.log(`Recipe saved successfully. ID: ${newRecipeId}`);

        // 2. Filter nutrition for logging
        const nutritionToLog = await filterNutritionDataForUserGoals(nutrition_estimate, userId, supabaseClient);

        // 3. Log to food_log
        const foodLogEntry = {
            user_id: userId,
            food_name: cleanedRecipeName,
            timestamp: new Date().toISOString(),
            source: 'ai_tool_recipe_saved',
            recipe_id: newRecipeId,
            ...nutritionToLog,
        };

        console.log(`Logging saved recipe '${cleanedRecipeName}' (ID: ${newRecipeId}) to food_log.`);
        const { error: logError } = await supabaseClient.from('food_log').insert(foodLogEntry);

        if (logError) {
            console.error(`DB Error logging recipe '${cleanedRecipeName}' after saving:`, logError.message);
            // Consider if we should attempt to roll back the recipe save? For now, report failure.
            throw new Error(`Recipe saved (ID: ${newRecipeId}) but failed to log it: ${logError.message}`);
        }

        console.log(`Recipe '${cleanedRecipeName}' saved and logged successfully.`);
        return { status: 'success', message: `Okay, I've saved the recipe "${cleanedRecipeName}" and logged it for you.` };

    } catch (error) {
        console.error(`Error in saveAndLogRecipe for '${cleanedRecipeName}':`, error);
        // Provide a more specific error message if possible
        const errorMessage = newRecipeId
            ? `I managed to save the recipe "${cleanedRecipeName}" (ID: ${newRecipeId}), but couldn't log it. ${error instanceof Error ? error.message : String(error)}`
            : `Sorry, I couldn't save and log the recipe "${cleanedRecipeName}". ${error instanceof Error ? error.message : String(error)}`;
        return { status: 'error', message: errorMessage };
    }
}

/** Logs a newly analyzed recipe without saving it (Internal Helper) */
async function logOnlyAnalyzedRecipe(analysisData: any, userId: string, supabaseClient: SupabaseClient): Promise<ToolResult> {
    console.log(`Internal Helper: logOnlyAnalyzedRecipe for '${analysisData?.recipe_name}' by user ${userId}`);
     if (!analysisData || !analysisData.recipe_name || !analysisData.nutrition_estimate) {
        console.error("LogOnly: Invalid analysisData provided.");
        return { status: 'error', message: 'Missing required recipe data for logging.' };
    }

    const { recipe_name, nutrition_estimate } = analysisData;
    const cleanedRecipeName = recipe_name.trim();

    try {
        // 1. Filter nutrition for logging
        const nutritionToLog = await filterNutritionDataForUserGoals(nutrition_estimate, userId, supabaseClient);

        // 2. Prepare food_log entry
        const foodLogEntry = {
            user_id: userId,
            food_name: cleanedRecipeName,
            timestamp: new Date().toISOString(),
            source: 'ai_tool_recipe_logged',
            recipe_id: null,
            ...nutritionToLog,
        };

        // 3. Insert into food_log
        console.log(`Logging analyzed recipe '${cleanedRecipeName}' (not saved) to food_log.`);
        const { error: logError } = await supabaseClient.from('food_log').insert(foodLogEntry);

        if (logError) {
            console.error(`DB Error logging analyzed recipe '${cleanedRecipeName}':`, logError.message);
            throw new Error(`Failed to log recipe in database: ${logError.message}`);
        }

        console.log(`Analyzed recipe '${cleanedRecipeName}' logged successfully (without saving).`);
        return { status: 'success', message: `Okay, I've logged "${cleanedRecipeName}" for today without saving it to your recipes.` };

    } catch (error) {
        console.error(`Error in logOnlyAnalyzedRecipe for '${cleanedRecipeName}':`, error);
        return { status: 'error', message: `Sorry, I couldn't log the recipe "${cleanedRecipeName}". ${error instanceof Error ? error.message : String(error)}` };
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
                      for (const toolCall of responseMessage.tool_calls) {
                          // Skip clarifyDishType if it was already handled proactively (it shouldn't be if we got here, but check anyway)
                          if (toolCall.function.name === 'clarifyDishType' && clarifyToolCall) {
                              console.log("Skipping original clarifyDishType call as proactive search was done.");
                              continue; // Skip this tool call if proactive search was attempted
                          }

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
                              break; // Exit loop after handling clarification
                          } else {
                              // --- Execute other tools --- 
                              switch (functionName) {
                                  case 'logGenericFoodItem':
                                      toolResult = await executeLogGenericFoodItem(functionArgs.food_description, userId, supabaseClient, openai);
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
                              // --- Special Handling for Analyze Recipe Result --- 
                              if (functionName === 'analyzeRecipeIngredients' && toolResult.status === 'success' && toolResult.analysis) {
                                  console.log("AnalyzeRecipeIngredients succeeded. Preparing recipe analysis prompt.");
                                  responseData = {
                                      status: 'success',
                                      // Message summarizing analysis - AI will generate a better one in the confirmation step if saved/logged.
                                      message: `I've analyzed the ingredients for "${toolResult.analysis.recipe_name || 'your recipe'}". It has approximately ${toolResult.analysis.nutrition_summary?.calories || 'N/A'} calories. Would you like to Save & Log this recipe, Log it Once, or Cancel?`,
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
                              if (!requestHandled) { // Only append if analyzeRecipeIngredients didn't handle it
                                  const toolResultContent = JSON.stringify(toolResult);
                                  messages.push({
                                      tool_call_id: toolCall.id,
                                      role: "tool",
                                      content: toolResultContent,
                                  });
                              }
                          }
                      } // End of for loop through tool calls
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
                  responseData = {
                      status: 'success',
                      message: responseMessage.content || "Got it.",
                      response_type: message?.includes('?') || responseMessage.content?.includes('?') ? 'answer_provided' : 'clarification_needed'
                  };
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