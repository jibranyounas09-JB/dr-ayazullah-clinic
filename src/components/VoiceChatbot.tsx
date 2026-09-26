import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { 
  Mic, 
  MicOff, 
  Send, 
  Volume2, 
  VolumeX, 
  Calendar, 
  Clock, 
  CreditCard, 
  Upload, 
  CheckCircle2, 
  FileText, 
  Sparkles, 
  X, 
  Copy, 
  Check, 
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Phone,
  User,
  Camera,
  Image as ImageIcon,
  ArrowRight,
  ChevronRight,
  Stethoscope,
  Activity
} from "lucide-react";
import { speakVocalResponse, stopVocalResponse, unlockAudio, setAutoplayBlockedListener } from "../lib/voiceSynthesis";
import { parseBookingIntent, ParsedBookingIntent, getNextDateForDay, formatClinicalDate } from "../lib/bookingIntent";
import { generateAppointmentPDF } from "../lib/pdfGenerator";
import { db } from "../lib/firebase";
import { collection, doc, setDoc, getDoc, getDocs } from "firebase/firestore";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actionUrl?: string;
  actionLabel?: string;
  actionButtons?: { url: string; label: string }[];
  imageUrl?: string;
  imageName?: string;
  // If this message contains an interactive booking draft
  bookingDraft?: {
    date: string;
    time: string;
    category: string;
    patientName: string;
    patientPhone: string;
    symptoms: string;
  };
  // If an appointment was confirmed
  confirmedBooking?: {
    id: string;
    transactionId: string;
    patientName: string;
    patientPhone: string;
    date: string;
    time: string;
    category: string;
    fee: string;
    receiptUrl?: string;
    receiptName?: string;
    status: string;
  };
}

export interface BookingDraftState {
  step: "name_phone" | "therapy_type" | "slots" | "payment";
  date: string;
  time: string;
  category: string;
  patientName: string;
  patientPhone: string;
  symptoms: string;
  paymentMethod: string;
  transactionId: string;
  receiptUrl: string;
  receiptName: string;
  isUploadingSlip: boolean;
  isSubmitting: boolean;
}

export const DEFAULT_INITIAL_CONSULTATION = {
  id: "initial_consultation",
  title: "Initial Consultation & Diagnostic Assessment",
  titleUr: "ابتدائی تشخیصی معائنہ اور مشاورت",
  titlePs: "لومړنۍ معاینه او درملنه",
  desc: "Comprehensive 1-on-1 diagnostic examination & musculoskeletal triage by Dr. Ayazullah.",
  descUr: "ڈاکٹر ایاز اللہ کے ساتھ 1-on-1 تفصیلی تشخیصی معائنہ اور کلینیکل رپورٹ",
  descPs: "د ډاکټر ایازالله لخوا بشپړه فزیکي معاینه او درملنه",
  badge: "Rs. 5,000",
  icon: "🩺"
};

export const THERAPY_OPTIONS = [DEFAULT_INITIAL_CONSULTATION];

export const CLINIC_DAYS = [
  { dayName: "Wednesday", dayNameUr: "بدھ", dayNamePs: "د شورو ورځ", dayIndex: 3, badge: "⭐ Dr. Ayazullah Day" },
  { dayName: "Thursday", dayNameUr: "جمعرات", dayNamePs: "زیارت", dayIndex: 4, badge: "Open" },
  { dayName: "Friday", dayNameUr: "جمعہ", dayNamePs: "جمعه", dayIndex: 5, badge: "Open" },
  { dayName: "Saturday", dayNameUr: "ہفتہ", dayNamePs: "خالي", dayIndex: 6, badge: "Open" },
  { dayName: "Monday", dayNameUr: "پیر", dayNamePs: "ګل", dayIndex: 1, badge: "Open" },
  { dayName: "Tuesday", dayNameUr: "منگل", dayNamePs: "نهې", dayIndex: 2, badge: "Open" },
];

export const TIME_SLOTS_BY_PERIOD = [
  {
    period: "Morning",
    labelEn: "🌅 Morning Slots",
    labelUr: "🌅 صبح کے اوقات",
    labelPs: "🌅 د سهار وختونه",
    slots: ["09:30 AM", "10:30 AM", "11:30 AM"]
  },
  {
    period: "Afternoon",
    labelEn: "☀️ Afternoon Slots",
    labelUr: "☀️ دوپہر کے اوقات",
    labelPs: "☀️ د ماسپښین وختونه",
    slots: ["02:30 PM", "03:30 PM", "04:30 PM"]
  },
  {
    period: "Evening",
    labelEn: "🌆 Evening Slots",
    labelUr: "🌆 شام کے اوقات",
    labelPs: "🌆 د ماښام وختونه",
    slots: ["05:30 PM", "06:30 PM", "07:30 PM"]
  }
];

const DEFAULT_TIME_SLOTS = ["09:30 AM", "10:30 AM", "11:30 AM", "02:30 PM", "03:30 PM", "04:30 PM", "05:30 PM", "06:30 PM", "07:30 PM"];

const CLINIC_PAYMENT_ACCOUNTS = [
  {
    name: "JazzCash",
    account: "03175309414",
    title: "AYAZ ULLAH",
    badge: "Instant Transfer"
  },
  {
    name: "Meezan Bank",
    account: "00300112565418",
    title: "AYAZULLAH",
    iban: "PK21MEZN0000300112565418",
    badge: "Official Bank"
  },
  {
    name: "EasyPaisa",
    account: "03329895770",
    title: "AYAZ ULLAH",
    badge: "Mobile Wallet"
  }
];

export function VoiceChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [userLanguage, setUserLanguage] = useState<"auto" | "en" | "ur" | "ps">("auto");
  const [autoVocalSpeech, setAutoVocalSpeech] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ayazullah_voice_speech_active") !== "false";
    }
    return true;
  });
  const [isSpeakingMessageId, setIsSpeakingMessageId] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Dynamic Consultation Fee & Admin Therapy Services Synchronization
  const [consultationFee, setConsultationFee] = useState<number>(5000);
  const [dynamicTherapyOptions, setDynamicTherapyOptions] = useState<any[]>([DEFAULT_INITIAL_CONSULTATION]);

  useEffect(() => {
    const loadDynamicOptions = async () => {
      let fee = 5000;
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "general"));
        if (settingsSnap.exists() && settingsSnap.data().consultationFee) {
          const parsedFee = Number(settingsSnap.data().consultationFee);
          if (parsedFee > 0) {
            fee = parsedFee;
            setConsultationFee(fee);
          }
        }
      } catch (err) {
        console.warn("Notice loading consultation fee:", err);
      }

      const consultationItem = {
        id: "initial_consultation",
        title: "Initial Consultation & Diagnostic Assessment",
        titleUr: "ابتدائی تشخیصی معائنہ اور مشاورت",
        titlePs: "لومړنۍ معاینه او درملنه",
        desc: "Comprehensive 1-on-1 diagnostic examination & musculoskeletal triage by Dr. Ayazullah.",
        descUr: "ڈاکٹر ایاز اللہ کے ساتھ 1-on-1 تفصیلی تشخیصی معائنہ اور کلینیکل رپورٹ",
        descPs: "د ډاکټر ایازالله لخوا بشپړه فزیکي معاینه او درملنه",
        badge: `Rs. ${fee.toLocaleString()}`,
        icon: "🩺"
      };

      try {
        const querySnapshot = await getDocs(collection(db, "services"));
        const fetchedServices: any[] = [];
        if (!querySnapshot.empty) {
          querySnapshot.docs.forEach((docSnap) => {
            const d = docSnap.data();
            const formattedBadge = d.price 
              ? (typeof d.price === 'number' ? `Rs. ${d.price.toLocaleString()}` : String(d.price)) 
              : "Available";

            fetchedServices.push({
              id: docSnap.id,
              title: d.title || d.name || "Therapy Service",
              titleUr: d.titleUr || d.title || d.name || "تھراپی پروگرام",
              titlePs: d.titlePs || d.title || d.name || "درملنه",
              desc: d.description || d.desc || "Specialized physical rehabilitation service",
              descUr: d.descUr || d.description || "خصوصی فزیوتھراپی و بحالی سیشن",
              descPs: d.descPs || d.description || "ځانګړې فزیوتراپي او د درد درملنه",
              badge: formattedBadge,
              icon: d.icon || "🩺"
            });
          });
        }
        setDynamicTherapyOptions([consultationItem, ...fetchedServices]);
      } catch (err) {
        console.warn("Notice loading services for chatbot:", err);
        setDynamicTherapyOptions([consultationItem]);
      }
    };

    loadDynamicOptions();
  }, []);

  // Photo Attachment in Chat
  const [selectedPhoto, setSelectedPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isUploadingChatPhoto, setIsUploadingChatPhoto] = useState(false);
  const chatPhotoInputRef = useRef<HTMLInputElement>(null);

  // Messages State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content: 
`Welcome! I'm Dr. Ayaz Ullah, a dedicated physiotherapist committed to helping you achieve optimal health and wellness.

Do you suffer from:

- Stroke rehabilitation challenges
- Cervical pain (neck pain)
- Shoulder pain
- Lower back pain
- Sciatica
- Knee pain

Together, let's work towards alleviating your pain, restoring your mobility, and enhancing your quality of life.

Contact me today to schedule a consultation!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionButtons: [
        { url: "/book-appointment", label: "📅 Book Appointment" },
        { url: "/manage-booking", label: "🔍 Check My Appointment" }
      ]
    }
  ]);

  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Voice Recording & Listening Modal States
  const [isListeningModalOpen, setIsListeningModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);

  // In-Chat Active Booking Form State (Multi-step interactive menu)
  const [activeBooking, setActiveBooking] = useState<BookingDraftState | null>(null);

  // Spoken voice prompts for interactive menu step transitions
  const playStepVoicePrompt = (stepName: "therapy_type" | "slots" | "payment", detail?: string) => {
    if (!autoVocalSpeech) return;
    let text = "";
    if (stepName === "therapy_type") {
      text = userLanguage === "ur"
        ? "براہ کرم تھراپی کی مطلوبہ قسم منتخب کریں"
        : "Please select your therapy type from the options menu.";
    } else if (stepName === "slots") {
      text = userLanguage === "ur"
        ? `آپ نے ${detail || "تھراپی"} کا انتخاب کیا۔ اب دن اور ٹائم سلاٹ منتخب کریں۔`
        : `Selected: ${detail || "therapy"}. Please choose your day and time slot.`;
    } else if (stepName === "payment") {
      text = userLanguage === "ur"
        ? `آپ کا ٹائم سلاٹ ${detail || ""} منتخب ہو گیا۔ اب فیس شیڈول دیکھ کر سلپ منسلک کریں۔`
        : `Slot selected: ${detail || ""}. Please review the payment schedule and upload your slip.`;
    }
    if (text) {
      speakVocalResponse(text, userLanguage);
    }
  };

  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  // In-UI Toast Notification (replaces disruptive browser alert())
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);
  const toastTimerRef = useRef<any>(null);
  const showToast = (message: string, type: "error" | "info" = "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isRecording, activeBooking]);

  useEffect(() => {
    setAutoplayBlockedListener(setAutoplayBlocked);
    return () => {
      setAutoplayBlockedListener(null);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (speechRecognitionRef.current) speechRecognitionRef.current.abort();
      stopVocalResponse();
    };
  }, []);

  const handleToggleVoice = () => {
    unlockAudio();
    if (autoVocalSpeech) {
      stopVocalResponse();
      setIsSpeakingMessageId(null);
      setAutoVocalSpeech(false);
      localStorage.setItem("ayazullah_voice_speech_active", "false");
    } else {
      setAutoVocalSpeech(true);
      localStorage.setItem("ayazullah_voice_speech_active", "true");
      setAutoplayBlocked(false);
      const confirmPrompt = userLanguage === "ur"
        ? "ڈاکٹر ایاز اللہ وائس گائیڈ فعال ہے۔"
        : "Dr. Ayazullah Voice Guide is now active.";
      speakVocalResponse(confirmPrompt, userLanguage);
    }
  };

  // Update Welcome message when language changes
  const switchLanguage = (lang: "auto" | "en" | "ur" | "ps") => {
    setUserLanguage(lang);
    stopVocalResponse();
    setIsSpeakingMessageId(null);

    const feeStr = `Rs. ${consultationFee.toLocaleString()}`;
    const feeUrStr = `${consultationFee.toLocaleString()} روپے`;

    let greeting = "";
    if (lang === "ur") {
      greeting =
`**وعلیکم السلام! ڈاکٹر ایاز اللہ فزیوتھراپی کلینک میں خوش آمدید۔** 🩺
میں آپ کا سمارٹ وائس اسسٹنٹ ہوں۔ آپ مجھ سے بول کر یا لکھ کر اردو میں بات کر سکتے ہیں۔

میں آپ کی مدد کر سکتا ہوں:
• **بدھ کے دن یا کسی بھی دن تھراپی اپائنٹمنٹ بک کریں** (ابتدائی معائنہ فیس ${feeUrStr}، جاز کیش اور میزان بینک شیڈول)
• **اپنے اپائنٹمنٹ کا اسٹیٹس چیک کریں** اور آفیشل پی ڈی ایف سلپ ڈاؤن لوڈ کریں
• **کلینک کے اوقات، پتہ اور فیس کے بارے میں جانیں**`;
    } else {
      greeting =
`Welcome! I'm Dr. Ayaz Ullah, a dedicated physiotherapist committed to helping you achieve optimal health and wellness.

Do you suffer from:

- Stroke rehabilitation challenges
- Cervical pain (neck pain)
- Shoulder pain
- Lower back pain
- Sciatica
- Knee pain

Together, let's work towards alleviating your pain, restoring your mobility, and enhancing your quality of life.

Contact me today to schedule a consultation!`;
    }

    setMessages(prev => [
      ...prev,
      {
        id: `lang-switch-${Date.now()}`,
        role: "assistant",
        content: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionButtons: [
          { url: "/book-appointment", label: lang === "ur" ? "📅 اپائنٹمنٹ بک کریں" : lang === "ps" ? "📅 د ملاقات ثبت" : "📅 Book Appointment" },
          { url: "/manage-booking", label: lang === "ur" ? "🔍 اپائنٹمنٹ چیک کریں" : lang === "ps" ? "🔍 خپل ملاقات وګورئ" : "🔍 Check My Appointment" }
        ]
      }
    ]);

    if (autoVocalSpeech) {
      speakVocalResponse(greeting, lang);
    }
  };

  // Voice Recording via MediaRecorder + Groq Whisper Turbo
  const handleOpenVoiceModal = async (forcedLang?: "en" | "ur") => {
    unlockAudio();
    stopVocalResponse();
    setIsSpeakingMessageId(null);
    setMicPermissionError(null);
    setLiveTranscriptPreview("");
    setIsListeningModalOpen(true);
    setIsRecording(true);
    setRecordDuration(0);

    const activeLang = forcedLang || (userLanguage === "auto" ? "ur" : userLanguage as "en" | "ur");

    // Web Speech API for live preview
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = activeLang === "ur" ? "ur-PK" : "en-US";
        recognition.onresult = (event: any) => {
          let current = "";
          for (let i = 0; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          if (current) setLiveTranscriptPreview(current);
        };
        recognition.onerror = () => {};
        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (e) {}
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not supported.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/wav";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 800) {
          setIsRecording(false);
          setIsTranscribing(true);
          try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string).split(";base64,")[1];
              try {
                const storedGroqKey = typeof window !== "undefined" ? localStorage.getItem("groq_api_key") : "";
                const res = await fetch("/api/ai/transcribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    audioData: base64Audio, 
                    mimeType, 
                    language: activeLang,
                    groqApiKey: storedGroqKey || undefined
                  })
                });
                const data = await res.json();
                const finalText = (data.success && data.text) ? data.text.trim() : liveTranscriptPreview.trim();
                setIsListeningModalOpen(false);
                setIsTranscribing(false);
                if (finalText) handleSendMessage(finalText);
              } catch {
                setIsListeningModalOpen(false);
                setIsTranscribing(false);
                if (liveTranscriptPreview.trim()) handleSendMessage(liveTranscriptPreview.trim());
              }
            };
          } catch {
            setIsListeningModalOpen(false);
            setIsTranscribing(false);
          }
        } else if (liveTranscriptPreview.trim()) {
          setIsListeningModalOpen(false);
          setIsRecording(false);
          handleSendMessage(liveTranscriptPreview.trim());
        } else {
          setIsListeningModalOpen(false);
          setIsRecording(false);
        }
      };

      mediaRecorder.start(200);
      timerIntervalRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setIsListeningModalOpen(false);
      setIsRecording(false);
      setMicPermissionError("Microphone permission was not granted. Please allow microphone access in your browser.");
    }
  };

  const stopVoiceRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (speechRecognitionRef.current) { try { speechRecognitionRef.current.stop(); } catch (e) {} }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setIsRecording(false);
      setIsTranscribing(true);
      mediaRecorderRef.current.stop();
    } else {
      setIsListeningModalOpen(false);
      setIsRecording(false);
    }
  };

  const cancelVoiceRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (speechRecognitionRef.current) { try { speechRecognitionRef.current.abort(); } catch (e) {} }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    setIsListeningModalOpen(false);
    setIsRecording(false);
    setIsTranscribing(false);
    setMicPermissionError(null);
  };

  // User selects photo in the chat bar (prescription, MRI, slip, or symptom photo)
  const handleChatPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    unlockAudio();

    const previewUrl = URL.createObjectURL(file);
    setSelectedPhoto({ file, previewUrl });

    if (chatPhotoInputRef.current) chatPhotoInputRef.current.value = "";
  };

  // Main Message Send Handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if ((!text && !selectedPhoto) || isLoading) return;

    unlockAudio();
    setInputValue("");
    stopVocalResponse();
    setIsSpeakingMessageId(null);

    let uploadedImageUrl = "";
    let uploadedImageName = "";

    // If a photo was attached, upload it first
    if (selectedPhoto) {
      setIsUploadingChatPhoto(true);
      try {
        const reader = new FileReader();
        const readPromise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(selectedPhoto.file);
        const base64Content = await readPromise;

        const uploadRes = await fetch("/api/upload-slip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Data: base64Content,
            fileName: selectedPhoto.file.name
          })
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          uploadedImageUrl = uploadData.url;
          uploadedImageName = selectedPhoto.file.name;
          // Also link to active booking if open
          setActiveBooking(prev => prev ? {
            ...prev,
            receiptUrl: uploadData.url,
            receiptName: selectedPhoto.file.name
          } : null);
        }
      } catch (err) {
        console.warn("Notice uploading chat photo:", err);
      } finally {
        setIsUploadingChatPhoto(false);
        setSelectedPhoto(null);
      }
    }

    const displayText = text || (userLanguage === "ur" ? "تصویر منسلک ہے" : userLanguage === "ps" ? "عکس ضمیمه دی" : "Photo attached");

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: displayText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imageUrl: uploadedImageUrl || undefined,
      imageName: uploadedImageName || undefined
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    // Check if the user is asking to book therapy (e.g. "I want to book therapy", "تھراپی بک کرنی ہے")
    const bookingIntent: ParsedBookingIntent = parseBookingIntent(text);

    if (bookingIntent.isBookingIntent) {
      const hasName = Boolean((bookingIntent.patientName && bookingIntent.patientName.trim()) || activeBooking?.patientName);
      const hasPhone = Boolean((bookingIntent.patientPhone && bookingIntent.patientPhone.trim()) || activeBooking?.patientPhone);

      let targetStep: "name_phone" | "therapy_type" | "slots" | "payment" = "name_phone";
      if (hasName && hasPhone) {
        targetStep = "therapy_type";
      }

      setActiveBooking(prev => ({
        step: prev?.step && prev.step !== "name_phone" ? prev.step : targetStep,
        date: bookingIntent.targetDateStr || prev?.date || formatClinicalDate(getNextDateForDay(3)),
        time: bookingIntent.targetTime || prev?.time || "10:30 AM",
        category: bookingIntent.category || prev?.category || "Spine & Back Pain Relief",
        patientName: bookingIntent.patientName || prev?.patientName || "",
        patientPhone: bookingIntent.patientPhone || prev?.patientPhone || "",
        symptoms: bookingIntent.symptoms || prev?.symptoms || "Consultation requested via AI Voice Assistant",
        paymentMethod: prev?.paymentMethod || "JazzCash",
        transactionId: prev?.transactionId || "",
        receiptUrl: uploadedImageUrl || prev?.receiptUrl || "",
        receiptName: uploadedImageName || prev?.receiptName || "",
        isUploadingSlip: false,
        isSubmitting: false
      }));
    } else if (activeBooking) {
      // If booking menu is already open, check if user provided their phone or name in message
      const phoneMatch = text.match(/(?:03\d{9}|\+92\d{10})/);
      const nameMatch = text.match(/(?:my name is|i am|mera naam|naam|نوم|نام)\s+([a-zA-Z\u0600-\u06FF\s]{2,25})/i);

      if (phoneMatch || nameMatch) {
        setActiveBooking(prev => {
          if (!prev) return null;
          const updatedName = nameMatch ? nameMatch[1].trim() : prev.patientName;
          const updatedPhone = phoneMatch ? phoneMatch[0].trim() : prev.patientPhone;
          const nextStep = (prev.step === "name_phone" && updatedName && updatedPhone) ? "therapy_type" : prev.step;
          return {
            ...prev,
            patientName: updatedName,
            patientPhone: updatedPhone,
            step: nextStep
          };
        });
      }
    }

    const promptToSend = uploadedImageName
      ? `[Patient attached image: ${uploadedImageName} - URL: ${uploadedImageUrl}] ${text || "Please review this uploaded photo/document."}`
      : text;

    try {
      const storedGroqKey = typeof window !== "undefined" ? localStorage.getItem("groq_api_key") : "";
      const storedGeminiKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") : "";

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...updatedMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: promptToSend }
          ],
          userLanguage: userLanguage,
          consultationFee: consultationFee,
          servicesList: dynamicTherapyOptions,
          groqApiKey: storedGroqKey || undefined,
          geminiApiKey: storedGeminiKey || undefined
        })
      });

      const data = await res.json();

      if (data.success && data.reply) {
        const assistantMsgId = `assistant-${Date.now()}`;
        const assistantMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionUrl: data.actionUrl,
          actionLabel: data.actionLabel
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Auto-play vocal response if enabled
        if (autoVocalSpeech) {
          setIsSpeakingMessageId(assistantMsgId);
          speakVocalResponse(data.reply, userLanguage, () => {
            setIsSpeakingMessageId(null);
          });
        }
      } else {
        throw new Error(data.error || "No reply from assistant");
      }
    } catch (err: any) {
      console.error("Chatbot response error:", err);
      const fallbackId = `err-${Date.now()}`;
      const fallbackMsg = userLanguage === "ur"
        ? "میں معذرت خواہ ہوں۔ براہ کرم دوبارہ کوشش کریں یا /manage-booking پر اپنا اپائنٹمنٹ چیک کریں، یا ہمیں +92 332 9895770 پر کال کریں۔"
        : userLanguage === "ps"
        ? "زه بښنه غواړم، د شبکې ستونزه راغله. تاسو کولی شئ په /manage-booking کې خپل ملاقات وګورئ یا اړیکه ونیسئ."
        : "I apologize, I encountered a temporary connection issue. You can manage your appointment at /manage-booking or contact us at +92 332 9895770.";

      setMessages((prev) => [
        ...prev,
        {
          id: fallbackId,
          role: "assistant",
          content: fallbackMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionUrl: "/manage-booking",
          actionLabel: "🔍 Go to Manage Booking"
        }
      ]);

      if (autoVocalSpeech) {
        setIsSpeakingMessageId(fallbackId);
        speakVocalResponse(fallbackMsg, userLanguage, () => {
          setIsSpeakingMessageId(null);
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Upload Payment Transfer Slip
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBooking) return;

    unlockAudio();
    setActiveBooking(prev => prev ? { ...prev, isUploadingSlip: true } : null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Content = reader.result as string;
        const uploadRes = await fetch("/api/upload-slip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Data: base64Content,
            fileName: file.name
          })
        });

        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          setActiveBooking(prev => prev ? {
            ...prev,
            receiptUrl: uploadData.url,
            receiptName: file.name,
            isUploadingSlip: false
          } : null);

          // Add visual and vocal notification in chat
          const noticeId = `receipt-upload-${Date.now()}`;
          const noticeContent = userLanguage === "ur"
            ? `📸 **پیمنٹ سلپ کی تصویر کامیابی سے منسلک ہو گئی ہے۔**\nفائل: \`${file.name}\`\nہماری کلینیکل ٹیم نے آپ کی رسید ریکارڈ کر لی ہے۔ برائے کرم اپنے فون نمبر کی تصدیق کر کے بکنگ مکمل کریں۔`
            : userLanguage === "ps"
            ? `📸 **ستاسو د پرچۍ عکس ترلاسه شو.**\nفایل: \`${file.name}\`\nمهرباني وکړئ د اړیکې شمېره وګورئ او ملاقات تایید کړئ.`
            : `📸 **Payment Slip Photo Attached!**\nFile: \`${file.name}\`\nReceipt recorded. Please verify your contact number and confirm your booking.`;

          setMessages(prev => [
            ...prev,
            {
              id: noticeId,
              role: "assistant",
              content: noticeContent,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              imageUrl: uploadData.url,
              imageName: file.name
            }
          ]);

          // Immediate vocal response: NEVER SILENT!
          if (autoVocalSpeech) {
            setIsSpeakingMessageId(noticeId);
            const vocalSpeech = userLanguage === "ur"
              ? "آپ کی پیمنٹ سلپ کی تصویر موصول ہو گئی ہے۔ برائے کرم بکنگ کی تصدیق کریں۔"
              : userLanguage === "ps"
              ? "ستاسو د پرچۍ عکس ترلاسه شو. مهرباني وکړئ ملاقات تایید کړئ."
              : "Payment slip photo attached successfully. Please confirm your booking.";
            speakVocalResponse(vocalSpeech, userLanguage, () => {
              setIsSpeakingMessageId(null);
            });
          }
        } else {
          showToast("Failed to upload receipt slip. You can enter your transaction ID directly.");
          setActiveBooking(prev => prev ? { ...prev, isUploadingSlip: false } : null);
        }
      };
    } catch (err) {
      console.error("File upload error:", err);
      setActiveBooking(prev => prev ? { ...prev, isUploadingSlip: false } : null);
    }
  };

  // Submit and Confirm Booking from In-Chat Card
  const handleConfirmBooking = async () => {
    if (!activeBooking) return;
    if (!activeBooking.patientPhone.trim()) {
      showToast("Please provide your WhatsApp or phone number to confirm the booking.");
      return;
    }

    setActiveBooking(prev => prev ? { ...prev, isSubmitting: true } : null);

    try {
      const randomRef = Math.floor(100000 + Math.random() * 900000);
      const generatedTx = activeBooking.transactionId.trim()
        ? activeBooking.transactionId.trim().toUpperCase()
        : `AX-${randomRef}`;

      const appointmentPayload = {
        patientName: activeBooking.patientName.trim() || "Valued Patient",
        patientPhone: activeBooking.patientPhone.trim(),
        patientEmail: "",
        patientAge: "Adult",
        symptomDuration: "Reported via AI Voice Assistant",
        painLevel: 5,
        symptomsDesc: activeBooking.symptoms || "Booked via Dr. Ayazullah Voice AI Assistant",
        date: activeBooking.date,
        time: activeBooking.time,
        category: activeBooking.category,
        mode: "In-Clinic Consultation",
        fee: "Rs. 5,000",
        paymentMethod: activeBooking.paymentMethod,
        transactionId: generatedTx,
        receiptName: activeBooking.receiptName || "",
        receiptUrl: activeBooking.receiptUrl || "",
        status: "Pending",
        bookedVia: "Dr. Ayazullah AI Assistant",
        timestamp: new Date().toISOString()
      };

      // 1. Sync to backend API
      const apiRes = await fetch("/api/ai/quick-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointmentPayload)
      });
      const apiData = await apiRes.json();

      // 2. Direct Firestore Write for immediate clinic sync
      try {
        const appointmentDocRef = doc(collection(db, "appointments"));
        await setDoc(appointmentDocRef, {
          ...appointmentPayload,
          id: appointmentDocRef.id
        });
      } catch (firestoreErr) {
        console.warn("Direct Firestore booking notice:", firestoreErr);
      }

      const confirmedData = {
        id: apiData.id || `apt-${Date.now()}`,
        transactionId: generatedTx,
        patientName: appointmentPayload.patientName,
        patientPhone: appointmentPayload.patientPhone,
        date: appointmentPayload.date,
        time: appointmentPayload.time,
        category: appointmentPayload.category,
        fee: appointmentPayload.fee,
        receiptUrl: appointmentPayload.receiptUrl,
        receiptName: appointmentPayload.receiptName,
        status: "Pending"
      };

      // Create assistant confirmation message
      const confirmMsgContent = userLanguage === "ur"
        ? `🎉 **مبارک ہو! آپ کا اپائنٹمنٹ کامیابی سے محفوظ ہو گیا ہے۔**\n\n• **مریض کا نام:** ${confirmedData.patientName}\n• **تاریخ و وقت:** ${confirmedData.date}، بوقت ${confirmedData.time}\n• **ریفرنس آئی ڈی:** ${confirmedData.transactionId}\n• **حیثیت:** تصدیق کے لیے زیرِ جائزہ (Pending)\n\nآپ نیچے دیے گئے بٹن سے اپنی آفیشل پی ڈی ایف سلپ ڈاؤن لوڈ کر سکتے ہیں اور اپنے اپائنٹمنٹ کی صورتحال دیکھ سکتے ہیں۔`
        : userLanguage === "ps"
        ? `🎉 **ډېر مبارک! ستاسو ملاقات په بریالیتوب سره ثبت شو۔**\n\n• **ناروغ:** ${confirmedData.patientName}\n• **نېټه او وخت:** ${confirmedData.date}، ${confirmedData.time}\n• **حواله شمېره:** ${confirmedData.transactionId}\n• **حالت:** په جریان کې (Pending)\n\nتاسو کولی شئ لاندې خپله رسمي پی ډي ایف پرچی کښته کړئ.`
        : `🎉 **Appointment Successfully Reserved!**\n\n• **Patient:** ${confirmedData.patientName}\n• **Date & Time:** ${confirmedData.date} at ${confirmedData.time}\n• **Reference ID:** ${confirmedData.transactionId}\n• **Status:** Pending Clinical Verification\n\nYou can download your official PDF appointment slip below and track your booking anytime on /manage-booking.`;

      const confirmMsgId = `confirm-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          id: confirmMsgId,
          role: "assistant",
          content: confirmMsgContent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionUrl: "/manage-booking",
          actionLabel: "🔍 Manage / Track Booking",
          confirmedBooking: confirmedData
        }
      ]);

      // Close the in-chat booking draft
      setActiveBooking(null);

      // Vocalize confirmation
      if (autoVocalSpeech) {
        setIsSpeakingMessageId(confirmMsgId);
        speakVocalResponse(confirmMsgContent, userLanguage, () => {
          setIsSpeakingMessageId(null);
        });
      }
    } catch (err: any) {
      console.error("Confirm booking error:", err);
      showToast("Failed to finalize booking. Please try again or book directly at /book-appointment.");
      setActiveBooking(prev => prev ? { ...prev, isSubmitting: false } : null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(id);
    setTimeout(() => setCopiedAccount(null), 2500);
  };

  const toggleSpeakMessage = (msgId: string, text: string) => {
    if (isSpeakingMessageId === msgId) {
      stopVocalResponse();
      setIsSpeakingMessageId(null);
    } else {
      stopVocalResponse();
      setIsSpeakingMessageId(msgId);
      speakVocalResponse(text, userLanguage, () => {
        setIsSpeakingMessageId(null);
      });
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">



        <button
          onClick={() => {
            if (isOpen) {
              stopVocalResponse();
              setIsSpeakingMessageId(null);
            }
            setIsOpen(!isOpen);
          }}
          className={clsx(
            "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 relative group",
            isOpen
              ? "bg-slate-800 text-white hover:bg-slate-900"
              : "bg-emerald-700 text-white hover:bg-emerald-800 hover:scale-105"
          )}
          aria-label="Toggle Voice AI Assistant"
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <>
              <Mic className="w-6 h-6" />
              {/* Pulsing indicator */}
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
              </span>
            </>
          )}
        </button>
      </div>

      {/* Main Chatbot Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[94vw] sm:w-[460px] max-h-[calc(100vh-120px)] h-[680px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">

          {/* In-UI Toast Notification — replaces disruptive browser alert() */}
          {toast && (
            <div
              className={`absolute top-3 left-3 right-3 z-50 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl shadow-lg text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
                toast.type === "error"
                  ? "bg-red-50 border border-red-200 text-red-800"
                  : "bg-blue-50 border border-blue-200 text-blue-800"
              }`}
            >
              <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${toast.type === "error" ? "text-red-500" : "text-blue-500"}`} />
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="p-3.5 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  className="w-10 h-10 rounded-full object-cover border-2 border-emerald-300/40"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjNrkckK_zXuUXx8S-AFBI9OFqx533QeOk8MKiPbo-WM-fME6rlCOeU4AaWFk4RtAufObV1eScvG7_dsRcp5242lqSM_0F9bl7IaZEtYjHZ75WRtlnPE6p4IWRESefH7TFA4f7PP0T_Bql-GR1zcqyWnpk0FcCUROy2eMXPYmzssXyjb-7z3r72gYWY_9caomXqFxExvpoqKzlRukPWa7ldbXw7SwMG7KvbUo4FhyUDfhukbBwh5Wc"
                  alt="Dr. Ayazullah AI"
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white"></span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tracking-tight">Dr. Ayazullah AI Guide</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">
                    Gemini 3.8 Live Extended Thinking
                  </span>
                </div>
                <span className="text-[11px] text-emerald-100 flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  Urdu • Pashto • English Enabled
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Vocal TTS Toggle */}
              <button
                onClick={handleToggleVoice}
                title={autoVocalSpeech ? "Neural Voice is ON (click to mute)" : "Neural Voice is OFF (click to turn on)"}
                className={clsx(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all text-sm cursor-pointer",
                  autoVocalSpeech 
                    ? "bg-white/25 text-white ring-1 ring-white/50 shadow-xs" 
                    : "text-emerald-200 hover:bg-white/10 opacity-70"
                )}
              >
                {autoVocalSpeech ? <Volume2 className="w-4 h-4 text-emerald-200" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Close */}
              <button
                onClick={() => {
                  stopVocalResponse();
                  setIsSpeakingMessageId(null);
                  setIsOpen(false);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-200 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium text-[11px] flex items-center gap-1">
              <span>🌐</span> Language / زبان:
            </span>
            <div className="flex items-center gap-1">
              {[
                { id: "auto", label: "Auto" },
                { id: "ur", label: "🇵🇰 اردو" },
                { id: "en", label: "🇬🇧 English" }
              ].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => switchLanguage(lang.id as any)}
                  className={clsx(
                    "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                    userLanguage === lang.id
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "bg-slate-200/80 text-slate-700 hover:bg-slate-300"
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Speaking Indicator */}
          {isSpeakingMessageId && (
            <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in">
              <div className="flex items-center gap-2 font-medium">
                <div className="flex items-center gap-0.5 h-3">
                  <span className="w-1 bg-emerald-600 rounded-full animate-pulse h-2"></span>
                  <span className="w-1 bg-emerald-600 rounded-full animate-bounce h-3"></span>
                  <span className="w-1 bg-emerald-600 rounded-full animate-pulse h-2.5"></span>
                  <span className="w-1 bg-emerald-600 rounded-full animate-bounce h-1.5"></span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800">
                  AI Voice Speaking ({userLanguage === 'ur' ? 'اردو آواز' : 'English'})...
                </span>
              </div>
              <button
                onClick={() => {
                  stopVocalResponse();
                  setIsSpeakingMessageId(null);
                }}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>Stop</span>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Autoplay Blocked Notice (1-tap unmute) */}
          {autoplayBlocked && (
            <div
              onClick={() => {
                unlockAudio();
                setAutoplayBlocked(false);
                const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
                if (lastAssistant) {
                  toggleSpeakMessage(lastAssistant.id, lastAssistant.content);
                }
              }}
              className="px-3 py-2 bg-amber-500 text-white flex items-center justify-between text-xs cursor-pointer hover:bg-amber-600 transition-colors shrink-0"
            >
              <div className="flex items-center gap-2 font-medium">
                <VolumeX className="w-4 h-4 shrink-0" />
                <span>
                  {userLanguage === "ur"
                    ? "براؤزر نے آواز میوٹ کی ہے۔ بولنے کے لیے یہاں ٹیپ کریں۔"
                    : "Browser paused voice. Tap here to unmute."}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/20 font-bold text-[11px] shrink-0">Tap to Unmute</span>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 p-3.5 overflow-y-auto flex flex-col gap-3 bg-slate-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "flex flex-col max-w-[90%] gap-1.5",
                  m.role === "user" ? "self-end items-end" : "self-start items-start"
                )}
              >
                <div
                  className={clsx(
                    "p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap relative shadow-xs",
                    m.role === "user"
                      ? "bg-emerald-700 text-white rounded-br-none"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                  )}
                >
                  {m.content}

                  {/* Attached Photo Display */}
                  {m.imageUrl && (
                    <div className="mt-2.5 rounded-xl overflow-hidden border border-emerald-200/80 bg-slate-900/5">
                      <img 
                        src={m.imageUrl} 
                        alt={m.imageName || "Attached document or slip"} 
                        className="max-h-48 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => window.open(m.imageUrl, "_blank")}
                      />
                      {m.imageName && (
                        <div className="px-2.5 py-1 text-[10px] bg-slate-100/90 text-slate-700 flex items-center justify-between">
                          <span className="truncate max-w-[200px]">{m.imageName}</span>
                          <span className="text-emerald-700 font-bold">Uploaded Photo</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attached Action Link Buttons */}
                  {(m.actionButtons || m.actionUrl) && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      {m.actionButtons ? (
                        m.actionButtons.map((btn, idx) => (
                          <Link
                            key={idx}
                            to={btn.url}
                            onClick={() => setIsOpen(false)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors border border-emerald-200/60 shadow-xs"
                          >
                            <span>{btn.label}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        ))
                      ) : (
                        <Link
                          to={m.actionUrl!}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors border border-emerald-200/60 shadow-xs"
                        >
                          <span>{m.actionLabel || "Open Page"}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Confirmed Booking Badge & Download PDF */}
                  {m.confirmedBooking && (
                    <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-900 text-xs flex flex-col gap-2">
                      <div className="flex items-center justify-between font-bold border-b border-emerald-200/60 pb-2">
                        <span className="flex items-center gap-1 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Officially Booked
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">
                          {m.confirmedBooking.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div>
                          <span className="text-slate-500">Patient:</span>
                          <p className="font-bold">{m.confirmedBooking.patientName}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Contact:</span>
                          <p className="font-bold">{m.confirmedBooking.patientPhone}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Date &amp; Time:</span>
                          <p className="font-bold">{m.confirmedBooking.date} • {m.confirmedBooking.time}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Ref ID:</span>
                          <p className="font-mono font-bold text-emerald-700">{m.confirmedBooking.transactionId}</p>
                        </div>
                      </div>

                      {/* Download PDF Button */}
                      <button
                        onClick={() => {
                          generateAppointmentPDF({
                            patientName: m.confirmedBooking!.patientName,
                            patientPhone: m.confirmedBooking!.patientPhone,
                            date: m.confirmedBooking!.date,
                            time: m.confirmedBooking!.time,
                            category: m.confirmedBooking!.category,
                            fee: 5000,
                            transactionId: m.confirmedBooking!.transactionId,
                            paymentMethod: "JazzCash / Bank Transfer"
                          });
                        }}
                        className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Download Official PDF Slip
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer bar with Speak Voice Button */}
                <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                  <span>{m.timestamp}</span>
                  {m.role === "assistant" && (
                    <button
                      onClick={() => toggleSpeakMessage(m.id, m.content)}
                      className={clsx(
                        "flex items-center gap-1 hover:text-emerald-700 transition-colors cursor-pointer",
                        isSpeakingMessageId === m.id && "text-emerald-700 font-bold animate-pulse"
                      )}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{isSpeakingMessageId === m.id ? "Stop Voice" : "Listen / سنیں"}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Interactive Clinical Booking Menu (Multi-Step: Name & Contact -> Therapy Options -> Slots Detail -> Payment) */}
            {activeBooking && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-white border-2 border-emerald-600/90 shadow-lg text-xs flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
                {/* Header with Title and Step Status */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                      <Stethoscope className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span>
                          {userLanguage === "ur" ? "تھراپی اپائنٹمنٹ مینو" : userLanguage === "ps" ? "د درملنې ملاقات مینو" : "Therapy Booking Menu"}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {activeBooking.step === "name_phone" && "Step 1/4: Name & Phone"}
                          {activeBooking.step === "therapy_type" && "Step 2/4: Therapy Type"}
                          {activeBooking.step === "slots" && "Step 3/4: Select Slot"}
                          {activeBooking.step === "payment" && "Step 4/4: Payment & Slip"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {activeBooking.step === "name_phone" && (userLanguage === "ur" ? "اپنا نام اور موبائل نمبر درج کریں" : userLanguage === "ps" ? "خپل نوم او د اړیکې شمېره ولیکئ" : "Enter your full name & contact number")}
                        {activeBooking.step === "therapy_type" && (userLanguage === "ur" ? "مطلوبہ تھراپی کی قسم منتخب کریں" : userLanguage === "ps" ? "د درملنې مطلوب ډول وټاکئ" : "Select your required therapy type")}
                        {activeBooking.step === "slots" && (userLanguage === "ur" ? "دن اور وقت کا سلاٹ منتخب کریں" : userLanguage === "ps" ? "د ملاقات ورځ او وخت وټاکئ" : "Select clinic day & time slot")}
                        {activeBooking.step === "payment" && (userLanguage === "ur" ? "فیس کی ادائیگی اور رسید منسلک کریں" : userLanguage === "ps" ? "د فیس رسید ضمیمه کړئ" : "Review payment schedule & attach slip")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveBooking(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                    title="Dismiss booking menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Step Tabs Navigation */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl text-[10px] font-bold">
                  {[
                    { id: "name_phone", label: "1. Info", full: "1. Patient Info" },
                    { id: "therapy_type", label: "2. Therapy", full: "2. Therapy Type" },
                    { id: "slots", label: "3. Slots", full: "3. Slot Detail" },
                    { id: "payment", label: "4. Pay", full: "4. Payment & Slip" }
                  ].map((tab) => {
                    const isActive = activeBooking.step === tab.id;
                    const isPassed = 
                      (tab.id === "name_phone" && (activeBooking.patientName || activeBooking.patientPhone)) ||
                      (tab.id === "therapy_type" && activeBooking.category) ||
                      (tab.id === "slots" && activeBooking.time);

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          unlockAudio();
                          setActiveBooking(prev => prev ? { ...prev, step: tab.id as any } : null);
                        }}
                        className={clsx(
                          "py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer truncate",
                          isActive
                            ? "bg-emerald-700 text-white shadow-xs"
                            : isPassed
                            ? "bg-white text-emerald-800 hover:bg-emerald-50"
                            : "text-slate-500 hover:bg-white/60"
                        )}
                      >
                        {tab.label} {isPassed && !isActive ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>

                {/* STEP 1: PATIENT NAME & NUMBER */}
                {activeBooking.step === "name_phone" && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-100 text-[11px] text-emerald-900">
                      <p className="font-semibold">
                        {userLanguage === "ur" 
                          ? "👤 برائے کرم اپنا مکمل نام اور واٹس ایپ نمبر درج فرمائیں تاکہ اپائنٹمنٹ محفوظ کیا جا سکے:"
                          : userLanguage === "ps"
                          ? "👤 مهرباني وکړئ خپل بشپړ نوم او د واټس‌اپ شمېره ولیکئ:"
                          : "👤 Please provide your Full Name and WhatsApp Contact Number to register your appointment:"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                          Full Name (مکمل نام) *
                        </label>
                        <div className="relative">
                          <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            value={activeBooking.patientName}
                            onChange={(e) => setActiveBooking(prev => prev ? { ...prev, patientName: e.target.value } : null)}
                            placeholder="e.g. Tariq Khan"
                            className="w-full h-8.5 pl-8 pr-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-medium"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                          WhatsApp / Mobile Number (موبائل نمبر) *
                        </label>
                        <div className="relative">
                          <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            value={activeBooking.patientPhone}
                            onChange={(e) => setActiveBooking(prev => prev ? { ...prev, patientPhone: e.target.value } : null)}
                            placeholder="0332 9895770"
                            className="w-full h-8.5 pl-8 pr-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-mono font-medium"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          unlockAudio();
                          setActiveBooking(prev => prev ? { ...prev, step: "therapy_type" } : null);
                          playStepVoicePrompt("therapy_type");
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <span>{userLanguage === "ur" ? "اگلا مرحلہ: تھراپی کا انتخاب کریں" : userLanguage === "ps" ? "بل ګام: د درملنې انتخاب" : "Next: Choose Therapy Type"}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: WHICH TYPE OF THERAPY (OPTIONS MENU) */}
                {activeBooking.step === "therapy_type" && (
                  <div className="space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[11px] text-slate-700">
                      <span className="font-bold flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-emerald-600" />
                        {userLanguage === "ur" ? "تھراپی کی قسم منتخب کریں:" : userLanguage === "ps" ? "د درملنې مطلوب ډول وټاکئ:" : "Select Type of Therapy:"}
                      </span>
                      <span className="text-[10px] text-slate-400">Click any option to select</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1 no-scrollbar">
                      {dynamicTherapyOptions.map((opt) => {
                        const isSelected = activeBooking.category === opt.title;
                        const localizedTitle = userLanguage === "ur" ? opt.titleUr : userLanguage === "ps" ? opt.titlePs : opt.title;
                        const localizedDesc = userLanguage === "ur" ? opt.descUr : userLanguage === "ps" ? opt.descPs : opt.desc;

                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              setActiveBooking(prev => prev ? { 
                                ...prev, 
                                category: opt.title,
                                step: "slots" 
                              } : null);
                              playStepVoicePrompt("slots", localizedTitle);
                            }}
                            className={clsx(
                              "p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer relative",
                              isSelected
                                ? "bg-emerald-50/90 border-emerald-600 ring-2 ring-emerald-600/30 shadow-xs"
                                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-base">{opt.icon}</span>
                              <span className={clsx(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                isSelected ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"
                              )}>
                                {isSelected ? "✓ Selected" : opt.badge}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs text-slate-900 leading-tight">
                              {localizedTitle}
                            </h4>
                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                              {localizedDesc}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveBooking(prev => prev ? { ...prev, step: "name_phone" } : null)}
                        className="py-1.5 px-3 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                      >
                        ← Back to Info
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          unlockAudio();
                          setActiveBooking(prev => prev ? { ...prev, step: "slots" } : null);
                          playStepVoicePrompt("slots");
                        }}
                        className="py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <span>Next: Select Slot</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: DETAIL OF SLOTS (DAY & TIME SELECTION) */}
                {activeBooking.step === "slots" && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{userLanguage === "ur" ? "دن کا انتخاب کریں:" : userLanguage === "ps" ? "ورځ وټاکئ:" : "Select Clinic Day:"}</span>
                        <span className="ml-auto font-normal text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                          {activeBooking.date}
                        </span>
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {CLINIC_DAYS.map((day) => {
                          const isWednesday = day.dayIndex === 3;
                          const dayDate = formatClinicalDate(getNextDateForDay(day.dayIndex));
                          const isSelectedDay = activeBooking.date.includes(day.dayName);

                          return (
                            <button
                              key={day.dayName}
                              type="button"
                              onClick={() => {
                                unlockAudio();
                                setActiveBooking(prev => prev ? { ...prev, date: dayDate } : null);
                              }}
                              className={clsx(
                                "py-1.5 px-2 rounded-lg text-[11px] font-bold text-center border transition-all cursor-pointer flex flex-col items-center",
                                isSelectedDay
                                  ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                                  : isWednesday
                                  ? "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
                                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                              )}
                            >
                              <span>{userLanguage === "ur" ? day.dayNameUr : userLanguage === "ps" ? day.dayNamePs : day.dayName}</span>
                              {isWednesday && (
                                <span className={clsx("text-[8px] font-semibold", isSelectedDay ? "text-emerald-100" : "text-emerald-700")}>
                                  Featured
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{userLanguage === "ur" ? "ٹائم سلاٹ کی تفصیل (Detail of Slots):" : userLanguage === "ps" ? "د وخت سلاټ وټاکئ:" : "Detail of Slots (Select Time):"}</span>
                        <span className="ml-auto font-normal text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                          Selected: {activeBooking.time}
                        </span>
                      </label>

                      <div className="space-y-2">
                        {TIME_SLOTS_BY_PERIOD.map((periodGroup) => {
                          const periodLabel = userLanguage === "ur" 
                            ? periodGroup.labelUr 
                            : userLanguage === "ps" 
                            ? periodGroup.labelPs 
                            : periodGroup.labelEn;

                          return (
                            <div key={periodGroup.period} className="space-y-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                {periodLabel}
                              </span>
                              <div className="grid grid-cols-3 gap-1.5">
                                {periodGroup.slots.map((slot) => {
                                  const isSelectedSlot = activeBooking.time === slot;

                                  return (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => {
                                        unlockAudio();
                                        setActiveBooking(prev => prev ? { 
                                          ...prev, 
                                          time: slot,
                                          step: "payment"
                                        } : null);
                                        playStepVoicePrompt("payment", `${activeBooking.date} at ${slot}`);
                                      }}
                                      className={clsx(
                                        "py-1.5 px-2 rounded-lg text-[11px] font-bold text-center border transition-all cursor-pointer flex items-center justify-center gap-1",
                                        isSelectedSlot
                                          ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                                          : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
                                      )}
                                    >
                                      <span>{slot}</span>
                                      {isSelectedSlot && <Check className="w-3 h-3 text-white" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveBooking(prev => prev ? { ...prev, step: "therapy_type" } : null)}
                        className="py-1.5 px-3 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                      >
                        ← Change Therapy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          unlockAudio();
                          setActiveBooking(prev => prev ? { ...prev, step: "payment" } : null);
                          playStepVoicePrompt("payment", `${activeBooking.date} at ${activeBooking.time}`);
                        }}
                        className="py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <span>Next: Payment Schedule</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: PAYMENT SCHEDULE & SLIP UPLOAD */}
                {activeBooking.step === "payment" && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Booking Review Summary Card */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between font-bold border-b border-slate-200/60 pb-1 text-slate-700">
                        <span>Appointment Summary</span>
                        <button
                          type="button"
                          onClick={() => setActiveBooking(prev => prev ? { ...prev, step: "name_phone" } : null)}
                          className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer"
                        >
                          Edit Details
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Patient Name:</span>
                          <span className="font-bold text-slate-900">{activeBooking.patientName || "Valued Patient"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Contact:</span>
                          <span className="font-mono font-bold text-slate-900">{activeBooking.patientPhone || "Not provided"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Therapy Service:</span>
                          <span className="font-bold text-emerald-900">{activeBooking.category}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Scheduled Slot:</span>
                          <span className="font-bold text-emerald-900">{activeBooking.date} • {activeBooking.time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Consultation Fee & Payment Accounts */}
                    <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-800">Clinical Consultation Fee:</span>
                        <span className="text-emerald-700 text-sm font-extrabold">Rs. {consultationFee.toLocaleString()}</span>
                      </div>

                      <p className="text-[10px] text-slate-600">
                        Transfer Rs. {consultationFee.toLocaleString()} to any official clinic account below and upload receipt or transaction ID:
                      </p>

                      <div className="flex flex-col gap-1.5">
                        {CLINIC_PAYMENT_ACCOUNTS.map((acc) => (
                          <div
                            key={acc.name}
                            className="p-2 rounded-lg bg-white border border-emerald-100 flex items-center justify-between text-[11px]"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                {acc.name} <span className="text-[9px] text-emerald-600 font-normal">({acc.title})</span>
                              </span>
                              <span className="font-mono text-xs font-bold text-emerald-800">{acc.account}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(acc.account, acc.name)}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors cursor-pointer"
                            >
                              {copiedAccount === acc.name ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedAccount === acc.name ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Slip Upload & TID Input */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Payment Slip or Transaction ID:</span>
                      </label>

                      {/* Hidden File Input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                      />

                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            unlockAudio();
                            fileInputRef.current?.click();
                          }}
                          disabled={activeBooking.isUploadingSlip}
                          className={clsx(
                            "w-full py-2.5 px-3 rounded-lg border border-dashed text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer",
                            activeBooking.receiptUrl
                              ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                              : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <Camera className="w-4 h-4 text-emerald-600" />
                          <span>
                            {activeBooking.isUploadingSlip
                              ? "Uploading slip photo..."
                              : activeBooking.receiptName
                              ? `✓ Photo: ${activeBooking.receiptName.slice(0, 18)}...`
                              : "📸 Upload Payment Slip / Screenshot"}
                          </span>
                        </button>

                        {/* Uploaded Slip Thumbnail Preview */}
                        {activeBooking.receiptUrl && (
                          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px]">
                            <img 
                              src={activeBooking.receiptUrl} 
                              alt="Uploaded receipt" 
                              className="w-10 h-10 object-cover rounded-md border border-emerald-300 shrink-0" 
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-emerald-900 truncate">{activeBooking.receiptName || "payment_slip.jpg"}</p>
                              <p className="text-[10px] text-emerald-700 flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600" /> Photo attached &amp; vocalized
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveBooking(prev => prev ? { ...prev, receiptUrl: "", receiptName: "" } : null)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              title="Remove attached photo"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={activeBooking.transactionId}
                          onChange={(e) => setActiveBooking(prev => prev ? { ...prev, transactionId: e.target.value } : null)}
                          placeholder="OR Enter TID / Ref (e.g. AX-829104)"
                          className="flex-1 h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-mono"
                        />
                      </div>
                    </div>

                    {/* Confirm and Submit Button */}
                    <button
                      type="button"
                      onClick={handleConfirmBooking}
                      disabled={activeBooking.isSubmitting || !activeBooking.patientPhone.trim()}
                      className={clsx(
                        "w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs",
                        activeBooking.patientPhone.trim() && !activeBooking.isSubmitting
                          ? "bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      {activeBooking.isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Confirming Clinical Booking...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm &amp; Book My Appointment</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="self-start flex items-center gap-2 p-3 rounded-2xl bg-white border border-slate-200 text-slate-500 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
                <span>Thinking with Groq Llama 3.3 (Urdu & English)...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { label: "❓ Recommend therapy for my symptoms", prompt: "I am having pain. Can you recommend which therapy is best for me?" },
              { label: "🇵🇰 مجھے کون سی تھراپی کروانی چاہیے؟", prompt: "میری کمر میں شدید درد ہے اور مجھ سے چلا نہیں جا رہا، مجھے بتائیں کہ مجھے کون سی تھراپی کروانی چاہیے؟" },
              { label: "🩺 Book therapy", prompt: "I want to book therapy" },
              { label: "📅 Wednesday Therapy", prompt: "I want to book my therapy on Wednesday" },
              { label: "🔍 Check My Booking", prompt: "How do I check my appointment status and download my slip?" },
              { label: "📍 Location & Fee", prompt: "Where is the clinic located in Islamabad and what is the fee?" }
            ].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(chip.prompt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 transition-colors shrink-0 shadow-2xs"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Voice Listening Modal / Audio Overlay */}
          {isListeningModalOpen && (
            <div className="p-4 bg-emerald-900 text-white border-t border-emerald-700 flex flex-col gap-3 animate-in slide-in-from-bottom-5 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
                  <span className="text-xs font-bold tracking-wide">
                    {isTranscribing 
                      ? "Processing with Groq Whisper..." 
                      : `Listening (${recordDuration}s) — Speak Now`}
                  </span>
                </div>
                <button
                  onClick={cancelVoiceRecording}
                  className="text-emerald-200 hover:text-white text-xs p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic Transcript Preview */}
              <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs min-h-[44px] flex items-center">
                {liveTranscriptPreview ? (
                  <p className="text-emerald-100 italic">"{liveTranscriptPreview}"</p>
                ) : (
                  <p className="text-emerald-300/70 text-[11px]">
                    You can speak: "Book my therapy on Wednesday" or "بدھ کو میرا اپائنٹمنٹ بک کریں" or "د شورو په ورځ ملاقات"...
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-200">Dialect:</span>
                {[
                  { id: "ur", label: "🇵🇰 بولیں (اردو)" },
                  { id: "en", label: "🇬🇧 English" }
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setUserLanguage(d.id as any);
                      handleOpenVoiceModal(d.id as any);
                    }}
                    className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-bold transition-colors",
                      userLanguage === d.id
                        ? "bg-white text-emerald-900 shadow-xs"
                        : "bg-emerald-800 text-emerald-200 hover:bg-emerald-700"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Permission notice if mic denied */}
              {micPermissionError && (
                <div className="p-2 rounded-lg bg-red-900/60 border border-red-700 text-[11px] text-red-200 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <p className="font-bold">Microphone Access Required</p>
                    <p className="text-[10px]">{micPermissionError}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={stopVoiceRecording}
                  disabled={isTranscribing}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Done / Stop &amp; Send</span>
                </button>
                <button
                  onClick={cancelVoiceRecording}
                  className="py-2 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Photo Preview Chip above Input Bar */}
          {selectedPhoto && (
            <div className="px-3 pt-2 pb-1 bg-emerald-50/90 border-t border-emerald-200 flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <img 
                  src={selectedPhoto.previewUrl} 
                  alt="Selected photo preview" 
                  className="w-9 h-9 object-cover rounded-lg border border-emerald-400 shrink-0" 
                />
                <div className="min-w-0">
                  <p className="font-bold text-emerald-950 text-[11px] truncate max-w-[200px]">
                    {selectedPhoto.file.name}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-medium">
                    Photo attached • Press send to upload &amp; analyze
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                title="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            {/* Microphone Button */}
            <button
              onClick={() => handleOpenVoiceModal()}
              disabled={isListeningModalOpen || isTranscribing}
              title="Speak via Microphone (OpenAI Whisper on Groq)"
              className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-2xs",
                isListeningModalOpen
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
              )}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Photo / Camera Button */}
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                chatPhotoInputRef.current?.click();
              }}
              title="Attach photo of payment slip, MRI, or prescription"
              className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-2xs",
                selectedPhoto
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Hidden Photo Input */}
            <input
              ref={chatPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleChatPhotoSelect}
            />

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                selectedPhoto
                  ? "Add note for this photo or press send..."
                  : userLanguage === "ur"
                  ? "بدھ کو تھراپی بک کریں یا سوال پوچھیں..."
                  : userLanguage === "ps"
                  ? "د شورو په ورځ ملاقات یا خپله پوښتنه ولیکئ..."
                  : "Type 'Book therapy on Wednesday' or ask a question..."
              }
              className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-600 text-xs sm:text-sm text-slate-800 transition-colors"
            />

            {/* Send Button */}
            <button
              onClick={() => handleSendMessage()}
              disabled={(!inputValue.trim() && !selectedPhoto) || isLoading || isUploadingChatPhoto}
              className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 shadow-xs",
                (inputValue.trim() || selectedPhoto) && !isLoading && !isUploadingChatPhoto
                  ? "bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </>
  );
}
