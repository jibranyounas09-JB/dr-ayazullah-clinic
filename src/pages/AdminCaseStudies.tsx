import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, query, orderBy } from "firebase/firestore";
import { clsx } from "clsx";

export default function AdminCaseStudies() {
  const [caseStudies, setCaseStudies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Spine & Sciatica");
  const [customType, setCustomType] = useState("");
  const [patient, setPatient] = useState("");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState("");
  const [img, setImg] = useState("");
  const [vlogUrl, setVlogUrl] = useState("");
  const [fullStory, setFullStory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // In-app Delete Confirmation State (No browser window.confirm!)
  const [studyToDelete, setStudyToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const q = query(collection(db, "caseStudies"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCaseStudies(docs);
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to caseStudies:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenAdd = () => {
    setCurrentId(null);
    setTitle("");
    setType("Spine & Sciatica");
    setCustomType("");
    setPatient("");
    setDesc("");
    setDuration("");
    setImg("");
    setVlogUrl("");
    setFullStory("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setCurrentId(item.id);
    setTitle(item.title || "");
    const standardCategories = ["Spine & Sciatica", "Post-Surgical Knee", "Sports Athletics", "Chronic Neck Pain"];
    if (standardCategories.includes(item.type)) {
      setType(item.type);
      setCustomType("");
    } else {
      setType("Other");
      setCustomType(item.type || "");
    }
    setPatient(item.patient || "");
    setDesc(item.desc || "");
    setDuration(item.duration || "");
    setImg(item.img || "");
    setVlogUrl(item.vlogUrl || "");
    setFullStory(item.fullStory || "");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentId(null);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImg(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const resolvedType = type === "Other" ? (customType.trim() || "General Recovery") : type;

    const payload = {
      title: title.trim(),
      type: resolvedType,
      patient: patient.trim(),
      desc: desc.trim(),
      duration: duration.trim() || "Ongoing",
      img: img.trim() || "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
      vlogUrl: vlogUrl.trim(),
      fullStory: fullStory.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      if (currentId) {
        await setDoc(doc(db, "caseStudies", currentId), payload, { merge: true });
        showToast("Case study updated successfully!");
      } else {
        await addDoc(collection(db, "caseStudies"), payload);
        showToast("New case study published successfully!");
      }
      handleCloseModal();
    } catch (error) {
      console.error("Save error:", error);
      showToast("Error saving case study. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!studyToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "caseStudies", studyToDelete.id));
      showToast("Case study deleted successfully!");
      setStudyToDelete(null);
    } catch (error) {
      console.error("Delete error:", error);
      showToast("Error deleting case study. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const resolveImageUrl = (imageSrc: string) => {
    if (!imageSrc) return "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80";
    if (imageSrc.startsWith("http") || imageSrc.startsWith("data:")) return imageSrc;
    return `https://lh3.googleusercontent.com/aida-public/${imageSrc}`;
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-on-surface text-surface px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in border border-surface-container">
          <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
          <span className="font-label-md font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Clinical Case Studies</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Add, edit, or delete patient case studies, photos, and video vlogs displayed on the website.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleOpenAdd} 
            className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Case Study
          </button>
        </div>
      </div>

      {/* EDIT / CREATE MODAL DIALOG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-surface rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto flex flex-col border border-surface-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-surface-container flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  {currentId ? "edit_note" : "post_add"}
                </span>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  {currentId ? "Edit Case Study & Vlog" : "Create New Case Study & Vlog"}
                </h2>
              </div>
              <button 
                type="button" 
                onClick={handleCloseModal} 
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-5 sm:p-6 flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-sm font-semibold text-on-surface">Case Study Title *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g., L5–S1 Herniation Sparing Surgery" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold text-on-surface">Category / Recovery Type *</label>
                  <select 
                    value={type} 
                    onChange={(e) => setType(e.target.value)} 
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm cursor-pointer"
                  >
                    <option value="Spine & Sciatica">Spine & Sciatica</option>
                    <option value="Post-Surgical Knee">Post-Surgical Knee</option>
                    <option value="Sports Athletics">Sports Athletics</option>
                    <option value="Chronic Neck Pain">Chronic Neck Pain</option>
                    <option value="Other">Other / Custom Category</option>
                  </select>
                  {type === "Other" && (
                    <input 
                      type="text" 
                      placeholder="Type custom category name..." 
                      value={customType} 
                      onChange={(e) => setCustomType(e.target.value)} 
                      className="w-full h-10 px-3.5 mt-1 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold text-on-surface">Patient Profile *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g., Mr. Tariq, 45 (Banker)" 
                    value={patient} 
                    onChange={(e) => setPatient(e.target.value)} 
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-sm font-semibold text-on-surface">Short Summary / Clinical Outcome *</label>
                  <textarea 
                    required 
                    rows={2}
                    placeholder="Brief overview of clinical condition, therapy protocols, and successful outcome..." 
                    value={desc} 
                    onChange={(e) => setDesc(e.target.value)} 
                    className="w-full p-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold text-on-surface">Recovery Timeline</label>
                  <input 
                    type="text" 
                    placeholder="e.g., 8 Weeks, 6 Months, 4 Weeks" 
                    value={duration} 
                    onChange={(e) => setDuration(e.target.value)} 
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold text-on-surface">Full Vlog / Video Link</label>
                  <input 
                    type="url" 
                    placeholder="YouTube, Vimeo, or MP4 link" 
                    value={vlogUrl} 
                    onChange={(e) => setVlogUrl(e.target.value)} 
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>

                {/* Picture / Clinical Photo */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="font-label-sm font-semibold text-on-surface">Case Study Picture / Clinical Photo *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 flex flex-col gap-2">
                      <input 
                        type="text" 
                        placeholder="Paste image URL (e.g. https://...)" 
                        value={img} 
                        onChange={(e) => setImg(e.target.value)} 
                        className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                      />
                      <div className="flex items-center gap-3">
                        <label className="h-9 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest cursor-pointer font-label-sm text-on-surface flex items-center gap-1.5 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">upload_file</span>
                          <span>Upload Photo from Device</span>
                          <input type="file" accept="image/*" onChange={handleImageFileUpload} className="hidden" />
                        </label>
                        <span className="text-on-surface-variant text-[12px]">or paste link above</span>
                      </div>
                    </div>
                    <div className="h-28 rounded-xl bg-surface-container-low border border-surface-container overflow-hidden flex items-center justify-center relative">
                      {img ? (
                        <img src={resolveImageUrl(img)} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-on-surface-variant text-[12px] flex flex-col items-center gap-1">
                          <span className="material-symbols-outlined opacity-40">image</span>
                          No Image Selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Full Vlog Story */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-sm font-semibold text-on-surface flex items-center justify-between">
                    <span>Full Vlog Narrative / Detailed Case Story</span>
                    <span className="text-[12px] text-on-surface-variant font-normal">Displayed in patient modal</span>
                  </label>
                  <textarea 
                    rows={4}
                    placeholder="Detailed clinical narrative: patient background, symptoms, specific therapies applied, milestones, and results..." 
                    value={fullStory} 
                    onChange={(e) => setFullStory(e.target.value)} 
                    className="w-full p-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-container">
                <button 
                  type="button" 
                  onClick={handleCloseModal} 
                  className="px-5 py-2.5 rounded-xl border border-surface-container text-on-surface font-label-md font-medium hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-md font-bold hover:bg-primary-container shadow-sm transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check</span>
                      <span>{currentId ? "Save Changes" : "Publish Case Study"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP DELETE CONFIRMATION DIALOG (Works 100% in iFrames) */}
      {studyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-surface rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col gap-4 border border-surface-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Delete Case Study?</h3>
                <span className="text-body-sm text-on-surface-variant">This action cannot be undone.</span>
              </div>
            </div>

            <div className="bg-surface-container-low p-3.5 rounded-xl border border-surface-container flex flex-col gap-1">
              <span className="font-label-md font-bold text-on-surface">{studyToDelete.title}</span>
              <span className="text-[12px] text-primary font-semibold">{studyToDelete.patient} • {studyToDelete.type}</span>
            </div>

            <p className="font-body-sm text-on-surface-variant text-[13px]">
              This case study and its associated pictures and vlog link will be permanently removed from the website immediately.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setStudyToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-surface-container text-on-surface font-label-md font-medium hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="px-5 py-2.5 rounded-xl bg-error text-white font-label-md font-bold hover:bg-error/90 shadow-sm transition-colors flex items-center gap-1.5"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete Case Study"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CASE STUDIES LIST */}
      <div className="bg-surface rounded-2xl shadow-sm border border-surface-container overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-surface-container bg-surface-container-lowest flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">biotech</span>
            <h3 className="font-label-lg font-bold text-on-surface">
              Active Clinical Case Studies ({caseStudies.length})
            </h3>
          </div>
          <span className="font-label-sm text-on-surface-variant text-[12px] bg-surface-container px-2.5 py-1 rounded-full">
            Syncs in real-time with website
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-on-surface-variant font-label-md flex justify-center">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : caseStudies.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">biotech</span>
            <p className="font-body-md text-on-surface-variant max-w-md">
              No clinical case studies found. Click "Add Case Study" to publish your first patient recovery vlog and clinical story.
            </p>
            <button 
              onClick={handleOpenAdd} 
              className="mt-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary font-label-md font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Add First Case Study
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-4 sm:p-5">
            {caseStudies.map((study) => (
              <div 
                key={study.id} 
                className="bg-surface-container-lowest rounded-2xl border border-surface-container overflow-hidden flex flex-col hover:shadow-lg transition-all group"
              >
                {/* Photo & Badges */}
                <div className="h-48 relative bg-surface-container overflow-hidden">
                  <img 
                    src={resolveImageUrl(study.img)} 
                    alt={study.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                  />
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-surface/95 text-on-surface font-label-sm text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm shadow-sm">
                    {study.type}
                  </div>
                  {study.vlogUrl && (
                    <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/80 text-white font-label-sm text-[11px] font-medium flex items-center gap-1.5 backdrop-blur-sm shadow-sm">
                      <span className="material-symbols-outlined text-[15px] text-red-500">smart_display</span>
                      <span>Vlog Attached</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-4 sm:p-5 flex flex-col flex-1">
                  <h4 className="font-headline-sm text-[16px] font-bold text-on-surface line-clamp-1 group-hover:text-primary transition-colors">
                    {study.title}
                  </h4>
                  <span className="font-label-sm text-primary font-bold text-[13px] mt-0.5">
                    {study.patient}
                  </span>
                  <p className="font-body-sm text-[13px] text-on-surface-variant mt-2 line-clamp-2 flex-1">
                    "{study.desc}"
                  </p>
                  
                  {/* Action Bar with clear Edit & Delete buttons */}
                  <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between">
                    <span className="text-[11px] uppercase font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                      Timeline: {study.duration || "N/A"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={() => handleOpenEdit(study)} 
                        className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface text-[12px] font-semibold flex items-center gap-1 transition-all"
                        title="Edit Case Study"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Edit</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => setStudyToDelete(study)} 
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                        title="Delete Case Study"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
