import { getSupabaseClient } from 'shared';

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
 * @param {object} profileData - An object containing the profile fields to update (e.g., { age, weight_kg, height_cm, sex, activity_level, health_goal }).
 * @returns {Promise<{ data: object | null, error: object | null }>} - An object containing the updated/inserted profile data or an error.
 */
export const updateUserProfile = async (userId, profileData) => {
  if (!userId || !profileData) {
    console.error('updateUserProfile: Missing userId or profileData');
    return { data: null, error: new Error('Missing required parameters: userId and profileData') };
  }

  // Ensure only valid fields are included and user_id is set
  // Make sure to include all fields used by calculate-goals function
  const validData = {
    user_id: userId,
    age: profileData.age,
    weight_kg: profileData.weight_kg,
    height_cm: profileData.height_cm,
    sex: profileData.sex,
    activity_level: profileData.activity_level, // Ensure this is passed from ProfileScreen
    health_goal: profileData.health_goal,       // Ensure this is passed from ProfileScreen
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
 * Calculates recommended nutritional goals by invoking the 'calculate-goals' edge function.
 * @param {object} profileData - An object containing the user's profile data { age, weight_kg, height_cm, sex, activity_level, health_goal }.
 * @returns {Promise<{ data: object | null, error: object | null }>} - The result from the edge function.
 *           On success, `data` should contain `{ recommendations: { calories: number, protein_g: number, ... } }`.
 *           On error, `error` will contain the error details.
 */
export const calculateNutritionalGoals = async (profileData) => {
  // 1. Input Validation
  if (!profileData || typeof profileData !== 'object' || profileData === null) {
    console.error('calculateNutritionalGoals: Missing or invalid profileData object.');
    return { data: null, error: { message: 'Profile data object is required.' } };
  }

  // Keys required by the 'calculate-goals' edge function
  const requiredKeys = ['age', 'weight_kg', 'height_cm', 'sex', 'activity_level', 'health_goal'];
  const missingKeys = requiredKeys.filter(key => !(key in profileData) || profileData[key] === null || profileData[key] === undefined);

  if (missingKeys.length > 0) {
    const message = `Incomplete profile data provided. Missing or invalid fields: ${missingKeys.join(', ')}. Please complete your profile.`;
    console.error(`calculateNutritionalGoals: ${message}`);
    return { data: null, error: { message } };
  }

  // Add basic type validation if needed (similar to the old function)
  // Example:
  if (typeof profileData.age !== 'number' || profileData.age <= 0) return { data: null, error: { message: 'Invalid age.' } };
  if (typeof profileData.weight_kg !== 'number' || profileData.weight_kg <= 0) return { data: null, error: { message: 'Invalid weight.' } };
  if (typeof profileData.height_cm !== 'number' || profileData.height_cm <= 0) return { data: null, error: { message: 'Invalid height.' } };
  if (!['male', 'female', 'other'].includes(profileData.sex?.toLowerCase())) return { data: null, error: { message: 'Invalid sex.' } };
  if (!['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'].includes(profileData.activity_level?.toLowerCase())) return { data: null, error: { message: 'Invalid activity level.' } };
  if (!['weight_loss', 'weight_gain', 'maintenance'].includes(profileData.health_goal?.toLowerCase())) return { data: null, error: { message: 'Invalid health goal.' } };


  try {
    console.log('Invoking calculate-goals function with profile:', profileData);
    const supabase = getSupabaseClient();

    // 2. Invoke the NEW Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('calculate-goals', { // <--- Call the new function
      body: {
        profile: profileData, // Pass the profile data in the body
      },
    });

    // 3. Handle Response
    if (error) {
      // Catches invocation errors (network, function crash before returning JSON)
      console.error(`Error invoking Supabase function 'calculate-goals':`, error);
      throw error;
    }

    // Check if the function itself returned an error within its JSON response
    if (data && data.error) {
        console.error(`Edge function 'calculate-goals' returned an error:`, data.error);
        return { data: null, error: { message: data.error } };
    }

    // Check if the expected recommendations object is present
    if (!data || !data.recommendations) {
        console.error(`Invalid response structure from 'calculate-goals':`, data);
        return { data: null, error: { message: 'Received invalid response from calculation service.' } };
    }

    console.log('Successfully received recommendations from calculate-goals:', data);
    return { data: data, error: null }; // Return the { recommendations: {...} } object

  } catch (error) {
    console.error('Error in calculateNutritionalGoals utility:', error);
    const errorObject = {
        message: error.message || 'Unknown error calculating nutritional goals.',
        details: error.details || error
    };
     // Handle specific Supabase FunctionError details if present
    if (error.context) {
        errorObject.details = error.context;
        console.error("Supabase FunctionError context:", error.context);
    }
    return { data: null, error: errorObject };
  }
}; 