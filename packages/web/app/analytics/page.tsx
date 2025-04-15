'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
// Import Recharts components
import {
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer
} from 'recharts';

// TODO: Add a charting library (e.g., Recharts or Chart.js)

// Types (reuse or adapt from mobile/dashboard)
interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

interface DailyNutrientTotal {
    day: string; // YYYY-MM-DD
    total: number;
}

interface AnalyticsSummary {
    today: { value: number; percent: number };
    weeklyAvg: { value: number; percent: number };
    monthlyAvg: { value: number; percent: number };
}

// Modified Chart data structure for Recharts
interface ChartPoint {
    label: string; // X-axis label (e.g., 'Mon', '10-23')
    Actual: number | null;
    Goal: number | null;
}

// Helper function
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};
const getPastDate = (daysAgo: number): Date => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
};


export default function AnalyticsPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // State from mobile adaptation
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNutrient, setSelectedNutrient] = useState<string | null>(null); // Start with null
  const [trackedNutrientsList, setTrackedNutrientsList] = useState<UserGoal[]>([]); // Store full goal info
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [weeklyChartData, setWeeklyChartData] = useState<ChartPoint[] | null>(null);
  const [monthlyChartData, setMonthlyChartData] = useState<ChartPoint[] | null>(null);
  const [currentGoal, setCurrentGoal] = useState<UserGoal | null>(null);

  // Fetch tracked nutrients (user goals) for the selector
  const loadTrackedNutrients = useCallback(async () => {
    if (!user || !supabase) {
        setTrackedNutrientsList([]);
        setLoadingGoals(false);
        setError("User not available.")
        return;
    }
    setLoadingGoals(true);
    setError(null); 
    try {
        const { data: goalsData, error: goalsError } = await supabase
            .from('user_goals')
            .select('nutrient, target_value, unit, goal_type')
            .eq('user_id', user.id);

        if (goalsError) throw goalsError;

        const nutrients = goalsData || [];
        setTrackedNutrientsList(nutrients);

        // Set default selection if not set or invalid, or handle no goals
        if (nutrients.length > 0) {
             if (!selectedNutrient || !nutrients.some(n => n.nutrient === selectedNutrient)) {
                setSelectedNutrient(nutrients[0].nutrient); // Default to first nutrient
             }
        } else {
             setSelectedNutrient(null); // No goals, no selection
             setError("No nutrients are currently being tracked. Please set goals in Settings.");
        }

    } catch (err: any) {
        console.error("Error fetching tracked nutrients:", err);
        setError(`Failed to load tracked nutrients: ${err.message}`);
        setTrackedNutrientsList([]);
        setSelectedNutrient(null);
    } finally {
        setLoadingGoals(false);
    }
  }, [user, supabase, selectedNutrient]); // selectedNutrient dependency might cause loops if not careful, manage state setting

  // Fetch analytics data for the selected nutrient
  const fetchAnalyticsData = useCallback(async () => {
    if (!user || !supabase || !selectedNutrient || trackedNutrientsList.length === 0) {
        setLoadingData(false);
        return;
    }

    const goalDetails = trackedNutrientsList.find(g => g.nutrient === selectedNutrient);
    if (!goalDetails) {
        setError(`Details for nutrient '${selectedNutrient}' not found.`);
        setLoadingData(false);
        return;
    }
    setCurrentGoal(goalDetails); 

    setLoadingData(true);
    setError(null);
    setAnalyticsSummary(null);
    setWeeklyChartData(null);
    setMonthlyChartData(null);

    console.log(`Fetching analytics for: ${selectedNutrient}`);

    // --- Replace MOCK with Supabase RPC call --- 
    const startDate = formatDate(getPastDate(29));
    const endDate = formatDate(new Date());

    try {
        console.log(`Calling Supabase RPC: get_daily_nutrient_totals for ${selectedNutrient} from ${startDate} to ${endDate}`);
        const { data, error: fetchError } = await supabase.rpc('get_daily_nutrient_totals', {
            p_user_id: user.id,          // Match parameter name in SQL function
            p_nutrient_key: selectedNutrient, // Match parameter name in SQL function
            p_start_date: startDate,       // Match parameter name in SQL function
            p_end_date: endDate           // Match parameter name in SQL function
        });

        console.log("Supabase RPC Response:", { data, fetchError });

        if (fetchError) {
            // Attempt to parse Supabase error for more detail
            let detailedError = fetchError.message;
            try {
                 const parsedHint = JSON.parse(fetchError.hint || '{}');
                 if (parsedHint.message) detailedError = parsedHint.message;
            } catch (e) { /* Ignore parsing errors */ }
            throw new Error(`Database error: ${detailedError} (Code: ${fetchError.code})`);
        }
        
        const dailyTotals: DailyNutrientTotal[] = data || [];
        console.log("Processed daily totals:", dailyTotals);

        // --- Calculations (using fetched data) ---
        let calculatedSummary: AnalyticsSummary = {
            today: { value: 0, percent: 0 },
            weeklyAvg: { value: 0, percent: 0 },
            monthlyAvg: { value: 0, percent: 0 },
        };
        const targetValue = goalDetails.target_value || 0;

        if (dailyTotals.length > 0) {
            const todayTotal = dailyTotals[dailyTotals.length - 1]?.total || 0;
            calculatedSummary.today = { value: todayTotal, percent: targetValue > 0 ? (todayTotal / targetValue) * 100 : 0 };

            const last7Days = dailyTotals.slice(-7);
            const weeklySum = last7Days.reduce((sum, day) => sum + (day.total || 0), 0);
            const weeklyAvg = last7Days.length > 0 ? weeklySum / last7Days.length : 0;
            calculatedSummary.weeklyAvg = { value: weeklyAvg, percent: targetValue > 0 ? (weeklyAvg / targetValue) * 100 : 0 };

            const monthlySum = dailyTotals.reduce((sum, day) => sum + (day.total || 0), 0);
            const monthlyAvg = dailyTotals.length > 0 ? monthlySum / dailyTotals.length : 0;
            calculatedSummary.monthlyAvg = { value: monthlyAvg, percent: targetValue > 0 ? (monthlyAvg / targetValue) * 100 : 0 };
        }
        setAnalyticsSummary(calculatedSummary);

        // --- Chart Data Prep (Formatted for Recharts) ---
        if (dailyTotals.length > 0) {
             // Weekly Chart Data
             const last7 = dailyTotals.slice(-7);
             const weeklyData: ChartPoint[] = last7.map(d => ({
                 label: d.day.slice(5), // MM-DD
                 Actual: d.total,
                 Goal: targetValue
             }));
             setWeeklyChartData(weeklyData);

             // Monthly Chart Data
             const monthlyData: ChartPoint[] = dailyTotals.map(d => ({
                label: d.day.slice(5), // MM-DD
                Actual: d.total,
                Goal: targetValue
             }));
             setMonthlyChartData(monthlyData);

        } else {
            setWeeklyChartData(null);
            setMonthlyChartData(null);
        }

    } catch (err: any) {
        console.error(`Error fetching/processing analytics data for ${selectedNutrient}:`, err);
        // Use the error message directly from the caught error
        setError(`Failed to load analytics: ${err.message}`); 
        setAnalyticsSummary(null);
        setWeeklyChartData(null);
        setMonthlyChartData(null);
        setCurrentGoal(null);
    } finally {
        setLoadingData(false);
    }
  }, [user, supabase, selectedNutrient, trackedNutrientsList]);

  // Initial load of tracked nutrients
  useEffect(() => {
    if (!authLoading && user) {
        loadTrackedNutrients();
    }
  }, [authLoading, user, loadTrackedNutrients]);

  // Fetch data when selected nutrient changes
  useEffect(() => {
    if (selectedNutrient && !loadingGoals) {
        fetchAnalyticsData();
    }
  }, [selectedNutrient, loadingGoals, fetchAnalyticsData]);

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

  // Loading/Auth checks
  if (authLoading || loadingGoals) {
    return <div className="flex h-screen items-center justify-center"><p>Loading Analytics Setup...</p></div>; // Combined initial loading
  }
  if (!user) {
     return <div className="flex h-screen items-center justify-center"><p>Please log in to view analytics.</p></div>;
  }
  
  const getNutrientName = (key: string | null): string => {
    return trackedNutrientsList.find(n => n.nutrient === key)?.nutrient.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Nutrient';
  };
  const getNutrientUnit = (key: string | null): string => {
    return trackedNutrientsList.find(n => n.nutrient === key)?.unit || '';
  };

  return (
    <div className="flex h-screen bg-gray-50 relative overflow-hidden"> {/* Changed bg */} 
      {/* Sidebar navigation (Standard) */}
       <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}> 
          <div className="p-4 border-b border-gray-200 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-800">NutriPal</h2><button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <nav className="flex-1 p-4 space-y-1">
            <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 font-medium">Dashboard</Link>
            <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
            <Link href="/analytics" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Analytics</Link> {/* Updated */} 
            <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
            <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
            <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link>
          </nav>
       </div>

      {/* Main content area */} 
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Hamburger (Standard) */} 
         <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0"> 
            <div className="flex items-center justify-between"><button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button><h2 className="text-xl font-semibold text-gray-800">Nutrition Analytics</h2><div className="w-8"></div></div>
         </header>

        {/* Analytics Content */} 
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {/* Nutrient Selector - Framed and slightly wider */}
            <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm max-w-sm"> {/* Frame added, max-w-sm */} 
                <label htmlFor="nutrient-select" className="block text-base font-medium text-gray-800 mb-2">Select Nutrient</label> {/* Slightly larger label */} 
                <select 
                    id="nutrient-select"
                    value={selectedNutrient || ''}
                    onChange={(e) => setSelectedNutrient(e.target.value)}
                    disabled={loadingGoals || trackedNutrientsList.length === 0}
                    // Increased padding and text size
                    className="mt-1 block w-full pl-4 pr-10 py-2.5 text-base text-gray-900 border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                    {trackedNutrientsList.length === 0 && !loadingGoals && (
                        <option value="" disabled>No goals set</option>
                    )}
                    {trackedNutrientsList.map(goal => (
                        <option key={goal.nutrient} value={goal.nutrient}>
                            {goal.nutrient.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                    ))}
                </select>
            </div>

            {/* Loading/Error states specific to data fetching */} 
            {loadingData && (
                <div className="flex items-center justify-center py-10"><p>Loading analytics data...</p></div>
            )}
            {error && !loadingData && (
                 <div className="mb-6 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
                   Error: {error}
                 </div>
            )}

            {/* Display Analytics Data */} 
            {!loadingData && !error && selectedNutrient && analyticsSummary && currentGoal && (
                <div className="space-y-8">
                    {/* Summary Cards */} 
                    <section>
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">Summary for {getNutrientName(selectedNutrient)}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Today Card */} 
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"> 
                                <h4 className="text-sm font-medium text-gray-500 mb-1">Today</h4>
                                <p className="text-xl font-semibold text-gray-900">{analyticsSummary.today.value.toFixed(1)} {getNutrientUnit(selectedNutrient)}</p>
                                <p className="text-sm text-gray-600">({analyticsSummary.today.percent.toFixed(0)}% of goal)</p>
                                {/* TODO: Add mini progress bar */} 
                            </div>
                            {/* Weekly Avg Card */} 
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"> 
                                <h4 className="text-sm font-medium text-gray-500 mb-1">Weekly Average</h4>
                                <p className="text-xl font-semibold text-gray-900">{analyticsSummary.weeklyAvg.value.toFixed(1)} {getNutrientUnit(selectedNutrient)}</p>
                                <p className="text-sm text-gray-600">({analyticsSummary.weeklyAvg.percent.toFixed(0)}% of goal)</p>
                            </div>
                            {/* Monthly Avg Card */} 
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"> 
                                <h4 className="text-sm font-medium text-gray-500 mb-1">Monthly Average</h4>
                                <p className="text-xl font-semibold text-gray-900">{analyticsSummary.monthlyAvg.value.toFixed(1)} {getNutrientUnit(selectedNutrient)}</p>
                                <p className="text-sm text-gray-600">({analyticsSummary.monthlyAvg.percent.toFixed(0)}% of goal)</p>
                            </div>
                        </div>
                    </section>

                    {/* Charts */} 
                    <section>
                         <h3 className="text-lg font-semibold text-gray-800 mb-3">Trends</h3>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Weekly Chart Implementation */} 
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm min-h-[350px]"> 
                                <h4 className="text-md font-medium text-gray-600 mb-4">Last 7 Days Trend</h4>
                                {weeklyChartData && weeklyChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={weeklyChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                            <XAxis dataKey="label" fontSize={12} />
                                            <YAxis fontSize={12} unit={getNutrientUnit(selectedNutrient) || undefined} />
                                            <Tooltip formatter={(value: number) => value.toFixed(1)} />
                                            <Legend />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Actual" 
                                                stroke="#3b82f6" /* blue-500 */
                                                strokeWidth={2} 
                                                dot={{ r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Goal" 
                                                stroke="#ef4444" /* red-500 */ 
                                                strokeWidth={1}
                                                strokeDasharray="5 5" 
                                                dot={false}
                                                activeDot={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : <p className="text-gray-500 text-sm text-center pt-10">No weekly data available to display chart.</p>}
                            </div>
                             {/* Monthly Chart Implementation */} 
                             <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm min-h-[350px]"> 
                                 <h4 className="text-md font-medium text-gray-600 mb-4">Last 30 Days Trend</h4>
                                 {monthlyChartData && monthlyChartData.length > 0 ? (
                                     <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={monthlyChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                            <XAxis dataKey="label" fontSize={12} tickCount={6} /* Reduce ticks for monthly */ /> 
                                            <YAxis fontSize={12} unit={getNutrientUnit(selectedNutrient) || undefined} />
                                            <Tooltip formatter={(value: number) => value.toFixed(1)} />
                                            <Legend />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Actual" 
                                                stroke="#10b981" /* emerald-500 */
                                                strokeWidth={2} 
                                                dot={false} /* Hide dots for monthly */
                                                activeDot={{ r: 6 }}
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Goal" 
                                                stroke="#f97316" /* orange-500 */ 
                                                strokeWidth={1}
                                                strokeDasharray="5 5" 
                                                dot={false}
                                                activeDot={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                 ) : <p className="text-gray-500 text-sm text-center pt-10">No monthly data available to display chart.</p>}
                             </div>
                         </div>
                    </section>
                </div>
            )}
            
            {!selectedNutrient && !loadingGoals && !error && (
                 <div className="text-center py-10">
                     <p className="text-gray-600">Please select a nutrient to view analytics.</p>
                 </div>
            )}
        </main>
      </div>
    </div>
  );
} 