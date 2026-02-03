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
    isMatch?: boolean;
    existingRecipeName?: string;
    onConfirm: (choice?: string, portion?: string, name?: string) => void;
    onDecline: () => void;
}

export const RecipeConfirmation: React.FC<RecipeConfirmationProps> = ({
    recipe,
    preview,
    isMatch,
    existingRecipeName,
    onConfirm,
    onDecline
}) => {
    const [portion, setPortion] = React.useState("1 serving");
    const [recipeName, setRecipeName] = React.useState(recipe.recipe_name);
    const [showIngredients, setShowIngredients] = React.useState(false);
    const nutrition = recipe.nutrition_data;

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-2">
            <div className={`${isMatch ? 'bg-amber-50' : 'bg-emerald-50'} px-4 py-2 border-b ${isMatch ? 'border-amber-100' : 'border-emerald-100'} flex justify-between items-center`}>
                <span className={`font-semibold ${isMatch ? 'text-amber-900' : 'text-emerald-900'} text-sm`}>
                    {isMatch ? 'Match Found' : 'Save Recipe'}
                </span>
                <span className={`text-xs ${isMatch ? 'text-amber-700 bg-amber-100' : 'text-emerald-700 bg-emerald-100'} px-2 py-0.5 rounded-full`}>
                    {isMatch ? 'Existing Recipe' : 'New Recipe'}
                </span>
            </div>

            <div className="p-4 space-y-4">
                {/* Header / Name Edit */}
                <div>
                    {isMatch && (
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">
                            Matches saved recipe: "{existingRecipeName}"
                        </p>
                    )}
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Recipe Name</label>
                    <input
                        type="text"
                        value={recipeName}
                        onChange={(e) => setRecipeName(e.target.value)}
                        className="w-full text-lg font-bold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:border-emerald-500 focus:outline-none mb-1"
                        placeholder="Enter recipe name..."
                    />
                    <p className="text-xs text-gray-500">{recipe.servings} Servings total</p>
                </div>

                {/* Nutrition Summary */}
                {nutrition && (
                    <div className="bg-gray-50 rounded p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estimated Nutrition (Total Batch)</p>
                        <div className="flex justify-between items-baseline">
                            <div className="text-xl font-bold text-gray-900">{Math.round(nutrition.calories)} <span className="text-xs font-normal text-gray-500">kcal</span></div>
                            <div className="flex gap-2 text-[10px] text-gray-600">
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.protein_g || 0)}g</span> P</span>
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.carbs_g || 0)}g</span> C</span>
                                <span><span className="font-medium text-gray-900">{Math.round(nutrition.fat_total_g || 0)}g</span> F</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 italic">~{Math.round(nutrition.calories / (recipe.servings || 1))} kcal per serving</p>
                    </div>
                )}

                {/* Portion Input if Match */}
                {isMatch && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded p-3 space-y-2">
                        <label className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block">How much did you have?</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={portion}
                                onChange={(e) => setPortion(e.target.value)}
                                placeholder="e.g. 1 serving, 2 cups"
                                className="flex-1 text-sm bg-white border border-amber-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                        </div>
                    </div>
                )}

                {/* Ingredient Preview */}
                <div className="space-y-1">
                    <button
                        onClick={() => setShowIngredients(!showIngredients)}
                        className="flex items-center gap-2 group focus:outline-none"
                    >
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-600 transition-colors">Ingredients</p>
                        <span className={`text-[10px] text-gray-400 transform transition-transform ${showIngredients ? 'rotate-90' : ''}`}>▶</span>
                    </button>

                    {showIngredients && (
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-gray-100 rounded p-2 bg-gray-50/30">
                            {recipe.ingredients?.map((ing, idx) => (
                                <div key={idx} className="flex justify-between text-xs border-b border-gray-50 pb-1 last:border-0">
                                    <span className="text-gray-700">{ing.name}</span>
                                    <span className="text-gray-500 italic">{ing.amount} {ing.unit}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {preview && (
                    <p className="text-xs text-gray-600 italic border-l-2 border-emerald-200 pl-2 py-1 bg-emerald-50/30">
                        {preview}
                    </p>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2">
                    {isMatch ? (
                        <>
                            <button
                                onClick={() => onConfirm("log", portion, recipeName)}
                                className="w-full py-2.5 px-3 bg-amber-600 border border-transparent text-white rounded-md text-sm font-bold hover:bg-amber-700 shadow-sm transition-colors flex items-center justify-center gap-2"
                            >
                                🍽️ Log
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onConfirm("update", portion, recipeName)}
                                    className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Edit and Log
                                </button>
                                <button
                                    onClick={() => onConfirm("new", undefined, recipeName)}
                                    className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Save as New
                                </button>
                            </div>
                            <button
                                onClick={onDecline}
                                className="w-full py-1.5 px-3 text-gray-500 rounded-md text-xs hover:text-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={onDecline}
                                className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => onConfirm(undefined, undefined, recipeName)}
                                className="flex-1 py-2 px-3 bg-emerald-600 border border-transparent text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-sm transition-colors"
                            >
                                Save Recipe
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
