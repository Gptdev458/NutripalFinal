'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { SupabaseClient } from '@supabase/supabase-js';

// Types (Consider moving to a shared types file later)
interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

interface FoodLog {
    id: number;
    timestamp: string; 
    food_name?: string | null;
    calories?: number | null;
    [key: string]: unknown; 
}

interface DailyTotals {
    [nutrientKey: string]: number | undefined;
}

// Helper function (Consider moving to utils)
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const useDashboardData = () => {
  const { user, supabase, loading: authLoading } = useAuth(); // Keep authLoading for initial readiness check
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [loadingData, setLoadingData] = useState(true); // Default to true
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data function (migrated from page)
  const fetchDashboardData = useCallback(async (isRefreshing = false) => {
    // Check user/supabase availability *before* setting loading states
    if (!user || !supabase) {
        console.log("[useDashboardData] Aborting fetch: User or Supabase client not ready.");
        setLoadingData(false); // Can't fetch, so not loading
        setRefreshing(false);
        setUserGoals([]);
        setDailyTotals({});
        // setError("User not available"); // Optionally set error
        return;
    }
    
    console.log(`[useDashboardData] Fetching data... Refresh: ${isRefreshing}`);
    
    // Set loading states *after* confirming user/supabase are available
    if (!isRefreshing) setLoadingData(true);
    else setRefreshing(true);
    setError(null);

    const today = new Date();
    const dateString = formatDate(today);
    const startOfDay = `${dateString}T00:00:00.000Z`;
    const endOfDay = `${dateString}T23:59:59.999Z`;

    try {
        // ... (rest of fetch logic is okay) ...
        const [goalsResponse, logsResponse] = await Promise.all([
            supabase.from('user_goals').select('*').eq('user_id', user.id),
            supabase.from('food_log').select('*').eq('user_id', user.id).gte('timestamp', startOfDay).lte('timestamp', endOfDay)
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const fetchedGoals = goalsResponse.data || [];
        const fetchedLogs = logsResponse.data || [];

        // --- DEBUG LOG --- 
        console.log("[useDashboardData] Raw fetched goals from DB:", JSON.stringify(fetchedGoals));
        // --- END DEBUG LOG ---

        // --- Calculate Totals (Copied Logic) ---
        const totals: DailyTotals = {};
        const nutrientsToTotal = new Set<string>(fetchedGoals.map(g => g.nutrient));
        if (fetchedGoals.some(g => g.nutrient === 'omega_ratio')) {
            nutrientsToTotal.add('omega_3_g');
            nutrientsToTotal.add('omega_6_g');
        }
        nutrientsToTotal.add('calories'); // Always include calories

        nutrientsToTotal.forEach(nutrientKey => {
            let currentIntake = 0;
            fetchedLogs.forEach(log => {
                const logValue = log[nutrientKey];
                if (typeof logValue === 'number' && !isNaN(logValue)) {
                    currentIntake += logValue;
                }
            });
            totals[nutrientKey] = currentIntake;
        });
        // --- End Calculate Totals ---

        setUserGoals(fetchedGoals);
        setDailyTotals(totals);
        console.log("[useDashboardData] Data fetched successfully.");

    } catch (err: unknown) {
        console.error("[useDashboardData] Error fetching data:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load dashboard data: ${errorMessage}`);
        setUserGoals([]); // Reset on error
        setDailyTotals({}); // Reset on error
    } finally {
        setLoadingData(false);
        setRefreshing(false);
    }
  }, [user, supabase]); // Dependencies for the fetching function itself

  // Effect to trigger fetch ONCE on mount
  useEffect(() => {
    console.log("[useDashboardData Effect - Mount]");
    // Call fetch directly on mount.
    // The fetchDashboardData function itself checks for user/supabase readiness.
    fetchDashboardData();
    // Removed internal checks for authLoading/user, relying on fetchDashboardData's internal checks
  }, []); // <--- Ensure dependency array is empty

  // Return the state and the refresh function
  return {
    userGoals,
    dailyTotals,
    loadingData,
    error,
    refreshing,
    refreshDashboardData: fetchDashboardData // Expose the fetch function for manual refresh
  };
};