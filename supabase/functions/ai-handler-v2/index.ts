// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Import necessary libraries
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from "openai";

console.log("Hello from Functions!")

// Define CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define AI Persona
const AI_PERSONA = 'You are NutriPal, a friendly and encouraging health assistant. Be conversational and supportive. Gently guide users towards logging food accurately and discussing their nutrition goals. Keep responses concise but friendly.';

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

// Main request handler
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Extract Authorization header (JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: No authorization header" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Create a Supabase client for this request context with the user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid user" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }
    
    const userId = user.id;

    // Parse request body
    const requestData = await req.json();
    const { message, context } = requestData;
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Bad request: Message is required" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize OpenAI client
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: OpenAI API key is missing" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }
    
    // Initialize the OpenAI client with v4 SDK
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Main logic based on context
    // This is where you'll implement Steps 3.2 - 3.6 from the requirements
    // For now, we'll implement a basic placeholder response
    
    // TODO: Implement full logic with context handling
    // - Classify message intent (log food, log recipe, question)
    // - Handle different types of requests
    // - Generate appropriate responses
    
    let responseData;
    
    if (context?.type === 'ingredients' && context?.recipeName) {
      // Define the nutrient keys from MASTER_NUTRIENT_LIST
      const nutrientKeys = [
        "calories", "water_g", 
        "protein_g", "fat_total_g", "carbs_g", 
        "fat_saturated_g", "fat_polyunsaturated_g", "fat_monounsaturated_g", "fat_trans_g", 
        "fiber_g", "sugar_g", "sugar_added_g", 
        "cholesterol_mg", 
        "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", 
        "phosphorus_mg", "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg",
        "vitamin_a_mcg_rae", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
        "vitamin_c_mg", "thiamin_mg", "riboflavin_mg", "niacin_mg", 
        "pantothenic_acid_mg", "vitamin_b6_mg", "biotin_mcg", 
        "folate_mcg_dfe", "vitamin_b12_mcg"
      ];
      
      // Construct prompt for OpenAI
      const prompt = `${AI_PERSONA} The user wants to log a recipe named "${context.recipeName}" with these ingredients: "${message}". Please estimate the nutritional content for the *entire* recipe. Respond ONLY with a single JSON object containing keys: "recipeName" (string, should be "${context.recipeName}"), "description" (string, should be the user's original ingredient message: "${message}"), and a key for each requested nutrient: ${nutrientKeys.join(", ")} (e.g., "calories": number|null, "protein_g": number|null, ...). If a value cannot be determined, use null. Do not include any other text or explanation outside the JSON object.`;
      
      try {
        // Call OpenAI API for nutrition estimation using v4 syntax
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: message }
          ],
          temperature: 0.3,
          response_format: { type: "json_object" }
        });
        
        // Extract and parse the JSON response with v4 syntax
        const aiResponseContent = openaiResponse.choices[0].message?.content || '';
        
        // Handle potential JSON parsing issues
        let nutritionData;
        try {
          // Parse the response - with response_format:json_object, we can directly parse
          nutritionData = JSON.parse(aiResponseContent);
        } catch (jsonError) {
          throw new Error(`Failed to parse nutrition data: ${jsonError.message}`);
        }
        
        // Prepare the recipe object for database insertion
        const newRecipe = {
          user_id: userId,
          recipe_name: context.recipeName,
          description: message,
          // Add all nutrient values from the response
          ...Object.fromEntries(
            nutrientKeys.map(key => [key, nutritionData[key] ?? null])
          ),
          created_at: new Date().toISOString()
        };
        
        // Insert the recipe into the user_recipes table
        const { data: recipeData, error: recipeError } = await supabaseClient
          .from('user_recipes')
          .insert(newRecipe)
          .select('id')
          .single();
        
        if (recipeError) {
          throw new Error(`Failed to save recipe: ${recipeError.message}`);
        }
        
        const newRecipeId = recipeData.id;
        
        // Prepare the food log entry
        const foodLogEntry = {
          user_id: userId,
          food_name: context.recipeName,
          timestamp: new Date().toISOString(),
          source: 'ai_chat_recipe_new',
          recipe_id: newRecipeId,
          // Add all nutrient values from the recipe
          ...Object.fromEntries(
            nutrientKeys.map(key => [key, nutritionData[key] ?? null])
          ),
          created_at: new Date().toISOString()
        };
        
        // Insert the food log entry
        const { error: logError } = await supabaseClient
          .from('food_log')
          .insert(foodLogEntry);
        
        if (logError) {
          throw new Error(`Failed to log recipe: ${logError.message}`);
        }
        
        // Set the response data - Refined message with random follow-up
        responseData = {
          status: 'success',
          message: `Got it! Saved '${context.recipeName}' to your recipes and logged it for today.${getRandomFollowUp()}`,
          recipe: {
            id: newRecipeId,
            name: context.recipeName
          }
        };
      } catch (aiError) {
        // Handle OpenAI or database errors
        console.error("Error processing nutrition data:", aiError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to process recipe: ${aiError.message}` 
          }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Handle messages without context - determine intent
      try {
        // Construct prompt for OpenAI to classify the message intent
        const intentPrompt = `${AI_PERSONA} User said: "${message}". How should I, NutriPal, understand this? Determine the primary intent ("log", "question", or "other"). If the intent is "log", also determine if it's for a specific named recipe ("recipe") or a list of food items ("items"). If it's a recipe, extract the most likely recipe name. Respond ONLY with a single JSON object containing keys: "intent" ("log" | "question" | "other"), "logType" ("recipe" | "items" | null), and "recipeName" (string | null). Do not add any conversational text outside the JSON.`;
        
        // Call OpenAI API to determine intent using v4 syntax
        const intentResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: intentPrompt },
            { role: "user", content: `User message: "${message}"` }
          ],
          temperature: 0.3,
          response_format: { type: "json_object" }
        });
        
        // Extract and parse the JSON response with v4 syntax
        const intentResponseContent = intentResponse.choices[0].message?.content || '';
        
        // Parse the JSON response - with response_format:json_object, we can directly parse
        let intentData;
        try {
          intentData = JSON.parse(intentResponseContent);
        } catch (jsonError) {
          throw new Error(`Failed to parse intent data: ${jsonError.message}`);
        }
        
        // Set response based on intent analysis
        responseData = {
          type: "intent_analysis",
          intent: intentData.intent,
          logType: intentData.logType,
          recipeName: intentData.recipeName,
          message: `Intent determined: ${intentData.intent}${intentData.logType ? `, type: ${intentData.logType}` : ''}${intentData.recipeName ? `, recipe: ${intentData.recipeName}` : ''}`,
          userId: userId
        };
        
        // Handle recipe logging intent
        if (intentData.intent === 'log' && intentData.logType === 'recipe') {
          // Extract recipe name
          const recipeName = intentData.recipeName;
          
          // If no recipe name was detected, treat as 'other'
          if (!recipeName) {
            responseData = {
              status: 'error',
              message: "Which recipe would you like to log?"
            };
          } else {
            // Query the user_recipes table to see if this recipe already exists
            const { data: recipeData, error: recipeQueryError } = await supabaseClient
              .from('user_recipes')
              .select(`
                id, 
                recipe_name,
                calories, water_g,
                protein_g, fat_total_g, carbs_g,
                fat_saturated_g, fat_polyunsaturated_g, fat_monounsaturated_g, fat_trans_g,
                fiber_g, sugar_g, sugar_added_g,
                cholesterol_mg,
                sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg,
                phosphorus_mg, zinc_mg, copper_mg, manganese_mg, selenium_mcg,
                vitamin_a_mcg_rae, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg,
                vitamin_c_mg, thiamin_mg, riboflavin_mg, niacin_mg,
                pantothenic_acid_mg, vitamin_b6_mg, biotin_mcg,
                folate_mcg_dfe, vitamin_b12_mcg
              `)
              .eq('user_id', userId)
              .ilike('recipe_name', recipeName)
              .limit(1);
            
            if (recipeQueryError) {
              throw new Error(`Error querying recipes: ${recipeQueryError.message}`);
            }
            
            // Check if recipe was found
            if (recipeData && recipeData.length > 0) {
              const foundRecipe = recipeData[0];
              
              // Prepare food log entry from existing recipe
              const foodLogEntry = {
                user_id: userId,
                food_name: foundRecipe.recipe_name,
                timestamp: new Date().toISOString(),
                source: 'ai_chat_recipe_saved',
                recipe_id: foundRecipe.id,
                // Add nutritional values
                calories: foundRecipe.calories,
                water_g: foundRecipe.water_g,
                protein_g: foundRecipe.protein_g,
                fat_total_g: foundRecipe.fat_total_g,
                carbs_g: foundRecipe.carbs_g,
                fat_saturated_g: foundRecipe.fat_saturated_g,
                fat_polyunsaturated_g: foundRecipe.fat_polyunsaturated_g,
                fat_monounsaturated_g: foundRecipe.fat_monounsaturated_g,
                fat_trans_g: foundRecipe.fat_trans_g,
                fiber_g: foundRecipe.fiber_g,
                sugar_g: foundRecipe.sugar_g,
                sugar_added_g: foundRecipe.sugar_added_g,
                cholesterol_mg: foundRecipe.cholesterol_mg,
                sodium_mg: foundRecipe.sodium_mg,
                potassium_mg: foundRecipe.potassium_mg,
                calcium_mg: foundRecipe.calcium_mg,
                iron_mg: foundRecipe.iron_mg,
                magnesium_mg: foundRecipe.magnesium_mg,
                phosphorus_mg: foundRecipe.phosphorus_mg,
                zinc_mg: foundRecipe.zinc_mg,
                copper_mg: foundRecipe.copper_mg,
                manganese_mg: foundRecipe.manganese_mg,
                selenium_mcg: foundRecipe.selenium_mcg,
                vitamin_a_mcg_rae: foundRecipe.vitamin_a_mcg_rae,
                vitamin_d_mcg: foundRecipe.vitamin_d_mcg,
                vitamin_e_mg: foundRecipe.vitamin_e_mg,
                vitamin_k_mcg: foundRecipe.vitamin_k_mcg,
                vitamin_c_mg: foundRecipe.vitamin_c_mg,
                thiamin_mg: foundRecipe.thiamin_mg,
                riboflavin_mg: foundRecipe.riboflavin_mg,
                niacin_mg: foundRecipe.niacin_mg,
                pantothenic_acid_mg: foundRecipe.pantothenic_acid_mg,
                vitamin_b6_mg: foundRecipe.vitamin_b6_mg,
                biotin_mcg: foundRecipe.biotin_mcg,
                folate_mcg_dfe: foundRecipe.folate_mcg_dfe,
                vitamin_b12_mcg: foundRecipe.vitamin_b12_mcg,
                created_at: new Date().toISOString()
              };
              
              // Insert the food log entry
              const { error: logError } = await supabaseClient
                .from('food_log')
                .insert(foodLogEntry);
              
              if (logError) {
                throw new Error(`Failed to log recipe: ${logError.message}`);
              }
              
              // Set the response for successful logging of existing recipe with random follow-up
              responseData = {
                status: 'success',
                message: `Great! Logged your saved recipe '${foundRecipe.recipe_name}'.${getRandomFollowUp()}`,
                recipe: {
                  id: foundRecipe.id,
                  name: foundRecipe.recipe_name
                }
              };
            } else {
              // Recipe not found, ask for ingredients
              responseData = {
                status: 'needs_ingredients',
                recipeName: recipeName,
                message: `Okay, '${recipeName}'. I haven't saved that one for you yet. What ingredients did you use?`
              };
            }
          }
        } else if (intentData.intent === 'log' && intentData.logType === 'items') {
          // Define the nutrient keys from MASTER_NUTRIENT_LIST (same as recipe handling)
          const nutrientKeys = [
            "calories", "water_g", 
            "protein_g", "fat_total_g", "carbs_g", 
            "fat_saturated_g", "fat_polyunsaturated_g", "fat_monounsaturated_g", "fat_trans_g", 
            "fiber_g", "sugar_g", "sugar_added_g", 
            "cholesterol_mg", 
            "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", 
            "phosphorus_mg", "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg",
            "vitamin_a_mcg_rae", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
            "vitamin_c_mg", "thiamin_mg", "riboflavin_mg", "niacin_mg", 
            "pantothenic_acid_mg", "vitamin_b6_mg", "biotin_mcg", 
            "folate_mcg_dfe", "vitamin_b12_mcg"
          ];
          
          // Construct prompt for OpenAI for food item nutrition estimation
          const foodPrompt = `${AI_PERSONA} The user wants to log this food: "${message}". Please estimate its nutritional content. Respond ONLY with a single JSON object containing keys: "food_name" (string, a concise description of the food logged, derived from "${message}"), and a key for each requested nutrient: ${nutrientKeys.join(", ")} (e.g., "calories": number|null, "protein_g": number|null, ...). Use null if a value cannot be determined. Do not include any other text or explanation outside the JSON object.`;
          
          try {
            // Call OpenAI API for nutrition estimation using v4 syntax
            const foodResponse = await openai.chat.completions.create({
              model: "gpt-3.5-turbo",
              messages: [
                { role: "system", content: foodPrompt },
                { role: "user", content: message }
              ],
              temperature: 0.3,
              response_format: { type: "json_object" }
            });
            
            // Extract and parse the JSON response with v4 syntax
            const foodResponseContent = foodResponse.choices[0].message?.content || '';
            
            // Parse the JSON response - with response_format:json_object, we can directly parse
            let parsedNutrition;
            try {
              parsedNutrition = JSON.parse(foodResponseContent);
            } catch (jsonError) {
              throw new Error(`Failed to parse nutrition data: ${jsonError.message}`);
            }
            
            // Prepare food log entry
            const foodLogEntry = {
              user_id: userId,
              food_name: parsedNutrition.food_name,
              timestamp: new Date().toISOString(),
              source: 'ai_chat_item',
              recipe_id: null,
              // Add all nutrient values from the response
              ...Object.fromEntries(
                nutrientKeys.map(key => [key, parsedNutrition[key] ?? null])
              ),
              created_at: new Date().toISOString()
            };
            
            // Insert the food log entry
            const { error: logError } = await supabaseClient
              .from('food_log')
              .insert(foodLogEntry);
            
            if (logError) {
              throw new Error(`Failed to log food item: ${logError.message}`);
            }
            
            // Set the response for successful logging of food item with random follow-up
            responseData = {
              status: 'success',
              message: `Alright, logged '${parsedNutrition.food_name}' for you.${getRandomFollowUp()}`,
            };
          } catch (nutritionError) {
            console.error("Error processing food nutrition data:", nutritionError);
            return new Response(
              JSON.stringify({ 
                error: `Failed to process food item: ${nutritionError.message}` 
              }),
              {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
              }
            );
          }
        } else if (intentData.intent === 'question') {
          try {
            // Get today's date range (start and end of day)
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

            // Fetch user's goals
            const { data: goalsData, error: goalsError } = await supabaseClient
              .from('user_goals')
              .select('*')
              .eq('user_id', userId);

            if (goalsError) throw new Error(`Failed to fetch goals: ${goalsError.message}`);

            // Fetch today's food logs
            const { data: logsData, error: logsError } = await supabaseClient
              .from('food_log')
              .select('*')
              .eq('user_id', userId)
              .gte('timestamp', startOfDay)
              .lte('timestamp', endOfDay);

            if (logsError) throw new Error(`Failed to fetch food logs: ${logsError.message}`);

            // Calculate daily totals for tracked nutrients
            const dailyTotals = {};
            const trackedNutrients = [];

            // Only process if user has goals set
            if (goalsData && goalsData.length > 0) {
              // Initialize totals for all tracked nutrients
              goalsData.forEach(goal => {
                dailyTotals[goal.nutrient] = 0;
              });

              // Sum up the values from all logs
              if (logsData && logsData.length > 0) {
                logsData.forEach(log => {
                  goalsData.forEach(goal => {
                    const nutrientKey = goal.nutrient;
                    const value = log[nutrientKey];
                    if (value != null) {
                      dailyTotals[nutrientKey] += parseFloat(value);
                    }
                  });
                });
              }

              // Create formatted list of tracked nutrients with goals and current totals
              goalsData.forEach(goal => {
                const nutrientKey = goal.nutrient;
                const nutrientDetails = nutrientKey.split('_'); // Simple parsing of key
                // Convert snake_case to Title Case (e.g., "protein_g" to "Protein")
                const nutrientName = nutrientDetails[0].charAt(0).toUpperCase() + 
                                     nutrientDetails[0].slice(1);
                
                const unit = goal.unit || nutrientDetails[1] || '';
                const targetValue = goal.target_value;
                const currentValue = dailyTotals[nutrientKey].toFixed(1);
                
                trackedNutrients.push(
                  `${nutrientName} (Goal: ${targetValue}${unit}, Current: ${currentValue}${unit})`
                );
              });
            }

            // Construct prompt for OpenAI
            let systemPrompt;
            if (trackedNutrients.length > 0) {
              systemPrompt = `${AI_PERSONA} The user is tracking these nutrients today: ${trackedNutrients.join(', ')}. They asked: "${message}". Please provide a concise, friendly, and helpful answer based ONLY on their tracked progress towards their goals. Be encouraging!`;
            } else {
              systemPrompt = `${AI_PERSONA} The user hasn't set any specific nutrition goals yet. They asked: "${message}". Please provide a general, friendly nutritional answer, and gently encourage them to set some goals in the app for better tracking. Keep it supportive!`;
            }

            // Call OpenAI API with the constructed prompt using v4 syntax
            const openaiResponse = await openai.chat.completions.create({
              model: "gpt-3.5-turbo",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
              ],
              temperature: 0.3,
            });
            
            // Extract the AI's answer with v4 syntax
            const openAiAnswer = openaiResponse.choices[0].message?.content || 
                                'Sorry, I couldn\'t generate an answer at this time.';
            
            // Set the response with the OpenAI answer
            responseData = {
              status: 'success',
              message: openAiAnswer
            };
          } catch (questionError) {
            console.error("Error answering nutrition question:", questionError);
            responseData = {
              status: 'error',
              message: `Sorry, I had trouble answering your question. ${questionError.message}`
            };
          }
        } else {
          // Handle 'other' intent or any case not covered above
          responseData = {
            status: 'error',
            message: 'Sorry, I wasn\'t sure if you wanted to log food or ask a question. Could you rephrase? Or you can ask about your goals!'
          };
        }
      } catch (intentError) {
        console.error("Error determining message intent:", intentError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to analyze message intent: ${intentError.message}` 
          }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Return successful response
    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
    
  } catch (error) {
    // Handle any unexpected errors
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
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
    --data '{"name":"Functions"}'

*/
