import React from 'react';
// import { Progress } from '@/components/ui/progress'; // Commented out - fix path or install later
import { formatNutrientName, formatWeight, formatVolume, formatMilligram, formatMicrogram, formatEnergy } from '@/utils/formatting'; // Import needed formatters

// ... other imports ...

interface SummaryTableRowProps {
  nutrient: string;
  current: number;
  target?: number;
  unit: string;
  goalType?: string;
}

const SummaryTableRow: React.FC<SummaryTableRowProps> = ({ nutrient, current, target, unit, goalType }) => {
    // Define formatting logic based on unit using AVAILABLE formatters
    const formatValue = (value: number): string => {
        if (isNaN(value) || value === null || value === undefined) return '-';

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
                return `${value.toFixed(0)} ${unit || ''}`;
        }
    };

    const targetValue = target ?? 0;
    const displayCurrent = formatValue(current);
    const displayTarget = target !== undefined ? formatValue(targetValue) : '-';
    const progressText = `${displayCurrent} / ${displayTarget}`;

    const percentage = (target && target > 0) ? Math.min(Math.round((current / target) * 100), 100) : 0;
    // const progressValue = (target && target > 0) ? Math.min((current / target) * 100, 100) : 0; // Value for Progress component

    // Return the table row JSX
    return (
        <tr>
            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-foreground">{nutrient}</td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                <div className="flex items-center">
                    <span className="mr-2">{progressText}</span>
                    {/* {target !== undefined && (
                        <Progress value={progressValue} className="w-24 h-2" /> // Commented out usage
                    )} */}
                </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                {target !== undefined ? `${percentage}%` : 'N/A'}
            </td>
        </tr>
    );
};

export const DashboardSummaryTable = ({ summaryData }: { summaryData: any }) => {
    if (!summaryData || Object.keys(summaryData).length === 0) {
        return <div className="mt-4 text-muted-foreground">No summary data available.</div>;
    }

    return (
        <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Daily Summary</h3>
            <div className="rounded-md border">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nutrient</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Progress</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">% of Goal</th>
                        </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                        {Object.entries(summaryData).map(([key, data]: [string, any]) => (
                            <SummaryTableRow
                                key={key}
                                nutrient={formatNutrientName(key)} // Use name formatter
                                current={data.current}
                                target={data.target}
                                unit={data.unit}
                                goalType={data.goalType}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}; 