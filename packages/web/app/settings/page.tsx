'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  const { user, signOut, loading: authLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
      const { error } = await signOut();
      if (error) {
        alert(`Sign Out Error: ${error.message}`); // Use a proper notification system later
      }
    } catch (error: any) {
      alert(`Sign Out Error: ${error.message || 'An unexpected error occurred.'}`);
      console.error('Sign Out error:', error);
    } finally {
      setSigningOut(false);
    }
  }, [signOut, signingOut]);

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

        {/* Settings Content (Adopted from Example) */} 
        <main className="flex-1 overflow-y-auto bg-white"> {/* Use white bg for main list area */} 
           <div className="max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
             {/* Profile & Goals Section */} 
             <div className="mb-8 mt-4">
               <h2 className="text-lg font-semibold text-blue-600 mb-4 px-1">Profile & Goals</h2>
               <div className="space-y-0 rounded-lg overflow-hidden border border-gray-200 bg-white">
                 {/* Edit Profile (Use Link) */} 
                 <Link href="/profile" className="block hover:bg-gray-50 transition-colors cursor-pointer">
                   <div className="flex items-center p-4">
                     <div className="flex-shrink-0 text-blue-600">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                     </div>
                     <div className="ml-4 flex-1">
                       <h3 className="text-base font-medium text-gray-900">Edit Your Profile</h3>
                       <p className="text-sm text-gray-600">Update age, weight, height, etc.</p>
                     </div>
                     <div className="ml-2 flex-shrink-0 text-gray-400">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                     </div>
                   </div>
                 </Link>
                 
                 <div className="border-t border-gray-200"></div>
                 
                 {/* Set Nutrient Goals (Use Link) */} 
                 <Link href="/settings/goals" className="block hover:bg-gray-50 transition-colors cursor-pointer">
                   <div className="flex items-center p-4">
                     <div className="flex-shrink-0 text-blue-600">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                     </div>
                     <div className="ml-4 flex-1">
                       <h3 className="text-base font-medium text-gray-900">Set Nutrient Goals</h3>
                       <p className="text-sm text-gray-600">Choose which nutrients to track</p>
                     </div>
                     <div className="ml-2 flex-shrink-0 text-gray-400">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                     </div>
                   </div>
                 </Link>
                 
                 <div className="border-t border-gray-200"></div>
                 
                 {/* View Log History (Use Link) */} 
                 <Link href="/history" className="block hover:bg-gray-50 transition-colors cursor-pointer">
                   <div className="flex items-center p-4">
                     <div className="flex-shrink-0 text-blue-600">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </div>
                     <div className="ml-4 flex-1">
                       <h3 className="text-base font-medium text-gray-900">View Log History</h3>
                       <p className="text-sm text-gray-600">Review past food logs by date</p>
                     </div>
                     <div className="ml-2 flex-shrink-0 text-gray-400">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                     </div>
                   </div>
                 </Link>
               </div>
             </div>
             
             {/* Account Section */} 
             <div className="mb-8">
               <h2 className="text-lg font-semibold text-blue-600 mb-4 px-1">Account</h2>
               
               {authLoading ? (
                 <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                   <p className="text-sm text-gray-500">Loading account info...</p>
                 </div>
               ) : (
                 <> 
                   {user && (
                     <p className="text-sm text-gray-600 px-1 mb-3">
                       Signed in as: <span className="font-medium text-gray-900">{user.email}</span>
                     </p>
                   )}
                   
                   <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                     {/* Sign Out */} 
                     <div 
                       className={`transition-colors cursor-pointer ${signingOut || !user ? 'opacity-60 pointer-events-none bg-gray-50' : 'hover:bg-gray-50'}`}
                       onClick={signingOut || !user ? undefined : handleSignOut}
                     >
                       <div className="flex items-center p-4">
                         <div className="flex-shrink-0 text-red-600">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                         </div>
                         <div className="ml-4 flex-1">
                           <h3 className="text-base font-medium text-red-600">Sign Out</h3>
                         </div>
                         {signingOut && (
                           <div className="ml-2 flex-shrink-0">
                             <LoadingSpinner />
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                  </>
               )}
             </div>
             
             {/* Additional space at bottom */}
             <div className="h-16"></div>
           </div>
        </main>
      </div>
    </div>
  );
} 