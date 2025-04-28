'use client';

import React, { useState } from 'react';
// Removed non-existent hook import
// import { useUnitFormatter } from '@/utils/formatting';
// Import specific formatters directly
import { formatWeight, formatVolume, formatMilligram, formatMicrogram, formatEnergy } from '@/utils/formatting';

// Interface for goals passed as props
interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string; // Optional: include if needed for display
}

// FoodLog interface (ensure it includes potential keys)
interface FoodLog {
    id: number;
    timestamp: string;
    food_name?: string | null;
    calories?: number | null;
    protein_g?: number | null;
    fat_total_g?: number | null;
    carbs_g?: number | null;
    sugar_g?: number | null;
    fiber_g?: number | null;
    sodium_mg?: number | null;
    water_g?: number | null;
    cholesterol_mg?: number | null;
    potassium_mg?: number | null;
    // ... other potential keys ...
    [key: string]: unknown;
}

// Update props to include userGoals and onDelete
interface FoodLogDetailModalProps {
  logData: FoodLog | null;
  onClose: () => void;
  userGoals: UserGoal[]; // Accept the user goals
  onDelete: (logId: number) => Promise<void>; // Function to call when delete is clicked
}

// Nutrient display names and units (still useful for lookup)
const NUTRIENT_MAP: Record<string, { name: string; unit: string }> = {
  calories: { name: "Calories", unit: "kcal" },
  water_g: { name: "Water", unit: "g" },
  protein_g: { name: "Protein", unit: "g" },
  fat_total_g: { name: "Total Fat", unit: "g" },
  carbs_g: { name: "Carbohydrates", unit: "g" },
  fat_saturated_g: { name: "Saturated Fat", unit: "g" },
  fiber_g: { name: "Total Fiber", unit: "g" },
  fiber_soluble_g: { name: "Soluble Fiber", unit: "g" },
  sugar_g: { name: "Sugars", unit: "g" },
  cholesterol_mg: { name: "Cholesterol", unit: "mg" },
  sodium_mg: { name: "Sodium", unit: "mg" },
  potassium_mg: { name: "Potassium", unit: "mg" },
  omega_3_g: { name: "Omega-3", unit: "g" },
  omega_6_g: { name: "Omega-6", unit: "g" },
  // ... ensure this map covers all possible goal nutrient keys ...
};

const FoodLogDetailModal: React.FC<FoodLogDetailModalProps> = ({ logData, onClose, userGoals, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  // Removed the hook call
  // const { formatWeight, formatVolume } = useUnitFormatter();

  if (!logData) return null;

  // --- Updated Logic: Filter based on userGoals --- 
  const trackedNutrientDetails = userGoals
    .map(goal => {
      const nutrientKey = goal.nutrient; // Key from the user's goal
      const value = logData[nutrientKey];
      const mapping = NUTRIENT_MAP[nutrientKey];

      if (mapping && value !== null && value !== undefined && typeof value === 'number') {
        return {
          key: nutrientKey,
          name: mapping.name,
          value: value,
          unit: mapping.unit
        };
      }
      return null;
    })
    .filter(item => item !== null) as { key: string; name: string; value: number; unit: string }[];
    
  // Optionally add Calories if it exists in logData but wasn't a specific goal
  const calorieInfo = NUTRIENT_MAP['calories'];
  const hasCaloriesData = logData.calories !== null && logData.calories !== undefined && typeof logData.calories === 'number';
  const caloriesAlreadyTracked = trackedNutrientDetails.some(n => n.key === 'calories');

  if (hasCaloriesData && !caloriesAlreadyTracked) {
      trackedNutrientDetails.unshift({
          key: 'calories',
          name: calorieInfo.name,
          value: logData.calories as number,
          unit: calorieInfo.unit
      });
  }
  // --- End Updated Logic ---

  // --- Define formatting logic using imported functions --- 
  const formatValue = (value: number, unit: string): string => {
    if (isNaN(value) || value === null || value === undefined) return '-';
    switch (unit?.toLowerCase()) {
        case 'g':
            return formatWeight(value);
        case 'mg':
            return formatMilligram(value);
        case 'mcg':
        case 'μg':
            return formatMicrogram(value);
        case 'ml':
            return formatVolume(value);
        case 'kcal':
            return formatEnergy(value);
        default:
            return `${value.toFixed(0)} ${unit || ''}`;
    }
  };
  // --- End formatting logic ---

  const handleDeleteClick = async () => {
    if (!logData || isDeleting) return;

    // Optional: Add a confirmation step
    if (!window.confirm(`Are you sure you want to delete the log entry for "${logData.food_name || 'this item'}"?`)) {
        return;
    }

    setIsDeleting(true);
    try {
      await onDelete(logData.id);
      // No need to call onClose here, the parent component will handle it after successful deletion.
    } catch (error) {
      // Error handling might be done in the parent, or show a message here
      console.error("Error during delete callback:", error);
      alert("Failed to delete log item. Please try again."); // Simple feedback
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    // Basic Modal Structure (using fixed position overlay)
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 truncate"> 
            {logData.food_name || 'Log Details'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-4 overflow-y-auto">
          {trackedNutrientDetails.length > 0 ? (
            <ul className="space-y-1">
              {trackedNutrientDetails.map(nutrient => (
                <li key={nutrient.key} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                  <span className="text-gray-600">{nutrient.name}:</span>
                  <span className="text-gray-800 font-medium">
                    {formatValue(nutrient.value, nutrient.unit)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No tracked nutrient information available for this item.</p>
          )}
        </div>

        {/* Modal Footer - Added Delete Button */}
        <div className="p-4 border-t border-gray-200 flex justify-between items-center">
           {/* Delete Button (Left Aligned) */}
           <button
             onClick={handleDeleteClick}
             disabled={isDeleting}
             className={`px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed`}
           >
             {isDeleting ? 'Deleting...' : 'Delete Log'}
           </button>
           
           {/* Close Button (Right Aligned) */}
           <button
             onClick={onClose}
             disabled={isDeleting} // Disable close while deleting
             className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
           >
             Close
           </button>
        </div>
      </div>
    </div>
  );
};

export default FoodLogDetailModal; 