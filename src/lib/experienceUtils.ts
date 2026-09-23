/**
 * Clinical Experience & Practice Calculation Utility
 * Automatically recalculates doctor's work experience dynamically as months and years advance.
 */

// Baseline clinical practice inception date: March 1, 2023
// As of September 2026, this exactly equals 3.5 years (42 months)
export const DEFAULT_PRACTICE_START_DATE = "2023-03-01";

export interface ExperienceResult {
  formatted: string;      // e.g. "3.5+" or "4+"
  totalYears: number;     // e.g. 3.5
  totalMonths: number;    // e.g. 42
  startDate: string;      // e.g. "2023-03-01"
}

/**
 * Calculates current clinical work experience based on start date.
 * Automatically recalculates as months and years progress.
 *
 * @param startDateStr ISO date string (YYYY-MM-DD), defaults to March 1, 2023
 * @param mode 'auto' for automatic date-based increment, or 'manual' to lock to a specific value
 * @param manualValue Fallback manual string (e.g. "3.5+")
 */
export function calculateExperience(
  startDateStr: string = DEFAULT_PRACTICE_START_DATE,
  mode: 'auto' | 'manual' = 'auto',
  manualValue?: string
): ExperienceResult {
  if (mode === 'manual' && manualValue && manualValue.trim()) {
    const parsedNum = parseFloat(manualValue.replace(/[^0-9.]/g, '')) || 3.5;
    return {
      formatted: manualValue.includes('+') ? manualValue : `${manualValue}+`,
      totalYears: parsedNum,
      totalMonths: Math.round(parsedNum * 12),
      startDate: startDateStr || DEFAULT_PRACTICE_START_DATE
    };
  }

  const start = new Date(startDateStr || DEFAULT_PRACTICE_START_DATE);
  const now = new Date();

  // Guard against invalid date
  if (isNaN(start.getTime())) {
    return {
      formatted: "3.5+",
      totalYears: 3.5,
      totalMonths: 42,
      startDate: DEFAULT_PRACTICE_START_DATE
    };
  }

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) {
    months = Math.max(0, months - 1);
  }

  if (months <= 0) {
    return {
      formatted: "3.5+",
      totalYears: 3.5,
      totalMonths: 42,
      startDate: DEFAULT_PRACTICE_START_DATE
    };
  }

  const exactYears = months / 12;
  // Round to 1 decimal place (e.g. 3.5, 3.6, 4.0)
  const roundedOneDecimal = Math.round(exactYears * 10) / 10;
  
  const formatted = roundedOneDecimal % 1 === 0 
    ? `${roundedOneDecimal}+` 
    : `${roundedOneDecimal.toFixed(1)}+`;

  return {
    formatted,
    totalYears: roundedOneDecimal,
    totalMonths: months,
    startDate: startDateStr
  };
}
