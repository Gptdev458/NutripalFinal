'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
// import { useUnitFormatter } from '@/utils/formatting'; // REMOVED
import { formatWeight, formatVolume, formatMilligram, formatMicrogram, formatEnergy } from '@/utils/formatting'; // Import needed formatters
// Import spinner if needed, e.g., from loading indicators component
// import { LoadingSpinner } from '@/components/LoadingIndicators';

// Define Loading Spinner locally (based on user example)
const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center py-2">
      <div className="relative w-6 h-6"> {/* Smaller spinner for modal */} 
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-blue-100 rounded-full"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    </div>
  );
};

// Interface for saved recipes (can expand later)
interface SavedRecipe {
  id: string;
  recipe_name: string;
  calories?: number | null; 
  description?: string | null;
  ingredients?: string | null; // For detailed view
  // Add other potential detailed fields: protein, carbs, fat etc.
  [key: string]: unknown; // Fix: Use unknown instead of any
}

// Interface for User Goals
interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
}

// == Saved Recipes Page Component ==
export default function SavedRecipesPage() {
  const { user, supabase } = useAuth();
  // Removed hook call
  // const { formatWeight, formatVolume } = useUnitFormatter();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // Initial page load
  const [refreshing, setRefreshing] = useState<boolean>(false); // Pull-to-refresh style loading
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // For mobile menu

  // Action/Modal States
  const [loggingRecipeId, setLoggingRecipeId] = useState<string | null>(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);
  const [isRecipeModalVisible, setIsRecipeModalVisible] = useState(false);
  const [selectedRecipeData, setSelectedRecipeData] = useState<SavedRecipe | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]); // Store user goals

  // Fetch recipes AND user goals
  const loadData = useCallback(async (isRefreshing = false) => {
    if (!user || !supabase) {
      setLoading(false);
      setRefreshing(false);
      return; 
    }

    if (!isRefreshing) setLoading(true); // Only show full page load spinner initially
    else setRefreshing(true); // Show refresh spinner
    setError(null);
    setModalError(null); // Clear modal error on refresh

    try {
      // Fetch recipes and goals concurrently
      const [recipeResponse, goalsResponse] = await Promise.all([
        supabase
          .from('user_recipes')
          .select('*') // Fetch all columns
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_goals')
          .select('nutrient, target_value, unit')
          .eq('user_id', user.id)
      ]);

      // Handle recipe response
      if (recipeResponse.error) throw recipeResponse.error;
      setRecipes(recipeResponse.data || []);

      // Handle goals response
      if (goalsResponse.error) {
           console.warn("Could not load user goals:", goalsResponse.error.message);
           setUserGoals([]); // Set empty if error
      } else {
           setUserGoals(goalsResponse.data || []);
      }

    } catch (err: unknown) {
      console.error("Error loading data:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "Failed to load data.");
      setRecipes([]); // Clear recipes on error
      setUserGoals([]); // Clear goals on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, supabase]);

  // Initial data load
  useEffect(() => {
    loadData();
  }, [loadData]); // Now depends on the memoized loadData function

  // == Action Handlers (Placeholders/Simulated for now) ==

  const handleRefresh = () => {
    if (loggingRecipeId || deletingRecipeId) return; // Don't refresh during other actions
    loadData(true); // Pass true to indicate refresh
  };

  const handleRecipeItemPress = (recipe: SavedRecipe) => {
    if (deletingRecipeId || loggingRecipeId) return;
    console.log("Opening modal for:", recipe.recipe_name);
    // Data is already fully loaded via loadData
    setSelectedRecipeData({ ...recipe }); 
    setIsRecipeModalVisible(true);
    setModalError(null);
    // No separate modal loading needed as data is pre-fetched, but restore setter call if used elsewhere
    // setIsModalLoading(true); // Restore if needed
    // setTimeout(() => { ... }, 500);
  };

  const handleCloseModal = () => {
    setIsRecipeModalVisible(false);
    setSelectedRecipeData(null);
    setModalError(null);
  };

  const handleLogRecipe = async (recipeId: string, recipeName: string) => {
    if (loggingRecipeId || deletingRecipeId) return;
    if (!supabase || !user) { 
        alert("Authentication error. Cannot log recipe."); 
        return;
    }

    console.log(`Attempting to log recipe via function: ${recipeName} (${recipeId})`);
    setLoggingRecipeId(recipeId);
    setModalError(null); 
    
    try {
      const { data: response, error: funcError } = await supabase.functions.invoke('chat-handler', {
        body: { 
          message: `Log my recipe: ${recipeName}`,
          // No session_id needed for direct log, but could add one if wanted
        }
      });

      if (funcError) throw funcError;

      if (response.status === 'success') {
        alert(`Successfully logged ${recipeName}!`);
        handleCloseModal();
      } else {
        throw new Error(response.message || 'Failed to log recipe');
      }

    } catch (err: unknown) {
      console.error("Failed to log recipe via function:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setModalError(`Failed to log recipe: ${errorMessage}`);
    } finally {
        setLoggingRecipeId(null);
    }
  };

  const handleDeleteRecipe = async (recipeId: string, recipeName: string) => {
    if (deletingRecipeId || loggingRecipeId) return;
    
    // Confirmation dialog
    if (!window.confirm(`Are you sure you want to delete the recipe "${recipeName}"? This cannot be undone.`)) {
      return;
    }
    console.log(`Attempting to delete recipe: ${recipeName} (${recipeId})`);
    setDeletingRecipeId(recipeId);
    setModalError(null); // Clear previous modal errors

    if (!supabase || !user) { 
        setModalError("Authentication error. Cannot delete recipe.");
        setDeletingRecipeId(null);
        return;
    }

    try {
        // --- Actual Deletion Logic ---
        const { error } = await supabase
            .from('user_recipes')
            .delete()
            .match({ id: recipeId, user_id: user.id }); // Match both ID and user_id for security

        if (error) {
            throw error; // Throw error to be caught below
        }
        // --- End Deletion Logic ---

        console.log("Recipe deleted successfully from DB.");
        // Remove recipe from local state
        setRecipes(prev => prev.filter(recipe => recipe.id !== recipeId));
        handleCloseModal(); // Close modal after successful deletion
        alert(`Recipe "${recipeName}" deleted.`); // Success feedback
    } catch (err: unknown) { 
         console.error("Failed to delete recipe:", err);
         const errorMessage = err instanceof Error ? err.message : String(err);
         setModalError(`Failed to delete recipe: ${errorMessage}`);
         // Don't close modal on error, let user see the message
    } finally {
        setDeletingRecipeId(null);
    }
  };

  // == Render Function for Modal (Implement Details) ==
  const renderRecipeModal = () => {
      if (!isRecipeModalVisible || !selectedRecipeData) return null;

      // --- Define formatting logic using imported functions --- 
      const formatValue = (value: number | null | undefined, unit: string): string => {
          if (value === null || value === undefined || isNaN(value)) return '-';
          switch (unit?.toLowerCase()) {
              case 'g': return formatWeight(value);
              case 'mg': return formatMilligram(value);
              case 'mcg':
              case 'μg': return formatMicrogram(value);
              case 'ml': return formatVolume(value);
              case 'kcal': return formatEnergy(value);
              default: return `${value.toFixed(0)} ${unit || ''}`;
          }
      };
      // --- End formatting logic ---

      // Helper to render nutrient rows
      const renderTrackedNutrient = (goal: UserGoal) => {
        const nutrientKey = goal.nutrient;
        const dataKey = nutrientKey.includes('_') ? nutrientKey : `${nutrientKey}_g`;
        const value = selectedRecipeData[dataKey];
        const unit = goal.unit || 'g';

        if (value !== null && value !== undefined && typeof value === 'number') {
          const displayValue = formatValue(value, unit);
          return (
            <div key={nutrientKey} className="flex justify-between py-1 text-sm">
              <span className="text-gray-700 capitalize">{nutrientKey.replace(/_/g, ' ').replace(/ g$| mg$| mcg$/i, '')}:</span>
              <span className="font-medium text-gray-900">{displayValue}</span>
            </div>
          );
        }
        return null;
      };
      
      // Determine which nutrients to display based on available data and goals
      const availableNutrients = Object.keys(selectedRecipeData).filter(key => 
          key !== 'id' && key !== 'user_id' && key !== 'created_at' && key !== 'recipe_name' && key !== 'description' && key !== 'ingredients' && 
          selectedRecipeData[key] !== null && typeof selectedRecipeData[key] === 'number'
      );
      
      const goalNutrientKeys = userGoals.map(g => g.nutrient.includes('_') ? g.nutrient : `${g.nutrient}_g`);

      // Display goal nutrients first, then others
      const nutrientsToShow = [
          ...userGoals.map(goal => renderTrackedNutrient(goal)).filter(Boolean),
          ...availableNutrients
              .filter(key => !goalNutrientKeys.includes(key)) // Filter out nutrients already shown via goals
              .map(key => {
                  const value = selectedRecipeData[key] as number;
                  let unit = 'g'; 
                  if (key.endsWith('_mg')) unit = 'mg';
                  else if (key.endsWith('_mcg') || key.endsWith('_μg')) unit = 'mcg';
                  else if (key.endsWith('_ml')) unit = 'ml';
                  else if (key === 'calories') unit = 'kcal';
                  const displayValue = formatValue(value, unit);
                  return (
                      <div key={key} className="flex justify-between py-1 text-sm">
                          <span className="text-gray-700 capitalize">{key.replace(/_/g, ' ').replace(/ g$| mg$| mcg$/i, '')}:</span>
                          <span className="font-medium text-gray-900">{displayValue}</span>
                      </div>
                  );
              })
      ];

      return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                <h3 className="text-xl font-semibold text-gray-800">{selectedRecipeData.recipe_name}</h3>
                <button 
                  onClick={handleCloseModal} 
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                  aria-label="Close modal"
                >
                     {/* Simple X icon */}
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                     </svg>
                </button>
            </div>
            {/* Body */} 
            <div className="p-6 overflow-y-auto max-h-[60vh]">
                {/* Description */}
                {selectedRecipeData.description && (
                    <p className="text-sm text-gray-600 mb-4">{selectedRecipeData.description}</p>
                )}

                {/* Nutrient Details */}
                <h4 className="text-md font-semibold mb-2 text-gray-800 border-t pt-4">Nutrition Details:</h4>
                {nutrientsToShow.length > 0 ? (
                    <div className="space-y-1">
                        {nutrientsToShow}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 italic">No detailed nutrition data available.</p>
                )}
                
                {/* Ingredients */} 
                {selectedRecipeData.ingredients && (
                  <>
                    <h4 className="text-md font-semibold mt-4 mb-2 text-gray-800 border-t pt-4">Ingredients:</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedRecipeData.ingredients}</p>
                  </>
                )}

                {/* Modal Specific Error Display */} 
                {modalError && (
                  <p className="mt-4 text-sm text-red-600 bg-red-100 p-2 rounded">Error: {modalError}</p>
                )}
            </div>
             {/* Footer / Actions */} 
             <div className="border-t border-gray-200 p-4 flex justify-between items-center bg-gray-50 flex-shrink-0">
                 {/* Delete Button */} 
                 <button 
                   onClick={() => handleDeleteRecipe(selectedRecipeData.id, selectedRecipeData.recipe_name)}
                   disabled={!!loggingRecipeId || !!deletingRecipeId || isModalLoading}
                   className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${!!loggingRecipeId || !!deletingRecipeId || isModalLoading ? 'text-red-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                 >
                      {deletingRecipeId === selectedRecipeData.id ? (
                         <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                         </>
                      ) : 'Delete'}
                 </button>
                 <div className="flex space-x-2">
                     {/* Close Button */} 
                     <button 
                       onClick={handleCloseModal} 
                       className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-100"
                       disabled={!!loggingRecipeId || !!deletingRecipeId}
                     >
                       Close
                     </button>
                     {/* Log Button */} 
                     <button 
                       onClick={() => handleLogRecipe(selectedRecipeData.id, selectedRecipeData.recipe_name)}
                       disabled={!!loggingRecipeId || !!deletingRecipeId || isModalLoading}
                       className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${!!loggingRecipeId || !!deletingRecipeId || isModalLoading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                      >
                         {loggingRecipeId === selectedRecipeData.id ? (
                             <>
                                 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                 </svg>
                                 Logging...
                             </>
                         ) : (
                             <>
                                 {/* Optional Log icon */}
                                 {/* <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> */}
                                 Log Recipe
                             </>
                         )}
                     </button>
                 </div>
             </div>
        </div>
     </div>
  );
};

// Log the recipes state just before rendering
// console.log("Current recipes state:", recipes); // REMOVED Debug log

// == Render Component ==
return (
  <div className="flex h-screen bg-gray-50 relative overflow-hidden"> {/* Changed background */}
    {/* Sidebar navigation (Keep hamburger logic) */}
     <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
       {/* ... (Sidebar content remains the same - Ensure links are correct) ... */}
       <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">NutriPal</h2>
          <button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
       </div>
       <nav className="flex-1 p-4 space-y-1">
          <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Dashboard</Link>
          <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
          <Link href="/analytics" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Analytics</Link>
          <Link href="/recipes" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Saved Recipes</Link>
          <Link href="/chat" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Chat</Link>
          <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link>
       </nav>
     </div>

    {/* Main content area */} 
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with hamburger */}
      <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0">
         <div className="flex items-center justify-between">
          <button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {/* Keep title simple here */}
          <h2 className="text-xl font-semibold text-gray-800">Saved Recipes</h2> 
          <div className="w-8"></div> { /* Balance */}
        </div>
      </header>

      {/* Main content scrolling area */} 
      <main className="flex-1 overflow-y-auto">
         {/* REMOVED Page Header Section */}
         {/* 
         <div className="px-6 py-4 border-b border-gray-200 bg-white"> 
           <h1 className="text-2xl font-bold text-blue-600">Your Saved Recipes</h1>
           <p className="text-gray-600 mt-1">Quickly log your frequent meals or view details.</p>
         </div>
         */}

         {/* Error message */} 
         {error && (
           <div className="m-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-300">
             {error}
           </div>
         )}

         {/* Loading State */} 
         {loading && !refreshing ? (
              <div className="text-center py-20">
                  <p className="text-gray-500">Loading recipes...</p>
                  {/* <LoadingSpinner /> */}
              </div>
         ) : ( 
              <div className="p-4 md:p-6"> {/* Add padding around list */} 
                 {/* Refreshing indicator */} 
                 {refreshing && (
                   <div className="flex justify-center py-2 mb-4">
                     {/* <LoadingSpinner /> */} 
                     <p>Refreshing...</p>
                   </div>
                 )}

                 {/* Recipe list container */} 
                 {recipes.length > 0 ? (
                   <div className="max-w-3xl mx-auto space-y-3">
                      {recipes.map(recipe => (
                          <div 
                              key={recipe.id}
                              onClick={() => handleRecipeItemPress(recipe)}
                              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow duration-150 ease-in-out"
                          >
                              <div className="px-5 py-4 flex justify-between items-center gap-4">
                              <div className="flex-1 min-w-0">
                                  {/* Restore truncate and remove debug span */}
                                  <h3 className="font-medium text-lg text-gray-900 truncate">{recipe.recipe_name}</h3>
                                  {/* Optional: show description snippet */} 
                                  {/* {recipe.description && <p className="text-sm text-gray-500 mt-1 truncate">{recipe.description}</p>} */}
                              </div>
                              <div className="flex items-center flex-shrink-0 ml-4">
                                  {/* Optional: Calories badge */}
                                  {recipe.calories !== null && recipe.calories !== undefined && (
                                    <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-3">
                                      {Math.round(recipe.calories)} kcal
                                    </span>
                                  )}
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                              </div>
                              </div>
                          </div>
                      ))}
                   </div>
                 ) : recipes.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                       <p className="text-gray-600 mb-4">You haven&apos;t saved any recipes yet.</p>
                       <Link href="/chat" className="text-blue-600 hover:underline">Start chatting to find and save recipes!</Link>
                   </div>
                ) : (
                   <div className="text-center py-10">
                      <p className="text-lg text-gray-500">You haven't saved any recipes yet.</p>
                      <p className="mt-2 text-gray-500">Recipes you save from the Chat will appear here.</p>
                  </div>
                 )}
                 
                 {/* Refresh Button */} 
                 {!loading && (
                   <div className="flex justify-center mt-6 mb-4">
                     <button 
                       onClick={handleRefresh}
                       disabled={refreshing || loading || !!loggingRecipeId || !!deletingRecipeId}
                       className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium ${refreshing || loading || loggingRecipeId || deletingRecipeId ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'text-gray-700 bg-white hover:bg-gray-50'}`}
                     >
                       {refreshing ? 'Refreshing...' : 'Refresh Recipes'}
                       </button>
                     </div>
                   )}
              </div>
         )}
      </main>
    </div>

    {/* Render the modal */}
    {renderRecipeModal()}
  </div>
); 
}
