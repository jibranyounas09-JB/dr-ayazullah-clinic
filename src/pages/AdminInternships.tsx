import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  getDoc
} from "firebase/firestore";
import { clsx } from "clsx";
import { InternshipOpportunity, InternshipApplication, InternshipAcademySettings } from "../types/internship";
import { DEFAULT_INTERNSHIPS, DEFAULT_ACADEMY_SETTINGS } from "../data/defaultInternships";
import { sanitizeForFirestore } from "../lib/scheduleUtils";

export default function AdminInternships() {
  const [activeTab, setActiveTab] = useState<"opportunities" | "applications" | "settings">("opportunities");
  
  // Opportunities State
  const [opportunities, setOpportunities] = useState<InternshipOpportunity[]>([]);
  const [isLoadingOps, setIsLoadingOps] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  
  // Form fields for Opportunity
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState("Advanced Fellowship");
  const [customTrack, setCustomTrack] = useState("");
  const [duration, setDuration] = useState("3 Months");
  const [eligibility, setEligibility] = useState("DPT Graduates / Licensed PTs");
  const [seats, setSeats] = useState("4 Fellows / Cohort");
  const [intake, setIntake] = useState("Fall 2026 Intake");
  const [status, setStatus] = useState<"Open" | "Waitlist" | "Closing Soon" | "Closed">("Open");
  const [description, setDescription] = useState("");
  const [stipendOrFee, setStipendOrFee] = useState("Merit-Based Mentorship");
  const [isFeatured, setIsFeatured] = useState(false);
  const [includedList, setIncludedList] = useState<string[]>([]);
  const [newIncludedItem, setNewIncludedItem] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // In-app Delete Confirmation
  const [itemToDelete, setItemToDelete] = useState<InternshipOpportunity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Applications State
  const [applications, setApplications] = useState<InternshipApplication[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [selectedApp, setSelectedApp] = useState<InternshipApplication | null>(null);
  const [appFilterStatus, setAppFilterStatus] = useState<string>("All");
  const [appSearchQuery, setAppSearchQuery] = useState<string>("");
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  const [appToDelete, setAppToDelete] = useState<InternshipApplication | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const [quickSelectedAppId, setQuickSelectedAppId] = useState<string>("");

  // Academy Settings State
  const [academySettings, setAcademySettings] = useState<InternshipAcademySettings>(DEFAULT_ACADEMY_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Listen to Opportunities from Firestore
  useEffect(() => {
    const q = query(collection(db, "internships"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const docs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<InternshipOpportunity, "id">)
          }));
          setOpportunities(docs);
        } else {
          // If Firestore is empty, show empty list (no dummy fallback)
          setOpportunities([]);
        }
        setIsLoadingOps(false);
      },
      (error) => {
        console.error("Error listening to internships:", error);
        setOpportunities([]);
        setIsLoadingOps(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Listen to Applications from Firestore & Backend Dual Storage
  useEffect(() => {
    let firestoreDocs: InternshipApplication[] = [];
    let backendDocs: InternshipApplication[] = [];

    const updateCombined = () => {
      const map = new Map<string, InternshipApplication>();
      // 1. Add backend docs
      backendDocs.forEach((app) => {
        if (app.id) map.set(app.id, app);
        else map.set(`${app.email}_${app.fullName}`, app);
      });
      // 2. Merge Firestore docs (Firestore updates will override)
      firestoreDocs.forEach((app) => {
        if (app.id) map.set(app.id, { ...(map.get(app.id) || {}), ...app });
      });

      const combined = Array.from(map.values());
      combined.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      setApplications(combined);
      setIsLoadingApps(false);
    };

    // Listen to Firestore collection directly
    const colRef = collection(db, "internshipApplications");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        firestoreDocs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<InternshipApplication, "id">)
        }));
        updateCombined();
      },
      (error) => {
        console.warn("Notice listening to Firestore applications:", error);
        updateCombined();
      }
    );

    // Fetch from backend API backup
    fetch("/api/internship/applications")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        backendDocs = (data || []).map((item) => ({
          id: item.id,
          ...(item.data || item)
        }));
        updateCombined();
      })
      .catch((e) => console.warn("Backend applications fetch notice:", e));

    return () => unsubscribe();
  }, []);

  // 3. Listen to Academy Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "internshipAcademy"), (docSnap) => {
      if (docSnap.exists()) {
        setAcademySettings({ ...DEFAULT_ACADEMY_SETTINGS, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, []);

  // Open Add Modal
  const handleOpenAdd = () => {
    setCurrentId(null);
    setTitle("");
    setTrack("Advanced Fellowship");
    setCustomTrack("");
    setDuration("3 Months");
    setEligibility("DPT Graduates / Licensed PTs");
    setSeats("4 Fellows / Cohort");
    setIntake("Fall 2026 Intake");
    setStatus("Open");
    setDescription("");
    setStipendOrFee("Merit-Based Mentorship");
    setIsFeatured(true);
    setIncludedList([
      "Direct 1-on-1 patient consultation and evaluation shadowing with Dr. Ayazullah",
      "Hands-on supervised Grade I-V manual spinal and joint mobilization",
      "Official Clinical Practicum Certificate & Recommendation Letter"
    ]);
    setNewIncludedItem("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: InternshipOpportunity) => {
    setCurrentId(item.id || null);
    setTitle(item.title || "");
    const standardTracks = ["Advanced Fellowship", "Clinical Internship", "Clinical Residency", "Clinical Observership", "Elective Rotation"];
    if (standardTracks.includes(item.track)) {
      setTrack(item.track);
      setCustomTrack("");
    } else {
      setTrack("Other");
      setCustomTrack(item.track || "");
    }
    setDuration(item.duration || "3 Months");
    setEligibility(item.eligibility || "DPT Graduates / Licensed PTs");
    setSeats(item.seats || "4 Seats");
    setIntake(item.intake || "Fall 2026 Intake");
    setStatus(item.status || "Open");
    setDescription(item.description || "");
    setStipendOrFee(item.stipendOrFee || "");
    setIsFeatured(!!item.isFeatured);
    setIncludedList(Array.isArray(item.included) ? [...item.included] : []);
    setNewIncludedItem("");
    setIsModalOpen(true);
  };

  // Add Item to Included List
  const handleAddIncludedItem = () => {
    if (!newIncludedItem.trim()) return;
    setIncludedList([...includedList, newIncludedItem.trim()]);
    setNewIncludedItem("");
  };

  // Remove Item from Included List
  const handleRemoveIncludedItem = (index: number) => {
    setIncludedList(includedList.filter((_, i) => i !== index));
  };

  // Save Opportunity
  const handleSaveOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      showToast("Please provide a title and program description.");
      return;
    }

    setIsSaving(true);
    const finalTrack = track === "Other" ? (customTrack.trim() || "Clinical Program") : track;

    const payload: Partial<InternshipOpportunity> = {
      title: title.trim(),
      track: finalTrack,
      duration: duration.trim() || "3 Months",
      eligibility: eligibility.trim() || "DPT Graduates",
      seats: seats.trim() || "4 Seats",
      intake: intake.trim() || "Upcoming Intake",
      status,
      description: description.trim(),
      stipendOrFee: stipendOrFee.trim(),
      isFeatured,
      included: includedList.length > 0 ? includedList : [
        "1-on-1 Patient Assessment Shadowing",
        "Clinical Practicum Certificate"
      ],
      createdAt: new Date().toISOString()
    };

    const sanitized = sanitizeForFirestore(payload);

    try {
      if (currentId && !currentId.startsWith("track-")) {
        // Update existing document
        await setDoc(doc(db, "internships", currentId), sanitized, { merge: true });
        showToast("Internship opportunity updated successfully.");
      } else {
        // Create new document (or clone if it was a default placeholder)
        await addDoc(collection(db, "internships"), sanitized);
        showToast("New internship opportunity added to the Academy!");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save internship:", err);
      showToast("Error saving opportunity to database.");
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Toggle Status
  const handleQuickStatusChange = async (item: InternshipOpportunity, newStatus: "Open" | "Waitlist" | "Closing Soon" | "Closed") => {
    if (!item.id) return;
    try {
      if (item.id.startsWith("track-")) {
        // It's a seeded default, copy into firestore with new status
        const clone = { ...item, status: newStatus };
        delete clone.id;
        await addDoc(collection(db, "internships"), sanitizeForFirestore(clone));
      } else {
        await setDoc(doc(db, "internships", item.id), { status: newStatus }, { merge: true });
      }
      showToast(`Status changed to ${newStatus}`);
    } catch (err) {
      console.error("Error updating status:", err);
      showToast("Could not update status.");
    }
  };

  // Delete Opportunity
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (itemToDelete.id && !itemToDelete.id.startsWith("track-")) {
        await deleteDoc(doc(db, "internships", itemToDelete.id));
      } else {
        // If it was local default, filter out locally
        setOpportunities(opportunities.filter((o) => o.id !== itemToDelete.id));
      }
      showToast("Internship opportunity removed.");
      setItemToDelete(null);
    } catch (err) {
      console.error("Error deleting opportunity:", err);
      showToast("Failed to delete opportunity.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Seed default opportunities to Firestore
  const handleSeedDefaults = async () => {
    setIsSaving(true);
    try {
      for (const item of DEFAULT_INTERNSHIPS) {
        const payload = { ...item };
        delete payload.id;
        await addDoc(collection(db, "internships"), sanitizeForFirestore(payload));
      }
      showToast("Default clinical internship programs published to database!");
    } catch (err) {
      console.error("Error seeding defaults:", err);
      showToast("Failed to seed default programs.");
    } finally {
      setIsSaving(false);
    }
  };

  // Update Application Status & Notes with Automated Email Dispatch
  const handleUpdateApplication = async (newStatus: InternshipApplication["status"], customNoteParam?: string) => {
    if (!selectedApp?.id) return;
    setIsUpdatingApp(true);
    const finalNote = customNoteParam !== undefined ? customNoteParam : adminNoteInput.trim();

    try {
      const updateData = {
        status: newStatus,
        adminNotes: finalNote
      };
      
      try {
        await setDoc(doc(db, "internshipApplications", selectedApp.id), updateData, { merge: true });
      } catch (fErr) {
        console.warn("Firestore update notice:", fErr);
      }

      try {
        await fetch(`/api/internship/applications/${selectedApp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData)
        });
      } catch (bErr) {
        console.warn("Backend update notice:", bErr);
      }

      // Automated Email Notification to Candidate via Resend / Mail Service
      let emailDispatched = false;
      if (sendEmailNotification && selectedApp.email) {
        try {
          const subject =
            newStatus === "Accepted"
              ? `🎉 Candidacy Accepted: ${selectedApp.internshipTitle} - Dr. Ayazullah Clinic`
              : newStatus === "Shortlisted"
              ? `📋 Application Shortlisted: ${selectedApp.internshipTitle} - Dr. Ayazullah Clinic`
              : newStatus === "Interview Scheduled"
              ? `🗓️ Clinical Interview: ${selectedApp.internshipTitle} - Dr. Ayazullah Clinic`
              : newStatus === "Under Review"
              ? `🔍 Candidacy Under Review: ${selectedApp.internshipTitle} - Dr. Ayazullah Clinic`
              : `Application Update: ${selectedApp.internshipTitle} - Dr. Ayazullah Clinic`;

          const emailRes = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: selectedApp.email,
              subject,
              type: "INTERNSHIP_STATUS_UPDATE",
              data: {
                candidateName: selectedApp.fullName,
                internshipTitle: selectedApp.internshipTitle,
                status: newStatus,
                adminNotes: finalNote,
                university: selectedApp.university
              }
            })
          });

          if (emailRes.ok) {
            emailDispatched = true;
          }
        } catch (emailErr) {
          console.warn("Candidate notification email dispatch notice:", emailErr);
        }
      }

      setSelectedApp({
        ...selectedApp,
        status: newStatus,
        adminNotes: finalNote
      });

      // Synchronize state in applications list
      setApplications((prev) =>
        prev.map((app) => (app.id === selectedApp.id ? { ...app, status: newStatus, adminNotes: finalNote } : app))
      );

      if (emailDispatched) {
        showToast(`Status updated to "${newStatus}" & email sent to ${selectedApp.email}!`);
      } else {
        showToast(`Candidate status updated to: ${newStatus}`);
      }
    } catch (err) {
      console.error("Error updating application:", err);
      showToast("Failed to update candidate record.");
    } finally {
      setIsUpdatingApp(false);
    }
  };

  // Permanently Delete Candidate Application Dossier
  const handleDeleteApplication = async (app: InternshipApplication) => {
    if (!app?.id) return;
    setIsDeletingApp(true);
    try {
      // 1. Delete from Firestore
      try {
        await deleteDoc(doc(db, "internshipApplications", app.id));
      } catch (fErr) {
        console.warn("Firestore delete notice:", fErr);
      }

      // 2. Delete from Backend / Neon DB & unlink uploaded CV
      try {
        await fetch(`/api/internship/applications/${app.id}`, {
          method: "DELETE"
        });
      } catch (bErr) {
        console.warn("Backend delete notice:", bErr);
      }

      // 3. Remove from local applications state
      setApplications((prev) => prev.filter((item) => item.id !== app.id));
      if (selectedApp?.id === app.id) {
        setSelectedApp(null);
      }
      setAppToDelete(null);
      if (quickSelectedAppId === app.id) {
        setQuickSelectedAppId("");
      }
      showToast(`Candidacy record for ${app.fullName} has been deleted.`);
    } catch (err) {
      console.error("Error deleting candidate record:", err);
      showToast("Failed to delete candidate record.");
    } finally {
      setIsDeletingApp(false);
    }
  };

  // Save Academy Hero Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, "settings", "internshipAcademy"), sanitizeForFirestore(academySettings), { merge: true });
      showToast("Academy page settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      showToast("Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered Applications
  const filteredApps = applications.filter((app) => {
    const matchesStatus = appFilterStatus === "All" || app.status === appFilterStatus;
    const matchesSearch =
      !appSearchQuery ||
      app.fullName?.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
      app.university?.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
      app.internshipTitle?.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
      app.email?.toLowerCase().includes(appSearchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-container-lowest overflow-y-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 bg-on-surface text-surface text-sm font-medium rounded-xl shadow-xl transition-all animate-bounce">
          <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="p-6 md:p-8 bg-surface border-b border-surface-container sticky top-0 z-30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">school</span>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
              Internship &amp; Fellowship Management
            </h1>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Manage clinical fellowship tracks, internship opportunities, student candidacy applications, and academy content.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 bg-surface-container-high p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("opportunities")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-label-md transition-all font-semibold",
              activeTab === "opportunities"
                ? "bg-surface text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">clinical_notes</span>
            <span>Programs ({opportunities.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("applications")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-label-md transition-all font-semibold relative",
              activeTab === "applications"
                ? "bg-surface text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">group</span>
            <span>Applications</span>
            {applications.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary text-on-primary">
                {applications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-label-md text-label-md transition-all font-semibold",
              activeTab === "settings"
                ? "bg-surface text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>Page Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* ========================================================== */}
        {/* TAB 1: OPPORTUNITIES & PROGRAMS                           */}
        {/* ========================================================== */}
        {activeTab === "opportunities" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-2xl border border-surface-container shadow-sm">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Published Clinical Opportunities
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  These opportunities are visible to students and fellows on the public Internship Academy page.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {opportunities.length === 0 && (
                  <button
                    onClick={handleSeedDefaults}
                    disabled={isSaving}
                    className="px-4 py-2.5 rounded-full border border-outline-variant bg-surface hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
                    <span>Load Default Programs</span>
                  </button>
                )}
                <button
                  onClick={handleOpenAdd}
                  className="px-5 py-2.5 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold shadow-md transition-all flex items-center gap-2 hover:scale-[1.02]"
                >
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  <span>Add Internship Opportunity</span>
                </button>
              </div>
            </div>

            {/* Opportunities Grid */}
            {isLoadingOps ? (
              <div className="flex items-center justify-center p-12">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : opportunities.length === 0 ? (
              <div className="p-12 text-center bg-surface rounded-2xl border border-surface-container flex flex-col items-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-3">school</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">No opportunities added yet</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mt-1 mb-6">
                  Add your first clinical fellowship, residency, or observership opportunity, or populate with the clinic's standard programs.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleSeedDefaults}
                    className="px-5 py-2.5 rounded-full border border-outline-variant bg-surface hover:bg-surface-container text-on-surface font-label-md font-bold"
                  >
                    Load Standard Clinical Tracks
                  </button>
                  <button
                    onClick={handleOpenAdd}
                    className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-label-md font-bold shadow-md"
                  >
                    Create Custom Opportunity
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {opportunities.map((item) => (
                  <div
                    key={item.id || item.title}
                    className="bg-surface rounded-2xl border border-surface-container p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                  >
                    {item.isFeatured && (
                      <div className="absolute top-0 right-0 bg-primary/10 text-primary px-3 py-1 rounded-bl-xl font-label-sm text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">star</span>
                        Featured Track
                      </div>
                    )}

                    <div>
                      {/* Top Badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-[11px] font-bold uppercase tracking-wide">
                          {item.track}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-[11px] font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          {item.duration}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-[11px] font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">group</span>
                          {item.seats}
                        </span>
                        
                        {/* Status dropdown */}
                        <div className="ml-auto">
                          <select
                            value={item.status}
                            onChange={(e) => handleQuickStatusChange(item, e.target.value as any)}
                            className={clsx(
                              "text-xs font-bold px-2.5 py-1 rounded-full border border-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary",
                              item.status === "Open" && "bg-emerald-100 text-emerald-800",
                              item.status === "Closing Soon" && "bg-amber-100 text-amber-800",
                              item.status === "Waitlist" && "bg-sky-100 text-sky-800",
                              item.status === "Closed" && "bg-rose-100 text-rose-800"
                            )}
                          >
                            <option value="Open">● Open (Accepting)</option>
                            <option value="Closing Soon">● Closing Soon</option>
                            <option value="Waitlist">● Waitlist</option>
                            <option value="Closed">● Closed</option>
                          </select>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1 mb-2">
                        {item.title}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3 mb-4 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Details Strip */}
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-surface-container-lowest border border-surface-container mb-4 text-xs text-on-surface-variant">
                        <div>
                          <span className="font-bold text-on-surface block">Eligibility:</span>
                          <span className="line-clamp-1">{item.eligibility}</span>
                        </div>
                        <div>
                          <span className="font-bold text-on-surface block">Intake / Cohort:</span>
                          <span className="line-clamp-1">{item.intake}</span>
                        </div>
                        {item.stipendOrFee && (
                          <div className="col-span-2 pt-1 border-t border-surface-container">
                            <span className="font-bold text-on-surface">Financials: </span>
                            <span>{item.stipendOrFee}</span>
                          </div>
                        )}
                      </div>

                      {/* What is Included (Highlights) */}
                      {item.included && item.included.length > 0 && (
                        <div className="space-y-1.5 mb-5">
                          <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary block">
                            Key Inclusions &amp; Learning Scope:
                          </span>
                          <div className="space-y-1">
                            {item.included.slice(0, 3).map((inc, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs text-on-surface">
                                <span className="material-symbols-outlined text-primary text-[15px] shrink-0 mt-0.5">
                                  check_circle
                                </span>
                                <span className="line-clamp-1">{inc}</span>
                              </div>
                            ))}
                            {item.included.length > 3 && (
                              <span className="text-[11px] text-on-surface-variant pl-5 block">
                                + {item.included.length - 3} more clinical benefits
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-surface-container flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px] text-on-surface-variant">
                        {item.createdAt ? `Added ${new Date(item.createdAt).toLocaleDateString()}` : "Active Opportunity"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container text-on-surface font-label-sm text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setItemToDelete(item)}
                          className="px-3 py-1.5 rounded-lg border border-error/30 hover:bg-error/10 text-error font-label-sm text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: CANDIDATE APPLICATIONS / DOSSIERS                   */}
        {/* ========================================================== */}
        {activeTab === "applications" && (
          <div className="space-y-6">
            {/* ======================================================= */}
            {/* NEW: CANDIDACY FOLLOW-UP & RECORD MANAGEMENT CARD       */}
            {/* ======================================================= */}
            <div className="bg-surface rounded-2xl border border-surface-container p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-surface-container pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">mark_email_read</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
                      <span>Candidacy Follow-up &amp; Record Control</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Email Notifications Active
                      </span>
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Automated candidate communication when shortlisted, invited for interview, accepted, or updated. Admins can permanently purge candidate dossiers and CVs anytime.
                    </p>
                  </div>
                </div>

                {/* Email dispatch toggle & status badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-surface-container text-xs font-semibold text-on-surface cursor-pointer select-none hover:bg-surface-container transition-colors">
                    <input
                      type="checkbox"
                      checked={sendEmailNotification}
                      onChange={(e) => setSendEmailNotification(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span>Email Candidate on Status Change</span>
                  </label>
                </div>
              </div>

              {/* Status Filter Badges Strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-on-surface-variant font-medium">
                  <span>Candidate Pipeline by Stage:</span>
                  {appFilterStatus !== "All" && (
                    <button
                      onClick={() => setAppFilterStatus("All")}
                      className="text-primary hover:underline font-bold text-[11px]"
                    >
                      Reset Filter (Show All {applications.length})
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "All Candidates", status: "All", count: applications.length },
                    { label: "Pending", status: "Pending", count: applications.filter(a => a.status === "Pending").length },
                    { label: "Under Review", status: "Under Review", count: applications.filter(a => a.status === "Under Review").length },
                    { label: "Shortlisted", status: "Shortlisted", count: applications.filter(a => a.status === "Shortlisted").length },
                    { label: "Interview Scheduled", status: "Interview Scheduled", count: applications.filter(a => a.status === "Interview Scheduled").length },
                    { label: "Accepted Fellows", status: "Accepted", count: applications.filter(a => a.status === "Accepted").length },
                    { label: "Not Selected", status: "Not Selected", count: applications.filter(a => a.status === "Not Selected").length },
                  ].map((chip) => (
                    <button
                      key={chip.status}
                      type="button"
                      onClick={() => setAppFilterStatus(chip.status)}
                      className={clsx(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                        appFilterStatus === chip.status
                          ? "bg-primary text-on-primary shadow-sm ring-2 ring-primary/30"
                          : "bg-surface-container-lowest border border-surface-container text-on-surface hover:bg-surface-container"
                      )}
                    >
                      <span>{chip.label}</span>
                      <span className={clsx(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                        appFilterStatus === chip.status ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant"
                      )}>
                        {chip.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Record Action Strip */}
              {applications.length > 0 && (
                <div className="pt-2 border-t border-surface-container flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface-variant font-medium">Quick Select Dossier:</span>
                    <select
                      value={quickSelectedAppId}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        setQuickSelectedAppId(targetId);
                        const match = applications.find(a => a.id === targetId);
                        if (match) {
                          setSelectedApp(match);
                          setAdminNoteInput(match.adminNotes || "");
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border border-surface-container text-on-surface text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary max-w-[260px] truncate"
                    >
                      <option value="">-- Choose Candidate Record --</option>
                      {applications.map((app) => (
                        <option key={app.id} value={app.id}>
                          {app.fullName} ({app.status} - {app.internshipTitle})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-on-surface-variant text-[11px]">
                    <span className="material-symbols-outlined text-[15px] text-error">delete</span>
                    <span>Admins can permanently purge candidate records using the red delete icon in any row.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-2xl border border-surface-container shadow-sm">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Submitted Candidacy Dossiers ({filteredApps.length})
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Review applications submitted by DPT students and clinical fellows through the public website.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search applicant or university..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-60"
                />
                <select
                  value={appFilterStatus}
                  onChange={(e) => setAppFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-surface-container text-on-surface font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Shortlisted">Shortlisted</option>
                  <option value="Interview Scheduled">Interview Scheduled</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Not Selected">Not Selected</option>
                </select>
              </div>
            </div>

            {isLoadingApps ? (
              <div className="flex items-center justify-center p-12">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="p-12 text-center bg-surface rounded-2xl border border-surface-container flex flex-col items-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-2">assignment_ind</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">No applications found</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mt-1">
                  {applications.length === 0
                    ? "When students submit their Candidacy Dossier on the Internship Academy page, they will appear here in real time."
                    : "No applications match your search filter."}
                </p>
              </div>
            ) : (
              <div className="bg-surface rounded-2xl border border-surface-container overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-high text-on-surface-variant font-label-sm text-xs uppercase tracking-wider border-b border-surface-container">
                        <th className="py-3.5 px-4 font-bold">Candidate</th>
                        <th className="py-3.5 px-4 font-bold">Institute &amp; CGPA</th>
                        <th className="py-3.5 px-4 font-bold">Requested Program</th>
                        <th className="py-3.5 px-4 font-bold">Status</th>
                        <th className="py-3.5 px-4 font-bold">Submitted</th>
                        <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container text-body-sm text-sm">
                      {filteredApps.map((app) => (
                        <tr key={app.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-on-surface">{app.fullName}</div>
                            <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                              <span>{app.email}</span>
                              {app.phone && <span>• {app.phone}</span>}
                            </div>
                            {(app.resumeUrl || app.resumeDataUrl) ? (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <a
                                  href={app.resumeUrl || app.resumeDataUrl}
                                  download={app.resumeFileName || `${app.fullName.replace(/\s+/g, '_')}_CV.pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold transition-all shadow-xs"
                                  title="Download or View CV Document"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined text-[14px]">description</span>
                                  <span className="truncate max-w-[130px]">{app.resumeFileName || "Candidate CV"}</span>
                                  <span className="material-symbols-outlined text-[13px]">download</span>
                                </a>
                                {app.resumeFileSize && (
                                  <span className="text-[10px] text-on-surface-variant font-medium">({app.resumeFileSize})</span>
                                )}
                              </div>
                            ) : app.resumeFileName ? (
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-on-surface-variant font-medium">
                                <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                <span className="truncate max-w-[150px]">{app.resumeFileName}</span>
                                {app.resumeFileSize && <span className="text-[10px]">({app.resumeFileSize})</span>}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-on-surface font-medium">{app.university || "Not provided"}</div>
                            <div className="text-xs text-on-surface-variant">
                              Grad: {app.graduationYear || "—"} | CGPA: {app.cgpa || "—"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-primary block">{app.internshipTitle}</span>
                            {app.subSpecialty && (
                              <span className="text-xs text-on-surface-variant">{app.subSpecialty}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={clsx(
                                "px-2.5 py-1 rounded-full text-xs font-bold inline-block",
                                app.status === "Pending" && "bg-slate-100 text-slate-700",
                                app.status === "Under Review" && "bg-amber-100 text-amber-800",
                                app.status === "Shortlisted" && "bg-sky-100 text-sky-800",
                                app.status === "Interview Scheduled" && "bg-indigo-100 text-indigo-800",
                                app.status === "Accepted" && "bg-emerald-100 text-emerald-800",
                                app.status === "Not Selected" && "bg-rose-100 text-rose-800"
                              )}
                            >
                              {app.status || "Pending"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-on-surface-variant">
                            {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : "Recent"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(app.resumeUrl || app.resumeDataUrl) && (
                                <a
                                  href={app.resumeUrl || app.resumeDataUrl}
                                  download={app.resumeFileName || `${app.fullName.replace(/\s+/g, '_')}_CV.pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary text-on-surface-variant transition-colors"
                                  title="Download CV Document"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined text-[18px]">download</span>
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedApp(app);
                                  setAdminNoteInput(app.adminNotes || "");
                                }}
                                className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-xs font-bold transition-colors inline-flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                <span>Review Dossier</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAppToDelete(app);
                                }}
                                className="p-1.5 rounded-lg border border-error/30 bg-error/5 hover:bg-error/15 text-error transition-colors flex items-center justify-center"
                                title="Delete Candidate Record"
                              >
                                <span className="material-symbols-outlined text-[17px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: ACADEMY PAGE SETTINGS                               */}
        {/* ========================================================== */}
        {activeTab === "settings" && (
          <div className="bg-surface rounded-2xl border border-surface-container p-6 md:p-8 shadow-sm max-w-3xl space-y-6">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Internship Academy Hero Content
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Customize the banner headline, admission badge, and fellow stats that appear at the top of the public Academy page.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Top Announcement Badge
                </label>
                <input
                  type="text"
                  value={academySettings.announcementBadge || ""}
                  onChange={(e) =>
                    setAcademySettings({ ...academySettings, announcementBadge: e.target.value })
                  }
                  placeholder="e.g. Summer 2026 Admissions Open — Cohort Intake"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Hero Headline
                </label>
                <input
                  type="text"
                  value={academySettings.heroHeadline || ""}
                  onChange={(e) =>
                    setAcademySettings({ ...academySettings, heroHeadline: e.target.value })
                  }
                  placeholder="Clinical Internship & Fellowship Academy"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Hero Subheadline / Mission Statement
                </label>
                <textarea
                  rows={3}
                  value={academySettings.heroSubheadline || ""}
                  onChange={(e) =>
                    setAcademySettings({ ...academySettings, heroSubheadline: e.target.value })
                  }
                  placeholder="Elevate your DPT degree into elite clinical practice..."
                  className="w-full p-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Fellows &amp; Alumni Highlight Text
                </label>
                <input
                  type="text"
                  value={academySettings.fellowsCountText || ""}
                  onChange={(e) =>
                    setAcademySettings({ ...academySettings, fellowsCountText: e.target.value })
                  }
                  placeholder="Join over 400+ clinical fellows now leading top tier hospitals"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="pt-4 border-t border-surface-container flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold shadow-md transition-all flex items-center gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span>
                      <span>Save Academy Settings</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* ========================================================== */}
      {/* MODAL: ADD / EDIT OPPORTUNITY                             */}
      {/* ========================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-6 border border-surface-container flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-surface-container bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">school</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  {currentId ? "Edit Internship Opportunity" : "Create New Internship Opportunity"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveOpportunity} className="p-6 overflow-y-auto space-y-5">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Program Title *
                </label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Clinical Spine & Manual Therapy Fellowship"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Track / Category & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Track / Category *
                  </label>
                  <select
                    value={track}
                    onChange={(e) => setTrack(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                  >
                    <option value="Advanced Fellowship">Advanced Fellowship</option>
                    <option value="Clinical Internship">Clinical Internship</option>
                    <option value="Clinical Residency">Clinical Residency</option>
                    <option value="Clinical Observership">Clinical Observership</option>
                    <option value="Elective Rotation">Elective Rotation</option>
                    <option value="Other">Other (Custom Track)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Admission Status *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                  >
                    <option value="Open">Open (Accepting Applications)</option>
                    <option value="Closing Soon">Closing Soon</option>
                    <option value="Waitlist">Waitlist Available</option>
                    <option value="Closed">Closed / Admissions Suspended</option>
                  </select>
                </div>
              </div>

              {track === "Other" && (
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Custom Track Name
                  </label>
                  <input
                    type="text"
                    value={customTrack}
                    onChange={(e) => setCustomTrack(e.target.value)}
                    placeholder="e.g. Pediatric Neuro Mobility Rotation"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}

              {/* Duration & Seats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Program Duration
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 6 Months, 12 Weeks, 4 Weekends"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Cohort Capacity / Seats
                  </label>
                  <input
                    type="text"
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    placeholder="e.g. 4 Fellows / Cohort, 6 Seats"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Eligibility & Intake */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Eligibility Criteria
                  </label>
                  <input
                    type="text"
                    value={eligibility}
                    onChange={(e) => setEligibility(e.target.value)}
                    placeholder="e.g. DPT Graduates / Licensed PTs"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md font-bold text-on-surface">
                    Intake Batch / Date
                  </label>
                  <input
                    type="text"
                    value={intake}
                    onChange={(e) => setIntake(e.target.value)}
                    placeholder="e.g. Summer & Fall 2026, Rolling"
                    className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Financials / Stipend or Fee */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Financials / Stipend or Fee Structure
                </label>
                <input
                  type="text"
                  value={stipendOrFee}
                  onChange={(e) => setStipendOrFee(e.target.value)}
                  placeholder="e.g. Merit-Based / Fully Sponsored Mentorship, Free Observership"
                  className="w-full h-11 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  Program Overview &amp; Clinical Scope *
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the clinical focus, what the intern or fellow will experience, learning goals, patient populations..."
                  className="w-full p-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* What is Included (Inclusions List) */}
              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md font-bold text-on-surface">
                  What is Included in This Opportunity
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIncludedItem}
                    onChange={(e) => setNewIncludedItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddIncludedItem();
                      }
                    }}
                    placeholder="e.g. Hands-on supervised spinal mobilizations"
                    className="flex-1 h-10 px-3 rounded-xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddIncludedItem}
                    className="px-4 h-10 rounded-xl bg-primary text-on-primary font-label-md text-xs font-bold hover:bg-primary-container transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Pre-fill suggestion chips */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[
                    "1-on-1 Patient Assessment Shadowing",
                    "Official Practicum Certificate",
                    "Recommendation Letter from Dr. Ayazullah",
                    "Maitland Spinal Mobilization Training",
                    "Biomechanical Gait Analysis Practicum",
                    "Weekly Clinical Radiology Rounds"
                  ].map((chip) => (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => {
                        if (!includedList.includes(chip)) {
                          setIncludedList([...includedList, chip]);
                        }
                      }}
                      className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                {/* Rendered inclusions list */}
                <div className="space-y-1.5 mt-2">
                  {includedList.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container text-xs text-on-surface"
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                        <span>{item}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveIncludedItem(idx)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Featured Flag */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-lowest border border-surface-container">
                <input
                  type="checkbox"
                  id="featuredToggle"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="w-4 h-4 text-primary rounded focus:ring-primary cursor-pointer"
                />
                <label htmlFor="featuredToggle" className="font-label-md text-sm font-semibold text-on-surface cursor-pointer select-none">
                  Feature this opportunity at the top of the Academy page
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-surface-container flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-full font-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md font-bold shadow-md transition-all flex items-center gap-2"
                >
                  {isSaving ? "Saving..." : currentId ? "Update Opportunity" : "Publish Opportunity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: REVIEW CANDIDATE APPLICATION                        */}
      {/* ========================================================== */}
      {selectedApp && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-6 border border-surface-container flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-surface-container bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">assignment_ind</span>
                <div>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                    {selectedApp.fullName}
                  </h3>
                  <span className="text-xs text-on-surface-variant">
                    Applied for: <strong className="text-primary">{selectedApp.internshipTitle}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Academic Profile */}
              <div>
                <h4 className="font-label-sm text-xs uppercase tracking-wider font-bold text-primary mb-3">
                  1. Academic &amp; Contact Details
                </h4>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-surface-container-lowest border border-surface-container text-xs">
                  <div>
                    <span className="text-on-surface-variant block font-medium">Email Address:</span>
                    <span className="font-bold text-on-surface">{selectedApp.email}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Contact Phone:</span>
                    <span className="font-bold text-on-surface">{selectedApp.phone || "Not provided"}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">University / Institute:</span>
                    <span className="font-bold text-on-surface">{selectedApp.university}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Semester / Year:</span>
                    <span className="font-bold text-on-surface">{selectedApp.graduationYear || "—"}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Current CGPA:</span>
                    <span className="font-bold text-on-surface">{selectedApp.cgpa || "—"}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block font-medium">Sub-Specialty Focus:</span>
                    <span className="font-bold text-on-surface">{selectedApp.subSpecialty || "General Musculoskeletal"}</span>
                  </div>
                </div>
              </div>

              {/* Motivation Statement */}
              <div>
                <h4 className="font-label-sm text-xs uppercase tracking-wider font-bold text-primary mb-2">
                  2. Statement of Purpose / Clinical Motivation
                </h4>
                <div className="p-4 rounded-2xl bg-surface-container-lowest border border-surface-container text-body-sm text-on-surface whitespace-pre-wrap leading-relaxed">
                  {selectedApp.motivation || "No statement submitted."}
                </div>
              </div>

              {/* Uploaded CV / Resume */}
              <div>
                <h4 className="font-label-sm text-xs uppercase tracking-wider font-bold text-primary mb-2">
                  3. Uploaded Curriculum Vitae (CV) &amp; Credentials
                </h4>
                {(selectedApp.resumeUrl || selectedApp.resumeDataUrl || selectedApp.resumeFileName) ? (
                  <div className="p-4 rounded-2xl bg-surface-container-lowest border border-surface-container space-y-3">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[24px]">description</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-label-md text-xs font-bold text-on-surface truncate">
                            {selectedApp.resumeFileName || "Candidate_Curriculum_Vitae.pdf"}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            {selectedApp.resumeFileSize || "Document attached"} {selectedApp.resumeFileType ? `• ${selectedApp.resumeFileType}` : ""}
                          </p>
                        </div>
                      </div>

                      {(selectedApp.resumeUrl || selectedApp.resumeDataUrl) && (
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={selectedApp.resumeUrl || selectedApp.resumeDataUrl}
                            download={selectedApp.resumeFileName || `${selectedApp.fullName.replace(/\s+/g, '_')}_CV.pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-sm text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            <span>Download CV</span>
                          </a>
                          <a
                            href={selectedApp.resumeUrl || selectedApp.resumeDataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-sm text-xs font-medium transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            <span>Open in Tab</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Interactive Embedded Document Preview */}
                    {(selectedApp.resumeUrl || selectedApp.resumeDataUrl) && (
                      <div className="overflow-hidden rounded-xl border border-surface-container bg-surface mt-2">
                        <div className="bg-surface-container-high px-3.5 py-2 text-[11px] font-bold text-on-surface-variant flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-primary">
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            Candidate Document Preview
                          </span>
                          <a
                            href={selectedApp.resumeUrl || selectedApp.resumeDataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                          >
                            <span>Open full window</span>
                            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                          </a>
                        </div>
                        <iframe
                          src={selectedApp.resumeUrl || selectedApp.resumeDataUrl}
                          title="Candidate CV Document Preview"
                          className="w-full h-80 border-0 bg-white"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-surface-container-lowest border border-dashed border-surface-container text-center text-xs text-on-surface-variant">
                    No CV document was uploaded for this candidacy application.
                  </div>
                )}
              </div>

              {/* Review Decision & Automated Candidate Notification */}
              <div>
                <h4 className="font-label-sm text-xs uppercase tracking-wider font-bold text-primary mb-2 flex items-center justify-between">
                  <span>4. Clinical Decision &amp; Candidate Notification</span>
                  <span className="text-[11px] font-normal text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-primary">mail</span>
                    Recipient: <strong className="text-on-surface">{selectedApp.email}</strong>
                  </span>
                </h4>
                <div className="p-4 rounded-2xl bg-surface-container-lowest border border-surface-container space-y-4">
                  {/* Status Selection Buttons */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-on-surface">Select Candidacy Stage:</span>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-primary cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={sendEmailNotification}
                          onChange={(e) => setSendEmailNotification(e.target.checked)}
                          className="rounded text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Send email update to candidate</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { st: "Pending" as const, desc: "Awaiting initial screening" },
                        { st: "Under Review" as const, desc: "Clinical dossier being evaluated" },
                        { st: "Shortlisted" as const, desc: "Selected for technical round" },
                        { st: "Interview Scheduled" as const, desc: "Invite candidate to interview" },
                        { st: "Accepted" as const, desc: "Official fellowship offer" },
                        { st: "Not Selected" as const, desc: "Polite cohort update" },
                      ].map(({ st, desc }) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleUpdateApplication(st)}
                          disabled={isUpdatingApp}
                          className={clsx(
                            "p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between",
                            selectedApp.status === st
                              ? "bg-primary text-on-primary border-primary shadow-sm ring-2 ring-primary/20"
                              : "bg-surface border-surface-container text-on-surface hover:bg-surface-container"
                          )}
                        >
                          <span className="text-xs font-bold block">{st}</span>
                          <span className={clsx(
                            "text-[10px] mt-1 line-clamp-1",
                            selectedApp.status === st ? "text-on-primary/80" : "text-on-surface-variant"
                          )}>
                            {desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Internal Faculty Notes / Candidate Instructions */}
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-surface-container">
                    <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                      <span>Faculty Notes &amp; Next Steps (Included in candidate notification)</span>
                      <span className="text-[11px] font-normal text-on-surface-variant">Optional guidance or interview link</span>
                    </label>
                    <textarea
                      rows={3}
                      value={adminNoteInput}
                      onChange={(e) => setAdminNoteInput(e.target.value)}
                      placeholder="e.g. You have been selected for Dr. Ayazullah's clinical fellowship cohort. Please report to the clinical campus on Monday at 09:30 AM with your physical documents..."
                      className="w-full p-2.5 text-xs rounded-xl bg-surface border border-surface-container text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-on-surface-variant">
                        {sendEmailNotification
                          ? "✓ Candidate will receive an email notice when you update status or save notes."
                          : "Email notifications currently disabled for this update."}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateApplication(selectedApp.status)}
                        disabled={isUpdatingApp}
                        className="px-4 py-1.5 text-xs rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        {isUpdatingApp ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[15px]">send</span>
                            <span>Save &amp; Dispatch</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-surface-container bg-surface-container-lowest flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAppToDelete(selectedApp)}
                  className="px-3.5 py-1.5 rounded-xl border border-error/30 bg-error/5 hover:bg-error/15 text-error font-label-md text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  <span>Delete Candidacy Record</span>
                </button>
                <span className="text-xs text-on-surface-variant hidden sm:inline">
                  Submitted {selectedApp.submittedAt ? new Date(selectedApp.submittedAt).toLocaleString() : "Recently"}
                </span>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="px-5 py-2 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs font-bold transition-colors"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* IN-APP DELETE CONFIRMATION MODAL (OPPORTUNITIES)           */}
      {/* ========================================================== */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-6 border border-surface-container text-center space-y-4">
            <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[28px]">delete</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Delete Opportunity?
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Are you sure you want to remove <strong>"{itemToDelete.title}"</strong>? Prospective applicants will no longer see this track.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2 rounded-full border border-surface-container text-on-surface font-label-md text-sm hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-full bg-error text-on-error font-label-md text-sm font-bold shadow-md hover:bg-error/90 transition-colors"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* CANDIDATE APPLICATION DELETE CONFIRMATION MODAL            */}
      {/* ========================================================== */}
      {appToDelete && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl p-6 border border-surface-container text-center space-y-4">
            <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[28px]">person_remove</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Delete Candidacy Record?
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete the application record for{" "}
                <strong className="text-on-surface">{appToDelete.fullName}</strong> applied for{" "}
                <span className="font-semibold text-primary">{appToDelete.internshipTitle}</span>?
              </p>
              <p className="text-xs text-error mt-2 font-medium">
                This will permanently remove their candidacy dossier, supervisor notes, and uploaded CV document from both Firestore and the database.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setAppToDelete(null)}
                disabled={isDeletingApp}
                className="px-5 py-2 rounded-full border border-surface-container text-on-surface font-label-md text-sm hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteApplication(appToDelete)}
                disabled={isDeletingApp}
                className="px-5 py-2 rounded-full bg-error text-on-error font-label-md text-sm font-bold shadow-md hover:bg-error/90 transition-colors flex items-center gap-1.5"
              >
                {isDeletingApp ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-error border-t-transparent rounded-full animate-spin"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                    <span>Yes, Delete Record</span>
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
