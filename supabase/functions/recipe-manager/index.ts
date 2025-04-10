// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

// Import necessary libraries
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2.0.0";

// Define CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS", // Allow DELETE method
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("Recipe Manager Function Initializing");

// =================================================================
// --- Main Request Handler ---
// =================================================================
Deno.serve(async (req: Request) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  // 1. Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // 2. Check Request Method
  if (req.method !== "DELETE") {
    console.error(`Method Not Allowed: ${req.method}`);
    return new Response(
      JSON.stringify({ status: 'error', message: 'Method Not Allowed. Only DELETE is supported.' }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Allow": "DELETE" } }
    );
  }

  // --- Add Enhanced Logging --- 
  console.log("Request Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));
  let rawBodyText = "(Not read)";
  try {
    // Attempt to read raw body text *before* JSON parsing
    rawBodyText = await req.text(); 
    console.log("Raw Request Body Text:", rawBodyText);
  } catch (bodyReadError) {
    console.error("Error reading request body as text:", bodyReadError);
    rawBodyText = `(Error reading: ${bodyReadError.message})`;
  }
  // --- End Enhanced Logging --- 

  let userId: string;
  let supabaseClient: SupabaseClient;

  try {
    // 3. Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Unauthorized: Missing Authorization header");
      return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized: Missing credentials.' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase ENV variables');
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
        console.log("Supabase client initialized.");
    } catch (error) {
        console.error('Critical Error: Initializing Supabase client failed:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Server configuration issue.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('User not found for the provided token.');
        userId = user.id;
        console.log(`Authenticated user: ${userId}`);
    } catch (error) {
        console.error('Authentication error:', error.message);
        return new Response( JSON.stringify({ status: 'error', message: `Authentication failed: ${error.message}` }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // 4. Parse Input (Recipe ID from JSON body)
    let recipeId: number | undefined;
    try {
        // Parse the raw text we already read
        if (rawBodyText.startsWith("(")) throw new Error("Raw body was not read successfully.");
        const requestData = JSON.parse(rawBodyText); 
        recipeId = requestData?.recipe_id;
        
        // --- ADJUSTED VALIDATION --- 
        // Check if recipeId is NOT a finite number OR if it's falsy (like 0, though IDs are usually > 0)
        if (typeof recipeId !== 'number' || !Number.isFinite(recipeId) /* || recipeId <= 0 */ ) { 
            // Optional: Add check for positive ID if needed: || recipeId <= 0
            throw new Error('Missing or invalid "recipe_id" (must be a positive number) in parsed JSON.');
        }
        // --- END ADJUSTED VALIDATION --- 

        console.log(`Attempting to delete recipe ID: ${recipeId}`);
    } catch (error) {
        console.error('Error parsing request body JSON:', error.message, "Raw text was:", rawBodyText);
        // Return the more specific error from the function's perspective
        return new Response( JSON.stringify({ status: 'error', message: `Invalid request body: ${error.message}` }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // 5. Database Deletion
    console.log(`Performing delete on user_recipes for user ${userId}, recipe ${recipeId}`);
    const { error: deleteError } = await supabaseClient
      .from('user_recipes')
      .delete()
      .eq('user_id', userId) // IMPORTANT: Ensure user owns the recipe
      .eq('id', recipeId);   // Match the specific recipe ID

    // 6. Response Handling
    if (deleteError) {
      console.error(`Database delete error for recipe ${recipeId}, user ${userId}:`, deleteError.message);
      // Determine if it's a client error (e.g., constraint violation) or server error
      const status = deleteError.code && deleteError.code.startsWith('2') ? 400 : 500; // Basic check
      return new Response(
        JSON.stringify({ status: 'error', message: `Failed to delete recipe: ${deleteError.message}` }),
        { status: status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Success
    console.log(`Successfully deleted recipe ${recipeId} for user ${userId}`);
    return new Response(
      JSON.stringify({ status: 'success', message: 'Recipe deleted successfully.' }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
    // Alternative: Return 204 No Content on success
    // return new Response(null, { status: 204, headers: CORS_HEADERS });

  } catch (error) { // 7. Catch Top-Level Errors
    console.error('--- Unhandled Top-Level Error in Recipe Manager ---:', error);
    return new Response(
        JSON.stringify({ status: 'error', message: `Server error: ${error instanceof Error ? error.message : String(error)}` }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

console.log("Recipe Manager Function Ready"); 