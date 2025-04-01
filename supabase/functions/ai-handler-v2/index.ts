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

// Define AI Persona
const AI_PERSONA = "You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses.";

// Define Master Nutrient Keys
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
  // Add ~10 more diverse examples (e.g., specific salads, soups, international dishes)
];

// Helper function to check if a message likely refers to a complex dish
function isPotentiallyComplex(message: string, potentialName: string): boolean {
    const lowerMessage = message.toLowerCase();
    // Ensure potentialName is a string before calling toLowerCase
    const lowerName = typeof potentialName === 'string' ? potentialName.toLowerCase() : '';

    // Check 1: Look for keywords in the full original message
    if (recipeKeywords.some(keyword => lowerMessage.includes(keyword))) {
        console.log(`isPotentiallyComplex: Found keyword match in message: "${lowerMessage}"`);
        return true;
    }

    // Check 2: Look for complex dish names within the extracted potential name
    if (recipeDishNames.some(dishName => lowerName.includes(dishName))) {
         console.log(`isPotentiallyComplex: Found dish name match for name: "${lowerName}"`);
         return true;
    }

    console.log(`isPotentiallyComplex: No keyword or dish name match for message: "${lowerMessage}", name: "${lowerName}"`);
    return false;
}


// Helper function for random follow-up prompts
const getRandomFollowUp = (): string => {
  const followUps = [
    " Anything else I can help you log?",
    " How are you feeling about your nutrition goals today?",
    " What else did you eat?",
    " Keep up the great work!",
    ""
  ];
  return followUps[Math.floor(Math.random() * followUps.length)];
};

// Helper Function for OpenAI Recommendations
async function getOpenAiRecommendations(profileData: any, openai: OpenAI): Promise<any> {
  const { age, weight_kg, height_cm, sex } = profileData;
  const recommendationPrompt = `Calculate recommended daily nutritional goals based on the following user profile:\n- Age: ${age} years\n- Weight: ${weight_kg} kg\n- Height: ${height_cm} cm\n- Sex: ${sex}\n\nProvide recommendations for the following nutrients: ${MASTER_NUTRIENT_KEYS.join(", ")}.\n\nRespond ONLY with a single JSON object where keys are the exact nutrient identifiers provided (e.g., "calories", "protein_g") and values are the recommended daily amounts as numbers. If a recommendation cannot be determined, use null. Do not include any other text, explanation, or units in the JSON values or keys.`;

  const openaiResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "system", content: recommendationPrompt }],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  const aiResponseContent = openaiResponse.choices[0].message?.content || '{}';
  let recommendations;
  try {
    recommendations = JSON.parse(aiResponseContent);
    if (typeof recommendations !== 'object' || recommendations === null) throw new Error("Invalid format from AI.");
    MASTER_NUTRIENT_KEYS.forEach(key => {
      if (!(key in recommendations)) {
        console.warn(`Nutrient key ${key} missing from AI recommendation response, setting to null.`);
        recommendations[key] = null;
      } else if (typeof recommendations[key] !== 'number' && recommendations[key] !== null) {
        console.warn(`Nutrient key ${key} has non-numeric value ${recommendations[key]} in recommendation, setting to null.`);
        recommendations[key] = null;
      }
    });
  } catch (jsonError) {
    console.error("Failed to parse recommendations JSON:", jsonError, "Raw content:", aiResponseContent);
    throw new Error(`Failed to parse nutrition recommendations: ${jsonError.message}`);
  }
  return recommendations;
}


// Main request handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS }); // Semicolon already present
  }

  let userId: string;
  let supabaseClient: SupabaseClient;
  let responseData: any; // Initialize responseData

  try {
    // --- Authorization Header Check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response( JSON.stringify({ status: 'error', message: 'Unauthorized', detail: 'No authorization header provided' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }

    // --- Initialize Supabase Client ---
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase configuration');
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    } catch (error) {
      console.error('Critical Error: Initializing Supabase client failed:', error);
      return new Response( JSON.stringify({ status: 'error', message: 'Sorry, there was a server configuration issue. Please try again later.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }

    // --- Verify User Authentication ---
    try {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');
      userId = user.id;
    } catch (error) {
      console.error('Authentication error:', error);
      return new Response( JSON.stringify({ status: 'error', message: 'Authentication failed. Please try logging in again.' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }

    // --- Parse Request Body ---
    let message: string | undefined;
    let context: any;
    let action: string | undefined;
    let recipe_data: any;
    try {
      const requestData = await req.json();
      ({ message, context, action, recipe_data } = requestData);
      if (!action && !message) throw new Error('Either message or action is required');
      if (action === 'get_recommendations') {
          if (!recipe_data || typeof recipe_data !== 'object' || recipe_data === null) throw new Error('Recipe data required for recommendations');
          const { name, ingredients, nutrition_estimate } = recipe_data;
          if (typeof name !== 'string' || name.length === 0) throw new Error('Valid recipe name required');
          if (typeof ingredients !== 'string' || ingredients.length === 0) throw new Error('Valid ingredients required');
          if (typeof nutrition_estimate !== 'object' || nutrition_estimate === null) throw new Error('Valid nutrition estimate required');
          if (typeof nutrition_estimate.calories !== 'number' || nutrition_estimate.calories <= 0) throw new Error('Valid calories required');
          if (typeof nutrition_estimate.water_g !== 'number' || nutrition_estimate.water_g <= 0) throw new Error('Valid water required');
          if (typeof nutrition_estimate.protein_g !== 'number' || nutrition_estimate.protein_g <= 0) throw new Error('Valid protein required');
          if (typeof nutrition_estimate.fat_total_g !== 'number' || nutrition_estimate.fat_total_g <= 0) throw new Error('Valid fat total required');
          if (typeof nutrition_estimate.carbs_g !== 'number' || nutrition_estimate.carbs_g <= 0) throw new Error('Valid carbs required');
          if (typeof nutrition_estimate.fat_saturated_g !== 'number' || nutrition_estimate.fat_saturated_g < 0) throw new Error('Valid fat saturated required');
          if (typeof nutrition_estimate.fat_polyunsaturated_g !== 'number' || nutrition_estimate.fat_polyunsaturated_g < 0) throw new Error('Valid fat polyunsaturated required');
          if (typeof nutrition_estimate.fat_monounsaturated_g !== 'number' || nutrition_estimate.fat_monounsaturated_g < 0) throw new Error('Valid fat monounsaturated required');
          if (typeof nutrition_estimate.fat_trans_g !== 'number' || nutrition_estimate.fat_trans_g < 0) throw new Error('Valid fat trans required');
          if (typeof nutrition_estimate.fiber_g !== 'number' || nutrition_estimate.fiber_g < 0) throw new Error('Valid fiber required');
          if (typeof nutrition_estimate.sugar_g !== 'number' || nutrition_estimate.sugar_g < 0) throw new Error('Valid sugar required');
          if (typeof nutrition_estimate.sugar_added_g !== 'number' || nutrition_estimate.sugar_added_g < 0) throw new Error('Valid sugar added required');
          if (typeof nutrition_estimate.cholesterol_mg !== 'number' || nutrition_estimate.cholesterol_mg < 0) throw new Error('Valid cholesterol required');
          if (typeof nutrition_estimate.sodium_mg !== 'number' || nutrition_estimate.sodium_mg < 0) throw new Error('Valid sodium required');
          if (typeof nutrition_estimate.potassium_mg !== 'number' || nutrition_estimate.potassium_mg < 0) throw new Error('Valid potassium required');
          if (typeof nutrition_estimate.calcium_mg !== 'number' || nutrition_estimate.calcium_mg < 0) throw new Error('Valid calcium required');
          if (typeof nutrition_estimate.iron_mg !== 'number' || nutrition_estimate.iron_mg < 0) throw new Error('Valid iron required');
          if (typeof nutrition_estimate.magnesium_mg !== 'number' || nutrition_estimate.magnesium_mg < 0) throw new Error('Valid magnesium required');
          if (typeof nutrition_estimate.phosphorus_mg !== 'number' || nutrition_estimate.phosphorus_mg < 0) throw new Error('Valid phosphorus required');
          if (typeof nutrition_estimate.zinc_mg !== 'number' || nutrition_estimate.zinc_mg < 0) throw new Error('Valid zinc required');
          if (typeof nutrition_estimate.copper_mg !== 'number' || nutrition_estimate.copper_mg < 0) throw new Error('Valid copper required');
          if (typeof nutrition_estimate.manganese_mg !== 'number' || nutrition_estimate.manganese_mg < 0) throw new Error('Valid manganese required');
          if (typeof nutrition_estimate.selenium_mcg !== 'number' || nutrition_estimate.selenium_mcg < 0) throw new Error('Valid selenium required');
          if (typeof nutrition_estimate.vitamin_a_mcg_rae !== 'number' || nutrition_estimate.vitamin_a_mcg_rae < 0) throw new Error('Valid vitamin A required');
          if (typeof nutrition_estimate.vitamin_d_mcg !== 'number' || nutrition_estimate.vitamin_d_mcg < 0) throw new Error('Valid vitamin D required');
          if (typeof nutrition_estimate.vitamin_e_mg !== 'number' || nutrition_estimate.vitamin_e_mg < 0) throw new Error('Valid vitamin E required');
          if (typeof nutrition_estimate.vitamin_k_mcg !== 'number' || nutrition_estimate.vitamin_k_mcg < 0) throw new Error('Valid vitamin K required');
          if (typeof nutrition_estimate.vitamin_c_mg !== 'number' || nutrition_estimate.vitamin_c_mg < 0) throw new Error('Valid vitamin C required');
          if (typeof nutrition_estimate.thiamin_mg !== 'number' || nutrition_estimate.thiamin_mg < 0) throw new Error('Valid thiamin required');
          if (typeof nutrition_estimate.riboflavin_mg !== 'number' || nutrition_estimate.riboflavin_mg < 0) throw new Error('Valid riboflavin required');
          if (typeof nutrition_estimate.niacin_mg !== 'number' || nutrition_estimate.niacin_mg < 0) throw new Error('Valid niacin required');
          if (typeof nutrition_estimate.pantothenic_acid_mg !== 'number' || nutrition_estimate.pantothenic_acid_mg < 0) throw new Error('Valid pantothenic acid required');
          if (typeof nutrition_estimate.vitamin_b6_mg !== 'number' || nutrition_estimate.vitamin_b6_mg < 0) throw new Error('Valid vitamin B6 required');
          if (typeof nutrition_estimate.biotin_mcg !== 'number' || nutrition_estimate.biotin_mcg < 0) throw new Error('Valid biotin required');
          if (typeof nutrition_estimate.folate_mcg_dfe !== 'number' || nutrition_estimate.folate_mcg_dfe < 0) throw new Error('Valid folate required');
          if (typeof nutrition_estimate.vitamin_b12_mcg !== 'number' || nutrition_estimate.vitamin_b12_mcg < 0) throw new Error('Valid vitamin B12 required');
      }
    } catch (error) {
      console.error('Error parsing request body:', error);
      return new Response( JSON.stringify({ status: 'error', message: 'There was a problem understanding your request.' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }

    // --- Initialize OpenAI Client ---
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("Critical Error: OpenAI API key is missing");
      return new Response( JSON.stringify({ status: 'error', message: 'Sorry, the AI service is not configured correctly. Please contact support.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // --- Handle Recipe Save and Log Confirmation ---
    if (action === 'confirm_save_and_log_recipe' && recipe_data) {
      console.log("Handling confirmed recipe save and log action");
      try {
        // Clean up recipe name if it still has prefixes
        const cleanRecipeName = recipe_data.name
          .replace(/^i (just |)ate /i, '')
          .replace(/^i had /i, '')
          .replace(/^log /i, '')
          .trim();
        
        // Check schema of user_recipes table to confirm column names
        const { data: tableInfo, error: tableError } = await supabaseClient
          .from('user_recipes')
          .select('*')
          .limit(1);
        
        if (!tableError) {
          console.log("Available columns in user_recipes:", tableInfo && tableInfo.length > 0 ? Object.keys(tableInfo[0]) : "No sample rows available");
        } else {
          console.warn("Unable to fetch schema info:", tableError.message);
        }

        // Prepare recipe data for insertion - ensure field names match DB schema
        const recipeToSave = {
          user_id: userId,
          recipe_name: cleanRecipeName, // Use cleaned name
          description: recipe_data.ingredients,
          ...recipe_data.nutrition_estimate, // Spread nutrition values directly
          created_at: new Date().toISOString()
        };

        console.log("Attempting to save recipe with data:", {
          name: cleanRecipeName,
          userId: userId,
          // Log only a few sample fields to avoid overwhelming the console
          nutritionSample: {
            calories: recipe_data.nutrition_estimate.calories,
            protein_g: recipe_data.nutrition_estimate.protein_g
          }
        });

        // Insert into user_recipes table and get the ID
        const { data: savedRecipe, error: saveError } = await supabaseClient
          .from('user_recipes')
          .insert(recipeToSave)
          .select('id')
          .single();

        if (saveError) {
          console.error("Recipe save error details:", saveError);
          throw new Error(`Failed to save recipe: ${saveError.message}`);
        }

        if (!savedRecipe) {
          throw new Error('No recipe data returned after saving');
        }

        const newRecipeId = savedRecipe.id;

        // Filter nutrition data for user goals
        const nutritionToLog = await filterNutritionDataForUserGoals(
          recipe_data.nutrition_estimate, 
          userId, 
          supabaseClient
        );

        // Prepare food log entry
        const foodLogEntry = {
          user_id: userId,
          food_name: recipe_data.name,
          timestamp: new Date().toISOString(),
          source: 'ai_chat_recipe_confirmed',
          recipe_id: newRecipeId,
          ...nutritionToLog, // Use filtered nutrition data
          created_at: new Date().toISOString()
        };

        // Insert into food_log table
        const { error: logError } = await supabaseClient
          .from('food_log')
          .insert(foodLogEntry);

        if (logError) {
          throw new Error(`Failed to log recipe: ${logError.message}`);
        }

        responseData = {
          status: 'success',
          message: `Great! I've saved "${cleanRecipeName}" to your recipes and logged it for today.`
        };
        
        // Add this return statement to ensure proper response
        return new Response(
          JSON.stringify(responseData),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
        
      } catch (error) {
        console.error("Error in recipe save and log:", error);
        responseData = {
          status: 'error',
          message: `Sorry, I encountered an error: ${error.message}`,
          response_type: 'recipe_save_log_error'
        };
        
        // Add this return statement for error case
        return new Response(
          JSON.stringify(responseData),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }
    // --- Handle Log-Only Recipe Confirmation ---
    else if (action === 'confirm_log_only_recipe' && recipe_data) {
      console.log("Handling confirmed recipe log-only action");
      try {
        // Filter nutrition data for user goals
        const nutritionToLog = await filterNutritionDataForUserGoals(
          recipe_data.nutrition_estimate, 
          userId, 
          supabaseClient
        );

        // Prepare food log entry (no recipe saving)
        const foodLogEntry = {
          user_id: userId,
          food_name: recipe_data.name,
          timestamp: new Date().toISOString(),
          source: 'ai_chat_recipe_log_only',
          recipe_id: null, // No saved recipe
          ...nutritionToLog, // Use filtered nutrition data
          created_at: new Date().toISOString()
        };

        // Insert into food_log table
        const { error: logError } = await supabaseClient
          .from('food_log')
          .insert(foodLogEntry);

        if (logError) {
          throw new Error(`Failed to log recipe: ${logError.message}`);
        }

        responseData = {
          status: 'success',
          message: `I've logged "${recipe_data.name}" for today without saving it to your recipes.`
        };
        
        // Add this return statement to ensure proper response
        return new Response(
          JSON.stringify(responseData),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
        
      } catch (error) {
        console.error("Error in recipe log only:", error);
        responseData = {
          status: 'error',
          message: `Sorry, I encountered an error: ${error.message}`,
          response_type: 'recipe_log_error'
        };
        
        // Add this return statement for error case
        return new Response(
          JSON.stringify(responseData),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }
    // --- Branch 2: Recipe Logging via explicit context ---
    else if (context?.type === 'ingredients' && context?.recipeName) {
      console.log("Branch 2: Handling recipe logging via context.");
      const nutrientKeys = MASTER_NUTRIENT_KEYS;
      const prompt = `User wants to log a recipe named "${context.recipeName}" with ingredients: "${message}". Estimate nutritional content for the *entire* recipe. Respond ONLY with a single JSON object: {"recipe_name": "${context.recipeName}", "description": "${message}", ${nutrientKeys.map(k => `"${k}": number|null`).join(", ")}}. Use null if unknown. No extra text.`;
      try {
        const openaiResponse = await openai.chat.completions.create({ 
          model: "gpt-3.5-turbo", 
          messages: [ { role: "system", content: prompt }, { role: "user", content: message! } ], 
          temperature: 0.3, 
          response_format: { type: "json_object" } 
        });
        
        const aiResponseContent = openaiResponse.choices[0].message?.content || '';
        let nutritionData;
        
        try { 
          nutritionData = JSON.parse(aiResponseContent); 
        } catch (jsonError) { 
          throw new Error(`Failed to parse recipe nutrition data: ${jsonError.message}`); 
        }

        // Package the necessary details for confirmation
        const recipeDataToSave = {
          name: context.recipeName,
          ingredients: message,
          nutrition_estimate: nutritionData
        };
        
        // Return confirmation prompt with the recipe data
        responseData = {
          status: 'success',
          response_type: "recipe_save_confirmation_prompt",
          message: `I've analyzed '${context.recipeName}' with the ingredients you provided. Shall I save this to your recipes and log it for today?`,
          recipe_data_to_save: recipeDataToSave
        };

        // After parsing the nutrition data (around line 570-580)
        console.log("Parsed nutrition data structure:", Object.keys(nutritionData));
        console.log("Sample nutrition values:", {
          calories: nutritionData.calories,
          protein: nutritionData.protein_g,
          carbs: nutritionData.carbs_g
        });
      } catch (error) {
        console.error("Error in recipe ingredient analysis:", error);
        responseData = {
          status: 'error',
          message: "Sorry, I encountered an issue analyzing the ingredients. Please try again with more specific information.",
          response_type: 'recipe_analysis_error'
        };
      }
    }
    // --- Branch 3: Handle General Chat / Intent Recognition ---
    else if (message) {
      // --- Correction Handling START ---
      let isCorrection = false;
      if (context?.correction_for_log_id && typeof context.correction_for_log_id === 'string') {
        const correctiveKeywords = ['no', 'nope', 'wrong', 'incorrect', 'not right', 'that was a recipe', 'needs ingredients', 'that\'s not it', 'actually it was'];
        if (correctiveKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
          isCorrection = true;
          console.log(`Handling correction request for log ID: ${context.correction_for_log_id}`);
          try {
            const logIdToDelete = context.correction_for_log_id;
            const loggedItemName = context.item_name || 'that item';
            console.log(`Attempting to delete log entry: ${logIdToDelete} for user ${userId}`);
            const { error: deleteError } = await supabaseClient.from('food_log').delete().eq('user_id', userId).eq('id', logIdToDelete);

            if (deleteError) {
              console.error(`Failed to delete log entry ${logIdToDelete}:`, deleteError);
              responseData = { status: 'error', message: `Sorry, I couldn't remove the previous incorrect entry for '${loggedItemName}', but please tell me the ingredients so I can log it correctly as a recipe.`, response_type: 'prompt_recipe_ingredients_after_correction_failed_delete' };
            } else {
              console.log(`Successfully deleted incorrect log entry ${logIdToDelete}.`);
              responseData = { status: 'success', message: `My mistake! I've removed the previous entry for '${loggedItemName}'. To log it correctly as a recipe, please list the ingredients.`, response_type: 'prompt_recipe_ingredients_after_correction', recipe_context: { name_suggestion: loggedItemName } };
            }
            console.log(`Correction handled for log ${logIdToDelete}. Returning response.`);
            return new Response(JSON.stringify(responseData), { status: responseData.status === 'success' ? 200 : 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Added Semicolon
          } catch (correctionError) {
            console.error("Unexpected error handling correction:", correctionError);
            responseData = { status: 'error', message: 'Sorry, something went wrong while trying to correct that entry. Please try again or start over with logging your recipe.', response_type: 'correction_error' };
            return new Response(JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Added Semicolon
          }
        } // End if corrective keyword found
      } // End if correction_for_log_id exists
      // --- Correction Handling END ---

      // --- Normal Intent Processing START (only if not correction) ---
      if (!isCorrection) {
        console.log("Branch 3: Handling general chat message for intent recognition.");
        let determinedIntent = 'unknown';
        let profileData = null;
        let hasCompleteProfile = false;

        try { // Intent Recognition Try block
          // Fetch profile status
          try {
            const { data: fetchedProfile, error: profileError } = await supabaseClient.from('user_profiles').select('age, weight_kg, height_cm, sex').eq('user_id', userId).maybeSingle();
            if (profileError) console.warn("Could not fetch profile status for intent check:", profileError.message);
            else if (fetchedProfile) { profileData = fetchedProfile; hasCompleteProfile = !!(fetchedProfile.age && fetchedProfile.weight_kg && fetchedProfile.height_cm && fetchedProfile.sex); }
          } catch (profileFetchError) { console.warn("Error fetching profile status:", profileFetchError.message); }

          // Intent prompt
          const intentSystemPrompt = `Your role: Classify the user's primary intent. Respond ONLY with ONE keyword: 'log_food', 'request_meal_suggestion', or 'ask_general_question'.\n\nExamples:\n- "Log an apple", "I had chicken soup", "Add 2 eggs" -> log_food\n- "What can I eat for lunch?", "Suggest a healthy breakfast", "Ideas for dinner", "Recommend meals for my goals", "what should I eat today?", "give me breakfast ideas" -> request_meal_suggestion\n- "How much protein?", "Why are carbs important?", "Hello", nutrient goal questions, requests for nutrient recommendations -> ask_general_question\n\nUser profile status: ${hasCompleteProfile ? 'Complete' : 'Incomplete'}.\nUser Message: "${message}"\n\nOutput ONLY the keyword.`;
          const intentResponse = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "system", content: intentSystemPrompt }], temperature: 0.1, max_tokens: 10 });
          const rawIntent = intentResponse.choices[0].message?.content?.trim().toLowerCase() || 'unknown';

          if (rawIntent.includes('log_food')) determinedIntent = 'log_food';
          else if (rawIntent.includes('request_meal_suggestion')) determinedIntent = 'request_meal_suggestion';
          else determinedIntent = 'ask_general_question';
          console.log("Determined Intent:", determinedIntent);

        } catch (error) { // Intent Recognition Catch block
          console.error("Error in Intent Recognition processing:", error);
          responseData = { status: 'error', message: 'Sorry, I encountered an issue processing your message. Please try again.' };
          return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
        } // End Intent Recognition Try/Catch

        // --- Handle Based on Determined Intent ---
        if (determinedIntent === 'log_food') {
          console.log("Processing log_food intent...");
          // --- Saved Recipe Check START ---
          let potentialRecipeName = message.toLowerCase().replace(/^log\s+|^add\s+|^i\s+had\s+|^i\s+ate\s+|^my\s+|^a\s+|^an\s+|^the\s+|^some\s+/,'').trim();
          let savedRecipeCheckCompleted = false;

          console.log(`Checking saved recipes for: "${potentialRecipeName}"`);
          const { data: matchingRecipes, error: recipeSearchError } = await supabaseClient.from('user_recipes').select('id, recipe_name').eq('user_id', userId).ilike('recipe_name', `%${potentialRecipeName}%`);

          if (recipeSearchError) { console.error("Error searching user recipes:", recipeSearchError); savedRecipeCheckCompleted = false; }
          else if (matchingRecipes && matchingRecipes.length === 1) {
            console.log("Found single matching saved recipe."); const theRecipe = matchingRecipes[0];
            responseData = { status: 'success', message: `Did you have your saved recipe: '${theRecipe.recipe_name}'?`, response_type: 'confirmation_needed_saved_recipe', recipe_match: { id: theRecipe.id, name: theRecipe.recipe_name } };
            savedRecipeCheckCompleted = true;
          } else if (matchingRecipes && matchingRecipes.length > 1) {
            console.log("Found multiple matching saved recipes.");
            responseData = { status: 'success', message: `I found a few saved recipes similar to that: ${matchingRecipes.map(r => `'${r.recipe_name}'`).join(', ')}. Which one did you mean?`, response_type: 'clarification_needed_multiple_saved_recipes', recipe_matches: matchingRecipes.map(r => ({ id: r.id, name: r.recipe_name })) };
            savedRecipeCheckCompleted = true;
          } else { console.log("No matching saved recipes found."); savedRecipeCheckCompleted = false; }
          // --- Saved Recipe Check END ---

          if (!savedRecipeCheckCompleted) {
            console.log("Proceeding to check if input is potentially a new complex recipe...");
            // --- Ambiguity Check START ---
            const looksComplex = isPotentiallyComplex(message, potentialRecipeName);

            // --- Add the ingredient detection logic here ---
            // Check if this is a response to a recipe clarification with ingredients
            if (message.toLowerCase().includes('its made of') || 
                message.toLowerCase().includes('made with') ||
                message.toLowerCase().includes('ingredients are') ||
                message.toLowerCase().includes('i just provided you with recipe') ||
                message.toLowerCase().includes('one mushroom') ||
                message.toLowerCase().includes('cup of')
            ) {
              console.log("Detected user providing ingredients for a recipe");
              
              // Extract recipe name from previous context or messages
              let recipe_name = "Custom recipe";
              // Look through previous conversations to try to find the recipe name
              const { data: prevConvo, error: convoError } = await supabaseClient
                .from('conversations')
                .select('message, response')
                .eq('user_id', userId)
                .order('timestamp', { ascending: false })
                .limit(5);
              
              if (!convoError && prevConvo && prevConvo.length > 0) {
                // Look for the most recent recipe name mention in previous messages
                for (const convo of prevConvo) {
                  if (convo.response && convo.response.includes('might be a specific recipe')) {
                    const match = convo.response.match(/'([^']+)'/);
                    if (match && match[1]) {
                      // Clean up recipe name from previous conversation
                      recipe_name = match[1].trim()
                        .replace(/^i (just |)ate /i, '')
                        .replace(/^i had /i, '')
                        .replace(/^log /i, '');
                      console.log(`Found recipe name from previous conversation: ${recipe_name}`);
                      break;
                    }
                  }
                  // Also check user messages for recipe names
                  if (convo.message && !convo.message.toLowerCase().includes('made of') && 
                      !convo.message.toLowerCase().includes('ingredients are')) {
                    // Apply more thorough cleanup of recipe name from user messages
                    recipe_name = convo.message
                      .replace(/^i (just |)ate /i, '')
                      .replace(/^i just had /i, '')
                      .replace(/^i had /i, '')
                      .replace(/^log /i, '')
                      .replace(/^add /i, '')
                      .trim();
                    console.log(`Using previous user message as recipe name: ${recipe_name}`);
                    break;
                  }
                }
              }
              
              // Clean up ingredients text from common prefixes
              const ingredients = message
                .replace(/its made of /i, '')
                .replace(/made with /i, '')
                .replace(/ingredients are /i, '')
                .replace(/i just provided you with recipe/i, '')
                .trim();
              
              console.log(`Processing recipe: ${recipe_name} with ingredients: ${ingredients}`);
              
              try {
                // Get nutritional estimate from OpenAI for the recipe
                const nutrientKeys = MASTER_NUTRIENT_KEYS;
                const prompt = `User wants to log a recipe named "${recipe_name}" with ingredients: "${ingredients}". Estimate nutritional content for the *entire* recipe. Respond ONLY with a single JSON object: {"recipe_name": "${recipe_name}", "description": "${ingredients}", ${nutrientKeys.map(k => `"${k}": number|null`).join(", ")}}. Use null if unknown. No extra text.`;
                
                const openaiResponse = await openai.chat.completions.create({ 
                  model: "gpt-3.5-turbo", 
                  messages: [ { role: "system", content: prompt } ], 
                  temperature: 0.3, 
                  response_format: { type: "json_object" } 
                });
                
                const aiResponseContent = openaiResponse.choices[0].message?.content || '';
                let nutritionData;
                
                try { 
                  nutritionData = JSON.parse(aiResponseContent); 
                } catch (jsonError) { 
                  throw new Error(`Failed to parse recipe nutrition data: ${jsonError.message}`); 
                }

                // Package the necessary details for confirmation
                const recipeDataToSave = {
                  name: recipe_name,
                  ingredients: ingredients,
                  nutrition_estimate: nutritionData
                };
                
                // Return confirmation prompt with the recipe data
                responseData = {
                  status: 'success',
                  response_type: "recipe_save_confirmation_prompt",
                  message: `I've analyzed '${recipe_name}' with the ingredients you provided. Would you like me to save this to your recipes and log it for today?`,
                  recipe_data_to_save: recipeDataToSave
                };
                
                // Return early to prevent further processing
                return new Response(
                  JSON.stringify(responseData),
                  { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
                );
              } catch (error) {
                console.error("Error in recipe ingredient analysis:", error);
                responseData = {
                  status: 'error',
                  message: "Sorry, I encountered an issue analyzing the ingredients. Please try again with more specific information.",
                  response_type: 'recipe_analysis_error'
                };
                
                // Return early to prevent further processing
                return new Response(
                  JSON.stringify(responseData),
                  { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
                );
              }
            }
            // --- End of ingredient detection logic ---
            
            else if (looksComplex) {
              console.log("Item detected as potentially complex (and not saved). Asking for clarification.");
              responseData = { 
                status: 'success', 
                message: `It sounds like '${potentialRecipeName || message}' might be a specific recipe you haven't saved yet. Would you like to provide the ingredients to log it accurately, or should I log it as a standard item?`, 
                response_type: 'clarification_needed_recipe' 
              };
            } else {
              // --- Generic Logging START ---
              console.log("Item detected as simple (and not saved). Proceeding with standard logging.");
              try { // Wrap generic logging in try/catch
                const foodPrompt = `The user said they ate "${message}". As a nutrition AI, estimate the nutritional content for this single food item. Format response as a single JSON object: { "food_name": "user-friendly name of the food", "calories": number, "protein_g": number, ... other nutrients ...}. Include ONLY numerical values (use null for unknown) for these keys: ${MASTER_NUTRIENT_KEYS.join(', ')}. No extra text or explanation.`;
                const foodResponse = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "system", content: foodPrompt }], temperature: 0.3, response_format: { type: "json_object" } });
                const foodResponseContent = foodResponse.choices[0].message?.content || '';
                let parsedNutrition: Record<string, any> = {};
                try { parsedNutrition = JSON.parse(foodResponseContent); } catch (parseError) { console.error("Failed to parse JSON from OpenAI food response:", foodResponseContent, parseError); throw new Error("AI response was not valid JSON."); }

                const foodName = parsedNutrition.food_name || potentialRecipeName || "Food item"; // Use AI name or fallback
                const nutritionToLog = await filterNutritionDataForUserGoals(
                  parsedNutrition, 
                  userId, 
                  supabaseClient
                );

                const foodLogEntry = { 
                  user_id: userId, 
                  food_name: foodName, 
                  timestamp: new Date().toISOString(), 
                  source: 'ai_chat_item', 
                  recipe_id: null, 
                  ...nutritionToLog, // Now using the filtered nutrition data
                  created_at: new Date().toISOString() 
                };

                console.log("Attempting to insert generic food log entry...");
                const { data: newLogEntry, error: logError } = await supabaseClient
                  .from('food_log')
                  .insert(foodLogEntry)
                  .select('id, food_name')
                  .single();
                if (logError || !newLogEntry) { console.error("Supabase DB insert error or no data returned:", logError); throw new Error(`DB Error: ${logError?.message || 'Failed to retrieve log ID after insert'}`); }

                console.log("Generic food log entry inserted successfully.");
                responseData = { status: 'success', message: `Alright, logged '${newLogEntry.food_name}' for you.${getRandomFollowUp()}`, response_type: 'item_logged', log_entry_id: newLogEntry.id, logged_item_name: newLogEntry.food_name };

              } catch (foodLogError) { // Catch errors from generic logging (OpenAI call, JSON parsing, DB insert)
                  console.error("Error processing food item logging:", foodLogError);
                  // Ensure responseData is set even on error before returning
                  responseData = { status: 'error', message: `Sorry, I encountered an issue logging '${message}'. Please try again. (${foodLogError instanceof Error ? foodLogError.message : String(foodLogError)})`, response_type: 'log_error'};
                   // Return 500 error response immediately for generic log failure
                   // Ensure responseData is defined before stringifying
                   return new Response( JSON.stringify(responseData || {status: 'error', message: 'Unknown error during food logging.'}), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Added check and Semicolon
              } // End Generic Logging Try/Catch
              // --- Generic Logging END ---
            } // End else (not complex)
            // --- Ambiguity Check END ---
          } // End if (!savedRecipeCheckCompleted)
        } // End if (determinedIntent === 'log_food')

        else if (determinedIntent === 'request_meal_suggestion') {
          console.log("Handling 'request_meal_suggestion' intent.");
          let mealSuggestionContext = ""; let goalsSummary = "No specific goals set."; let profileSummary = "Profile information not available.";
          try {
            // Fetch Goals
            const { data: goalsData, error: goalsError } = await supabaseClient.from('user_goals').select('nutrient, target_value, unit').eq('user_id', userId);
            if (goalsError) { console.warn("Could not fetch goals context:", goalsError.message); }
            else if (goalsData && goalsData.length > 0) { /* Summarize goals */ const calorieGoal = goalsData.find(g => g.nutrient === 'calories'); const proteinGoal = goalsData.find(g => g.nutrient === 'protein_g'); let summaryParts = []; if (calorieGoal) summaryParts.push(`Calories: ~${calorieGoal.target_value} kcal`); if (proteinGoal) summaryParts.push(`Protein: ~${proteinGoal.target_value}g`); if (summaryParts.length > 0) goalsSummary = `Key Goals: ${summaryParts.join(', ')}.`; else goalsSummary = `${goalsData.length} goals set (details unspecified).`; }
            // Use profile fetched earlier
            if (profileData) { profileSummary = `User Profile: Age ${profileData.age}, Weight ${profileData.weight_kg}kg, Height ${profileData.height_cm}cm, Sex ${profileData.sex}.`; } else { console.log("Profile data not available for suggestion."); }
            mealSuggestionContext = `${profileSummary}\n${goalsSummary}`;

            // Suggestion Prompt
            const suggestionPrompt = `${AI_PERSONA}\nYour task is to suggest simple, practical meal or snack ideas.\n\nUser Request: "${message}"\n\nContext:\n${mealSuggestionContext}\n\nInstructions:\n1. Based on the user request and context (profile/goals), suggest 2-3 concise meal or snack ideas.\n2. Keep suggestions practical and easy to prepare.\n3. Do NOT estimate nutrition unless specifically asked.\n4. Respond directly with the suggestions in a friendly, conversational tone. Do not repeat the context.`;
            const suggestionResponse = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "system", content: suggestionPrompt }], temperature: 0.7, max_tokens: 150 });
            const mealSuggestionsFromAI = suggestionResponse.choices[0].message?.content || 'Sorry, I couldn\'t think of any suggestions right now.';
            responseData = { status: 'success', message: mealSuggestionsFromAI, response_type: 'meal_suggestion_provided' };
          } catch (suggestionError) {
            console.error("Error generating meal suggestion:", suggestionError);
            responseData = { status: 'error', message: `Sorry, I had trouble coming up with meal suggestions. Please try asking again shortly.`, response_type: 'suggestion_error' };
            return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
          }
        } // End if (determinedIntent === 'request_meal_suggestion')

        else { // Assumed 'ask_general_question' or fallback
          console.log("Handling 'ask_general_question' intent (fetching context).");
          let goalsData: any[] = []; let logsData: any[] = []; let fetchContextError = null; let nutrientKeysFromGoals: string[] = [];
          try {
            const today = new Date(); const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString(); const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
            // Fetch Goals
            const goalsResult = await supabaseClient.from('user_goals').select('nutrient, target_value, unit').eq('user_id', userId);
            if (goalsResult.error) { throw new Error(`Goals fetch failed: ${goalsResult.error.message}`); }
            goalsData = goalsResult.data || []; nutrientKeysFromGoals = goalsData.map(goal => goal.nutrient);
            // Fetch Logs (conditional)
            if (nutrientKeysFromGoals.length > 0) {
              const logSelectColumns = ['timestamp', ...nutrientKeysFromGoals].join(',');
              const logsResult = await supabaseClient.from('food_log').select(logSelectColumns).eq('user_id', userId).gte('timestamp', startOfDay).lte('timestamp', endOfDay);
              if (logsResult.error) { throw new Error(`Logs fetch failed: ${logsResult.error.message}`); } logsData = logsResult.data || [];
            } else { logsData = []; }
          } catch (contextError) { console.warn("Failed to fetch context for general question:", contextError.message); fetchContextError = contextError.message; }

          // Calculate totals
          const dailyTotals: Record<string, number> = {}; const trackedNutrients: string[] = [];
          if (goalsData.length > 0) {
             goalsData.forEach(goal => { dailyTotals[goal.nutrient] = 0; });
             if (logsData.length > 0) { logsData.forEach(log => { goalsData.forEach(goal => { const nutrientKey = goal.nutrient; if (log[nutrientKey] !== undefined && log[nutrientKey] !== null) { try { const value = parseFloat(log[nutrientKey]); if (!isNaN(value)) { dailyTotals[nutrientKey] += value; } } catch (e) { console.warn(`Error parsing log value for ${nutrientKey}: ${log[nutrientKey]}`, e); } } }); }); }
             goalsData.forEach(goal => { const nutrientKey = goal.nutrient; const nutrientDetails = nutrientKey.split('_'); const nutrientName = nutrientDetails[0].charAt(0).toUpperCase() + nutrientDetails[0].slice(1); const unit = goal.unit || nutrientDetails[1] || ''; const targetValue = goal.target_value; const currentValue = (dailyTotals[nutrientKey] ?? 0).toFixed(1); trackedNutrients.push(`${nutrientName} (Goal: ${targetValue}${unit}, Current: ${currentValue}${unit})`); });
          }

          // Answer Prompt
          let answerSystemPrompt = `${AI_PERSONA} Your primary goal is to answer the user's question clearly and concisely.\n\nUser Question: "${message}"\n\nContext (Use subtly if relevant, do not just list it):`;
          if (trackedNutrients.length > 0) answerSystemPrompt += `\n- User's Tracked Goals/Progress Today: ${trackedNutrients.join(', ')}`; else answerSystemPrompt += `\n- User has no specific goals set yet.`;
          if (fetchContextError) answerSystemPrompt += `\n- Note: Error fetching full context: ${fetchContextError}`;
          answerSystemPrompt += `\n\nInstructions:\n1. Directly answer the User Question. Be supportive and conversational.\n2. If context (goals/progress) is relevant, weave it in naturally & encouragingly.\n3. After answering, if appropriate, add ONE concise, relevant suggestion OR follow-up question. Keep it natural. If none fits, just answer.`;

          const answerResponse = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "system", content: answerSystemPrompt }, { role: "user", content: message }], temperature: 0.6 });
          const finalAnswer = answerResponse.choices[0].message?.content || 'Sorry, I couldn\'t quite generate an answer for that.';
          responseData = { status: 'success', message: finalAnswer, response_type: 'answer' };
        } // End else (ask_general_question)

        // Store conversation in database (common to all non-correction paths in Branch 3)
        if (responseData && responseData.status === 'success') {
          try {
            const { error: insertError } = await supabaseClient.from('conversations').insert({ user_id: userId, message: message || `Action: ${action}`, response: responseData.message, response_type: responseData.response_type || 'unknown', timestamp: new Date().toISOString() });
            if (insertError) { console.error(`Database error storing conversation: ${insertError.message || JSON.stringify(insertError)}`); }
          } catch (dbError) { console.error("Exception during conversation storage:", dbError); }
        } else { console.log("Skipping conversation storage due to non-success responseData status:", responseData?.status); }

        // Return final response for non-correction path
        // Ensure responseData is defined before trying to access status
         const finalStatus = responseData?.status === 'success' ? 200 : (responseData?.status === 'error' ? 500 : 400);
        return new Response( JSON.stringify(responseData || {status: 'error', message: 'Internal processing error.'}), { status: finalStatus, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Added check and Semicolon

      } // --- Normal Intent Processing END ---
    } // End else if (message)

    // --- Branch 4: Handle Unknown Request Types ---
    else {
      console.warn("Unknown request type received:", { message, context, action, recipe_data });
      responseData = { status: 'error', message: 'Unknown request type. Please provide a message, recipe context, or recommendation action.' };
      return new Response( JSON.stringify(responseData), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } ); // Semicolon already present
    }

  } catch (error) { // Outermost Catch block
    console.error('Unhandled error in edge function:', error);
    // Define the error response object separately for clarity
    const errorResponse = {
        status: 'error',
        message: 'An unexpected server error occurred. Please try again later.'
    };
    return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    }); // Semicolon Added
  } // End Outermost Catch block
}); // End Deno.serve

/**
 * Filters nutrition data based on user goals
 * @param fullNutritionData Object containing all nutrition values from OpenAI
 * @param userId User ID for querying their tracked nutrients
 * @param supabaseClient Supabase client instance
 * @returns Filtered nutrition data containing only tracked nutrients
 */
async function filterNutritionDataForUserGoals(
  fullNutritionData: Record<string, any>,
  userId: string,
  supabaseClient: SupabaseClient
): Promise<Record<string, any>> {
  try {
    // Query the user_goals table to get the nutrients the user is tracking
    const { data: goalsData, error: goalsError } = await supabaseClient
      .from('user_goals')
      .select('nutrient')
      .eq('user_id', userId);
    
    // If query fails or returns no goals, log warning and return original data
    if (goalsError) {
      console.warn(`Error fetching user goals for filtering nutrition data: ${goalsError.message}`);
      return { ...fullNutritionData }; // Return copy of original data
    }
    
    if (!goalsData || goalsData.length === 0) {
      console.log(`No goals found for user ${userId}, returning all nutrition data`);
      return { ...fullNutritionData }; // Return copy of original data
    }
    
    // Extract unique nutrient keys from goals
    const trackedNutrientKeys = [...new Set(goalsData.map(goal => goal.nutrient))];
    console.log(`User ${userId} is tracking ${trackedNutrientKeys.length} nutrients: ${trackedNutrientKeys.join(', ')}`);
    
    // Create filtered nutrition data object with only tracked nutrients
    const filteredNutritionData: Record<string, any> = {};
    
    // Copy only the tracked nutrient values from full data to filtered data
    trackedNutrientKeys.forEach(key => {
      if (key in fullNutritionData) {
        filteredNutritionData[key] = fullNutritionData[key];
      }
    });
    
    // Always include calories even if not explicitly tracked
    if ('calories' in fullNutritionData && !('calories' in filteredNutritionData)) {
      filteredNutritionData['calories'] = fullNutritionData['calories'];
    }
    
    console.log(`Filtered nutrition data from ${Object.keys(fullNutritionData).length} to ${Object.keys(filteredNutritionData).length} nutrients`);
    return filteredNutritionData;
    
  } catch (error) {
    // Handle any unexpected errors
    console.error(`Unexpected error in filterNutritionDataForUserGoals: ${error instanceof Error ? error.message : String(error)}`);
    // Return original data as fallback
    return { ...fullNutritionData };
  }
}