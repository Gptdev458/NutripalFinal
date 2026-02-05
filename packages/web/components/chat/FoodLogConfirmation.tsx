import React, { useState } from 'react';
import { NutrientDisplay, UserGoal, NUTRIENT_MAP } from './NutrientDisplay';

interface FoodItem {
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_total_g: number;
    serving_size?: string;
    [key: string]: any;
}

interface FoodLogConfirmationProps {
    nutrition: FoodItem[];
    userGoals?: UserGoal[];
    onConfirm: () => void;
    onDecline: () => void;
    onEdit?: (items: FoodItem[]) => void; // Placeholder for future explicit edit UI
    title?: string;
    confirmLabel?: string;
}

export const FoodLogConfirmation: React.FC<FoodLogConfirmationProps> = ({
    nutrition,
    userGoals = [],
    onConfirm,
    onDecline,
    onEdit,
    title = 'Verify log',
    confirmLabel = 'Log Food'
}) => {
    const [showDetails, setShowDetails] = useState(false);

    const totalCalories = nutrition.reduce((sum, item) => sum + (item.calories || 0), 0);
    const mainItem = nutrition[0];
    const itemName = nutrition.length > 1 ? `${mainItem?.food_name} + ${nutrition.length - 1} more` : (mainItem?.food_name || 'Food Item');

    // Calculate totals for tracked nutrients in order
    const aggregated = nutrition.reduce((acc, item) => {
        Object.keys(item).forEach(key => {
            if (typeof item[key] === 'number') {
                acc[key] = (acc[key] || 0) + item[key];
            }
        });
        return acc;
    }, {} as any);

    const trackedDetails = userGoals
        .filter(goal => goal.nutrient !== 'calories')
        .map(goal => {
            const val = aggregated[goal.nutrient];
            // Show all tracked nutrients, default to 0 if not present
            return {
                name: NUTRIENT_MAP[goal.nutrient]?.name || goal.nutrient.replace(/_/g, ' '),
                value: typeof val === 'number' ? val : 0,
                unit: NUTRIENT_MAP[goal.nutrient]?.unit || goal.unit
            };
        });

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-2">
            <div className="bg-blue-50 px-4 py-1.5 border-b border-blue-100">
                <span className="font-bold text-blue-900 text-xs uppercase tracking-tight">{title}</span>
            </div>

            <div className="p-4 space-y-3">
                {/* Header Row: Name | Calories */}
                <div className="flex justify-between items-baseline">
                    <h3 className="text-lg font-bold text-gray-900 truncate pr-2">{itemName}</h3>
                    <span className="text-lg font-black text-blue-600 whitespace-nowrap">{Math.round(totalCalories)} kcal</span>
                </div>

                {/* Sub-header: Portion details */}
                <div className="text-sm text-gray-500 -mt-1">
                    {mainItem?.serving_size || '1 serving'}
                </div>

                {/* Collapsible Details */}
                {trackedDetails.length > 0 && (
                    <div className="border-t border-gray-50 pt-2">
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex items-center text-xs font-bold text-gray-400 hover:text-blue-500 transition-colors"
                        >
                            <span>Details</span>
                            <svg className={`ml-1 h-3 w-3 transform transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showDetails && (
                            <div className="mt-2 space-y-1 bg-gray-50 p-2 rounded border border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                                {trackedDetails.map((n: any, idx) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                        <span className="text-gray-500 uppercase font-medium">{n.name}:</span>
                                        <span className="font-bold text-gray-700">{Math.round(n.value * 10) / 10}{n.unit}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onDecline}
                        className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 px-3 bg-blue-600 border border-transparent text-white rounded-md text-sm font-bold hover:bg-blue-700 shadow-sm transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
