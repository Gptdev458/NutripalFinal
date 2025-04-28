import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { User } from '@supabase/supabase-js';

console.log('Update Profile function initializing');

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin
  "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and OPTIONS methods
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", // Allow necessary headers
};

// @ts-ignore Deno Deploy compatibility
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let supabaseClient: any;
  let userId: string;

  try {
    // --- Authentication and Supabase Client Initialization ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Auth Error: Missing or invalid Authorization Bearer header.');
      return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid Token Format' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    const jwt = authHeader.split(' ')[1];

    try {
      // @ts-ignore Deno Deploy compatibility
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      // @ts-ignore Deno Deploy compatibility
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase ENV variables');
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } }
      });
    } catch (error) {
      console.error('Critical Error: Initializing Supabase client failed:', error);
      return new Response(JSON.stringify({ error: 'Server Configuration Error', message: 'Failed to initialize database client.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Get User ---
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError) {
      console.error('Supabase userError during getUser(jwt):', userError.message);
      const detailedError = userError.message.includes('invalid JWT') ? 'Invalid JWT' : userError.message;
      throw new Error(`Authentication failed: ${detailedError}`);
    }
    if (!user) {
       console.error('Auth Error: User not found for the provided token.');
      throw new Error('Authentication failed: User not found');
    }
    userId = user.id;
    console.log(`Authenticated user: ${userId}`);

    // --- Parse Request Body ---
    let updateData: any;
    try {
        const requestBody = await req.json();
        updateData = requestBody;
        console.log(`Received update data for user ${userId}:`, JSON.stringify(updateData));
    } catch (error) {
        console.error('Error parsing request body:', error);
        return new Response(JSON.stringify({ error: 'Bad Request', message: `Invalid request body: ${error.message}` }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Input Validation & Prepare Update Object ---
    const validUpdates: Record<string, any> = {};
    if (updateData.preferred_unit_system) {
        if (['metric', 'imperial'].includes(updateData.preferred_unit_system)) {
            validUpdates.preferred_unit_system = updateData.preferred_unit_system;
        } else {
             console.error(`Invalid value for preferred_unit_system: ${updateData.preferred_unit_system}`);
             return new Response(JSON.stringify({ error: 'Bad Request', message: 'Invalid value for preferred_unit_system. Must be "metric" or "imperial".' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
    }

    // Add other updatable profile fields here in the future
    // e.g., if (updateData.age) validUpdates.age = updateData.age;

    if (Object.keys(validUpdates).length === 0) {
        return new Response(JSON.stringify({ error: 'Bad Request', message: 'No valid fields provided for update.' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // Add timestamp for update
    validUpdates.updated_at = new Date().toISOString();

    // --- Update Database ---
    console.log(`Attempting to update user_profiles for user ${userId} with:`, JSON.stringify(validUpdates));
    const { data: updatedProfile, error: updateError } = await supabaseClient
        .from('user_profiles')
        .update(validUpdates)
        .eq('user_id', userId) // Match the user's profile row
        .select() // Select the updated row to return it
        .single(); // Expect only one row to be updated

    if (updateError) {
        console.error(`Error updating user_profiles for user ${userId}:`, updateError);
        // Check for specific errors, e.g., constraint violations
        const detailedError = updateError.message.includes('violates check constraint') ? 'Invalid data provided.' : updateError.message;
        return new Response(JSON.stringify({ error: 'Database Error', message: `Failed to update profile: ${detailedError}` }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    console.log(`Successfully updated profile for user ${userId}.`);

    // --- Return Success Response ---
    return new Response(JSON.stringify({ status: 'success', message: 'Profile updated successfully.', data: updatedProfile }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Unhandled error in update-profile function:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected server error occurred.';
    // Ensure a default error response is sent
    return new Response(JSON.stringify({ error: 'Server Error', message: `Unexpected error: ${errorMessage}` }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
}); 