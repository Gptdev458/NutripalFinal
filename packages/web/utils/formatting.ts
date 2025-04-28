// utils/formatting.ts

// Basic number formatting (can be expanded)
const formatNumber = (value: number | null | undefined, precision: number = 0): string => {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return value.toFixed(precision);
};

// Specific Formatters (Metric Only)
export const formatWeight = (grams: number | null | undefined): string => {
  return `${formatNumber(grams, 0)} g`;
};

export const formatVolume = (milliliters: number | null | undefined): string => {
  return `${formatNumber(milliliters, 0)} ml`;
}; 

export const formatHeight = (heightCm: number | null | undefined): string => {
  return `${formatNumber(heightCm, 0)} cm`;
};

export const formatEnergy = (calories: number | null | undefined): string => {
  return `${formatNumber(calories, 0)} kcal`;
};

// Add other simple formatters as needed, e.g., for mg, mcg
export const formatMicrogram = (mcg: number | null | undefined): string => {
  return `${formatNumber(mcg, 0)} mcg`;
};

export const formatMilligram = (mg: number | null | undefined): string => {
  return `${formatNumber(mg, 0)} mg`;
};

// Example for nutrient display names (if needed elsewhere)
export const formatNutrientName = (key: string): string => {
   return key.replace(/_/g, ' ')
             .replace(/\b\w/g, l => l.toUpperCase())
             .replace(/ G$/, ' (g)')
             .replace(/ Mg$/, ' (mg)')
             .replace(/ Mcg$/, ' (mcg)'); 
}; 