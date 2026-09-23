export interface InternshipOpportunity {
  id?: string;
  title: string;
  track: string;
  duration: string;
  eligibility: string;
  seats: string;
  intake: string;
  status: 'Open' | 'Waitlist' | 'Closing Soon' | 'Closed';
  description: string;
  included: string[];
  stipendOrFee?: string;
  isFeatured?: boolean;
  order?: number;
  createdAt?: string;
}

export interface InternshipApplication {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  university: string;
  graduationYear: string;
  cgpa: string;
  internshipId?: string;
  internshipTitle: string;
  motivation: string;
  subSpecialty?: string;
  resumeFileName?: string;
  resumeFileSize?: string;
  resumeFileType?: string;
  resumeUrl?: string;
  resumeDataUrl?: string;
  status: 'Pending' | 'Under Review' | 'Shortlisted' | 'Interview Scheduled' | 'Accepted' | 'Not Selected';
  submittedAt: string;
  adminNotes?: string;
}

export interface InternshipAcademySettings {
  announcementBadge?: string;
  heroHeadline?: string;
  heroSubheadline?: string;
  fellowsCountText?: string;
}
