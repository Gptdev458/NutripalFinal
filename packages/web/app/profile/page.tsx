'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
// Import shared types - make sure they exist in shared/src/types.ts
import type { UserProfile, Sex, ActivityLevel, HealthGoal } from 'shared';
import Link from 'next/link';

// Combined component integrating User UI and Skeleton Logic
export default function ProfilePage() {
  const { user, supabase, loading: authLoading } = useAuth();

  // == State from Skeleton (Data & Form) ==
  const [age, setAge] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [sex, setSex] = useState<Sex | ''>( '');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>( '');
  const [healthGoal, setHealthGoal] = useState<HealthGoal | ''>( '');

  // == State from Skeleton (UI Status) ==
  const [loading, setLoading] = useState(true); // Page/Data loading
  const [saving, setSaving] = useState(false);   // Form saving
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // == State from User UI ==
  const [bmi, setBmi] = useState<string | null>(null);
  const [bmiCategory, setBmiCategory] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // == Merged handleChange ==
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setError(null); // Clear error on change
    setSuccessMessage(null); // Clear success message on change

    switch (name) {
      case 'age': setAge(value); break;
      case 'weight': setWeight(value); break;
      case 'height': setHeight(value); break;
      case 'sex': setSex(value as Sex | ''); break;
      case 'activityLevel': setActivityLevel(value as ActivityLevel | ''); break;
      case 'healthGoal': setHealthGoal(value as HealthGoal | ''); break;
      default: break;
    }
  };

  // == BMI Calculation Logic from User UI ==
  const calculateBMI = useCallback(() => {
    if (weight && height) {
      const heightInMeters = parseFloat(height) / 100;
      const weightInKg = parseFloat(weight);

      if (heightInMeters > 0 && weightInKg > 0) {
        const bmiValue = (weightInKg / (heightInMeters * heightInMeters)).toFixed(1);
        setBmi(bmiValue);

        const numBmi = parseFloat(bmiValue);
        if (numBmi < 18.5) setBmiCategory('Underweight');
        else if (numBmi < 25) setBmiCategory('Normal weight');
        else if (numBmi < 30) setBmiCategory('Overweight');
        else setBmiCategory('Obese');

      } else {
        setBmi(null);
        setBmiCategory('');
      }
    } else {
        setBmi(null);
        setBmiCategory('');
    }
  }, [weight, height]);

  // Recalculate BMI whenever weight or height changes (from User UI)
  useEffect(() => {
    calculateBMI();
  }, [weight, height, calculateBMI]);

  // == Data Fetching Logic from Skeleton ==
  const fetchProfile = useCallback(async () => {
    if (!user || !supabase) return;
    console.log('Fetching profile for user:', user.id);
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('user_profiles').select('*').eq('user_id', user.id).single();
      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
      if (data) {
        console.log('Profile data fetched:', data);
        setAge(data.age?.toString() ?? '');
        setWeight(data.weight_kg?.toString() ?? '');
        setHeight(data.height_cm?.toString() ?? '');
        setSex(data.sex ?? '');
        setActivityLevel(data.activity_level ?? '');
        setHealthGoal(data.health_goal ?? '');
      } else {
        console.log('No profile found for user, form will be empty.');
      }
    } catch (err: unknown) {
      console.error('Error fetching profile:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to fetch profile data.');
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  // Fetch profile on mount/auth change (from Skeleton)
  useEffect(() => {
    if (!authLoading && user && supabase) {
      fetchProfile();
    } else if (!authLoading && (!user || !supabase)) {
      setLoading(false);
      setError("User not authenticated or connection issue.");
    }
  }, [user, supabase, authLoading, fetchProfile]);

  // == Saving Logic from Skeleton (adapted) ==
  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !supabase) {
      setError("Cannot save profile: User not available."); return;
    }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const profileDataToSave: Partial<UserProfile> = {
        user_id: user.id,
        age: age ? parseInt(age, 10) : null,
        weight_kg: weight ? parseFloat(weight) : null,
        height_cm: height ? parseInt(height, 10) : null,
        sex: sex || null,
        activity_level: activityLevel || null,
        health_goal: healthGoal || null,
    };

    const parsedAge = profileDataToSave.age;
    if (parsedAge != null && (isNaN(parsedAge) || parsedAge <= 0)) {
      setError("Please enter a valid age."); setSaving(false); return;
    }
    const parsedWeight = profileDataToSave.weight_kg;
    if (parsedWeight != null && (isNaN(parsedWeight) || parsedWeight <= 0)) {
      setError("Please enter a valid weight."); setSaving(false); return;
    }
    const parsedHeight = profileDataToSave.height_cm;
    if (parsedHeight != null && (isNaN(parsedHeight) || parsedHeight <= 0)) {
      setError("Please enter a valid height."); setSaving(false); return;
    }

    console.log("Saving profile data:", profileDataToSave);
    try {
      const { error: saveError } = await supabase
        .from('user_profiles').upsert(profileDataToSave, { onConflict: 'user_id' });
      if (saveError) throw saveError;
      console.log('Profile saved successfully.');
      setSuccessMessage('Profile updated successfully!');
    } catch (err: unknown) {
      console.error('Error saving profile:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // == Mobile Menu Logic from User UI ==
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Type assertion needed for closest
      const target = event.target as Element;
      if (menuOpen && !target.closest('.sidebar') && !target.closest('.menu-button')) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // == Render Loading / Auth Check (from Skeleton) ==
  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center"><p>Loading profile...</p></div>;
  }
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center"><p>Please log in to view your profile.</p></div>;
  }

  // == Render Merged UI ==
  return (
    <div className="flex h-screen bg-gray-50 relative overflow-hidden">
      {/* Mobile/Slide-in Sidebar (REMOVED md:hidden) */}
      <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">NutriPal</h2>
            <button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
         </div>
         {/* Use Link component and correct active state */}
         <nav className="flex-1 p-4 space-y-1">
           <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 font-medium">Dashboard</Link>
           <Link href="/profile" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Profile</Link>
           <Link href="/analytics" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Analytics</Link>
           <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
           <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
           <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link>
         </nav>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Hamburger (REMOVED md:hidden) */}
        <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0"> {/* Use border-b */} 
           <div className="flex items-center justify-between">
            <button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-800">Profile</h2>
            <div className="w-8"></div> { /* Balance */}
          </div>
        </header>

        {/* Content scroll area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
            {/* Form Card (from User UI) */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
               {/* Profile form (onSubmit from Skeleton, structure from User UI) */}
              <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
                 <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Profile</h1> {/* Moved title inside */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Age Input (value/onChange from Skeleton state, styling from User UI) */}
                  <div>
                    <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                    <input type="number" id="age" name="age" value={age} onChange={handleChange} placeholder="Years"
                           className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving} />
                  </div>
                  {/* Sex Select (value/onChange from Skeleton state, styling from User UI) */}
                  <div>
                    <label htmlFor="sex" className="block text-sm font-medium text-gray-700 mb-1">Biological Sex</label>
                    <select id="sex" name="sex" value={sex} onChange={handleChange}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {/* Weight Input (value/onChange from Skeleton state, styling from User UI) */}
                  <div>
                     <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                     <div className="flex">
                      <input type="number" id="weight" name="weight" value={weight} onChange={handleChange} placeholder="Weight" step="0.1"
                             className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving} />
                      <span className="inline-flex items-center px-3 py-2 text-gray-500 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md">kg</span>
                     </div>
                  </div>
                  {/* Height Input (value/onChange from Skeleton state, styling from User UI) */}
                  <div>
                     <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-1">Height</label>
                     <div className="flex">
                      <input type="number" id="height" name="height" value={height} onChange={handleChange} placeholder="Height"
                             className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving} />
                      <span className="inline-flex items-center px-3 py-2 text-gray-500 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md">cm</span>
                     </div>
                  </div>
                   {/* Activity Level Select (value/onChange from Skeleton state, styling from User UI, OPTIONS ADJUSTED) */}
                  <div>
                     <label htmlFor="activityLevel" className="block text-sm font-medium text-gray-700 mb-1">Activity Level</label>
                     <select id="activityLevel" name="activityLevel" value={activityLevel} onChange={handleChange}
                             className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving}>
                      <option value="">Select</option>
                      <option value="sedentary">Sedentary (little to no exercise)</option>
                      <option value="lightly_active">Lightly active (light exercise 1-3 days/wk)</option>
                      <option value="moderately_active">Moderately active (moderate exercise 3-5 days/wk)</option>
                      <option value="very_active">Active (hard exercise 6-7 days/wk)</option>
                      <option value="extra_active">Very active (very hard exercise & physical job)</option>
                     </select>
                  </div>
                  {/* Health Goal Select (value/onChange from Skeleton state, styling from User UI, OPTIONS ADJUSTED) */}
                  <div>
                     <label htmlFor="healthGoal" className="block text-sm font-medium text-gray-700 mb-1">Health Goal</label>
                     <select id="healthGoal" name="healthGoal" value={healthGoal} onChange={handleChange}
                             className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900" disabled={saving}>
                      <option value="">Select</option>
                      <option value="weight_loss">Lose weight</option>
                      <option value="maintenance">Maintain weight</option>
                      <option value="weight_gain">Gain weight</option>
                      { /* TODO: Add mapping if necessary for 'buildMuscle', 'improveHealth' to Supabase values */}
                      {/* <option value="buildMuscle">Build muscle</option> */}
                      {/* <option value="improveHealth">Improve overall health</option> */}
                     </select>
                  </div>
                </div>

                 {/* Error Message (from Skeleton) */}
                {error && (
                  <div className="mt-4 rounded border border-red-400 bg-red-100 p-3 text-center text-sm text-red-700">{error}</div>
                )}
                 {/* Success Message (from Skeleton) */}
                {successMessage && (
                  <div className="mt-4 rounded border border-green-400 bg-green-100 p-3 text-center text-sm text-green-700">{successMessage}</div>
                )}

                {/* Save Button Area (from User UI) */}
                <div className="pt-6 border-t border-gray-200">
                  <button type="submit" disabled={saving}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>

              {/* BMI Calculator Section (from User UI) */}
              <div className="bg-gray-50 p-6 border-t border-gray-200">
                 <h3 className="text-lg font-medium text-gray-900 mb-4">BMI Overview</h3>
                 {bmi ? (
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    {/* BMI Display */} 
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-center w-full md:w-auto">
                      <div className="text-sm text-gray-500 mb-1">Your BMI</div>
                      <div className="text-3xl font-bold text-gray-900">{bmi}</div>
                      <div className={`text-sm font-medium mt-1 ${
                        bmiCategory === 'Normal weight' ? 'text-green-600' : 
                        bmiCategory === 'Underweight' ? 'text-yellow-600' : 
                        'text-red-600'
                      }`}>{bmiCategory}</div>
                    </div>
                    {/* BMI Bar/Text */}
                    <div className="flex-1">
                       <div className="h-8 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                              width: `${Math.min(100, Math.max(0, parseFloat(bmi) * 3))}%`, // Adjusted width calculation slightly
                              background: 'linear-gradient(to right, #fde047, #86efac, #f97316, #ef4444)', // Adjusted gradient colors
                          }}/>
                       </div>
                       <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
                       </div>
                       <p className="text-sm text-gray-600 mt-4">
                          BMI is a measurement of a person's leanness or corpulence based on height and weight. It is used to estimate tissue mass and is widely used as a general indicator of healthy body weight.
                       </p>
                    </div>
                  </div>
                 ) : (
                   <div className="text-center py-6 text-gray-500">Enter your height and weight to calculate your BMI</div>
                 )}
              </div>

              {bmi && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                        <p><strong>Estimated BMI:</strong> {bmi} ({bmiCategory})</p>
                        <p className="text-xs text-gray-600 mt-1">Note: BMI is an estimate and doesn&apos;t account for muscle mass.</p>
                    </div>
                )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 