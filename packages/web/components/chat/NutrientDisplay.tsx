import React, { useState } from 'react';

export interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

export const NUTRIENT_MAP: Record<string, { name: string; unit: string }> = {
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

export interface NutrientDisplayProps {
    nutrition: any[];
    userGoals?: UserGoal[];
    variant?: 'chat' | 'dashboard' | 'compact';
}

export const NutrientDisplay: React.FC<NutrientDisplayProps> = ({
    nutrition,
    userGoals = [],
    variant = 'chat'
}) => {
    const [showAll, setShowAll] = useState(false);

    if (!nutrition || nutrition.length === 0) return null;

    const coreKeys = ['protein_g', 'carbs_g', 'fat_total_g'];
    const trackedKeys = userGoals
        .map(g => g.nutrient)
        .filter(k => k !== 'calories' && NUTRIENT_MAP[k]);

    return (
        <div className="space-y-2">
            {nutrition.map((item, i) => {
                const allKeys = Object.keys(item);
                const otherKeys = allKeys.filter(k =>
                    NUTRIENT_MAP[k] &&
                    !coreKeys.includes(k) &&
                    !trackedKeys.includes(k) &&
                    k !== 'calories' &&
                    typeof item[k] === 'number' &&
                    item[k] > 0
                );

                const hasNutrientsToShow = coreKeys.some(k => typeof item[k] === 'number') ||
                    trackedKeys.some(k => typeof (item[k] !== undefined ? item[k] : (item.extras as any)?.[k]) === 'number');

                return (
                    <div key={i} className={`${variant === 'dashboard' ? '' : 'pb-2 mb-2 border-b border-gray-100 last:border-0 last:pb-0 last:mb-0'}`}>
                        {variant !== 'dashboard' && item.food_name && (
                            <div className="flex justify-between text-sm mb-1">
                                <span className="font-bold text-gray-800 truncate pr-2">{item.food_name}</span>
                                <span className="text-blue-600 font-black whitespace-nowrap">{Math.round(item.calories)} kcal</span>
                            </div>
                        )}

                        {/* Essential Macros + Tracked Goals */}
                        <div className={`flex flex-wrap gap-x-3 gap-y-1 ${variant === 'dashboard' ? 'text-[11px]' : 'text-[11px]'}`}>
                            {variant === 'dashboard' && typeof item.calories === 'number' && (
                                <span className="font-bold text-blue-600">{Math.round(item.calories)} kcal</span>
                            )}

                            {coreKeys.map(k => typeof item[k] === 'number' && (
                                <span key={k} className="text-gray-700">
                                    <span className="font-bold text-blue-700">{NUTRIENT_MAP[k]?.name || k}:</span> {Math.round(item[k] * 10) / 10}{NUTRIENT_MAP[k]?.unit || ''}
                                </span>
                            ))}

                            {trackedKeys.map(k => {
                                const val = item[k] !== undefined ? item[k] : (item.extras as any)?.[k];
                                if (typeof val === 'number' && val > 0) {
                                    return (
                                        <span key={k} className="text-gray-700">
                                            <span className="font-bold text-emerald-700">{NUTRIENT_MAP[k]?.name || k}:</span> {Math.round(val * 10) / 10}{NUTRIENT_MAP[k]?.unit || ''}
                                        </span>
                                    );
                                }
                                return null;
                            })}
                        </div>

                        {/* Collapsable Menu for other nutrients */}
                        {otherKeys.length > 0 && (
                            <div className="mt-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAll(!showAll);
                                    }}
                                    className="text-[10px] font-bold text-gray-400 hover:text-blue-500 flex items-center transition-colors focus:outline-none"
                                >
                                    {showAll ? 'Collapse' : `+ ${otherKeys.length} more nutrients`}
                                    <svg className={`ml-0.5 h-2.5 w-2.5 transform transition-transform ${showAll ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showAll && (
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1 bg-gray-50 p-1.5 rounded border border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {otherKeys.map(k => (
                                            <div key={k} className="text-[10px] flex justify-between">
                                                <span className="text-gray-500 uppercase">{NUTRIENT_MAP[k]?.name || k}:</span>
                                                <span className="font-medium text-gray-700">{Math.round(item[k] * 10) / 10}{NUTRIENT_MAP[k]?.unit || ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
