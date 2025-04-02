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
            description: "Searches the user's saved recipes based on a name or description provided by the user. Use this if the user mentions logging something they might have saved previously (e.g., 'log my morning smoothie', 'add the chili recipe').",
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: "The name or keywords from the user's message to search for in their saved recipes. E.g., 'morning smoothie', 'chili'."
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
            description: "Use this function when the user mentions a dish name that typically involves multiple ingredients (e.g., 'fried rice', 'soup', 'salad', 'pasta', 'smoothie', 'curry') BUT **does not** provide ingredients or specify if it's homemade/standard/pre-packaged. This tool asks the user for clarification.",
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
            if (nutritionData[key] !== null && nutritionData[key] !== undefined) {
                 filteredNutritionData[key] = nutritionData[key];
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
    console.log(`Executing tool: logExistingSavedRecipe for recipe ID ${recipeId} ('${recipeName}') for user ${userId}`);
    try {
        // Fetch recipe details including nutrient columns
        const selectColumns = 'recipe_name, ' + MASTER_NUTRIENT_KEYS.join(', ');
        const { data: recipeDetails, error: fetchError } = await supabaseClient
            .from('user_recipes')
            .select(selectColumns)
            .eq('id', recipeId)
            .eq('user_id', userId) // Ensure user owns recipe
            .single();

        if (fetchError || !recipeDetails) {
            console.error("Error fetching recipe details for logging:", fetchError?.message);
            return { status: 'error', message: `Could not find your saved recipe details for '${recipeName}' (ID: ${recipeId}). Maybe it was deleted?` };
        }

        // Prepare nutrition data from fetched details
        const nutritionEstimateFromRecipe = { ...recipeDetails };
        const actualRecipeName = nutritionEstimateFromRecipe.recipe_name; // Use the name from DB for logging consistency
        delete nutritionEstimateFromRecipe.recipe_name; // Remove non-nutrient field before filtering

        // Filter nutrients based on user goals
        const nutritionToLog = await filterNutritionDataForUserGoals(nutritionEstimateFromRecipe, userId, supabaseClient);

        // Prepare the food log entry using the actual name from the database
        const foodLogEntry = {
            user_id: userId,
            food_name: actualRecipeName, // Use name from DB
            timestamp: new Date().toISOString(),
            source: 'ai_tool_recipe_saved', // Updated source
            recipe_id: recipeId,
            ...nutritionToLog, // Spread filtered nutrient values
            created_at: new Date().toISOString()
        };

        // Insert into food_log
        const { error: logError } = await supabaseClient.from('food_log').insert(foodLogEntry);
        if (logError) {
            console.error(`DB Error logging saved recipe ${recipeId}:`, logError.message);
            throw new Error(`Failed to log saved recipe in database: ${logError.message}`);
        }

        console.log(`Successfully logged saved recipe: '${actualRecipeName}' (requested as '${recipeName}')`);
        // Return the name provided in the tool call for OpenAI's confirmation message
        return { status: 'success', logged_recipe_name: recipeName };

    } catch (error) {
        console.error(`Error in executeLogExistingSavedRecipe for recipe ID ${recipeId}:`, error);
        // Use the recipeName provided by the tool call in the error message
        return { status: 'error', message: `Sorry, I couldn't log the saved recipe '${recipeName}'. ${error instanceof Error ? error.message : String(error)}` };
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
          food_name: cleanedFoodDescription, // Use the description provided to the tool
          timestamp: new Date().toISOString(),
          source: 'ai_tool_item', // Updated source
          recipe_id: null,
          ...nutritionToLog,
          created_at: new Date().toISOString()
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
    const intermediateResponseTypes = ['recipe_analysis_prompt', 'saved_recipe_confirmation_prompt', 'clarification_needed_recipe'];

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
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return { status: 'error', message: 'Search query cannot be empty.' };
    }

    try {
        const { data: matches, error: fetchError } = await supabaseClient
            .from('user_recipes')
            .select('id, recipe_name') // Only select necessary fields
            .eq('user_id', userId)
            .ilike('recipe_name', `%${trimmedQuery}%`) // Case-insensitive fuzzy search
            .limit(5); // Limit the number of results

        if (fetchError) {
            console.error(`DB Error searching recipes for query '${trimmedQuery}':`, fetchError.message);
            throw new Error(`Database error during recipe search: ${fetchError.message}`);
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
            matches: matches // Array of {id, recipe_name}
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
            created_at: new Date().toISOString(),
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
            source: 'ai_tool_recipe_saved', // Source indicating AI tool -> saved recipe -> logged
            recipe_id: newRecipeId, // Link to the newly saved recipe
            ...nutritionToLog,
            created_at: new Date().toISOString()
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
            source: 'ai_tool_recipe_logged', // Source indicating AI tool -> logged only
            recipe_id: null, // Not linked to a saved recipe
            ...nutritionToLog,
            created_at: new Date().toISOString()
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
  // -----------------------------------------------------------------
  // --- 1. Initialization & Request Parsing ---
  // -----------------------------------------------------------------
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let userId: string;
  let supabaseClient: SupabaseClient;
  let responseData: any = null; // Holds the final response object
  let userMessageForStorage: string | null = null; // To store the triggering user message
  let requestHandled = false; // Flag to indicate if the request was handled without OpenAI main loop

  const MAX_HISTORY_MESSAGES = 8; // Limit conversation history length

  try {
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

    // --- Handle Pending Recipe Confirmation ---
    if (pending_action?.type === 'log_analyzed_recipe' && pending_action.analysis && message) {
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
    if (!requestHandled && message) { // Only proceed if not handled and there's a user message
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

      try {
          // --- First OpenAI Call (Intent/Tool Detection) ---
          console.log("Making first OpenAI call with tools...");
          const response = await openai.chat.completions.create({
              model: "gpt-4o-mini", // Balance cost and capability
              messages: messages,
              tools: availableTools,
              tool_choice: "auto", // Let OpenAI decide if a tool is needed
          });

          const responseMessage = response.choices[0].message;
          messages.push(responseMessage); // Add AI's response (potentially with tool calls) to history

          // --- Process Response: Check for Tool Calls ---
          if (responseMessage.tool_calls) {
              console.log(`OpenAI requested tool call(s): ${responseMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);

              for (const toolCall of responseMessage.tool_calls) {
                  const functionName = toolCall.function.name;
                  let functionArgs: any;
                  try {
                      functionArgs = JSON.parse(toolCall.function.arguments);
                  } catch (parseError) {
                      console.error(`Error parsing arguments for tool ${functionName}:`, toolCall.function.arguments, parseError);
                       const toolResultContent = JSON.stringify({ status: 'error', message: `Invalid arguments provided for ${functionName}.` });
                       messages.push({
                           tool_call_id: toolCall.id,
                           role: "tool",
                           content: toolResultContent,
                       });
                      continue;
                  }

                  let toolResult: ToolResult | null = null;
                  console.log(`Executing tool: ${functionName} with args:`, functionArgs);

                  // --- Execute the appropriate function OR handle clarification ---
                  if (functionName === 'clarifyDishType') {
                      // ** Special Handling for Clarification Request **
                      console.log(`Handling tool call: ${functionName}`);
                      responseData = {
                          status: 'success', // Successful interaction, pending clarification
                          message: `Okay, for "${functionArgs.dish_name}", is that a recipe you made or a standard item? If you made it, please list the ingredients so I can analyze it accurately. Otherwise, tell me it's a standard item.`,
                          response_type: 'clarification_needed_recipe', // Specific type
                          context_for_reply: { // Provide context for the next turn
                              awaiting_clarification_for: functionArgs.dish_name
                          }
                      };
                      requestHandled = true; // Mark as handled for this turn
                      break; // Exit the tool call loop, skip second OpenAI call
                  } else {
                      // --- Execute actual tool function ---
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
                  if (toolResult) { // Only process if a tool other than clarifyDishType was executed
                      // ** Special Handling for Single Saved Recipe Found **
                      if (functionName === 'findSavedRecipeByName' && toolResult?.status === 'success' && toolResult.found && toolResult.count === 1) {
                          console.log("Found single saved recipe. Prompting user for confirmation.");
                          const matchedRecipe = toolResult.matches[0];
                          responseData = {
                              status: 'success',
                              message: `I found your saved recipe '${matchedRecipe.recipe_name}'. Should I log it for you?`,
                              response_type: 'saved_recipe_confirmation_prompt', // Specific type
                              context_for_reply: {
                                  recipe_id: matchedRecipe.id,
                                  recipe_name: matchedRecipe.recipe_name
                              }
                          };
                          requestHandled = true;
                          break;
                      }

                      // ** Special Handling for Recipe Analysis Confirmation **
                      else if (functionName === 'analyzeRecipeIngredients' && toolResult?.status === 'success' && toolResult.confirmation_needed) {
                          console.log("Recipe analysis requires user confirmation. Preparing response.");
                          const preliminaryMessage = responseMessage.content || "I've analyzed the recipe. What would you like to do? (Save and Log / Log Only / Cancel)";
                          responseData = {
                              status: 'success',
                              message: preliminaryMessage,
                              response_type: 'recipe_analysis_prompt', // Specific type
                              pending_action: { type: 'log_analyzed_recipe', analysis: toolResult.analysis } // Send analysis data back
                          };
                          requestHandled = true;
                          break;
                      }

                      // --- Append general tool result for the second OpenAI call ---
                      const toolResultContent = JSON.stringify(toolResult);
                      messages.push({
                          tool_call_id: toolCall.id,
                          role: "tool",
                          content: toolResultContent,
                      });
                  }

              } // End of for loop through tool calls

              // --- Second OpenAI Call (if not handled by confirmation/clarification prompts) ---
              if (!requestHandled) {
                  console.log("Making second OpenAI call with tool results...");
                  const finalResponse = await openai.chat.completions.create({
                      model: "gpt-4o-mini", // Use the same model
                      messages: messages, // Send full history including tool results
                  });
                  const finalMessageContent = finalResponse.choices[0].message.content;

                  // Determine more specific response_type based on the tool result that led here
                  let finalResponseType = 'tool_response'; // Default
                  const lastToolResultMsg = messages[messages.length - 1];
                  if(lastToolResultMsg.role === 'tool') {
                      try {
                          const lastToolResultData = JSON.parse(lastToolResultMsg.content || '{}');
                          const lastToolCallMsg = messages[messages.length - 2];
                          const lastToolName = lastToolCallMsg.role === 'assistant' && lastToolCallMsg.tool_calls ? lastToolCallMsg.tool_calls[0]?.function?.name : null;

                          if (lastToolResultData.status === 'success') {
                             switch(lastToolName) {
                                 case 'logGenericFoodItem': finalResponseType = 'item_logged'; break;
                                 case 'findSavedRecipeByName':
                                     // Count > 1 case (single match handled above)
                                     if(lastToolResultData.count > 1) finalResponseType = 'saved_recipe_found_multiple';
                                     // Count === 0 case
                                     else if (lastToolResultData.count === 0) finalResponseType = 'saved_recipe_not_found'; // Added type
                                     break;
                                 case 'logExistingSavedRecipe': finalResponseType = 'saved_recipe_logged'; break; // If OpenAI calls it directly
                                 case 'answerGeneralQuestion': finalResponseType = 'answer_provided'; break;
                                // analyzeRecipeIngredients success without confirmation is unlikely but handle defensively
                                 case 'analyzeRecipeIngredients': finalResponseType = 'recipe_analysis_complete'; break; // Added type
                             }
                          } else {
                              // Map tool errors to specific types
                               finalResponseType = 'error_tool_execution';
                          }
                      } catch(e) { console.error("Error parsing last tool result for type setting", e); }
                  }

                  responseData = {
                      status: 'success', // Assume success if OpenAI gives a final response
                      message: finalMessageContent || "Okay.", // Fallback message
                      response_type: finalResponseType
                  };
                  console.log("Received final response from OpenAI after tool execution.");
              }

          } else { // --- No tool calls requested ---
              console.log("No tool calls requested by OpenAI. Using direct response.");
              responseData = {
                  status: 'success',
                  message: responseMessage.content || "Got it.", // Fallback message
                  response_type: message?.includes('?') || responseMessage.content?.includes('?') ? 'answer_provided' : 'clarification_needed' // Refined heuristic
              };
          }
      } catch (error) { // Catch errors during OpenAI calls or tool execution
           console.error("Error during OpenAI processing or tool execution:", error);
           responseData = { status: 'error', message: `Sorry, I encountered an issue processing that: ${error instanceof Error ? error.message : String(error)}`, response_type: 'error_openai' }; // More specific error
           requestHandled = false; // Ensure it proceeds to error response formatting
      }
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
    if (!['saved_recipe_confirmation_prompt', 'clarification_needed_recipe'].includes(responseData.response_type)) {
        delete responseData.context_for_reply;
    }

    // --- Store Final Conversation Turn ---
    const intermediateResponseTypes = ['recipe_analysis_prompt', 'saved_recipe_confirmation_prompt', 'clarification_needed_recipe']; // Added clarification
    if (userMessageForStorage && responseData.message && responseData.status === 'success' && !intermediateResponseTypes.includes(responseData.response_type)) {
                    await storeConversation(userId, userMessageForStorage, responseData, supabaseClient);
                } else {
        console.log("Skipping final conversation storage for this turn (intermediate step or error).");
    }

    // --- Determine final HTTP status and Return Response ---
    const finalStatus = responseData.status === 'success' ? 200 : 500; // Use 500 for internal errors

    console.log(`Responding with status: ${finalStatus}, type: ${responseData.response_type}`);
    // Return using the final responseData object
    return new Response(
        JSON.stringify(responseData),
        {
            status: finalStatus,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
    );

  } catch (error) { // Catch Top-Level Errors (Auth, Init, Parsing, etc.)
    console.error('--- Unhandled Top-Level Error ---:', error);
    // Ensure a response is always sent
    const errorResponse = { status: 'error', message: `Server error: ${error instanceof Error ? error.message : String(error)}`, response_type: 'error_unknown' }; // Generic server error
    return new Response(JSON.stringify(errorResponse), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
}); // End Deno.serve