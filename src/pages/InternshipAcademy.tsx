import React, { useState, useEffect, FormEvent } from "react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, addDoc, query, orderBy } from "firebase/firestore";
import { InternshipOpportunity, InternshipAcademySettings } from "../types/internship";
import { DEFAULT_INTERNSHIPS, DEFAULT_ACADEMY_SETTINGS } from "../data/defaultInternships";
import { sanitizeForFirestore } from "../lib/scheduleUtils";

export default function InternshipAcademy() {
  const [activeTab, setActiveTab] = useState("Orthopedic Diagnosis");
  const [selectedFilterTrack, setSelectedFilterTrack] = useState("All");

  // Dynamic Opportunities & Settings
  const [opportunities, setOpportunities] = useState<InternshipOpportunity[]>([]);
  const [academySettings, setAcademySettings] = useState<InternshipAcademySettings>(DEFAULT_ACADEMY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Application Modal & Form State
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [selectedOpportunityForApp, setSelectedOpportunityForApp] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [cgpa, setCgpa] = useState("");
  const [motivation, setMotivation] = useState("");
  const [subSpecialty, setSubSpecialty] = useState("Spine & Disc Rehabilitation");
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

  // CV / Resume upload state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvDataUrl, setCvDataUrl] = useState<string>("");
  const [cvFileName, setCvFileName] = useState<string>("");
  const [cvFileSize, setCvFileSize] = useState<string>("");
  const [cvError, setCvError] = useState<string | null>(null);
  const [isDraggingCv, setIsDraggingCv] = useState(false);

  // Competency Tabs for curriculum section
  const competencyTabs = [
    {
      title: "Orthopedic Diagnosis",
      icon: "skeleton",
      desc: "Differential diagnosis of spinal root vs peripheral nerve entrapment, special joint laxity tests, and MRI radiological correlation."
    },
    {
      title: "Hands-On Manipulations",
      icon: "back_hand",
      desc: "Grade I-V Maitland mobilizations, Mulligan Snags, Cyriax deep friction massage techniques, and passive accessory joint testing."
    },
    {
      title: "Gait & Biomechanics",
      icon: "footprint",
      desc: "Plantar pressure mapping, dynamic running cadence assessment, and sports-specific functional return-to-play criteria."
    },
    {
      title: "Dry Needling Mastery",
      icon: "pin_invoke",
      desc: "Safety protocols, clean needle technique (CNT), trigger point localization, and intramuscular myofascial release mapping."
    }
  ];

  // Fetch live opportunities from Firestore
  useEffect(() => {
    const q = query(collection(db, "internships"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const docs = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InternshipOpportunity, "id">)
          }));
          setOpportunities(docs);
          setSelectedOpportunityForApp((prev) => prev || (docs[0] ? docs[0].title : ""));
        } else {
          // If no admin-added opportunities yet, display empty state
          setOpportunities([]);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching internships:", error);
        setOpportunities([]);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch Academy hero settings from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "internshipAcademy"), (docSnap) => {
      if (docSnap.exists()) {
        setAcademySettings({ ...DEFAULT_ACADEMY_SETTINGS, ...docSnap.data() });
      }
    });
    return () => unsub();
  }, []);

  // Handle CV file selection with validation
  const handleCvChange = (file: File | null) => {
    setCvError(null);
    if (!file) {
      setCvFile(null);
      setCvDataUrl("");
      setCvFileName("");
      setCvFileSize("");
      return;
    }

    // Limit size to 5MB to keep Firestore document payloads well within the 1MB-10MB comfort boundary
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setCvError("File size exceeds 5MB limit. Please upload a smaller PDF or Word document.");
      return;
    }

    const allowedExtensions = [".pdf", ".doc", ".docx"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(ext) && !file.type.includes("pdf") && !file.type.includes("word") && !file.type.includes("officedocument")) {
      setCvError("Invalid file type. Please upload your CV in PDF (.pdf) or Word (.doc, .docx) format.");
      return;
    }

    // Convert file size to readable string
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    setCvFileName(file.name);
    setCvFileSize(sizeStr);
    setCvFile(file);

    // Read as Base64 Data URL so the admin can review or download it directly
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCvDataUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setCvError("Failed to read the selected file. Please try selecting your CV again.");
    };
    reader.readAsDataURL(file);
  };

  // Filter opportunities by track
  const availableTracks = [
    "All",
    ...Array.from(new Set(opportunities.map((o) => o.track))).filter(Boolean)
  ];

  const filteredOpportunities = opportunities.filter((item) => {
    if (selectedFilterTrack === "All") return true;
    return item.track === selectedFilterTrack;
  });

  const handleOpenApplicationFor = (opportunityTitle?: string) => {
    if (opportunityTitle) {
      setSelectedOpportunityForApp(opportunityTitle);
    } else if (opportunities.length > 0) {
      setSelectedOpportunityForApp(opportunities[0].title);
    } else if (DEFAULT_INTERNSHIPS.length > 0) {
      setSelectedOpportunityForApp(DEFAULT_INTERNSHIPS[0].title);
    }
    setSubmissionSuccess(null);
    setShowApplicationForm(true);
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read CV file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !university.trim() || !motivation.trim()) {
      alert("Please complete all required fields in the candidacy dossier.");
      return;
    }

    if (cvError) {
      alert("Please resolve the CV upload error before submitting.");
      return;
    }

    setIsSubmittingApp(true);
    try {
      const chosenTitle = selectedOpportunityForApp || (opportunities.length > 0 ? opportunities[0].title : "General Clinical Fellowship");
      const selectedOpp = opportunities.find((o) => o.title === chosenTitle) || (opportunities.length > 0 ? opportunities[0] : undefined);

      let uploadedResumeUrl: string | undefined = undefined;
      let fileBase64 = cvDataUrl;

      // 1. Process and upload CV to server if attached
      if (cvFile) {
        if (!fileBase64) {
          try {
            fileBase64 = await readFileAsDataUrl(cvFile);
          } catch (rErr) {
            console.warn("Could not read CV file before submit:", rErr);
          }
        }

        if (fileBase64) {
          try {
            const upRes = await fetch("/api/upload-cv", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: cvFileName || cvFile.name,
                fileType: cvFile.type || "application/pdf",
                fileData: fileBase64,
                candidateName: fullName.trim()
              })
            });

            if (upRes.ok) {
              const upData = await upRes.json();
              uploadedResumeUrl = upData.fileUrl || upData.downloadUrl;
            }
          } catch (uploadErr) {
            console.warn("Server CV upload notice:", uploadErr);
          }
        }
      }

      // 2. Assemble dossier payload
      // Note: We only embed inline resumeDataUrl if the file is small (< 300KB) to ensure Firestore 1MB doc limit is never exceeded.
      const shouldEmbedInline = cvFile && cvFile.size < 300 * 1024 && fileBase64;

      const dossierPayload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        university: university.trim(),
        graduationYear: graduationYear.trim(),
        cgpa: cgpa.trim(),
        internshipId: selectedOpp?.id || "",
        internshipTitle: chosenTitle,
        motivation: motivation.trim(),
        subSpecialty,
        resumeFileName: cvFileName || (cvFile ? cvFile.name : undefined),
        resumeFileSize: cvFileSize || undefined,
        resumeFileType: cvFile?.type || undefined,
        resumeUrl: uploadedResumeUrl || (shouldEmbedInline ? undefined : uploadedResumeUrl),
        resumeDataUrl: shouldEmbedInline ? fileBase64 : undefined,
        status: "Pending",
        submittedAt: new Date().toISOString()
      };

      const sanitized = sanitizeForFirestore(dossierPayload);

      // 3. Save to Firestore
      let savedToFirestore = false;
      try {
        await addDoc(collection(db, "internshipApplications"), sanitized);
        savedToFirestore = true;
      } catch (fErr) {
        console.warn("Firestore direct write notice:", fErr);
      }

      // 4. Save to Backend API backup
      try {
        await fetch("/api/internship/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sanitized)
        });
      } catch (bErr) {
        console.warn("Backend apply notice:", bErr);
      }

      const refNumber = `DOS-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmissionSuccess(
        `Your candidacy dossier for "${chosenTitle}" has been submitted successfully with your CV document. Reference: ${refNumber}. Dr. Ayazullah's academic board will review your credentials.`
      );

      // Reset fields
      setFullName("");
      setEmail("");
      setPhone("");
      setUniversity("");
      setGraduationYear("");
      setCgpa("");
      setMotivation("");
      setCvFile(null);
      setCvDataUrl("");
      setCvFileName("");
      setCvFileSize("");
    } catch (err) {
      console.error("Failed to submit dossier:", err);
      alert("An error occurred while submitting your application. Please try again.");
    } finally {
      setIsSubmittingApp(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      {/* ========================================================== */}
      {/* 1. HERO SECTION                                           */}
      {/* ========================================================== */}
      <section className="relative overflow-hidden bg-surface py-space-3xl px-gutter-mobile md:px-gutter-desktop border-b border-surface-container">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-container/20 rounded-full blur-[80px]"></div>
          <div className="absolute top-40 -left-20 w-72 h-72 bg-tertiary-container/10 rounded-full blur-[60px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest font-bold mb-space-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              {academySettings.announcementBadge || "Summer 2025 Admissions Open"}
            </span>
            <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight leading-tight">
              {academySettings.heroHeadline || "Clinical Internship & Fellowship Academy"}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-md leading-relaxed">
              {academySettings.heroSubheadline ||
                "Elevate your DPT degree into elite clinical practice. A rigorous, hands-on mentorship program designed by Dr. Ayazullah to bridge the gap between academic theory and real-world complex patient rehabilitation."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-space-sm mt-space-lg">
              <button
                className="px-space-xl py-space-sm rounded-full bg-primary text-on-primary font-label-lg text-label-lg font-bold shadow-md hover:bg-primary-container hover:scale-[1.02] transition-all"
                onClick={() => handleOpenApplicationFor()}
              >
                Submit Candidacy Dossier
              </button>
              <a
                className="px-space-xl py-space-sm rounded-full bg-surface-container-lowest text-on-surface font-label-lg text-label-lg font-bold shadow-sm hover:bg-surface-container transition-colors border border-outline-variant/30"
                href="#opportunities-section"
              >
                Explore Opportunities ({opportunities.length})
              </a>
            </div>
            <div className="flex items-center gap-space-md mt-space-lg pt-space-md border-t border-surface-container">
              <div className="flex -space-x-3">
                <img
                  className="w-10 h-10 rounded-full border-2 border-surface shadow-sm object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3_a319N6l_V0_4_1_30qJ8Q404G7b1-2P4tP7Q302061gQ9w-V-4B_7m6Y9H315z92P76_988W_Z0_P7D3Q9Q7_T8m5c6g9qG_Y310N7Wq9q_0_w988D4b0cW96b-L-R56V_7t17xX-b6D78l8M-x5X7R_J0v8P80-60bQ_9bL7s43V2Z3L8"
                  alt="Alumni"
                />
                <img
                  className="w-10 h-10 rounded-full border-2 border-surface shadow-sm object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQq0lP9m5H4X49z3B8J6Wq3T0X9Q-3y5J5Z8Y8-4N9D1P-3_P6V7Y-D3F28m4N9Q6tX-0N2F7b9s-T8Z4_P4z9b7L43d0K8t12N31_R0G55h9b5c2F92D7398b6x0Z3N79W8t603120Q3m9L73B-b8Y-2V29c5X_2x7l2C67V_T7F9H760L8n8G_q-R5Q_v4N"
                  alt="Alumni"
                />
                <img
                  className="w-10 h-10 rounded-full border-2 border-surface shadow-sm object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuC1P9F27q7P4G3B5t0X9X3F5s-8G2t548c78P0Q5Q7b5L_150D3x7C9Y9R8w_4M8Z-F2v38w_9X30N_4Y9D0Z8-X7L6-N8H4Q26P808q7R0K9h2-8X8t9z09X-P_2N0z3Q3n8T4Z-z6W_G9P0-6Z_06N-2_8x3N3s4z-3n6N6_W9Z38t3B-z9V7H0P_Z-F5N"
                  alt="Alumni"
                />
                <div className="w-10 h-10 rounded-full border-2 border-surface shadow-sm bg-surface-container-high flex items-center justify-center text-label-sm font-bold text-on-surface-variant">
                  +400
                </div>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant max-w-[220px] text-left">
                {academySettings.fellowsCountText ||
                  "Join over 400+ clinical fellows now leading top tier hospitals"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================== */}
      {/* 2. CORE ACADEMY PILLARS                                    */}
      {/* ========================================================== */}
      <section className="bg-surface-container-lowest py-space-2xl px-gutter-mobile md:px-gutter-desktop border-b border-surface-container">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-space-xl">
          <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-surface-container">
            <div className="w-12 h-12 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center mb-space-xxs">
              <span className="material-symbols-outlined text-[24px]">contact_support</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">1-on-1 Mentorship</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Direct shadowing alongside Dr. Ayazullah. Discuss complex case prognoses, patient communication psychology, and ethical triaging daily.
            </p>
          </div>
          <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-surface-container">
            <div className="w-12 h-12 rounded-xl bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center mb-space-xxs">
              <span className="material-symbols-outlined text-[24px]">science</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Evidence-Based Protocols</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Move beyond textbook theory. Learn IFOMPT aligned manual therapy, post-op graft healing timelines, and true neuro-motor rehab.
            </p>
          </div>
          <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] border border-surface-container">
            <div className="w-12 h-12 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center mb-space-xxs">
              <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Clinical Certification</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Graduate with a verified letter of recommendation and a practicum certificate detailing hours completed across acute, sub-acute and chronic care.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================== */}
      {/* 3. DYNAMIC INTERNSHIP OPPORTUNITIES PORTION (ADMIN MANAGED) */}
      {/* ========================================================== */}
      <section
        id="opportunities-section"
        className="py-space-3xl px-gutter-mobile md:px-gutter-desktop bg-surface-container-lowest border-b border-surface-container"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-space-xl">
            <div>
              <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1 block">
                Active Cohort Intakes &amp; Openings
              </span>
              <h2 className="font-display-md text-display-md text-on-surface font-bold">
                Available Internship &amp; Fellowship Opportunities
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-2xl">
                Choose a clinical track tailored to your current stage of physical therapy practice. Each opportunity includes direct supervision, case symposiums, and accredited certification.
              </p>
            </div>

            {/* Track Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-surface p-1.5 rounded-2xl border border-surface-container">
              {availableTracks.map((trk) => (
                <button
                  key={trk}
                  onClick={() => setSelectedFilterTrack(trk)}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-xl font-label-sm text-xs font-bold transition-all",
                    selectedFilterTrack === trk
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  )}
                >
                  {trk}
                </button>
              ))}
            </div>
          </div>

          {/* Opportunities Grid / Empty State */}
          {isLoading ? (
            <div className="flex items-center justify-center p-16">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="p-12 md:p-16 text-center bg-surface rounded-3xl border border-surface-container flex flex-col items-center max-w-2xl mx-auto shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[36px]">school</span>
              </div>
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                {opportunities.length === 0 ? "No Internship Opportunities Posted Yet" : "No Opportunities in this Category"}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md mt-2 mb-6 leading-relaxed">
                {opportunities.length === 0
                  ? "Opportunities created by Dr. Ayazullah's administrative team will appear here immediately with cohort dates, syllabus details, and open seats."
                  : "Try switching back to 'All' tracks or check back soon as new cohorts open for enrollment."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {selectedFilterTrack !== "All" && (
                  <button
                    onClick={() => setSelectedFilterTrack("All")}
                    className="px-5 py-2.5 rounded-full border border-outline-variant bg-surface hover:bg-surface-container text-on-surface font-label-md text-xs font-bold transition-colors"
                  >
                    View All Categories
                  </button>
                )}
                <button
                  onClick={() => handleOpenApplicationFor("General Clinical Fellowship")}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-md text-xs font-bold shadow-md hover:bg-primary-container transition-all flex items-center gap-2 hover:scale-[1.02]"
                >
                  <span className="material-symbols-outlined text-[18px]">post_add</span>
                  <span>Submit Open Candidacy Dossier</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
              {filteredOpportunities.map((item) => (
                <div
                  key={item.id || item.title}
                  className={clsx(
                    "bg-surface rounded-3xl p-space-lg border transition-all duration-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] flex flex-col justify-between relative overflow-hidden",
                    item.isFeatured
                      ? "border-primary/40 shadow-[0_4px_20px_rgba(0,0,0,0.03)] ring-1 ring-primary/20"
                      : "border-surface-container"
                  )}
                >
                  {item.isFeatured && (
                    <div className="absolute top-0 right-0 bg-primary text-on-primary px-3.5 py-1 rounded-bl-2xl font-label-sm text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                      <span className="material-symbols-outlined text-[13px]">star</span>
                      Featured Program
                    </div>
                  )}

                  <div>
                    {/* Category & Status Row */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-label-sm text-xs font-bold uppercase tracking-wider">
                        {item.track}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">schedule</span>
                        {item.duration}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-xs font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">group</span>
                        {item.seats}
                      </span>
                      <span
                        className={clsx(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-bold ml-auto",
                          item.status === "Open" && "bg-emerald-100 text-emerald-800",
                          item.status === "Closing Soon" && "bg-amber-100 text-amber-800",
                          item.status === "Waitlist" && "bg-sky-100 text-sky-800",
                          item.status === "Closed" && "bg-rose-100 text-rose-800"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Title & Overview */}
                    <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-2">
                      {item.title}
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant mb-space-md leading-relaxed">
                      {item.description}
                    </p>

                    {/* Program Metadata Strip */}
                    <div className="grid grid-cols-2 gap-2 p-space-sm rounded-2xl bg-surface-container-lowest border border-surface-container mb-space-md text-xs">
                      <div>
                        <span className="font-bold text-on-surface block">Eligibility:</span>
                        <span className="text-on-surface-variant">{item.eligibility}</span>
                      </div>
                      <div>
                        <span className="font-bold text-on-surface block">Intake:</span>
                        <span className="text-on-surface-variant">{item.intake}</span>
                      </div>
                      {item.stipendOrFee && (
                        <div className="col-span-2 pt-1 border-t border-surface-container">
                          <span className="font-bold text-on-surface">Financials: </span>
                          <span className="text-on-surface-variant">{item.stipendOrFee}</span>
                        </div>
                      )}
                    </div>

                    {/* What is Included in this Opportunity */}
                    {item.included && item.included.length > 0 && (
                      <div className="space-y-2 mb-space-md">
                        <h4 className="font-label-sm text-[11px] font-bold text-primary uppercase tracking-wider">
                          Included in this Opportunity:
                        </h4>
                        <ul className="space-y-1.5">
                          {item.included.map((inc, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-on-surface">
                              <span className="material-symbols-outlined text-primary text-[17px] shrink-0 mt-0.5">
                                check_circle
                              </span>
                              <span>{inc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-space-md border-t border-surface-container flex items-center justify-between gap-3 mt-space-sm">
                    <div className="text-xs text-on-surface-variant">
                      {item.status === "Closed" ? "Intake currently full" : "Accepting Candidacy Dossiers"}
                    </div>
                    <button
                      disabled={item.status === "Closed"}
                      onClick={() => handleOpenApplicationFor(item.title)}
                      className={clsx(
                        "px-space-lg py-2 rounded-full font-label-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm",
                        item.status === "Closed"
                          ? "bg-surface-container text-on-surface-variant cursor-not-allowed opacity-60"
                          : "bg-primary text-on-primary hover:bg-primary-container hover:scale-[1.02]"
                      )}
                    >
                      <span>{item.status === "Closed" ? "Closed" : "Apply for this Track"}</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========================================================== */}
      {/* 4. CORE CLINICAL COMPETENCY FRAMEWORK                      */}
      {/* ========================================================== */}
      <section className="py-space-3xl px-gutter-mobile md:px-gutter-desktop bg-surface" id="curriculum">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-space-2xl">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1 block">
              Clinical Curriculum
            </span>
            <h2 className="font-display-md text-display-md text-on-surface">Core Competency Framework</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
            <div className="lg:col-span-4 flex flex-col gap-space-xs">
              {competencyTabs.map((tab, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTab(tab.title)}
                  className={clsx(
                    "flex items-center gap-space-sm p-space-md rounded-xl text-left transition-all duration-300 w-full",
                    activeTab === tab.title
                      ? "bg-surface-container-lowest shadow-[0_4px_16px_rgba(0,0,0,0.03)] border-l-4 border-primary"
                      : "bg-transparent hover:bg-surface-container-lowest text-on-surface-variant border-l-4 border-transparent"
                  )}
                >
                  <span
                    className={clsx(
                      "material-symbols-outlined text-[24px]",
                      activeTab === tab.title ? "text-primary" : "text-outline"
                    )}
                  >
                    {tab.icon}
                  </span>
                  <span
                    className={clsx(
                      "font-headline-sm text-headline-sm",
                      activeTab === tab.title ? "text-on-surface font-bold" : "font-medium"
                    )}
                  >
                    {tab.title}
                  </span>
                </button>
              ))}
            </div>
            <div className="lg:col-span-8">
              <div className="bg-surface-container-lowest p-space-xl rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-[400px] flex flex-col justify-between border border-surface-container">
                <div>
                  <h3 className="font-headline-lg text-headline-lg text-primary font-bold mb-space-sm">
                    {activeTab}
                  </h3>
                  <p className="font-body-lg text-body-lg text-on-surface-variant mb-space-lg">
                    {competencyTabs.find((t) => t.title === activeTab)?.desc}
                  </p>

                  <div className="space-y-space-sm">
                    <h4 className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider">
                      Module Objectives
                    </h4>
                    <ul className="flex flex-col gap-space-xs">
                      {[
                        "Conduct 10+ supervised subjective assessments.",
                        "Perform specific special tests with 95% accuracy.",
                        "Design 4-week progressive loading programs."
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-space-xs font-body-md text-body-md text-on-surface">
                          <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">
                            check_circle
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-space-xl pt-space-md border-t border-surface-container flex items-center justify-between">
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[18px]">schedule</span>
                    <span>Direct Patient Shadowing</span>
                  </div>
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    <span>Max 4 Fellows / Group</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================== */}
      {/* 5. APPLICATION FORM MODAL                                  */}
      {/* ========================================================== */}
      {showApplicationForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-gutter-mobile overflow-y-auto p-4">
          <div className="bg-surface-container-lowest w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-space-lg flex flex-col border border-surface-container">
            <div className="flex items-center justify-between p-space-md border-b border-surface-container bg-surface/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">school</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Fellowship &amp; Internship Candidacy Dossier
                </h2>
              </div>
              <button
                onClick={() => setShowApplicationForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-space-xl overflow-y-auto max-h-[75vh]">
              {submissionSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[36px]">check_circle</span>
                  </div>
                  <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                    Dossier Submitted Successfully!
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto leading-relaxed">
                    {submissionSuccess}
                  </p>
                  <div className="pt-4">
                    <button
                      onClick={() => setShowApplicationForm(false)}
                      className="px-8 py-2.5 rounded-full bg-primary text-on-primary font-label-md font-bold shadow-md hover:bg-primary-container transition-all"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form className="flex flex-col gap-space-lg" onSubmit={handleFormSubmit}>
                  {/* Selected Opportunity Selector */}
                  <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col gap-1.5">
                    <label className="font-label-md text-xs font-bold text-primary uppercase tracking-wider">
                      Applying For Opportunity / Program Track *
                    </label>
                    <select
                      value={selectedOpportunityForApp}
                      onChange={(e) => setSelectedOpportunityForApp(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant/40 font-semibold text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {opportunities.map((opp) => (
                        <option key={opp.id || opp.title} value={opp.title}>
                          {opp.title} ({opp.track} — {opp.duration})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 1. Academic Profile */}
                  <div className="flex flex-col gap-space-sm border-b border-surface-container pb-space-md">
                    <h3 className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-widest">
                      1. Academic &amp; Contact Profile
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface font-bold">Full Name *</label>
                        <input
                          required
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Dr. Ayesha Khan"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface font-bold">Email Address *</label>
                        <input
                          required
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="ayesha.khan@example.com"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface font-bold">Phone / WhatsApp</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+92 332 9895770"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface font-bold">Current CGPA</label>
                        <input
                          type="number"
                          step="0.01"
                          value={cgpa}
                          onChange={(e) => setCgpa(e.target.value)}
                          placeholder="e.g. 3.75"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="font-label-md text-label-md text-on-surface font-bold">
                          University / Physical Therapy Institute *
                        </label>
                        <input
                          required
                          type="text"
                          value={university}
                          onChange={(e) => setUniversity(e.target.value)}
                          placeholder="e.g. King Edward Medical University / Riphah College of Rehabilitation"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="font-label-md text-label-md text-on-surface font-bold">
                          Current Semester or Graduation Year
                        </label>
                        <input
                          type="text"
                          value={graduationYear}
                          onChange={(e) => setGraduationYear(e.target.value)}
                          placeholder="e.g. Final Year (10th Semester) or Class of 2025"
                          className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Clinical Interests */}
                  <div className="flex flex-col gap-space-sm border-b border-surface-container pb-space-md">
                    <h3 className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-widest">
                      2. Clinical Goals &amp; Specialization
                    </h3>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-md text-label-md text-on-surface font-bold">
                        Why do you want to intern at Dr. Ayazullah's Clinic? *
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={motivation}
                        onChange={(e) => setMotivation(e.target.value)}
                        placeholder="Detail your clinical goals, expectations from Dr. Ayazullah's mentorship, and what practical skills you wish to refine..."
                        className="w-full p-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 mt-2">
                      <label className="font-label-md text-label-md text-on-surface font-bold">
                        Which sub-specialty are you most eager to master?
                      </label>
                      <select
                        value={subSpecialty}
                        onChange={(e) => setSubSpecialty(e.target.value)}
                        className="w-full h-11 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-sm text-on-surface"
                      >
                        <option value="Spine & Disc Rehabilitation">Spine &amp; Disc Rehabilitation</option>
                        <option value="Sports Injury & Athletic Return">Sports Injury &amp; Athletic Return</option>
                        <option value="Post-Surgical Joint Care">Post-Surgical Joint Care</option>
                        <option value="Neuro-Motor & Stroke">Neuro-Motor &amp; Stroke</option>
                        <option value="Dry Needling & Myofascial">Dry Needling &amp; Myofascial</option>
                      </select>
                    </div>
                  </div>

                  {/* 3. Resume / CV Upload */}
                  <div className="flex flex-col gap-space-sm border-b border-surface-container pb-space-md">
                    <div className="flex items-center justify-between">
                      <h3 className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-widest">
                        3. Upload Your Curriculum Vitae (CV)
                      </h3>
                      <span className="text-xs text-on-surface-variant font-medium">PDF, DOC, DOCX (Max 5MB)</span>
                    </div>

                    {!cvFile ? (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingCv(true);
                        }}
                        onDragLeave={() => setIsDraggingCv(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingCv(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            handleCvChange(e.dataTransfer.files[0]);
                          }
                        }}
                        className={clsx(
                          "relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer",
                          isDraggingCv
                            ? "border-primary bg-primary/5"
                            : "border-outline-variant/60 hover:border-primary/60 hover:bg-surface-container-lowest"
                        )}
                      >
                        <input
                          type="file"
                          id="cv-upload-input"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleCvChange(e.target.files[0]);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                          <span className="material-symbols-outlined text-[26px]">upload_file</span>
                        </div>
                        <p className="font-label-md text-label-md font-bold text-on-surface">
                          Click to upload your CV, or drag &amp; drop here
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          Attach your updated resume including undergraduate coursework, clinical rotations, or certifications
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-surface-container-lowest border border-surface-container flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[22px]">description</span>
                          </div>
                          <div className="truncate">
                            <p className="font-label-md text-label-md font-bold text-on-surface truncate">
                              {cvFileName}
                            </p>
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                              <span>{cvFileSize}</span>
                              <span>•</span>
                              <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                Ready to upload
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label
                            htmlFor="cv-upload-replace"
                            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container text-on-surface text-xs font-bold cursor-pointer transition-colors"
                          >
                            Replace
                          </label>
                          <input
                            type="file"
                            id="cv-upload-replace"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleCvChange(e.target.files[0]);
                              }
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleCvChange(null)}
                            className="p-1.5 rounded-lg text-error hover:bg-error/10 transition-colors"
                            title="Remove attached file"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {cvError && (
                      <div className="flex items-center gap-1.5 text-xs text-error font-medium mt-1">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        <span>{cvError}</span>
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="pt-space-md flex items-center justify-end gap-space-sm border-t border-surface-container">
                    <button
                      type="button"
                      onClick={() => setShowApplicationForm(false)}
                      className="px-space-md h-11 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingApp}
                      className="px-space-xl h-11 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-bold shadow-sm transition-transform active:scale-[0.99] flex items-center gap-space-xs"
                    >
                      <span>{isSubmittingApp ? "Submitting Dossier..." : "Submit Candidacy Dossier"}</span>
                      <span className="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
