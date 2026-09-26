import React, { useState, useEffect } from "react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

interface PromoItem {
  id?: string;
  tag: string;
  text: string;
  link: string;
  linkText: string;
}

const DEFAULT_PROMOS: PromoItem[] = [
  {
    id: "promo-1",
    tag: "Alert",
    text: "Now Offering Virtual 15-Minute Tele-Triage Consultations for New Patients",
    link: "/book-appointment",
    linkText: "Book Tele-Triage →"
  },
  {
    id: "promo-2",
    tag: "New",
    text: "Summer 2025 Clinical Internship & Fellowship Intake (Only 12 Seats Available)",
    link: "/internship-academy",
    linkText: "Apply for Fellowship →"
  },
  {
    id: "promo-3",
    tag: "Free",
    text: "Download Our Comprehensive 28-Page Posture & Ergonomics Protocol PDF",
    link: "/community-and-social",
    linkText: "Get Free PDF →"
  }
];

export default function AdminContent() {
  // Promotions State
  const [banners, setBanners] = useState<PromoItem[]>(DEFAULT_PROMOS);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [emergencyPhone, setEmergencyPhone] = useState<string>("+92 332 9895770");
  
  // Active editing banner fields
  const [tag, setTag] = useState<string>("Alert");
  const [text, setText] = useState<string>("Now Offering Virtual 15-Minute Tele-Triage Consultations for New Patients");
  const [link, setLink] = useState<string>("/book-appointment");
  const [linkText, setLinkText] = useState<string>("Book Tele-Triage →");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load initial content from Firestore once on mount (so live subscription does NOT overwrite user typing)
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        const docSnap = await getDoc(doc(db, "content", "promotions"));
        if (docSnap.exists() && isMounted) {
          const data = docSnap.data();
          if (data.isEnabled !== undefined) setIsEnabled(data.isEnabled);
          if (data.emergencyPhone) setEmergencyPhone(data.emergencyPhone);
          
          let loadedBanners: PromoItem[] = [];
          if (Array.isArray(data.banners) && data.banners.length > 0) {
            loadedBanners = data.banners;
          } else if (data.text) {
            loadedBanners = [{
              tag: data.tag || "Alert",
              text: data.text,
              link: data.link || "/book-appointment",
              linkText: data.linkText || "Book Now →"
            }];
          } else {
            loadedBanners = DEFAULT_PROMOS;
          }

          setBanners(loadedBanners);
          setSelectedIndex(0);
          if (loadedBanners[0]) {
            setTag(loadedBanners[0].tag || "Alert");
            setText(loadedBanners[0].text || "");
            setLink(loadedBanners[0].link || "/book-appointment");
            setLinkText(loadedBanners[0].linkText || "Book Now →");
          }
        } else if (isMounted) {
          setTag(DEFAULT_PROMOS[0].tag);
          setText(DEFAULT_PROMOS[0].text);
          setLink(DEFAULT_PROMOS[0].link);
          setLinkText(DEFAULT_PROMOS[0].linkText);
        }
      } catch (err) {
        console.error("Error reading promotions doc:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitialData();
    return () => { isMounted = false; };
  }, []);

  const updateField = (field: keyof PromoItem, val: string) => {
    if (field === "tag") setTag(val);
    else if (field === "text") setText(val);
    else if (field === "link") setLink(val);
    else if (field === "linkText") setLinkText(val);

    setBanners((prev) => {
      const copy = [...prev];
      if (copy[selectedIndex]) {
        copy[selectedIndex] = {
          ...copy[selectedIndex],
          [field]: val
        };
      } else {
        copy.push({
          tag: field === "tag" ? val : "Alert",
          text: field === "text" ? val : "",
          link: field === "link" ? val : "/book-appointment",
          linkText: field === "linkText" ? val : "Book Now →"
        });
      }
      return copy;
    });
  };

  const handleSelectBanner = (index: number) => {
    // Flush current inputs into current banner before switching
    const currentUpdated = [...banners];
    if (currentUpdated[selectedIndex]) {
      currentUpdated[selectedIndex] = {
        ...currentUpdated[selectedIndex],
        tag,
        text,
        link,
        linkText
      };
      setBanners(currentUpdated);
    }

    setSelectedIndex(index);
    const target = currentUpdated[index] || banners[index];
    if (target) {
      setTag(target.tag || "Alert");
      setText(target.text || "");
      setLink(target.link || "/book-appointment");
      setLinkText(target.linkText || "Book Now →");
    }
  };

  const handleAddNewBanner = () => {
    const currentUpdated = [...banners];
    if (currentUpdated[selectedIndex]) {
      currentUpdated[selectedIndex] = {
        ...currentUpdated[selectedIndex],
        tag,
        text,
        link,
        linkText
      };
    }

    const newBanner: PromoItem = {
      tag: "Alert",
      text: "New Clinic Announcement or Offer",
      link: "/book-appointment",
      linkText: "Learn More →"
    };
    const updated = [...currentUpdated, newBanner];
    const newIndex = updated.length - 1;
    setBanners(updated);
    setSelectedIndex(newIndex);
    setTag(newBanner.tag);
    setText(newBanner.text);
    setLink(newBanner.link);
    setLinkText(newBanner.linkText);
  };

  const handleDeleteBanner = (index: number) => {
    if (banners.length <= 1) {
      setFeedbackMessage("You must have at least one promotion banner configured.");
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }
    const updated = banners.filter((_, i) => i !== index);
    setBanners(updated);
    const newIdx = Math.min(selectedIndex, updated.length - 1);
    setSelectedIndex(newIdx);
    if (updated[newIdx]) {
      setTag(updated[newIdx].tag || "Alert");
      setText(updated[newIdx].text || "");
      setLink(updated[newIdx].link || "/book-appointment");
      setLinkText(updated[newIdx].linkText || "Book Now →");
    }
    setFeedbackMessage("Banner removed. Click 'Save Changes' to update the live website.");
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleToggleVisibility = async (newVal: boolean) => {
    setIsEnabled(newVal);
    try {
      await setDoc(doc(db, "content", "promotions"), {
        isEnabled: newVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setFeedbackMessage(newVal ? "Announcement bar is now ON and visible on the website." : "Announcement bar is now OFF and hidden on the website.");
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err) {
      console.error("Error updating bar visibility in Firestore:", err);
      setFeedbackMessage("Failed to update visibility in database. Please try again.");
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedbackMessage(null);

    // Update active item in banners list
    const updatedBanners = [...banners];
    if (updatedBanners[selectedIndex]) {
      updatedBanners[selectedIndex] = {
        tag: tag.trim() || "Alert",
        text: text.trim(),
        link: link.trim() || "/book-appointment",
        linkText: linkText.trim() || "Book Now →"
      };
    }

    const payload = {
      banners: updatedBanners,
      tag: tag.trim() || "Alert",
      text: text.trim(),
      link: link.trim() || "/book-appointment",
      linkText: linkText.trim() || "Book Now →",
      emergencyPhone: emergencyPhone.trim(),
      isEnabled: isEnabled,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "content", "promotions"), payload);
      setBanners(updatedBanners);
      setFeedbackMessage("Promotions & Alert Banners saved successfully!");
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (error) {
      console.error("Error saving promotions:", error);
      setFeedbackMessage("Failed to save changes. Please try again.");
      setTimeout(() => setFeedbackMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Toast / Notification Banner */}
      {feedbackMessage && (
        <div className="fixed top-6 right-6 z-50 bg-on-surface text-surface px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in border border-surface-container">
          <span className="material-symbols-outlined text-primary text-[20px]">
            {feedbackMessage.includes("Failed") ? "error" : "check_circle"}
          </span>
          <span className="font-label-md font-medium">{feedbackMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Content Management</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Update the announcement bar, website banners, and emergency contact in real-time.
          </p>
        </div>
        <Link 
          to="/" 
          target="_blank" 
          className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm font-bold flex items-center gap-1.5 transition-colors border border-surface-container"
        >
          <span>View Live Bar</span>
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {/* LIVE WEBSITE PREVIEW */}
          <div className="bg-surface rounded-2xl shadow-sm border border-surface-container overflow-hidden">
            <div className="p-3.5 sm:p-4 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={clsx("w-2.5 h-2.5 rounded-full", isEnabled ? "bg-emerald-500 animate-pulse" : "bg-outline-variant")}></span>
                <span className="font-label-sm font-bold text-on-surface uppercase tracking-wider text-[11px]">
                  Live Website Top Bar Preview {isEnabled ? "(Visible on Website)" : "(Hidden on Website)"}
                </span>
              </div>
              <span className={clsx("text-[12px] font-medium", isEnabled ? "text-primary" : "text-on-surface-variant")}>
                {isEnabled ? "Live & Active" : "Currently Off"}
              </span>
            </div>

            <div className="p-4 sm:p-6 bg-surface-container-low flex flex-col gap-3">
              {isEnabled ? (
                <div className="w-full bg-primary text-on-primary py-2.5 px-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] transition-all">
                  <div className="flex items-center gap-2 truncate max-w-full">
                    {tag && (
                      <span className="inline-flex items-center justify-center bg-primary-fixed text-on-primary-fixed px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider shrink-0">
                        {tag}
                      </span>
                    )}
                    <span className="truncate font-medium">{text || "Your promotion text will appear here..."}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[12px]">
                    {emergencyPhone && (
                      <span className="hidden md:inline text-white/90">
                        Emergency: {emergencyPhone} |
                      </span>
                    )}
                    <span className="font-bold underline cursor-pointer text-white">
                      {linkText || "Book Tele-Triage →"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full py-4 text-center text-on-surface-variant bg-surface rounded-xl border border-dashed border-outline-variant font-label-md flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[20px] opacity-60">visibility_off</span>
                  <span>Promotions Bar is currently disabled and hidden on the website.</span>
                </div>
              )}
            </div>
          </div>

          {/* EDIT ACTIVE PROMO FORM */}
          <form onSubmit={handleSave} className="bg-surface rounded-2xl shadow-sm border border-surface-container p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container pb-4">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Active Promo Banner Configuration
                </h2>
                <p className="font-body-sm text-on-surface-variant mt-0.5">
                  Customize the headline, banner tag pill, and navigation destination.
                </p>
              </div>

              {/* Enable / Disable Switch */}
              <div 
                onClick={() => handleToggleVisibility(!isEnabled)}
                className={clsx(
                  "flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl border transition-all select-none shadow-sm",
                  isEnabled 
                    ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/15" 
                    : "bg-surface-container-low border-surface-container text-on-surface-variant hover:bg-surface-container"
                )}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleToggleVisibility(!isEnabled); }}
              >
                <div className="flex flex-col text-left">
                  <span className="font-label-sm font-bold leading-tight text-on-surface">Show Bar on Website</span>
                  <span className={clsx("text-[11px] font-medium", isEnabled ? "text-primary" : "text-on-surface-variant")}>
                    {isEnabled ? "Active • Visible to visitors" : "Disabled • Hidden on website"}
                  </span>
                </div>
                <input 
                  type="checkbox" 
                  checked={isEnabled} 
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggleVisibility(e.target.checked);
                  }}
                  className="w-5 h-5 accent-primary cursor-pointer rounded"
                />
              </div>
            </div>

            {/* Multiple Banners Selector */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm font-semibold text-on-surface flex items-center justify-between">
                <span>Rotating Banners ({banners.length})</span>
                <button 
                  type="button" 
                  onClick={handleAddNewBanner}
                  className="text-primary hover:underline text-[12px] font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Add Another Banner</span>
                </button>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {banners.map((b, idx) => (
                  <div 
                    key={idx} 
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[13px] font-semibold transition-all cursor-pointer",
                      selectedIndex === idx 
                        ? "bg-primary text-on-primary border-primary shadow-sm"
                        : "bg-surface-container-low text-on-surface-variant border-surface-container hover:bg-surface-container"
                    )}
                    onClick={() => handleSelectBanner(idx)}
                  >
                    <span>Banner {idx + 1}:</span>
                    <span className="max-w-[120px] truncate">{b.tag || "Alert"}</span>
                    {banners.length > 1 && (
                      <button 
                        type="button" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBanner(idx);
                        }}
                        className="ml-1 opacity-70 hover:opacity-100 hover:text-error"
                        title="Delete banner"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Inputs Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">label</span>
                  <span>Banner Tag</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., Alert, New, Special, Free" 
                  value={tag} 
                  onChange={(e) => updateField("tag", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm transition-colors" 
                />
                <span className="text-[11px] text-on-surface-variant">Shown inside the small rounded pill.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">phone</span>
                  <span>Emergency Phone Number</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g., +92 332 9895770" 
                  value={emergencyPhone} 
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm transition-colors" 
                />
                <span className="text-[11px] text-on-surface-variant">Displayed on desktop on the right side of the bar.</span>
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="font-label-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">campaign</span>
                  <span>Banner Text *</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., Now Offering Virtual 15-Minute Tele-Triage Consultations for New Patients" 
                  value={text} 
                  onChange={(e) => updateField("text", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm transition-colors" 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">link</span>
                  <span>Link URL</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g., /book-appointment or https://..." 
                  value={link} 
                  onChange={(e) => updateField("link", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm transition-colors" 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary">call_made</span>
                  <span>Link Text</span>
                </label>
                <input 
                  type="text" 
                  placeholder="e.g., Book Tele-Triage →" 
                  value={linkText} 
                  onChange={(e) => updateField("linkText", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary text-on-surface font-body-sm transition-colors" 
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-4 border-t border-surface-container">
              <span className="text-[13px] text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                <span>Saves instantly to live cloud database</span>
              </span>

              <button 
                type="submit" 
                disabled={isSaving}
                className="h-11 px-8 rounded-xl bg-primary text-on-primary font-label-md font-bold hover:bg-primary-container shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
    </div>
  );
}
