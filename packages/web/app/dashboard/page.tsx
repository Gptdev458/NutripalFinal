'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

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
    goal_type?: string; // Added from mobile example (optional)
}

interface FoodLog {
    id: number;
    timestamp: string; 
    food_name?: string | null;
    calories?: number | null;
    [key: string]: any; 
}

interface DailyTotals {
    [nutrientKey: string]: number;
}

// Helper function
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export default function DashboardPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // Add refreshing state
  const [error, setError] = useState<string | null>(null);

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
            supabase
                .from('user_goals')
                .select('nutrient, target_value, unit, goal_type') // Include goal_type
                .eq('user_id', user.id),
            supabase
                .from('food_log')
                .select('*') 
                .eq('user_id', user.id)
                .gte('timestamp', startOfDay)
                .lte('timestamp', endOfDay)
                .order('timestamp', { ascending: false })
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const fetchedGoals = goalsResponse.data || [];
        const fetchedLogs = logsResponse.data || [];

        setUserGoals(fetchedGoals);
        setRecentLogs(fetchedLogs.slice(0, 5)); 

        const totals: DailyTotals = {};
        fetchedGoals.forEach(goal => {
            let currentIntake = 0;
            fetchedLogs.forEach(log => {
                const logValue = log[goal.nutrient];
                if (typeof logValue === 'number' && !isNaN(logValue)) {
                    currentIntake += logValue;
                }
            });
            totals[goal.nutrient] = currentIntake;
        });
        if (!totals['calories']) {
             let calorieTotal = 0;
             fetchedLogs.forEach(log => {
                 if (typeof log.calories === 'number' && !isNaN(log.calories)) {
                     calorieTotal += log.calories;
                 }
             });
             totals['calories'] = calorieTotal;
        }
        setDailyTotals(totals);

        console.log("Dashboard data fetched:", { fetchedGoals, fetchedLogs, totals });

    } catch (err: any) {
        console.error("Error fetching dashboard data:", err);
        setError(`Failed to load dashboard data: ${err.message}`);
        setUserGoals([]);
        setDailyTotals({});
        setRecentLogs([]);
    } finally {
        setLoadingData(false);
        setRefreshing(false);
    }

  }, [user, supabase]);

  // Initial fetch 
  useEffect(() => {
      if (!authLoading && user) {
          fetchDashboardData();
      } else if (!authLoading && !user) {
          setLoadingData(false);
      }
  }, [authLoading, user, fetchDashboardData]);
  
  // Handle Refresh Action
  const handleRefresh = () => {
      fetchDashboardData(true); // Pass true to indicate refresh
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

  // Loading/Auth checks (keep as is)
  if (authLoading) {
    return <div className="flex h-screen items-center justify-center"><p>Loading...</p></div>;
  }
  if (!user) {
     return <div className="flex h-screen items-center justify-center"><p>Please log in to view the dashboard.</p></div>;
  }

  return (
    <div className="flex h-screen bg-white relative overflow-hidden"> {/* Changed bg */}
      {/* Sidebar navigation (Standard) */}
       <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}> 
          <div className="p-4 border-b border-gray-200 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-800">NutriPal</h2><button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <nav className="flex-1 p-4 space-y-1">
            {/* Active: Dashboard */}
            <Link href="/dashboard" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Dashboard</Link>
            {/* Inactive */} 
            <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
            <Link href="/analytics" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Analytics</Link>
            <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
            <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
            <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link>
          </nav>
       </div>

      {/* Main content area */} 
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Hamburger (Keep slide-in) */}
        <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0">
           <div className="flex items-center justify-between"><button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button><h2 className="text-xl font-semibold text-gray-800">Dashboard</h2><div className="w-8"></div></div>
        </header>

        {/* Dashboard Content (New Layout) */} 
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"> 
           {/* Use loadingData for primary loading state */} 
           {loadingData && !refreshing ? ( 
             <div className="flex flex-col items-center justify-center pt-20">
               <LoadingSpinner />
               <p className="mt-4 text-gray-500">Loading Dashboard...</p>
             </div>
           ) : (
             <div className="max-w-3xl mx-auto"> {/* Adjusted max-width */} 
               {/* Error Message */} 
               {error && (
                 <div className="mb-6 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
                   Error: {error}
                 </div>
               )}
               
               {/* Refresh Indicator */} 
               {refreshing && (
                 <div className="flex justify-center py-2 mb-4">
                   <LoadingSpinner />
                 </div>
               )}
               
               {/* Nutrition Goals Section */} 
               <div className="mb-8">
                 <h2 className="text-lg font-semibold text-blue-600 mb-4 px-1">Nutrition Goals</h2>
                 {userGoals.length > 0 ? (
                   <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                     <div className="overflow-x-auto">
                       <table className="min-w-full divide-y divide-gray-200">
                         <thead className="bg-gray-50">
                           <tr>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nutrient</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                           </tr>
                         </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                           {userGoals.map(goal => {
                             const current = dailyTotals[goal.nutrient] || 0;
                             const target = goal.target_value || 0;
                             const progress = target > 0 ? Math.min((current / target) * 100, 150) : 0; 
                             const displayPercentage = progress.toFixed(0);
                             const goalType = goal.goal_type || 'goal';

                             // Determine bar color only
                             let progressBarColor = 'bg-blue-600'; // Updated default
                             if (goalType === 'limit') {
                               progressBarColor = progress > 100 ? 'bg-red-500' : 'bg-yellow-500';
                             } else { // type === 'goal'
                                progressBarColor = progress >= 100 ? 'bg-green-500' : 'bg-blue-600';
                             }

                             return (
                               <tr key={goal.nutrient} className="hover:bg-gray-50">
                                 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{goal.nutrient.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/ G$/, '')}</td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{goalType}</td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{`${Math.round(current)} / ${Math.round(target)} ${goal.unit}`}</td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                   <div className="flex items-center">
                                     <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                                       <div 
                                         className={`${progressBarColor} h-2.5 rounded-full`}
                                         style={{ width: `${Math.min(progress, 100)}%` }}
                                       ></div>
                                     </div>
                                     <span className="min-w-[40px] text-right">{displayPercentage}%</span>
                                   </div>
                                 </td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 ) : (
                   <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
                     <p className="text-gray-500 mb-4">No goals set yet.</p>
                     <Link href="/settings/goals" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                       Set Goals
                     </Link>
                   </div>
                 )}
               </div>
               
               {/* Today's Log Section */} 
               <div className="mb-8">
                 <h2 className="text-lg font-semibold text-blue-600 mb-4 px-1">Today's Log</h2>
                 {recentLogs.length > 0 ? (
                   <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                     <ul className="divide-y divide-gray-200">
                       {recentLogs.map(log => (
                         <li key={log.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                           <div>
                             <h3 className="text-base font-medium text-gray-900 truncate">{log.food_name || 'Logged Item'}</h3>
                           </div>
                           <div className="text-right flex-shrink-0 ml-4">
                             <span className="text-sm text-gray-500">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                {log.calories !== null && log.calories !== undefined && ` • ${Math.round(log.calories)} kcal`}
                             </span>
                           </div>
                         </li>
                       ))}
                     </ul>
                     <div className="bg-gray-50 px-4 py-3 sm:px-6 border-t border-gray-200">
                       <div className="flex justify-between items-center">
                         <div className="text-sm text-gray-700">
                           Today's Total: <span className="font-medium">{Math.round(dailyTotals['calories'] || 0)} kcal</span>
                         </div>
                         <Link href="/history" className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm font-medium">
                           View Full Log
                         </Link>
                       </div>
                     </div>
                   </div>
                 ) : (
                   <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
                     <p className="text-gray-500 mb-4">No food logged today.</p>
                     <Link href="/chat" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
                       Log Your First Meal
                     </Link>
                   </div>
                 )}
               </div>
               
               {/* Analytics Link (Updated styles & link) */}
               <div className="mb-8">
                 <Link 
                   href="/analytics" 
                   className="block bg-gray-100 hover:bg-gray-200 rounded-lg p-4 text-center transition-colors" // Removed opacity/disabled classes
                 >
                   <div className="flex items-center justify-center">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                     <span className="ml-2 font-medium text-blue-600">View Nutrition Analytics</span>
                   </div>
                 </Link>
               </div>
               
               {/* Refresh Button */} 
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
        </main>
      </div>
    </div>
  );
}
