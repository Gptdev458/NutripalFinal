'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStartAndEndOfDay } from 'shared';

interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

interface FoodLog {
    id: string;
    log_time: string; 
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
  const { user, supabase, loading: authLoading } = useAuth(); 
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [loadingData, setLoadingData] = useState(true); 
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data function (migrated from page)
  const fetchDashboardData = useCallback(async (isRefreshing = false) => {
    if (!user || !supabase) {
        setLoadingData(false); 
        setRefreshing(false);
        setUserGoals([]);
        setDailyTotals({});
        return;
    }
    
    if (!isRefreshing) setLoadingData(true);
    else setRefreshing(true);
    setError(null);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { start: startOfDay, end: endOfDay } = getStartAndEndOfDay(new Date(), timezone);

    try {
        const [goalsResponse, logsResponse] = await Promise.all([
            supabase.from('user_goals').select('*').eq('user_id', user.id),
            supabase.from('food_log')
              .select('*')
              .eq('user_id', user.id)
              .gte('log_time', startOfDay)
              .lte('log_time', endOfDay)
              .order('log_time', { ascending: false })
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const fetchedGoals = goalsResponse.data || [];
        const fetchedLogs = logsResponse.data || [];

        const totals: DailyTotals = {};
        fetchedLogs.forEach(log => {
          Object.keys(log).forEach(key => {
            if (typeof log[key] === 'number') {
              totals[key] = (totals[key] || 0) + (log[key] as number);
            }
          });
        });

        setUserGoals(fetchedGoals);
        setRecentLogs(fetchedLogs);
        setDailyTotals(totals);

    } catch (err: unknown) {
        console.error("[useDashboardData] Error fetching data:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load dashboard data: ${errorMessage}`);
        setUserGoals([]); 
        setDailyTotals({}); 
    } finally {
        setLoadingData(false);
        setRefreshing(false);
    }
  }, [user, supabase]); 

  useEffect(() => {
    if (user && !authLoading) {
      fetchDashboardData();
    }
  }, [user, authLoading, fetchDashboardData]);

  return {
    userGoals,
    dailyTotals,
    recentLogs,
    loadingData,
    error,
    refreshing,
    refreshDashboardData: fetchDashboardData 
  };
};