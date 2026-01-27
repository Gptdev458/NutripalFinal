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
      .eq('id', userId) // Fixed: use 'id' as per migration
      .single(); // Expect only one row

    if (error && error.code !== 'PGRST116') { // PGRST116: Row not found
      console.error('Supabase query error in fetchUserProfile:', error);
      throw error;
    }

    if (error && error.code === 'PGRST116') {
        console.log(`No profile found for user ${userId}. Returning null data.`);
        return { data: null, error: null };
    }

    console.log(`Successfully fetched profile for user ${userId}.`);
    return { data: data, error: null };

  } catch (error) {
    console.error('Error in fetchUserProfile:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error fetching user profile'));
    return { data: null, error: errorObject };
  }
};

/**
 * Updates or inserts (upserts) a user's profile data.
 * @param {string} userId - The ID of the user whose profile to update/insert.
 * @param {object} profileData - An object containing the profile fields to update.
 */
export const updateUserProfile = async (userId, profileData) => {
  if (!userId || !profileData) {
    console.error('updateUserProfile: Missing userId or profileData');
    return { data: null, error: new Error('Missing required parameters: userId and profileData') };
  }

  const validData = {
    id: userId, // Fixed: use 'id'
    age: profileData.age,
    weight_kg: profileData.weight_kg,
    height_cm: profileData.height_cm,
    gender: profileData.sex || profileData.gender, // Fixed: use 'gender'
    activity_level: profileData.activity_level,
    health_goal: profileData.health_goal,
  };

  Object.keys(validData).forEach(key => {
    if (validData[key] === undefined) {
      delete validData[key];
    }
  });

  try {
    console.log(`Upserting profile for user ${userId} with data:`, validData);
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(validData, { onConflict: 'id' }) // Fixed: onConflict 'id'
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert error in updateUserProfile:', error);
      throw error;
    }

    console.log(`Successfully upserted profile for user ${userId}.`);
    return { data: data, error: null };

  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error updating user profile'));
    return { data: null, error: errorObject };
  }
};

/**
 * Calculates recommended nutritional goals client-side.
 */
export const calculateNutritionalGoals = async (profileData) => {
  if (!profileData || typeof profileData !== 'object' || profileData === null) {
    return { data: null, error: { message: 'Profile data object is required.' } };
  }

  // Handle both 'sex' and 'gender' keys for flexibility
  const sex = profileData.sex || profileData.gender;
  const { age, weight_kg, height_cm, activity_level, health_goal } = profileData;

  if (!age || !weight_kg || !height_cm || !sex || !activity_level || !health_goal) {
    return { data: null, error: { message: 'Incomplete profile data.' } };
  }

  try {
    // Mifflin-St Jeor BMR Calculation
    let bmr;
    if (sex === 'male') {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
    } else if (sex === 'female') {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
    } else {
      bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 78;
    }
    
    const activityFactors = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      extra_active: 1.9
    };
    const activityFactor = activityFactors[activity_level] || 1.375;
    let tee = bmr * activityFactor;
    
    if (health_goal === 'weight_loss') tee -= 500;
    else if (health_goal === 'weight_gain') tee += 500;
    
    const adjustedCalories = Math.round(tee);
    const protein_g = Math.round(weight_kg * 1.8);
    const fat_g = Math.round((adjustedCalories * 0.25) / 9);
    const carbs_g = Math.round((adjustedCalories - (protein_g * 4) - (fat_g * 9)) / 4);
    
    const recommendations = {
      calories: adjustedCalories,
      protein_g,
      fat_total_g: fat_g,
      carbs_g,
      fiber_g: Math.round((adjustedCalories / 1000) * 14),
      fat_saturated_g: Math.round((adjustedCalories * 0.1) / 9),
      sodium_mg: 2300,
      sugar_added_g: 30
    };
    
    return { data: { recommendations }, error: null };
  } catch (error) {
    return { data: null, error: { message: error.message } };
  }
};

export const fetchGoalRecommendations = async (profileData) => {
  return calculateNutritionalGoals(profileData);
}; 
