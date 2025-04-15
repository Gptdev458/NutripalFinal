'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

// Helper function to format Date to 'YYYY-MM-DD' (needed for input and query)
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

interface FoodLog {
    id: number;
    timestamp: string; // ISO string
    food_name?: string | null;
    calories?: number | null;
    // Add other relevant fields if needed
}

export default function HistoryPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); // Default to today
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch logs based on selected date
  const fetchHistoryData = useCallback(async (dateToFetch: Date) => {
    if (!user || !supabase) {
        setLoading(false);
        return;
    }
    setLoading(true);
    setError(null);
    setLogs([]);

    const dateString = formatDate(dateToFetch); 
    const startOfDay = `${dateString}T00:00:00.000Z`; // Start of selected day in UTC
    const endOfDay = `${dateString}T23:59:59.999Z`;   // End of selected day in UTC

    console.log(`Fetching logs for user ${user.id} between ${startOfDay} and ${endOfDay}`);

    try {
        const { data, error: fetchError } = await supabase
            .from('food_log')
            .select('id, timestamp, food_name, calories')
            .eq('user_id', user.id)
            .gte('timestamp', startOfDay)
            .lte('timestamp', endOfDay)
            .order('timestamp', { ascending: false });

        if (fetchError) throw fetchError;

        setLogs(data || []);
        console.log(`Fetched ${data?.length || 0} logs`);

    } catch (err: any) {
        console.error('Error fetching history data:', err);
        setError('Failed to load history data: ' + err.message);
        setLogs([]);
    } finally {
        setLoading(false);
    }
  }, [user, supabase]);

  // Fetch data when selectedDate or auth state changes
  useEffect(() => {
    if (!authLoading && user) {
        fetchHistoryData(selectedDate);
    } else if (!authLoading && !user) {
         setLoading(false); // Not loading if not logged in
    }
  }, [selectedDate, authLoading, user, fetchHistoryData]);

  // Handle date input change
  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = new Date(event.target.value + 'T00:00:00Z'); // Ensure date is parsed correctly, treat as UTC start of day
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);

      if (!isNaN(newDate.getTime()) && newDate <= today) {
          setSelectedDate(newDate);
      } else {
          console.warn("Invalid or future date selected.");
          // Optionally reset to today or show an error
          // setSelectedDate(new Date()); 
      }
  };

  // Menu close on outside click effect
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
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
     return (
      <div className="flex h-screen items-center justify-center">
        <p>Please log in to view history.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 relative overflow-hidden">
      {/* Sidebar navigation */}
      <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">NutriPal</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
         </div>
         {/* Navigation Links - No active link here, maybe highlight Settings? */}
         <nav className="flex-1 p-4 space-y-1">
           <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Dashboard</Link>
           <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
           <Link href="#" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 opacity-50 cursor-not-allowed">Analytics</Link> {/* Placeholder */}
           <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
           <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
           <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link> 
         </nav>
      </div>

      {/* Main content area */} 
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Hamburger */}
        <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0">
           <div className="flex items-center justify-between">
            <button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-800">Log History</h2>
            <div className="w-8"></div> { /* Balance */}
          </div>
        </header>

        {/* History Content */} 
        <main className="flex-1 overflow-y-auto p-6">
           <div className="max-w-3xl mx-auto">
             {/* Date Selector */}
             <div className="mb-6">
                <label htmlFor="history-date" className="block text-sm font-medium text-gray-700 mb-1">Select Date:</label>
                <input 
                    type="date"
                    id="history-date"
                    value={formatDate(selectedDate)} // Format date to YYYY-MM-DD for input
                    onChange={handleDateChange}
                    max={formatDate(new Date())} // Prevent selecting future dates
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
             </div>

             {/* Error Display */}
             {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
                    {error}
                </div>
              )}

             {/* Log List Section */} 
             <h2 className="text-lg font-semibold text-gray-800 mb-3">Logs for {selectedDate.toLocaleDateString()}</h2>
             <div className="bg-white shadow rounded-md overflow-hidden">
                {loading ? (
                    <div className="p-6 text-center text-gray-500">
                        <p>Loading logs...</p>
                        {/* Optional: Add spinner */}
                    </div>
                 ) : logs.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                        <p>No logs found for this date.</p>
                    </div>
                 ) : (
                    <ul className="divide-y divide-gray-200">
                        {logs.map((log) => (
                            <li key={log.id} className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-blue-600 truncate">
                                        {log.food_name || 'Logged Item'}
                                    </p>
                                    {log.calories !== null && log.calories !== undefined && (
                                         <p className="text-sm text-gray-600">
                                            {Math.round(log.calories)} kcal
                                         </p>
                                     )}
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-500">
                                            {/* Simple Time Formatting */}
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    {/* Optional: Add link/button to view details later */}
                                </div>
                            </li>
                        ))}
                    </ul>
                 )}
             </div>
           </div>
        </main>
      </div>
    </div>
  );
} 