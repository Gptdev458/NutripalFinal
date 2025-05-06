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
import type { UserProfile } from 'shared'; // Keep UserProfile if needed elsewhere

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

// Define a type for the log entry shape we expect from food_log
interface FoodLogEntry {
  timestamp: string;
  [key: string]: unknown; // Allow for nutrient columns like 'calories', 'protein_g', etc.
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

// Calculate appropriate Y-axis domain based on data and nutrient type
const calculateYAxisDomain = (chartData: ChartPoint[], goalValue: number, nutrientType: string | null) => {
  if (!chartData || chartData.length === 0) return [0, 100];
  
  // Find max value from data points
  const maxDataValue = Math.max(
    ...chartData.map(point => (point.Actual !== null ? point.Actual : 0)),
    goalValue || 0
  );
  
  // For calories, use round numbers with appropriate scaling
  if (nutrientType === 'calories') {
    // Add buffer and use nice round numbers
    const ceiling = Math.max(1000, maxDataValue * 1.2); // At least 1000 for calories
    return [0, Math.ceil(ceiling / 500) * 500]; // Round to nearest 500
  }
  
  // For other nutrients, add 20% padding above max
  const padding = Math.max(maxDataValue * 0.2, 5); // At least 5 units of padding
  return [0, Math.ceil(maxDataValue + padding)];
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
        setError("Authentication context not available.")
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

    } catch (err: unknown) {
        console.error("Full error object loading tracked nutrients:", err); // Log full error
        console.error("Error loading tracked nutrients:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to load nutrient goals: ${errorMessage}`);
    } finally {
        setLoadingGoals(false);
    }
  }, [user, supabase]);

  // Fetch analytics data for the selected nutrient
  const fetchAnalyticsData = useCallback(async () => {
    if (!user || !supabase || !selectedNutrient) {
        setError("Cannot fetch analytics data: missing user, service, or selected nutrient.");
        return;
    }
    setLoadingData(true);
    setError(null);

    const currentGoal = trackedNutrientsList.find(g => g.nutrient === selectedNutrient);
    setCurrentGoal(currentGoal || null);

    if (!currentGoal) {
        setError(`Goal not found for ${selectedNutrient}. Unable to calculate analytics.`);
        setLoadingData(false);
        setAnalyticsSummary(null);
        setWeeklyChartData(null);
        setMonthlyChartData(null);
        return;
    }

    const today = new Date();
    const thirtyDaysAgo = getPastDate(29); // Fetch 30 days of logs
    const startRange = thirtyDaysAgo.toISOString();
    const endRange = today.toISOString();

    try {
        console.log(`Fetching food_log for ${selectedNutrient} between ${startRange} and ${endRange}`);
        // 1. Fetch raw logs from food_log (select all columns for better type inference)
        const { data, error: logError } = await supabase
            .from('food_log') // <-- Correct table
            .select('*') // <-- Select all columns
            .eq('user_id', user.id)
            .gte('timestamp', startRange)
            .lte('timestamp', endRange)
            .order('timestamp', { ascending: true });

        if (logError) throw logError;

        // Explicitly type the fetched data after error check
        const rawLogs: FoodLogEntry[] | null = data as FoodLogEntry[] | null;

        console.log("Fetched raw logs:", rawLogs);

        // 2. Aggregate daily totals from raw logs
        const dailyTotalsMap = new Map<string, number>();
        if (Array.isArray(rawLogs)) {
            // No casting needed here now due to explicit typing above
            rawLogs.forEach(log => {
                // Use type guards for safer access
                if (log && typeof log.timestamp === 'string' && typeof log[selectedNutrient] === 'number') {
                    const day = log.timestamp.split('T')[0]; 
                    const value = log[selectedNutrient] as number;
                    const currentTotal = dailyTotalsMap.get(day) || 0;
                    dailyTotalsMap.set(day, currentTotal + value);
                } else {
                    console.warn("Skipping invalid log entry or missing nutrient value:", log);
                }
            });
        }
        // Ensure all days within the 30-day range have an entry (even if 0)
        for (let i = 29; i >= 0; i--) {
            const date = getPastDate(i);
            const dateStr = formatDate(date);
            if (!dailyTotalsMap.has(dateStr)) {
                dailyTotalsMap.set(dateStr, 0);
            }
        }

        // Convert map to sorted array
        const dailyTotals: DailyNutrientTotal[] = Array.from(dailyTotalsMap, ([day, total]) => ({ day, total }))
                                                     .sort((a, b) => a.day.localeCompare(b.day));

        console.log("Aggregated daily totals:", dailyTotals);

        if (dailyTotals.length === 0) {
             console.log("No aggregated totals found for the selected period and nutrient.");
            // Set empty/default states if no logs are found
            setAnalyticsSummary({
                today: { value: 0, percent: 0 },
                weeklyAvg: { value: 0, percent: 0 },
                monthlyAvg: { value: 0, percent: 0 },
            });
            setWeeklyChartData([]);
            setMonthlyChartData([]);
            setError(null); // Clear any previous errors
            setLoadingData(false);
            return; 
        }

        // Calculate summaries
        const todayStr = formatDate(new Date());
        const sevenDaysAgoStr = formatDate(getPastDate(6)); // Adjust index for filtering
        
        const todayData = dailyTotals.find(d => d.day === todayStr);
        const todayValue = todayData?.total || 0;
        const todayPercent = currentGoal.target_value > 0 ? (todayValue / currentGoal.target_value) * 100 : 0;

        const weeklyData = dailyTotals.filter(d => d.day >= sevenDaysAgoStr);
        const weeklyTotal = weeklyData.reduce((sum, d) => sum + d.total, 0);
        const weeklyAvgValue = weeklyData.length > 0 ? weeklyTotal / weeklyData.length : 0;
        const weeklyAvgPercent = currentGoal.target_value > 0 ? (weeklyAvgValue / currentGoal.target_value) * 100 : 0;

        const monthlyData = dailyTotals; // Uses all 30 days
        const monthlyTotal = monthlyData.reduce((sum, d) => sum + d.total, 0);
        const monthlyAvgValue = monthlyData.length > 0 ? monthlyTotal / monthlyData.length : 0;
        const monthlyAvgPercent = currentGoal.target_value > 0 ? (monthlyAvgValue / currentGoal.target_value) * 100 : 0;

        setAnalyticsSummary({
            today: { value: todayValue, percent: todayPercent },
            weeklyAvg: { value: weeklyAvgValue, percent: weeklyAvgPercent },
            monthlyAvg: { value: monthlyAvgValue, percent: monthlyAvgPercent },
        });

        // Prepare chart data (using dailyTotalsMap or sorted dailyTotals)
        const goalValue = currentGoal.target_value;
        const weeklyChart: ChartPoint[] = [];
        for (let i = 6; i >= 0; i--) { // Last 7 days
            const date = getPastDate(i);
            const dateStr = formatDate(date);
            const dayData = dailyTotalsMap.get(dateStr); // Use map for direct lookup
            weeklyChart.push({
                label: date.toLocaleDateString('en-US', { weekday: 'short' }),
                Actual: dayData !== undefined ? dayData : null, // Use null if no data
                Goal: goalValue
            });
        }
        setWeeklyChartData(weeklyChart);

        const monthlyChart: ChartPoint[] = dailyTotals.map(item => ({
            label: new Date(item.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            Actual: item.total,
            Goal: goalValue
        }));
        setMonthlyChartData(monthlyChart);

    } catch (err: unknown) {
        console.error("Full error object fetching/processing analytics data:", err); 
        console.error(`Error fetching/processing analytics data for ${selectedNutrient}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err); 
        setError(`Failed to load analytics: ${errorMessage}`);
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
                                            <YAxis 
                                                fontSize={12}
                                                domain={calculateYAxisDomain(weeklyChartData, currentGoal?.target_value || 0, selectedNutrient)}
                                                allowDecimals={false}
                                                tickCount={6}
                                            />
                                            <Tooltip 
                                                formatter={(value: number) => `${value.toFixed(1)} ${getNutrientUnit(selectedNutrient)}`} 
                                                labelFormatter={(label) => `Day: ${label}`}
                                            />
                                            <Legend />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Actual" 
                                                stroke="#3b82f6"
                                                strokeWidth={2} 
                                                dot={{ r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Goal" 
                                                stroke="#ef4444"
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
                                            <XAxis dataKey="label" fontSize={12} tickCount={6} />
                                            <YAxis 
                                                fontSize={12}
                                                domain={calculateYAxisDomain(monthlyChartData, currentGoal?.target_value || 0, selectedNutrient)}
                                                allowDecimals={false}
                                                tickCount={6}
                                            />
                                            <Tooltip 
                                                formatter={(value: number) => `${value.toFixed(1)} ${getNutrientUnit(selectedNutrient)}`}
                                                labelFormatter={(label) => `Date: ${label}`}
                                            />
                                            <Legend />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Actual" 
                                                stroke="#10b981"
                                                strokeWidth={2} 
                                                dot={false}
                                                activeDot={{ r: 6 }}
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="Goal" 
                                                stroke="#f97316"
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