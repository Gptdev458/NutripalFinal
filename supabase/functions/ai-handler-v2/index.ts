// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Import necessary libraries
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";
import { OpenAI } from "npm:openai@^4.47.1";

console.log("Hello from Functions!")

// Define CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define AI Persona - Updated in Step C
const AI_PERSONA = "You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses.";

// *** STEP A: Define Master Nutrient Keys ***
// This single list should contain all nutrient keys used across the system
// (Database columns, Frontend MASTER_NUTRIENT_LIST, AI prompts)
const MASTER_NUTRIENT_KEYS = [
  // General
  "calories", "water_g",
  // Macros
  "protein_g", "fat_total_g", "carbs_g",
  // Fat Subtypes
  "fat_saturated_g", "fat_polyunsaturated_g", "fat_monounsaturated_g", "fat_trans_g",
  // Carb Subtypes
  "fiber_g", "sugar_g", "sugar_added_g",
  // Sterols
  "cholesterol_mg",
  // Minerals
  "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg",
  "phosphorus_mg", "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg",
  // Vitamins (Fat-Soluble)
  "vitamin_a_mcg_rae", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
  // Vitamins (Water-Soluble)
  "vitamin_c_mg", "thiamin_mg", "riboflavin_mg", "niacin_mg",
  "pantothenic_acid_mg", "vitamin_b6_mg", "biotin_mcg",
  "folate_mcg_dfe", "vitamin_b12_mcg"
  // Note: Ensure 'water_g' aligns with frontend/DB, adjust if needed (e.g., water_l)
];
// *** End STEP A ***

// Helper function for random follow-up prompts
const getRandomFollowUp = (): string => {
  const followUps = [
    " Anything else I can help you log?",
    " How are you feeling about your nutrition goals today?",
    " What else did you eat?",
    " Keep up the great work!",
    "" // Add empty string for cases with no follow-up
  ];
  return followUps[Math.floor(Math.random() * followUps.length)];
};

// --- Refactored Helper Function for OpenAI Recommendations ---
async function getOpenAiRecommendations(profileData: any, openai: OpenAI): Promise<any> {
  const { age, weight_kg, height_cm, sex } = profileData;

  // Construct prompt for OpenAI Goal Recommendations - Removed AI_PERSONA preamble
  const recommendationPrompt = `Calculate recommended daily nutritional goals based on the following user profile:
  - Age: ${age} years
  - Weight: ${weight_kg} kg
  - Height: ${height_cm} cm
  - Sex: ${sex}

  Provide recommendations for the following nutrients: ${MASTER_NUTRIENT_KEYS.join(", ")}.

  Respond ONLY with a single JSON object where keys are the exact nutrient identifiers provided (e.g., "calories", "protein_g") and values are the recommended daily amounts as numbers. If a recommendation cannot be determined, use null. Do not include any other text, explanation, or units in the JSON values or keys.`;

  // Call OpenAI API for recommendations
  const openaiResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "system", content: recommendationPrompt }],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  // Extract and parse the JSON response
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
        recommendations[key] = null; // Ensure numeric or null
      }
    });
  } catch (jsonError) {
    console.error("Failed to parse recommendations JSON:", jsonError, "Raw content:", aiResponseContent);
    throw new Error(`Failed to parse nutrition recommendations: ${jsonError.message}`);
  }
  return recommendations;
}
// --- End Helper Function ---

// Main request handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let userId: string;
  let supabaseClient: SupabaseClient;
  let responseData; // Declare responseData here

  try {
    // --- Authorization Header Check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      // This response is fine as is - indicates an issue with the request itself
      return new Response( JSON.stringify({ status: 'error', message: 'Unauthorized', detail: 'No authorization header provided' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- Initialize Supabase Client ---
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase configuration');
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    } catch (error) {
      console.error('Critical Error: Initializing Supabase client failed:', error);
      // STEP I: User-friendly error
      return new Response( JSON.stringify({ status: 'error', message: 'Sorry, there was a server configuration issue. Please try again later.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Verify User Authentication ---
    try {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');
      userId = user.id;
    } catch (error) {
      console.error('Authentication error:', error);
      // STEP I: User-friendly error
      return new Response( JSON.stringify({ status: 'error', message: 'Authentication failed. Please try logging in again.' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Parse Request Body ---
    let message, context, action, profile;
    try {
      const requestData = await req.json();
      ({ message, context, action, profile } = requestData);
      if (!action && !message) throw new Error('Either message or action is required');
      if (action === 'get_recommendations') {
          if (!profile || typeof profile !== 'object' || profile === null) throw new Error('Profile data required for recommendations');
          const { age, weight_kg, height_cm, sex } = profile;
          if (typeof age !== 'number' || age <= 0) throw new Error('Valid age required');
          if (typeof weight_kg !== 'number' || weight_kg <= 0) throw new Error('Valid weight required');
          if (typeof height_cm !== 'number' || height_cm <= 0) throw new Error('Valid height required');
          if (typeof sex !== 'string' || !['male', 'female', 'other'].includes(sex.toLowerCase())) throw new Error('Valid sex required');
      }
    } catch (error) {
      console.error('Error parsing request body:', error);
       // STEP I: User-friendly error
      return new Response( JSON.stringify({ status: 'error', message: 'There was a problem understanding your request.' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- Initialize OpenAI Client ---
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("Critical Error: OpenAI API key is missing");
       // STEP I: User-friendly error
      return new Response( JSON.stringify({ status: 'error', message: 'Sorry, the AI service is not configured correctly. Please contact support.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Main logic branches
    let responseData;

    // --- Branch 1: Direct Goal Recommendations ---
    if (action === 'get_recommendations') {
      console.log("Branch 1: Handling direct recommendation request.");
      try {
        const recommendations = await getOpenAiRecommendations(profile, openai);
        responseData = { status: 'success', recommendations: recommendations };
      } catch (error) {
        console.error("Error getting direct recommendations:", error);
        responseData = { status: 'error', message: 'Hmm, I couldn\'t calculate recommendations right now. Please try again later.' };
        // Ensure error response is returned correctly
        return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    }
    // --- Branch 2: Recipe Logging ---
    else if (context?.type === 'ingredients' && context?.recipeName) {
      console.log("Branch 2: Handling recipe logging via context.");
      const nutrientKeys = MASTER_NUTRIENT_KEYS;
      const prompt = `User wants to log a recipe named "${context.recipeName}" with ingredients: "${message}". Estimate nutritional content for the *entire* recipe. Respond ONLY with a single JSON object: {"recipeName": "${context.recipeName}", "description": "${message}", ${nutrientKeys.map(k => `"${k}": number|null`).join(", ")}}. Use null if unknown. No extra text.`;
      try {
        // Call OpenAI API for nutrition estimation
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [ { role: "system", content: prompt }, { role: "user", content: message } ], // User message needed here for recipe details
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

        // Prepare recipe object
        const newRecipe = {
          user_id: userId,
          recipe_name: context.recipeName,
          description: message,
          ...Object.fromEntries( nutrientKeys.map(key => [key, nutritionData[key] ?? null]) ),
          created_at: new Date().toISOString()
        };

        // Insert recipe
        const { data: recipeData, error: recipeError } = await supabaseClient
          .from('user_recipes').insert(newRecipe).select('id').single();
        if (recipeError) throw new Error(`Failed to save recipe: ${recipeError.message}`);
        const newRecipeId = recipeData.id;

        // Prepare food log entry
        const foodLogEntry = {
          user_id: userId,
          food_name: context.recipeName,
          timestamp: new Date().toISOString(),
          source: 'ai_chat_recipe_new',
          recipe_id: newRecipeId,
          ...Object.fromEntries( nutrientKeys.map(key => [key, nutritionData[key] ?? null]) ),
          created_at: new Date().toISOString()
        };

        // Insert food log entry
        const { error: logError } = await supabaseClient.from('food_log').insert(foodLogEntry);
        if (logError) throw new Error(`Failed to log recipe entry: ${logError.message}`);

        // Set response data
        responseData = {
          status: 'success',
          message: `Got it! Saved '${context.recipeName}' to your recipes and logged it for today.${getRandomFollowUp()}`,
          recipe: { id: newRecipeId, name: context.recipeName },
          response_type: 'recipe_logged' // Indicate recipe logging occurred
        };

      } catch (recipeLogError) {
        console.error("Error processing recipe logging:", recipeLogError);
        // STEP I: User-friendly error
        return new Response( JSON.stringify({ status: 'error', message: `Sorry, I encountered an issue saving the recipe '${context.recipeName}'. Please try again.` }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    } 
    // Branch 3: Handle General Chat / Intent Recognition
    else if (message) {
      console.log("Branch 3: Handling general chat message for intent recognition.");
      let determinedIntent = 'unknown';
      let profileData = null;
      let hasCompleteProfile = false;

      try {
        // --- STEP D: Intent Recognition First ---

        // Fetch profile status needed for intent prompt context
        try {
          const { data: fetchedProfile, error: profileError } = await supabaseClient
            .from('user_profiles')
            .select('age, weight_kg, height_cm, sex') // Select only needed fields for check
            .eq('user_id', userId)
            .maybeSingle();
          if (profileError) console.warn("Could not fetch profile status for intent check:", profileError.message);
          else if (fetchedProfile) {
            profileData = fetchedProfile; // Store for later potential use
            hasCompleteProfile = !!(fetchedProfile.age && fetchedProfile.weight_kg && fetchedProfile.height_cm && fetchedProfile.sex);
          }
        } catch (profileFetchError) {
          console.warn("Error fetching profile status:", profileFetchError.message);
          // Continue, assuming profile is incomplete for safety
        }

        // Minimal prompt focused *only* on intent - Added more meal suggestion examples
        const intentSystemPrompt = `Your role: Classify the user's primary intent. Respond ONLY with ONE keyword: 'log_food', 'request_meal_suggestion', or 'ask_general_question'.

        Examples:
        - "Log an apple", "I had chicken soup", "Add 2 eggs" -> log_food
        - "What can I eat for lunch?", "Suggest a healthy breakfast", "Ideas for dinner", "Recommend meals for my goals", "what should I eat today?", "give me breakfast ideas" -> request_meal_suggestion
        - "How much protein?", "Why are carbs important?", "Hello", nutrient goal questions, requests for nutrient recommendations -> ask_general_question

        User profile status: ${hasCompleteProfile ? 'Complete' : 'Incomplete'}. (Consider this when classifying 'request_meal_suggestion').
        User Message: "${message}"

        Output ONLY the keyword.`;

        console.log("Calling OpenAI for intent recognition...");
        const intentResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo", // Can use a cheaper/faster model if sufficient
          messages: [{ role: "system", content: intentSystemPrompt }],
          temperature: 0.1, // Low temp for classification
          max_tokens: 10, // Limit response length
        });

        const rawIntent = intentResponse.choices[0].message?.content?.trim().toLowerCase() || 'unknown';
        console.log("Raw intent from OpenAI:", rawIntent);

        // Validate and map raw intent
        if (rawIntent.includes('log_food')) determinedIntent = 'log_food';
        else if (rawIntent.includes('request_meal_suggestion')) determinedIntent = 'request_meal_suggestion';
        else determinedIntent = 'ask_general_question';
        console.log("Determined Intent:", determinedIntent);

        // --- End Intent Recognition ---

        // --- Handle Based on Determined Intent ---
        
        if (determinedIntent === 'request_meal_suggestion') {
          console.log("Handling 'request_meal_suggestion' intent.");
          let mealSuggestionContext = "";
          let goalsSummary = "No specific goals set.";
          let profileSummary = "Profile information not available.";

          try {
            // 1. Fetch Context (Goals and Profile) - Profile might already be in profileData
            console.log("Fetching context for meal suggestion...");

            // Fetch Goals
            const { data: goalsData, error: goalsError } = await supabaseClient
              .from('user_goals')
              .select('nutrient, target_value, unit')
              .eq('user_id', userId);

            if (goalsError) {
              console.warn("Could not fetch goals for meal suggestion context:", goalsError.message);
              // Proceed without goals context, maybe mention error later
            } else if (goalsData && goalsData.length > 0) {
              // Summarize key goals (e.g., calories, protein)
              const calorieGoal = goalsData.find(g => g.nutrient === 'calories');
              const proteinGoal = goalsData.find(g => g.nutrient === 'protein_g');
              let summaryParts = [];
              if (calorieGoal) summaryParts.push(`Calories: ~${calorieGoal.target_value} kcal`);
              if (proteinGoal) summaryParts.push(`Protein: ~${proteinGoal.target_value}g`);
              if (summaryParts.length > 0) goalsSummary = `Key Goals: ${summaryParts.join(', ')}.`;
              else goalsSummary = `${goalsData.length} goals set (details unspecified).`;
            }

            // Use profile fetched earlier if available
            if (profileData) {
              profileSummary = `User Profile: Age ${profileData.age}, Weight ${profileData.weight_kg}kg, Height ${profileData.height_cm}cm, Sex ${profileData.sex}.`;
            } else {
                 // Optionally try fetching again if needed, but let's assume intent fetch was sufficient
                 console.log("Profile data not available from initial check.");
            }

            // Combine context for the prompt
            mealSuggestionContext = `${profileSummary}\n${goalsSummary}`;

            // 2. Construct Meal Suggestion Prompt
            const suggestionPrompt = `${AI_PERSONA}
            Your task is to suggest simple, practical meal or snack ideas.

            User Request: "${message}"

            Context:
            ${mealSuggestionContext}

            Instructions:
            1. Based on the user request and context (profile/goals), suggest 2-3 concise meal or snack ideas.
            2. Keep suggestions practical and easy to prepare.
            3. Do NOT estimate nutrition for the suggestions unless specifically asked in the user request.
            4. Respond directly with the suggestions in a friendly, conversational tone. Do not repeat the context.`;

            // 3. Call OpenAI for Suggestions
            console.log("Calling OpenAI for meal suggestions...");
            const suggestionResponse = await openai.chat.completions.create({
              model: "gpt-3.5-turbo",
              messages: [{ role: "system", content: suggestionPrompt }],
              temperature: 0.7, // Higher temp for creativity
              max_tokens: 150, // Allow for a few suggestions
            });

            const mealSuggestionsFromAI = suggestionResponse.choices[0].message?.content || 'Sorry, I couldn\'t think of any suggestions right now.';

            // 4. Set Response Data
            responseData = {
              status: 'success',
              message: mealSuggestionsFromAI,
              response_type: 'meal_suggestion_provided' // New type
            };

          } catch (suggestionError) {
            console.error("Error generating meal suggestion:", suggestionError);
            // STEP I: User-friendly error
            responseData = {
              status: 'error',
              message: `Sorry, I had trouble coming up with meal suggestions. Please try asking again shortly.`,
              response_type: 'suggestion_error'
            };
             // Return error immediately for suggestion failure
             return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
          }
        } 
        else if (determinedIntent === 'log_food') {
          console.log("Handling 'log_food' intent.");
          // Use MASTER_NUTRIENT_KEYS for the OpenAI prompt, as we want it to estimate all it can.
          const allNutrientKeysForPrompt = MASTER_NUTRIENT_KEYS;
          const foodPrompt = `User wants to log: "${message}". Estimate nutrition. Respond ONLY with a single JSON object: {"food_name": "Concise food name derived from message", ${allNutrientKeysForPrompt.map(k => `"${k}": number|null`).join(", ")}}. Use null if unknown. No extra text.`;

          try {
            // --- STEP FIX_GOAL_FILTERING_BUG: Fetch Active User Goals ---
            let activeGoalKeys: string[] = [];
            try {
              console.log("Fetching user goals for filtering log entry...");
              const { data: goalsData, error: goalsError } = await supabaseClient
                .from('user_goals')
                .select('nutrient') // Select only the nutrient key
                .eq('user_id', userId);

              if (goalsError) {
                // Log the error but proceed, maybe with a default set or log all?
                // For now, log the error and default to logging basic macros + calories if goals fail
                console.error('Error fetching user goals for log filtering:', goalsError);
                activeGoalKeys = ['calories', 'protein_g', 'carbs_g', 'fat_total_g']; // Default fallback
                console.warn("Falling back to logging only basic nutrients due to goal fetch error.");
              } else if (goalsData && goalsData.length > 0) {
                activeGoalKeys = goalsData.map(goal => goal.nutrient);
                // Always ensure calories is logged, even if not an explicit goal
                if (!activeGoalKeys.includes('calories')) {
                    activeGoalKeys.push('calories');
                }
                console.log('Fetched active goal keys for filtering:', JSON.stringify(activeGoalKeys, null, 2));
              } else {
                 console.log("No active goals found for user. Logging only basic nutrients.");
                 activeGoalKeys = ['calories', 'protein_g', 'carbs_g', 'fat_total_g']; // Default if no goals set
              }
            } catch (fetchGoalsErr) {
               console.error('Exception fetching user goals:', fetchGoalsErr);
               activeGoalKeys = ['calories', 'protein_g', 'carbs_g', 'fat_total_g']; // Default fallback on exception
               console.warn("Falling back to logging only basic nutrients due to goal fetch exception.");
            }
            // --- End STEP FIX_GOAL_FILTERING_BUG ---

            console.log("Calling OpenAI for food nutrition estimation...");
            const foodResponse = await openai.chat.completions.create({
              model: "gpt-3.5-turbo",
              messages: [{ role: "system", content: foodPrompt }],
              temperature: 0.3,
              response_format: { type: "json_object" }
            });
            const foodResponseContent = foodResponse.choices[0].message?.content || '';
            let parsedNutrition: Record<string, any> = {};

            try {
               parsedNutrition = JSON.parse(foodResponseContent);
               console.log("DEBUG: Parsed nutrition data from OpenAI:", JSON.stringify(parsedNutrition, null, 2));
            } catch (parseError) {
               console.error("Failed to parse JSON from OpenAI food response:", foodResponseContent, parseError);
               throw new Error("AI response was not valid JSON.");
            }

            // --- STEP FIX_GOAL_FILTERING_BUG: Filter nutrients based on active goals ---
            const nutritionToLog: Record<string, any> = {};
            console.log("Filtering OpenAI nutrients based on active goals:", activeGoalKeys);
            activeGoalKeys.forEach(key => {
                const valueFromAI = parsedNutrition[key];
                // Check if the key exists in the OpenAI response (even if null/0)
                if (parsedNutrition.hasOwnProperty(key)) {
                    console.log(`DEBUG: Including active goal key: '${key}', Value from OpenAI: ${valueFromAI} (Type: ${typeof valueFromAI})`);
                    nutritionToLog[key] = valueFromAI ?? null; // Use value from AI, default to null if explicitly null/undefined
                } else {
                    // OpenAI did *not* provide a value for this active goal
                    console.warn(`DEBUG: OpenAI did not provide value for tracked goal: '${key}'. Logging null.`);
                    nutritionToLog[key] = null;
                }
            });
            // --- End STEP FIX_GOAL_FILTERING_BUG ---

            // Construct the final object for database insertion
            const foodLogEntry = {
              user_id: userId,
              food_name: parsedNutrition.food_name || message, // Use AI name or fallback
              timestamp: new Date().toISOString(),
              source: 'ai_chat_item',
              recipe_id: null,
              ...nutritionToLog, // Spread the *filtered* nutrient data
              created_at: new Date().toISOString()
            };

            console.log("DEBUG: Final foodLogEntry object for DB insert (filtered):", JSON.stringify(foodLogEntry, null, 2));

            // Insert into the database
            console.log("Attempting to insert filtered food log entry into database...");
            const { error: logError } = await supabaseClient.from('food_log').insert(foodLogEntry);

            if (logError) {
              console.error("Supabase DB insert error:", logError);
              throw new Error(`DB Error: ${logError.message}`);
            }

            // Success response
            responseData = {
              status: 'success',
              message: `Alright, logged '${foodLogEntry.food_name}' for you.${getRandomFollowUp()}`, // Removed "(tracking relevant goals)"
              response_type: 'item_logged'
            };
            console.log("Filtered food log entry inserted successfully.");

          } catch (foodLogError) {
            // Catch errors from OpenAI call, JSON parsing, or DB insert
            console.error("Error processing food item logging:", foodLogError);
            responseData = {
              status: 'error',
              message: `Sorry, I encountered an issue logging '${message}'. Please try again. (${foodLogError.message})`, // Include error message detail
              response_type: 'log_error'
            };
            // Return 500 error response immediately
            return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
          }
        } 
        else { // Assumed 'ask_general_question' or fallback
          console.log("Handling 'ask_general_question' intent (fetching context).");
          // Fetch context (goals, logs) ONLY for answering general questions
          let goalsData: any[] = []; // Initialize with type and default value
          let logsData: any[] = []; // Initialize with type and default value
          let fetchContextError = null;
          let nutrientKeysFromGoals: string[] = []; // Store nutrient keys from goals

          try {
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

            // --- Step E: Optimized Goal Fetch ---
            console.log("Fetching optimized goals context...");
            const goalsResult = await supabaseClient
              .from('user_goals')
              .select('nutrient, target_value, unit') // Select only needed columns
              .eq('user_id', userId);

            if (goalsResult.error) {
                 throw new Error(`Goals fetch failed: ${goalsResult.error.message}`);
            }
            goalsData = goalsResult.data || [];
            nutrientKeysFromGoals = goalsData.map(goal => goal.nutrient);
            console.log(`Found ${goalsData.length} goals. Nutrient keys for log query:`, nutrientKeysFromGoals);

            // --- Step E: Optimized Log Fetch (conditional on having goals) ---
            if (nutrientKeysFromGoals.length > 0) {
                 const logSelectColumns = ['timestamp', ...nutrientKeysFromGoals].join(',');
                 console.log(`Fetching optimized logs context with columns: ${logSelectColumns}`);
                 const logsResult = await supabaseClient
                   .from('food_log')
                   .select(logSelectColumns) // Select timestamp + only nutrients in goals
                   .eq('user_id', userId)
                   .gte('timestamp', startOfDay)
                   .lte('timestamp', endOfDay);

                 if (logsResult.error) {
                     throw new Error(`Logs fetch failed: ${logsResult.error.message}`);
                 }
                 logsData = logsResult.data || [];
                 console.log(`Found ${logsData.length} log entries for today.`);
            } else {
                 console.log("No goals found, skipping food log fetch for context.");
                 logsData = []; // Ensure logsData is empty if no goals
            }

          } catch (contextError) {
            console.warn("Failed to fetch context for general question:", contextError.message);
            fetchContextError = contextError.message; // Store error to potentially inform AI
          }

          // Calculate totals (uses the fetched optimized data)
          const dailyTotals = {};
          const trackedNutrients: string[] = [];
          if (goalsData.length > 0) {
            goalsData.forEach(goal => { dailyTotals[goal.nutrient] = 0; });
            if (logsData.length > 0) {
               logsData.forEach(log => {
                 goalsData.forEach(goal => {
                   const nutrientKey = goal.nutrient;
                   // Check if the key exists in the log data (it should if selected correctly)
                   if (log[nutrientKey] !== undefined && log[nutrientKey] !== null) {
                      try {
                           // Ensure value is treated as a number
                           const value = parseFloat(log[nutrientKey]);
                           if (!isNaN(value)) {
                               dailyTotals[nutrientKey] += value;
                           } else {
                               console.warn(`Log entry for ${nutrientKey} had non-numeric value: ${log[nutrientKey]}`);
                           }
                      } catch (e) {
                           console.warn(`Error parsing log value for ${nutrientKey}: ${log[nutrientKey]}`, e);
                      }
                   }
                 });
               });
            }
            // Construct trackedNutrients string using goalsData
            goalsData.forEach(goal => {
              const nutrientKey = goal.nutrient;
              // Attempt to format name - split should work on 'protein_g' etc.
              const nutrientDetails = nutrientKey.split('_');
              const nutrientName = nutrientDetails[0].charAt(0).toUpperCase() + nutrientDetails[0].slice(1);
              const unit = goal.unit || nutrientDetails[1] || ''; // Use unit from goal
              const targetValue = goal.target_value;
              const currentValue = (dailyTotals[nutrientKey] ?? 0).toFixed(1);
              trackedNutrients.push(`${nutrientName} (Goal: ${targetValue}${unit}, Current: ${currentValue}${unit})`);
            });
          }

          // --- STEP F: Refined Answer Prompt (Already includes AI_PERSONA) ---
          let answerSystemPrompt = `${AI_PERSONA} Your primary goal is to answer the user's question clearly and concisely.

          User Question: "${message}"

          Context (Use subtly if relevant, do not just list it):`;
          if (trackedNutrients.length > 0) answerSystemPrompt += `\n- User's Tracked Goals/Progress Today: ${trackedNutrients.join(', ')}`;
          else answerSystemPrompt += `\n- User has no specific goals set yet.`;
          if (fetchContextError) answerSystemPrompt += `\n- Note: Error fetching full context: ${fetchContextError}`;

          answerSystemPrompt += `\n\nInstructions:
          1. Directly answer the User Question. Be supportive and conversational.
          2. If context (goals/progress) is relevant, weave it in naturally & encouragingly.
          3. After answering, if appropriate, add ONE concise, relevant suggestion OR follow-up question (e.g., related to goals, logs, hydration). Keep it natural. If none fits, just answer.`;
          // --- End STEP F ---

          console.log("Calling OpenAI for general question answer with refined prompt...");
          const answerResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: answerSystemPrompt }, { role: "user", content: message }], // User message repeated for context focus
            temperature: 0.6, // Slightly increased temperature for more natural suggestions
          });

          const finalAnswer = answerResponse.choices[0].message?.content || 'Sorry, I couldn\'t quite generate an answer for that.';

          responseData = {
            status: 'success',
            message: finalAnswer,
            response_type: 'answer'
          };
        }

      } catch (error) { // Catch errors during intent recognition or subsequent handling
        console.error("Error in Branch 3 processing:", error);
        responseData = {
          status: 'error',
          message: 'Sorry, I encountered an issue processing your message. Please try again.'
        };
        // Consider appropriate status code
        return new Response( JSON.stringify(responseData), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    } 
    // Branch 4: Handle Unknown Request Types (No message, no context, no action)
    else {
      console.warn("Unknown request type received:", { message, context, action, profile });
      responseData = {
        status: 'error',
        message: 'Unknown request type. Please provide a message, recipe context, or recommendation action.'
      };
      return new Response(
        JSON.stringify(responseData),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Store conversation in database (Only if responseData indicates success)
    if (responseData && responseData.status === 'success') {
      try {
        const { error: insertError } = await supabaseClient
          .from('conversations')
          .insert({
            user_id: userId,
            message: message || `Action: ${action}`, // Use message or action for input
            response: responseData.message, // Store the final message sent to user
            response_type: responseData.response_type || 'unknown', // Store the type
            timestamp: new Date().toISOString()
          });

        if (insertError) {
          console.error("Raw Supabase insertError object:", JSON.stringify(insertError, null, 2));
          const errorMessage = insertError.message || JSON.stringify(insertError);
          // Log error but don't fail the entire request just because conversation storage failed
          console.error(`Database error storing conversation: ${errorMessage}`); 
          // Potentially add flag to responseData indicating storage failure?
        }
      } catch (dbError) {
          console.error("Exception during conversation storage:", dbError);
           if (dbError instanceof Error) {
              console.error("Error message:", dbError.message);
              console.error("Error stack:", dbError.stack);
           }
          // Log error but proceed
      }
    } else {
        console.log("Skipping conversation storage due to non-success responseData status:", responseData?.status);
    }

    // Log the final response data BEFORE sending
    console.log(`Final responseData being sent (Status ${responseData.status === 'success' ? 200 : (responseData.status === 'error' ? 500 : 400)}):`, JSON.stringify(responseData, null, 2));

    // Return final response (could be success or error determined earlier)
    return new Response(
      JSON.stringify(responseData),
      {
        status: responseData.status === 'success' ? 200 : (responseData.status === 'error' ? 500 : 400), // Use more specific status
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
    
  } catch (error) {
    // Catch any truly unhandled errors (e.g., during client init, auth, request parsing)
    console.error('Unhandled error in edge function:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'An unexpected server error occurred. Please try again later.'
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/ai-handler-v2' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"message":"Recommend nutrient goals for me"}' // Example for testing chat recommendation intent

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/ai-handler-v2' \
    --header 'Authorization: Bearer <YOUR_USER_JWT>' \
    --header 'Content-Type: application/json' \
    --data '{"action":"get_recommendations", "profile": {"age":30, "weight_kg":70, "height_cm":175, "sex":"male"}}' // Example for direct action call

*/
