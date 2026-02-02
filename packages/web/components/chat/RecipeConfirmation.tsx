import React from 'react';

interface Ingredient {
    name: string;
    amount: string;
    unit: string;
    calories?: number;
}

interface RecipeData {
    recipe_name: string;
    servings: number;
    ingredients: Ingredient[];
    nutrition_data?: {
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_total_g: number;
    };
}

interface RecipeConfirmationProps {
    recipe: RecipeData;
    preview?: string;
    onConfirm: () => void;
    onDecline: () => void;
}

export const RecipeConfirmation: React.FC<RecipeConfirmationProps> = ({
    recipe,
    preview,
    onConfirm,
    onDecline
}) => {
    const nutrition = recipe.nutrition_data;

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-2">
            <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100 flex justify-between items-center">
                <span className="font-semibold text-emerald-900 text-sm">Save Recipe</span>
                <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">New Recipe</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Header */}
                <div>
                    <h3 className="text-lg font-bold text-gray-900">{recipe.recipe_name}</h3>
                    <p className="text-xs text-gray-500">{recipe.servings} Servings total</p>
                </div>

                {/* Nutrition Summary (Per Batch or Per Serving?) -> Backend usually returns total batch for save_recipe */}
                {nutrition && (
                    <div className="bg-gray-50 rounded p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estimated Nutrition (Total Batch)</p>
                        <div className="flex justify-between items-baseline">
                            <div className="text-xl font-bold text-gray-900">{Math.round(nutrition.calories)} <span className="text-xs font-normal text-gray-500">kcal</span></div>
                            <div className="flex gap-2 text-[10px] text-gray-600">
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.protein_g)}g</span> P</span>
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.carbs_g)}g</span> C</span>
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.fat_total_g)}g</span> F</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 italic">~{Math.round(nutrition.calories / recipe.servings)} kcal per serving</p>
                    </div>
                )}

                {/* Ingredient Preview */}
                <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ingredients</p>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                        {recipe.ingredients.map((ing, idx) => (
                            <div key={idx} className="flex justify-between text-xs border-b border-gray-50 pb-1 last:border-0">
                                <span className="text-gray-700">{ing.name}</span>
                                <span className="text-gray-500 italic">{ing.amount} {ing.unit}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {preview && (
                    <p className="text-xs text-gray-600 italic border-l-2 border-emerald-200 pl-2 py-1 bg-emerald-50/30">
                        {preview}
                    </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onDecline}
                        className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 px-3 bg-emerald-600 border border-transparent text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-sm transition-colors"
                    >
                        Save Recipe
                    </button>
                </div>
            </div>
        </div>
    );
};
