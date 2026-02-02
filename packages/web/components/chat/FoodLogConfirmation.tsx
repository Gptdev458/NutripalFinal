import React, { useState } from 'react';

interface FoodItem {
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_total_g: number;
    serving_size?: string;
}

interface FoodLogConfirmationProps {
    nutrition: FoodItem[];
    onConfirm: () => void;
    onDecline: () => void;
    onEdit?: (items: FoodItem[]) => void; // Placeholder for future explicit edit UI
    title?: string;
    confirmLabel?: string;
}

export const FoodLogConfirmation: React.FC<FoodLogConfirmationProps> = ({
    nutrition,
    onConfirm,
    onDecline,
    onEdit,
    title = 'Verify Log',
    confirmLabel = 'Log Food'
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const totalCalories = nutrition.reduce((sum, item) => sum + item.calories, 0);
    const totalProtein = nutrition.reduce((sum, item) => sum + item.protein_g, 0);
    const totalCarbs = nutrition.reduce((sum, item) => sum + item.carbs_g, 0);
    const totalFat = nutrition.reduce((sum, item) => sum + item.fat_total_g, 0);

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mt-2">
            <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex justify-between items-center">
                <span className="font-semibold text-blue-900 text-sm">{title}</span>
                <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Propose</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Summary */}
                <div className="flex justify-between items-baseline mb-2">
                    <div className="text-2xl font-bold text-gray-900">{Math.round(totalCalories)} <span className="text-sm font-normal text-gray-500">kcal</span></div>
                    <div className="flex gap-3 text-xs text-gray-600">
                        <span><span className="font-medium text-gray-900">{Math.round(totalProtein)}g</span> Prot</span>
                        <span><span className="font-medium text-gray-900">{Math.round(totalCarbs)}g</span> Carb</span>
                        <span><span className="font-medium text-gray-900">{Math.round(totalFat)}g</span> Fat</span>
                    </div>
                </div>

                {/* Item List */}
                <div className="space-y-2 border-t border-gray-100 pt-2 max-h-40 overflow-y-auto">
                    {nutrition.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm group">
                            <div className="flex-1 truncate pr-2">
                                <div className="font-medium text-gray-800">{item.food_name}</div>
                                <div className="text-xs text-gray-500">{item.serving_size || '1 serving'}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium text-gray-700">{item.calories}</div>
                            </div>
                        </div>
                    ))}
                </div>

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
                        className="flex-1 py-2 px-3 bg-blue-600 border border-transparent text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 shadow-sm transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>

                {!isEditing && (
                    <div className="text-center">
                        <button className='text-xs text-gray-400 hover:text-blue-500 underline'>Edit details (Coming Soon)</button>
                    </div>
                )}
            </div>
        </div>
    );
};
