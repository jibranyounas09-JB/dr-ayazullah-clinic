/**
 * Vocal response mechanism for Dr. Ayazullah Voice Chatbot
 * Uses native Browser Web Speech API — free, no API limits, no quota.
 * Supports natural Urdu and English speaking.
 */

let currentSpeechSessionId = 0;
let autoplayBlockedCallback: ((blocked: boolean) => void) | null = null;

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

/**
 * Register callback to notify UI if browser blocks autoplay
 */
export function setAutoplayBlockedListener(listener: ((blocked: boolean) => void) | null) {
  autoplayBlockedCallback = listener;
}

/**
 * Unlocks audio contexts and browser playback restrictions on user gestures
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if ("speechSynthesis" in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (autoplayBlockedCallback) autoplayBlockedCallback(false);
  } catch (e) {}
}

/**
 * Clean text for speech: strips markdown images, URLs, emojis, transaction codes
 */
export function cleanTextForSpeech(text: string, language: "en" | "ur" | "ps" | "auto" = "auto"): string {
  if (!text) {
    if (language === "ur") return "آپ کی تصویر اور تفصیلات موصول ہو گئی ہیں۔";
    return "Photo and details received successfully.";
  }

  let cleaned = text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b[\w-]+\.(?:jpg|jpeg|png|webp|gif|pdf)\b/gi, "")
    .replace(/\b(?:AX|AI-TX|TID)-?\w+\b/gi, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[*_~`#|>\-•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    if (language === "ur") return "آپ کی تصویر اور تفصیلات موصول ہو گئی ہیں۔ ہم اس کا جائزہ لے رہے ہیں۔";
    return "Photo and clinical details received successfully. Reviewing now.";
  }

  return cleaned;
}

/**
 * Converts Urdu script into phonetically readable Roman Urdu for browser TTS engines
 * so that systems without native ur-PK voices read the full message clearly.
 */
export function convertUrduScriptToRomanUrdu(text: string): string {
  let r = text;

  // Major Urdu phrase mappings for clear vocal delivery
  r = r
    .replace(/السلام علیکم/g, "Assalam-o-Alaikum")
    .replace(/وعلیکم السلام/g, "Walaikum Assalam")
    .replace(/ڈاکٹر ایاز اللہ/g, "Dr. Ayazullah")
    .replace(/فزیوتھراپی/g, "Physiotherapy")
    .replace(/اینڈ اسپورٹس ری ہیبلیٹیشن/g, "and Sports Rehabilitation")
    .replace(/کلینک/g, "Clinic")
    .replace(/اسلام آباد/g, "Islamabad")
    .replace(/خوش آمدید/g, "Khush Aamdeed")
    .replace(/جی محترم/g, "Ji Mohtaram")
    .replace(/اپائنٹمنٹ/g, "Appointment")
    .replace(/معائنہ/g, "Moaayna")
    .replace(/ابتدائی/g, "Ibtedaee")
    .replace(/تشخیصی/g, "Tashkheesi")
    .replace(/فیس/g, "Fee")
    .replace(/روپے/g, "Rupees")
    .replace(/پتہ/g, "Pata")
    .replace(/آفس نمبر/g, "Office number")
    .replace(/پہلی منزل/g, "pehli manzil")
    .replace(/پاک لینڈ پلازہ/g, "Pakland Plaza")
    .replace(/جی ایٹ مرکز/g, "G-8 Markaz")
    .replace(/اوقات/g, "Oqaat")
    .replace(/کلینیکل/g, "Clinical")
    .replace(/پیر تا ہفتہ/g, "Peer se Hafta")
    .replace(/صبح/g, "Subah")
    .replace(/بجے/g, "Baje")
    .replace(/رات/g, "Raat")
    .replace(/تا/g, "se")
    .replace(/بدھ/g, "Budh")
    .replace(/ادائیگی/g, "Adaaigi")
    .replace(/اکاؤنٹ/g, "Account")
    .replace(/جاز کیش/g, "JazzCash")
    .replace(/میزان بینک/g, "Meezan Bank")
    .replace(/ایزی پیسہ/g, "EasyPaisa")
    .replace(/عنوان/g, "Title")
    .replace(/آسان بکنگ/g, "Aasaan booking")
    .replace(/انٹرایکٹو/g, "Interactive")
    .replace(/فارم/g, "Form")
    .replace(/تھراپی/g, "Therapy")
    .replace(/دن/g, "Din")
    .replace(/وقت/g, "Waqt")
    .replace(/سلپ/g, "Slip")
    .replace(/بغیر آپریشن/g, "Baghair operation")
    .replace(/جدید/g, "Jadeed")
    .replace(/ڈی کمپریشن/g, "Decompression")
    .replace(/کمر درد/g, "Kamar dard")
    .replace(/مہروں/g, "Mohron")
    .replace(/سلپ ڈسک/g, "Slip Disc")
    .replace(/سیاٹیکا/g, "Sciatica")
    .replace(/جوڑوں/g, "Jodon")
    .replace(/بحالی/g, "Bahaali")
    .replace(/علاج/g, "Ilaaj")
    .replace(/انٹرن شپ/g, "Internship")
    .replace(/فیلوشپ/g, "Fellowship")
    .replace(/اکیڈمی/g, "Academy")
    .replace(/پروگرام/g, "Program")
    .replace(/نشستیں/g, "Seats")
    .replace(/دستیاب/g, "Dastyaab")
    .replace(/طالب علم/g, "Talib-e-ilm")
    .replace(/درخواست/g, "Darkhwast")
    .replace(/موصول/g, "Mousool")
    .replace(/کوشش/g, "Koshish")
    .replace(/تصدیق/g, "Tasdeeq")
    .replace(/محفوظ/g, "Mahfooz")
    .replace(/مبارک/g, "Mubarak")
    .replace(/حاصل/g, "Haasil")
    .replace(/ہم/g, "Hum")
    .replace(/آپ/g, "Aap")
    .replace(/کا/g, "ka")
    .replace(/کی/g, "ki")
    .replace(/کے/g, "ke")
    .replace(/کو/g, "ko")
    .replace(/میں/g, "mein")
    .replace(/پر/g, "par")
    .replace(/سے/g, "se")
    .replace(/ہے/g, "hai")
    .replace(/ہیں/g, "hain")
    .replace(/تھا/g, "tha")
    .replace(/تھی/g, "thi")
    .replace(/تھے/g, "they")
    .replace(/کر/g, "kar")
    .replace(/کریں/g, "karein")
    .replace(/کر سکتے/g, "kar sakte")
    .replace(/سکے/g, "sake")
    .replace(/دیں/g, "dein")
    .replace(/دے/g, "de")
    .replace(/لے/g, "le")
    .replace(/بتا/g, "bata")
    .replace(/دوبارہ/g, "dubaara")
    .replace(/براہ کرم/g, "baraaye karam")
    .replace(/معذرت/g, "maazrat");

  return r;
}

/**
 * Checks if text is predominantly Arabic/Urdu script
 */
export function isArabicUrduPashtoScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Checks if text contains Pashto-specific characters
 */
export function isPashtoScript(text: string): boolean {
  return /[\u069A\u0696\u0685\u0681\u067C\u0689\u0693\u06BC\u06D0\u06CD]/.test(text);
}

/**
 * Stop any current vocal response
 */
export function stopVocalResponse(): void {
  currentSpeechSessionId++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
}

/**
 * Main Vocal Response — uses free native Browser Web Speech API
 */
export async function speakVocalResponse(
  text: string,
  language: "en" | "ur" | "ps" | "auto" = "auto",
  onEnd?: () => void
): Promise<boolean> {
  stopVocalResponse();

  const cleaned = cleanTextForSpeech(text, language);
  const thisSessionId = currentSpeechSessionId;

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (onEnd) onEnd();
    return false;
  }

  try {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    window.speechSynthesis.cancel();

    let detectedLang = language;
    if (detectedLang === "auto") {
      if (isPashtoScript(cleaned)) detectedLang = "ps";
      else if (isArabicUrduPashtoScript(cleaned)) detectedLang = "ur";
      else detectedLang = "en";
    }

    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
    let targetVoice: SpeechSynthesisVoice | null = null;
    let textToSpeak = cleaned;

    if (detectedLang === "ur" || (detectedLang === "auto" && isArabicUrduPashtoScript(cleaned))) {
      // Check for native Urdu voice on user's system
      targetVoice =
        voices.find(v => v.lang.toLowerCase().includes("ur-pk")) ||
        voices.find(v => v.lang.toLowerCase().includes("ur")) ||
        voices.find(v => v.name.toLowerCase().includes("urdu")) ||
        null;

      if (targetVoice) {
        // Native Urdu voice installed
        textToSpeak = cleaned;
      } else {
        // No native Urdu voice on system (e.g. Windows Chrome)
        // Convert Urdu script to Roman Urdu so TTS reads every single word smoothly!
        textToSpeak = convertUrduScriptToRomanUrdu(cleaned);
        targetVoice =
          voices.find(v => v.lang.includes("en-US") || v.lang.includes("en-GB")) ||
          voices.find(v => v.lang.includes("hi-IN") || v.lang.startsWith("hi")) ||
          voices.find(v => v.lang.startsWith("en")) ||
          null;
      }
    } else {
      targetVoice =
        voices.find(v => v.lang.includes("en-US") || v.lang.includes("en-GB")) ||
        voices.find(v => v.lang.startsWith("en")) ||
        null;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = targetVoice ? targetVoice.lang : (detectedLang === "ur" ? "ur-PK" : "en-US");
    if (targetVoice) utterance.voice = targetVoice;
    utterance.rate = detectedLang === "ur" ? 0.88 : 0.95;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (thisSessionId === currentSpeechSessionId - 1 || thisSessionId === currentSpeechSessionId) {
        if (onEnd) onEnd();
      }
    };
    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    setTimeout(() => {
      if (thisSessionId !== currentSpeechSessionId) return;
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
        if (autoplayBlockedCallback) autoplayBlockedCallback(false);
      } catch (err) {
        if (onEnd) onEnd();
      }
    }, 40);

    return true;
  } catch (err) {
    if (onEnd) onEnd();
    return false;
  }
}
