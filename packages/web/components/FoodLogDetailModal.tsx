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
  id: string; // Updated to string for UUID
  log_time: string; // Updated from timestamp
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
  [key: string]: unknown;
}

// Update props to include userGoals and onDelete
interface FoodLogDetailModalProps {
  logData: FoodLog | null;
  onClose: () => void;
  userGoals: UserGoal[];
  onDelete: (logId: string) => Promise<void>; // Updated to string for UUID
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

  // --- Updated Logic: Group nutrients into Core, Tracked, and Others --- 
  const coreMacroKeys = ['calories', 'protein_g', 'carbs_g', 'fat_total_g'];
  const trackedKeys = userGoals.map(g => g.nutrient).filter(k => !coreMacroKeys.includes(k));

  const allNutrientKeys = Object.keys(NUTRIENT_MAP);
  const otherKeys = allNutrientKeys.filter(k => !coreMacroKeys.includes(k) && !trackedKeys.includes(k));

  const getNutrientDetail = (key: string) => {
    const value = logData[key];
    const mapping = NUTRIENT_MAP[key];
    if (mapping && value !== null && value !== undefined && typeof value === 'number' && value > 0) {
      return { key, name: mapping.name, value, unit: mapping.unit };
    }
    return null;
  };

  const coreDetails = coreMacroKeys.map(getNutrientDetail).filter(Boolean) as any[];
  const trackedDetails = trackedKeys.map(getNutrientDetail).filter(Boolean) as any[];
  const otherDetails = otherKeys.map(getNutrientDetail).filter(Boolean) as any[];

  const [showAll, setShowAll] = useState(false);
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

    if (!window.confirm(`Are you sure you want to delete the log entry for "${logData.food_name || 'this item'}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(logData.id);
    } catch (error) {
      console.error("Error during delete callback:", error);
      alert("Failed to delete log item. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
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
        <div className="p-4 overflow-y-auto flex-1">
          {/* Core Macros */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Core Nutrition</h4>
            <div className="grid grid-cols-2 gap-3">
              {coreDetails.map(n => (
                <div key={n.key} className="bg-blue-50 p-2 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-600 font-bold uppercase">{n.name}</p>
                  <p className="text-sm font-black text-gray-800">{formatValue(n.value, n.unit)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tracked Nutrients */}
          {trackedDetails.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tracked Goals</h4>
              <ul className="space-y-1">
                {trackedDetails.map(n => (
                  <li key={n.key} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-600">{n.name}:</span>
                    <span className="text-gray-800 font-bold">{formatValue(n.value, n.unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Expandable Section for Others */}
          {otherDetails.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAll(!showAll)}
                className="flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                aria-expanded={showAll}
              >
                <span>{showAll ? 'Hide Additional Nutrients' : `Show ${otherDetails.length} Additional Nutrients`}</span>
                <svg
                  className={`ml-1 h-3 w-3 transform transition-transform ${showAll ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAll && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pb-4">
                  {otherDetails.map(n => (
                    <div key={n.key} className="flex flex-col border-b border-gray-50 pb-1">
                      <span className="text-[10px] text-gray-500 uppercase font-medium">{n.name}</span>
                      <span className="text-xs font-semibold text-gray-700">{formatValue(n.value, n.unit)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {coreDetails.length === 0 && trackedDetails.length === 0 && otherDetails.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No nutritional information available.</p>
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