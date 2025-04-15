'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

// Nutrient Definitions (copied from mobile/src/constants/nutrients.js)
const MASTER_NUTRIENT_LIST = [
  // General
  { key: "calories", name: "Calories", unit: "kcal" },
  { key: "water_g", name: "Water", unit: "g" },
  // Macronutrients
  { key: "protein_g", name: "Protein", unit: "g" },
  { key: "fat_total_g", name: "Total Fat", unit: "g" },
  { key: "carbs_g", name: "Carbohydrates", unit: "g" },
  // Fat Subtypes
  { key: "fat_saturated_g", name: "Saturated Fat", unit: "g" },
  { key: "fat_polyunsaturated_g", name: "Polyunsaturated Fat", unit: "g" },
  { key: "fat_monounsaturated_g", name: "Monounsaturated Fat", unit: "g" },
  { key: "fat_trans_g", name: "Trans Fat", unit: "g" },
  // Carb Subtypes
  { key: "fiber_g", name: "Dietary Fiber", unit: "g" },
  { key: "sugar_g", name: "Total Sugars", unit: "g" },
  { key: "sugar_added_g", name: "Added Sugars", unit: "g" },
  // Sterols
  { key: "cholesterol_mg", name: "Cholesterol", unit: "mg" },
  // Minerals
  { key: "sodium_mg", name: "Sodium", unit: "mg" },
  { key: "potassium_mg", name: "Potassium", unit: "mg" },
  { key: "calcium_mg", name: "Calcium", unit: "mg" },
  { key: "iron_mg", name: "Iron", unit: "mg" },
  { key: "magnesium_mg", name: "Magnesium", unit: "mg" },
  { key: "phosphorus_mg", name: "Phosphorus", unit: "mg" },
  { key: "zinc_mg", name: "Zinc", unit: "mg" },
  { key: "copper_mg", name: "Copper", unit: "mg" },
  { key: "manganese_mg", name: "Manganese", unit: "mg" },
  { key: "selenium_mcg", name: "Selenium", unit: "mcg" },
  // Vitamins (Fat-Soluble)
  { key: "vitamin_a_mcg_rae", name: "Vitamin A", unit: "mcg RAE" },
  { key: "vitamin_d_mcg", name: "Vitamin D", unit: "mcg" },
  { key: "vitamin_e_mg", name: "Vitamin E", unit: "mg" },
  { key: "vitamin_k_mcg", name: "Vitamin K", unit: "mcg" },
  // Vitamins (Water-Soluble)
  { key: "vitamin_c_mg", name: "Vitamin C", unit: "mg" },
  { key: "thiamin_mg", name: "Thiamin (B1)", unit: "mg" },
  { key: "riboflavin_mg", name: "Riboflavin (B2)", unit: "mg" },
  { key: "niacin_mg", name: "Niacin (B3)", unit: "mg" },
  { key: "pantothenic_acid_mg", name: "Pantothenic Acid (B5)", unit: "mg" },
  { key: "vitamin_b6_mg", name: "Vitamin B6", unit: "mg" },
  { key: "biotin_mcg", name: "Biotin (B7)", unit: "mcg" },
  { key: "folate_mcg_dfe", name: "Folate (B9)", unit: "mcg DFE" },
  { key: "vitamin_b12_mcg", name: "Vitamin B12", unit: "mcg" },
];

interface TrackedGoalState {
    tracked: boolean;
    target: string; // Store target as string for input field
}

export default function GoalSettingsPage() {
  const { user, supabase, loading: authLoading } = useAuth(); 
  const [menuOpen, setMenuOpen] = useState(false);
  const [trackedGoals, setTrackedGoals] = useState<Record<string, TrackedGoalState>>({});
  const [loading, setLoading] = useState(true); // Loading goals state
  const [saving, setSaving] = useState(false); // Saving goals state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch initial goals
  const fetchGoals = useCallback(async () => {
    if (!user || !supabase) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_goals')
        .select('nutrient, target_value')
        .eq('user_id', user.id);
      
      if (fetchError) throw fetchError;

      // Initialize state based on MASTER_NUTRIENT_LIST and fetched data
      const initialGoalsState: Record<string, TrackedGoalState> = {};
      MASTER_NUTRIENT_LIST.forEach(nutrient => {
          const existingGoal = data?.find(goal => goal.nutrient === nutrient.key);
          initialGoalsState[nutrient.key] = {
              tracked: !!existingGoal,
              target: existingGoal?.target_value?.toString() || '',
          };
      });
      setTrackedGoals(initialGoalsState);

    } catch (err: any) {
      console.error("Error fetching goals:", err);
      setError(`Failed to load goals: ${err.message}`);
    } finally {
      setLoading(false);
    }

  }, [user, supabase]);

  // Fetch on mount or auth change
  useEffect(() => {
     if (!authLoading && user) {
        fetchGoals();
     } else if (!authLoading && !user) {
         setLoading(false); // Not loading if not logged in
     }
  }, [authLoading, user, fetchGoals]);

  // Menu close on outside click effect (Copied)
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

  // == Event Handlers ==
  const handleToggleTracked = (key: string) => {
    setError(null);
    setSuccessMessage(null);
    setTrackedGoals(prev => {
      const newState = { ...prev };
      const currentTracked = newState[key]?.tracked || false;
      newState[key] = {
        ...newState[key],
        tracked: !currentTracked,
        // Clear target when untracking
        target: !currentTracked ? (newState[key]?.target || '') : '', 
      };
      return newState;
    });
  };

  const handleTargetChange = (key: string, value: string) => {
    setError(null);
    setSuccessMessage(null);
    // Allow only numbers and potentially a single decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
         setTrackedGoals(prev => ({
            ...prev,
            [key]: {
                 ...(prev[key] || { tracked: true }), // Ensure tracked is true if target is set
                 target: value,
            },
         }));
    }
  };

  const handleSaveGoals = async () => {
    if (!user || !supabase) {
        setError("Cannot save goals: Not authenticated.");
        return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const goalsToSave = [];
    let validationError = null;

    // Filter and validate goals from state
    for (const nutrient of MASTER_NUTRIENT_LIST) {
      const key = nutrient.key;
      if (trackedGoals[key]?.tracked) {
        const targetStr = trackedGoals[key].target;
        if (targetStr === '' || targetStr === null || targetStr === undefined) {
            validationError = `Target value is required for tracked nutrient: ${nutrient.name}.`;
            break;
        }
        const targetValue = parseFloat(targetStr);
        if (isNaN(targetValue) || targetValue < 0) {
            validationError = `Invalid target value for ${nutrient.name}: must be a non-negative number.`;
            break;
        }
        goalsToSave.push({
            user_id: user.id,
            nutrient: key,
            target_value: targetValue,
            unit: nutrient.unit, // Add unit from master list
            // goal_type: 'goal' // Add type if needed later
        });
      }
    }

    if (validationError) {
        setError(validationError);
        setSaving(false);
        return;
    }

    console.log("Goals to save:", goalsToSave);

    try {
        // 1. Delete existing goals for the user
        console.log("Deleting existing goals for user:", user.id);
        const { error: deleteError } = await supabase
            .from('user_goals')
            .delete()
            .eq('user_id', user.id);

        if (deleteError) {
            console.error("Error deleting old goals:", deleteError);
            throw new Error(`Failed to clear previous goals: ${deleteError.message}`);
        }
        console.log("Existing goals deleted.");

        // 2. Insert new goals (if any)
        if (goalsToSave.length > 0) {
            console.log("Inserting new goals:", goalsToSave.length);
            const { error: insertError } = await supabase
                .from('user_goals')
                .insert(goalsToSave);

            if (insertError) {
                 console.error("Error inserting new goals:", insertError);
                throw new Error(`Failed to save new goals: ${insertError.message}`);
            }
            console.log("New goals inserted successfully.");
            setSuccessMessage("Nutrient goals saved successfully!");
        } else {
             console.log("No goals selected for tracking.");
             setSuccessMessage("Tracking cleared. No goals are currently selected.");
        }

    } catch (err: any) {
        console.error("Error saving goals:", err);
        setError(err.message || "An unexpected error occurred while saving.");
    } finally {
        setSaving(false);
    }
  };

  // Loading/Auth checks
  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading Goal Settings...</p>
        {/* Optional Spinner */}
      </div>
    );
  }

  if (!user) {
     return (
      <div className="flex h-screen items-center justify-center">
        <p>Please log in to set nutrient goals.</p>
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
         {/* Navigation Links - Settings Active */}
         <nav className="flex-1 p-4 space-y-1">
           <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Dashboard</Link>
           <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
           <Link href="#" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 opacity-50 cursor-not-allowed">Analytics</Link> {/* Placeholder */}
           <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
           <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
           <Link href="/settings" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Settings</Link> {/* Active Parent */}
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
            <h2 className="text-xl font-semibold text-gray-800">Nutrient Goals</h2>
            <div className="w-8"></div> { /* Balance */}
          </div>
        </header>

        {/* Goal Settings Content */} 
        <main className="flex-1 overflow-y-auto p-6">
           <h1 className="text-2xl font-semibold text-gray-900 mb-6">Set Your Nutrient Goals</h1>
           {/* TODO: Add goal setting form/controls */}
           <div className="max-w-2xl mx-auto">
             <p className="text-sm text-gray-600 mb-6">Select the nutrients you want to track and set your daily targets.</p>

             {/* Feedback Messages */}
             {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
                    {error}
                </div>
              )}
              {successMessage && (
                <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md border border-green-300">
                    {successMessage}
                </div>
              )}

            {/* Nutrient List */} 
            <div className="bg-white shadow rounded-md divide-y divide-gray-200">
                {MASTER_NUTRIENT_LIST.map((nutrient) => (
                   <div key={nutrient.key} className="px-4 py-3 sm:px-6 flex items-center justify-between">
                     {/* Nutrient Name & Checkbox */}
                     <div className="flex items-center">
                       <input
                         id={`track-${nutrient.key}`}
                         type="checkbox"
                         checked={trackedGoals[nutrient.key]?.tracked || false}
                         onChange={() => handleToggleTracked(nutrient.key)}
                         className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3"
                       />
                       <label htmlFor={`track-${nutrient.key}`} className="text-sm font-medium text-gray-800">
                         {nutrient.name}
                       </label>
                     </div>

                     {/* Target Input (Conditional) */}
                     {trackedGoals[nutrient.key]?.tracked && (
                       <div className="flex items-center ml-4">
                         <input 
                            type="number"
                            value={trackedGoals[nutrient.key]?.target || ''}
                            onChange={(e) => handleTargetChange(nutrient.key, e.target.value)}
                            placeholder="Target" 
                            aria-label={`Target for ${nutrient.name}`}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
                         />
                         <span className="ml-2 text-sm text-gray-500">{nutrient.unit}</span>
                       </div>
                     )}
                   </div>
                ))}
            </div>

            {/* Save Button */} 
            <div className="mt-6 text-right">
                <button
                    type="button"
                    onClick={handleSaveGoals}
                    disabled={saving || loading}
                    className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${saving || loading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                     {saving ? (
                         <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                     ) : null}
                    {saving ? 'Saving...' : 'Save Goals'}
                </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 