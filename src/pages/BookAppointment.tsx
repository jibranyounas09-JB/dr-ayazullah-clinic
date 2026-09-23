import React, { useState, useRef, useMemo, useEffect } from "react";
import { clsx } from "clsx";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { getDayAvailability } from "../lib/scheduleUtils";
import { generateAppointmentPDF } from "../lib/pdfGenerator";
import { PaymentMethodConfig, DEFAULT_PAYMENT_METHODS } from "../types/payment";

export default function BookAppointment() {
  const [currentCategory, setCurrentCategory] = useState("");
  const [currentFee, setCurrentFee] = useState("");
  const [currentMode, setCurrentMode] = useState("In-Clinic (Pakland Plaza G-8)");
  const [duration, setDuration] = useState("Acute (< 2 Weeks)");
  const [painLevel, setPainLevel] = useState(5);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [symptomsDesc, setSymptomsDesc] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [categories, setCategories] = useState<any[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<any>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [generalSettings, setGeneralSettings] = useState<any>({});
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(DEFAULT_PAYMENT_METHODS);
  const [selectedMethodId, setSelectedMethodId] = useState<string>(DEFAULT_PAYMENT_METHODS[0]?.id || "");

  useEffect(() => {
    const fetchSettingsAndServices = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "general"));
        let consultFee = "PKR 3,000";

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setGeneralSettings(data);

          if (data.consultationFee) {
            consultFee = typeof data.consultationFee === "number" 
              ? `PKR ${data.consultationFee.toLocaleString()}` 
              : String(data.consultationFee);
          }

          let methods: PaymentMethodConfig[] = data.paymentMethods;
          if (!methods || !Array.isArray(methods) || methods.length === 0) {
            methods = DEFAULT_PAYMENT_METHODS;
          }
          const activeMethods = methods.filter(m => m.isActive !== false);
          setPaymentMethods(activeMethods);
          if (activeMethods.length > 0) {
            setSelectedMethodId(activeMethods[0].id);
            setPaymentMethod(activeMethods[0].name);
          }
        }

        const servicesSnap = await getDocs(collection(db, "services"));
        const servicesList = servicesSnap.docs.map((d, i) => {
          const data = d.data();
          const colors = ["secondary", "tertiary", "surface-variant", "primary-fixed", "secondary-fixed"];
          const rawPrice = data.price;
          const formattedFee = typeof rawPrice === 'number' ? `PKR ${rawPrice.toLocaleString()}` : (rawPrice || "PKR 5,000");

          return {
            title: data.title,
            name: data.title,
            fee: formattedFee,
            icon: data.icon || "healing",
            color: colors[i % colors.length],
            desc: data.description,
            order: data.order || 0
          };
        }).sort((a, b) => a.order - b.order);

        const consultationCategory = {
          title: "Initial Consultation & Diagnostic Assessment",
          name: "Initial Consultation & Diagnostic Assessment",
          fee: consultFee,
          icon: "stethoscope",
          color: "primary",
          desc: "Comprehensive 1-on-1 diagnostic examination & musculoskeletal triage by Dr. Ayazullah.",
          order: -1
        };

        const allCategories = [consultationCategory, ...servicesList];
        setCategories(allCategories);
        if (allCategories.length > 0) {
          setCurrentCategory(allCategories[0].name);
          setCurrentFee(allCategories[0].fee);
        }

        const scheduleSnap = await getDoc(doc(db, "settings", "schedule"));
        if (scheduleSnap.exists()) {
          setScheduleConfig(scheduleSnap.data());
        }
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchSettingsAndServices();
  }, []);

  const calendarDays = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      
      const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
      const dateNum = d.getDate().toString();
      const full = `${dayShort}, ${monthShort} ${dateNum}`;
      
      dates.push({ day: dayShort.toUpperCase(), date: dateNum, full, isSunday: false, dateObj: d });
    }
    return dates;
  }, []);

  const initialDate = calendarDays[0]?.full || "";
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [currentTime, setCurrentTime] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("+92 ");
  const [paymentMethod, setPaymentMethod] = useState("Easypaisa");
  const [transactionId, setTransactionId] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!currentDate) return;

    const selectedDateObj = calendarDays.find(d => d.full === currentDate)?.dateObj || new Date();
    const isoDateKey = selectedDateObj.toISOString().split('T')[0];
    const formattedLabel = selectedDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const formattedWithYear = selectedDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    // Real-time snapshot listener on appointments
    const q = collection(db, "appointments");
    const unsubscribe = onSnapshot(q, (snap) => {
      const booked = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(apt => {
          // EXCLUDE Cancelled and Refunded appointments so the slot becomes free immediately!
          const status = (apt.status || '').toLowerCase().trim();
          const isCancelled = (
            status === 'cancelled' ||
            status === 'canceled' ||
            status === 'refund requested' ||
            status === 'refunded' ||
            status.includes('cancel') ||
            status.includes('refund')
          );
          if (isCancelled) return false;

          const aptDate = (apt.date || '').trim();
          return (
            aptDate === currentDate.trim() ||
            aptDate === isoDateKey ||
            aptDate === formattedLabel ||
            aptDate === formattedWithYear ||
            (aptDate && aptDate.toLowerCase() === currentDate.trim().toLowerCase())
          );
        })
        .map(apt => apt.time as string)
        .filter(Boolean);

      setBookedSlots(booked);
    }, (error) => {
      console.error("Error listening to appointments:", error);
      setBookedSlots([]);
    });

    setCurrentTime(""); // Reset selected time when date changes
    return () => unsubscribe();
  }, [currentDate, calendarDays]);

  const currentMonthYear = useMemo(() => {
     const selectedDateObj = calendarDays.find(d => d.full === currentDate)?.dateObj || new Date();
     return selectedDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentDate, calendarDays]);

  const currentDateAvailability = useMemo(() => {
    const selectedDateObj = calendarDays.find(d => d.full === currentDate)?.dateObj || new Date();
    return getDayAvailability(selectedDateObj, scheduleConfig);
  }, [currentDate, calendarDays, scheduleConfig]);

  const getSlotDisplay = (time: string) => {
    const isBooked = bookedSlots.includes(time);
    return {
      time,
      status: isBooked ? 'Booked' : 'Available',
      color: isBooked ? 'text-on-surface-variant' : 'text-primary',
      disabled: isBooked
    };
  };

  const scheduleData = useMemo(() => {
    const data: Record<string, { morning: any[], afternoon: any[], morningName: string, afternoonName: string, isDayOff: boolean, reason?: string }> = {};
    
    calendarDays.forEach((day) => {
      const avail = getDayAvailability(day.dateObj, scheduleConfig);
      data[day.full] = {
        isDayOff: avail.isDayOff,
        reason: avail.reason,
        morningName: avail.morningName,
        afternoonName: avail.afternoonName,
        morning: avail.morningSlots.map(getSlotDisplay),
        afternoon: avail.afternoonSlots.map(getSlotDisplay)
      };
    });
    return data;
  }, [calendarDays, scheduleConfig, bookedSlots]);

  const handlePainBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(10, Math.min(100, (clickX / rect.width) * 100));
    setPainLevel(Math.round(pct / 10));
  };

  const getPainLevelText = () => {
    if (painLevel <= 3) return { text: `Level ${painLevel} — Mild / Intermittent Stiffness`, color: "text-primary" };
    if (painLevel <= 7) return { text: `Level ${painLevel} — Moderate / Functional Limitation`, color: "text-secondary" };
    return { text: `Level ${painLevel} — Severe / Acute Inflammation`, color: "text-tertiary" };
  };

  if (isLoadingData) {
    return (
      <div className="flex min-h-[60vh] bg-surface-container-lowest items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="font-label-md text-on-surface-variant">Loading clinical schedules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen overflow-x-hidden">
      <div className="relative w-full overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-fixed/20 rounded-full blur-3xl pointer-events-none -z-10"></div>
        <div className="absolute top-64 left-10 w-80 h-80 bg-secondary-fixed/25 rounded-full blur-3xl pointer-events-none -z-10"></div>

        <section className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop pt-space-xl pb-space-lg">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-lg">
            <div className="flex flex-col max-w-2xl">
              <div className="flex items-center gap-space-xs mb-space-xs">
                <span className="inline-flex items-center gap-1.5 px-space-xs py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm uppercase tracking-wider font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Live Clinical Intake
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Pakland Plaza • 1st Floor, Office #12, G-8 Markaz</span>
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
                Patient Care Gateway: Book Your Assessment &amp; Therapy Session
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-xs leading-relaxed">
                Evidence-based physiotherapy triaging, direct musculoskeletal examination by Dr. Ayazullah, and customized physical restoration regimens tailored to restore functional movement.
              </p>
            </div>
            <div className="flex flex-wrap lg:flex-col gap-space-xs bg-surface-container-lowest p-space-md rounded-xl shadow-[0_4px_24px_-2px_rgba(13,105,71,0.06)] w-full lg:w-72">
              <div className="flex items-center gap-space-xs text-on-surface">
                <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
                <span className="font-label-md text-label-md">IFOMPT Aligned Practice</span>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface">
                <span className="material-symbols-outlined text-secondary text-[20px]">vital_signs</span>
                <span className="font-label-md text-label-md">1-on-1 Detailed Assessment (45m)</span>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface">
                <span className="material-symbols-outlined text-tertiary-container text-[20px]">schedule</span>
                <span className="font-label-md text-label-md">Zero Hallway Delay Guarantee</span>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop pb-space-3xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
            <div className="lg:col-span-8 flex flex-col gap-space-2xl">
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold">1</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Select Therapy Discipline</h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Step 1 of 3</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  {categories.map((cat, i) => (
                    <div key={i} 
                         className={clsx("cursor-pointer p-space-md rounded-xl transition-all duration-200 shadow-[0_4px_16px_rgba(0,0,0,0.02)] relative group", 
                            currentCategory === cat.name ? "bg-surface-container-lowest ring-2 ring-primary selected-category" : "bg-surface-container-lowest hover:bg-surface-container-low"
                         )}
                         onClick={() => { setCurrentCategory(cat.name); setCurrentFee(cat.fee); }}>
                      <div className="flex items-start gap-space-sm">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-${cat.color}/20 text-${cat.color}`}>
                          <span className="material-symbols-outlined text-[24px]">{cat.icon}</span>
                        </div>
                        <div className="flex flex-col w-full">
                          <span className="font-headline-sm text-headline-sm text-on-surface">{cat.title}</span>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{cat.desc}</p>
                          <div className="mt-space-xs flex items-center justify-between">
                            <span className="font-label-sm text-label-sm font-semibold text-primary">{cat.fee}</span>
                            <span className={clsx("material-symbols-outlined text-[18px]", currentCategory === cat.name ? "text-primary" : "text-outline opacity-0")}>check_circle</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold">2</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Select Date &amp; Time Slot</h2>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider bg-surface-container-low px-space-xs py-1 rounded-md">{currentMonthYear}</span>
                    <span className="font-label-sm text-label-sm text-primary font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">event_available</span>
                      Real-Time Schedule
                    </span>
                  </div>
                </div>
                
                <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-x-auto">
                  <div className="flex items-center justify-between gap-space-xs min-w-[580px]">
                    {calendarDays.map((d) => {
                      const avail = getDayAvailability(d.dateObj, scheduleConfig);
                      const isSelected = currentDate === d.full;
                      const isDayOff = avail.isDayOff;

                      return (
                        <button key={d.dateObj.toISOString()} onClick={() => setCurrentDate(d.full)}
                          className={clsx("flex-1 flex flex-col items-center py-space-sm px-space-xs rounded-xl transition-all cursor-pointer", 
                          isSelected ? (isDayOff ? "bg-error/15 text-error shadow-sm ring-2 ring-error/30" : "bg-primary text-on-primary shadow-sm ring-1 ring-primary-container") : 
                          isDayOff ? "text-error bg-error/5 hover:bg-error/10" : "text-on-surface-variant hover:bg-surface-container-low"
                          )}>
                          <span className="font-label-sm text-label-sm uppercase font-bold tracking-widest opacity-90">{d.day}</span>
                          <span className="font-display-md-mobile text-display-md-mobile font-bold mt-1 mb-0.5">{d.date}</span>
                          <span className={clsx("font-label-sm text-[12px] font-semibold", isDayOff ? "text-error" : (isSelected ? "opacity-90" : "text-primary"))}>
                            {isDayOff ? "Day Off" : "Available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {currentDateAvailability.isDayOff ? (
                  <div className="bg-error/5 border border-error/20 rounded-2xl p-6 sm:p-8 text-center flex flex-col items-center gap-3 animate-in fade-in my-2">
                    <div className="w-12 h-12 rounded-2xl bg-error/15 text-error flex items-center justify-center">
                      <span className="material-symbols-outlined text-[28px]">event_busy</span>
                    </div>
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-error/10 text-error text-[11px] font-bold uppercase tracking-wider">
                        Clinic Closed / Day Off
                      </span>
                      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-2">
                        No Appointments Scheduled on {currentDate}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mt-1.5">
                        {currentDateAvailability.reason || "The clinic is closed on this date. Doctor is not taking appointments."}
                      </p>
                    </div>
                    <div className="px-3 py-1.5 bg-surface rounded-lg border border-surface-container text-xs text-primary font-semibold flex items-center gap-1.5 mt-1">
                      <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                      <span>Please choose an open date from the calendar above to view available time slots.</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-space-md mt-space-xs">
                    <div className="flex flex-col gap-space-xs">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-primary text-[18px]">wb_sunny</span>
                        <span className="font-label-lg text-label-lg font-semibold text-on-surface">
                          {scheduleData[currentDate]?.morningName || scheduleConfig?.morningName || "Morning Clinical Evaluation"}
                        </span>
                      </div>
                      {scheduleData[currentDate]?.morning?.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-xs">
                          {scheduleData[currentDate]?.morning?.map(slot => (
                            <button key={slot.time} onClick={() => !slot.disabled && setCurrentTime(slot.time)}
                              disabled={slot.disabled}
                              className={clsx("py-space-xs px-space-sm rounded-lg text-center font-label-md text-label-md transition-all flex flex-col items-center cursor-pointer", 
                              slot.disabled ? "bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed" :
                              currentTime === slot.time ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface")}>
                              <span className={clsx("font-semibold", slot.disabled ? "line-through" : "")}>{slot.time}</span>
                              <span className={clsx("text-[10px] mt-0.5", currentTime === slot.time ? "opacity-90" : slot.color)}>
                                {currentTime === slot.time ? 'Selected' : slot.status}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant italic py-2">No morning slots scheduled for this date.</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-space-xs">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-secondary text-[18px]">routine</span>
                        <span className="font-label-lg text-label-lg font-semibold text-on-surface">
                          {scheduleData[currentDate]?.afternoonName || scheduleConfig?.afternoonName || "Afternoon & Evening Sessions"}
                        </span>
                      </div>
                      {scheduleData[currentDate]?.afternoon?.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-xs">
                          {scheduleData[currentDate]?.afternoon?.map(slot => (
                            <button key={slot.time} onClick={() => !slot.disabled && setCurrentTime(slot.time)}
                              disabled={slot.disabled}
                              className={clsx("py-space-xs px-space-sm rounded-lg text-center font-label-md text-label-md transition-all flex flex-col items-center cursor-pointer", 
                              slot.disabled ? "bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed" :
                              currentTime === slot.time ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface")}>
                              <span className={clsx("font-semibold", slot.disabled ? "line-through" : "")}>{slot.time}</span>
                              <span className={clsx("text-[10px] mt-0.5", currentTime === slot.time ? "opacity-90" : slot.color)}>
                                {currentTime === slot.time ? 'Selected' : slot.status}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant italic py-2">No afternoon/evening slots scheduled for this date.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold">3</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Patient Details &amp; Symptoms Intake</h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Confidential Medical EHR</span>
                </div>

                <div className="p-space-sm bg-surface-container-lowest rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-primary text-[24px]">apartment</span>
                    <div>
                      <div className="font-label-lg text-label-lg text-on-surface font-semibold">Consultation Mode</div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Select in-person clinic visit or secure video tele-triage</p>
                    </div>
                  </div>
                  <div className="flex items-center bg-surface-container p-1 rounded-full w-full md:w-auto">
                    <button onClick={() => setCurrentMode("In-Clinic (Pakland Plaza G-8)")} className={clsx("flex-1 md:flex-none px-space-sm py-1 rounded-full font-label-md text-label-md transition-all", currentMode.includes("In-Clinic") ? "bg-primary text-on-primary font-semibold" : "text-on-surface hover:text-primary")}>
                      In-Clinic
                    </button>
                    <button onClick={() => setCurrentMode("Tele-Rehab Video Session")} className={clsx("flex-1 md:flex-none px-space-sm py-1 rounded-full font-label-md text-label-md transition-all", !currentMode.includes("In-Clinic") ? "bg-primary text-on-primary font-semibold" : "text-on-surface hover:text-primary")}>
                      Tele-Rehab Video
                    </button>
                  </div>
                </div>

                <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.02)] flex flex-col gap-space-md">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="fullName">Patient Full Legal Name *</label>
                      <input className="w-full h-12 px-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="fullName" placeholder="e.g., Tariq Mehmood" type="text" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="phoneWhatsApp">WhatsApp / Mobile Number *</label>
                      <input className="w-full h-12 px-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="phoneWhatsApp" placeholder="+92 300 0000000" type="tel" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="emailAddress">Email Address (Optional)</label>
                      <input className="w-full h-12 px-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="emailAddress" placeholder="patient@example.com" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="patientAge">Age (Years) *</label>
                      <input className="w-full h-12 px-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="patientAge" placeholder="e.g., 42" type="number" value={patientAge} onChange={(e) => setPatientAge(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="font-label-md text-label-md text-on-surface font-semibold">Symptom Duration</label>
                      <div className="flex items-center gap-space-xs pt-1 overflow-x-auto no-scrollbar">
                        {["Acute (< 2 Weeks)", "Subacute (2–6 Wks)", "Chronic (6+ Mos)"].map((d) => (
                          <button key={d} type="button" onClick={() => setDuration(d)}
                            className={clsx("px-space-xs py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap shrink-0", duration === d ? "bg-primary-fixed text-on-primary-fixed font-semibold" : "bg-surface-container text-on-surface font-medium")}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-space-xs pt-space-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-label-md text-label-md text-on-surface font-semibold">Subjective Discomfort Level (0 – 10)</label>
                      <span className={clsx("font-label-sm text-label-sm font-bold", getPainLevelText().color)}>{getPainLevelText().text}</span>
                    </div>
                    <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden relative cursor-pointer" onClick={handlePainBarClick}>
                      <div className="h-full bg-gradient-to-r from-primary via-secondary to-tertiary rounded-full transition-all duration-300 pointer-events-none" style={{ width: `${painLevel * 10}%` }}></div>
                    </div>
                    <div className="flex justify-between font-label-sm text-[11px] text-on-surface-variant">
                      <span>0 (No Pain)</span>
                      <span>5 (Interferes)</span>
                      <span>10 (Severe)</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="symptomsDesc">Primary Symptoms / Doctor's Notes (Optional)</label>
                    <textarea className="w-full p-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="symptomsDesc" placeholder="Briefly describe what sparks your pain..." rows={3} value={symptomsDesc} onChange={(e) => setSymptomsDesc(e.target.value)}></textarea>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-semibold">Attach Diagnostic Scans (MRI, CT or X-Ray PDF / Images)</label>
                    <div className="flex flex-col items-center justify-center p-space-md rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer text-center relative group">
                      <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setFileName(`Attached: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
                      }} />
                      <span className="material-symbols-outlined text-primary text-[32px] mb-1">upload_file</span>
                      <span className="font-label-md text-label-md font-semibold text-on-surface">{fileName || "Click to upload diagnostic scan or drag & drop"}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">PDF, JPEG, DICOM or PNG (Max 25MB)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DYNAMIC PRE-PAYMENT SECTION */}
              <div className="flex flex-col gap-space-md mt-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold">4</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Pre-Payment Verification</h2>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Secure Transfer</span>
                </div>

                <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.02)] flex flex-col gap-space-md">
                  {/* Dynamic Method Tab Buttons */}
                  <div className="flex flex-wrap gap-space-sm border-b border-surface-container pb-space-sm">
                     {paymentMethods.map((m) => {
                       const isSelected = selectedMethodId === m.id || paymentMethod === m.name;
                       let icon = "account_balance_wallet";
                       if (m.type === "bank") icon = "account_balance";
                       else if (m.type === "raast") icon = "qr_code_2";
                       else if (m.type === "qr") icon = "qr_code_scanner";

                       return (
                         <button
                           key={m.id}
                           type="button"
                           onClick={() => {
                             setSelectedMethodId(m.id);
                             setPaymentMethod(m.name);
                           }}
                           className={clsx(
                             "flex-1 min-w-[130px] py-3 px-4 rounded-lg font-label-md border-2 transition-all cursor-pointer",
                             isSelected ? 'border-primary bg-primary/5 text-primary shadow-xs' : 'border-surface-container text-on-surface-variant hover:border-outline-variant'
                           )}
                         >
                            <div className="flex items-center gap-2 justify-center">
                               <span className="material-symbols-outlined text-[20px]">{icon}</span>
                               <span className="font-bold">{m.name}</span>
                            </div>
                         </button>
                       );
                     })}
                  </div>

                  {/* Active Payment Account Details */}
                  {(() => {
                     const currentMethod = paymentMethods.find(m => m.id === selectedMethodId || m.name === paymentMethod) || paymentMethods[0];
                     if (!currentMethod) return null;

                     return (
                       <div className="bg-surface-container p-space-sm rounded-lg flex flex-col md:flex-row gap-4 font-body-sm text-on-surface items-start">
                         <div className="flex flex-col gap-1.5 w-full flex-1">
                           <div className="flex items-center justify-between">
                             <span className="font-bold text-label-md text-primary">{currentMethod.name} Account Details</span>
                             {currentMethod.bankName && (
                               <span className="text-xs bg-surface-container-high px-2 py-0.5 rounded font-semibold text-on-surface-variant">
                                 {currentMethod.bankName}
                               </span>
                             )}
                           </div>

                           {currentMethod.accountTitle && (
                             <div className="flex items-center gap-2">
                               <span className="text-on-surface-variant text-xs font-semibold">Account Title:</span>
                               <strong className="text-on-surface">{currentMethod.accountTitle}</strong>
                             </div>
                           )}

                           {currentMethod.accountNumber && (
                             <div className="flex items-center gap-2">
                               <span className="text-on-surface-variant text-xs font-semibold">Account / Mobile / ID:</span>
                               <strong className="text-primary text-base tracking-wider font-mono">{currentMethod.accountNumber}</strong>
                             </div>
                           )}

                           {currentMethod.iban && (
                             <div className="flex items-center gap-2">
                               <span className="text-on-surface-variant text-xs font-semibold">IBAN:</span>
                               <strong className="text-primary text-xs tracking-wider font-mono break-all">{currentMethod.iban}</strong>
                             </div>
                           )}

                           <p className="text-on-surface-variant mt-1.5 text-[12px] bg-surface-container-low p-2.5 rounded border border-surface-container">
                             {currentMethod.instructions || `Please transfer ${currentFee} to the account above to secure your slot.`}
                           </p>
                         </div>

                         {currentMethod.qrImageUrl && (
                           <div className="w-36 h-36 shrink-0 bg-white p-2 rounded-xl shadow-sm border border-surface-container-high flex flex-col items-center justify-center gap-1">
                             <img src={currentMethod.qrImageUrl} alt={`${currentMethod.name} QR Code`} className="w-full h-28 object-contain" />
                             <span className="text-[10px] text-on-surface-variant font-semibold uppercase">Scan to Pay</span>
                           </div>
                         )}
                       </div>
                     );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">
                     <div className="flex flex-col gap-1.5">
                       <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="txId">Transaction ID / Reference No. *</label>
                       <input className="w-full h-12 px-space-sm rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md focus:outline-none focus:ring-2 focus:ring-primary transition-all" id="txId" placeholder="e.g., 123456789012" type="text" value={transactionId} onChange={(e) => { setTransactionId(e.target.value); setFormError(""); }} />
                     </div>
                     <div className="flex flex-col gap-1.5">
                       <label className="font-label-md text-label-md text-on-surface font-semibold">Upload Script of Transfer (Receipt) *</label>
                       <div className="flex items-center justify-center h-12 px-space-sm rounded-lg bg-surface-container-low border border-dashed border-outline-variant hover:border-primary transition-colors cursor-pointer relative">
                         <input className="absolute inset-0 opacity-0 cursor-pointer w-full" type="file" accept="image/*,.pdf" onChange={(e) => {
                           const file = e.target.files?.[0];
                           if (file) { setReceiptName(file.name); setFormError(""); }
                         }} />
                         <span className="material-symbols-outlined text-primary mr-2 text-[20px]">receipt_long</span>
                         <span className="font-body-md text-on-surface-variant truncate pr-4">{receiptName || "Click to attach receipt image"}</span>
                       </div>
                     </div>
                  </div>

                </div>
              </div>

            </div>

            <div className="lg:col-span-4 flex flex-col gap-space-lg lg:sticky lg:top-24">
              <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col gap-space-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed/30 rounded-bl-full pointer-events-none"></div>
                <div className="flex items-center justify-between pb-space-xs">
                  <span className="font-headline-sm text-headline-sm text-on-surface">Appointment Ticket</span>
                  <span className="px-space-xs py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold">Confirmed Triage</span>
                </div>
                
                <div className="flex items-center gap-space-sm p-space-sm rounded-lg bg-surface-container-low">
                  <img className="w-14 h-14 rounded-full object-cover shrink-0" alt="Doctor" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjNrkckK_zXuUXx8S-AFBI9OFqx533QeOk8MKiPbo-WM-fME6rlCOeU4AaWFk4RtAufObV1eScvG7_dsRcp5242lqSM_0F9bl7IaZEtYjHZ75WRtlnPE6p4IWRESefH7TFA4f7PP0T_Bql-GR1zcqyWnpk0FcCUROy2eMXPYmzssXyjb-7z3r72gYWY_9caomXqFxExvpoqKzlRukPWa7ldbXw7SwMG7KvbUo4FhyUDfhukbBwh5Wc"/>
                  <div className="flex flex-col">
                    <span className="font-label-lg text-label-lg font-bold text-on-surface">Dr. Ayazullah</span>
                    <span className="font-label-sm text-label-sm text-primary font-medium">Senior Physical Therapist</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">MS-OMPT • IFOMPT Fellow</span>
                  </div>
                </div>

                <div className="flex flex-col gap-space-xs font-body-sm text-body-sm">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface-variant">Clinical Program:</span>
                    <span className="font-semibold text-on-surface text-right">{currentCategory}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface-variant">Date:</span>
                    <span className="font-semibold text-on-surface">{currentDate}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface-variant">Slot:</span>
                    <span className="font-semibold text-on-surface">{currentTime}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface-variant">Format:</span>
                    <span className="font-semibold text-primary">{currentMode}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface-variant">Duration:</span>
                    <span className="font-semibold text-on-surface">45 Minutes Diagnostic</span>
                  </div>
                </div>

                <div className="pt-space-xs flex flex-col gap-space-xxs bg-surface-container-low p-space-sm rounded-lg">
                  <div className="flex items-center justify-between font-label-md text-label-md text-on-surface-variant">
                    <span>Assessment &amp; Treatment</span>
                    <span>{currentFee}</span>
                  </div>
                  <div className="flex items-center justify-between font-label-md text-label-md text-on-surface-variant">
                    <span>Payment Method</span>
                    <span className="text-primary font-semibold">{paymentMethod}</span>
                  </div>
                  <div className="flex items-center justify-between font-headline-sm text-headline-sm text-on-surface pt-space-xs font-bold">
                    <span>Total Pre-Paid:</span>
                    <span className="text-primary">{currentFee}</span>
                  </div>
                </div>

                {formError && (
                  <div className="bg-error/10 text-error p-3 rounded-lg flex items-start gap-2 font-body-sm text-[13px]">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{formError}</span>
                  </div>
                )}

                <button 
                  disabled={isSubmitting}
                  onClick={async () => {
                  if (currentDateAvailability.isDayOff) {
                    setFormError(`The clinic is closed on ${currentDate} (${currentDateAvailability.reason || "Day Off"}). Please select an available date.`);
                    return;
                  }
                  if (!currentTime) {
                    setFormError("Please select an available time slot before confirming.");
                    return;
                  }
                  if (bookedSlots.includes(currentTime)) {
                    setFormError("This time slot was just booked by another person. Please choose another available slot.");
                    return;
                  }
                  if (!patientName.trim() || !patientPhone.trim()) {
                    setFormError("Please provide your Name and WhatsApp/Mobile number.");
                    return;
                  }
                  if (!transactionId.trim() || !receiptName) {
                    setFormError("Please provide your Transaction ID and upload the transfer receipt.");
                    return;
                  }
                  setFormError("");
                  setIsSubmitting(true);
                  
                  try {
                    // Double-check: ensure slot is not occupied by an ACTIVE (non-cancelled) appointment
                    const checkDateObj = calendarDays.find(d => d.full === currentDate)?.dateObj || new Date();
                    const checkIsoKey = checkDateObj.toISOString().split('T')[0];
                    const checkLabel = checkDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                    const existingSnap = await getDocs(
                      query(collection(db, 'appointments'), where('time', '==', currentTime))
                    );

                    const isConflict = existingSnap.docs.some((d) => {
                      const data = d.data();
                      const status = (data.status || '').toLowerCase().trim();
                      const isCancelled = (
                        status === 'cancelled' ||
                        status === 'canceled' ||
                        status === 'refund requested' ||
                        status === 'refunded' ||
                        status.includes('cancel') ||
                        status.includes('refund')
                      );
                      if (isCancelled) return false;

                      const aptDate = (data.date || '').trim();
                      return (
                        aptDate === currentDate.trim() ||
                        aptDate === checkIsoKey ||
                        aptDate === checkLabel ||
                        (aptDate && aptDate.toLowerCase() === currentDate.trim().toLowerCase())
                      );
                    });

                    if (isConflict) {
                      setFormError("This time slot was just booked by another person. Please choose another available slot.");
                      setIsSubmitting(false);
                      return;
                    }

                    const newAppointment = {
                      patientName: patientName.trim(),
                      patientPhone: patientPhone.trim(),
                      patientEmail: patientEmail ? patientEmail.trim() : "",
                      patientAge,
                      symptomDuration: duration,
                      painLevel,
                      symptomsDesc,
                      date: currentDate,
                      time: currentTime,
                      category: currentCategory,
                      mode: currentMode,
                      fee: currentFee,
                      paymentMethod,
                      transactionId: transactionId.trim(),
                      status: 'Pending',
                      timestamp: new Date().toISOString()
                    };
                    
                    const docRef = doc(collection(db, 'appointments'));
                    const appointmentWithId = {
                      ...newAppointment,
                      id: docRef.id,
                      receiptName: receiptName || ""
                    };
                    await setDoc(docRef, appointmentWithId);
                    
                    if (patientEmail) {
                      try {
                        await fetch('/api/send-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            to: patientEmail,
                            subject: 'Therapy Booking Request Received',
                            type: 'BOOKING_REQUEST',
                            data: appointmentWithId
                          })
                        });
                      } catch (err) {
                        console.error('Failed to send booking email', err);
                      }
                    }
                    
                    setIsModalOpen(true);
                  } catch (error) {
                    handleFirestoreError(error, OperationType.CREATE, 'appointments');
                    setFormError("Failed to book appointment. Please try again.");
                  } finally {
                    setIsSubmitting(false);
                  }
                }} className={clsx("w-full h-12 rounded-full font-label-lg text-label-lg font-bold shadow-md transition-all flex items-center justify-center gap-space-xs", isSubmitting ? "bg-surface-container text-on-surface-variant cursor-not-allowed" : "bg-primary hover:bg-primary-container text-on-primary hover:scale-[1.01] active:scale-[0.99]")} type="button">
                  <span>{isSubmitting ? "Locking Slot..." : "Confirm & Lock Appointment"}</span>
                  {!isSubmitting && <span className="material-symbols-outlined text-[18px]">lock</span>}
                </button>
                <p className="font-label-sm text-[11px] text-center text-on-surface-variant">
                  Your appointment slot is secured once the transfer script is verified by our triage desk.
                </p>
              </div>

              <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col gap-space-sm">
                <div className="flex items-center gap-space-xs text-on-surface">
                  <span className="material-symbols-outlined text-secondary text-[20px]">checklist</span>
                  <span className="font-headline-sm text-headline-sm">What to Prepare &amp; Bring</span>
                </div>
                <ul className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">check</span>
                    <span>Wear loose athletic clothing allowing examination of your spine, shoulders or knee joint.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">check</span>
                    <span>Bring physical hard copies of your MRI films or operative discharge summary if available.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">check</span>
                    <span>Arrive 10 minutes ahead of scheduled time for initial blood pressure &amp; pain vitals triage.</span>
                  </li>
                </ul>
              </div>

              <div className="p-space-sm rounded-xl bg-surface-container-high/40 flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[20px]">call</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Immediate Assistance</span>
                    <span className="font-body-sm text-[12px] text-on-surface-variant">Duty Nurse Desk</span>
                  </div>
                </div>
                <a className="px-space-xs py-1 rounded-full bg-surface-container-lowest hover:bg-surface-container text-primary font-label-sm text-label-sm font-bold shadow-sm transition-colors" href="tel:+923001234567">
                  Call Desk
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full bg-surface-container-lowest py-space-2xl">
          <div className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop">
            <div className="flex flex-col md:flex-row items-center justify-between gap-space-lg">
              <div className="flex flex-col max-w-xl">
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1">Seamless Patient Experience</span>
                <h3 className="font-headline-lg text-headline-lg text-on-surface">Automated Clinical Notifications</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
                  Upon booking submission, our clinical dispatch system instantly synchronizes your appointment across messaging channels and calendar devices.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md w-full md:w-auto">
                <div className="flex flex-col items-center text-center p-space-md rounded-xl bg-surface-container-low">
                  <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center mb-space-xs shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">sms</span>
                  </div>
                  <span className="font-label-lg text-label-lg text-on-surface font-semibold">Instant SMS</span>
                  <span className="font-body-sm text-[12px] text-on-surface-variant mt-0.5">Reference token sent to phone</span>
                </div>
                <div className="flex flex-col items-center text-center p-space-md rounded-xl bg-surface-container-low">
                  <div className="w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center mb-space-xs shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">chat</span>
                  </div>
                  <span className="font-label-lg text-label-lg text-on-surface font-semibold">WhatsApp Alert</span>
                  <span className="font-body-sm text-[12px] text-on-surface-variant mt-0.5">2-hr prior clinic directions</span>
                </div>
                <div className="flex flex-col items-center text-center p-space-md rounded-xl bg-surface-container-low">
                  <div className="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center mb-space-xs shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">event</span>
                  </div>
                  <span className="font-label-lg text-label-lg text-on-surface font-semibold">1-Click Sync</span>
                  <span className="font-body-sm text-[12px] text-on-surface-variant mt-0.5">Google Cal &amp; Apple iCal link</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop py-space-2xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div className="relative rounded-xl overflow-hidden group shadow-sm">
              <img className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-500" alt="Clinic Suite" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBT4fDIq3en1m1poo3hsm8gzLbfG7SxY3n25W1Iu6tue00KccvM583NkI0L7v_xc7REAT4Wkhbt99jX7Po9ItSXFJz1KQrKvdZ4aSweLQOleFSdqu1WC7fO8K2MSo5LRaW_c63SRDXaQ7o1A7jGYQlpLYK2_RpXQfXwvryzuE0F8SaXUuGVA3R4ZQOCdVJ4vU1cpgRC8Fkp54uy5yjGoWc3VHEhH7ImgNwN6ZSlGYRA9TkkGo8D3VFO"/>
              <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-transparent to-transparent flex flex-col justify-end p-space-md text-surface">
                <span className="font-label-md text-label-md font-bold">Private Assessment Suites</span>
                <span className="font-body-sm text-[12px] opacity-80">Quiet, sanitized therapeutic chambers</span>
              </div>
            </div>
            <div className="relative rounded-xl overflow-hidden group shadow-sm">
              <img className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-500" alt="Motion Lab" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFTVg-qbXKBLzOATiKhSxJVrORmyjnLhhFZ7lm5cFXpNXAWv4Hngne8OyOcrDauJR7ohKTUu3465-9hL2ny8ti_T5PBu2xEUMCwyAmcPbij5JRHODpXu7NuOFnJD61Q1ZIk6bex2W5qTWIQ53VZEC8N-xNZejMGqvzMD1nUuby7fijS0jYxmYFOOqgbhTcXO28EX5kN5tjqoCJnWbe7s13VPotcETwpFgiyXfSYdUWdKsoUcjyd0xc"/>
              <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-transparent to-transparent flex flex-col justify-end p-space-md text-surface">
                <span className="font-label-md text-label-md font-bold">Evidence-Based Motion Lab</span>
                <span className="font-body-sm text-[12px] opacity-80">Digital range of motion measurement</span>
              </div>
            </div>
            <div className="relative rounded-xl overflow-hidden group shadow-sm">
              <img className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-500" alt="Triage Desk" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA_VZJy0yKAb9MxCYHp0j8ji9M68u85-gxFl1SQpM2Fam1CfAKKtWuIpvhqex-2prCUcfeKyVieyFE1rXAmdAhfy9eUOaorcsKk3Nm4EHCy10__g4mnASYsKCLjt7DoIEQjM3PIApB97x84QO9WDdhJwSGQ0iBwUhqUFA4k7fYx8W6O_YWTG7O7aiGGSTfFtQ-I6p7P5ClKDEy-FOkr2C6YYTRCrPFp4CMsJgawOo0DfPvObAdpiQWR"/>
              <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-transparent to-transparent flex flex-col justify-end p-space-md text-surface">
                <span className="font-label-md text-label-md font-bold">Dedicated Triage Desk</span>
                <span className="font-body-sm text-[12px] opacity-80">Prompt in-depth scan review</span>
              </div>
            </div>
          </div>
        </section>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm transition-opacity duration-300 print:bg-transparent print:backdrop-blur-none p-4 overflow-y-auto">
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .print-section, .print-section * { visibility: visible; }
                .print-section { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; box-shadow: none; border: none; }
                .no-print { display: none !important; }
              }
            `}</style>
            <div className="print-section bg-surface-container-lowest p-6 md:p-8 rounded-2xl shadow-2xl max-w-md w-full flex flex-col transform transition-transform duration-300 border border-outline-variant/30 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:border-none print:shadow-none m-auto">
                
                <div className="w-full flex items-center justify-between border-b border-surface-container pb-space-sm mb-space-sm">
                   <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Clinical Triage Ticket</span>
                      <span className="font-label-sm text-label-sm text-primary font-semibold mt-0.5">Dr. Ayazullah Physiotherapy &amp; Sports Rehabilitation Clinic</span>
                      <span className="font-body-sm text-[11px] text-on-surface-variant">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</span>
                   </div>
                   <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-[24px]">verified</span>
                   </div>
                </div>

                <div className="w-full flex flex-col gap-4 text-left font-body-md text-on-surface mb-space-lg">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">Patient Name</span>
                    <span className="font-bold text-[18px]">{patientName || 'Valued Patient'}</span>
                    <span className="font-body-sm text-[13px] text-on-surface-variant mt-0.5">{patientPhone} {patientEmail && `• ${patientEmail}`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">Appointment Date</span>
                      <span className="font-bold text-[15px]">{currentDate}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">Reserved Time</span>
                      <span className="font-bold text-[15px] text-primary">{currentTime}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">Clinical Program</span>
                    <span className="font-medium text-[15px] leading-tight">{currentCategory}</span>
                  </div>
                  <div className="flex flex-col p-3 bg-surface-container-low rounded-lg mt-1 border border-outline-variant/30">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider mb-1">Pre-Payment Verification</span>
                    <div className="flex items-center justify-between">
                       <span className="font-medium text-[14px] flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-secondary">check_circle</span> {paymentMethod}</span>
                       <span className="font-mono text-[12px] opacity-70">REF: {transactionId.substring(0, 12)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center mt-2 pt-4 border-t border-dashed border-outline-variant">
                     <span className="material-symbols-outlined text-[56px] text-on-surface/80 font-light scale-x-150 transform">barcode</span>
                     <span className="font-mono text-[11px] tracking-[0.3em] text-on-surface-variant mt-2">AX-{transactionId.substring(0, 6).toUpperCase() || '829104'}</span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-2.5 no-print">
                   <button 
                     type="button"
                     onClick={() => {
                       generateAppointmentPDF({
                         patientName: patientName || 'Valued Patient',
                         patientPhone: patientPhone || '',
                         patientEmail: patientEmail || '',
                         patientAge: patientAge || '',
                         date: currentDate,
                         time: currentTime,
                         category: currentCategory,
                         mode: currentMode,
                         fee: currentFee ? Number(String(currentFee).replace(/[^0-9]/g, '')) : 5000,
                         paymentMethod: paymentMethod,
                         transactionId: transactionId,
                         ticketId: `AX-${transactionId.substring(0, 6).toUpperCase() || '829104'}`,
                         clinicName: generalSettings?.clinicName || 'Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic',
                         clinicAddress: (generalSettings?.clinicAddress && !generalSettings.clinicAddress.includes("MediCare"))
                           ? generalSettings.clinicAddress
                           : 'Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad',
                         clinicPhone: generalSettings?.whatsappDesk || generalSettings?.contactPhone || generalSettings?.dutyPhone
                       });
                     }}
                     className="w-full h-12 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                     Download PDF Slip
                   </button>
                   <button 
                     type="button"
                     onClick={() => window.print()} 
                     className="w-full h-11 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <span className="material-symbols-outlined text-[18px]">print</span>
                     Print Slip
                   </button>
                   <button 
                     onClick={() => setIsModalOpen(false)} 
                     className="w-full h-10 rounded-full bg-transparent border border-surface-container hover:border-outline-variant text-on-surface font-label-md text-sm font-medium transition-colors cursor-pointer" 
                     type="button"
                   >
                     Close
                   </button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
