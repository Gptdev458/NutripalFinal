import React from 'react';

interface RecipeLogConfirmationProps {
    recipe: {
        recipe_name: string;
        servings: number;
        nutrition_data?: {
            calories?: number;
            protein_g?: number;
            carbs_g?: number;
            fat_total_g?: number;
        };
        instructions?: string;
    };
    preview?: {
        ingredients: {
            name: string;
            quantity: number;
            unit: string;
            nutrition?: {
                calories?: number;
            };
        }[];
    }
    onConfirm: () => void;
    onDecline: () => void;
}

export const RecipeConfirmation: React.FC<RecipeLogConfirmationProps> = ({
    recipe,
    preview,
    onConfirm,
    onDecline
}) => {
    const batchCalories = recipe.nutrition_data?.calories || 0;
    const servings = recipe.servings || 1;
    const perServingCalories = Math.round(batchCalories / servings);

    // Calculate per-serving macros
    const perServingProtein = Math.round((recipe.nutrition_data?.protein_g || 0) / servings);
    const perServingCarbs = Math.round((recipe.nutrition_data?.carbs_g || 0) / servings);
    const perServingFat = Math.round((recipe.nutrition_data?.fat_total_g || 0) / servings);

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-2">
            <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100 flex justify-between items-center">
                <span className="font-semibold text-emerald-900 text-sm">Save Recipe</span>
                <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">New</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Header */}
                <div>
                    <h3 className="font-bold text-gray-900">{recipe.recipe_name}</h3>
                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                        <span>{servings} Serving{servings !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>~{batchCalories} kcal total</span>
                    </div>
                </div>

                {/* Per-Serving Nutrition Highlight */}
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <div className="text-xs text-emerald-700 mb-2 font-medium">Per Serving</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                            <div className="text-lg font-bold text-emerald-900">{perServingCalories}</div>
                            <div className="text-xs text-emerald-600">kcal</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold text-gray-700">{perServingProtein}g</div>
                            <div className="text-xs text-gray-500">protein</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold text-gray-700">{perServingCarbs}g</div>
                            <div className="text-xs text-gray-500">carbs</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold text-gray-700">{perServingFat}g</div>
                            <div className="text-xs text-gray-500">fat</div>
                        </div>
                    </div>
                </div>

                {/* Ingredients Preview */}
                {preview && preview.ingredients && preview.ingredients.length > 0 && (
                    <div className="bg-gray-50 rounded p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                        {preview.ingredients.map((ing, i) => (
                            <div key={i} className="flex justify-between">
                                <span className="text-gray-700">
                                    <span className="font-medium text-gray-900">{ing.quantity} {ing.unit}</span> {ing.name}
                                </span>
                                {ing.nutrition?.calories != null && (
                                    <span className="text-gray-400">{Math.round(ing.nutrition.calories)} kcal</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onDecline}
                        className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 px-3 bg-emerald-600 border border-transparent text-white rounded-md text-sm font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 shadow-sm transition-colors"
                    >
                        Save Recipe
                    </button>
                </div>
            </div>
        </div>
    );
};
