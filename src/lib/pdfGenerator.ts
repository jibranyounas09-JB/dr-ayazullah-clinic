import { jsPDF } from "jspdf";

export interface AppointmentSlipData {
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  patientAge?: string;
  date: string;
  time: string;
  category: string;
  mode?: string;
  fee?: number;
  paymentMethod?: string;
  transactionId?: string;
  ticketId?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
}

export function generateAppointmentPDF(data: AppointmentSlipData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner Background
  doc.setFillColor(15, 76, 58); // Deep Medical Emerald
  doc.rect(0, 0, pageWidth, 42, "F");

  // Header Accent Stripe
  doc.setFillColor(212, 175, 55); // Gold accent line
  doc.rect(0, 42, pageWidth, 2.5, "F");

  // Clinic Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(
    data.clinicName || "DR. AYAZULLAH PHYSIOTHERAPY & SPORTS REHABILITATION CLINIC",
    margin,
    16
  );

  // Clinic Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 240, 230);
  doc.text(
    "Advanced Rehabilitation, Spine & Neuro Physical Therapy Center",
    margin,
    23
  );

  // Clinic Details in Header
  doc.setFontSize(7.5);
  doc.setTextColor(200, 225, 215);
  const addressLine = data.clinicAddress || "Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad";
  const phoneLine = `Contact: ${data.clinicPhone || "+92 332 9895770"} | Email: drayazullahofficial1@gmail.com`;
  doc.text(addressLine, margin, 31);
  doc.text(phoneLine, margin, 36);

  // Ticket Reference Badge (Top Right)
  const ticketCode = data.ticketId || `AX-${(data.transactionId || "829104").substring(0, 6).toUpperCase()}`;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - margin - 46, 12, 46, 20, 3, 3, "F");
  
  doc.setTextColor(15, 76, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("APPOINTMENT TICKET", pageWidth - margin - 23, 18, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(ticketCode, pageWidth - margin - 23, 27, { align: "center" });

  // Main Heading on White Page
  let y = 56;
  doc.setTextColor(25, 35, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Official Clinical Appointment Slip", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 115, 125);
  doc.text(
    `Generated on: ${new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })} at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    margin,
    y + 6
  );

  y += 16;

  // SECTION 1: APPOINTMENT SCHEDULE CARD
  doc.setFillColor(245, 249, 247);
  doc.setDrawColor(200, 225, 215);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, "FD");

  // Date Box
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 76, 58);
  doc.text("SCHEDULED DATE", margin + 6, y + 8);
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(data.date || "N/A", margin + 6, y + 17);

  // Time Box
  doc.setFontSize(8);
  doc.setTextColor(15, 76, 58);
  doc.text("RESERVED TIME SLOT", margin + 65, y + 8);
  doc.setFontSize(13);
  doc.setTextColor(15, 76, 58);
  doc.text(data.time || "N/A", margin + 65, y + 17);

  // Mode Box
  doc.setFontSize(8);
  doc.setTextColor(15, 76, 58);
  doc.text("CONSULTATION MODE", margin + 125, y + 8);
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(data.mode || "In-Clinic Consultation", margin + 125, y + 17);

  // Program subtitle
  doc.setFontSize(8);
  doc.setTextColor(90, 100, 110);
  doc.text("Clinical Service Program:", margin + 6, y + 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(data.category || "General Physiotherapy Evaluation", margin + 48, y + 27);

  y += 42;

  // SECTION 2: PATIENT INFORMATION
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 35, 45);
  doc.text("Patient Information", margin, y);
  y += 4;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(225, 232, 230);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "FD");

  const col1 = margin + 6;
  const col2 = margin + 90;

  // Row 1
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Full Name:", col1, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(data.patientName || "Valued Patient", col1 + 25, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Contact Phone:", col2, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(data.patientPhone || "N/A", col2 + 28, y + 9);

  // Row 2
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Email Address:", col1, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  doc.text(data.patientEmail || "Not provided", col1 + 25, y + 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Patient Age:", col2, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40, 40, 40);
  doc.text(data.patientAge ? `${data.patientAge} Years` : "Adult", col2 + 28, y + 21);

  // Row 3
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Attending Doctor:", col1, y + 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 76, 58);
  doc.text("Dr. Ayazullah, PT, DPT (Consultant Physiotherapist)", col1 + 28, y + 32);

  y += 46;

  // SECTION 3: BILLING & PAYMENT STATUS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 35, 45);
  doc.text("Payment & Transaction Record", margin, y);
  y += 4;

  doc.setFillColor(250, 252, 251);
  doc.setDrawColor(220, 230, 225);
  doc.roundedRect(margin, y, contentWidth, 32, 2, 2, "FD");

  // Fee
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Consultation Fee:", col1, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 76, 58);
  doc.text(`PKR ${(data.fee || 5000).toLocaleString()}`, col1 + 32, y + 9);

  // Method
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Payment Channel:", col2, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  doc.text(data.paymentMethod || "Digital Transfer", col2 + 32, y + 9);

  // Transaction ID
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Transaction Ref:", col1, y + 22);
  doc.setFont("courier", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(50, 50, 50);
  doc.text(data.transactionId || "AX-ONLINE-PENDING", col1 + 32, y + 22);

  // Verification Status
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Verification Status:", col2, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 120, 60);
  doc.text("✓ Submitted for Clinic Review", col2 + 32, y + 22);

  y += 40;

  // SECTION 4: INSTRUCTIONS FOR PATIENTS
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(220, 225, 230);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 45, 55);
  doc.text("IMPORTANT CLINICAL INSTRUCTIONS:", margin + 6, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 90);
  
  const instructions = [
    "1. Arrival Time: Please arrive at the clinic 10-15 minutes prior to your allocated time slot.",
    "2. Medical Records: Bring previous MRI/X-ray scans, operative summaries, or blood tests if available.",
    "3. Appropriate Attire: Wear loose, flexible athletic clothing suitable for joint and spine examination.",
    "4. Rescheduling Policy: To modify or cancel your booking, please give at least 4 hours advance notice."
  ];

  let lineY = y + 14;
  instructions.forEach(ins => {
    doc.text(ins, margin + 6, lineY);
    lineY += 5.5;
  });

  y += 46;

  // SECTION 5: SIGNATURE & STAMP
  doc.setDrawColor(180, 190, 195);
  doc.line(margin + 120, y + 15, pageWidth - margin, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 76, 58);
  doc.text("Dr. Ayazullah, PT, DPT", margin + 120, y + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 110, 120);
  doc.text("Consultant Physiotherapist & Clinical Director", margin + 120, y + 24);
  doc.text("Dr. Ayazullah Physiotherapy & Sports Rehabilitation Clinic", margin + 120, y + 28);
  doc.text("Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad", margin + 120, y + 32);

  // Security Stamp / Barcode representation
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(130, 140, 150);
  doc.text(`BARCODE ID: *${ticketCode}*`, margin + 6, y + 18);
  doc.text(`SECURE VERIFICATION HASH: ${Math.random().toString(36).substring(2, 12).toUpperCase()}`, margin + 6, y + 24);

  // Footer bar
  doc.setFillColor(15, 76, 58);
  doc.rect(0, 290, pageWidth, 7, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(240, 245, 240);
  doc.text(
    "For emergency queries or directions, call duty desk at +92 332 9895770 or email drayazullahofficial1@gmail.com",
    pageWidth / 2,
    294.5,
    { align: "center" }
  );

  // Clean filename
  const cleanName = (data.patientName || "Patient").replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Dr_Ayazullah_Appointment_Slip_${cleanName}_${ticketCode}.pdf`;

  // Trigger browser download
  doc.save(fileName);
}
