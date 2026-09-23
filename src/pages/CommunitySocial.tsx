import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";

import { WhatsAppIcon, InstagramIcon, TikTokIcon, FacebookIcon } from "../components/SocialIcons";

export default function CommunitySocial() {
  const [streams, setStreams] = useState<any[]>([]);
  const [nextStream, setNextStream] = useState<any>(null);
  
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(false);
  
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "liveStreams"), orderBy("date", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allStreams = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      // Filter future streams
      const now = new Date();
      const futureStreams = allStreams.filter(stream => {
        const streamDate = new Date(`${stream.date}T${stream.time}`);
        return streamDate > now;
      });
      
      setStreams(futureStreams);
      
      if (futureStreams.length > 0) {
        setNextStream(futureStreams[0]);
      } else {
        setNextStream(null);
        setShowTimer(false);
      }
    }, (error) => {
      console.error("Error fetching streams", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!nextStream) return;
    
    const calculateTimeRemaining = () => {
      const now = new Date();
      const targetDate = new Date(`${nextStream.date}T${nextStream.time}`);
      const diff = targetDate.getTime() - now.getTime();
      
      if (diff > 0) {
        const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));
        // Only show if within 3 days
        if (daysDiff <= 3) {
          setShowTimer(true);
          setDays(daysDiff);
          setHours(Math.floor((diff / (1000 * 60 * 60)) % 24));
          setMinutes(Math.floor((diff / 1000 / 60) % 60));
          setSeconds(Math.floor((diff / 1000) % 60));
        } else {
          setShowTimer(false);
        }
      } else {
        setShowTimer(false);
      }
    };
    
    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(timer);
  }, [nextStream]);

  return (
    <div className="flex flex-col w-full">
      <section className="relative overflow-hidden bg-surface-container-low py-space-2xl px-gutter-mobile md:px-gutter-desktop">
        <div className="absolute -top-32 right-[-10%] w-[500px] h-[500px] rounded-full bg-primary-fixed/20 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 left-[-8%] w-[420px] h-[420px] rounded-full bg-tertiary-fixed/30 blur-3xl pointer-events-none"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center">
            <div className="lg:col-span-7 flex flex-col items-start gap-space-md">
              <div className="inline-flex items-center gap-space-xs px-space-sm py-space-xxs rounded-full bg-surface-container-lowest text-primary shadow-sm font-label-md text-label-md">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span>Digital Health Community • Over 140,000+ Recovering Together</span>
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
                Mindful Motion.<br/>
                <span className="text-primary font-bold">Connected Recovery.</span>
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
                Experience our holistic clinical care outside clinic walls. Join Dr. Ayazullah's active rehabilitation channels for daily ergonomic micro-habits, acute spasm triage, and compassionate peer support.
              </p>
              <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
                <a className="inline-flex items-center gap-space-xs px-space-lg py-space-sm rounded-full bg-primary text-on-primary font-label-lg text-label-lg shadow-sm hover:scale-[1.01] transition-transform" href="https://wa.me/923001234567" target="_blank" rel="noreferrer">
                  <span className="material-symbols-outlined text-[20px]">chat</span>
                  <span>Launch Instant WhatsApp Triage</span>
                </a>
                <a className="inline-flex items-center gap-space-xs px-space-lg py-space-sm rounded-full bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors font-label-lg text-label-lg shadow-sm" href="#schedule">
                  <span className="material-symbols-outlined text-secondary text-[20px]">event_repeat</span>
                  <span>Weekly Live Schedule</span>
                </a>
              </div>
              <div className="grid grid-cols-3 gap-space-md pt-space-md w-full max-w-lg">
                <div className="flex flex-col">
                  <span className="font-headline-md text-headline-md text-on-surface font-bold">&lt; 5 min</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Triage Response Time</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-headline-md text-headline-md text-primary font-bold">140k+</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Active Social Followers</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-headline-md text-headline-md text-tertiary font-bold">100%</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Doctor Verified Protocols</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="rounded-2xl overflow-hidden shadow-xl bg-surface-container-lowest p-space-xs">
                <img className="w-full h-[420px] object-cover rounded-xl" alt="Therapy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD8wEUvw3yuFxsZ4GAvAmLbcIrbz6RvqWch2x60_43bGybZ0jMZy05VsUw0Jsw-d9U00_lTXYOG6C4bUtBTIlFtIfnYHXwlHO9F2xTpKeaHB4O78q3l0UJ2WcuS2WCkYKi0x33jjDr4EtffkHBAW9wyPSeYxowSqAzsJnfViGV_I4kPi9YCxU3JjLlmMQxbb0eFCpgQCX7bce08GEHaRtRgb621Wl4H_Lk8Zwi3Ef-z5hMd6Bapmx2U"/>
              </div>
              <div className="absolute -bottom-6 -left-6 bg-surface-container-lowest/95 backdrop-blur-md p-space-md rounded-xl shadow-lg flex items-center gap-space-sm max-w-xs">
                <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed shrink-0">
                  <span className="material-symbols-outlined text-[24px]">verified</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold">Evidence-Based Guides</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Reviewed weekly by MS-OMPT certified specialists</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop py-space-3xl w-full">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-space-2xl">
          <span className="font-label-md text-label-md text-primary uppercase tracking-wider font-bold">Omnichannel Care Network</span>
          <h2 className="font-display-md text-display-md text-on-surface mt-space-xxs">Choose Your Recovery Hub</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
            Whether you require immediate acute symptom relief, short daily video routines, or longitudinal peer rehabilitation advice.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-12 xl:col-span-7 bg-surface-container-lowest rounded-2xl p-space-xl shadow-md flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-fixed/20 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
                    <WhatsAppIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface">WhatsApp Rapid Triage Desk</h3>
                    <span className="font-label-sm text-label-sm text-primary font-bold">Direct Line to Clinical On-Call Staff</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-space-xxs px-space-sm py-space-xxs rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  Live Now
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Suffering from an acute lumbar spasm, sports joint twist, or neck torticollis? Send a voice note or video clip to our clinical triage officer for immediate non-surgical first-aid posture positioning and appointment acceleration.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs">
                <div className="bg-surface-container-low p-space-sm rounded-lg flex items-start gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[20px] shrink-0">speed</span>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-bold">&lt; 5 Min Response</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Real-time symptom intake</span>
                  </div>
                </div>
                <div className="bg-surface-container-low p-space-sm rounded-lg flex items-start gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[20px] shrink-0">mic</span>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-bold">Voice &amp; Video Notes</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Describe pain intuitively</span>
                  </div>
                </div>
                <div className="bg-surface-container-low p-space-sm rounded-lg flex items-start gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[20px] shrink-0">lock</span>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-bold">HIPAA Compliant</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Confidential medical triage</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-space-lg mt-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md relative z-10">
              <div className="flex items-center gap-space-sm text-on-surface-variant font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                <span>Reviewed directly by Dr. Ayazullah's clinical resident team</span>
              </div>
              <a className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-lg py-space-sm rounded-full bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-lg text-label-lg shadow-sm" href="https://wa.me/923329895770" target="_blank" rel="noreferrer">
                <span className="material-symbols-outlined text-[20px]">send</span>
                <span>Chat on WhatsApp (+92 332 9895770)</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-5 bg-surface-container-lowest rounded-2xl p-space-xl shadow-md flex flex-col justify-between">
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="w-12 h-12 rounded-xl bg-secondary text-on-secondary flex items-center justify-center shadow-sm">
                    <span className="material-symbols-outlined text-[28px]">groups</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Spine &amp; Joint Warriors</h3>
                    <span className="font-label-sm text-label-sm text-secondary font-bold">Facebook Patient Community</span>
                  </div>
                </div>
                <span className="px-space-sm py-space-xxs rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                  14,200+ Members
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                A moderated, empathetic peer community for patients battling disc herniation, sciatica, frozen shoulder, and knee ACL post-surgery recovery. Safe discussions, progress photos, and doctor-approved recovery milestones.
              </p>
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                  <span>Weekly Sunday Live Q&amp;A in the group</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                  <span>Patient-shared non-surgical victory journals</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                  <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                  <span>Zero-spam clinical peer moderation</span>
                </div>
              </div>
            </div>
            <div className="pt-space-lg mt-space-md">
              <a className="w-full inline-flex items-center justify-center gap-space-xs px-space-md py-space-sm rounded-full bg-surface-container-high text-on-surface hover:bg-secondary hover:text-on-secondary transition-all font-label-lg text-label-lg" href="https://www.facebook.com/profile.php?id=100010966832377" target="_blank" rel="noreferrer">
                <FacebookIcon className="w-5 h-5" />
                <span>Join Spine &amp; Joint Warriors (Free)</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-7 bg-surface-container-lowest rounded-2xl p-space-xl shadow-md flex flex-col gap-space-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <div className="w-12 h-12 rounded-xl bg-tertiary text-on-tertiary flex items-center justify-center shadow-sm">
                  <InstagramIcon className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-space-xxs">
                    <h3 className="font-headline-md text-headline-md text-on-surface">@drayazullah_rehab</h3>
                    <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">42.4K Followers • 820+ Clinical Guides</span>
                </div>
              </div>
              <a className="inline-flex items-center gap-space-xxs px-space-md py-space-xs rounded-full bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary hover:text-on-tertiary transition-colors font-label-md text-label-md w-fit" href="https://www.instagram.com/dr_ayaz_ullah?stkn=Z29zZTF1ejlvejBs" target="_blank" rel="noreferrer">
                <span>Follow on Instagram</span>
                <span className="material-symbols-outlined text-[16px]">arrow_outward</span>
              </a>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Explore carousel breakdowns of magnetic resonance imaging (MRI) scans, biomechanical root causes of persistent pain, and guided posture sequencing.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
              {[
                { title: "Why Neck Cracking Hurts You Long-Term", label: "Cervical Spine", color: "primary-fixed", img: "AB6AXuCuBloZYnYM6Xg7a0gI8PA71GyOgsKXHsOOPdCM7WfpzToWAFYEcw0N2hg9M3upn15syhhbOv_N7p3MToF9jnuBUMvv0JbE0TZL9Y5l43NcEaCdXsu4G2sESF2KfNGIFM1KB3sVzCIKBLww6LGxWmPvU4c-rUP-20pgGrzTPWOzq607Ex1-9fVlREIBE9S6dmoCO5RjBg4HQbjFqQXhXNdXzzLI3ONpwDTYCe-n_BBtU4q74UmOtL7d" },
                { title: "The 90-90 Chair Adjustment Blueprint", label: "Ergonomics", color: "secondary-fixed", img: "AB6AXuCMevk9MsH1_lhTjSY6ojEgw2n1gN7cmLfeO19FhE5wHDHdddHoOzSQtFGjFSzYRAP_fZ2Cq7rJ2KeW0A9Rz51EUtcORP80wdUzv6EnnmGFMCVHFUSkCQSDBiPGTA2GjoyBt1KOdloxgcR9UynPnjmDuF9qzSivtfoe56pUsgg4xp2Ktfn1QPqHMBiv_x3MR4oRAGVeyjvrqgfELdDxsImgggpZ6yC1RUf6TBTFo4NJ0lQRWMhJR61U" },
                { title: "Meniscus Tear vs Sprain Diagnosis", label: "Knee Recovery", color: "tertiary-fixed", img: "AB6AXuAgsrZiKacGYgRUyqKtnLrRP2Mn1rII78aX4FqFH4_yXmgBHeJuFgbl_VJYU2XGcU27Mu0sbHgOnZeYt5GyJnxkuz0eDoGzI9R3fp1ybjc1afs9GYYP9dGaRXKLGWK0TGbaTGz3B3QdiiJCcmHVZ23X6Ioh1M1yFIWuxHA3PWVVFnDkjO6tTjMXeZV7oJFQYqQg6IY3-QNCmeYdJEukQM1vhc-6aY3L39kBszgSQXkATgvdQSxJfHOf" }
              ].map((item, i) => (
                <div key={i} className="group relative rounded-xl overflow-hidden shadow-sm bg-surface-container-low aspect-square">
                  <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={`https://lh3.googleusercontent.com/aida-public/${item.img}`} alt="Instagram reel"/>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-space-sm text-white">
                    <span className={`font-label-sm text-label-sm uppercase tracking-wider text-${item.color}`}>{item.label}</span>
                    <span className="font-headline-sm text-headline-sm leading-tight text-white">{item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-5 bg-surface-container-lowest rounded-2xl p-space-xl shadow-md flex flex-col justify-between gap-space-lg">
            <div>
              <div className="flex items-center justify-between mb-space-md">
                <div className="flex items-center gap-space-sm">
                  <div className="w-12 h-12 rounded-xl bg-inverse-surface text-inverse-on-surface flex items-center justify-center shadow-sm">
                    <TikTokIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface">@drayazullah_physio</h3>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">85.6K Followers • 1.2M Likes</span>
                  </div>
                </div>
                <a className="px-space-sm py-space-xxs rounded-full bg-surface-container-high text-on-surface hover:bg-inverse-surface hover:text-inverse-on-surface transition-colors font-label-md text-label-md" href="https://www.tiktok.com/@drayazullah?_r=1&_t=ZS-99h6eu000CV" target="_blank" rel="noreferrer">
                  Watch TikToks
                </a>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mb-space-md">
                Bite-sized, 30-second kinetic resets you can perform right at your desk, car seat, or kitchen counter to unstick compressed nerve roots.
              </p>
              <div className="flex flex-col gap-space-sm">
                {[
                  { title: "Sciatica Nerve Floss in 30 Seconds", views: "640K Views • Instant relief technique", time: "0:34", color: "primary" },
                  { title: "Fix Anterior Pelvic Tilt at Work", views: "412K Views • Psoas release guide", time: "0:45", color: "tertiary" },
                  { title: "Carpal Tunnel Desk Relief", views: "290K Views • Median nerve glides", time: "0:28", color: "secondary" }
                ].map((vid, i) => (
                  <div key={i} className="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors">
                    <div className="flex items-center gap-space-sm">
                      <div className={`w-10 h-10 rounded-full bg-${vid.color}-fixed text-on-${vid.color}-fixed flex items-center justify-center shrink-0`}>
                        <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-label-lg text-label-lg text-on-surface font-bold">{vid.title}</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">{vid.views}</span>
                      </div>
                    </div>
                    <span className={`font-label-sm text-label-sm text-${vid.color} font-bold`}>{vid.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-space-xs">
              <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div className="w-3/4 h-full bg-primary rounded-full"></div>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant mt-1 block">New shorts dropped every Monday, Wednesday &amp; Friday at 6:00 PM</span>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-surface-container-low py-space-3xl px-gutter-mobile md:px-gutter-desktop" id="schedule">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-2xl">
            <div>
              <span className="font-label-md text-label-md text-primary uppercase tracking-wider font-bold">Real-time Clinical Dialogue</span>
              <h2 className="font-display-md text-display-md text-on-surface mt-space-xxs">Weekly Live Streams with Dr. Ayazullah</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs max-w-xl">
                Get your MRI, scan reports, and rehabilitation queries answered live on screen in real time with anatomical 3D models.
              </p>
            </div>
            {showTimer && nextStream ? (
              <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-sm flex items-center gap-space-md border border-outline-variant/30">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">Next Session Starts In:</span>
                  <div className="flex items-center gap-space-xs mt-1">
                    <div className="flex flex-col items-center">
                      <span className="font-headline-lg text-headline-lg text-primary font-bold">{String(days).padStart(2, '0')}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Days</span>
                    </div>
                    <span className="font-headline-lg text-headline-lg text-outline">:</span>
                    <div className="flex flex-col items-center">
                      <span className="font-headline-lg text-headline-lg text-primary font-bold">{String(hours).padStart(2, '0')}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Hours</span>
                    </div>
                    <span className="font-headline-lg text-headline-lg text-outline">:</span>
                    <div className="flex flex-col items-center">
                      <span className="font-headline-lg text-headline-lg text-primary font-bold">{String(minutes).padStart(2, '0')}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Mins</span>
                    </div>
                    <span className="font-headline-lg text-headline-lg text-outline">:</span>
                    <div className="flex flex-col items-center">
                      <span className="font-headline-lg text-headline-lg text-primary font-bold">{String(seconds).padStart(2, '0')}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Secs</span>
                    </div>
                  </div>
                </div>
                <button className="h-10 px-space-md rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-space-xxs" onClick={() => alert('Calendar reminder added for upcoming stream!')}>
                  <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                  <span>Remind Me</span>
                </button>
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-outline-variant/30 flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary text-[24px]">calendar_month</span>
                <span className="font-label-md text-label-md font-bold text-on-surface">Stay tuned for upcoming live sessions!</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
            {streams.length > 0 ? (
              streams.map((stream) => {
                const isInsta = stream.platform === 'instagram';
                const isTikTok = stream.platform === 'tiktok';
                
                return (
                  <div key={stream.id} className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-space-sm">
                        <span className={`inline-flex items-center gap-space-xxs px-space-sm py-0.5 rounded-full font-label-sm text-label-sm font-bold ${
                          isInsta ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 
                          isTikTok ? 'bg-surface-container-highest text-on-surface' : 
                          'bg-secondary-fixed text-on-secondary-fixed'
                        }`}>
                          {isInsta ? <InstagramIcon className="w-4 h-4" /> : 
                           isTikTok ? <TikTokIcon className="w-4 h-4" /> : 
                           <FacebookIcon className="w-4 h-4" />}
                          <span className="capitalize">{stream.platform} Live</span>
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">{new Date(`${stream.date}T${stream.time}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {new Date(`${stream.date}T${stream.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">{stream.topic}</h3>
                    </div>
                    <div className="pt-space-md mt-space-md flex items-center justify-between">
                      <span className="font-label-sm text-label-sm text-primary flex items-center gap-space-xxs">
                        <span className="material-symbols-outlined text-[16px]">notifications</span> Scheduled Event
                      </span>
                      <a className="font-label-md text-label-md text-on-surface hover:text-primary underline" href={
                        isInsta ? "https://www.instagram.com/dr_ayaz_ullah" :
                        isTikTok ? "https://www.tiktok.com/@drayazullah" :
                        "https://www.facebook.com/profile.php?id=100010966832377"
                      } target="_blank" rel="noreferrer">Join Platform →</a>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center flex flex-col items-center justify-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/50">
                <span className="material-symbols-outlined text-[32px] text-outline mb-2">event_busy</span>
                <p className="font-label-lg font-bold text-on-surface">No Upcoming Streams</p>
                <p className="font-body-sm text-on-surface-variant mt-1">Check back later for newly scheduled live masterclasses.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop py-space-3xl w-full">
        <div className="bg-primary text-on-primary rounded-3xl p-space-xl md:p-space-2xl shadow-xl relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary-container/40 blur-2xl pointer-events-none"></div>
          <div className="absolute -left-16 -bottom-16 w-72 h-72 rounded-full bg-primary-fixed/10 blur-2xl pointer-events-none"></div>
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center">
            <div className="lg:col-span-7 flex flex-col gap-space-md">
              <div className="inline-flex items-center gap-space-xxs px-space-sm py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold w-fit">
                <span className="material-symbols-outlined text-[16px]">menu_book</span> Free 28-Page Clinical Resource
              </div>
              <h2 className="font-display-md text-display-md text-on-primary leading-tight">
                The 10-Minute Desk Worker Mobility &amp; Ergonomics Protocol
              </h2>
              <p className="font-body-lg text-body-lg text-primary-fixed-dim max-w-xl">
                Created by Dr. Ayazullah for remote programmers, corporate desk workers, and sedentary executives. Reverse spinal compression and postural forward slump without buying expensive equipment.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm pt-space-xs">
                {["Daily 4-exercise micro-break calendar", "Monitor & lumbar chair elevation chart", "Emergency cervical spine reset stretch", "High-resolution printable PDF handbook"].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-primary">
                    <span className="material-symbols-outlined text-primary-fixed text-[18px]">check</span>
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-space-lg text-on-surface shadow-lg">
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Download Instant Digital PDF</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 mb-space-md">
                Join 35,000+ desk workers living pain-free. Sent immediately to your inbox.
              </p>
              
              {!showSuccess ? (
                <form className="flex flex-col gap-space-sm" onSubmit={(e) => { e.preventDefault(); setShowSuccess(true); }}>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 font-bold" htmlFor="lead-name">Full Name</label>
                    <input className="w-full h-12 px-space-sm rounded-md bg-surface border-0 ring-1 ring-outline-variant/50 focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline" id="lead-name" placeholder="Dr. / Mr. / Ms. Name" required type="text"/>
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 font-bold" htmlFor="lead-email">Email Address</label>
                    <input className="w-full h-12 px-space-sm rounded-md bg-surface border-0 ring-1 ring-outline-variant/50 focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline" id="lead-email" placeholder="name@example.com" required type="email"/>
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 font-bold" htmlFor="lead-symptom">Primary Area of Discomfort (Optional)</label>
                    <select className="w-full h-12 px-space-sm rounded-md bg-surface border-0 ring-1 ring-outline-variant/50 focus:ring-2 focus:ring-primary text-body-md text-on-surface" id="lead-symptom">
                      <option value="neck">Lower Back &amp; Sciatica</option>
                      <option value="back">Neck Stiffness &amp; Shoulder Tension</option>
                      <option value="wrist">Carpal Tunnel / Wrist Pain</option>
                      <option value="general">General Posture &amp; Energy Optimization</option>
                    </select>
                  </div>
                  <button className="w-full h-12 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm transition-transform active:scale-[0.99] flex items-center justify-center gap-space-xs mt-space-xs" type="submit">
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    <span>Send Me Free PDF Guide</span>
                  </button>
                  <span className="font-label-sm text-label-sm text-on-surface-variant text-center">We respect medical privacy. Unsubscribe in 1 click.</span>
                </form>
              ) : (
                <div className="flex flex-col items-center text-center p-space-md gap-space-xs">
                  <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">mark_email_read</span>
                  </div>
                  <h4 className="font-headline-sm text-headline-sm text-on-surface font-bold">Your Guide is On Its Way!</h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Check your inbox. We also included our 3-part video demonstration series.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="w-full max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop pb-space-2xl">
        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-outline text-[22px] shrink-0">info</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <strong className="text-on-surface">Clinical Disclaimer:</strong> Content distributed across Dr. Ayazullah's social channels and support groups is for educational and mobility conditioning purposes. Always consult an in-person healthcare provider before undertaking new therapeutic regimens.
            </p>
          </div>
          <a className="shrink-0 font-label-md text-label-md text-primary hover:underline font-bold" href="/book-appointment">
            Schedule In-Clinic Exam →
          </a>
        </div>
      </section>
    </div>
  );
}
