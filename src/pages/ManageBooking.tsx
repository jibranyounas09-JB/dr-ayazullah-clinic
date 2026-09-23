import React, { useState, useEffect, useMemo } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { generateAppointmentPDF } from "../lib/pdfGenerator";
import { 
  getDayAvailability, 
  ScheduleConfig, 
  DEFAULT_SCHEDULE_CONFIG, 
  getFormattedDateLabel, 
  getLocalDateKey 
} from "../lib/scheduleUtils";

function parseAnyDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  
  const currentYear = new Date().getFullYear();
  const tryWithYear = new Date(`${trimmed}, ${currentYear}`);
  if (!isNaN(tryWithYear.getTime())) {
    return tryWithYear;
  }
  
  const direct = new Date(trimmed);
  if (!isNaN(direct.getTime())) {
    return direct;
  }
  
  return new Date();
}

export default function ManageBooking() {
  const [transactionId, setTransactionId] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [appointment, setAppointment] = useState<any>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [cancelModal, setCancelModal] = useState(false);

  const [categories, setCategories] = useState<string[]>([
    "Neurological Rehabilitation",
    "Orthopedic Therapy",
    "Sports Injury Recovery",
    "Pediatric Physiotherapy",
    "Geriatric Care",
    "Post-Surgical Rehab"
  ]);

  // Load clinic schedule & dynamic services on component mount
  useEffect(() => {
    const initData = async () => {
      try {
        const [schedSnap, servicesSnap] = await Promise.all([
          getDoc(doc(db, "settings", "schedule")),
          getDocs(collection(db, "services"))
        ]);

        if (schedSnap.exists()) {
          setScheduleConfig(schedSnap.data() as ScheduleConfig);
        }

        if (!servicesSnap.empty) {
          const list = servicesSnap.docs
            .map(d => d.data().title || d.data().name)
            .filter(Boolean);
          if (list.length > 0) {
            setCategories(list);
          }
        }
      } catch (err) {
        console.error("Failed to load initial schedule/services:", err);
      }
    };
    initData();
  }, []);

  // Compute selected date object
  const selectedDateObj = useMemo(() => {
    return parseAnyDate(editDate);
  }, [editDate]);

  const selectedDateKey = useMemo(() => {
    return getLocalDateKey(selectedDateObj);
  }, [selectedDateObj]);

  const selectedDateLabel = useMemo(() => {
    return getFormattedDateLabel(selectedDateObj);
  }, [selectedDateObj]);

  // Next 14 days quick selector pills
  const upcomingDays = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      list.push({
        key: getLocalDateKey(d),
        label: getFormattedDateLabel(d),
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dayNum: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        dateObj: d
      });
    }
    return list;
  }, []);

  // Fetch booked slots for the selected date
  useEffect(() => {
    if (!isEditing || !editDate) return;

    const fetchBookedForDate = async () => {
      setLoadingSchedule(true);
      try {
        const snap = await getDocs(collection(db, "appointments"));
        const othersBooked = snap.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .filter(apt => {
            // Exclude the current appointment so patient's own slot doesn't block them
            if (appointment && apt.id === appointment.id) return false;
            // Exclude cancelled or refund requested appointments so slot is completely free
            const status = (apt.status || '').toLowerCase().trim();
            if (
              status === 'cancelled' ||
              status === 'canceled' ||
              status === 'refund requested' ||
              status === 'refunded' ||
              status.includes('cancel') ||
              status.includes('refund')
            ) {
              return false;
            }

            const aptDate = (apt.date || "").trim();
            return (
              aptDate === selectedDateKey ||
              aptDate === selectedDateLabel ||
              aptDate === editDate.trim()
            );
          })
          .map(apt => apt.time)
          .filter(Boolean);

        setBookedSlots(othersBooked);
      } catch (err) {
        console.error("Error fetching booked slots:", err);
        setBookedSlots([]);
      } finally {
        setLoadingSchedule(false);
      }
    };

    fetchBookedForDate();
  }, [editDate, isEditing, appointment?.id, selectedDateKey, selectedDateLabel]);

  // Compute availability from schedule config
  const dayAvailability = useMemo(() => {
    return getDayAvailability(selectedDateObj, scheduleConfig);
  }, [selectedDateObj, scheduleConfig]);

  // Computed slots with availability status
  const morningSlotsData = useMemo(() => {
    if (dayAvailability.isDayOff) return [];
    return dayAvailability.morningSlots.map(slot => ({
      time: slot,
      isBooked: bookedSlots.includes(slot)
    }));
  }, [dayAvailability, bookedSlots]);

  const afternoonSlotsData = useMemo(() => {
    if (dayAvailability.isDayOff) return [];
    return dayAvailability.afternoonSlots.map(slot => ({
      time: slot,
      isBooked: bookedSlots.includes(slot)
    }));
  }, [dayAvailability, bookedSlots]);

  const availableMorningCount = useMemo(() => {
    return morningSlotsData.filter(s => !s.isBooked).length;
  }, [morningSlotsData]);

  const availableAfternoonCount = useMemo(() => {
    return afternoonSlotsData.filter(s => !s.isBooked).length;
  }, [afternoonSlotsData]);

  // Helper to normalize phone numbers (strips country codes, spaces, dashes, leading zeros)
  const normalizePhone = (phone: string) => {
    return (phone || "")
      .replace(/\D/g, "")
      .replace(/^92/, "")
      .replace(/^0/, "");
  };

  // Helper to normalize transaction IDs (strips spaces, dashes, underscores, lowercases)
  const normalizeTx = (tx: string) => {
    return (tx || "")
      .trim()
      .replace(/[\s\-_]/g, "")
      .toLowerCase();
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTx = transactionId.trim();
    const rawPhone = patientPhone.trim();

    if (!rawTx && !rawPhone) {
      setError("Please enter your Transaction ID or Phone Number to look up your booking.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const cleanInputTx = normalizeTx(rawTx);
      const normInputPhone = normalizePhone(rawPhone);

      const snap = await getDocs(collection(db, "appointments"));

      if (snap.empty) {
        setError("No appointments found in the system.");
        setAppointment(null);
        setLoading(false);
        return;
      }

      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      let matched = null;
      if (cleanInputTx && normInputPhone) {
        matched = allDocs.find(d => {
          const docTx = normalizeTx(d.transactionId);
          const docPhone = normalizePhone(d.patientPhone);
          return (docTx === cleanInputTx || docTx.includes(cleanInputTx) || cleanInputTx.includes(docTx)) &&
                 (docPhone === normInputPhone || docPhone.endsWith(normInputPhone) || normInputPhone.endsWith(docPhone));
        });
      }

      if (!matched && cleanInputTx) {
        matched = allDocs.find(d => {
          const docTx = normalizeTx(d.transactionId);
          return docTx === cleanInputTx || docTx.includes(cleanInputTx) || cleanInputTx.includes(docTx);
        });
      }

      if (!matched && normInputPhone) {
        matched = allDocs.find(d => {
          const docPhone = normalizePhone(d.patientPhone);
          return docPhone === normInputPhone || docPhone.endsWith(normInputPhone) || normInputPhone.endsWith(docPhone);
        });
      }

      if (!matched) {
        setError("No booking found with these details. Please verify your Transaction ID or Phone Number.");
        setAppointment(null);
      } else {
        setAppointment(matched);
        setEditDate(matched.date || getFormattedDateLabel(new Date()));
        setEditTime(matched.time || "");
        setEditCategory(matched.category || "");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch booking. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!appointment) return;
    
    if (dayAvailability.isDayOff) {
      setError("The clinic is closed on this selected date. Please choose an open clinic date.");
      return;
    }

    if (!editTime) {
      setError("Please click and select an available time slot from the schedule below.");
      return;
    }

    if (bookedSlots.includes(editTime)) {
      setError("This slot is already booked by another patient. Please choose another available slot.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const updatedData: Record<string, any> = {
        date: selectedDateLabel,
        time: editTime,
        category: editCategory,
      };

      if (appointment.status === 'Completed') {
        updatedData.status = 'Verified';
      }

      await updateDoc(doc(db, "appointments", appointment.id), updatedData);
      
      setAppointment({ 
        ...appointment, 
        ...updatedData
      });
      
      setIsEditing(false);
      setSuccessMessage(`Appointment successfully rescheduled for ${selectedDateLabel} at ${editTime}.`);
      
      // Send update email notification
      if (appointment.patientEmail) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: appointment.patientEmail,
            subject: 'Appointment Rescheduled - Dr. Ayazullah Clinic',
            type: 'BOOKING_UPDATE',
            data: { ...appointment, ...updatedData }
          })
        }).catch(e => console.error(e));
      }

    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "appointments");
      setError("Failed to update appointment. Please make sure details are valid.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!appointment) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "appointments", appointment.id), {
        status: "Refund Requested"
      });
      setAppointment({ ...appointment, status: "Refund Requested" });
      setCancelModal(false);
      setSuccessMessage("Cancellation and refund request has been initiated.");

      if (appointment.patientEmail) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: appointment.patientEmail,
            subject: 'Refund Requested - Dr. Ayazullah Clinic',
            type: 'REFUND_REQUEST',
            data: appointment
          })
        }).catch(e => console.error(e));
      }

    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "appointments");
      setError("Failed to cancel appointment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div className="flex flex-col text-center">
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Manage Your Booking</h1>
        <p className="font-body-md text-on-surface-variant mt-2">View, modify, or cancel your therapy appointment.</p>
      </div>

      <form onSubmit={handleLookup} className="bg-surface rounded-2xl shadow-sm border border-surface-container p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-label-md text-label-md font-semibold text-on-surface">
              Transaction ID / REF
            </label>
            <input 
              type="text" 
              value={transactionId} 
              onChange={e => { setTransactionId(e.target.value); setError(""); setSuccessMessage(""); }} 
              className="w-full h-12 px-4 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-transparent focus:border-primary transition-all" 
              placeholder="e.g., 312445436546..." 
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-label-md text-label-md font-semibold text-on-surface">
              Phone Number
            </label>
            <input 
              type="text" 
              value={patientPhone} 
              onChange={e => { setPatientPhone(e.target.value); setError(""); setSuccessMessage(""); }} 
              className="w-full h-12 px-4 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-transparent focus:border-primary transition-all" 
              placeholder="e.g., 0330 9284551 or +92330..." 
            />
          </div>
        </div>
        <span className="text-[12px] text-on-surface-variant">
          Tip: You can search by your Transaction ID, your Phone Number, or both.
        </span>
        
        {error && <div className="p-3 bg-error/10 text-error font-body-sm rounded-lg">{error}</div>}
        {successMessage && <div className="p-3 bg-primary/15 text-primary font-body-sm rounded-lg flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">check_circle</span>{successMessage}</div>}

        <button 
          type="submit" 
          disabled={loading}
          className="w-full md:w-auto md:self-end h-12 px-8 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-lg font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Searching..." : "Lookup Booking"}
        </button>
      </form>

      {appointment && (
        <div className="bg-surface rounded-2xl shadow-sm border border-surface-container p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-surface-container pb-4">
            <h2 className="font-headline-sm font-bold text-on-surface">Appointment Details</h2>
            <span className={clsx(
              "px-3 py-1 rounded-full text-[12px] font-bold uppercase tracking-wider",
              appointment.status === 'Completed' ? "bg-primary/15 text-primary-fixed-dim" : 
              appointment.status === 'Verified' ? "bg-secondary/15 text-secondary" : 
              appointment.status === 'Refund Requested' ? "bg-error/15 text-error" : 
              appointment.status === 'Cancelled' ? "bg-error/15 text-error" : 
              "bg-tertiary/15 text-tertiary"
            )}>
              {appointment.status || 'Pending'}
            </span>
          </div>

          {(appointment.status === 'Refund Requested' || appointment.status === 'Cancelled') && (
            <div className="bg-error/10 text-error p-4 rounded-xl flex gap-3 items-start">
              <span className="material-symbols-outlined shrink-0">info</span>
              <div>
                <p className="font-bold text-[14px]">Refund Initiated</p>
                <p className="text-[13px] mt-1 opacity-90">Your appointment has been cancelled. The refund will be automatically processed, and you will receive the amount within 1 to 2 working days. You will be notified once it is complete.</p>
              </div>
            </div>
          )}

          {successMessage && !isEditing && (
            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Patient Name</span>
              <span className="font-body-md font-semibold text-on-surface">{appointment.patientName}</span>
            </div>
            
            {isEditing ? (
              <div className="flex flex-col gap-6 col-span-1 md:col-span-2 mt-4 pt-6 border-t border-surface-container">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-headline-sm font-bold text-on-surface">Reschedule Date & Therapy Program</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Select an open date to view clinic slots. Only available open slots are shown below.
                    </p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(false)}
                    className="text-xs font-semibold text-on-surface-variant hover:text-on-surface px-2.5 py-1 rounded-md bg-surface-container cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {/* Therapy Program Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold text-on-surface">Therapy Care Program</label>
                  <select 
                    value={editCategory} 
                    onChange={e => setEditCategory(e.target.value)} 
                    className="h-11 px-3 rounded-lg bg-surface-container-low border border-surface-container font-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Date Picker Ribbon + Custom Date Input */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="font-label-sm font-semibold text-on-surface">Choose Appointment Date</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-on-surface-variant hidden sm:inline">Or pick specific date:</span>
                      <input 
                        type="date" 
                        min={getLocalDateKey(new Date())} 
                        value={selectedDateKey} 
                        onChange={e => {
                          if (e.target.value) {
                            const parsed = parseAnyDate(e.target.value);
                            setEditDate(getFormattedDateLabel(parsed));
                            setEditTime(""); // reset slot selection so user picks an open slot
                          }
                        }} 
                        className="h-8 px-2 text-xs rounded-md bg-surface-container-low border border-surface-container text-on-surface focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* 14-day horizontal quick ribbon */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {upcomingDays.map((day) => {
                      const isSelected = selectedDateKey === day.key || editDate === day.label;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            setEditDate(day.label);
                            setEditTime(""); // reset slot selection
                          }}
                          className={clsx(
                            "flex flex-col items-center justify-center min-w-[70px] py-2.5 px-2 rounded-xl border transition-all cursor-pointer shrink-0 text-center",
                            isSelected 
                              ? "bg-primary text-on-primary border-primary shadow-sm font-bold scale-[1.02]" 
                              : "bg-surface-container-lowest hover:bg-surface-container border-surface-container text-on-surface"
                          )}
                        >
                          <span className={clsx("text-[10px] font-semibold tracking-wider", isSelected ? "text-on-primary/90" : "text-on-surface-variant")}>
                            {day.weekday}
                          </span>
                          <span className="text-base font-bold my-0.5">{day.dayNum}</span>
                          <span className={clsx("text-[10px]", isSelected ? "text-on-primary/90" : "text-on-surface-variant")}>
                            {day.month}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Date Header & Status */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low border border-surface-container">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
                    <div>
                      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Selected Date</span>
                      <p className="font-label-md font-bold text-on-surface">{selectedDateLabel}</p>
                    </div>
                  </div>
                  {bookedSlots.length > 0 && (
                    <span className="text-[11px] font-medium text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
                      {bookedSlots.length} slot(s) booked by others
                    </span>
                  )}
                </div>

                {/* Available Schedule Slots */}
                {loadingSchedule ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                    <span className="text-xs">Checking real-time schedule & slot availability...</span>
                  </div>
                ) : dayAvailability.isDayOff ? (
                  <div className="p-4 rounded-xl bg-error/10 border border-error/20 flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-[22px] shrink-0">event_busy</span>
                    <div>
                      <h4 className="font-bold text-error text-sm">Clinic Closed on this Date</h4>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {dayAvailability.reason || "Doctor is not taking appointments on this date."}
                      </p>
                      <p className="text-xs text-primary font-semibold mt-2">
                        Please pick an open clinic day from the days above to view available appointment slots.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {/* Morning Session */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[18px]">wb_sunny</span>
                          <span className="font-label-md font-bold text-on-surface">
                            {dayAvailability.morningName || "Morning Clinical Evaluation"}
                          </span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-medium">
                          {availableMorningCount} of {morningSlotsData.length} available
                        </span>
                      </div>

                      {morningSlotsData.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {morningSlotsData.map((slot) => {
                            const isSelected = editTime === slot.time;
                            const isBooked = slot.isBooked;
                            return (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={isBooked}
                                onClick={() => {
                                  if (!isBooked) {
                                    setEditTime(slot.time);
                                    setError("");
                                  }
                                }}
                                className={clsx(
                                  "py-2.5 px-3 rounded-xl text-center font-label-md transition-all flex flex-col items-center justify-center border",
                                  isBooked
                                    ? "bg-surface-container/60 border-surface-container text-on-surface-variant opacity-60 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-primary text-on-primary border-primary shadow-sm font-bold scale-[1.02] cursor-pointer"
                                    : "bg-surface-container-lowest hover:bg-surface-container border-surface-container text-on-surface font-medium cursor-pointer"
                                )}
                              >
                                <span className={clsx("text-[13px]", isBooked && "line-through opacity-80")}>{slot.time}</span>
                                <span className={clsx(
                                  "text-[10px] mt-0.5",
                                  isBooked 
                                    ? "text-on-surface-variant font-medium" 
                                    : isSelected 
                                    ? "text-on-primary/90 font-bold" 
                                    : "text-primary font-semibold"
                                )}>
                                  {isBooked ? "Booked" : isSelected ? "Selected ✓" : "Available"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant italic py-2 bg-surface-container-low px-3 rounded-lg">
                          No morning slots configured for this date.
                        </p>
                      )}
                    </div>

                    {/* Afternoon Session */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-secondary text-[18px]">routine</span>
                          <span className="font-label-md font-bold text-on-surface">
                            {dayAvailability.afternoonName || "Afternoon & Evening Sessions"}
                          </span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-medium">
                          {availableAfternoonCount} of {afternoonSlotsData.length} available
                        </span>
                      </div>

                      {afternoonSlotsData.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {afternoonSlotsData.map((slot) => {
                            const isSelected = editTime === slot.time;
                            const isBooked = slot.isBooked;
                            return (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={isBooked}
                                onClick={() => {
                                  if (!isBooked) {
                                    setEditTime(slot.time);
                                    setError("");
                                  }
                                }}
                                className={clsx(
                                  "py-2.5 px-3 rounded-xl text-center font-label-md transition-all flex flex-col items-center justify-center border",
                                  isBooked
                                    ? "bg-surface-container/60 border-surface-container text-on-surface-variant opacity-60 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-primary text-on-primary border-primary shadow-sm font-bold scale-[1.02] cursor-pointer"
                                    : "bg-surface-container-lowest hover:bg-surface-container border-surface-container text-on-surface font-medium cursor-pointer"
                                )}
                              >
                                <span className={clsx("text-[13px]", isBooked && "line-through opacity-80")}>{slot.time}</span>
                                <span className={clsx(
                                  "text-[10px] mt-0.5",
                                  isBooked 
                                    ? "text-on-surface-variant font-medium" 
                                    : isSelected 
                                    ? "text-on-primary/90 font-bold" 
                                    : "text-primary font-semibold"
                                )}>
                                  {isBooked ? "Booked" : isSelected ? "Selected ✓" : "Available"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-on-surface-variant italic py-2 bg-surface-container-low px-3 rounded-lg">
                          No afternoon/evening slots configured for this date.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Active Selection Summary Banner */}
                {editTime && !dayAvailability.isDayOff && (
                  <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                      <span className="text-xs font-semibold text-on-surface">
                        New Selected Slot: <strong className="text-primary text-sm ml-1">{editTime}</strong> on <strong>{selectedDateLabel}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-primary font-bold bg-surface px-2 py-0.5 rounded-full shadow-xs">
                      Confirmed Available
                    </span>
                  </div>
                )}

                {error && <div className="p-3 bg-error/10 text-error font-body-sm rounded-lg">{error}</div>}

                {/* Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={handleUpdate} 
                    disabled={loading || dayAvailability.isDayOff || !editTime} 
                    className="px-8 py-3 bg-primary hover:bg-primary-container text-on-primary rounded-full font-label-md font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">check</span>
                        Confirm & Save Rescheduled Slot
                      </>
                    )}
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditDate(appointment.date || "");
                      setEditTime(appointment.time || "");
                      setEditCategory(appointment.category || "");
                    }} 
                    className="px-6 py-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-full font-label-md font-bold transition-all cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Date & Time</span>
                    {appointment.status !== 'Cancelled' && appointment.status !== 'Refund Requested' && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditDate(appointment.date || "");
                          setEditTime(appointment.time || "");
                          setEditCategory(appointment.category || "");
                          setIsEditing(true);
                        }}
                        className="text-xs font-bold text-primary hover:text-primary/80 hover:underline flex items-center gap-1 cursor-pointer"
                        title="Change appointment date or time"
                      >
                        <span className="material-symbols-outlined text-[15px]">schedule</span>
                        Change Time
                      </button>
                    )}
                  </div>
                  <span className="font-body-md font-semibold text-on-surface">{appointment.date} at {appointment.time}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Therapy Program</span>
                  <span className="font-body-md font-semibold text-on-surface">{appointment.category}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Fee Paid</span>
                  <span className="font-body-md font-semibold text-on-surface">{appointment.fee} via {appointment.paymentMethod}</span>
                </div>
              </>
            )}
          </div>

          {!isEditing && (
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-surface-container">
              <button 
                type="button"
                onClick={() => {
                  generateAppointmentPDF({
                    patientName: appointment.patientName || 'Valued Patient',
                    patientPhone: appointment.patientPhone || appointment.phone || '',
                    patientEmail: appointment.patientEmail || appointment.email || '',
                    patientAge: appointment.patientAge || '',
                    date: appointment.date,
                    time: appointment.time,
                    category: appointment.category,
                    mode: appointment.mode && !appointment.mode.includes("Suite 402") ? appointment.mode : 'In-Clinic (Pakland Plaza G-8)',
                    clinicName: 'Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic',
                    clinicAddress: 'Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad',
                    fee: typeof appointment.fee === 'number' ? appointment.fee : (Number(String(appointment.fee || '').replace(/[^0-9]/g, '')) || 5000),
                    paymentMethod: appointment.paymentMethod || 'Online Transfer',
                    transactionId: appointment.transactionId || appointment.id,
                    ticketId: `AX-${(appointment.transactionId || appointment.id || '829104').substring(0, 6).toUpperCase()}`
                  });
                }}
                className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                Download PDF Slip
              </button>

              {appointment.status !== 'Cancelled' && appointment.status !== 'Refund Requested' && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditDate(appointment.date || "");
                    setEditTime(appointment.time || "");
                    setEditCategory(appointment.category || "");
                    setIsEditing(true);
                  }}
                  className="px-6 py-2.5 rounded-full border border-primary text-primary hover:bg-primary/5 font-label-md font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                  Change Date & Time
                </button>
              )}

              {(appointment.status === 'Pending' || appointment.status === 'Verified') && (
                <button 
                  type="button"
                  onClick={() => setCancelModal(true)}
                  className="px-6 py-2.5 rounded-full bg-error/10 text-error hover:bg-error/20 font-label-md font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  Cancel Booking
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error mx-auto mb-2">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <h3 className="font-headline-sm text-center font-bold text-on-surface">Cancel Booking?</h3>
            <p className="font-body-sm text-center text-on-surface-variant">
              Are you sure you want to cancel this booking? If you request a refund, a <strong>10% processing fee</strong> will be deducted from your original payment.
            </p>
            {appointment?.fee && (() => {
              const feeVal = typeof appointment.fee === 'number' 
                ? appointment.fee 
                : (parseInt(String(appointment.fee).replace(/\D/g, ''), 10) || 0);
              return (
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30 flex flex-col gap-1 text-[13px]">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Original Paid:</span>
                    <span>{typeof appointment.fee === 'number' ? `Rs. ${appointment.fee.toLocaleString()}` : appointment.fee}</span>
                  </div>
                  <div className="flex justify-between text-error font-medium">
                    <span>10% Deduction:</span>
                    <span>- Rs. {Math.round(feeVal * 0.1).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-on-surface font-bold pt-1 border-t border-surface-container">
                    <span>Refund Amount:</span>
                    <span>Rs. {Math.round(feeVal * 0.9).toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={handleCancel} disabled={loading} className="w-full h-11 bg-error text-surface rounded-full font-label-md font-bold hover:bg-error/90 transition-colors">
                {loading ? "Processing..." : "Confirm Cancellation & Refund"}
              </button>
              <button onClick={() => setCancelModal(false)} className="w-full h-11 bg-surface-container-low text-on-surface rounded-full font-label-md font-bold hover:bg-surface-container transition-colors">
                Keep My Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
