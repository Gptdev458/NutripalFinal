// packages/web/app/login/page.tsx
'use client';

import React, { useState } from 'react';
// import { getSupabaseClient } from 'shared'; // REMOVE shared client import
import { useAuth } from '@/context/AuthContext'; // Import useAuth hook
import { useRouter } from 'next/navigation'; // Import the router for redirection

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(); // Initialize the router
  const { supabase } = useAuth(); // Get Supabase client from context

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    console.log('[handleLogin] Starting login attempt...'); // Log 1

    // Check if Supabase client is available from context
    if (!supabase) {
        console.error('[handleLogin] Supabase client not available from context.');
        setError('Authentication service is not ready.');
        setLoading(false);
        return;
    }

    try {
      console.log('[handleLogin] Calling signInWithPassword...'); // Log 3
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      console.log('[handleLogin] signInWithPassword completed.', { signInData, signInError }); // Log 4

      if (signInError) {
        console.log('[handleLogin] Error detected, throwing...');
        throw signInError;
      }

      console.log('[handleLogin] Login successful.');
      setLoading(false); 

      // Re-introduce redirect after successful login
      console.log('[handleLogin] Calling router.replace(\'/dashboard\')...');
      router.replace('/dashboard');

    } catch (err: unknown) {
      console.error('[handleLogin] Error caught:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'An unexpected error occurred during login.');
      setLoading(false);
    }
  };

  // ... rest of the JSX remains the same ...
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h2 className="mb-6 text-center text-2xl font-bold text-gray-800">
          Log In to NutriPal
        </h2>
        <form onSubmit={handleLogin}>
          {/* Email Input */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>
          {/* Password Input */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-center text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </form>
        {/* Sign Up Link */}
        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <a href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
