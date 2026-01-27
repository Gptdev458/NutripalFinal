import React from 'react';

interface RecipeLogConfirmationProps {
    recipe: {
        recipe_name: string;
        servings: number;
        nutrition_data?: any;
        instructions?: string;
    };
    preview?: {
        ingredients: any[];
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
    const calories = recipe.nutrition_data?.calories || 0;

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
                        <span>{recipe.servings} Servings</span>
                        <span>•</span>
                        <span>~{calories} kcal/batch</span>
                    </div>
                </div>

                {/* Ingredients Preview */}
                {preview && preview.ingredients && (
                    <div className="bg-gray-50 rounded p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                        {preview.ingredients.map((ing, i) => (
                            <div key={i} className="flex justify-between">
                                <span className="text-gray-700">
                                    <span className="font-medium text-gray-900">{ing.quantity} {ing.unit}</span> {ing.name}
                                </span>
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
