import React from 'react';

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

const formatNutrientName = (key: string): string => {
    return key.replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/ G$/, ' (g)')
        .replace(/ Mg$/, ' (mg)')
        .replace(/ Mcg$/, ' (mcg)');
};

const DashboardSummaryTable: React.FC<DashboardSummaryTableProps> = ({
    userGoals,
    dailyTotals,
    loading,
    error,
    refreshing = false,
    onRefresh
}) => {
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
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm mt-0 mb-0 flex justify-center items-center">
                    <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed divide-y divide-gray-200 mx-auto">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nutrient</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Consumed</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
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

const SummaryTableRow = ({ nutrient, current, target, unit, goalType }: { nutrient: string; current: number; target?: number; unit: string; goalType?: string }) => {
    const targetValue = target ?? 0;
    let progressText = '-';
    let targetText = targetValue > 0 ? `${targetValue.toFixed(0)} ${unit}` : '-';
    let consumedText = `${current.toFixed(0)} ${unit}`;
    let displayPercentage = '0';
    let rowBgColor = 'bg-white';
    if (nutrient === 'omega_ratio') {
        const omega6Total = current;
        const omega3Total = targetValue;
        const currentRatio = omega3Total > 0 ? (omega6Total / omega3Total) : 0;
        targetText = `${targetValue}:1 Target`;
        consumedText = omega3Total > 0 ? `${currentRatio.toFixed(1)}:1` : '0:0';
        progressText = consumedText;
    } else if (targetValue > 0) {
        const progress = (current / targetValue) * 100;
        displayPercentage = progress.toFixed(0);
        const difference = targetValue - current;
        const differenceText = difference >= 0 ? `(+${difference.toFixed(0)} ${unit})` : `(${difference.toFixed(0)} ${unit})`;
        progressText = `${displayPercentage}% ${differenceText}`;
    }
    if ((current ?? 0) === 0 && nutrient !== 'omega_ratio') {
        rowBgColor = goalType === 'goal' ? 'bg-red-50' : 'bg-green-50';
    }
    const formattedNutrient = formatNutrientName(nutrient);
    return (
        <tr className={`${rowBgColor} hover:bg-gray-100`}>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                {formattedNutrient}
                <span className="text-gray-500 font-normal">{goalType ? ` (${goalType})` : ''}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{targetText}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{consumedText}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{progressText}</td>
        </tr>
    );
};

export default DashboardSummaryTable; 