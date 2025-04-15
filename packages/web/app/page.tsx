'use client'; // Use client component to potentially use useAuth later

import { useAuth } from '@/context/AuthContext'; // Import useAuth hook
import { useRouter } from 'next/navigation'; // Import router for redirect after signout
import React from 'react'; // Import React for button element

export default function HomePage() {
  // Get user, loading state AND supabase client from context
  const { user, loading, supabase } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    if (!supabase) {
        console.error("SignOut Error: Supabase client not available.");
        // Optionally show an error message to the user
        return;
    }
    console.log("Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      // Optionally show an error message to the user
    } else {
      console.log("Sign out successful, redirecting to login.");
      // No need to manually push, onAuthStateChange + middleware handle it
      // router.push('/login'); 
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>;
  }

  // Although middleware protects this, double-checking user ensures no flash of content
  if (!user) {
     // This shouldn't typically be reached due to middleware, but acts as a fallback
     return <div className="flex min-h-screen items-center justify-center"><p>Redirecting to login...</p></div>;
     // Or redirect programmatically:
     // import { useRouter } from 'next/navigation';
     // const router = useRouter();
     // useEffect(() => { router.push('/login'); }, [router]);
     // return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="absolute top-4 right-4">
         <button 
            onClick={handleSignOut} 
            className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          >
            Sign Out
          </button>
      </div>
      <h1 className="text-4xl font-bold mb-4">NutriPal Dashboard</h1>
      <p className="text-lg mb-6">Welcome, {user.email}!</p>
      {/* TODO: Add dashboard content */}
      <p>(Placeholder for Dashboard Content)</p>
    </main>
  );
}
