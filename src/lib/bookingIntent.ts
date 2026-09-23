/**
 * Intelligent Natural Language Booking Intent & Date Parser
 * Supports English, Urdu (اردو), and Pashto (پښتو) for Dr. Ayazullah Clinic
 */

export interface ParsedBookingIntent {
  isBookingIntent: boolean;
  isInitialBookingRequest?: boolean;
  targetDateStr: string; // e.g. "Wed, Sep 23, 2026"
  targetDateObj: Date;
  targetTime: string; // e.g. "11:00 AM"
  category: string;
  patientName?: string;
  patientPhone?: string;
  symptoms?: string;
}

const DAY_NAMES_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Map Urdu and Pashto day names to Sunday (0) through Saturday (6)
const DAY_MAP: Record<string, number> = {
  // English
  "sunday": 0, "sun": 0,
  "monday": 1, "mon": 1,
  "tuesday": 2, "tue": 2,
  "wednesday": 3, "wed": 3,
  "thursday": 4, "thu": 4,
  "friday": 5, "fri": 5,
  "saturday": 6, "sat": 6,

  // Urdu
  "اتوار": 0,
  "پیر": 1, "سوموار": 1,
  "منگل": 2,
  "بدھ": 3,
  "جمعرات": 4,
  "جمعہ": 5,
  "ہفتہ": 6,

  // Roman Urdu
  "itwar": 0,
  "peer": 1, "somwar": 1,
  "mangal": 2,
  "budh": 3,
  "jumeraat": 4, "jumerat": 4,
  "juma": 5, "jummah": 5,
  "hafta": 6,

  // Pashto
  "ګل": 1, "گل": 1,
  "نهې": 2, "نهی": 2,
  "شورو": 3,
  "زیارت": 4,
  "جمعه": 5,
  "خالي": 6,

  // Roman Pashto
  "gul": 1,
  "nehey": 2, "nehe": 2,
  "shoro": 3, "shora": 3,
  "ziarat": 4,
  "khali": 6
};

/**
 * Calculates the next date matching a target day of the week (0 = Sun, ..., 6 = Sat)
 */
export function getNextDateForDay(targetDay: number): Date {
  const date = new Date();
  const currentDay = date.getDay();
  let daysUntil = (targetDay - currentDay + 7) % 7;
  if (daysUntil === 0) {
    // If today is target day, book for next week or today if early
    daysUntil = 7;
  }
  date.setDate(date.getDate() + daysUntil);
  return date;
}

export function formatClinicalDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Analyzes conversational message to detect booking intent, date, category, time, etc.
 */
export function parseBookingIntent(text: string): ParsedBookingIntent {
  const lower = text.toLowerCase();

  // Booking keywords across languages
  const bookingKeywords = [
    "book", "appointment", "reserve", "schedule", "therapy", "session",
    "اپائنٹمنٹ", "بک", "ملاقات", "وقت", "تھراپی", "علاج",
    "کیدل", "ملاقات کتل", "غواړم", "درملنه", "ډاکټر"
  ];

  const hasBookingKeyword = bookingKeywords.some(k => lower.includes(k) || text.includes(k));

  const isInitialBookingRequest = /\b(i want to book|want to book|book therapy|book an appointment|book appointment|reserve therapy|schedule therapy|کمر کی تھراپی|تھراپی بک|اپائنٹمنٹ بک|ملاقات بک|ملاقات غواړم)\b/i.test(lower) ||
    text.includes("تھراپی بک") || text.includes("ملاقات بک") || text.includes("اپائنٹمنٹ بک");

  // Day detection
  let detectedTargetDate: Date | null = null;

  if (lower.includes("tomorrow") || text.includes("کل") || text.includes("سبا") || lower.includes("kal") || lower.includes("saba")) {
    const tm = new Date();
    tm.setDate(tm.getDate() + 1);
    detectedTargetDate = tm;
  } else {
    for (const [dayKey, dayIndex] of Object.entries(DAY_MAP)) {
      // Regex word boundary or direct include for non-ascii
      const regex = new RegExp(`\\b${dayKey}\\b`, "i");
      if (regex.test(lower) || text.includes(dayKey)) {
        detectedTargetDate = getNextDateForDay(dayIndex);
        break;
      }
    }
  }

  // If no specific day mentioned but booking is requested, default to tomorrow (or upcoming Wednesday if specified)
  if (!detectedTargetDate) {
    if (lower.includes("wednesday") || lower.includes("budh") || text.includes("بدھ") || text.includes("شورو")) {
      detectedTargetDate = getNextDateForDay(3);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      detectedTargetDate = tomorrow;
    }
  }

  // Avoid booking on Sunday (Clinic closed on Sunday)
  if (detectedTargetDate.getDay() === 0) {
    // Move to Monday
    detectedTargetDate.setDate(detectedTargetDate.getDate() + 1);
  }

  // Time extraction
  let targetTime = "11:00 AM"; // Default prime clinical slot
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|صبح|شام)/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] || "00";
    let period = (timeMatch[3] || "AM").toUpperCase();
    if (period === "شام") period = "PM";
    if (period === "صبح") period = "AM";
    if (hour < 9) hour += 12; // e.g. 4pm
    targetTime = `${hour.toString().padStart(2, "0")}:${minute} ${period}`;
  } else if (lower.includes("morning") || text.includes("صبح")) {
    targetTime = "10:30 AM";
  } else if (lower.includes("afternoon") || lower.includes("evening") || text.includes("شام")) {
    targetTime = "04:00 PM";
  }

  // Category detection
  let category = "Spine, Neck & Sciatica Relief (Decompression)";
  if (lower.includes("sport") || lower.includes("knee") || lower.includes("acl") || text.includes("گھٹنے")) {
    category = "Sports Injury & ACL Rehabilitation";
  } else if (lower.includes("stroke") || lower.includes("neuro") || lower.includes("paralysis") || text.includes("فالج")) {
    category = "Stroke & Neurological Rehabilitation";
  } else if (lower.includes("bone") || lower.includes("joint") || lower.includes("shoulder") || lower.includes("ortho") || text.includes("جوڑوں")) {
    category = "Orthopedic Rehabilitation & Manual Therapy";
  } else if (lower.includes("dry needle") || lower.includes("needling") || text.includes("سوئی")) {
    category = "Dry Needling & Trigger Point Therapy";
  }

  // Extract phone number (e.g. 03001234567 or +923329895770)
  const phoneMatch = text.match(/(?:03\d{9}|\+92\d{10})/);
  const patientPhone = phoneMatch ? phoneMatch[0] : undefined;

  // Extract patient name if user said "my name is X" or "نام: X"
  let patientName: string | undefined = undefined;
  const nameMatch = text.match(/(?:my name is|i am|mera naam|naam|نوم|نام)\s+([a-zA-Z\u0600-\u06FF\s]{2,25})/i);
  if (nameMatch && nameMatch[1]) {
    patientName = nameMatch[1].trim();
  }

  return {
    isBookingIntent: hasBookingKeyword || !!phoneMatch || lower.includes("wednesday") || text.includes("بدھ") || text.includes("شورو"),
    isInitialBookingRequest,
    targetDateStr: formatClinicalDate(detectedTargetDate),
    targetDateObj: detectedTargetDate,
    targetTime,
    category,
    patientName,
    patientPhone,
    symptoms: text
  };
}
