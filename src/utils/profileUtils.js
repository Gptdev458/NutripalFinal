import { getSupabaseClient } from '../lib/supabaseClient';

/**
 * Fetches the profile data for a specific user.
 * @param {string} userId - The ID of the user whose profile to fetch.
 * @returns {Promise<{ data: object | null, error: object | null }>} - An object containing the user's profile data or an error.
 */
export const fetchUserProfile = async (userId) => {
  if (!userId) {
    console.error('fetchUserProfile: Missing userId');
    return { data: null, error: new Error('Missing required parameter: userId') };
  }

  try {
    console.log(`Fetching profile for user ${userId}`);
    const supabase = getSupabaseClient(); // Get the client instance

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*') // Select all columns
      .eq('user_id', userId) // Filter by user ID
      .single(); // Expect only one row

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found, which is not necessarily an error here
      console.error('Supabase query error in fetchUserProfile:', error);
      throw error; // Propagate actual errors
    }

    if (error && error.code === 'PGRST116') {
        console.log(`No profile found for user ${userId}. Returning null data.`);
        return { data: null, error: null }; // Return null data if profile doesn't exist yet
    }

    console.log(`Successfully fetched profile for user ${userId}.`);
    return { data: data, error: null }; // Return fetched data

  } catch (error) {
    console.error('Error in fetchUserProfile:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error fetching user profile'));
    return { data: null, error: errorObject };
  }
};

/**
 * Updates or inserts (upserts) a user's profile data.
 * @param {string} userId - The ID of the user whose profile to update/insert.
 * @param {object} profileData - An object containing the profile fields to update (e.g., { age, weight_kg, height_cm, sex }).
 * @returns {Promise<{ data: object | null, error: object | null }>} - An object containing the updated/inserted profile data or an error.
 */
export const updateUserProfile = async (userId, profileData) => {
  if (!userId || !profileData) {
    console.error('updateUserProfile: Missing userId or profileData');
    return { data: null, error: new Error('Missing required parameters: userId and profileData') };
  }

  // Ensure only valid fields are included and user_id is set
  const validData = {
    user_id: userId,
    age: profileData.age,
    weight_kg: profileData.weight_kg,
    height_cm: profileData.height_cm,
    sex: profileData.sex,
    // Add other profile fields here if needed
  };

  // Remove undefined fields to avoid overwriting existing data with null/undefined
  Object.keys(validData).forEach(key => {
    if (validData[key] === undefined) {
      delete validData[key];
    }
  });

  try {
    console.log(`Upserting profile for user ${userId} with data:`, validData);
    const supabase = getSupabaseClient(); // Get the client instance

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(validData, { onConflict: 'user_id' }) // Upsert based on the unique user_id
      .select() // Select the updated/inserted row
      .single(); // Expect only one row returned

    if (error) {
      console.error('Supabase upsert error in updateUserProfile:', error);
      throw error;
    }

    console.log(`Successfully upserted profile for user ${userId}.`);
    return { data: data, error: null }; // Return the updated/inserted data

  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error updating user profile'));
    return { data: null, error: errorObject };
  }
};

/**
 * Fetches goal recommendations from the AI handler based on user profile data.
 * @param {object} profileData - An object containing { age, weight_kg, height_cm, sex }.
 * @returns {Promise<{ data: object | null, error: object | null }>} - The result from the edge function invocation.
 *           On success, `data` might contain `{ status: 'success', recommendations: {...} }`.
 *           On error, `error` will contain the error details.
 */
export const fetchGoalRecommendations = async (profileData) => {
  // 1. Input Validation
  if (!profileData || typeof profileData !== 'object' || profileData === null) {
    console.error('fetchGoalRecommendations: Missing or invalid profileData object.');
    return { data: null, error: { message: 'Profile data object is required.' } };
  }

  const requiredKeys = ['age', 'weight_kg', 'height_cm', 'sex'];
  const missingKeys = requiredKeys.filter(key => !(key in profileData) || profileData[key] === null || profileData[key] === undefined);

  if (missingKeys.length > 0) {
    const message = `Incomplete profile data provided. Missing or invalid fields: ${missingKeys.join(', ')}.`;
    console.error(`fetchGoalRecommendations: ${message}`);
    return { data: null, error: { message } };
  }

  // Basic type validation (can be more sophisticated if needed)
  if (typeof profileData.age !== 'number' || profileData.age <= 0) {
    return { data: null, error: { message: 'Invalid age provided.' } };
  }
  if (typeof profileData.weight_kg !== 'number' || profileData.weight_kg <= 0) {
     return { data: null, error: { message: 'Invalid weight_kg provided.' } };
  }
    if (typeof profileData.height_cm !== 'number' || profileData.height_cm <= 0) {
     return { data: null, error: { message: 'Invalid height_cm provided.' } };
  }
   if (typeof profileData.sex !== 'string' || !['male', 'female', 'other'].includes(profileData.sex.toLowerCase())) {
     return { data: null, error: { message: 'Invalid sex provided.' } };
   }


  try {
    console.log('Invoking ai-handler-v2 for goal recommendations with profile:', profileData);
    const supabase = getSupabaseClient(); // Get the client instance

    // 2. Invoke Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('ai-handler-v2', {
      body: {
        action: 'get_recommendations',
        profile: profileData,
      },
      // No need to manually set Authorization header, supabase-js handles it.
    });

    // 3. Handle Response
    if (error) {
      // This catches errors during the function invocation itself (network issues, function crashing before returning JSON)
      console.error('Error invoking Supabase function:', error);
      throw error; // Re-throw to be caught by the outer catch block
    }

    // The 'data' object here is the *parsed JSON body* returned by the Edge Function.
    // Check if the function itself returned an error status within its response data.
    if (data && data.status === 'error') {
        console.error('Edge function returned an error:', data);
        // Return the structured error from the edge function
        return { data: null, error: { message: data.message || 'Edge function failed.', details: data.detail } };
    }

    console.log('Successfully received recommendations from edge function:', data);
    return { data: data, error: null }; // Return the data received from the function

  } catch (error) {
    console.error('Error in fetchGoalRecommendations:', error);
    // Ensure a consistent error structure is returned
    const errorObject = {
        message: error.message || 'Unknown error fetching goal recommendations.',
        details: error.details || error // Include details if available
    };
     // Handle specific Supabase FunctionError details if present
    if (error.context) {
        errorObject.details = error.context;
        console.error("Supabase FunctionError context:", error.context);
    }
    return { data: null, error: errorObject };
  }
}; 