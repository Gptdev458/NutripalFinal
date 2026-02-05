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
  id: string;
  log_time: string;
  food_name?: string | null;
  calories?: number | null;
  serving_size?: string | null;
  portion?: string | null;
  [key: string]: unknown;
}

// Update props to include userGoals and onDelete
interface FoodLogDetailModalProps {
  logData: FoodLog | null;
  onClose: () => void;
  userGoals: UserGoal[];
  onDelete?: (logId: any) => Promise<void>;
}

// Nutrient display names and units (still useful for lookup)
// Nutrient display names and units (synchronized with NutrientDisplay.tsx)
const NUTRIENT_MAP: Record<string, { name: string; unit: string }> = {
  // Macros
  protein_g: { name: "Protein", unit: "g" },
  fat_total_g: { name: "Total Fat", unit: "g" },
  carbs_g: { name: "Carbohydrates", unit: "g" },
  calories: { name: "Calories", unit: "kcal" },
  hydration_ml: { name: "Water", unit: "ml" },

  // Fats
  fat_saturated_g: { name: "Saturated Fat", unit: "g" },
  fat_poly_g: { name: "Polyunsaturated Fat", unit: "g" },
  fat_mono_g: { name: "Monounsaturated Fat", unit: "g" },
  fat_trans_g: { name: "Trans Fat", unit: "g" },
  omega_3_g: { name: "Omega-3", unit: "g" },
  omega_6_g: { name: "Omega-6", unit: "g" },
  omega_ratio: { name: "Omega 6:3 Ratio", unit: "" },

  // Fibers & Sugars
  fiber_g: { name: "Dietary Fiber", unit: "g" },
  fiber_soluble_g: { name: "Soluble Fiber", unit: "g" },
  sugar_g: { name: "Total Sugars", unit: "g" },
  sugar_added_g: { name: "Added Sugars", unit: "g" },

  // Minerals
  cholesterol_mg: { name: "Cholesterol", unit: "mg" },
  sodium_mg: { name: "Sodium", unit: "mg" },
  potassium_mg: { name: "Potassium", unit: "mg" },
  calcium_mg: { name: "Calcium", unit: "mg" },
  iron_mg: { name: "Iron", unit: "mg" },
  magnesium_mg: { name: "Magnesium", unit: "mg" },
  phosphorus_mg: { name: "Phosphorus", unit: "mg" },
  zinc_mg: { name: "Zinc", unit: "mg" },
  copper_mg: { name: "Copper", unit: "mg" },
  manganese_mg: { name: "Manganese", unit: "mg" },
  selenium_mcg: { name: "Selenium", unit: "mcg" },

  // Vitamins
  vitamin_a_mcg: { name: "Vitamin A", unit: "mcg" },
  vitamin_c_mg: { name: "Vitamin C", unit: "mg" },
  vitamin_d_mcg: { name: "Vitamin D", unit: "mcg" },
  vitamin_e_mg: { name: "Vitamin E", unit: "mg" },
  vitamin_k_mcg: { name: "Vitamin K", unit: "mcg" },
  thiamin_mg: { name: "Thiamin (B1)", unit: "mg" },
  riboflavin_mg: { name: "Riboflavin (B2)", unit: "mg" },
  niacin_mg: { name: "Niacin (B3)", unit: "mg" },
  pantothenic_acid_mg: { name: "Pantothenic Acid (B5)", unit: "mg" },
  vitamin_b6_mg: { name: "Vitamin B6", unit: "mg" },
  biotin_mcg: { name: "Biotin (B7)", unit: "mcg" },
  folate_mcg: { name: "Folate (B9)", unit: "mcg" },
  vitamin_b12_mcg: { name: "Vitamin B12", unit: "mcg" },
};

const FoodLogDetailModal: React.FC<FoodLogDetailModalProps> = ({ logData, onClose, userGoals, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  // Removed the hook call
  // const { formatWeight, formatVolume } = useUnitFormatter();

  if (!logData) return null;

  // --- Updated Logic: Only show nutrients that are in userGoals, in their exact order ---
  const getNutrientDetail = (goal: UserGoal) => {
    const key = goal.nutrient;
    // Special case for calories since it's usually in the header but included in goals
    if (key === 'calories') return null;

    // Check both root and extras
    const value = logData[key] !== undefined ? logData[key] : (logData.extras as any)?.[key];
    const mapping = NUTRIENT_MAP[key];

    if (mapping && typeof value === 'number') {
      return { key, name: mapping.name, value, unit: mapping.unit || goal.unit };
    }
    return null;
  };

  const trackedDetails = userGoals
    .filter(goal => goal.nutrient !== 'calories')
    .map(goal => {
      const key = goal.nutrient;
      const value = logData[key] !== undefined ? logData[key] : (logData.extras as any)?.[key];
      const mapping = NUTRIENT_MAP[key];

      return {
        key,
        name: mapping?.name || key.replace(/_/g, ' '),
        value: typeof value === 'number' ? value : 0,
        unit: mapping?.unit || goal.unit
      };
    });

  // --- Define formatting logic using imported functions --- 
  const formatValue = (value: number, unit: string): string => {
    if (isNaN(value) || value === null || value === undefined) return '0g';
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
        return `${value.toFixed(0)}${unit || ''}`;
    }
  };
  // --- End formatting logic ---

  const handleDeleteClick = async () => {
    if (!logData || isDeleting) return;
    if (!onDelete) {
      console.warn("onDelete callback is not provided.");
      return;
    }

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-center items-center p-4 transition-all animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Modal Header - Side by Side Name | Kcal */}
        <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex justify-between items-center">
          <span className="font-bold text-blue-900 text-[10px] uppercase tracking-wider">Log Details</span>
          <button
            onClick={onClose}
            className="text-blue-400 hover:text-blue-600 p-1 rounded-full transition-colors"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-xl font-bold text-gray-900 leading-tight">
              {logData.food_name || 'Food Item'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              {logData.portion || '1 serving'}
              {logData.serving_size ? ` (${logData.serving_size} per portion)` : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-blue-600 whitespace-nowrap tracking-tight">
              {formatEnergy(logData.calories || 0)}
            </div>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="px-5 pb-5 overflow-y-auto flex-1">
          {/* Vertical List of Tracked Nutrients */}
          <div className="border-t border-gray-50 pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tracked Goals</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 border border-gray-100">
              {trackedDetails.length > 0 ? (
                trackedDetails.map((n, i) => (
                  <div key={n.key} className="flex justify-between items-center">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-tight">{n.name}</span>
                    <span className="text-xs font-black text-gray-800">{formatValue(n.value, n.unit)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-2 italic font-medium">No goals tracked for this period.</p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer - Added Delete Button */}
        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm active:scale-[0.98]"
          >
            {isDeleting ? 'Deleting...' : 'Delete Log'}
          </button>

          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black transition-all shadow-sm active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FoodLogDetailModal; 