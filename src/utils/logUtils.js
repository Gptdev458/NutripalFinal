import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { MASTER_NUTRIENT_KEYS } from '../constants/nutrients';

/**
 * Logs a specific recipe to the user's food log.
 * @param {object} recipe - The full recipe object from user_recipes.
 * @param {object} user - The authenticated user object.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export const quickLogRecipe = async (recipe, user) => {
  if (!recipe || !user) {
    console.error('quickLogRecipe: Missing recipe or user');
    Alert.alert('Error', 'Could not log recipe. Missing information.');
    return false;
  }

  try {
    // Prepare food log entry
    const foodLogEntry = {
      user_id: user.id,
      food_name: recipe.recipe_name || 'Unnamed Recipe',
      timestamp: new Date().toISOString(),
      source: 'quick_recipe_dashboard', // Indicate source
      recipe_id: recipe.id,
      // Copy all relevant nutrient values from the recipe
      // Exclude metadata fields
      ...Object.fromEntries(
        Object.entries(recipe)
          .filter(([key]) => !['id', 'user_id', 'recipe_name', 'description', 'created_at'].includes(key) && recipe[key] !== null) // Filter out metadata and nulls
          .map(([key, value]) => [key, typeof value === 'number' ? value : 0]) // Ensure numeric values, default to 0 if not
      ),
       created_at: new Date().toISOString() // Ensure created_at is set for the log entry
    };

    console.log('Attempting to insert food log entry:', foodLogEntry);


    // Insert the food log entry
    const { error: logError } = await supabase
      .from('food_log')
      .insert(foodLogEntry);

    if (logError) {
       console.error('Supabase insert error:', logError);
       throw logError;
    }

    Alert.alert('Success', `Logged "${recipe.recipe_name}" to your food log.`);
    return true;

  } catch (error) {
    console.error('Error in quickLogRecipe:', error);
    Alert.alert('Error', `Failed to log recipe: ${error.message || 'Unknown error'}`);
    return false;
  }
};

/**
 * Fetches the full details of a recipe by its ID.
 * @param {string} recipeId - The ID of the recipe to fetch.
 * @returns {Promise<object|null>} - The recipe data or null if not found/error.
 */
export const fetchRecipeDetails = async (recipeId) => {
    if (!recipeId) return null;
    try {
        const { data, error } = await supabase
            .from('user_recipes')
            .select('*')
            .eq('id', recipeId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching recipe details:', error);
        return null;
    }
}

/**
 * Fetches food log entries for a specific user within a given date range.
 * @param {string} userId - The ID of the user.
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @returns {Promise<{ data: object[] | null, error: object | null }>} - An object containing the fetched data or an error.
 */
export const fetchFoodLogsByDateRange = async (userId, startDate, endDate) => {
  if (!userId || !startDate || !endDate) {
    console.error('fetchFoodLogsByDateRange: Missing userId, startDate, or endDate');
    return { data: null, error: new Error('Missing required parameters: userId, startDate, or endDate') };
  }

  try {
    // Construct ISO strings for the start and end of the day range
    // Ensure start date is the beginning of the day
    const startOfDayISO = new Date(`${startDate}T00:00:00.000Z`).toISOString();
    // Ensure end date is the very end of the day
    const endOfDayISO = new Date(`${endDate}T23:59:59.999Z`).toISOString();


    console.log(`Fetching logs for user ${userId} from ${startOfDayISO} to ${endOfDayISO}`);

    // Include standard fields plus all nutrient keys from the master list
    const selectColumns = `
      id,
      food_name,
      timestamp,
      source,
      recipe_id,
      ${MASTER_NUTRIENT_KEYS.join(', ')}
    `;

    const { data, error } = await supabase
      .from('food_log')
      .select(selectColumns) // Use the constructed string
      .eq('user_id', userId)
      .gte('timestamp', startOfDayISO)
      .lte('timestamp', endOfDayISO)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Supabase query error in fetchFoodLogsByDateRange:', error);
      throw error;
    }

    console.log(`Successfully fetched ${data?.length ?? 0} logs.`);
    return { data: data || [], error: null };

  } catch (error) {
    console.error('Error in fetchFoodLogsByDateRange:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error fetching food logs'));
    return { data: null, error: errorObject };
  }
};

/**
 * Fetches all nutrient goals for a specific user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<{ data: object[] | null, error: object | null }>} - An object containing an array of the user's goal objects or an error.
 */
export const fetchUserGoals = async (userId) => {
  if (!userId) {
    console.error('fetchUserGoals: Missing userId');
    return { data: null, error: new Error('Missing required parameter: userId') };
  }

  try {
    console.log(`Fetching goals for user ${userId}`);

    const { data, error } = await supabase
      .from('user_goals')
      .select('id, nutrient, target_value, unit') // Select relevant columns for goals
      .eq('user_id', userId); // Filter by user ID

    if (error) {
      console.error('Supabase query error in fetchUserGoals:', error);
      throw error; // Propagate the error
    }

    console.log(`Successfully fetched ${data?.length ?? 0} goals.`);
    return { data: data || [], error: null }; // Return data (or empty array) and null error

  } catch (error) {
    console.error('Error in fetchUserGoals:', error);
    // Ensure the returned error is a standard Error object or Supabase error object
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error fetching user goals'));
    return { data: null, error: errorObject }; // Return null data and the error object
  }
};

/**
 * Deletes a specific food log entry by its ID.
 * @param {string|number} logId - The unique ID of the food log entry to delete.
 * @returns {Promise<{ data: any, error: object | null }>} - An object reflecting the outcome of the delete operation.
 */
export const deleteFoodLogEntry = async (logId) => {
  if (!logId) {
    console.error('deleteFoodLogEntry: Missing logId');
    return { data: null, error: new Error('Missing required parameter: logId') };
  }

  try {
    console.log(`Attempting to delete food log entry with ID: ${logId}`);

    const { data, error } = await supabase
      .from('food_log')
      .delete()
      .match({ id: logId }); // Use match to specify the row to delete based on the primary key 'id'

    if (error) {
      console.error('Supabase delete error:', error);
      throw error; // Propagate the error
    }

    console.log(`Successfully deleted food log entry with ID: ${logId}`, data);
    // Note: Supabase delete might return data depending on configuration (e.g., RETURNING), often it's null or an empty array on success.
    return { data, error: null };

  } catch (error) {
    console.error('Error in deleteFoodLogEntry:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error deleting food log entry'));
    return { data: null, error: errorObject };
  }
}; 