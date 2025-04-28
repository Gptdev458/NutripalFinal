'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
// Assuming icons might be used - replace with actual icon components if available
// import { UserIcon, CogIcon, ArrowRightIcon, LogoutIcon } from '@heroicons/react/outline'; 

// Loading Spinner Component (from example)
const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center">
      <div className="relative w-5 h-5">
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-red-100 rounded-full"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-transparent border-t-red-600 rounded-full animate-spin"></div>
      </div>
    </div>
  );
};

export default function SettingsPage() {
  const { user, supabase, loading, error, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Menu close on outside click effect (Keep)
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

  // Sign out handler (Keep)
  const handleSignOut = useCallback(async () => {
    if (signingOut) return; // Prevent double clicks
    setSigningOut(true);
    try {
      console.log("SettingsPage: Attempting sign out..."); // Optional: Add log
      const { error } = await signOut();
      console.log("SettingsPage: Sign out completed.", { error }); // Optional: Add log

      // Always redirect after attempting sign out
      console.log("SettingsPage: Redirecting to /login..."); // Optional: Add log
      router.replace('/login'); // <<< ADD REDIRECT

      if (error) {
        // Log error or show non-blocking notification if needed, but redirect happens anyway
        console.error(`Sign Out Error (handled by redirect): ${error.message}`);
        // alert(`Sign Out Error: ${error.message}`); // Avoid blocking alerts if possible
      }
    } catch (error: any) {
      console.error('Sign Out unexpected error:', error);
      // Still redirect even if there was an unexpected JS error in the try block
      router.replace('/login'); 
      // alert(`Sign Out Error: ${error.message || 'An unexpected error occurred.'}`);
    } finally {
      // No need to setSigningOut(false) as we are navigating away
      // setSigningOut(false);
    }
  }, [signOut, signingOut, router]); // <<< ADD router TO DEPENDENCY ARRAY

  if (loading) {
    return <div>Loading...</div>; // Or a spinner
  }

  // == Render Component with New UI Structure ==
  return (
    <div className="flex h-screen bg-gray-50 relative overflow-hidden"> {/* Changed background */}
      {/* Sidebar navigation (Standard) */}
       <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}> 
          <div className="p-4 border-b border-gray-200 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-800">NutriPal</h2><button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <nav className="flex-1 p-4 space-y-1">
            {/* Inactive */} 
            <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 font-medium">Dashboard</Link>
            <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
            <Link href="/analytics" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Analytics</Link>
            <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
            <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
            {/* Active: Settings */}
            <Link href="/settings" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Settings</Link>
          </nav>
       </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Hamburger (Consistent) */}
        <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0">
           <div className="flex items-center justify-between">
            <button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-800">Settings</h2>
            <div className="w-8"></div> { /* Balance */}
          </div>
        </header>

        {/* Settings Content */} 
        <main className="flex-1 overflow-y-auto p-6">
           <div className="max-w-xl mx-auto bg-white p-6 rounded-lg shadow border border-gray-200">
             <h2 className="text-xl font-semibold text-gray-800 mb-6">Settings</h2>
             {/* Placeholder Links/Sections */}
             <div className="space-y-4">
               <Link 
                 href="/settings/goals" 
                 className="block p-4 border rounded-md hover:bg-gray-50 transition-colors duration-150"
               >
                  <h3 className="font-medium text-blue-600">Nutrient Goals</h3>
                  <p className="text-sm text-gray-600 mt-1">Manage which nutrients you&apos;re tracking and set your daily targets.</p>
               </Link>

               {/* Sign Out Button */}
                <button 
                  onClick={handleSignOut}
                  disabled={signingOut || loading} 
                  className="w-full mt-6 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {signingOut ? (
                    <LoadingSpinner />
                  ) : (
                    'Sign Out'
                  )}
               </button>
             </div>
           </div>
        </main>
      </div>
    </div>
  );
} 