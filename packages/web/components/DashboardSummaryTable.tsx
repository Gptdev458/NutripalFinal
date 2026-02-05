import React from 'react';
import { formatNutrientName, formatWeight, formatVolume, formatMilligram, formatMicrogram, formatEnergy, formatNutrientValue } from '@/utils/formatting';
import { Progress } from "@/components/ui/progress";

interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

interface DailyTotals {
    [nutrientKey: string]: number | undefined;
}

interface DashboardSummaryTableProps {
    userGoals: UserGoal[];
    dailyTotals: DailyTotals;
    loading: boolean;
    error: string | null;
    refreshing?: boolean;
    onRefresh?: () => void;
}

const DashboardSummaryTable: React.FC<DashboardSummaryTableProps> = ({
    userGoals,
    dailyTotals,
    loading,
    error,
    refreshing = false,
    onRefresh
}) => {

    // --- DEBUG LOG --- 
    console.log("[DashboardSummaryTable] Received userGoals prop:", JSON.stringify(userGoals));
    // --- END DEBUG LOG ---

    return (
        <div className="relative flex flex-col h-full justify-center items-center">
            {/* Sticky refresh button in bottom right */}
            {onRefresh && (
                <button
                    onClick={onRefresh}
                    className={`fixed md:absolute bottom-4 right-4 z-20 p-2 rounded-full shadow bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={refreshing}
                    title="Refresh Summary"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m-15.357-2a8.001 8.001 0 0015.357 2M15 15h-4.581" />
                    </svg>
                </button>
            )}
            {loading ? (
                <div className="flex flex-col items-center justify-center pt-10">
                    <div className="relative w-8 h-8">
                        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-blue-100 rounded-full"></div>
                        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">Loading Summary...</p>
                </div>
            ) : error ? (
                <div className="p-3 bg-red-100 text-red-600 text-sm rounded border border-red-200">
                    Error: {error}
                </div>
            ) : userGoals.length === 0 && (!dailyTotals['calories'] || dailyTotals['calories'] === 0) ? (
                <div className="text-center text-gray-500 py-10">
                    <p>No goals set or data logged for today yet.</p>
                </div>
            ) : (
                <div className="bg-white border border-gray-300 rounded-lg overflow-hidden shadow-md mt-0 mb-0 flex justify-center items-center w-full max-w-4xl">
                    <div className="overflow-x-auto w-full">
                        <table className="min-w-full table-auto divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nutrient</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Target</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Consumed</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Progress</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {(userGoals.find(g => g.nutrient === 'calories') || (dailyTotals['calories'] && dailyTotals['calories'] > 0)) && (
                                    <SummaryTableRow
                                        key="calories"
                                        nutrient="calories"
                                        current={dailyTotals['calories'] || 0}
                                        target={userGoals.find(g => g.nutrient === 'calories')?.target_value}
                                        unit="kcal"
                                        goalType={userGoals.find(g => g.nutrient === 'calories')?.goal_type}
                                    />
                                )}
                                {userGoals.filter(goal => goal.nutrient !== 'calories').map(goal => (
                                    <SummaryTableRow
                                        key={goal.nutrient}
                                        nutrient={goal.nutrient}
                                        current={dailyTotals[goal.nutrient] || 0}
                                        target={goal.target_value}
                                        unit={goal.unit}
                                        goalType={goal.goal_type}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

interface SummaryTableRowProps {
    nutrient: string;
    current: number;
    target?: number;
    unit: string;
    goalType?: string;
}

const SummaryTableRow: React.FC<SummaryTableRowProps> = ({ nutrient, current, target, unit, goalType }) => {
    // Define formatting logic based on unit using AVAILABLE formatters
    const displayCurrent = formatNutrientValue(nutrient, current);
    const displayTarget = target !== undefined ? formatNutrientValue(nutrient, target) : '-';
    const progressText = `${displayCurrent} / ${displayTarget}`;

    const percentage = (target && target > 0) ? Math.round((current / target) * 100) : 0;
    const barWidth = Math.min(percentage, 100);

    // Format the nutrient name properly
    const formattedNutrientName = formatNutrientName(nutrient);

    // Color coding logic
    const isLimit = goalType === 'limit';
    const isOver = target !== undefined && current > target;
    const isMet = target !== undefined && current >= target;

    let textColorClass = 'text-gray-600';
    let progressBarClass = 'bg-blue-600';

    if (target !== undefined) {
        if (isLimit) {
            if (isOver) {
                textColorClass = 'text-red-600 font-bold';
                progressBarClass = 'bg-red-500';
            } else {
                textColorClass = 'text-blue-600 font-medium';
                progressBarClass = 'bg-blue-500';
            }
        } else {
            // Default Goal behavior
            if (isMet) {
                textColorClass = 'text-emerald-600 font-bold';
                progressBarClass = 'bg-emerald-500';
            } else {
                textColorClass = 'text-blue-600 font-medium';
                progressBarClass = 'bg-blue-500';
            }
        }
    }

    return (
        <tr className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                <div className="flex flex-col">
                    <span>{formattedNutrientName}</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-tighter">
                        {isLimit ? 'Limit' : 'Goal'}
                    </span>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{displayTarget}</td>
            <td className={`px-6 py-4 whitespace-nowrap text-sm ${textColorClass}`}>{displayCurrent}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                    {target !== undefined && (
                        <>
                            <div className="w-32 bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200">
                                <div
                                    className={`h-full transition-all duration-500 ${progressBarClass}`}
                                    style={{ width: `${barWidth}%` }}
                                />
                            </div>
                            <span className={`text-xs font-bold w-10 ${textColorClass}`}>{`${percentage}%`}</span>
                        </>
                    )}
                    {target === undefined && (
                        <span className="text-gray-400 italic">No Goal Set</span>
                    )}
                </div>
            </td>
        </tr>
    );
};

export default DashboardSummaryTable; 