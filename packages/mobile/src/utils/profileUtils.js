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
 * Calculates recommended nutritional goals.
 * NOTE: The calculate-goals edge function has been removed during rehaul.
 * This now performs client-side calculations as a fallback.
 * 
 * @param {object} profileData - An object containing the user's profile data { age, weight_kg, height_cm, sex, activity_level, health_goal }.
 * @returns {Promise<{ data: object | null, error: object | null }>} - The calculation result.
 */
export const calculateNutritionalGoals = async (profileData) => {
  // 1. Input Validation
  if (!profileData || typeof profileData !== 'object' || profileData === null) {
    console.error('calculateNutritionalGoals: Missing or invalid profileData object.');
    return { data: null, error: { message: 'Profile data object is required.' } };
  }

  const requiredKeys = ['age', 'weight_kg', 'height_cm', 'sex', 'activity_level', 'health_goal'];
  const missingKeys = requiredKeys.filter(key => !(key in profileData) || profileData[key] === null || profileData[key] === undefined);

  if (missingKeys.length > 0) {
    const message = `Incomplete profile data provided. Missing or invalid fields: ${missingKeys.join(', ')}. Please complete your profile.`;
    console.error(`calculateNutritionalGoals: ${message}`);
    return { data: null, error: { message } };
  }

  if (typeof profileData.age !== 'number' || profileData.age <= 0) return { data: null, error: { message: 'Invalid age.' } };
  if (typeof profileData.weight_kg !== 'number' || profileData.weight_kg <= 0) return { data: null, error: { message: 'Invalid weight.' } };
  if (typeof profileData.height_cm !== 'number' || profileData.height_cm <= 0) return { data: null, error: { message: 'Invalid height.' } };
  if (!['male', 'female', 'other'].includes(profileData.sex?.toLowerCase())) return { data: null, error: { message: 'Invalid sex.' } };
  if (!['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'].includes(profileData.activity_level?.toLowerCase())) return { data: null, error: { message: 'Invalid activity level.' } };
  if (!['weight_loss', 'weight_gain', 'maintenance'].includes(profileData.health_goal?.toLowerCase())) return { data: null, error: { message: 'Invalid health goal.' } };

  try {
    // BACKEND DISCONNECTED: calculate-goals function has been removed during rehaul
    // Perform client-side calculations as fallback
    console.log('Calculating goals client-side (edge function removed during rehaul):', profileData);
    
    const { age, weight_kg, height_cm, sex, activity_level, health_goal } = profileData;
    
    // Mifflin-St Jeor BMR Calculation
    let bmr;
    if (sex === 'male') {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
    } else if (sex === 'female') {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
    } else {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 78;
    }
    
    // Activity factor
    const activityFactors = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      extra_active: 1.9
    };
    const activityFactor = activityFactors[activity_level] || 1.375;
    
    // Total Energy Expenditure
    let tee = bmr * activityFactor;
    
    // Adjust for goal
    if (health_goal === 'weight_loss') {
      tee -= 500;
    } else if (health_goal === 'weight_gain') {
      tee += 500;
    }
    
    const adjustedCalories = Math.round(tee);
    
    // Macros
    const protein_g = Math.round(weight_kg * 1.8);
    const fat_g = Math.round((adjustedCalories * 0.25) / 9);
    const carbs_g = Math.round((adjustedCalories - (protein_g * 4) - (fat_g * 9)) / 4);
    const fiber_g = Math.round((adjustedCalories / 1000) * 14);
    const fat_saturated_g = Math.round((adjustedCalories * 0.1) / 9);
    
    const recommendations = {
      calories: adjustedCalories,
      protein_g,
      fat_total_g: fat_g,
      carbs_g,
      fiber_g,
      fat_saturated_g,
      sodium_mg: 2300,
      sugar_added_g: 30
    };
    
    console.log('Client-side calculated recommendations:', recommendations);
    return { data: { recommendations }, error: null };

  } catch (error) {
    console.error('Error in calculateNutritionalGoals utility:', error);
    return { data: null, error: { message: error.message || 'Unknown error calculating nutritional goals.' } };
  }
};

/**
 * Fetches goal recommendations based on user profile.
 * This is an alias for calculateNutritionalGoals for backwards compatibility.
 * 
 * @param {object} profileData - User profile data
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export const fetchGoalRecommendations = async (profileData) => {
  return calculateNutritionalGoals(profileData);
}; 