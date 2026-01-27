/**
 * Shared utility functions for Supabase Edge Functions
 */

/**
 * Retries a function a specified number of times with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries) break;
      console.warn(`[Retry] Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError;
}

/**
 * Normalizes a string by lowercasing, trimming, and removing punctuation
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes a food name by removing stop words and standardizing format
 */
export function normalizeFoodName(name: string): string {
  const stopWords = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'for', 'at', 'some', 'any']);
  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(word => !stopWords.has(word))
    .join(' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Returns the ISO strings for the start and end of the day in a given timezone
 */
export function getStartAndEndOfDay(date: Date, timezone = 'UTC'): { start: string, end: string } {
  try {
    // Use Intl to get the date parts in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');

    // Create a local date string for the start of the day in that timezone
    // Note: We need to handle the offset to get the correct UTC time
    const startLocal = `${year}-${month}-${day}T00:00:00`;
    const endLocal = `${year}-${month}-${day}T23:59:59.999`;

    // To get the actual UTC time, we can use the fact that 
    // new Date(string + timezone_offset) works, but it's tricky.
    // A simpler way for Edge Functions:
    const start = new Date(new Date(startLocal).toLocaleString('en-US', { timeZone: timezone })).toISOString();
    // This is still not quite right for all cases but better than server-side local time.
    
    // Let's use a more reliable method:
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    const diff = date.getTime() - tzDate.getTime();
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const startUTC = new Date(startOfDay.getTime() + diff).toISOString();
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const endUTC = new Date(endOfDay.getTime() + diff).toISOString();

    return { start: startUTC, end: endUTC };
  } catch (e) {
    console.error(`[Utils] Error calculating timezone dates for ${timezone}, falling back to UTC`, e);
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
}

/**
 * Returns the ISO strings for the last N days in a given timezone
 */
export function getDateRange(date: Date, days: number, timezone = 'UTC'): { start: string, end: string } {
  const { end } = getStartAndEndOfDay(date, timezone);
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - (days - 1));
  const { start } = getStartAndEndOfDay(startDate, timezone);
  return { start, end };
}
