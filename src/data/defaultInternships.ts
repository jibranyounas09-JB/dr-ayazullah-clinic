import { InternshipOpportunity, InternshipAcademySettings } from "../types/internship";

export const DEFAULT_ACADEMY_SETTINGS: InternshipAcademySettings = {
  announcementBadge: "Admissions Open — 2026 Cohort",
  heroHeadline: "Clinical Internship & Fellowship Academy",
  heroSubheadline: "Elevate your DPT degree into elite clinical practice. A rigorous, hands-on mentorship program designed by Dr. Ayazullah to bridge the gap between academic theory and real-world complex patient rehabilitation.",
  fellowsCountText: "Join over 400+ clinical fellows now leading top tier hospitals"
};

export const DEFAULT_INTERNSHIPS: InternshipOpportunity[] = [
  {
    id: "track-spine-fellowship",
    title: "Clinical Spine & Manual Therapy Fellowship",
    track: "Advanced Fellowship",
    duration: "6 Months",
    eligibility: "DPT Graduates / Licensed Physical Therapists",
    seats: "4 Fellows / Cohort",
    intake: "Fall 2026 Intake",
    status: "Open",
    description: "An intensive, high-level clinical fellowship under direct 1-on-1 mentorship with Dr. Ayazullah. Master differential diagnosis of spine pathology, Grade I-V Maitland and Mulligan joint mobilizations, MRI radiological correlation, and progressive neurodynamic rehabilitation.",
    included: [
      "Direct 1-on-1 patient consultation and evaluation shadowing with Dr. Ayazullah",
      "Hands-on supervised Grade I-V Maitland & Mulligan spinal mobilizations",
      "MRI and CT radiological correlation rounds for disc herniation and stenosis",
      "Patient communication psychology and clinical ethical triaging",
      "Verified Clinical Practicum Certificate & Official Letter of Recommendation"
    ],
    stipendOrFee: "Merit-Based / Fully Sponsored Mentorship",
    isFeatured: true,
    order: 1,
    createdAt: "2026-09-01T00:00:00.000Z"
  },
  {
    id: "track-sports-internship",
    title: "Orthopedic & Sports Physical Therapy Internship",
    track: "Clinical Internship",
    duration: "3 Months",
    eligibility: "Final Year DPT Students & Fresh Graduates",
    seats: "6 Interns",
    intake: "Rolling Intakes",
    status: "Open",
    description: "Designed for aspiring sports physical therapists. Learn modern athletic load management, post-operative ACL/meniscal recovery timelines, isokinetic testing concepts, and functional return-to-sport criteria.",
    included: [
      "Post-operative cruciate ligament & meniscus surgical protocol execution",
      "Plantar pressure mapping and dynamic running gait cadence assessment",
      "Athletic return-to-sport functional testing and injury prevention screenings",
      "Cryotherapy, pneumatic compression, and active recovery modalities training",
      "Comprehensive clinical logbook countersigned by Dr. Ayazullah"
    ],
    stipendOrFee: "Clinical Practicum Program",
    isFeatured: true,
    order: 2,
    createdAt: "2026-09-02T00:00:00.000Z"
  },
  {
    id: "track-dry-needling-residency",
    title: "Dry Needling & Myofascial Pain Residency",
    track: "Clinical Residency",
    duration: "6 Weeks",
    eligibility: "Licensed Physical Therapists & Post-Graduates",
    seats: "5 Clinicians",
    intake: "Bi-Monthly Batches",
    status: "Open",
    description: "High-precision practical training in trigger point localization, clean needle technique (CNT), anatomical safe zones, and electro-acupuncture/intramuscular stimulation for persistent chronic myofascial pain.",
    included: [
      "Rigorous anatomical safe-zone palpation and pneumothorax prevention safety",
      "Deep trigger point localization across cervical, lumbar, and rotator cuff groups",
      "Low-frequency electrical intramuscular stimulation integration",
      "Real clinical patient cases under direct consultant supervision",
      "Certificate of Dry Needling & Myofascial Competency"
    ],
    stipendOrFee: "Specialty Practicum Certificate",
    isFeatured: false,
    order: 3,
    createdAt: "2026-09-03T00:00:00.000Z"
  },
  {
    id: "track-observership-shadowing",
    title: "Weekend Clinical Observership & Shadowing",
    track: "Clinical Observership",
    duration: "4 Weekends (Saturdays)",
    eligibility: "1st to 4th Year DPT Undergraduates",
    seats: "8 Students",
    intake: "Monthly Batches",
    status: "Open",
    description: "An entry-level immersion into active clinical practice. Experience how Dr. Ayazullah triages high-volume musculoskeletal cases, manages patient expectations, and formulates differential diagnostic hypotheses.",
    included: [
      "Live observation of specialized orthopedic patient evaluations",
      "Case debriefing and interactive Q&A session with Dr. Ayazullah after clinic hours",
      "Familiarization with modern Class IV laser and shockwave therapy indications",
      "Clinical Observership Attendance Certificate"
    ],
    stipendOrFee: "Free Mentorship for Students",
    isFeatured: false,
    order: 4,
    createdAt: "2026-09-04T00:00:00.000Z"
  }
];
