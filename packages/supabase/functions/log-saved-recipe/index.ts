// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@^2.0.0";
import { corsHeaders } from '../_shared/cors.ts' // Assuming a shared cors helper

console.log("log-saved-recipe function initializing");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Create Admin Supabase Client & Get User
    // Use environment variables and admin key for server-side operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser();
    if (userError) {
      console.error("Auth error:", userError.message);
      return new Response(JSON.stringify({ error: 'Authentication failed', details: userError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    if (!user) {
        console.error("No user found for token.");
        return new Response(JSON.stringify({ error: 'User not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        })
    }
    const userId = user.id;
    console.log(`User ${userId} authenticated.`);

    // 2. Extract recipe_id from request body
    const body = await req.json();
    const { recipe_id } = body;

    if (!recipe_id || typeof recipe_id !== 'string') {
      console.error("Missing or invalid recipe_id in request body:", body);
      return new Response(JSON.stringify({ error: 'Missing or invalid recipe_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    console.log(`Attempting to log recipe ID: ${recipe_id}`);

    // 3. Fetch the full recipe details from user_recipes table
    const { data: recipeData, error: fetchError } = await supabaseAdmin
      .from('user_recipes')
      .select('*')
      .eq('id', recipe_id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error(`Error fetching recipe ${recipe_id} for user ${userId}:`, fetchError.message);
      // Distinguish between not found and other errors
      if (fetchError.code === 'PGRST116') { // PostgREST code for zero rows returned by .single()
          return new Response(JSON.stringify({ error: 'Recipe not found or access denied' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          })
      } else {
          return new Response(JSON.stringify({ error: 'Database error fetching recipe', details: fetchError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          })
      }
    }

    if (!recipeData) {
         // Should be caught by .single() error handling, but belt-and-suspenders
        console.error(`Recipe data unexpectedly null for ${recipe_id}`);
         return new Response(JSON.stringify({ error: 'Recipe not found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
        })
    }
    console.log(`Found recipe: ${recipeData.name}`);

    // 4. Prepare the food_log entry
    const foodLogEntry: { [key: string]: any } = {
        user_id: userId,
        name: recipeData.name || 'Saved Recipe', // Use recipe name for the log entry name
        source: 'saved_recipe', // Indicate the source
        recipe_id: recipe_id, // Link back to the saved recipe
        // Add other relevant non-nutrient fields if needed
    };

    // Copy nutrient data from recipeData to foodLogEntry
    // Avoid copying meta columns
    const metaColumns = ['id', 'user_id', 'created_at', 'name', 'description', 'ingredients'];
    for (const key in recipeData) {
      if (!metaColumns.includes(key) && recipeData[key] !== null && recipeData[key] !== undefined) {
        foodLogEntry[key] = recipeData[key];
      }
    }
    console.log(`Prepared food log entry with ${Object.keys(foodLogEntry).length} keys.`);

    // 5. Insert the entry into the food_log table
    const { error: insertError } = await supabaseAdmin
        .from('food_log')
        .insert(foodLogEntry);

    if (insertError) {
        console.error(`Error inserting into food_log for recipe ${recipe_id}:`, insertError.message);
        return new Response(JSON.stringify({ error: 'Database error logging recipe', details: insertError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }

    console.log(`Successfully logged recipe ${recipe_id} for user ${userId}`);

    // 6. Return success response
    return new Response(JSON.stringify({ message: 'Recipe logged successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Unhandled error in log-saved-recipe function:", error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
}) 