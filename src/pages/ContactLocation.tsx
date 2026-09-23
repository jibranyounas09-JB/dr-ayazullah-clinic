import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, getDoc, collection, setDoc } from "firebase/firestore";

export default function ContactLocation() {
  const [selectedTopic, setSelectedTopic] = useState("Appointment Inquiry");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formError, setFormError] = useState("");
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "general"));
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchSettings();
  }, []);

  const emergencyPhone = settings?.emergencyPhone || "+92 332 9895770";
  const clinicAddress = (settings?.clinicAddress && !settings.clinicAddress.includes("MediCare"))
    ? settings.clinicAddress
    : "Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic\nOffice #12, 1st Floor, Pakland Plaza\nG-8 Markaz\nIslamabad, Pakistan";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !message.trim()) {
      setFormError("Please fill in your name, email address, and message content.");
      return;
    }

    setFormError("");
    setIsSubmitting(true);

    try {
      const docRef = doc(collection(db, "contactMessages"));
      const inquiryData = {
        id: docRef.id,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        topic: selectedTopic,
        message: message.trim(),
        createdAt: new Date().toISOString(),
        status: "Unread"
      };

      await setDoc(docRef, inquiryData);

      // Trigger email notification
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email.trim(),
            subject: `Reception Desk Inquiry: ${selectedTopic}`,
            type: "CONTACT_INQUIRY",
            data: inquiryData
          })
        });
      } catch (emailErr) {
        console.warn("Email dispatch notice:", emailErr);
      }

      setShowSuccess(true);
      setFullName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch (err: any) {
      console.error("Error submitting inquiry:", err);
      handleFirestoreError(err, OperationType.CREATE, "contactMessages");
      setFormError("Failed to transmit message. Please try again or contact via WhatsApp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <section className="bg-surface-container-low py-space-xl px-gutter-mobile md:px-gutter-desktop">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-space-lg">
          <div className="flex flex-col max-w-xl">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold mb-1">Contact Clinic</span>
            <h1 className="font-display-md text-display-md text-on-surface tracking-tight leading-tight">Here For Your Recovery</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-space-xs">
              Direct access to our triage desk, physical clinic location, and rapid WhatsApp emergency channels.
            </p>
          </div>
          <div className="flex items-center gap-space-xs bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/30">
            <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">emergency</span>
            </div>
            <div className="flex flex-col pr-space-md">
              <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">Acute Pain / Traumatic Injury</span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{emergencyPhone}</span>
            </div>
            <a className="h-10 px-space-md rounded-full bg-error text-on-error font-label-md text-label-md flex items-center shadow-sm hover:scale-[1.02] transition-transform" href={`tel:${emergencyPhone.replace(/\D/g, '')}`}>
              Call Now
            </a>
          </div>
        </div>
      </section>

      <section className="w-full max-w-7xl mx-auto px-gutter-mobile md:px-gutter-desktop py-space-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl items-start">
          <div className="flex flex-col gap-space-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col items-start gap-space-sm">
                <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">location_on</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Primary Practice Facility</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-wrap">{clinicAddress}</p>
                </div>
                <a className="font-label-md text-label-md text-primary font-bold flex items-center gap-space-xxs hover:underline" href="https://www.google.com/maps/search/?api=1&query=Pakland+Plaza+G-8+Markaz+Islamabad" target="_blank" rel="noreferrer">
                  Open in Google Maps <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </a>
              </div>

              <div className="bg-surface-container-lowest p-space-md rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col items-start gap-space-sm">
                <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">schedule</span>
                </div>
                <div className="flex flex-col gap-1 w-full">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Clinical Operating Hours</h3>
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant py-1 border-b border-surface-container">
                    <span>Mon - Fri</span>
                    <span className="font-semibold text-on-surface">9:00 AM - 8:30 PM</span>
                  </div>
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant py-1 border-b border-surface-container">
                    <span>Saturday</span>
                    <span className="font-semibold text-on-surface">9:00 AM - 3:00 PM</span>
                  </div>
                  <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant py-1">
                    <span>Sunday</span>
                    <span className="font-semibold text-primary">9:00 AM - 3:00 PM (Available)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest p-space-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
              <div className="flex items-center gap-space-xs text-on-surface">
                <span className="material-symbols-outlined text-tertiary text-[24px]">question_answer</span>
                <h3 className="font-headline-sm text-headline-sm font-bold">Frequently Asked Patient Queries</h3>
              </div>
              <div className="flex flex-col gap-space-sm divide-y divide-surface-container">
                <div className="py-space-sm flex flex-col gap-space-xs">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold flex items-center justify-between cursor-pointer group">
                    <span>Do you accept insurance panels (Sehat Sahulat)?</span>
                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">expand_more</span>
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    We operate on a direct-fee-for-service model to guarantee uninterrupted 45-minute 1-on-1 sessions. However, we provide certified stamped receipts and diagnosis codes for you to file out-of-network reimbursement claims.
                  </p>
                </div>
                <div className="py-space-sm flex flex-col gap-space-xs">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold flex items-center justify-between cursor-pointer group">
                    <span>Is a doctor's referral necessary before booking?</span>
                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">expand_more</span>
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed hidden">
                    No. As a Doctor of Physical Therapy (DPT), Dr. Ayazullah holds direct-access credentials. You can book an initial musculoskeletal diagnosis without waiting for a GP referral.
                  </p>
                </div>
                <div className="py-space-sm flex flex-col gap-space-xs">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold flex items-center justify-between cursor-pointer group">
                    <span>Is Dry Needling painful? What does it feel like?</span>
                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">expand_more</span>
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed hidden">
                    The needle is ultra-thin (like a hair). You may feel a brief muscle twitch or a dull ache when it hits a trigger point. Most patients experience immediate tension release right after.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-xl rounded-3xl shadow-xl flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed/20 rounded-bl-full pointer-events-none"></div>
            
            <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Message the Reception Desk</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1 mb-space-lg">
              For general inquiries, internship placement questions, or records requests.
            </p>

            {!showSuccess ? (
              <form className="flex flex-col gap-space-md" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-bold" htmlFor="topic">Inquiry Topic</label>
                  <select className="w-full h-12 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-md text-on-surface" id="topic" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
                    <option>Appointment Inquiry</option>
                    <option>Diagnostic Report Submission</option>
                    <option>Clinical Internship Program</option>
                    <option>Corporate Ergonomics Seminar</option>
                    <option>Media &amp; Speaking Engagement</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-bold" htmlFor="name">Full Name *</label>
                    <input className="w-full h-12 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline" id="name" placeholder="John Doe" required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-md text-label-md text-on-surface font-bold" htmlFor="email">Email Address *</label>
                    <input className="w-full h-12 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline" id="email" placeholder="name@domain.com" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-bold" htmlFor="phone">Phone Number (Optional)</label>
                  <input className="w-full h-12 px-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline" id="phone" placeholder="+92 3XX XXXXXXX" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-md text-label-md text-on-surface font-bold" htmlFor="message">Message Content *</label>
                  <textarea className="w-full p-space-sm rounded-lg bg-surface border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-primary text-body-md text-on-surface placeholder:text-outline resize-y" id="message" placeholder="How can we assist your recovery journey today?" required rows={5} value={message} onChange={(e) => setMessage(e.target.value)}></textarea>
                </div>

                {formError && (
                  <div className="bg-error/10 text-error p-3 rounded-lg flex items-center gap-2 text-xs font-semibold">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    <span>{formError}</span>
                  </div>
                )}

                <button disabled={isSubmitting} className={clsx("w-full h-12 mt-space-xs rounded-full font-label-lg text-label-lg shadow-md transition-transform flex items-center justify-center gap-space-xs", isSubmitting ? "bg-surface-container text-on-surface-variant cursor-not-allowed" : "bg-primary hover:bg-primary-container text-on-primary active:scale-[0.99]")} type="submit">
                  <span>{isSubmitting ? "Transmitting..." : "Transmit Secure Message"}</span>
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </button>
                <p className="font-body-sm text-[12px] text-on-surface-variant text-center mt-1">
                  This form uses secure HIPAA-compliant routing. We typically respond within 4 clinic hours.
                </p>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-space-xl bg-surface-container-low rounded-xl h-full border border-primary-fixed/50">
                <div className="w-16 h-16 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center mb-space-sm">
                  <span className="material-symbols-outlined text-[36px]">check_circle</span>
                </div>
                <h4 className="font-headline-md text-headline-md text-on-surface font-bold">Transmission Successful</h4>
                <p className="font-body-md text-body-md text-on-surface-variant mt-2 mb-space-lg max-w-sm">
                  Your inquiry regarding <strong>{selectedTopic}</strong> has been logged in our secure clinical system and dispatched to our reception team.
                </p>
                <button className="px-space-md h-10 rounded-full border border-outline font-label-md text-label-md text-on-surface hover:bg-surface-container" onClick={() => setShowSuccess(false)} type="button">
                  Send Another Inquiry
                </button>
              </div>
            )}
          </div>
        </div>
      </section>


      <section className="w-full h-96 bg-surface-container-high relative overflow-hidden">
        <iframe
          title="Dr. Ayazullah Clinic Location - Pakland Plaza G-8 Markaz Islamabad"
          src="https://maps.google.com/maps?q=Pakland+Plaza+G-8+Markaz+Islamabad&t=&z=15&ie=UTF8&iwloc=&output=embed"
          className="w-full h-full border-0"
          loading="lazy"
          allowFullScreen
        ></iframe>
        <div className="absolute bottom-6 right-6 bg-surface-container-lowest p-space-sm rounded-lg shadow-lg max-w-[280px]">
          <span className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-primary text-[16px]">local_parking</span> Parking
          </span>
          <span className="font-body-sm text-[12px] text-on-surface-variant mt-1 block">
            Plaza and street parking available around Pakland Plaza, G-8 Markaz. Elevator &amp; stairs lead directly to 1st Floor, Office #12.
          </span>
        </div>
      </section>
    </div>
  );
}
