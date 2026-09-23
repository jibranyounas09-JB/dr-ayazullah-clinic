import { useState, useEffect } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "motion/react";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const DEFAULT_PROMOTIONS = [
  {
    tag: "Alert",
    text: "Now Offering Virtual 15-Minute Tele-Triage Consultations for New Patients",
    link: "/book-appointment",
    linkText: "Book Tele-Triage →"
  },
  {
    tag: "New",
    text: "Summer 2025 Clinical Internship & Fellowship Intake (Only 12 Seats Available)",
    link: "/internship-academy",
    linkText: "Apply for Fellowship →"
  },
  {
    tag: "Free",
    text: "Download Our Comprehensive 28-Page Posture & Ergonomics Protocol PDF",
    link: "/community-and-social",
    linkText: "Get Free PDF →"
  }
];

import { BrandLogo } from "./BrandLogo";
import { WhatsAppIcon, InstagramIcon, TikTokIcon, FacebookIcon } from "./SocialIcons";
import { VoiceChatbot } from "./VoiceChatbot";

export default function Layout() {
  const [promotions, setPromotions] = useState<any[]>(DEFAULT_PROMOTIONS);
  const [currentPromo, setCurrentPromo] = useState(0);
  const [isPromoBarVisible, setIsPromoBarVisible] = useState(true);
  const [emergencyPhone, setEmergencyPhone] = useState("+92 332 9895770");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "content", "promotions"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.isEnabled !== undefined) {
          setIsPromoBarVisible(data.isEnabled === true);
        }
        if (data.emergencyPhone) {
          setEmergencyPhone(data.emergencyPhone);
        }
        if (Array.isArray(data.banners) && data.banners.length > 0) {
          setPromotions(data.banners);
        } else if (data.text) {
          setPromotions([{
            tag: data.tag || "Alert",
            text: data.text,
            link: data.link || "/book-appointment",
            linkText: data.linkText || "Book Now →"
          }]);
        }
      }
    }, (error) => {
      console.error("Error listening to promotions content:", error);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (promotions.length <= 1) {
      setCurrentPromo(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentPromo((prev) => (prev + 1) % promotions.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [promotions.length]);

  const activePromo = promotions[currentPromo] || promotions[0] || DEFAULT_PROMOTIONS[0];

  return (
    <div className="flex flex-col min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        {isPromoBarVisible && activePromo && (
          <aside className="w-full bg-primary text-on-primary py-space-xxs px-gutter-mobile md:px-gutter-desktop overflow-hidden transition-all">
            <div className="max-w-7xl mx-auto flex items-center justify-between font-label-sm text-label-sm min-h-[28px]">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={`${currentPromo}-${activePromo.text}-${activePromo.tag}`}
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -15, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-space-xs truncate">
                    {activePromo.tag && (
                      <span className="inline-flex items-center justify-center bg-primary-fixed text-on-primary-fixed px-space-xs py-0.5 rounded-full font-label-sm text-[11px] uppercase tracking-wider font-bold shrink-0">
                        {activePromo.tag}
                      </span>
                    )}
                    <span className="truncate">{activePromo.text}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-space-md font-label-sm text-label-sm shrink-0 ml-space-md">
                    {emergencyPhone && (
                      <>
                        <a className="hover:underline flex items-center gap-space-xxs" href={`tel:${emergencyPhone.replace(/\s+/g, '')}`}>
                          <span className="material-symbols-outlined text-[16px]">call</span>Emergency: {emergencyPhone}
                        </a>
                        <span className="text-primary-fixed-dim">|</span>
                      </>
                    )}
                    {activePromo.link && activePromo.linkText && (
                      activePromo.link.startsWith("http") ? (
                        <a className="hover:underline text-on-primary font-bold" href={activePromo.link} target="_blank" rel="noreferrer">
                          {activePromo.linkText}
                        </a>
                      ) : (
                        <Link className="hover:underline text-on-primary font-bold" to={activePromo.link}>
                          {activePromo.linkText}
                        </Link>
                      )
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </aside>
        )}
        <div className="h-20 max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop flex items-center justify-between gap-space-md">
          <Link to="/" className="flex items-center gap-space-sm group">
            <BrandLogo className="w-10 h-10 transition-transform group-hover:scale-105 shadow-sm" />
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight leading-tight">Dr. Ayazullah</span>
              <span className="font-label-sm text-[11px] text-on-surface-variant font-medium tracking-wide uppercase">Physiotherapy & Rehab</span>
            </div>
          </Link>
          <nav className="hidden xl:flex items-center gap-space-xs p-space-xxs">
            <NavLink to="/" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Home</NavLink>
            <NavLink to="/book-appointment" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Book Appointment</NavLink>
            <NavLink to="/manage-booking" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Manage Booking</NavLink>
            <NavLink to="/internship-academy" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Internship Academy</NavLink>
            <NavLink to="/video-testimonials" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Video Testimonials</NavLink>
            <NavLink to="/community-and-social" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Community &amp; Social</NavLink>
            <NavLink to="/contact-us" className={({isActive}) => clsx("px-space-sm py-space-xs rounded-full font-label-lg text-label-lg transition-colors", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface")}>Contact Us</NavLink>
          </nav>
          <div className="flex items-center gap-space-sm">
            <a className="hidden lg:flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md" href="https://api.whatsapp.com/message/24WK4RBZW53GK1?autoload=1&app_absent=0" target="_blank" rel="noreferrer">
              <WhatsAppIcon className="text-primary w-5 h-5" /><span>WhatsApp Desk</span>
            </a>
            <Link className="hidden sm:inline-flex items-center justify-center px-space-md py-space-xs rounded-full bg-primary hover:bg-primary-container text-on-primary transition-all font-label-lg text-label-lg shadow-sm hover:scale-[1.01]" to="/book-appointment">Book Consultation</Link>
            
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="xl:hidden w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors ml-1"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] xl:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[300px] max-w-[80vw] bg-surface z-[70] shadow-2xl flex flex-col xl:hidden border-l border-surface-container"
            >
              <div className="flex items-center justify-between p-space-md border-b border-surface-container">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Menu</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <nav className="flex flex-col p-space-md gap-space-xs overflow-y-auto">
                {[
                  { path: "/", label: "Home" },
                  { path: "/book-appointment", label: "Book Appointment" },
                  { path: "/manage-booking", label: "Manage Booking" },
                  { path: "/internship-academy", label: "Internship Academy" },
                  { path: "/video-testimonials", label: "Video Testimonials" },
                  { path: "/community-and-social", label: "Community & Social" },
                  { path: "/contact-us", label: "Contact Us" }
                ].map((item) => (
                  <NavLink 
                    key={item.path}
                    to={item.path} 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({isActive}) => clsx(
                      "px-space-md py-space-sm rounded-xl font-label-lg text-label-lg transition-colors flex items-center", 
                      isActive 
                        ? "bg-primary-container text-on-primary-container font-bold" 
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    )}
                  >
                    {item.label}
                  </NavLink>
                ))}

                <div className="mt-space-lg pt-space-lg border-t border-surface-container flex flex-col gap-space-sm">
                  <a className="flex items-center gap-space-sm px-space-md py-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md" href="https://api.whatsapp.com/message/24WK4RBZW53GK1?autoload=1&app_absent=0" target="_blank" rel="noreferrer">
                    <WhatsAppIcon className="text-primary w-5 h-5" />
                    <span>WhatsApp Desk</span>
                  </a>
                  <Link 
                    to="/book-appointment"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-space-xs px-space-md py-space-sm rounded-xl bg-primary hover:bg-primary-container text-on-primary transition-all font-label-lg text-label-lg shadow-sm"
                  >
                    Book Consultation
                  </Link>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className={clsx("w-full bg-surface flex-1 transition-all duration-200", isPromoBarVisible ? "pt-28" : "pt-20")}>
        <Outlet />
      </main>
      <footer className="w-full bg-surface-container-lowest shadow-[0_-1px_10px_rgba(0,0,0,0.03)] mt-auto">
        <div className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop pt-space-2xl pb-space-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-space-xl pb-space-xl">
            <div className="lg:col-span-2 flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-md text-headline-md text-on-surface">Dr. Ayazullah Clinic</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">Senior Consultant Physical Therapist (DPT, MS-OMPT, Certified Dry Needling Practitioner). Pioneering patient-centric physical rehabilitation, non-surgical spine restoration, and sports motion recovery.</p>
              <div className="flex flex-col gap-space-xxs pt-space-xs">
                <span className="font-label-md text-label-md text-primary font-bold flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-[18px]">verified</span>Certified &amp; Accredited Clinical Practice
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Member International Federation of Orthopaedic Physical Therapists (IFOMPT) &amp; Pakistan Physical Therapy Association (PPTA).</p>
              </div>
            </div>
            <div className="flex flex-col gap-space-sm">
              <span className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider font-bold">Care Programs</span>
              <nav className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                <Link className="hover:text-primary transition-colors" to="/">Spine &amp; Disc Restoration</Link>
                <Link className="hover:text-primary transition-colors" to="/">Orthopedic Rehabilitation</Link>
                <Link className="hover:text-primary transition-colors" to="/">Post-Surgical Motion Care</Link>
                <Link className="hover:text-primary transition-colors" to="/">Dry Needling &amp; Myofascial</Link>
                <Link className="hover:text-primary transition-colors" to="/">Sports Athletic Return</Link>
              </nav>
            </div>
            <div className="flex flex-col gap-space-sm">
              <span className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider font-bold">Quick Links</span>
              <nav className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                <Link className="hover:text-primary transition-colors" to="/">Home Overview</Link>
                <Link className="hover:text-primary transition-colors" to="/book-appointment">Book Assessment</Link>
                <Link className="hover:text-primary transition-colors" to="/manage-booking">Manage Booking</Link>
                <Link className="hover:text-primary transition-colors" to="/internship-academy">Internship Academy</Link>
                <Link className="hover:text-primary transition-colors" to="/video-testimonials">Patient Stories &amp; Videos</Link>
                <Link className="hover:text-primary transition-colors" to="/community-and-social">Community Health Hub</Link>
                <Link className="hover:text-primary transition-colors" to="/contact-us">Contact &amp; Map Location</Link>
              </nav>
            </div>
            <div className="flex flex-col gap-space-sm">
              <span className="font-label-lg text-label-lg text-on-surface uppercase tracking-wider font-bold">Clinic Location &amp; Desk</span>
              <div className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex items-start gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">location_on</span>
                  <span>Dr Ayazullah Physiotherapy and Sports Rehabilitation Clinic, Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</span>
                </div>
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[18px] shrink-0">support_agent</span>
                  <a className="hover:text-primary font-bold text-on-surface" href="tel:+923009876543">Acute Injury: +92 (300) 987-6543</a>
                </div>
                <div className="flex items-center gap-space-xs">
                  <WhatsAppIcon className="text-primary w-[18px] h-[18px] shrink-0" />
                  <a className="hover:text-primary font-bold text-on-surface" href="https://api.whatsapp.com/message/24WK4RBZW53GK1?autoload=1&app_absent=0" target="_blank" rel="noreferrer">WhatsApp Chat Support</a>
                </div>
              </div>
              <div className="pt-space-xs flex items-center gap-space-sm">
                <a aria-label="WhatsApp" className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-primary hover:text-on-primary flex items-center justify-center text-on-surface-variant transition-colors" href="https://api.whatsapp.com/message/24WK4RBZW53GK1?autoload=1&app_absent=0" target="_blank" rel="noreferrer">
                  <WhatsAppIcon className="w-[18px] h-[18px]" />
                </a>
                <a aria-label="Instagram" className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-primary hover:text-on-primary flex items-center justify-center text-on-surface-variant transition-colors" href="https://www.instagram.com/dr_ayaz_ullah?stkn=Z29zZTF1ejlvejBs" target="_blank" rel="noreferrer">
                  <InstagramIcon className="w-[18px] h-[18px]" />
                </a>
                <a aria-label="TikTok" className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-primary hover:text-on-primary flex items-center justify-center text-on-surface-variant transition-colors" href="https://www.tiktok.com/@drayazullah?_r=1&_t=ZS-99h6eu000CV" target="_blank" rel="noreferrer">
                  <TikTokIcon className="w-[18px] h-[18px]" />
                </a>
                <a aria-label="Facebook" className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-primary hover:text-on-primary flex items-center justify-center text-on-surface-variant transition-colors" href="https://www.facebook.com/profile.php?id=100010966832377" target="_blank" rel="noreferrer">
                  <FacebookIcon className="w-[18px] h-[18px]" />
                </a>
              </div>
            </div>
          </div>
          <div className="pt-space-lg flex flex-col md:flex-row items-center justify-between gap-space-sm font-label-sm text-label-sm text-on-surface-variant border-t border-surface-container">
            <p>© 2025 Dr. Ayazullah Physiotherapy &amp; Motion Rehabilitation Center. All rights reserved.</p>
            <div className="flex items-center gap-space-md">
              <a className="hover:underline" href="#">Patient Privacy Policy</a>
              <a className="hover:underline" href="#">Clinical Terms of Practice</a>
              <a className="hover:underline" href="#">Telehealth Consent</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Groq Voice & Chat AI Assistant */}
      <VoiceChatbot />
    </div>
  );
}
