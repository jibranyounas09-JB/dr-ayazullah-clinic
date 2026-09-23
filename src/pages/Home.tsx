import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { calculateExperience, DEFAULT_PRACTICE_START_DATE } from "../lib/experienceUtils";

export default function Home() {
  const [doctorPhoto, setDoctorPhoto] = useState<string | null>(() => {
    return localStorage.getItem("doctor_photo_custom") || null;
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic clinical experience & stats (automatically calculates 3.5+ years based on start date)
  const [experienceDisplay, setExperienceDisplay] = useState<string>(() => {
    return calculateExperience().formatted;
  });
  const [recoveriesDisplay, setRecoveriesDisplay] = useState<string>("14k+");
  const [ratingDisplay, setRatingDisplay] = useState<string>("4.9");

  useEffect(() => {
    // Check if image exists in public folder first
    fetch("/doctor-ayazullah.jpg", { method: "HEAD" })
      .then((res) => {
        if (res.ok) setDoctorPhoto("/doctor-ayazullah.jpg");
      })
      .catch(() => {});

    // Listen to Firestore general settings for doctor photo and dynamic stats
    const unsub = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.doctorPhotoUrl) {
          setDoctorPhoto(data.doctorPhotoUrl);
          localStorage.setItem("doctor_photo_custom", data.doctorPhotoUrl);
        }
        
        // Dynamically compute experience
        const exp = calculateExperience(
          data.practiceStartDate || DEFAULT_PRACTICE_START_DATE,
          data.experienceMode || "auto",
          data.manualExperience
        );
        setExperienceDisplay(exp.formatted);

        if (data.recoveriesCount) {
          setRecoveriesDisplay(data.recoveriesCount);
        }
        if (data.clinicRating) {
          setRatingDisplay(data.clinicRating);
        }
      }
    });

    return () => unsub();
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setDoctorPhoto(base64);
        localStorage.setItem("doctor_photo_custom", base64);
        try {
          await setDoc(doc(db, "settings", "general"), { doctorPhotoUrl: base64 }, { merge: true });
        } catch (err) {
          console.error("Failed to sync photo to Firestore:", err);
        }
      }
      setIsUploadingPhoto(false);
    };
    reader.onerror = () => setIsUploadingPhoto(false);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processFile(file);
    }
  };
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-surface py-space-3xl px-gutter-mobile md:px-gutter-desktop border-b border-surface-container flex flex-col items-center min-h-[85vh] justify-center">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-primary-container/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-secondary-fixed/20 rounded-full blur-[80px]"></div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10 w-full grid grid-cols-1 lg:grid-cols-2 gap-space-2xl items-center">
          <div className="flex flex-col items-start gap-space-md">
            <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-widest font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              Accepting New Patients
            </div>
            <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight leading-tight">
              Restore Your Motion. <br />
              <span className="text-primary">Reclaim Your Life.</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed max-w-xl">
              Advanced musculoskeletal rehabilitation, non-surgical spine decompression, and sports injury recovery under the expert care of Dr. Ayazullah.
            </p>
            <div className="flex flex-wrap items-center gap-space-sm mt-space-sm">
              <Link
                to="/book-appointment"
                className="px-space-xl py-space-sm rounded-full bg-primary text-on-primary font-label-lg text-label-lg font-bold shadow-md hover:bg-primary-container hover:scale-[1.02] transition-all flex items-center gap-space-xs"
              >
                <span>Book Consultation</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
              <Link
                to="/video-testimonials"
                className="px-space-xl py-space-sm rounded-full bg-surface-container-lowest text-on-surface font-label-lg text-label-lg font-bold shadow-sm hover:bg-surface-container transition-colors border border-outline-variant/30 flex items-center gap-space-xs"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">play_circle</span>
                <span>Patient Stories</span>
              </Link>
            </div>
            
            <div className="flex items-center gap-space-lg mt-space-lg pt-space-md border-t border-surface-container w-full max-w-md">
              <div className="flex flex-col">
                <span className="font-display-md-mobile text-display-md-mobile text-on-surface font-bold">
                  {experienceDisplay}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Years Exp.</span>
              </div>
              <div className="flex flex-col">
                <span className="font-display-md-mobile text-display-md-mobile text-on-surface font-bold">
                  {recoveriesDisplay}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Recoveries</span>
              </div>
              <div className="flex flex-col">
                <span className="font-display-md-mobile text-display-md-mobile text-on-surface font-bold">
                  {ratingDisplay}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-amber-500 text-[14px] filled">star</span>
                  Rating
                </span>
              </div>
            </div>
          </div>
          
          <div className="relative w-full h-full min-h-[400px] lg:min-h-[600px] rounded-3xl overflow-hidden shadow-2xl">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD8wEUvw3yuFxsZ4GAvAmLbcIrbz6RvqWch2x60_43bGybZ0jMZy05VsUw0Jsw-d9U00_lTXYOG6C4bUtBTIlFtIfnYHXwlHO9F2xTpKeaHB4O78q3l0UJ2WcuS2WCkYKi0x33jjDr4EtffkHBAW9wyPSeYxowSqAzsJnfViGV_I4kPi9YCxU3JjLlmMQxbb0eFCpgQCX7bce08GEHaRtRgb621Wl4H_Lk8Zwi3Ef-z5hMd6Bapmx2U" 
              alt="Dr. Ayazullah performing manual therapy" 
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>
            <div className="absolute bottom-space-lg left-space-lg right-space-lg bg-surface/90 backdrop-blur-md p-space-md rounded-2xl shadow-lg border border-surface-container-lowest/20">
              <div className="flex items-center gap-space-sm">
                <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">verified</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold">IFOMPT Certified Practice</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Evidence-based international clinical standards</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clinical Programs Section */}
      <section className="bg-surface-container-lowest py-space-3xl px-gutter-mobile md:px-gutter-desktop">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg mb-space-2xl">
            <div className="max-w-2xl">
              <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1 block">Clinical Excellence</span>
              <h2 className="font-display-md text-display-md text-on-surface">Specialized Care Programs</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-sm">
                We move beyond symptom masking. Our diagnostic frameworks target the mechanical root cause of pain for long-term resolution.
              </p>
            </div>
            <Link to="/book-appointment" className="font-label-md text-label-md text-primary font-bold hover:underline flex items-center gap-1">
              View All Treatments <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
            {[
              {
                title: "Spine & Disc Restoration",
                desc: "Non-surgical decompression for sciatica, herniated discs, and chronic lumbar facet strain. Regain structural alignment.",
                icon: "accessibility_new",
                color: "primary"
              },
              {
                title: "Sports Injury & Athletics",
                desc: "ACL/PCL tear protocols, rotator cuff impingement resolution, and biomechanical return-to-play screening.",
                icon: "sprint",
                color: "secondary"
              },
              {
                title: "Dry Needling & Myofascial",
                desc: "Targeted intramuscular trigger point deactivation for tension headache relief, spasms, and deep fascia relaxation.",
                icon: "pin_invoke",
                color: "tertiary"
              }
            ].map((program, idx) => (
              <div key={idx} className="group flex flex-col p-space-lg rounded-2xl bg-surface border border-surface-container hover:shadow-xl hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <div className={`w-14 h-14 rounded-2xl bg-${program.color}-fixed/20 text-${program.color} flex items-center justify-center mb-space-md`}>
                  <span className="material-symbols-outlined text-[28px]">{program.icon}</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-space-xs group-hover:text-primary transition-colors">{program.title}</h3>
                <p className="font-body-md text-body-md text-on-surface-variant flex-1 mb-space-lg">
                  {program.desc}
                </p>
                <div className="flex items-center gap-1 font-label-md text-label-md text-primary font-bold mt-auto">
                  Learn More <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Doctor Section */}
      <section className="bg-surface py-space-3xl px-gutter-mobile md:px-gutter-desktop border-t border-b border-surface-container overflow-hidden relative">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-space-2xl items-center relative z-10">
          <div className="relative">
            <div className="absolute top-4 -left-4 w-full h-full bg-primary-fixed/20 rounded-3xl -z-10"></div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoSelect} 
              accept="image/*" 
              className="hidden" 
            />

            {doctorPhoto ? (
              <div className="relative w-full max-w-md mx-auto rounded-3xl overflow-hidden shadow-lg aspect-[4/5] bg-surface-container">
                <img 
                  src={doctorPhoto} 
                  alt="Dr. Ayazullah Portrait" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="w-full max-w-md mx-auto rounded-3xl border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 transition-all aspect-[4/5] flex flex-col items-center justify-center p-6 text-center cursor-pointer group shadow-inner"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                  <span className="material-symbols-outlined text-[36px]">add_a_photo</span>
                </div>
                <h3 className="font-headline-sm text-base font-bold text-on-surface mb-1">
                  Add Dr. Ayazullah's Photo
                </h3>
                <p className="text-xs text-on-surface-variant max-w-[220px] mb-4">
                  Click here or drag and drop the doctor's portrait image to display it in this box
                </p>
                <span className="px-4 py-2 rounded-full bg-primary text-on-primary font-label-sm text-xs font-bold shadow hover:bg-primary-container transition-colors flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  <span>{isUploadingPhoto ? "Uploading..." : "Select Image from Device"}</span>
                </span>
              </div>
            )}

            <div className="absolute -bottom-6 -right-6 md:right-4 bg-surface-container-lowest p-space-md rounded-2xl shadow-xl flex items-center gap-space-sm border border-surface-container z-20">
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Dr. Ayazullah</span>
                <span className="font-label-sm text-label-sm text-primary">Senior Physical Therapist</span>
                <span className="font-body-sm text-[12px] text-on-surface-variant">DPT, MS-OMPT</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-space-md">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1">Meet The Expert</span>
            <h2 className="font-display-md text-display-md text-on-surface leading-tight">
              Pioneering Patient-Centric Rehabilitation
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Dr. Ayazullah is a distinguished Senior Consultant Physical Therapist specializing in Orthopedic Manual Physical Therapy. With a deep commitment to avoiding unnecessary surgeries, he utilizes advanced biomechanical analysis to treat the root causes of pain.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md mt-space-sm w-full">
              <div className="flex items-start gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[24px]">verified_user</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-bold">IFOMPT Member</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Globally recognized standards</span>
                </div>
              </div>
              <div className="flex items-start gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[24px]">school</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-bold">Clinical Fellowship</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Mentoring 400+ graduates</span>
                </div>
              </div>
              <div className="flex items-start gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[24px]">diversity_1</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-bold">Community Leader</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">140k+ digital health followers</span>
                </div>
              </div>
            </div>
            <div className="mt-space-md">
              <Link to="/contact-us" className="px-space-lg py-space-sm rounded-full bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary font-label-lg text-label-lg font-bold shadow-sm transition-colors flex items-center gap-space-xs">
                Contact The Clinic
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-on-primary py-space-3xl px-gutter-mobile md:px-gutter-desktop relative overflow-hidden">
        <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary-fixed/20 rounded-full blur-[80px]"></div>
        <div className="absolute -left-32 -bottom-32 w-96 h-96 bg-primary-fixed/20 rounded-full blur-[80px]"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
          <h2 className="font-display-md text-display-md font-medium leading-tight mb-space-md">
            Don't Let Pain Dictate Your Life. <br/> Take the First Step Today.
          </h2>
          <p className="font-body-lg text-body-lg text-primary-fixed-dim max-w-2xl mb-space-xl">
            Schedule a comprehensive 45-minute musculoskeletal diagnostic assessment. Let's build your personalized path to a pain-free, active life.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-space-md">
            <Link to="/book-appointment" className="px-space-xl h-14 rounded-full bg-on-primary text-primary font-label-lg text-label-lg font-bold shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2">
              Book Assessment Now <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
            <a href="tel:+923001234567" className="px-space-xl h-14 rounded-full border-2 border-primary-fixed text-primary-fixed hover:bg-primary-fixed hover:text-on-primary-fixed font-label-lg text-label-lg font-bold transition-colors flex items-center justify-center gap-space-xs">
              <span className="material-symbols-outlined text-[20px]">call</span>
              <span>Call Clinic Desk</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
