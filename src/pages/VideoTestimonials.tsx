import React, { useState, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

export default function VideoTestimonials() {
  const [activeFilter, setActiveFilter] = useState("All Recoveries");
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [caseStudies, setCaseStudies] = useState<any[]>([]);
  const [selectedCaseForVlog, setSelectedCaseForVlog] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(true);

  useEffect(() => {
    const qTestimonials = query(collection(db, "testimonials"), orderBy("timestamp", "desc"));
    const unsubTestimonials = onSnapshot(qTestimonials, (snap) => {
      setTestimonials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching testimonials", err);
      setIsLoading(false);
    });

    const qCaseStudies = query(collection(db, "caseStudies"), orderBy("timestamp", "desc"));
    const unsubCaseStudies = onSnapshot(qCaseStudies, (snap) => {
      setCaseStudies(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoadingCases(false);
    }, (err) => {
      console.error("Error fetching case studies", err);
      setIsLoadingCases(false);
    });

    return () => {
      unsubTestimonials();
      unsubCaseStudies();
    };
  }, []);

  const resolveImageUrl = (img: string) => {
    if (!img) return "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80";
    if (img.startsWith("http") || img.startsWith("data:")) return img;
    return `https://lh3.googleusercontent.com/aida-public/${img}`;
  };

  const getYoutubeEmbedUrl = (url: string) => {
    if (!url) return "";
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("youtube.com/watch")) {
      videoId = new URLSearchParams(url.split("?")[1]).get("v") || "";
    } else if (url.includes("youtube.com/embed/")) {
      videoId = url.split("embed/")[1]?.split("?")[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  // Dynamic filter categories derived from active cases
  const filters = useMemo(() => {
    const uniqueTypes = Array.from(new Set(caseStudies.map(c => c.type).filter(Boolean)));
    return ["All Recoveries", ...uniqueTypes];
  }, [caseStudies]);

  const filteredCases = activeFilter === "All Recoveries" 
    ? caseStudies 
    : caseStudies.filter(c => c.type === activeFilter);

  return (
    <div className="flex flex-col w-full">
      <section className="bg-surface py-space-2xl px-gutter-mobile md:px-gutter-desktop border-b border-surface-container">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-space-xxs">Patient Success Stories</span>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Clinical Recoveries &amp; Case Studies</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-md max-w-3xl">
            Real outcomes from real patients. Explore our documented clinical journeys from acute debilitating pain to fully restored functional mobility under Dr. Ayazullah's care.
          </p>
          <div className="mt-space-lg flex items-center justify-center gap-space-sm font-label-md text-label-md text-on-surface-variant bg-surface-container-low px-space-md py-space-xs rounded-full">
            <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
            <span>All testimonials and vlogs are verified clinical records.</span>
          </div>
        </div>
      </section>

      {/* VIDEO TESTIMONIALS FROM DATABASE */}
      <section className="py-space-2xl px-gutter-mobile md:px-gutter-desktop bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center mb-space-xl">
             <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">Video Testimonials</h2>
             <p className="font-body-md text-on-surface-variant mt-2 text-center max-w-2xl">Watch firsthand accounts of our patients' recovery journeys.</p>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : testimonials.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant border border-dashed border-outline-variant rounded-xl bg-surface">
              <span className="material-symbols-outlined text-[40px] mb-2 opacity-50">smart_display</span>
              <p className="font-label-md">Check back soon for new video stories.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
              {testimonials.map((item) => (
                <div key={item.id} className="bg-surface rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-surface-container flex flex-col">
                  <div className="aspect-video w-full bg-black relative">
                    {item.platform === "youtube" ? (
                      <iframe 
                        src={getYoutubeEmbedUrl(item.videoUrl)} 
                        className="w-full h-full absolute top-0 left-0" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <video src={item.videoUrl} controls className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-space-md">
                    <h3 className="font-headline-sm font-bold text-on-surface">{item.title}</h3>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CLINICAL CASE STUDIES & FULL VLOGS */}
      <section id="case-studies" className="py-space-2xl px-gutter-mobile md:px-gutter-desktop bg-surface border-t border-surface-container">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center mb-space-xl text-center">
             <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">Clinical Case Studies</h2>
             <p className="font-body-md text-on-surface-variant mt-2 max-w-2xl">
               Detailed case analyses featuring treatment modalities, recovery milestones, and patient vlogs.
             </p>
          </div>

          {isLoadingCases ? (
            <div className="py-12 flex justify-center">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : caseStudies.length === 0 ? (
            <div className="py-16 px-6 text-center border border-dashed border-outline-variant rounded-2xl bg-surface-container-lowest max-w-xl mx-auto flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">biotech</span>
              </div>
              <h3 className="font-headline-sm font-bold text-on-surface">No Clinical Case Studies Published Yet</h3>
              <p className="font-body-sm text-on-surface-variant max-w-md">
                Detailed clinical analyses and patient recovery vlogs will be displayed here once added by the clinic administration in the portal.
              </p>
            </div>
          ) : (
            <>
              {filters.length > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-space-sm mb-space-2xl">
                  {filters.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={clsx(
                        "px-space-md py-space-xs rounded-full font-label-md text-label-md transition-all shadow-sm",
                        activeFilter === filter
                          ? "bg-primary text-on-primary font-bold"
                          : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-medium"
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
                {filteredCases.map((study, idx) => (
                  <div 
                    key={study.id || idx} 
                    className="bg-surface rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-surface-container transition-all hover:-translate-y-1 hover:shadow-md flex flex-col group cursor-pointer"
                    onClick={() => setSelectedCaseForVlog(study)}
                  >
                    <div className="relative h-52 bg-surface-container overflow-hidden">
                      <img 
                        src={resolveImageUrl(study.img)} 
                        alt={study.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-space-xs right-space-xs px-space-xs py-0.5 rounded bg-surface/90 text-on-surface font-label-sm text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm shadow-sm">
                        {study.type}
                      </div>
                      {study.vlogUrl && (
                        <div className="absolute bottom-space-xs left-space-xs px-2.5 py-1 rounded-full bg-black/80 text-white font-label-sm text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-sm shadow-sm">
                          <span className="material-symbols-outlined text-[15px] text-red-500">smart_display</span>
                          <span>Watch Vlog</span>
                        </div>
                      )}
                    </div>
                    <div className="p-space-md flex flex-col flex-1">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-snug group-hover:text-primary transition-colors">
                        {study.title}
                      </h3>
                      <span className="font-label-sm text-label-sm text-primary font-bold mt-1 block">{study.patient}</span>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm flex-1 line-clamp-3">
                        "{study.desc}"
                      </p>
                      
                      <div className="mt-space-md pt-space-xs border-t border-surface-container flex items-center justify-between">
                        <span className="font-label-sm text-[11px] text-on-surface-variant uppercase font-bold tracking-wider">Recovery Timeline</span>
                        <span className="font-label-sm text-label-sm text-on-surface font-bold bg-surface-container px-space-xs py-0.5 rounded">{study.duration}</span>
                      </div>

                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCaseForVlog(study);
                        }}
                        className="mt-3 w-full py-2 px-3 rounded-xl bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-label-sm font-bold flex items-center justify-center gap-1.5 transition-all text-[13px]"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {study.vlogUrl ? "play_circle" : "menu_book"}
                        </span>
                        {study.vlogUrl ? "Watch Full Vlog & Story" : "Read Clinical Story"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* FULL VLOG & CASE STUDY MODAL */}
      {selectedCaseForVlog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-surface rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col border border-surface-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-surface-container flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur-sm z-10">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider">
                    {selectedCaseForVlog.type}
                  </span>
                  <span className="text-[12px] font-semibold text-on-surface-variant">
                    Timeline: {selectedCaseForVlog.duration}
                  </span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1">
                  {selectedCaseForVlog.title}
                </h3>
                <span className="font-label-sm text-primary font-bold">{selectedCaseForVlog.patient}</span>
              </div>
              <button 
                onClick={() => setSelectedCaseForVlog(null)}
                className="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors"
                title="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Video or Photo Banner */}
            <div className="w-full bg-black">
              {selectedCaseForVlog.vlogUrl ? (
                <div className="aspect-video w-full">
                  {selectedCaseForVlog.vlogUrl.includes("youtube") || selectedCaseForVlog.vlogUrl.includes("youtu.be") ? (
                    <iframe 
                      src={getYoutubeEmbedUrl(selectedCaseForVlog.vlogUrl)}
                      className="w-full h-full"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <video src={selectedCaseForVlog.vlogUrl} controls className="w-full h-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="h-64 sm:h-80 w-full overflow-hidden">
                  <img 
                    src={resolveImageUrl(selectedCaseForVlog.img)} 
                    alt={selectedCaseForVlog.title} 
                    className="w-full h-full object-cover" 
                  />
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h4 className="font-label-sm uppercase font-bold text-primary tracking-wider text-[11px] mb-1">
                  Clinical Synopsis
                </h4>
                <p className="font-body-md text-on-surface italic bg-surface-container-low p-3.5 rounded-xl border border-surface-container">
                  "{selectedCaseForVlog.desc}"
                </p>
              </div>

              {selectedCaseForVlog.fullStory && (
                <div>
                  <h4 className="font-label-sm uppercase font-bold text-on-surface tracking-wider text-[11px] mb-2">
                    Full Recovery Vlog Narrative &amp; Protocol
                  </h4>
                  <div className="font-body-md text-on-surface-variant whitespace-pre-line leading-relaxed">
                    {selectedCaseForVlog.fullStory}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-on-surface-variant text-[13px]">
                  <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                  <span>Documented under Dr. Ayazullah's clinical supervision</span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => setSelectedCaseForVlog(null)}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-surface-container text-on-surface font-label-md font-medium hover:bg-surface-container transition-colors"
                  >
                    Close
                  </button>
                  <Link 
                    to="/book-appointment" 
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>Book Consultation</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="bg-primary text-on-primary py-space-3xl px-gutter-mobile md:px-gutter-desktop relative overflow-hidden">
        <div className="absolute -left-32 -bottom-32 w-96 h-96 bg-primary-fixed/20 rounded-full blur-[80px]"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
          <span className="material-symbols-outlined text-[48px] text-primary-fixed mb-space-sm opacity-80">format_quote</span>
          <h2 className="font-display-md text-display-md font-medium leading-tight text-balance">
            "I was told surgery was my only option for my L4-L5 herniation. Dr. Ayazullah's precise decompression protocols gave me my life back in 8 weeks, completely non-surgically."
          </h2>
          <span className="font-label-lg text-label-lg font-bold text-primary-fixed mt-space-md block">— Review from Verified Google Business Profile</span>
          
          <div className="mt-space-xl flex flex-col sm:flex-row items-center gap-space-md">
            <a href="/book-appointment" className="px-space-xl h-12 rounded-full bg-on-primary text-primary font-label-lg text-label-lg font-bold shadow-lg hover:scale-105 transition-transform flex items-center justify-center">
              Start Your Recovery Journey
            </a>
            <a href="https://google.com/maps" target="_blank" rel="noreferrer" className="px-space-xl h-12 rounded-full border-2 border-primary-fixed text-primary-fixed hover:bg-primary-fixed hover:text-on-primary-fixed font-label-lg text-label-lg font-bold transition-colors flex items-center justify-center gap-space-xs">
              <span>Read 150+ Google Reviews</span>
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
