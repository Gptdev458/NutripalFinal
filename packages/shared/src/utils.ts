/**
 * Shared utility functions
 */

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
    // Helper to get UTC timestamp corresponding to local time in target timezone
    const getTzOffset = (d: Date, tz: string) => {
      const format = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const parts = format.formatToParts(d);
      const p = (type: string) => parts.find(x => x.type === type)!.value;
      // Construct a Date object from the parts as if they were UTC
      const tzDate = new Date(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`);
      return (d.getTime() - tzDate.getTime());
    };

    const offset = getTzOffset(date, timezone);
    
    // Start of day in timezone
    const startOfDayLocal = new Date(date);
    startOfDayLocal.setHours(0, 0, 0, 0);
    const startUTC = new Date(startOfDayLocal.getTime() + offset);
    
    // End of day in timezone
    const endOfDayLocal = new Date(date);
    endOfDayLocal.setHours(23, 59, 59, 999);
    const endUTC = new Date(endOfDayLocal.getTime() + offset);

    return { start: startUTC.toISOString(), end: endUTC.toISOString() };
  } catch (e) {
    console.error(`[Utils] Error calculating timezone dates for ${timezone}, falling back to simple UTC`, e);
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
