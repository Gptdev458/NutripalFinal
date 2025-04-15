// import { getSupabaseClient } from '../lib/supabaseClient';
import { getSupabaseClient } from 'shared';

/**
 * Fetches daily aggregated totals for a specific nutrient using an RPC call.
 * @param {string} userId - The ID of the user.
 * @param {string} nutrientKey - The key/column name of the nutrient (e.g., 'calories').
 * @param {string} startDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} endDate - The end date in 'YYYY-MM-DD' format.
 * @returns {Promise<{ data: {day: string, total: number}[] | null, error: object | null }>} - An object containing the fetched data or an error.
 */
export const fetchDailyNutrientTotals = async (userId, nutrientKey, startDate, endDate) => {
  if (!userId || !nutrientKey || !startDate || !endDate) {
    console.error('fetchDailyNutrientTotals: Missing required parameters');
    return { data: null, error: new Error('Missing required parameters') };
  }

  try {
    console.log(`RPC: fetchDailyNutrientTotals for ${nutrientKey} from ${startDate} to ${endDate}`);
    const supabase = getSupabaseClient(); // Get the client instance

    const { data, error } = await supabase.rpc('get_daily_nutrient_totals', {
      p_user_id: userId,
      p_nutrient_key: nutrientKey,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error('Supabase RPC error in fetchDailyNutrientTotals:', error);
      // Check if the error is due to the invalid nutrient key check within the function
      if (error.message.includes('Invalid nutrient key')) {
          return { data: null, error: new Error(`Analytics is not supported for nutrient: ${nutrientKey}`) };
      }
      throw error;
    }

    console.log(`Successfully fetched ${data?.length ?? 0} daily totals via RPC.`);
    // Ensure data is always an array, even if null/undefined comes back
    return { data: data || [], error: null };

  } catch (error) {
    console.error('Error in fetchDailyNutrientTotals RPC call:', error);
    const errorObject = error instanceof Error ? error : new Error(String(error.message || 'Unknown error fetching daily totals'));
    return { data: null, error: errorObject };
  }
};
