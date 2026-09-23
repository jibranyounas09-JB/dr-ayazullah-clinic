export interface SingleDayOverride {
  dateKey: string; // "YYYY-MM-DD"
  dateLabel: string; // "Sat, Sep 19"
  isDayOff: boolean;
  offReason?: string;
  hasCustomSlots?: boolean;
  morningName?: string;
  morningSlots?: string[];
  afternoonName?: string;
  afternoonSlots?: string[];
  updatedAt?: string;
}

export interface ScheduleConfig {
  morningName: string;
  morningSlots: string[];
  afternoonName: string;
  afternoonSlots: string[];
  weeklyOffDays: string[]; // e.g. ["Sunday"]
  dayOverrides: Record<string, SingleDayOverride>;
}

export const DEFAULT_MORNING_NAME = "Morning Clinical Evaluation (09:00 AM – 01:00 PM)";
export const DEFAULT_MORNING_SLOTS = ["09:00 AM", "09:30 AM", "10:30 AM", "11:15 AM", "12:00 PM"];
export const DEFAULT_AFTERNOON_NAME = "Afternoon & Evening Sessions (03:00 PM – 08:30 PM)";
export const DEFAULT_AFTERNOON_SLOTS = ["03:00 PM", "04:00 PM", "05:00 PM", "05:30 PM", "07:00 PM", "08:00 PM"];
export const DEFAULT_WEEKLY_OFF = ["Sunday"];

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  morningName: DEFAULT_MORNING_NAME,
  morningSlots: DEFAULT_MORNING_SLOTS,
  afternoonName: DEFAULT_AFTERNOON_NAME,
  afternoonSlots: DEFAULT_AFTERNOON_SLOTS,
  weeklyOffDays: DEFAULT_WEEKLY_OFF,
  dayOverrides: {}
};

/**
 * Strips all undefined fields recursively so Firestore setDoc / updateDoc never fails.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Returns a local ISO format string "YYYY-MM-DD"
 */
export function getLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the human-readable appointment label format e.g. "Sat, Sep 19"
 */
export function getFormattedDateLabel(d: Date): string {
  const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
  const dateNum = d.getDate().toString();
  return `${dayShort}, ${monthShort} ${dateNum}`;
}

/**
 * Parses YYYY-MM-DD into a local Date object
 */
export function parseLocalDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface DayAvailability {
  isDayOff: boolean;
  reason: string;
  isOverride: boolean;
  hasCustomSlots: boolean;
  morningName: string;
  morningSlots: string[];
  afternoonName: string;
  afternoonSlots: string[];
}

/**
 * Computes availability, active slots, and shift titles for any specific date
 */
export function getDayAvailability(d: Date, config: ScheduleConfig | null): DayAvailability {
  const safeConfig = config || DEFAULT_SCHEDULE_CONFIG;
  const dateKey = getLocalDateKey(d);
  const dateLabel = getFormattedDateLabel(d);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });

  // 1. Check for single day explicit override
  const override = safeConfig.dayOverrides?.[dateKey] || safeConfig.dayOverrides?.[dateLabel];

  if (override) {
    if (override.isDayOff) {
      return {
        isDayOff: true,
        reason: override.offReason || "Scheduled Day Off (Clinic Closed)",
        isOverride: true,
        hasCustomSlots: false,
        morningName: override.morningName || safeConfig.morningName || DEFAULT_MORNING_NAME,
        morningSlots: [],
        afternoonName: override.afternoonName || safeConfig.afternoonName || DEFAULT_AFTERNOON_NAME,
        afternoonSlots: []
      };
    }

    // Day is explicitly turned ON
    return {
      isDayOff: false,
      reason: "",
      isOverride: true,
      hasCustomSlots: !!override.hasCustomSlots,
      morningName: (override.hasCustomSlots && override.morningName) ? override.morningName : (safeConfig.morningName || DEFAULT_MORNING_NAME),
      morningSlots: (override.hasCustomSlots && override.morningSlots) ? override.morningSlots : (safeConfig.morningSlots || DEFAULT_MORNING_SLOTS),
      afternoonName: (override.hasCustomSlots && override.afternoonName) ? override.afternoonName : (safeConfig.afternoonName || DEFAULT_AFTERNOON_NAME),
      afternoonSlots: (override.hasCustomSlots && override.afternoonSlots) ? override.afternoonSlots : (safeConfig.afternoonSlots || DEFAULT_AFTERNOON_SLOTS)
    };
  }

  // 2. Check if weekday falls on weekly off days
  const isWeeklyOff = (safeConfig.weeklyOffDays || []).includes(weekday);
  if (isWeeklyOff) {
    return {
      isDayOff: true,
      reason: `Weekly Clinic Off (${weekday})`,
      isOverride: false,
      hasCustomSlots: false,
      morningName: safeConfig.morningName || DEFAULT_MORNING_NAME,
      morningSlots: [],
      afternoonName: safeConfig.afternoonName || DEFAULT_AFTERNOON_NAME,
      afternoonSlots: []
    };
  }

  // 3. Normal working day using default schedule
  return {
    isDayOff: false,
    reason: "",
    isOverride: false,
    hasCustomSlots: false,
    morningName: safeConfig.morningName || DEFAULT_MORNING_NAME,
    morningSlots: safeConfig.morningSlots || DEFAULT_MORNING_SLOTS,
    afternoonName: safeConfig.afternoonName || DEFAULT_AFTERNOON_NAME,
    afternoonSlots: safeConfig.afternoonSlots || DEFAULT_AFTERNOON_SLOTS
  };
}
