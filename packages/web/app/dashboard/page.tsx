'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import FoodLogDetailModal from '@/components/FoodLogDetailModal';
import { format as formatDateFn } from 'date-fns';
import DashboardShell from '@/components/DashboardShell';
import DashboardSummaryTable from '@/components/DashboardSummaryTable';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { useDashboardData } from '@/hooks/useDashboardData';

// Force dynamic rendering to bypass cache
export const dynamic = 'force-dynamic';

// Loading Spinner Component (from example)
const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center py-2">
      <div className="relative w-8 h-8"> {/* Using slightly larger spinner for page load/refresh */} 
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-blue-100 rounded-full"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    </div>
  );
};

// Types
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
    omega_3_g?: number | null;
    omega_6_g?: number | null;
    fiber_soluble_g?: number | null;
    [key: string]: unknown; 
}

interface DailyTotals {
    calories?: number;
    omega_3_g?: number;
    omega_6_g?: number;
    fiber_soluble_g?: number;
    [nutrientKey: string]: number | undefined;
}

// Helper function
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Helper function to format nutrient names (can be moved to utils)
const formatNutrientName = (key: string): string => {
   return key.replace(/_/g, ' ')
             .replace(/\b\w/g, l => l.toUpperCase())
             .replace(/ G$/, ' (g)') // Adjust if needed
             .replace(/ Mg$/, ' (mg)')
             .replace(/ Mcg$/, ' (mcg)'); 
};

export default function DashboardPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // State for the Log Detail Modal
  const [isLogDetailModalVisible, setIsLogDetailModalVisible] = useState(false);
  const [selectedLogData, setSelectedLogData] = useState<FoodLog | null>(null);
  const [isDeletingLog, setIsDeletingLog] = useState(false);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async (isRefreshing = false) => {
    if (!user || !supabase) {
        setLoadingData(false);
        setRefreshing(false);
        return;
    }
    if (!isRefreshing) setLoadingData(true);
    else setRefreshing(true);
    setError(null);

    const today = new Date();
    const dateString = formatDate(today);
    const startOfDay = `${dateString}T00:00:00.000Z`;
    const endOfDay = `${dateString}T23:59:59.999Z`;

    try {
        const [goalsResponse, logsResponse] = await Promise.all([
            supabase.from('user_goals').select('*').eq('user_id', user.id),
            supabase.from('food_log').select('*').eq('user_id', user.id).gte('timestamp', startOfDay).lte('timestamp', endOfDay).order('timestamp', { ascending: false })
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const fetchedGoals = goalsResponse.data || [];
        const fetchedLogs = logsResponse.data || [];

        setUserGoals(fetchedGoals);
        setRecentLogs(fetchedLogs);

        const totals: DailyTotals = {};
        const nutrientsToTotal = new Set<string>(fetchedGoals.map(g => g.nutrient));
        if (fetchedGoals.some(g => g.nutrient === 'omega_ratio')) {
            nutrientsToTotal.add('omega_3_g');
            nutrientsToTotal.add('omega_6_g');
        }
        nutrientsToTotal.add('calories');

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
        setDailyTotals(totals);

        console.log("Dashboard data fetched:", { fetchedGoals, fetchedLogs: fetchedLogs.length, totals });

    } catch (err: unknown) {
        console.error("Error fetching dashboard data:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load dashboard data: ${errorMessage}`);
        setUserGoals([]);
        setDailyTotals({});
        setRecentLogs([]);
    } finally {
        setLoadingData(false);
        setRefreshing(false);
    }

  }, [user, supabase]);

  // Initial fetch - Revert to depend only on authLoading and user
  useEffect(() => {
    if (!authLoading) { 
      if (user) {
        console.log("DashboardPage Effect: Auth loaded, user found. Fetching data...");
        fetchDashboardData();
      } else {
        console.log("DashboardPage Effect: Auth loaded, no user found. Clearing data.");
        setLoadingData(false); 
        setUserGoals([]);
        setDailyTotals({});
        setRecentLogs([]);
        setError(null); 
      }
    }
    // Depend on authLoading and user object
  }, [authLoading, user]);

  // Handle Refresh Action
  const handleRefresh = () => {
      fetchDashboardData(true);
  };

  // Menu close effect
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (menuOpen && !target.closest('.sidebar') && !target.closest('.menu-button')) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // --- Modal Handlers --- 
  const handleLogItemClick = (logItem: FoodLog) => {
    setSelectedLogData(logItem);
    setIsLogDetailModalVisible(true);
  };

  const handleCloseLogDetailModal = () => {
    if (isDeletingLog) return;
    setIsLogDetailModalVisible(false);
    setSelectedLogData(null);
  };

  // --- Delete Handler ---
  const handleDeleteLogItem = async (logId: number) => {
    if (!supabase || !user) {
      console.error("Delete failed: Supabase client or user not available.");
      alert("Delete failed: Authentication error."); 
      throw new Error("Authentication error");
    }

    setIsDeletingLog(true);
    try {
      console.log(`Attempting to delete food_log item with id: ${logId}`);
      const { error: deleteError } = await supabase
        .from('food_log')
        .delete()
        .match({ id: logId, user_id: user.id });

      if (deleteError) {
        console.error("Error deleting log item:", deleteError);
        throw deleteError;
      }

      console.log("Log item deleted successfully.");
      
      handleCloseLogDetailModal();
      await fetchDashboardData(true);

    } catch (err) {
       throw err; 
    } finally {
        setIsDeletingLog(false);
    }
  };
  // --- End Delete Handler ---

  // --- Test Button Handler ---
  const handleTestGetSession = async () => {
    setTestResult('Testing...');
    console.log("[TestButton] Creating temporary client using @supabase/ssr...");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("[TestButton] Missing ENV vars!");
        setTestResult('Test Failed: Missing ENV Vars');
        return;
    }

    try {
        const testClient = createBrowserClient(
            supabaseUrl,
            supabaseAnonKey,
        );
        console.log("[TestButton] Temporary client created:", testClient);
        console.log("[TestButton] Calling getSession() on temporary client...");
        const { data, error } = await testClient.auth.getSession();
        console.log("[TestButton] getSession() completed.", { data, error });

        if (error) {
            setTestResult(`Test Failed: ${error.message}`);
        } else if (data?.session) {
            setTestResult(`Test Success! Session User ID: ${data.session.user.id}`);
        } else {
            setTestResult('Test Success! No active session found.');
        }
    } catch (err: any) {
        console.error("[TestButton] Error during test:", err);
        setTestResult(`Test Exception: ${err.message}`);
    }
  };
  // -------------------------

  // Revert Loading/Auth checks
  if (authLoading) {
    // Show loading indicator while auth is loading
    return (
        <div className="flex h-screen items-center justify-center">
            <LoadingSpinner /> 
            <p className="ml-2">Loading user data...</p>
        </div>
    );
  }

  if (!user) {
     // This case should ideally be handled by middleware, but good as a fallback
     return (
        <div className="flex h-screen items-center justify-center">
            <p>Please log in to view the dashboard.</p>
        </div>
     ); 
  }

  return (
    <DashboardShell headerTitle="Dashboard">
      {loadingData && !refreshing ? (
        <div className="flex flex-col items-center justify-center pt-20">
          <LoadingSpinner />
          <p className="mt-4 text-gray-500">Loading Dashboard...</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-6 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
              Error: {error}
            </div>
          )}
          {refreshing && (
            <div className="flex justify-center py-2 mb-4">
              <LoadingSpinner />
            </div>
          )}
          <DashboardSummaryTable
            userGoals={userGoals}
            dailyTotals={dailyTotals}
            loading={loadingData}
            error={error}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
          
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-blue-600 mb-4 px-1">Today's Log</h2>
            {recentLogs.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200">
                {recentLogs.slice(0, 5).map(log => (
                  <button 
                    key={log.id}
                    onClick={() => handleLogItemClick(log)}
                    className="block w-full text-left p-4 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 transition-colors duration-150"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-800 truncate"> 
                        {log.food_name || 'Logged Item'} 
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDateFn(new Date(log.timestamp), 'h:mm a')}
                      </span>
                    </div>
                    {log.calories !== null && log.calories !== undefined && (
                       <p className="text-xs text-gray-500 mt-0.5">{Math.round(log.calories)} kcal</p>
                    )}
                  </button>
                ))}
                {recentLogs.length > 5 && (
                   <Link href="/history" className="block text-center p-3 text-sm text-blue-600 hover:bg-gray-50">
                       View Full History ({recentLogs.length} items)
                   </Link>
                )}
              </div>
            ) : (
              <div className="text-center p-6 border border-gray-200 rounded-lg bg-white">
                <p className="text-sm text-gray-500">No food logged yet today.</p>
                <Link href="/chat" className="mt-2 inline-block px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200">
                   Go to Chat to Log
                </Link>
              </div>
            )}
          </div>
          
          <div className="mb-8">
            <Link 
              href="/analytics" 
              className="block bg-gray-100 hover:bg-gray-200 rounded-lg p-4 text-center transition-colors"
            >
              <div className="flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                <span className="ml-2 font-medium text-blue-600">View Nutrition Analytics</span>
              </div>
            </Link>
          </div>
          
          <div className="flex justify-center mb-8">
            <button 
              onClick={handleRefresh}
              disabled={refreshing || loadingData}
              className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${refreshing || loadingData ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'text-gray-700 bg-white hover:bg-gray-50'}`}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
            </button>
          </div>
        </div>
      )}
      {isLogDetailModalVisible && (
        <FoodLogDetailModal 
          logData={selectedLogData}
          onClose={handleCloseLogDetailModal}
          userGoals={userGoals}
          onDelete={handleDeleteLogItem}
        />
      )}
    </DashboardShell>
  );
}
