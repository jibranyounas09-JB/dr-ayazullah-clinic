import React, { useState, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ScheduleConfig,
  SingleDayOverride,
  DEFAULT_SCHEDULE_CONFIG,
  DEFAULT_MORNING_NAME,
  DEFAULT_MORNING_SLOTS,
  DEFAULT_AFTERNOON_NAME,
  DEFAULT_AFTERNOON_SLOTS,
  DEFAULT_WEEKLY_OFF,
  getLocalDateKey,
  getFormattedDateLabel,
  parseLocalDate,
  getDayAvailability,
  sanitizeForFirestore
} from "../lib/scheduleUtils";

export default function AdminSchedule() {
  const [activeTab, setActiveTab] = useState<"single-day" | "default-shifts" | "weekly-off">("single-day");
  
  // Master Config from Firestore
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_SCHEDULE_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Single Day Selection State
  const todayDateKey = useMemo(() => getLocalDateKey(new Date()), []);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayDateKey);

  // Draft state for the selected single day
  const [dayIsOff, setDayIsOff] = useState<boolean>(false);
  const [dayOffReason, setDayOffReason] = useState<string>("Clinic Closed / Day Off");
  const [dayHasCustomSlots, setDayHasCustomSlots] = useState<boolean>(false);
  const [dayMorningName, setDayMorningName] = useState<string>(DEFAULT_MORNING_NAME);
  const [dayMorningSlots, setDayMorningSlots] = useState<string[]>(DEFAULT_MORNING_SLOTS);
  const [dayAfternoonName, setDayAfternoonName] = useState<string>(DEFAULT_AFTERNOON_NAME);
  const [dayAfternoonSlots, setDayAfternoonSlots] = useState<string[]>(DEFAULT_AFTERNOON_SLOTS);

  // Input helpers for adding individual slots
  const [newMorningSlot, setNewMorningSlot] = useState("");
  const [newAfternoonSlot, setNewAfternoonSlot] = useState("");

  // Default Shifts Tab Form State
  const [defaultMorningName, setDefaultMorningName] = useState(DEFAULT_MORNING_NAME);
  const [defaultMorningSlots, setDefaultMorningSlots] = useState<string[]>(DEFAULT_MORNING_SLOTS);
  const [defaultAfternoonName, setDefaultAfternoonName] = useState(DEFAULT_AFTERNOON_NAME);
  const [defaultAfternoonSlots, setDefaultAfternoonSlots] = useState<string[]>(DEFAULT_AFTERNOON_SLOTS);
  const [weeklyOffDays, setWeeklyOffDays] = useState<string[]>(DEFAULT_WEEKLY_OFF);

  // Fetch from Firestore
  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "schedule"));
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<ScheduleConfig>;
          const loadedConfig: ScheduleConfig = {
            morningName: data.morningName || DEFAULT_MORNING_NAME,
            morningSlots: data.morningSlots || DEFAULT_MORNING_SLOTS,
            afternoonName: data.afternoonName || DEFAULT_AFTERNOON_NAME,
            afternoonSlots: data.afternoonSlots || DEFAULT_AFTERNOON_SLOTS,
            weeklyOffDays: data.weeklyOffDays || DEFAULT_WEEKLY_OFF,
            dayOverrides: data.dayOverrides || {}
          };
          setConfig(loadedConfig);
          setDefaultMorningName(loadedConfig.morningName);
          setDefaultMorningSlots(loadedConfig.morningSlots);
          setDefaultAfternoonName(loadedConfig.afternoonName);
          setDefaultAfternoonSlots(loadedConfig.afternoonSlots);
          setWeeklyOffDays(loadedConfig.weeklyOffDays);
        }
      } catch (error) {
        console.error("Error fetching schedule settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSchedule();
  }, []);

  // Update selected day draft state whenever selected date changes or master config updates
  useEffect(() => {
    try {
      const selectedDate = parseLocalDate(selectedDateKey);
      const avail = getDayAvailability(selectedDate, config);
      const existingOverride = config.dayOverrides?.[selectedDateKey];

      setDayIsOff(avail.isDayOff);
      setDayOffReason(avail.reason || (avail.isDayOff ? "Clinic Closed / Day Off" : ""));
      setDayHasCustomSlots(existingOverride ? !!existingOverride.hasCustomSlots : false);
      setDayMorningName(avail.morningName || config.morningName || DEFAULT_MORNING_NAME);
      setDayMorningSlots(avail.morningSlots.length > 0 ? avail.morningSlots : (config.morningSlots || DEFAULT_MORNING_SLOTS));
      setDayAfternoonName(avail.afternoonName || config.afternoonName || DEFAULT_AFTERNOON_NAME);
      setDayAfternoonSlots(avail.afternoonSlots.length > 0 ? avail.afternoonSlots : (config.afternoonSlots || DEFAULT_AFTERNOON_SLOTS));
    } catch {
      // Fallback
    }
  }, [selectedDateKey, config]);

  // Strip of next 14 calendar days for quick switching
  const next14Days = useMemo(() => {
    const list = [];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = getLocalDateKey(d);
      const label = getFormattedDateLabel(d);
      const avail = getDayAvailability(d, config);
      const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString("en-US", { month: "short" });
      list.push({
        dateObj: d,
        key,
        label,
        weekday,
        dayNum,
        monthShort,
        avail
      });
    }
    return list;
  }, [config]);

  // Save the entire config to Firestore
  const persistConfig = async (newConfig: ScheduleConfig, message: string) => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const sanitized = sanitizeForFirestore(newConfig);
      await setDoc(doc(db, "settings", "schedule"), sanitized);
      setConfig(newConfig);
      setSaveStatus(message);
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error("Error saving schedule config to Firestore:", err);
      setSaveStatus("Error saving to database. Please try again.");
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Day Off / On for the selected date
  const handleToggleDayOff = async (makeOff: boolean) => {
    const selectedDate = parseLocalDate(selectedDateKey);
    const label = getFormattedDateLabel(selectedDate);
    const updatedOverrides = { ...(config.dayOverrides || {}) };

    if (makeOff) {
      // Make this day OFF
      const reason = dayOffReason.trim() || "Doctor Unavailable / Scheduled Day Off";
      updatedOverrides[selectedDateKey] = {
        dateKey: selectedDateKey,
        dateLabel: label,
        isDayOff: true,
        offReason: reason,
        updatedAt: new Date().toISOString()
      };
      setDayIsOff(true);
      setDayOffReason(reason);

      const newConfig: ScheduleConfig = {
        ...config,
        dayOverrides: updatedOverrides
      };
      await persistConfig(newConfig, `${label} is now marked as DAY OFF (Clinic Closed).`);
    } else {
      // Make this day ON
      updatedOverrides[selectedDateKey] = {
        dateKey: selectedDateKey,
        dateLabel: label,
        isDayOff: false,
        offReason: "",
        hasCustomSlots: dayHasCustomSlots,
        morningName: dayMorningName,
        morningSlots: dayMorningSlots,
        afternoonName: dayAfternoonName,
        afternoonSlots: dayAfternoonSlots,
        updatedAt: new Date().toISOString()
      };
      setDayIsOff(false);

      const newConfig: ScheduleConfig = {
        ...config,
        dayOverrides: updatedOverrides
      };
      await persistConfig(newConfig, `${label} is now marked as OPEN (Clinic Active).`);
    }
  };

  // Save custom schedule for the selected single day
  const handleSaveSingleDaySchedule = async () => {
    const selectedDate = parseLocalDate(selectedDateKey);
    const label = getFormattedDateLabel(selectedDate);
    const updatedOverrides = { ...(config.dayOverrides || {}) };

    const newOverride: SingleDayOverride = {
      dateKey: selectedDateKey,
      dateLabel: label,
      isDayOff: dayIsOff,
      offReason: dayIsOff ? (dayOffReason.trim() || "Clinic Closed") : "",
      hasCustomSlots: !dayIsOff && dayHasCustomSlots,
      morningName: dayMorningName,
      morningSlots: dayMorningSlots,
      afternoonName: dayAfternoonName,
      afternoonSlots: dayAfternoonSlots,
      updatedAt: new Date().toISOString()
    };

    updatedOverrides[selectedDateKey] = newOverride;

    const newConfig: ScheduleConfig = {
      ...config,
      dayOverrides: updatedOverrides
    };

    await persistConfig(
      newConfig,
      dayIsOff 
        ? `${label} marked as DAY OFF with reason "${dayOffReason}".`
        : `Schedule for ${label} saved successfully!`
    );
  };

  // Reset selected day to follow default weekly rules
  const handleResetSingleDay = async () => {
    const selectedDate = parseLocalDate(selectedDateKey);
    const label = getFormattedDateLabel(selectedDate);
    const updatedOverrides = { ...(config.dayOverrides || {}) };

    if (updatedOverrides[selectedDateKey]) {
      delete updatedOverrides[selectedDateKey];
      const newConfig: ScheduleConfig = {
        ...config,
        dayOverrides: updatedOverrides
      };
      await persistConfig(newConfig, `Override removed for ${label}. It now follows default rules.`);
    }
  };

  // Remove override from the list
  const handleRemoveOverride = async (key: string) => {
    const updatedOverrides = { ...(config.dayOverrides || {}) };
    const label = updatedOverrides[key]?.dateLabel || key;
    delete updatedOverrides[key];
    const newConfig: ScheduleConfig = {
      ...config,
      dayOverrides: updatedOverrides
    };
    await persistConfig(newConfig, `Removed override for ${label}.`);
  };

  // Save Default Shifts Template
  const handleSaveDefaultShifts = async () => {
    const newConfig: ScheduleConfig = {
      ...config,
      morningName: defaultMorningName,
      morningSlots: defaultMorningSlots,
      afternoonName: defaultAfternoonName,
      afternoonSlots: defaultAfternoonSlots
    };
    await persistConfig(newConfig, "Default shifts and slots updated successfully!");
  };

  // Toggle Weekly Off Day
  const handleToggleWeeklyOff = async (day: string) => {
    let nextWeeklyOff: string[];
    if (weeklyOffDays.includes(day)) {
      nextWeeklyOff = weeklyOffDays.filter(d => d !== day);
    } else {
      nextWeeklyOff = [...weeklyOffDays, day];
    }
    setWeeklyOffDays(nextWeeklyOff);

    const newConfig: ScheduleConfig = {
      ...config,
      weeklyOffDays: nextWeeklyOff
    };
    await persistConfig(newConfig, `Weekly off days updated. (${nextWeeklyOff.join(", ") || "None"})`);
  };

  // Selected date human readable presentation
  const selectedDateObj = useMemo(() => {
    try {
      return parseLocalDate(selectedDateKey);
    } catch {
      return new Date();
    }
  }, [selectedDateKey]);

  const selectedDateFullLabel = useMemo(() => {
    return selectedDateObj.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }, [selectedDateObj]);

  const isSelectedToday = selectedDateKey === todayDateKey;

  // List of active overrides for overview
  const overridesList = useMemo(() => {
    const list = Object.values(config.dayOverrides || {}) as SingleDayOverride[];
    return list.sort((a, b) => (a.dateKey || "").localeCompare(b.dateKey || ""));
  }, [config.dayOverrides]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="font-label-md font-medium">Loading clinical schedule...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[28px]">calendar_month</span>
            <span>Schedule &amp; Availability</span>
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Manage daily schedules, turn single days OFF or ON, configure customized hours, and set default clinic shifts.
          </p>
        </div>

        {/* Global Save Status Alert */}
        {saveStatus && (
          <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary font-label-md font-bold flex items-center gap-2 animate-in fade-in">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-surface-container gap-2 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("single-day")}
          className={clsx(
            "pb-3 pt-1 px-2 font-label-md font-bold transition-all relative flex items-center gap-2 whitespace-nowrap cursor-pointer",
            activeTab === "single-day" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <span className="material-symbols-outlined text-[20px]">event_busy</span>
          <span>Single Day &amp; Day-Off Manager</span>
          {activeTab === "single-day" && (
            <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-primary rounded-t-full"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("default-shifts")}
          className={clsx(
            "pb-3 pt-1 px-2 font-label-md font-bold transition-all relative flex items-center gap-2 whitespace-nowrap cursor-pointer",
            activeTab === "default-shifts" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <span className="material-symbols-outlined text-[20px]">schedule</span>
          <span>Default Working Shifts</span>
          {activeTab === "default-shifts" && (
            <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-primary rounded-t-full"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("weekly-off")}
          className={clsx(
            "pb-3 pt-1 px-2 font-label-md font-bold transition-all relative flex items-center gap-2 whitespace-nowrap cursor-pointer",
            activeTab === "weekly-off" ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <span className="material-symbols-outlined text-[20px]">repeat</span>
          <span>Weekly Recurring Days Off</span>
          {activeTab === "weekly-off" && (
            <span className="absolute bottom-0 left-0 w-full h-[2.5px] bg-primary rounded-t-full"></span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SINGLE DAY & DAY OFF MANAGER (Primary User Request) */}
      {/* ========================================================================= */}
      {activeTab === "single-day" && (
        <div className="flex flex-col gap-6">
          {/* Quick Date Selector Strip */}
          <div className="bg-surface rounded-2xl p-4 sm:p-5 shadow-sm border border-surface-container flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">date_range</span>
                <span className="font-label-md font-bold text-on-surface">Select a Day to Manage:</span>
                <span className="text-xs text-on-surface-variant">(Next 14 Days)</span>
              </div>

              {/* Date Input for Any Day */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-on-surface-variant font-medium whitespace-nowrap">Pick Any Date:</label>
                <input
                  type="date"
                  value={selectedDateKey}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDateKey(e.target.value);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-low border border-surface-container text-sm font-medium focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
            </div>

            {/* Horizontal 14-day clickable strip */}
            <div className="overflow-x-auto pb-1 pt-1 -mx-1 px-1 flex gap-2.5">
              {next14Days.map((item) => {
                const isSelected = item.key === selectedDateKey;
                const isDayOff = item.avail.isDayOff;
                const hasCustom = item.avail.hasCustomSlots;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedDateKey(item.key)}
                    className={clsx(
                      "flex-shrink-0 w-24 p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer text-center",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                        : "border-surface-container bg-surface-container-low hover:bg-surface-container hover:border-surface-variant"
                    )}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      {item.weekday}
                    </span>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface my-0.5">
                      {item.dayNum}
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium">
                      {item.monthShort}
                    </span>

                    {/* Status Pill on Date Card */}
                    <div className="mt-1.5">
                      {isDayOff ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-error/15 text-error flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[11px]">block</span>
                          <span>DAY OFF</span>
                        </span>
                      ) : hasCustom ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-tertiary/15 text-tertiary">
                          CUSTOM
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary">
                          OPEN
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Inspector & Manager for Selected Date */}
          <div className="bg-surface rounded-2xl shadow-sm border border-surface-container overflow-hidden">
            {/* Top Bar of the Inspector */}
            <div className="p-4 sm:p-5 bg-surface-container-lowest border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", dayIsOff ? "bg-error/15 text-error" : "bg-primary/15 text-primary")}>
                  <span className="material-symbols-outlined text-[24px]">{dayIsOff ? "event_busy" : "event_available"}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {selectedDateFullLabel}
                    </h2>
                    {isSelectedToday && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold border border-primary/20">
                        Today
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Managing schedule configuration and clinic availability for this specific day
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  "px-3 py-1.5 rounded-xl font-label-md font-bold flex items-center gap-1.5 border text-sm",
                  dayIsOff 
                    ? "bg-error/10 text-error border-error/20" 
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                )}>
                  <span className="material-symbols-outlined text-[18px]">{dayIsOff ? "block" : "check_circle"}</span>
                  <span>{dayIsOff ? "DAY OFF (Closed)" : "CLINIC OPEN (Active)"}</span>
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6 flex flex-col gap-6">
              {/* MAIN TOGGLE: MAKE DAY OFF OR ON */}
              <div className={clsx(
                "p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                dayIsOff 
                  ? "bg-error/5 border-error/25" 
                  : "bg-emerald-500/5 border-emerald-500/25"
              )}>
                <div className="flex items-start gap-3">
                  <div className={clsx("p-2.5 rounded-xl mt-0.5", dayIsOff ? "bg-error/15 text-error" : "bg-emerald-500/15 text-emerald-700")}>
                    <span className="material-symbols-outlined text-[24px]">
                      {dayIsOff ? "do_not_disturb_on" : "verified"}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-label-lg font-bold text-on-surface">
                      {dayIsOff ? "Clinic Status: DAY OFF / CLOSED" : "Clinic Status: OPEN FOR BOOKINGS"}
                    </h3>
                    <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
                      {dayIsOff 
                        ? "Patients visiting the website will see that the clinic is closed on this day. Appointments cannot be booked."
                        : "Patients can book appointments on this date according to the shifts and available time slots below."}
                    </p>
                  </div>
                </div>

                {/* The 1-Click Action Button */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {dayIsOff ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleDayOff(false)}
                      className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">toggle_on</span>
                      <span>Turn Day ON (Open Clinic)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleDayOff(true)}
                      className="px-5 py-2.5 rounded-xl bg-error hover:bg-error/90 text-on-error font-label-md font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">toggle_off</span>
                      <span>Make Day OFF (Close Clinic)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* DETAILS WHEN DAY IS OFF */}
              {dayIsOff && (
                <div className="p-5 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-4 animate-in fade-in">
                  <div className="flex items-center gap-2 text-on-surface">
                    <span className="material-symbols-outlined text-error text-[20px]">info</span>
                    <span className="font-label-md font-bold">Reason for Day Off (Shown on Website to Patients)</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      "Weekly Clinic Off",
                      "Doctor on Medical Leave",
                      "Medical Conference / Travel",
                      "Public Holiday",
                      "Clinic Renovation / Maintenance",
                      "Staff Training Day"
                    ].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setDayOffReason(reason)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                          dayOffReason === reason
                            ? "bg-error text-on-error border-error shadow-xs"
                            : "bg-surface hover:bg-surface-container border-surface-container text-on-surface"
                        )}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-on-surface-variant">Custom Reason / Patient Notice:</label>
                    <input
                      type="text"
                      value={dayOffReason}
                      onChange={(e) => setDayOffReason(e.target.value)}
                      placeholder="e.g. Doctor attending International Spine Fellowship conference"
                      className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>

                  <div className="p-3 bg-surface rounded-lg border border-surface-container text-xs text-on-surface-variant flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">visibility</span>
                    <span>
                      <strong>Website Preview:</strong> When patients select <strong>{selectedDateFullLabel}</strong> on the appointment booking page, they will see a closed notice stating: <em>"{dayOffReason || "Clinic is closed on this day."}"</em>
                    </span>
                  </div>
                </div>
              )}

              {/* DETAILS WHEN DAY IS ON: DEFAULT VS CUSTOM SLOTS */}
              {!dayIsOff && (
                <div className="flex flex-col gap-5 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface-container-low rounded-xl border border-surface-container">
                    <div>
                      <span className="font-label-md font-bold text-on-surface block">Schedule Mode for this Date</span>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Choose whether to use the clinic's standard working hours or custom hours for this single day.
                      </p>
                    </div>

                    <div className="flex items-center bg-surface-container p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setDayHasCustomSlots(false)}
                        className={clsx(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                          !dayHasCustomSlots 
                            ? "bg-surface text-primary shadow-xs" 
                            : "text-on-surface-variant hover:text-on-surface"
                        )}
                      >
                        Use Default Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayHasCustomSlots(true)}
                        className={clsx(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                          dayHasCustomSlots 
                            ? "bg-surface text-primary shadow-xs" 
                            : "text-on-surface-variant hover:text-on-surface"
                        )}
                      >
                        Customize Hours for This Date
                      </button>
                    </div>
                  </div>

                  {/* If using Default Hours */}
                  {!dayHasCustomSlots && (
                    <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-primary font-label-md font-bold text-sm">
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>This day is running on the Default Clinic Schedule:</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container">
                          <span className="text-xs font-bold text-primary block">{config.morningName}</span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {config.morningSlots.map((s, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-semibold">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container">
                          <span className="text-xs font-bold text-tertiary block">{config.afternoonName}</span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {config.afternoonSlots.map((s, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-xs bg-tertiary/10 text-tertiary font-semibold">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* If Customizing Hours for this specific day */}
                  {dayHasCustomSlots && (
                    <div className="flex flex-col gap-5 p-4 sm:p-5 rounded-xl bg-surface-container-lowest border border-surface-container">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-tertiary text-[20px]">tune</span>
                          <span className="font-label-md font-bold text-on-surface">Custom Shifts for {selectedDateFullLabel}</span>
                        </div>
                        <span className="text-xs text-on-surface-variant font-medium">Click [x] on any slot to remove it</span>
                      </div>

                      {/* Custom Morning Shift */}
                      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-primary flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">wb_sunny</span>
                            <span>Morning Shift Title:</span>
                          </label>
                          <input
                            type="text"
                            value={dayMorningName}
                            onChange={(e) => setDayMorningName(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-surface border border-surface-container text-sm focus:outline-none focus:border-primary text-on-surface"
                          />
                        </div>

                        {/* Morning Slot Pills */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-on-surface-variant">Active Morning Slots:</label>
                          <div className="flex flex-wrap gap-2">
                            {dayMorningSlots.map((slot, index) => (
                              <span
                                key={index}
                                className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold flex items-center gap-1.5"
                              >
                                <span>{slot}</span>
                                <button
                                  type="button"
                                  onClick={() => setDayMorningSlots(dayMorningSlots.filter((_, i) => i !== index))}
                                  className="w-3.5 h-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center cursor-pointer"
                                  title="Remove slot"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {dayMorningSlots.length === 0 && (
                              <span className="text-xs text-on-surface-variant italic">No morning slots configured for this day.</span>
                            )}
                          </div>
                        </div>

                        {/* Add morning slot */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={newMorningSlot}
                            onChange={(e) => setNewMorningSlot(e.target.value)}
                            placeholder="Add slot (e.g. 10:00 AM)"
                            className="h-8 px-3 rounded-lg bg-surface border border-surface-container text-xs focus:outline-none focus:border-primary text-on-surface w-44"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newMorningSlot.trim()) {
                                setDayMorningSlots([...dayMorningSlots, newMorningSlot.trim()]);
                                setNewMorningSlot("");
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newMorningSlot.trim()) {
                                setDayMorningSlots([...dayMorningSlots, newMorningSlot.trim()]);
                                setNewMorningSlot("");
                              }
                            }}
                            className="h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all cursor-pointer"
                          >
                            + Add Slot
                          </button>
                        </div>
                      </div>

                      {/* Custom Afternoon Shift */}
                      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-tertiary flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">routine</span>
                            <span>Afternoon / Evening Shift Title:</span>
                          </label>
                          <input
                            type="text"
                            value={dayAfternoonName}
                            onChange={(e) => setDayAfternoonName(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-surface border border-surface-container text-sm focus:outline-none focus:border-primary text-on-surface"
                          />
                        </div>

                        {/* Afternoon Slot Pills */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-on-surface-variant">Active Afternoon Slots:</label>
                          <div className="flex flex-wrap gap-2">
                            {dayAfternoonSlots.map((slot, index) => (
                              <span
                                key={index}
                                className="px-2.5 py-1 rounded-lg bg-tertiary/10 text-tertiary border border-tertiary/20 text-xs font-bold flex items-center gap-1.5"
                              >
                                <span>{slot}</span>
                                <button
                                  type="button"
                                  onClick={() => setDayAfternoonSlots(dayAfternoonSlots.filter((_, i) => i !== index))}
                                  className="w-3.5 h-3.5 rounded-full hover:bg-tertiary/20 flex items-center justify-center cursor-pointer"
                                  title="Remove slot"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {dayAfternoonSlots.length === 0 && (
                              <span className="text-xs text-on-surface-variant italic">No afternoon slots configured for this day.</span>
                            )}
                          </div>
                        </div>

                        {/* Add afternoon slot */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={newAfternoonSlot}
                            onChange={(e) => setNewAfternoonSlot(e.target.value)}
                            placeholder="Add slot (e.g. 04:30 PM)"
                            className="h-8 px-3 rounded-lg bg-surface border border-surface-container text-xs focus:outline-none focus:border-primary text-on-surface w-44"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newAfternoonSlot.trim()) {
                                setDayAfternoonSlots([...dayAfternoonSlots, newAfternoonSlot.trim()]);
                                setNewAfternoonSlot("");
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newAfternoonSlot.trim()) {
                                setDayAfternoonSlots([...dayAfternoonSlots, newAfternoonSlot.trim()]);
                                setNewAfternoonSlot("");
                              }
                            }}
                            className="h-8 px-3 rounded-lg bg-tertiary/10 hover:bg-tertiary/20 text-tertiary text-xs font-bold transition-all cursor-pointer"
                          >
                            + Add Slot
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons for Selected Date */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-surface-container">
                <button
                  type="button"
                  disabled={isSaving || !config.dayOverrides?.[selectedDateKey]}
                  onClick={handleResetSingleDay}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-surface-container hover:bg-surface-container text-on-surface-variant text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                  <span>Reset {selectedDateFullLabel} to Default Rules</span>
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveSingleDaySchedule}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>{isSaving ? "Saving..." : `Save Schedule for this Date`}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ACTIVE DAYS OFF & CUSTOM OVERRIDES OVERVIEW */}
          <div className="bg-surface rounded-2xl p-5 sm:p-6 shadow-sm border border-surface-container flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[22px]">list_alt</span>
                <div>
                  <h3 className="font-label-lg font-bold text-on-surface">Configured Days Off &amp; Overrides</h3>
                  <p className="text-xs text-on-surface-variant">All dates with scheduled clinic closures or customized shift hours</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface text-xs font-bold">
                {overridesList.length} scheduled
              </span>
            </div>

            {overridesList.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant text-sm bg-surface-container-lowest rounded-xl border border-surface-container">
                No custom days off or schedule overrides scheduled yet. All days run on the default shifts and weekly off settings.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {overridesList.map((item) => (
                  <div
                    key={item.dateKey}
                    className={clsx(
                      "p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all",
                      item.isDayOff 
                        ? "bg-error/5 border-error/20" 
                        : "bg-surface-container-low border-surface-container"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center text-[18px]", item.isDayOff ? "bg-error/15 text-error" : "bg-tertiary/15 text-tertiary")}>
                        <span className="material-symbols-outlined">{item.isDayOff ? "event_busy" : "tune"}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-label-sm font-bold text-on-surface">{item.dateLabel}</span>
                          <span className={clsx(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold",
                            item.isDayOff ? "bg-error/20 text-error" : "bg-tertiary/20 text-tertiary"
                          )}>
                            {item.isDayOff ? "DAY OFF" : "CUSTOM HOURS"}
                          </span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant block mt-0.5 line-clamp-1">
                          {item.isDayOff ? (item.offReason || "Clinic Closed") : `${item.morningSlots?.length || 0} morning, ${item.afternoonSlots?.length || 0} evening slots`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDateKey(item.dateKey)}
                        className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-container text-xs font-semibold text-primary border border-surface-container transition-all cursor-pointer"
                        title="Edit this day"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(item.dateKey)}
                        className="p-1 rounded-lg hover:bg-error/10 text-error transition-all cursor-pointer"
                        title={item.isDayOff ? "Turn ON (Remove Day Off)" : "Remove Custom Schedule"}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DEFAULT WORKING SHIFTS */}
      {/* ========================================================================= */}
      {activeTab === "default-shifts" && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface rounded-2xl shadow-sm border border-surface-container p-4 sm:p-5 flex items-start gap-3 bg-primary/5">
            <span className="material-symbols-outlined text-primary text-[24px]">info</span>
            <div>
              <h3 className="font-label-md font-bold text-primary">Default Working Shifts Template</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                These morning and afternoon shifts and time slots automatically apply to every active clinic day, unless you configure an override for a single day.
              </p>
            </div>
          </div>

          {/* Morning Shift Card */}
          <div className="bg-surface rounded-2xl shadow-sm border border-surface-container overflow-hidden">
            <div className="p-4 bg-surface-container-lowest border-b border-surface-container">
              <h2 className="font-label-lg font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">wb_sunny</span>
                <span>Default Morning Shift</span>
              </h2>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface">Shift Title &amp; Time Range</label>
                <input
                  type="text"
                  value={defaultMorningName}
                  onChange={(e) => setDefaultMorningName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface">Time Slots (Comma separated)</label>
                <textarea
                  value={defaultMorningSlots.join(", ")}
                  onChange={(e) => {
                    const slots = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    setDefaultMorningSlots(slots);
                  }}
                  rows={2}
                  className="w-full p-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors font-mono text-sm resize-none text-on-surface"
                  placeholder="09:00 AM, 09:30 AM, 10:30 AM..."
                />
                <p className="text-[11px] text-on-surface-variant">Example: 09:00 AM, 09:30 AM, 10:30 AM, 11:15 AM</p>
              </div>

              <div className="flex flex-wrap gap-2 mt-1">
                {defaultMorningSlots.map((slot, i) => (
                  <span key={i} className="px-3 py-1 bg-primary/10 text-primary rounded-full font-label-sm font-bold border border-primary/20">
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Afternoon Shift Card */}
          <div className="bg-surface rounded-2xl shadow-sm border border-surface-container overflow-hidden">
            <div className="p-4 bg-surface-container-lowest border-b border-surface-container">
              <h2 className="font-label-lg font-bold text-tertiary flex items-center gap-2">
                <span className="material-symbols-outlined">routine</span>
                <span>Default Afternoon / Evening Shift</span>
              </h2>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface">Shift Title &amp; Time Range</label>
                <input
                  type="text"
                  value={defaultAfternoonName}
                  onChange={(e) => setDefaultAfternoonName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface">Time Slots (Comma separated)</label>
                <textarea
                  value={defaultAfternoonSlots.join(", ")}
                  onChange={(e) => {
                    const slots = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    setDefaultAfternoonSlots(slots);
                  }}
                  rows={2}
                  className="w-full p-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors font-mono text-sm resize-none text-on-surface"
                  placeholder="03:00 PM, 04:00 PM, 05:00 PM..."
                />
                <p className="text-[11px] text-on-surface-variant">Example: 03:00 PM, 04:00 PM, 05:00 PM, 05:30 PM</p>
              </div>

              <div className="flex flex-wrap gap-2 mt-1">
                {defaultAfternoonSlots.map((slot, i) => (
                  <span key={i} className="px-3 py-1 bg-tertiary/10 text-tertiary rounded-full font-label-sm font-bold border border-tertiary/20">
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveDefaultShifts}
              className="px-8 py-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isSaving ? "Saving..." : "Save Default Shifts"}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: WEEKLY RECURRING DAYS OFF */}
      {/* ========================================================================= */}
      {activeTab === "weekly-off" && (
        <div className="bg-surface rounded-2xl shadow-sm border border-surface-container p-6 flex flex-col gap-6">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">repeat</span>
              <span>Weekly Recurring Days Off</span>
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Select which weekdays the clinic is routinely closed every week. Any calendar date falling on these days will automatically be marked as a DAY OFF unless you explicitly turn that single day ON.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday"
            ].map((day) => {
              const isOff = weeklyOffDays.includes(day);
              return (
                <div
                  key={day}
                  onClick={() => handleToggleWeeklyOff(day)}
                  className={clsx(
                    "p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all select-none",
                    isOff 
                      ? "bg-error/5 border-error/30 text-error" 
                      : "bg-surface-container-low border-surface-container text-on-surface hover:bg-surface-container"
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleToggleWeeklyOff(day);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">
                      {isOff ? "block" : "check_circle"}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-md font-bold text-on-surface">{day}</span>
                      <span className={clsx("text-xs font-medium", isOff ? "text-error" : "text-on-surface-variant")}>
                        {isOff ? "Routine Day Off" : "Open for Clinic"}
                      </span>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isOff}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleWeeklyOff(day);
                    }}
                    className="w-5 h-5 accent-error cursor-pointer rounded"
                  />
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs text-on-surface-variant flex items-start gap-2.5">
            <span className="material-symbols-outlined text-primary text-[18px]">tips_and_updates</span>
            <span>
              <strong>Smart Rule:</strong> You can always turn an individual date ON from the <strong>Single Day Manager</strong> (for example, if you want to hold special weekend clinic hours on a specific Sunday).
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
