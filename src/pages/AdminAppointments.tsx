import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { generateAppointmentPDF } from "../lib/pdfGenerator";

/**
 * Checks whether the current system time has reached or passed the scheduled appointment date and time.
 */
export function isAppointmentTimeReached(dateStr?: string, timeStr?: string): boolean {
  if (!dateStr) return true;
  try {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      year = y;
      month = m - 1;
      day = d;
    } else {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        year = parsedDate.getFullYear();
        month = parsedDate.getMonth();
        day = parsedDate.getDate();
      }
    }

    let hours = 10;
    let minutes = 0;
    if (timeStr) {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        const ampm = match[3]?.toUpperCase();
        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;
      }
    }

    const scheduledDate = new Date(year, month, day, hours, minutes, 0);
    return now.getTime() >= scheduledDate.getTime();
  } catch (e) {
    return true;
  }
}

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [appointmentToDelete, setAppointmentToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Time Change / Rescheduling State
  const [aptToReschedule, setAptToReschedule] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [notifyPatientEmail, setNotifyPatientEmail] = useState(true);
  const [isRescheduling, setIsRescheduling] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('timestamp', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAppointments(apts);
    }, (error) => {
      console.error("Failed to stream appointments:", error);
    });
    return () => unsubscribe();
  }, [sortOrder]);

  const filtered = appointments.filter(a => {
    const matchesSearch = a.patientName?.toLowerCase().includes(search.toLowerCase()) || 
                          a.patientPhone?.includes(search) || 
                          a.transactionId?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || (a.status || 'Pending') === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleVerify = async (aptToUpdate: any) => {
    setUpdatingId(aptToUpdate.id);
    setActionFeedback(null);
    try {
      await updateDoc(doc(db, 'appointments', aptToUpdate.id), {
        status: 'Verified'
      });
      setActionFeedback({
        type: 'success',
        message: `Appointment for ${aptToUpdate.patientName || 'Patient'} marked as Verified.`
      });
      setTimeout(() => setActionFeedback(null), 4000);
      
      // Send confirmation email
      if (aptToUpdate.patientEmail) {
        try {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: aptToUpdate.patientEmail,
              subject: 'Appointment Confirmed - Dr. Ayazullah Clinic',
              type: 'BOOKING_CONFIRMATION',
              data: aptToUpdate
            })
          });
        } catch (err) {
          console.error('Failed to send confirmation email', err);
        }
      }
    } catch (error) {
      console.error("Verify status error:", error);
      setActionFeedback({
        type: 'error',
        message: "Failed to verify appointment status."
      });
      try {
        handleFirestoreError(error, OperationType.UPDATE, `appointments/${aptToUpdate.id}`);
      } catch {}
    } finally {
      setUpdatingId(null);
    }
  };

  const handleComplete = async (aptToUpdate: any) => {
    setUpdatingId(aptToUpdate.id);
    setActionFeedback(null);
    try {
      await updateDoc(doc(db, 'appointments', aptToUpdate.id), {
        status: 'Completed'
      });
      setActionFeedback({
        type: 'success',
        message: `Appointment for ${aptToUpdate.patientName || 'Patient'} marked as Completed.`
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (error) {
      console.error("Complete status error:", error);
      setActionFeedback({
        type: 'error',
        message: "Failed to mark appointment as completed."
      });
      try {
        handleFirestoreError(error, OperationType.UPDATE, `appointments/${aptToUpdate.id}`);
      } catch {}
    } finally {
      setUpdatingId(null);
    }
  };

  const handleProcessRefund = async (aptToUpdate: any) => {
    setUpdatingId(aptToUpdate.id);
    setActionFeedback(null);
    try {
      await updateDoc(doc(db, 'appointments', aptToUpdate.id), {
        status: 'Cancelled',
        refundStatus: 'Processed',
        refundProcessedAt: new Date().toISOString()
      });

      const recipientEmail = aptToUpdate.patientEmail || aptToUpdate.email;
      let emailSentNotice = "";

      if (recipientEmail) {
        try {
          const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: recipientEmail,
              subject: 'Your Payment Has Been Refunded - Dr. Ayazullah Clinic',
              type: 'REFUND_PROCESSED',
              data: {
                ...aptToUpdate,
                refundProcessedAt: new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              }
            })
          });
          const resData = await res.json();
          if (resData.success) {
            emailSentNotice = ` Confirmation email sent to ${recipientEmail}.`;
          }
        } catch (emailErr) {
          console.error("Failed to send refund notification email:", emailErr);
        }
      }

      setActionFeedback({
        type: 'success',
        message: `Refund processed for ${aptToUpdate.patientName || 'Patient'}.${emailSentNotice}`
      });
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (error) {
      console.error("Process refund error:", error);
      setActionFeedback({
        type: 'error',
        message: "Failed to update refund status."
      });
      try {
        handleFirestoreError(error, OperationType.UPDATE, `appointments/${aptToUpdate.id}`);
      } catch {}
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!appointmentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'appointments', appointmentToDelete.id));
      setAppointmentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `appointments/${appointmentToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Time Change / Rescheduling Handler
  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aptToReschedule || !rescheduleDate || !rescheduleTime) return;
    setIsRescheduling(true);
    setActionFeedback(null);
    try {
      const prevDate = aptToReschedule.date;
      const prevTime = aptToReschedule.time;

      await updateDoc(doc(db, 'appointments', aptToReschedule.id), {
        date: rescheduleDate,
        time: rescheduleTime,
        rescheduledAt: new Date().toISOString(),
        previousSchedule: `${prevDate} at ${prevTime}`,
        rescheduleReason: rescheduleReason.trim() || undefined
      });

      // Automated email notification to patient
      let emailNotice = "";
      if (notifyPatientEmail && (aptToReschedule.patientEmail || aptToReschedule.email)) {
        const targetEmail = aptToReschedule.patientEmail || aptToReschedule.email;
        try {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: targetEmail,
              subject: 'Appointment Rescheduled - Dr. Ayazullah Clinic',
              type: 'BOOKING_CONFIRMATION',
              data: {
                ...aptToReschedule,
                date: rescheduleDate,
                time: rescheduleTime,
                adminNotes: rescheduleReason.trim()
                  ? `Your appointment was rescheduled from ${prevDate} (${prevTime}) to ${rescheduleDate} (${rescheduleTime}). Reason / Clinic Note: ${rescheduleReason.trim()}`
                  : `Your appointment schedule has been adjusted to ${rescheduleDate} at ${rescheduleTime}.`
              }
            })
          });
          emailNotice = ` Confirmation email dispatched to ${targetEmail}.`;
        } catch (emailErr) {
          console.warn('Failed to send reschedule email notice:', emailErr);
        }
      }

      setActionFeedback({
        type: 'success',
        message: `Appointment for ${aptToReschedule.patientName || 'Patient'} rescheduled to ${rescheduleDate} at ${rescheduleTime}.${emailNotice}`
      });
      setTimeout(() => setActionFeedback(null), 5000);
      setAptToReschedule(null);
    } catch (err) {
      console.error('Error rescheduling appointment:', err);
      setActionFeedback({
        type: 'error',
        message: 'Failed to reschedule appointment.'
      });
      try {
        handleFirestoreError(err, OperationType.UPDATE, `appointments/${aptToReschedule.id}`);
      } catch {}
    } finally {
      setIsRescheduling(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Appointments Registry</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Manage all triage and clinical consultation bookings.</p>
        </div>
        <select 
          value={sortOrder} 
          onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
          className="h-10 px-4 rounded-lg bg-surface-container-low text-on-surface font-label-md focus:outline-none border border-transparent focus:border-primary transition-colors cursor-pointer"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {actionFeedback && (
        <div className={clsx(
          "p-4 rounded-xl flex items-center justify-between border transition-all animate-in fade-in",
          actionFeedback.type === 'success' ? "bg-primary/10 border-primary/20 text-primary" : "bg-error/10 border-error/20 text-error"
        )}>
          <div className="flex items-center gap-2 font-medium text-sm">
            <span className="material-symbols-outlined text-[20px]">
              {actionFeedback.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{actionFeedback.message}</span>
          </div>
          <button 
            onClick={() => setActionFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
        <div className="p-4 border-b border-surface-container bg-surface-container-lowest flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="relative w-full md:w-96">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
             <input 
               type="text" 
               placeholder="Search by patient, phone, or REF ID..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface-container-low text-on-surface font-body-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
             />
           </div>
           <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
             {["All", "Pending", "Verified", "Refund Requested", "Completed", "Cancelled"].map(status => (
               <button 
                 key={status}
                 onClick={() => setStatusFilter(status)}
                 className={clsx("px-4 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap transition-colors border", 
                   statusFilter === status ? "bg-primary text-on-primary border-primary shadow-sm" : "bg-transparent text-on-surface-variant border-surface-container hover:border-outline-variant")}
               >
                 {status}
               </button>
             ))}
           </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left font-body-sm text-body-sm text-on-surface whitespace-nowrap">
            <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-6 py-3 font-medium">Patient Details</th>
                <th className="px-6 py-3 font-medium">Schedule</th>
                <th className="px-6 py-3 font-medium">Clinical Program</th>
                <th className="px-6 py-3 font-medium">Payment Info</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {filtered.length === 0 ? (
                 <tr>
                   <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                     <div className="flex flex-col items-center gap-2">
                       <span className="material-symbols-outlined text-[32px] opacity-40">search_off</span>
                       <span>No appointments match your criteria.</span>
                     </div>
                   </td>
                 </tr>
              ) : (
                filtered.map((apt, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">{apt.patientName}</span>
                        <span className="text-[12px] text-on-surface-variant">{apt.patientPhone}</span>
                        {apt.patientEmail && <span className="text-[11px] text-on-surface-variant/80">{apt.patientEmail}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{apt.date}</span>
                        <span className="font-bold text-primary">{apt.time}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface truncate max-w-[150px]">{apt.category}</span>
                        <span className="text-[11px] text-on-surface-variant">{apt.mode}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{apt.fee}</span>
                        <div className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                          <span className="font-semibold">{apt.paymentMethod}</span> • <span className="font-mono">REF: {apt.transactionId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={clsx("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", 
                        apt.status === 'Completed' ? "bg-primary/15 text-primary-fixed-dim" : 
                        apt.status === 'Verified' ? "bg-secondary/15 text-secondary" : 
                        apt.status === 'Refund Requested' ? "bg-error/15 text-error" :
                        apt.status === 'Cancelled' ? "bg-error/15 text-error opacity-70" :
                        "bg-tertiary/15 text-tertiary")}>
                        {apt.status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Download PDF slip */}
                        <button
                          type="button"
                          onClick={() => {
                            generateAppointmentPDF({
                              patientName: apt.patientName || 'Valued Patient',
                              patientPhone: apt.patientPhone || apt.phone || '',
                              patientEmail: apt.patientEmail || apt.email || '',
                              patientAge: apt.patientAge || '',
                              date: apt.date,
                              time: apt.time,
                              category: apt.category,
                              mode: apt.mode || 'In-Clinic Consultation',
                              fee: typeof apt.fee === 'number' ? apt.fee : (Number(String(apt.fee || '').replace(/[^0-9]/g, '')) || 5000),
                              paymentMethod: apt.paymentMethod || 'Direct Transfer',
                              transactionId: apt.transactionId || apt.id,
                              ticketId: `AX-${(apt.transactionId || apt.id || '829104').substring(0, 6).toUpperCase()}`
                            });
                          }}
                          title="Download Patient Slip (PDF)"
                          className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors border border-primary/20 flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                        </button>

                        {(apt.status === 'Pending' || !apt.status) && (
                          <button 
                            disabled={updatingId === apt.id}
                            onClick={() => handleVerify(apt)}
                            className="text-primary hover:bg-primary/10 px-3 py-1.5 rounded-md font-label-sm font-semibold transition-colors border border-primary/20 cursor-pointer flex items-center gap-1">
                            {updatingId === apt.id ? (
                              <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                            ) : null}
                            <span>Mark Verified</span>
                          </button>
                        )}
                        {apt.status === 'Verified' && (
                          isAppointmentTimeReached(apt.date, apt.time) ? (
                            <button 
                              disabled={updatingId === apt.id}
                              onClick={() => handleComplete(apt)}
                              className="text-primary hover:bg-primary/10 px-3 py-1.5 rounded-md font-label-sm font-semibold transition-colors border border-primary/20 cursor-pointer flex items-center gap-1">
                              {updatingId === apt.id ? (
                                <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                              ) : null}
                              <span>Mark Completed</span>
                            </button>
                          ) : (
                            <span 
                              title="Mark Completed unlocks at scheduled appointment date & time"
                              className="text-on-surface-variant/70 text-[11px] font-medium bg-surface-container-low px-2.5 py-1 rounded-md border border-surface-container flex items-center gap-1 cursor-not-allowed select-none opacity-80"
                            >
                              <span className="material-symbols-outlined text-[13px] text-tertiary">lock_clock</span>
                              <span>Time Pending</span>
                            </span>
                          )
                        )}
                        {apt.status === 'Refund Requested' && (
                          <button 
                            disabled={updatingId === apt.id}
                            onClick={() => handleProcessRefund(apt)}
                            className="text-error hover:bg-error/10 px-3 py-1.5 rounded-md font-label-sm font-semibold transition-colors border border-error/20 cursor-pointer flex items-center gap-1">
                            {updatingId === apt.id ? (
                              <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                            ) : null}
                            <span>Process Refund (-10%)</span>
                          </button>
                        )}
                        {apt.status === 'Completed' && (
                          <span className="text-on-surface-variant text-[12px] italic font-medium">Done</span>
                        )}
                        {apt.status === 'Cancelled' && (
                          <span className="text-error/70 text-[12px] italic">Refunded</span>
                        )}

                        {apt.status !== 'Cancelled' && apt.status !== 'Completed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAptToReschedule(apt);
                              setRescheduleDate(apt.date || "");
                              setRescheduleTime(apt.time || "10:00 AM");
                              setRescheduleReason("");
                              setNotifyPatientEmail(true);
                            }}
                            title="Reschedule / Change Appointment Time"
                            aria-label="Change appointment time"
                            className="p-1.5 text-primary hover:bg-primary/10 rounded-md transition-colors border border-primary/20 flex items-center justify-center cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">schedule</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setAppointmentToDelete(apt)}
                          title="Delete invalid or demo appointment"
                          aria-label="Delete appointment"
                          className="p-1.5 text-error hover:bg-error/10 rounded-md transition-colors border border-error/20 flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reschedule / Time Change Modal */}
      {aptToReschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveReschedule}
            className="bg-surface rounded-2xl max-w-lg w-full p-6 shadow-xl border border-surface-container-high flex flex-col gap-4"
          >
            <div className="flex items-center justify-between border-b border-surface-container pb-3">
              <div className="flex items-center gap-2.5 text-primary">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">update</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-base font-bold text-on-surface">Reschedule Appointment</h3>
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    Change consultation date, time, and notify patient
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAptToReschedule(null)}
                className="p-1 text-on-surface-variant hover:bg-surface-container rounded-lg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Current details badge */}
            <div className="p-3 bg-surface-container-low rounded-xl text-xs flex flex-col gap-1.5 border border-surface-container">
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Patient:</span>
                <span className="font-semibold text-on-surface">{aptToReschedule.patientName || "Valued Patient"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Current Schedule:</span>
                <span className="font-bold text-error line-through">{aptToReschedule.date} at {aptToReschedule.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Category &amp; Mode:</span>
                <span className="text-on-surface">{aptToReschedule.category} ({aptToReschedule.mode || "In-Clinic"})</span>
              </div>
              {aptToReschedule.patientEmail && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant font-medium">Email:</span>
                  <span className="text-primary font-medium">{aptToReschedule.patientEmail}</span>
                </div>
              )}
            </div>

            {/* New Date and Time inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-on-surface">New Appointment Date:</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-on-surface">New Time Slot:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 11:30 AM"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Quick Time Slots Selection */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-on-surface-variant">Quick Pick Time Slot:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
                  "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM",
                  "06:00 PM", "07:00 PM", "08:00 PM"
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRescheduleTime(t)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                      rescheduleTime === t
                        ? "bg-primary text-on-primary shadow-xs"
                        : "bg-surface-container hover:bg-surface-container-high text-on-surface"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Note / Reason */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-on-surface">
                Reason / Note for Patient (Optional):
              </label>
              <textarea
                rows={2}
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Moved forward by 30 mins as requested, or doctor on clinical rounds..."
                className="w-full p-2.5 text-xs rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Email Notification Toggle */}
            {(aptToReschedule.patientEmail || aptToReschedule.email) && (
              <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyPatientEmail}
                  onChange={(e) => setNotifyPatientEmail(e.target.checked)}
                  className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Email updated booking confirmation to {aptToReschedule.patientEmail || aptToReschedule.email}</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-container">
              <button
                type="button"
                disabled={isRescheduling}
                onClick={() => setAptToReschedule(null)}
                className="px-4 py-2 rounded-lg font-label-md text-xs text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRescheduling}
                className="px-5 py-2 rounded-lg font-label-md text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 shadow-sm transition-all flex items-center gap-1.5"
              >
                {isRescheduling ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    <span>Confirm Reschedule</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {appointmentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-surface-container-high flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-base font-bold text-on-surface">Delete Appointment?</h3>
                <p className="font-body-sm text-xs text-on-surface-variant">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl text-xs flex flex-col gap-1.5 border border-surface-container">
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Patient:</span>
                <span className="font-semibold text-on-surface">{appointmentToDelete.patientName || "Unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Phone:</span>
                <span className="font-mono text-on-surface">{appointmentToDelete.patientPhone || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Schedule:</span>
                <span className="text-on-surface">{appointmentToDelete.date} at {appointmentToDelete.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant font-medium">Payment REF:</span>
                <span className="font-mono text-on-surface">{appointmentToDelete.transactionId || "N/A"}</span>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant">
              Use this option if someone submitted fake or demo information, entered an incorrect phone/email, or spam booking.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAppointmentToDelete(null)}
                className="px-4 py-2 rounded-lg font-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAppointment}
                className="px-4 py-2 rounded-lg font-label-md font-bold bg-error text-on-error hover:bg-error/90 shadow-sm transition-all flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    <span>Delete Appointment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
