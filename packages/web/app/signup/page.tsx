'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext'; // Import useAuth hook
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); // For success/confirmation messages
  const router = useRouter();
  const { supabase } = useAuth(); // Get Supabase client from context

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    if (!supabase) {
        console.error('[handleSignUp] Supabase client not available from context.');
        setError('Authentication service is not ready.');
        setLoading(false);
        return;
    }

    try {
      console.log('[handleSignUp] Calling signUp...');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // Add options here if needed, e.g., redirect URL for email confirmation
        // options: {
        //   emailRedirectTo: `${window.location.origin}/` // Redirect to home after confirmation
        // }
      });
      console.log('[handleSignUp] signUp completed.', { data, signUpError });

      if (signUpError) {
        throw signUpError;
      }

      // Handle different signup outcomes (email confirmation needed?)
      if (data.user && data.user.identities?.length === 0) {
         // This can happen if user already exists but is unconfirmed
         setError('User already exists but is unconfirmed. Please check your email to confirm.');
      } else if (data.session) {
         // User is signed up AND logged in (e.g., if auto-confirm is enabled)
         console.log('Sign up successful and logged in.');
         setMessage('Sign up successful! Redirecting...');
         // Redirect to dashboard/home page
         router.replace('/'); // Use replace to avoid signup page in history
      } else if (data.user) {
         // User is signed up but requires confirmation (standard flow)
         console.log('Sign up successful, confirmation email sent.');
         setMessage('Sign up successful! Please check your email to confirm your account.');
         // Optionally clear form or stay on page showing the message
         setEmail('');
         setPassword('');
         setConfirmPassword('');
      } else {
         // Unexpected case
         console.warn('[handleSignUp] Unexpected signUp response:', data);
         setError('An unexpected issue occurred during sign up.');
      }

    } catch (err: any) {
      console.error('[handleSignUp] Error caught:', err);
      setError(err.message || 'An unexpected error occurred during sign up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h2 className="mb-6 text-center text-2xl font-bold text-gray-800">
          Sign Up for NutriPal
        </h2>
        <form onSubmit={handleSignUp}>
          {/* Email Input */}
          <div className="mb-4">
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">Email Address</label>
            <input
              type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="you@example.com" disabled={loading}
            />
          </div>
          {/* Password Input */}
          <div className="mb-4">
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="••••••••" disabled={loading} minLength={6} // Supabase default minimum
            />
          </div>
           {/* Confirm Password Input */}
          <div className="mb-6">
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type="password" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="••••••••" disabled={loading} minLength={6}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-center text-sm text-red-700">
              {error}
            </div>
          )}
           {/* Success Message */}
          {message && (
            <div className="mb-4 rounded border border-green-400 bg-green-100 p-3 text-center text-sm text-green-700">
              {message}
            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit" disabled={loading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? 'Signing Up...' : 'Sign Up'}
            </button>
          </div>
        </form>
         {/* TODO: Add link back to Login page */}
      </div>
    </div>
  );
} 