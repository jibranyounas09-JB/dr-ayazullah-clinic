import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import "dotenv/config";
// vite is imported dynamically in startLocalServer() — it's a devDependency
// and must NOT be imported at the top level or Vercel serverless will crash.
import nodemailer from "nodemailer";
import { Resend } from "resend";
import Groq, { toFile } from "groq-sdk";
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { CLINIC_SYSTEM_PROMPT } from "./src/lib/chatbotKnowledge.js";
import { 
  initNeonDatabase, 
  getDocuments, 
  getDocument, 
  setDocument, 
  addDocument, 
  deleteDocument,
  verifyAdmin,
  updateAdminPassword,
  neonPool
} from "./src/server/neonDb.js";

// Resend client initialization for transactional emails
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY || RESEND_API_KEY;
  if (key) {
    try {
      resendClient = new Resend(key);
    } catch (e) {
      console.warn("Failed to initialize Resend client:", e);
    }
  }
  return resendClient;
}

let transporter: any = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Instant, non-blocking in-memory JSON transport for preview/dev mode
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }
  return transporter;
}

export const app = express();

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "cv");
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Notice: CV upload directory creation skipped:", e);
}

const SLIP_DIR = path.join(process.cwd(), "public", "uploads", "slips");
try {
  if (!fs.existsSync(SLIP_DIR)) {
    fs.mkdirSync(SLIP_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Notice: Slip upload directory creation skipped:", e);
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));
app.use(express.static(path.join(process.cwd(), 'public')));

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      const dbCheck = await neonPool.query("SELECT NOW() as now");
      res.json({ 
        status: "ok", 
        database: "Neon PostgreSQL Connected",
        neonTime: dbCheck.rows[0].now,
        timestamp: new Date().toISOString() 
      });
    } catch (e: any) {
      res.json({ 
        status: "ok", 
        databaseWarning: e.message,
        timestamp: new Date().toISOString() 
      });
    }
  });

  // --- NEON POSTGRESQL REST API ENDPOINTS ---

  // Auth routes MUST be registered BEFORE generic :collection routes
  // so Express doesn't match "auth" as a collection name.

  // Admin Authentication against Neon
  app.post("/api/neon/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await verifyAdmin(email, password);
      if (!result.success) {
        return res.status(401).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("Neon Auth login error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin Password Reset against Neon
  app.post("/api/neon/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      const result = await updateAdminPassword(email, newPassword);
      res.json(result);
    } catch (err: any) {
      console.error("Neon Auth reset password error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 1. Get collection documents
  app.get("/api/neon/:collection", async (req, res) => {
    try {
      const { collection } = req.params;
      const { orderBy, direction, whereField, whereValue } = req.query;
      const docs = await getDocuments(collection, {
        orderByField: orderBy as string,
        orderDirection: (direction as "asc" | "desc") || "desc",
        whereField: whereField as string,
        whereValue: whereValue
      });
      res.json(docs);
    } catch (err: any) {
      console.error("Neon GET collection error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get single document
  app.get("/api/neon/:collection/:id", async (req, res) => {
    try {
      const { collection, id } = req.params;
      const doc = await getDocument(collection, id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (err: any) {
      console.error("Neon GET document error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Create document (addDoc)
  app.post("/api/neon/:collection", async (req, res) => {
    try {
      const { collection } = req.params;
      const data = req.body;
      const result = await addDocument(collection, data);
      res.status(201).json(result);
    } catch (err: any) {
      console.error("Neon POST document error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Update / Upsert document (setDoc / updateDoc)
  app.put("/api/neon/:collection/:id", async (req, res) => {
    try {
      const { collection, id } = req.params;
      const data = req.body;
      const merge = req.query.merge !== "false";
      const result = await setDocument(collection, id, data, merge);
      res.json(result);
    } catch (err: any) {
      console.error("Neon PUT document error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Delete document (deleteDoc)
  app.delete("/api/neon/:collection/:id", async (req, res) => {
    try {
      const { collection, id } = req.params;
      const result = await deleteDocument(collection, id);
      res.json(result);
    } catch (err: any) {
      console.error("Neon DELETE document error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Email API Route
  app.post("/api/send-email", async (req, res) => {
    try {
      const { to, subject, type, data } = req.body;
      
      let htmlContent = "";
      
      if (type === "BOOKING_REQUEST") {
        htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0d6947; margin-bottom: 8px;">Booking Request Received</h2>
            <p style="font-size: 16px; color: #475569; margin-bottom: 24px;">Hi ${data.patientName},</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6;">
              Your therapy booking has been made successfully and the request is currently being reviewed by our admin team.
            </p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-top: 24px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${data.date}</p>
              <p style="margin: 0 0 8px 0;"><strong>Time:</strong> ${data.time}</p>
              <p style="margin: 0 0 8px 0;"><strong>Therapy:</strong> ${data.category}</p>
              <p style="margin: 0;"><strong>REF:</strong> ${data.transactionId}</p>
            </div>
            <p style="font-size: 16px; color: #475569; line-height: 1.6;">
              Within the next three to five hours, you will receive a confirmation email once your payment is verified and the slot is securely locked.
            </p>
            <p style="font-size: 14px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              <strong>Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</strong><br/>
              <span style="font-size: 12px; color: #94a3b8;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</span>
            </p>
          </div>
        `;
      } else if (type === "BOOKING_CONFIRMATION") {
        htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; border-top: 6px solid #0d6947;">
            <h2 style="color: #0d6947; margin-bottom: 8px;">Appointment Confirmed!</h2>
            <p style="font-size: 16px; color: #475569; margin-bottom: 24px;">Hi ${data.patientName},</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6;">
              Great news! Your payment has been successfully verified by our admin team. 
              <strong>Your slot is now officially booked and confirmed.</strong>
            </p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-top: 24px; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${data.date}</p>
              <p style="margin: 0 0 8px 0;"><strong>Time:</strong> ${data.time}</p>
              <p style="margin: 0 0 8px 0;"><strong>Therapy:</strong> ${data.category}</p>
              <p style="margin: 0;"><strong>Status:</strong> Confirmed & Verified</p>
            </div>
            <p style="font-size: 16px; color: #475569; line-height: 1.6;">
              Please arrive 5-10 minutes early for your session at our clinic: <strong>Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</strong>. We look forward to seeing you.
            </p>
            <p style="font-size: 14px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              <strong>Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</strong><br/>
              <span style="font-size: 12px; color: #94a3b8;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</span>
            </p>
          </div>
        `;
      } else if (type === "REFUND_PROCESSED") {
        const rawFee = data.fee || 5000;
        const originalFee = typeof rawFee === 'number'
          ? rawFee
          : (parseInt(String(rawFee).replace(/[^0-9]/g, ''), 10) || 5000);
        const processingFee = Math.round(originalFee * 0.1);
        const refundAmount = originalFee - processingFee;
        const patientName = data.patientName || "Valued Patient";

        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; border-top: 6px solid #0d6947; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #0d6947; font-size: 24px; margin: 0 0 6px 0; font-weight: bold;">Dr. Ayazullah Clinic</h1>
              <p style="color: #64748b; font-size: 14px; margin: 0;">Specialized Orthopedic & Physiotherapy Care</p>
            </div>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: #166534; font-size: 18px; margin: 0 0 6px 0; font-weight: bold;">Payment Refunded</h2>
              <p style="color: #15803d; font-size: 14px; margin: 0; font-weight: 500;">
                Your appointment payment has been successfully refunded.
              </p>
            </div>

            <p style="font-size: 16px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
              Dear <strong>${patientName}</strong>,
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
              Your payment for the cancelled appointment has been processed and refunded by our administration team. 
              <strong>Thank you so much for booking us!</strong> We truly appreciate you choosing Dr. Ayazullah Clinic.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 12px 0; font-weight: 700;">
                Refund Details
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Patient:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${patientName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Appointment Date:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.date || 'Scheduled Date'} at ${data.time || ''}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Therapy Program:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.category || 'Physiotherapy'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Original Paid:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">Rs. ${originalFee.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #ef4444;">Processing Fee (10%):</td>
                  <td style="padding: 6px 0; font-weight: 600; color: #ef4444; text-align: right;">- Rs. ${processingFee.toLocaleString()}</td>
                </tr>
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0 4px 0; font-weight: bold; color: #0d6947; font-size: 15px;">Net Refunded:</td>
                  <td style="padding: 10px 0 4px 0; font-weight: bold; color: #0d6947; font-size: 16px; text-align: right;">Rs. ${refundAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Payment Method:</td>
                  <td style="padding: 4px 0; font-weight: 600; text-align: right;">${data.paymentMethod || 'JazzCash / EasyPaisa'}</td>
                </tr>
                ${data.transactionId ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748b;">Transaction Reference:</td>
                  <td style="padding: 4px 0; font-weight: 600; text-align: right;">${data.transactionId}</td>
                </tr>` : ''}
              </table>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
              The refunded amount has been released back to your payment account. If you ever need physiotherapy or orthopedic rehabilitation in the future, we look forward to assisting you.
            </p>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; font-size: 13px; color: #94a3b8; text-align: center;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</p>
              <p style="margin: 0;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad • Contact: +92 332 9895770</p>
            </div>
          </div>
        `;
      } else if (type === "REFUND_REQUEST") {
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; border-top: 6px solid #eab308;">
            <h2 style="color: #854d0e; margin-bottom: 8px;">Cancellation & Refund Requested</h2>
            <p style="font-size: 16px; color: #475569; margin-bottom: 24px;">Hi ${data.patientName || 'Patient'},</p>
            <p style="font-size: 16px; color: #475569; line-height: 1.6;">
              We have received your cancellation and refund request for your appointment on <strong>${data.date} at ${data.time}</strong>.
            </p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6;">
              Our administrative team is reviewing the request and will process your refund shortly. You will receive an email confirmation once the refund has been completed.
            </p>
            <p style="font-size: 14px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              <strong>Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</strong><br/>
              <span style="font-size: 12px; color: #94a3b8;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad</span>
            </p>
          </div>
        `;
      } else if (type === "INTERNSHIP_STATUS_UPDATE") {
        const candidateName = data.candidateName || data.fullName || "Fellow Candidate";
        const programTitle = data.internshipTitle || "Clinical Internship / Fellowship Program";
        const status = data.status || "Under Review";
        const notes = data.adminNotes || data.notes || "";
        const university = data.university || "";

        let statusBadgeColor = "#0d6947";
        let statusBadgeBg = "#f0fdf4";
        let statusBadgeBorder = "#bbf7d0";
        let statusTitle = "Application Status Update";
        let statusIntro = "";

        if (status === "Accepted") {
          statusBadgeColor = "#166534";
          statusBadgeBg = "#f0fdf4";
          statusBadgeBorder = "#bbf7d0";
          statusTitle = "🎉 Candidacy Accepted!";
          statusIntro = `Congratulations! We are delighted to inform you that following clinical review by Dr. Ayazullah and our senior faculty, your candidacy for <strong>${programTitle}</strong> has been officially <strong>ACCEPTED</strong>.`;
        } else if (status === "Shortlisted") {
          statusBadgeColor = "#0369a1";
          statusBadgeBg = "#f0f9ff";
          statusBadgeBorder = "#bae6fd";
          statusTitle = "📋 Candidacy Shortlisted";
          statusIntro = `We are pleased to inform you that your candidacy dossier for <strong>${programTitle}</strong> has passed our preliminary evaluation and has been officially <strong>SHORTLISTED</strong> for the next selection phase.`;
        } else if (status === "Interview Scheduled") {
          statusBadgeColor = "#4338ca";
          statusBadgeBg = "#eef2ff";
          statusBadgeBorder = "#c7d2fe";
          statusTitle = "🗓️ Clinical Interview Scheduled";
          statusIntro = `Great news! You have been selected for a technical discussion and clinical interview for the <strong>${programTitle}</strong>.`;
        } else if (status === "Under Review") {
          statusBadgeColor = "#854d0e";
          statusBadgeBg = "#fefce8";
          statusBadgeBorder = "#fef08a";
          statusTitle = "🔍 Application Under Review";
          statusIntro = `Your application dossier and Curriculum Vitae for <strong>${programTitle}</strong> is currently undergoing comprehensive clinical review by Dr. Ayazullah.`;
        } else if (status === "Not Selected") {
          statusBadgeColor = "#475569";
          statusBadgeBg = "#f8fafc";
          statusBadgeBorder = "#e2e8f0";
          statusTitle = "Application Status: Not Selected";
          statusIntro = `Thank you for taking the time to submit your candidacy for <strong>${programTitle}</strong>. We received many high-caliber applications and cohort seats are strictly limited. At this time, we are unable to extend an offer for this cohort. We encourage you to reapply in our future intake cycles.`;
        } else {
          statusIntro = `Your application status for <strong>${programTitle}</strong> has been updated to: <strong>${status}</strong>.`;
        }

        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; border-top: 6px solid #0d6947; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #0d6947; font-size: 24px; margin: 0 0 6px 0; font-weight: bold;">Dr. Ayazullah Clinic &amp; Academy</h1>
              <p style="color: #64748b; font-size: 14px; margin: 0;">Clinical Fellowship &amp; Internship Directorate</p>
            </div>

            <div style="background-color: ${statusBadgeBg}; border: 1px solid ${statusBadgeBorder}; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: ${statusBadgeColor}; font-size: 19px; margin: 0 0 6px 0; font-weight: bold;">${statusTitle}</h2>
              <p style="color: ${statusBadgeColor}; font-size: 14px; margin: 0; font-weight: 600;">Status: ${status}</p>
            </div>

            <p style="font-size: 16px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
              Dear <strong>${candidateName}</strong>,
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
              ${statusIntro}
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 12px 0; font-weight: 700;">
                Application Dossier Overview
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Candidate Name:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${candidateName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Program Applied:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${programTitle}</td>
                </tr>
                ${university ? `
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Institute:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${university}</td>
                </tr>` : ''}
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0 4px 0; font-weight: bold; color: ${statusBadgeColor}; font-size: 15px;">Current Decision:</td>
                  <td style="padding: 10px 0 4px 0; font-weight: bold; color: ${statusBadgeColor}; font-size: 15px; text-align: right;">${status}</td>
                </tr>
              </table>
            </div>

            ${notes ? `
            <div style="background-color: #f1f5f9; border-left: 4px solid #0d6947; border-radius: 0 8px 8px 0; padding: 16px; margin: 20px 0;">
              <h4 style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; color: #0d6947; font-weight: 700;">
                Administrative Notes &amp; Next Steps
              </h4>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${notes}</p>
            </div>` : ''}

            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
              If you have any questions or need to confirm your availability, please feel free to reply directly to this email or reach out to our clinical academy office.
            </p>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 26px; font-size: 13px; color: #94a3b8; text-align: center;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic &amp; Internship Academy</p>
              <p style="margin: 0 0 4px 0;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad • drayazullah.me</p>
              <p style="margin: 0;">Inquiries: +92 332 9895770</p>
            </div>
          </div>
        `;
      } else if (type === "ADMIN_PASSWORD_RESET_OTP") {
        const otpCode = data.otpCode || "123456";
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; border-top: 6px solid #0d6947; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #0d6947; font-size: 24px; margin: 0 0 6px 0; font-weight: bold;">Dr. Ayazullah Clinic</h1>
              <p style="color: #64748b; font-size: 14px; margin: 0;">Administrative Portal Security</p>
            </div>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: #166534; font-size: 18px; margin: 0 0 6px 0; font-weight: bold;">Admin Password Reset OTP</h2>
              <p style="color: #15803d; font-size: 14px; margin: 0; font-weight: 500;">
                Use the 6-digit one-time security code below to reset your password.
              </p>
            </div>

            <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
              Hello <strong>Dr. Ayazullah Administrator</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
              A password reset request was initiated for your clinic administrator account (${data.email || 'drayazullahofficial1@gmail.com'}). Your 6-digit security OTP verification code is:
            </p>

            <div style="text-align: center; margin: 24px 0;">
              <div style="display: inline-block; padding: 14px 28px; background-color: #0d6947; color: #ffffff; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${otpCode}
              </div>
            </div>

            <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin-bottom: 24px; text-align: center;">
              If you did not request a password reset, please ignore this email. This OTP code is valid for 15 minutes.
            </p>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 26px; font-size: 13px; color: #94a3b8; text-align: center;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</p>
              <p style="margin: 0;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad • Contact: +92 332 9895770</p>
            </div>
          </div>
        `;
      } else if (type === "CONTACT_INQUIRY") {
        htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; border-top: 6px solid #0d6947; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #0d6947; font-size: 24px; margin: 0 0 6px 0; font-weight: bold;">Dr. Ayazullah Clinic</h1>
              <p style="color: #64748b; font-size: 14px; margin: 0;">Reception Desk Triage Notification</p>
            </div>

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
              <h2 style="color: #166534; font-size: 18px; margin: 0 0 6px 0; font-weight: bold;">New Reception Inquiry Received</h2>
              <p style="color: #15803d; font-size: 14px; margin: 0; font-weight: 500;">
                Topic: ${data.topic || "General Inquiry"}
              </p>
            </div>

            <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
              Hello <strong>Reception Desk</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
              A new message has been submitted through the clinic website reception portal:
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Sender Name:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right;">${data.fullName || "Visitor"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Email:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.email || "N/A"}</td>
                </tr>
                ${data.phone ? `
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Phone Number:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.phone}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Topic:</td>
                  <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #0d6947;">${data.topic || "General Inquiry"}</td>
                </tr>
              </table>
              <div style="border-top: 1px solid #e2e8f0; margin-top: 14px; padding-top: 14px;">
                <p style="font-size: 13px; font-weight: 700; color: #64748b; margin: 0 0 6px 0; uppercase tracking-wider;">Message Content:</p>
                <p style="font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap; margin: 0; background-color: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">${data.message || ""}</p>
              </div>
            </div>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 26px; font-size: 13px; color: #94a3b8; text-align: center;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic</p>
              <p style="margin: 0;">Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad • Contact: +92 332 9895770</p>
            </div>
          </div>
        `;
      } else {
        htmlContent = `<p>${JSON.stringify(data)}</p>`;
      }

      // 1. Try sending via Resend (https://resend.com)
      const resend = getResendClient();
      if (resend) {
        try {
          // Determine recipient address. When using onboarding@resend.dev, Resend restricts external recipients.
          let recipient = to || "drayazullahofficial1@gmail.com";
          
          const resendResult = await resend.emails.send({
            from: "Dr. Ayazullah Clinic <onboarding@resend.dev>",
            to: recipient,
            subject: subject,
            html: htmlContent,
          });

          if (resendResult.data?.id) {
            console.log("Email dispatched successfully via Resend to %s:", recipient, resendResult.data.id);
            return res.status(200).json({ success: true, service: "resend", id: resendResult.data.id });
          } else if (resendResult.error) {
            console.warn("Resend email response warning:", resendResult.error);
            // If Resend failed because recipient is unverified, fallback to owner email
            if (resendResult.error.message?.includes("testing emails to your own email address") && recipient !== "drayazullahofficial1@gmail.com") {
              console.log("Retrying Resend dispatch to owner email (drayazullahofficial1@gmail.com)...");
              const ownerResult = await resend.emails.send({
                from: "Dr. Ayazullah Clinic <onboarding@resend.dev>",
                to: "drayazullahofficial1@gmail.com",
                subject: `[Notification Copy] ${subject}`,
                html: htmlContent,
              });
              if (ownerResult.data?.id) {
                console.log("Email dispatched successfully to owner via Resend:", ownerResult.data.id);
                return res.status(200).json({ success: true, service: "resend-owner-copy", id: ownerResult.data.id });
              }
            }
          }
        } catch (resendErr: any) {
          console.warn("Resend email attempt failed, trying fallback:", resendErr?.message || resendErr);
        }
      }

      // 2. Fallback to Nodemailer transporter
      const activeTransporter = getTransporter();
      const info = await activeTransporter.sendMail({
        from: '"Dr. Ayazullah Clinic" <noreply@drayazullah.com>',
        to: to || "drayazullahofficial1@gmail.com",
        subject: subject,
        html: htmlContent,
      });

      console.log("Email processed via fallback: %s", info.messageId || "id-queued");
      res.status(200).json({ success: true, service: "fallback", messageId: info.messageId || "id-queued" });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ success: false, error: "Failed to send email" });
    }
  });

  // --- INTERNSHIP CV UPLOAD & DOSSIER APIS ---

  // Upload candidate CV (Supports PDF, DOC, DOCX up to 50MB)
  app.post("/api/upload-cv", async (req, res) => {
    try {
      const { fileName, fileType, fileData, candidateName } = req.body;
      if (!fileData) {
        return res.status(400).json({ error: "No CV file data received" });
      }

      let base64Content = fileData;
      let mimeType = fileType || "application/pdf";

      if (typeof fileData === "string" && fileData.includes(";base64,")) {
        const parts = fileData.split(";base64,");
        base64Content = parts[1];
        const match = parts[0].match(/data:(.*?);/);
        if (match) mimeType = match[1];
      }

      const buffer = Buffer.from(base64Content, "base64");
      const safeCandidate = (candidateName || "candidate")
        .trim()
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase()
        .slice(0, 25);
      
      const rawExt = path.extname(fileName || "");
      const ext = rawExt ? rawExt.toLowerCase() : (mimeType.includes("pdf") ? ".pdf" : ".docx");
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const diskFileName = `${safeCandidate}_${timestamp}_${randomSuffix}${ext}`;
      const filePath = path.join(UPLOAD_DIR, diskFileName);

      await fs.promises.writeFile(filePath, buffer);

      const fileUrl = `/uploads/cv/${diskFileName}`;
      const fileSizeStr = buffer.length > 1024 * 1024
        ? `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(buffer.length / 1024)} KB`;

      console.log(`[CV Upload] Stored: ${diskFileName} (${fileSizeStr})`);

      res.status(200).json({
        success: true,
        fileUrl,
        downloadUrl: `/api/cv/${diskFileName}`,
        fileName: fileName || diskFileName,
        fileSize: fileSizeStr,
        fileType: mimeType
      });
    } catch (err: any) {
      console.error("[CV Upload] Error:", err);
      res.status(500).json({ error: err.message || "Failed to process and store CV file" });
    }
  });

  // Serve CV file with correct inline preview / download headers
  app.get("/api/cv/:fileName", (req, res) => {
    try {
      const { fileName } = req.params;
      const safeName = path.basename(fileName);
      const filePath = path.join(UPLOAD_DIR, safeName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send("Curriculum Vitae file not found on server.");
      }

      const ext = path.extname(safeName).toLowerCase();
      let contentType = "application/octet-stream";
      if (ext === ".pdf") contentType = "application/pdf";
      else if (ext === ".doc") contentType = "application/msword";
      else if (ext === ".docx") contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      res.sendFile(filePath);
    } catch (err: any) {
      console.error("[CV Serve] Error:", err);
      res.status(500).send("Error retrieving CV file");
    }
  });

  // Submit Internship Application (Dual-Persistence Backend Backup)
  app.post("/api/internship/apply", async (req, res) => {
    try {
      const payload = req.body;
      if (!payload.fullName || !payload.email) {
        return res.status(400).json({ error: "Candidate full name and email are required" });
      }

      const docId = `app-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const applicationData = {
        ...payload,
        id: docId,
        status: payload.status || "Pending",
        submittedAt: payload.submittedAt || new Date().toISOString()
      };

      // Persist to Neon DB
      try {
        await addDocument("internshipApplications", applicationData);
      } catch (neonErr) {
        console.warn("[Internship Apply] Neon backup save notice:", neonErr);
      }

      console.log(`[Internship Apply] Successfully received application from: ${payload.fullName} for ${payload.internshipTitle}`);
      res.status(201).json({
        success: true,
        id: docId,
        application: applicationData
      });
    } catch (err: any) {
      console.error("[Internship Apply] Error:", err);
      res.status(500).json({ error: err.message || "Failed to submit application dossier" });
    }
  });

  // Fetch all applications (from Neon DB backup)
  app.get("/api/internship/applications", async (_req, res) => {
    try {
      const docs = await getDocuments("internshipApplications", {
        orderByField: "submittedAt",
        orderDirection: "desc"
      });
      res.json(docs);
    } catch (err: any) {
      console.error("[Internship Applications] Fetch error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update application status / notes
  app.patch("/api/internship/applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updated = await setDocument("internshipApplications", id, updates, true);
      res.json(updated);
    } catch (err: any) {
      console.error("[Internship Applications] Update error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete internship application record
  app.delete("/api/internship/applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getDocument("internshipApplications", id);

      // Clean up uploaded CV if stored locally
      if (existing && existing.resumeUrl && typeof existing.resumeUrl === "string" && existing.resumeUrl.startsWith("/uploads/cv/")) {
        const diskFile = path.join(process.cwd(), "public", existing.resumeUrl);
        if (fs.existsSync(diskFile)) {
          try {
            await fs.promises.unlink(diskFile);
            console.log(`[Internship Delete] Removed CV file from disk: ${diskFile}`);
          } catch (fileErr) {
            console.warn(`[Internship Delete] Notice unlinking CV file:`, fileErr);
          }
        }
      }

      await deleteDocument("internshipApplications", id);
      console.log(`[Internship Delete] Successfully deleted application: ${id}`);
      res.json({ success: true, id });
    } catch (err: any) {
      console.error("[Internship Delete] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- GOOGLE AI STUDIO GEMINI CLIENT & SPEECH ENGINE ---
  const USER_PROVIDED_GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
  let geminiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!geminiClient) {
      geminiClient = new GoogleGenAI({
        apiKey: USER_PROVIDED_GEMINI_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return geminiClient;
  }

  // Convert raw 16-bit linear PCM bytes into standard WAV container with 44-byte RIFF header
  function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
    const header = Buffer.alloc(44);
    const dataLength = pcmBuffer.length;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // 1 = Linear PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  // (Gemini Live WebSocket helper removed — using Groq as primary)

  // Google AI Studio Speech Synthesis using Gemini (gemini-3.1-flash-tts-preview)
  // Supports authentic Urdu, Pashto, and English speaking with natural cadence
  app.post("/api/ai/speak", async (req, res) => {
    try {
      const { text, language, voice } = req.body;
      const rawText = typeof text === "string" ? text : "";

      // Clean text for optimal vocal delivery, stripping markdown images, base64 data, and URLs
      let cleanedText = rawText
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\b[\w-]+\.(?:jpg|jpeg|png|webp|gif|pdf)\b/gi, "")
        .replace(/\b(?:AX|AI-TX|TID)-?\w+\b/gi, "")
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
        .replace(/[*_~`#|>\-•]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Detect language if auto
      const hasUrduScript = /[\u0600-\u06FF]/.test(cleanedText || text);
      const hasPashtoSpecific = /[\u069A\u0696\u0685\u0681\u067C\u0689\u0693\u06BC\u06D0\u06CD]/.test(cleanedText || text);

      let targetLang = language || "auto";
      if (targetLang === "auto") {
        if (hasPashtoSpecific) {
          targetLang = "ps";
        } else if (hasUrduScript) {
          targetLang = "ur";
        } else {
          targetLang = "en";
        }
      }

      // If text is empty (e.g. user or assistant sent photo/receipt), provide pleasant audible vocal feedback
      if (!cleanedText) {
        if (targetLang === "ur") {
          cleanedText = "آپ کی تصویر اور دستاویز موصول ہو گئی ہے۔ ہم اس کا جائزہ لے رہے ہیں۔";
        } else if (targetLang === "ps") {
          cleanedText = "ستاسو عکس او معلومات په بریالیتوب سره ترلاسه شول.";
        } else {
          cleanedText = "Photo and clinical documents received successfully. Reviewing now.";
        }
      }

      // Choose prebuilt voice: 'Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'
      const allowedVoices = ["Kore", "Puck", "Charon", "Fenrir", "Zephyr"];
      const selectedVoice = (voice && allowedVoices.includes(voice)) ? voice : "Kore";

      const ai = getGeminiClient();

      console.log(`[Gemini TTS] Synthesizing speech (${cleanedText.length} chars, Lang: ${targetLang}, Voice: ${selectedVoice})`);

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: cleanedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice }
            }
          }
        }
      });

      const part = ttsResponse.candidates?.[0]?.content?.parts?.[0];
      const inlineData = part?.inlineData;

      if (!inlineData || !inlineData.data) {
        throw new Error("No audio inlineData returned from Gemini TTS model");
      }

      const rawPcmBuffer = Buffer.from(inlineData.data, "base64");
      const wavBuffer = pcmToWav(rawPcmBuffer, 24000, 1, 16);

      res.json({
        success: true,
        audioBase64: wavBuffer.toString("base64"),
        mimeType: "audio/wav",
        language: targetLang,
        voice: selectedVoice,
        model: "gemini-3.1-flash-tts-preview",
        sampleRate: 24000
      });
    } catch (err: any) {
      console.error("[Gemini Speech Synthesis Error]:", err);
      res.status(500).json({ 
        success: false, 
        error: err.message || "Failed to synthesize speech with Gemini" 
      });
    }
  });

  // --- GROQ AI VOICE & CHATBOT API ENDPOINTS ---
  const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

  async function getEffectiveGroqKey(reqKey?: string): Promise<string> {
    if (reqKey && typeof reqKey === "string" && reqKey.trim().length > 10) {
      return reqKey.trim();
    }
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 10) {
      return process.env.GROQ_API_KEY.trim();
    }
    if (process.env.VITE_GROQ_API_KEY && process.env.VITE_GROQ_API_KEY.trim().length > 10) {
      return process.env.VITE_GROQ_API_KEY.trim();
    }
    try {
      const genSettings = await getDocument("settings", "general");
      if (genSettings && genSettings.groqApiKey && typeof genSettings.groqApiKey === "string" && genSettings.groqApiKey.trim().length > 10) {
        return genSettings.groqApiKey.trim();
      }
    } catch (e) {}
    return "";
  }

  async function getEffectiveGeminiKey(reqKey?: string): Promise<string> {
    if (reqKey && typeof reqKey === "string" && reqKey.trim().length > 10 && !reqKey.startsWith("AQ.")) {
      return reqKey.trim();
    }
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10 && !process.env.GEMINI_API_KEY.startsWith("AQ.")) {
      return process.env.GEMINI_API_KEY.trim();
    }
    if (process.env.VITE_GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY.trim().length > 10 && !process.env.VITE_GEMINI_API_KEY.startsWith("AQ.")) {
      return process.env.VITE_GEMINI_API_KEY.trim();
    }
    try {
      const genSettings = await getDocument("settings", "general");
      if (genSettings && genSettings.geminiApiKey && typeof genSettings.geminiApiKey === "string" && genSettings.geminiApiKey.trim().length > 10 && !genSettings.geminiApiKey.startsWith("AQ.")) {
        return genSettings.geminiApiKey.trim();
      }
    } catch (e) {}
    return "";
  }

  // 1. Whisper Speech-To-Text Endpoint via Groq (Supports Urdu, Pashto, English)
  app.post("/api/ai/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType, language, groqApiKey: reqGroqKey } = req.body;
      if (!audioData) {
        return res.status(400).json({ error: "Missing audioData payload" });
      }

      const activeGroqKey = await getEffectiveGroqKey(reqGroqKey || (req.headers["x-groq-api-key"] as string));
      if (!activeGroqKey) {
        return res.status(400).json({ 
          error: "Groq API Key is not configured. Please set GROQ_API_KEY or configure it in Admin Settings." 
        });
      }

      const base64Content = typeof audioData === "string" && audioData.includes(";base64,")
        ? audioData.split(";base64,")[1]
        : audioData;

      const buffer = Buffer.from(base64Content, "base64");
      if (buffer.length < 400) {
        return res.status(400).json({ error: "Audio snippet is too short. Please speak clearly into your microphone." });
      }

      const groq = new Groq({ apiKey: activeGroqKey });
      let safeMime = mimeType || "audio/webm";
      if (safeMime.includes("webm")) safeMime = "audio/webm"; // Strip codecs string
      const ext = safeMime.includes("wav") ? "wav" : safeMime.includes("mp4") ? "m4a" : "webm";
      const file = await toFile(buffer, `patient_voice_${Date.now()}.${ext}`, { type: safeMime });

      // Use whisper-large-v3-turbo on Groq with rich multilingual vocabulary
      const transcription = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
        language: language && ["ur", "ps", "en"].includes(language) ? language : undefined,
        prompt: "Dr. Ayazullah physiotherapy clinic Islamabad, appointment booking, check appointment, spine decompression, back pain, Urdu اردو اسلام آباد فزیوتھراپی کمر درد اپائنٹمنٹ بکنگ فیس بدھ علاج, Pashto پښتو د ملا درد ملاقات درملنه شورو فیس جي ایټ مرکز ډاکټر ایازالله, English",
        temperature: 0.1
      });

      console.log(`[Groq Whisper STT SUCCESS] Transcribed: "${transcription.text}"`);
      res.json({
        success: true,
        text: (transcription.text || "").trim()
      });
    } catch (err: any) {
      console.error("[Groq Whisper Transcription Error]:", err.message || err);
      res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // 2. Chatbot Logic Engine via Llama 3 / Groq & Google Gemini with specialized Multilingual & Clinical Intelligence
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages, userLanguage, consultationFee: clientFee, servicesList, groqApiKey: reqGroqKey, geminiApiKey: reqGeminiKey } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const consultationFee = (clientFee && typeof clientFee === "number" && clientFee > 0) ? clientFee : 5000;
      const formattedFee = `Rs. ${consultationFee.toLocaleString()}`;
      const formattedFeeUrdu = `${consultationFee.toLocaleString()} روپے`;

      // Build dynamic service options text if provided
      let servicesOverviewText = "";
      if (Array.isArray(servicesList) && servicesList.length > 0) {
        servicesOverviewText = servicesList.map((s: any, idx: number) => `${idx + 1}. ${s.title} (${s.badge || 'Available'}) - ${s.desc || ''}`).join("\n");
      } else {
        servicesOverviewText = `1. Initial Diagnostic Consultation & Assessment (${formattedFee})\n(Note to AI: Only present active therapies that are explicitly provided in the live clinic services catalog. Do not list or invent external therapy programs.)`;
      }

      // Intelligent language detection from user message content
      const lastUserMsg = (messages[messages.length - 1]?.content || "").trim();
      const lastUserLower = lastUserMsg.toLowerCase();

      const hasUrduScript = /[\u0600-\u06FF]/.test(lastUserMsg);
      const hasPashtoSpecific = /[\u069A\u0696\u0685\u0681\u067C\u0689\u0693\u06BC\u06D0\u06CD\u0679\u0686]/.test(lastUserMsg);
      const isRomanUrdu = /\b(mera|meri|mere|mujhe|humein|apna|apni|apne|btao|batao|karo|krna|karna|kese|kaise|kahan|kidhar|kidhr|dard|kamar|gardan|ghutna|ghutne|moron|mohre|budh|jumeraat|juma|hafta|peer|mangal|itwar|fees|kitni|shukriya|theek|chahiye|hoga|hogi|ilaj|dawayi|doctor|dr|waqt|time)\b/i.test(lastUserLower);
      const isRomanPashto = /\b(zama|sta|mulaqat|der|dera|kha|manana|dara|ghwaram|kawa|kawal|sangha|tsanga|kamay|shoro|khali|ziarat|gul|nehey|dard|staso|zmong|da|pa|ke|wraz|karta|ilaj|dawa)\b/i.test(lastUserLower);

      let effectiveLang = userLanguage || "auto";

      // Detect English vs Urdu/Pashto dynamically from current user message
      const isEnglishMessage = /^[a-zA-Z0-9\s.,?!'":;\-()–—]+$/.test(lastUserMsg) && !isRomanUrdu && !isRomanPashto;

      if (effectiveLang === "auto" || isEnglishMessage) {
        if (hasPashtoSpecific || isRomanPashto) {
          effectiveLang = "ps";
        } else if (hasUrduScript || isRomanUrdu) {
          effectiveLang = "ur";
        } else if (isEnglishMessage || !hasUrduScript) {
          effectiveLang = "en";
        }
      }

      // Language instruction guidance tailored for AI engines
      let langInstruction = "";
      if (effectiveLang === "ur") {
        langInstruction = `
CRITICAL URDU LANGUAGE DIRECTIVE:
- The user is in Urdu mode or communicated in Urdu.
- You MUST reply EXCLUSIVELY in pure, fluent, natural, grammatically correct Urdu script (اردو رسم الخط).
- Do NOT reply in English. Do NOT mix English sentences into your response.
- Use warm, polite, culturally respectful Pakistani clinical phrasing:
  * "السلام علیکم! ڈاکٹر ایاز اللہ فزیوتھراپی اینڈ اسپورٹس ری ہیبلیٹیشن کلینک اسلام آباد میں خوش آمدید۔"
  * "جی محترم! ہم آپ کی مکمل رہنمائی کے لیے حاضر ہیں۔"
- Clinical facts in Urdu:
  * بغیر آپریشن جدید ڈی کمپریشن تھراپی سے کمر درد، مہروں کا دبائو، سلپ ڈسک، عرق النساء (سیاٹیکا)، اور جوڑوں کے درد کا علاج
  * ابتدائی معائنہ فیس: ${formattedFeeUrdu} (جس میں تفصیلی 45 منٹ کلینیکل ٹریاج، تشخیصی رپورٹ اور فزیوتھراپی شامل ہے)
  * پتہ: آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، جی ایٹ مرکز (G-8 Markaz)، اسلام آباد
  * اوقات: پیر تا ہفتہ، صبح 10:00 بجے سے رات 08:00 بجے تک (اتوار چھٹی)
  * خصوصی دن: بدھ (Wednesday) ڈاکٹر ایاز اللہ کا خاص کلینیکل دن ہے
  * فون / واٹس ایپ: +92 332 9895770 (0332 9895770)
  * ادائیگی: جاز کیش (03175309414 - عنوان: AYAZ ULLAH) اور میزان بینک (00300112565418 - عنوان: AYAZULLAH)
- Inform the patient that they can choose therapy and slots directly using the interactive booking menu below in this chat, or visit /book-appointment, or check their booking at /manage-booking.
`;
      } else if (effectiveLang === "ps") {
        langInstruction = `
CRITICAL PASHTO LANGUAGE DIRECTIVE:
- The user is in Pashto mode or communicated in Pashto.
- You MUST reply EXCLUSIVELY in authentic, fluent, natural, grammatically correct Pashto script (پښتو خط).
- Do NOT reply in English. Do NOT reply in Urdu.
- Use warm, respectful Pashtun greeting and clinical phrasing:
  * "سلامونه او نېکې هیلې! ستړي مه شئ. د ډاکټر ایازالله فزیوتراپي او سپورټس ریهیبیلیټیشن کلینیک اسلام آباد ته ښه راغلاست."
  * "زه ستاسو په خدمت کې حاضر یم."
- Clinical facts in Pashto:
  * د ملا درد، د مورو ډیسک، اوښتی هډوکی، سیټیکا (عرق النساء)، د زنګون درد او فالج بې له عملیاتو عصري درملنه
  * فیس: د تفصیلي معاینې او فزیوتراپي درملنې فیس ${consultationFee.toLocaleString()} روپۍ دی
  * پته: دفتر نمبر ۱۲، لومړی پوړ، پاک لینډ پلازه، جي اېټ مرکز (G-8 Markaz)، اسلام آباد
  * وختونه: د ګل نه تر خالي ورځې، د سهار ۱۰:۰۰ نه د ماښام تر ۰۸:۰۰ بجو پورې (یکشنبه رخصت دی)
  * د ډاکټر ایازالله ځانګړې ورځ: د شورو ورځ (Wednesday)
  * تیلیفون / واټس اپ: +92 332 9895770 (0332 9895770)
  * د پیسو لېږلو حسابونه: جاز کیش (03175309414 - نوم: AYAZ ULLAH) او میزان بینک (00300112565418 - نوم: AYAZULLAH)
- Inform the patient that they can pick their therapy and slot using the interactive menu right below in the chat, or check their appointment at /manage-booking.
`;
      } else if (effectiveLang === "en") {
        langInstruction = `
ENGLISH LANGUAGE DIRECTIVE:
- The user has selected English. Respond clearly, warmly, and professionally in English.
- Highlight Dr. Ayazullah's credentials (3.5+ years, 14,000+ recoveries), ${formattedFee} consultation fee, Wednesday clinical day, G-8 Markaz Islamabad location, Contact number +92 332 9895770, and the interactive in-chat booking menu below.
`;
      } else {
        langInstruction = "\nDetect the language the patient uses (English, Urdu, or Pashto) and respond in that exact same language.";
      }

      // Special guidance when booking is mentioned
      const isBookingRequest = /\b(book|reserve|schedule|therapy|appointment|slot|بدھ|شورو|اپائنٹمنٹ|ملاقات|تھراپی|علاج|سلاٹ|وخت|fee|fees|cost|charge|charges|قیمت|فیس)\b/i.test(lastUserLower);
      let bookingGuidance = "";
      if (isBookingRequest) {
        bookingGuidance = `
IMPORTANT BOOKING & FEES INTERACTIVE WORKFLOW:
- The patient is inquiring about booking, therapy options, or fees (${formattedFee} / ${formattedFeeUrdu}).
- Warmly explain how to book an appointment:
  1. Mention the official Initial Consultation & Assessment Fee: ${formattedFee} (${formattedFeeUrdu}), which covers full 45-minute clinical diagnostic evaluation + targeted physical therapy session.
  2. Highlight the dynamic therapy programs configured by our clinic:
${servicesOverviewText}
  3. Share available time slots: Morning (09:30 AM - 11:30 AM), Afternoon (02:30 PM - 04:30 PM), Evening (05:30 PM - 07:30 PM). Featured day: Wednesday (Dr. Ayazullah's main clinical day).
  4. Explain payment options: JazzCash (03175309414), Meezan Bank (00300112565418), or EasyPaisa (03329895770). Clinic phone: +92 332 9895770.
  5. Remind the patient that they can directly use the Interactive Booking Menu located right below this chat window to pick their therapy, choose date & slot, and submit their booking!`;
      }

      const dynamicSystemPrompt = CLINIC_SYSTEM_PROMPT.replace(/5,000/g, consultationFee.toLocaleString());
      const fullSystemInstruction = `${dynamicSystemPrompt}\n${langInstruction}\n${bookingGuidance}\nToday's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

      // Build sanitized contents array for Gemini generateContent
      const geminiContents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

      for (const m of messages.slice(-10)) {
        if (!m.content || typeof m.content !== "string") continue;
        const role = m.role === "assistant" ? "model" : "user";
        if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === role) {
          geminiContents[geminiContents.length - 1].parts[0].text += `\n${m.content}`;
        } else {
          geminiContents.push({
            role,
            parts: [{ text: m.content }]
          });
        }
      }

      // Ensure the first turn in contents is from "user"
      if (geminiContents.length === 0 || geminiContents[0].role !== "user") {
        geminiContents.unshift({
          role: "user",
          parts: [{ text: "Hello" }]
        });
      }

      let aiResponseText = "";
      let usedModel = "";

      // 1. PRIMARY: Groq AI Models (Llama 3.3 70B, Llama 3.1 8B, Mixtral) with dynamic API Key resolution
      const currentGroqKey = await getEffectiveGroqKey(reqGroqKey || (req.headers["x-groq-api-key"] as string));
      const groqCandidateModels = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.2-3b-preview",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "mixtral-8x7b-32768",
        "gemma2-9b-it"
      ];

      if (currentGroqKey) {
        for (const modelName of groqCandidateModels) {
          try {
            console.log(`[Groq AI Chat] Querying model ${modelName}...`);
            const groq = new Groq({ apiKey: currentGroqKey });
            const groqHistory = [
              { role: "system", content: fullSystemInstruction },
              ...messages.slice(-10).map((m: any) => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content || ""
              }))
            ];

            const completion = await groq.chat.completions.create({
              model: modelName,
              messages: groqHistory as any,
              temperature: 0.5,
              max_tokens: 1000,
            });

            const reply = completion.choices[0]?.message?.content;
            if (reply && reply.trim()) {
              aiResponseText = reply.trim();
              usedModel = `groq:${modelName}`;
              console.log(`[Groq Chat SUCCESS] ${modelName} responded (${reply.length} chars).`);
              break;
            }
          } catch (groqErr: any) {
            console.warn(`[Groq ${modelName} Warning]:`, groqErr.message || groqErr);
          }
        }
      }

      // 2. SECONDARY: Google Gemini Models
      const currentGeminiKey = await getEffectiveGeminiKey(reqGeminiKey || (req.headers["x-gemini-api-key"] as string));
      if (!aiResponseText && currentGeminiKey) {
        const geminiCandidateModels = [
          "gemini-2.5-flash",
          "gemini-2.0-flash",
          "gemini-1.5-flash"
        ];

        for (const candidateModel of geminiCandidateModels) {
          try {
            console.log(`[Gemini Chat] Querying ${candidateModel}...`);
            const ai = new GoogleGenAI({ apiKey: currentGeminiKey });
            const geminiResp = await ai.models.generateContent({
              model: candidateModel,
              contents: geminiContents,
              config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.35,
              }
            });

            if (geminiResp && geminiResp.text && geminiResp.text.trim()) {
              aiResponseText = geminiResp.text.trim();
              usedModel = `gemini:${candidateModel}`;
              console.log(`[Gemini Chat SUCCESS] Used model ${candidateModel}`);
              break;
            }
          } catch (geminiErr: any) {
            console.warn(`[Gemini ${candidateModel} Warning]:`, geminiErr.message || geminiErr);
          }
        }
      }

      // 3. TERTIARY: Dynamic Symptom-Specific Clinical Knowledge Engine (Creative, Empathetic & Non-Scripted)
      if (!aiResponseText) {
        console.log(`[AI Engine Notice] Using dynamic symptom-specific clinical response engine for query: "${lastUserMsg.slice(0, 40)}..." (Lang: ${effectiveLang})`);
        usedModel = "clinic-dynamic-clinical-engine";

        const lowerMsg = lastUserMsg.toLowerCase();

        // Topic detection
        const isNeckOrCervical = /\b(neck|cervical|shoulder|gardan|kandha|گردن|کندھا)\b/i.test(lowerMsg);
        const isBackOrSciatica = /\b(back|sciatica|disc|spine|lumbar|kamar|mohre|moron|کمر|مہرے|سیاٹیکا)\b/i.test(lowerMsg);
        const isKneeOrJoint = /\b(knee|joint|arthritis|leg|ghutna|jod|زنگون|گھٹنا|جوڑ)\b/i.test(lowerMsg);
        const isStrokeOrNeuro = /\b(stroke|paralysis|neuro|brain|falaaj|فالج|اعصاب)\b/i.test(lowerMsg);
        const isTimingsLocation = /\b(timing|timings|time|hours|open|address|location|where|pata|pakland|g8|جی ایٹ|پتہ|اوقات|وقت)\b/i.test(lowerMsg);
        const isFeeOrCost = /\b(fee|fees|cost|charge|charges|price|paisa|kitni|فیس|قیمت|روپے)\b/i.test(lowerMsg);
        const isInternship = /\b(internship|fellowship|academy|dpt|cv|apply|فیلوشپ|انٹرن|درخواست)\b/i.test(lowerMsg);

        if (effectiveLang === "ur") {
          if (isNeckOrCervical) {
            aiResponseText = `**السلام علیکم! گردن اور کندھے کے درد کی فزیوتھراپی بحالی۔** 🩺

گردن کا درد (Cervical Pain)، مہروں کا دبائو اور کندھے کی جکڑن عام طور پر پوسچر کی خرابی يا اعصابی دباؤ کی وجہ سے ہوتی ہے۔

• **ہمارا کلینیکل حل:** بغیر آپریشن جدید ڈی کمپریشن تھراپی، Maitland manual mobilization اور Trigger point needling۔
• **ڈاکٹر ایاز اللہ کا ٹریاج:** 45 منٹ تفصیلی تشخیصی معائنہ جس میں MRI اور اعصابی معائنہ شامل ہے۔
• **ابتدائی فیس:** ${formattedFeeUrdu}

آپ نیچے فارم سے بدھ یا کسی بھی دن ڈاکٹر ایاز اللہ کے ساتھ اپنا اپائنٹمنٹ بک کر سکتے ہیں۔`;
          } else if (isBackOrSciatica) {
            aiResponseText = `**السلام علیکم! کمر درد، سلپ ڈسک اور سیاٹیکا (Sciatica) کا بہترین علاج۔** 🩺

کمر کے مہروں کا دبائو (L4-L5 / L5-S1) اور عرق النساء کا درد جدید فزیوتھراپی سے بغیر آپریشن 100% قابلِ علاج ہے۔

• **ڈی کمپریشن تھراپی:** نرو روٹ (Nerve root) پر دباؤ کو ختم کر کے فوری آرام فراہم کرتی ہے۔
• **کلینک پتہ:** آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، جی ایٹ مرکز، اسلام آباد۔
• **معائنہ فیس:** ${formattedFeeUrdu}

آپ چیٹ کے نیچے دیے گئے فارم سے اپنی پسند کا وقت منتخب کر کے بکنگ مکمل کر سکتے ہیں۔`;
          } else if (isKneeOrJoint) {
            aiResponseText = `**السلام علیکم! زنگون اور جوڑوں کے درد کی بحالی۔** 🩺

گھٹنے کا درد، گٹھیا (Arthritis) اور لیگامنٹ (ACL) کی چوٹ کا علاج جدید کائنیٹک ری سیٹ اور کواڈریسیپس اسٹرینگتھننگ سے ممکن ہے۔

• **فزیوتھراپی سیشن:** 45 منٹ 1-on-1 تفصیلی معائنہ و علاج۔
• **کلینیکل فیس:** ${formattedFeeUrdu}
• **اوقات:** پیر تا ہفتہ (صبح 10:00 تا رات 08:00)۔

آپ نیچے والے فارم سے بدھ کا خاص دن یا کوئی بھی وقت سلیکٹ کر سکتے ہیں۔`;
          } else if (isStrokeOrNeuro) {
            aiResponseText = `**السلام علیکم! فالج اور اعصابی بیماریوں (Neuro Rehab) کی فیزوتھراپی۔** 🩺

فالج (Stroke Recovery)، موٹر کنٹرول کی بحالی اور توازن کے مسائل کے لیے ہم نیورو پلاسٹسٹی اور گیٹ ری ایجوکیشن کی خصوصی تھراپی فراہم کرتے ہیں۔

• **خصوصی نیورو سیشن:** 60 منٹ ون آن ون سیشن بحالی کے لیے۔
• **ابتدائی معائنہ فیس:** ${formattedFeeUrdu}
• **پتہ:** پاک لینڈ پلازہ، جی ایٹ مرکز، اسلام آباد۔`;
          } else if (isTimingsLocation) {
            aiResponseText = `**کلینک کے اوقات اور مکمل پتہ:** 📍

• **پتہ:** آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، G-8 مرکز، اسلام آباد۔
• **اوقات:** پیر تا ہفتہ، صبح 10:00 بجے سے رات 08:00 بجے تک (اتوار چھٹی)۔
• **خاص کلینیکل دن:** بدھ (Wednesday) ڈاکٹر ایاز اللہ کا خاص 1-on-1 دن ہے۔
• **فون / واٹس ایپ:** +92 332 9895770

آپ اسی چیٹ سے اپائنٹمنٹ بک کر سکتے ہیں۔`;
          } else if (isFeeOrCost) {
            aiResponseText = `**ڈاکٹر ایاز اللہ کلینک فیس اور ادائیگی کا طریقہ:** 💰

• **ابتدائی معائنہ اور تشخیصی فیس:** ${formattedFeeUrdu} (جس میں تفصیلی 45 منٹ ٹریاج، تشخیصی رپورٹ اور تھراپی سیشن شامل ہے)۔
• **جاز کیش:** 03175309414 (عنوان: AYAZ ULLAH)
• **میزان بینک:** 00300112565418 (عنوان: AYAZULLAH)
• **ایزی پیسہ:** 03329895770 (عنوان: AYAZ ULLAH)

آپ اپائنٹمنٹ نیچے دیے گئے بٹن سے فوری بک کر سکتے ہیں۔`;
          } else if (isInternship) {
            aiResponseText = `**ڈاکٹر ایاز اللہ اکیڈمی - فیلوشپ اور انٹرن شپ پروگرام 🎓**

سمر انٹیک میں صرف 12 نشستیں دستیاب ہیں۔ DPT طلباء اور گریجویٹس کے لیے خصوصی ٹریکس:
1. آرتھوپیڈک فزیکل ری ہیبلیٹیشن فیلوشپ
2. ڈی کمپریشن اور مینوئل تھراپی پریکٹیکم
3. اسپورٹس فزیوتھراپی اور ACL بحالی

درخواست فارم جمع کروانے کے لیے /internship-academy پر جائیں۔`;
          } else if (isBookingRequest) {
            aiResponseText = `**السلام علیکم! ڈاکٹر ایاز اللہ فزیوتھراپی کلینک اسلام آباد میں اپائنٹمنٹ بکنگ۔** 🩺

• **معائنہ فیس:** ${formattedFeeUrdu} (45 منٹ تفصیلی معائنہ اور فزیوتھراپی)
• **کلینک پتہ:** پاک لینڈ پلازہ، G-8 مرکز، اسلام آباد
• **اوقات:** پیر تا ہفتہ، صبح 10 تا رات 8 بجے (بدھ ڈاکٹر ایاز اللہ کا خاص کلینیکل دن ہے)

💡 **فوری بکنگ:** نیچے دیے گئے **انٹرایکٹو فارم** سے اپنی پسندی کی تھراپی، دن اور وقت چن کر بک کریں۔`;
          } else {
            aiResponseText = `**السلام علیکم! ڈاکٹر ایاز اللہ فزیوتھراپی اینڈ اسپورٹس ری ہیبلیٹیشن کلینک میں خوش آمدید۔** 🩺

ہم بغیر آپریشن جدید ڈی کمپریشن تھراپی سے کمر درد، گردن درد، سلپ ڈسک، سیاٹیکا، جوڑوں کے درد اور فالج کا بہترین علاج فراہم کرتے ہیں۔

• **ابتدائی معائنہ فیس:** ${formattedFeeUrdu}
• **پتہ:** آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، G-8 مرکز، اسلام آباد (پیر تا ہفتہ، 10:00 AM - 08:00 PM)

جی محترم! آپ اپنی تکلیف بتائیں یا نیچے مینو سے براہِ راست اپائنٹمنٹ بک کریں۔`;
          }
        } else if (effectiveLang === "ps") {
          if (isBookingRequest || isFeeOrCost) {
            aiResponseText = `**سلامونه! د ډاکټر ایازالله فزیوتراپي کلینیک اسلام آباد.** 🩺

• **فیس:** ${consultationFee.toLocaleString()} روپۍ (۴۵ دقیقې معاینه او فزیوتراپي)
• **پته:** دفتر نمبر ۱۲، پاک لینډ پلازه، G-8 مرکز، اسلام آباد
• **وختونه:** ګل نه تر خالي (۱۰:۰۰ سهار تر ۰۸:۰۰ ماښام) د شورو ورځ ځانګړې ده.

تاسو کولی شئ لاندې د چټ مینو له لارې خپل ملاقات ثبت کړئ.`;
          } else {
            aiResponseText = `**سلامونه! د ډاکټر ایازالله فزیوتراپي او سپورټس ریهیبیلیټیشن کلینیک.** 🩺

موږ د ملا درد، د غاړې درد، سیټیکا، زنګون درد او فالج بې له عملیاتو عصري درملنه کوو.

• **فیس:** ${consultationFee.toLocaleString()} روپۍ
• **پته:** دفتر نمبر ۱۲، پاک لینډ پلازه، G-8 مرکز، اسلام آباد (سهار ۱۰:۰۰ تر ماښام ۰۸:۰۰)

مهرباني وکړئ خپله ستونزه ولیکئ یا لاندې د مینو له لارې وخت انتخاب کړئ.`;
          }
        } else {
          // English Dynamic Clinical Response
          if (isNeckOrCervical) {
            aiResponseText = `**Cervical Spine & Shoulder Rehabilitation Protocol** 🩺

Cervical pain, nerve impingement, and shoulder stiffness are frequently caused by disc compression and postural forward slump.

• **Clinical Solution:** Non-surgical decompression therapy, Maitland/Mulligan joint mobilization, and targeted dry needling.
• **Diagnostic Triage:** Comprehensive 45-minute examination by Dr. Ayazullah including radiological correlation (MRI/CT).
• **Consultation Fee:** ${formattedFee}

You can schedule your diagnostic assessment directly using the interactive menu below.`;
          } else if (isBackOrSciatica) {
            aiResponseText = `**Non-Surgical Spine Decompression & Sciatica Relief** 🩺

Lumbar disc herniation (L4-L5 / L5-S1) and sciatic nerve entrapping are highly treatable without surgery through targeted spinal realignment.

• **Decompression Protocol:** Alleviates pressure on entrapped nerve roots for rapid pain reduction.
• **Location:** Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad.
• **Consultation Fee:** ${formattedFee}

Use the interactive booking form right below to reserve your clinical session.`;
          } else if (isKneeOrJoint) {
            aiResponseText = `**Knee, Joint & Ligament Rehabilitation** 🩺

Knee arthritis, ligament sprains (ACL/PCL), and joint stiffness are addressed through kinetic resets, quadriceps loading, and joint mobilization.

• **Clinical Consultation Fee:** ${formattedFee} (45-minute 1-on-1 diagnostic evaluation).
• **Timings:** Monday to Saturday, 10:00 AM – 08:00 PM (Featured Wednesday clinical day).`;
          } else if (isStrokeOrNeuro) {
            aiResponseText = `**Stroke & Neurological Motor Recovery** 🩺

For stroke survivors and nerve injury cases, we employ neuro-plasticity principles, motor retraining, and gait re-education.

• **Specialized Neuro Session:** 60-minute targeted physical rehabilitation.
• **Consultation Fee:** ${formattedFee}
• **Location:** Pakland Plaza, G-8 Markaz, Islamabad.`;
          } else if (isTimingsLocation) {
            aiResponseText = `**Clinic Timings & Physical Address:** 📍

• **Address:** Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad, Pakistan.
• **Hours:** Monday to Saturday, 10:00 AM – 08:00 PM (Closed Sundays).
• **Featured Day:** Wednesday is Dr. Ayazullah's main clinical diagnostic day.
• **Phone / WhatsApp:** +92 332 9895770`;
          } else if (isFeeOrCost) {
            aiResponseText = `**Dr. Ayazullah Consultation Fee & Payment Schedule:** 💰

• **Initial Consultation & Diagnostic Evaluation:** ${formattedFee} (Includes 45-minute triage + physical therapy session).
• **JazzCash:** 03175309414 (Title: AYAZ ULLAH)
• **Meezan Bank:** 00300112565418 (Title: AYAZULLAH)
• **EasyPaisa:** 03329895770 (Title: AYAZ ULLAH)

You can select your preferred therapy and time slot right below in the interactive form!`;
          } else if (isInternship) {
            aiResponseText = `**Dr. Ayazullah Clinical Internship & Fellowship Academy 🎓**

Admissions Open for Summer Intake (Only 12 Seats Available). Offered tracks:
1. Orthopedic Physical Rehabilitation Fellowship
2. Spine Decompression & Manual Therapy Practicum
3. Sports Physical Therapy & ACL Recovery Internship

Apply online and submit your CV dossier at /internship-academy.`;
          } else if (isBookingRequest) {
            aiResponseText = `**Dr. Ayazullah Physiotherapy Clinic Consultation Booking** 🩺

• **Initial Consultation Fee:** ${formattedFee} (Includes 45-minute diagnostic triage + physical therapy).
• **Address:** Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad.
• **Hours:** Mon – Sat, 10:00 AM – 08:00 PM (Wednesday is Dr. Ayazullah's featured clinical day).

💡 **Book Now:** Use the **Interactive Booking Form** right below to choose your therapy, day, slot, and submit your receipt!`;
          } else {
            aiResponseText = `Welcome! I'm Dr. Ayaz Ullah, a dedicated physiotherapist committed to helping you achieve optimal health and wellness.

Do you suffer from:

- Stroke rehabilitation challenges
- Cervical pain (neck pain)
- Shoulder pain
- Lower back pain
- Sciatica
- Knee pain

Together, let's work towards alleviating your pain, restoring your mobility, and enhancing your quality of life.

Contact me today to schedule a consultation!`;
          }
        }
      }

      // Smart Action Detection to help users navigate effortlessly in their chosen language
      let actionUrl: string | undefined = undefined;
      let actionLabel: string | undefined = undefined;

      const lowerReply = aiResponseText.toLowerCase();

      if (
        lastUserLower.includes("check") || 
        lastUserLower.includes("status") || 
        lastUserLower.includes("manage") ||
        lastUserLower.includes("چیک") ||
        lastUserLower.includes("اسٹیٹس") ||
        lastUserLower.includes("کتل") ||
        lastUserLower.includes("وڅارئ") ||
        lastUserLower.includes("معلوم") ||
        lowerReply.includes("manage-booking")
      ) {
        actionUrl = "/manage-booking";
        actionLabel = effectiveLang === "ur" 
          ? "🔍 اپائنٹمنٹ کا اسٹیٹس چیک کریں" 
          : effectiveLang === "ps"
          ? "🔍 خپل ثبت شوی ملاقات وګورئ"
          : "🔍 Open Manage Booking Page";
      } else if (
        lastUserLower.includes("book") || 
        lastUserLower.includes("appointment") || 
        lastUserLower.includes("reserve") ||
        lastUserLower.includes("بک") || 
        lastUserLower.includes("ملاقات") ||
        lastUserLower.includes("اپائنٹمنٹ") ||
        lowerReply.includes("book-appointment")
      ) {
        actionUrl = "/book-appointment";
        actionLabel = effectiveLang === "ur"
          ? "📅 اپائنٹمنٹ فارم کھولیں"
          : effectiveLang === "ps"
          ? "📅 د ملاقات فورمه پرانیزئ"
          : "📅 Open Appointment Booking Form";
      } else if (
        lastUserLower.includes("internship") || 
        lastUserLower.includes("fellowship") || 
        lastUserLower.includes("انٹرن") ||
        lastUserLower.includes("فیلو") ||
        lowerReply.includes("internship-academy")
      ) {
        actionUrl = "/internship-academy";
        actionLabel = effectiveLang === "ur"
          ? "🎓 فیلوشپ اور انٹرن شپ پروگرام"
          : effectiveLang === "ps"
          ? "🎓 د فیلوشپ او زده کړې پروګرام"
          : "🎓 View Fellowship Programs";
      } else if (
        lastUserLower.includes("location") || 
        lastUserLower.includes("address") || 
        lastUserLower.includes("where") ||
        lastUserLower.includes("پتہ") || 
        lastUserLower.includes("ایڈریس") ||
        lastUserLower.includes("ځای") ||
        lastUserLower.includes("پته") ||
        lowerReply.includes("contact-and-location")
      ) {
        actionUrl = "/contact-and-location";
        actionLabel = effectiveLang === "ur"
          ? "📍 کلینک کا پتہ اور نقشہ"
          : effectiveLang === "ps"
          ? "📍 د کلینیک پته او نقشه"
          : "📍 View Location & Directions";
      }

      res.json({
        success: true,
        reply: aiResponseText,
        model: usedModel,
        actionUrl,
        actionLabel
      });
    } catch (err: any) {
      console.error("[Chatbot Logic Error]:", err);
      res.status(500).json({ error: err.message || "Failed to process chat message" });
    }
  });

  // 3. Direct Appointment Lookup for Chatbot
  app.post("/api/ai/lookup-appointment", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Search query is required" });
      }

      const cleanQuery = query.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
      const allAppointments = await getDocuments("appointments", {
        orderByField: "timestamp",
        orderDirection: "desc"
      });

      const found = allAppointments.find((apt: any) => {
        const p = (apt.patientPhone || "").toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
        const tx = (apt.transactionId || "").toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
        const id = (apt.id || "").toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
        const name = (apt.patientName || "").toLowerCase();

        return (
          (p && cleanQuery.length >= 7 && (p.includes(cleanQuery) || cleanQuery.includes(p))) ||
          (tx && tx.includes(cleanQuery)) ||
          (id && id.includes(cleanQuery)) ||
          (cleanQuery.length >= 4 && name.includes(cleanQuery))
        );
      });

      if (found) {
        res.json({
          found: true,
          appointment: {
            id: found.id,
            patientName: found.patientName,
            date: found.date,
            time: found.time,
            category: found.category,
            status: found.status || "Pending",
            paymentMethod: found.paymentMethod,
            transactionId: found.transactionId,
            fee: found.fee
          }
        });
      } else {
        res.json({
          found: false,
          message: "No appointment found matching that phone or reference ID. You can verify on /manage-booking."
        });
      }
    } catch (err: any) {
      console.error("[AI Lookup Appointment Error]:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Upload Payment Transfer Slip from Chatbot or Booking
  app.post("/api/upload-slip", async (req, res) => {
    try {
      const { base64Data, fileName } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: "Missing base64Data payload" });
      }

      const cleanBase64 = base64Data.includes(";base64,")
        ? base64Data.split(";base64,")[1]
        : base64Data;

      const buffer = Buffer.from(cleanBase64, "base64");
      const safeName = (fileName || `slip_${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, "_");
      const fullFileName = `${Date.now()}_${safeName}`;
      const filePath = path.join(process.cwd(), "public", "uploads", "slips", fullFileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      fs.writeFileSync(filePath, buffer);
      const publicUrl = `/uploads/slips/${fullFileName}`;

      res.json({
        success: true,
        url: publicUrl,
        fileName: fullFileName
      });
    } catch (err: any) {
      console.error("[Upload Slip Error]:", err);
      res.status(500).json({ error: err.message || "Failed to upload receipt slip" });
    }
  });

  // 5. Quick Direct Booking for Patients through the Voice Chatbot
  app.post("/api/ai/quick-book", async (req, res) => {
    try {
      const { 
        patientName, 
        patientPhone, 
        patientEmail,
        date, 
        time, 
        category, 
        symptoms, 
        paymentMethod, 
        transactionId,
        receiptUrl,
        receiptName 
      } = req.body;

      if (!patientPhone && !patientName) {
        return res.status(400).json({ error: "Patient name or phone number is required" });
      }

      const randomRef = Math.floor(100000 + Math.random() * 900000);
      const txId = (transactionId && transactionId.trim().length > 2)
        ? transactionId.trim().toUpperCase()
        : `AX-${randomRef}`;

      const appointmentData = {
        patientName: (patientName || "Valued Patient").trim(),
        patientPhone: (patientPhone || "").trim(),
        patientEmail: (patientEmail || "").trim(),
        patientAge: "Adult",
        symptomDuration: "Reported via AI Assistant",
        painLevel: 5,
        symptomsDesc: symptoms || "Consultation booked via AI Voice Assistant",
        date: date || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        time: time || "11:00 AM",
        category: category || "Spine, Neck & Sciatica Relief (Decompression)",
        mode: "In-Clinic Consultation",
        fee: "Rs. 5,000",
        paymentMethod: paymentMethod || "JazzCash / Bank Transfer",
        transactionId: txId,
        receiptName: receiptName || (receiptUrl ? path.basename(receiptUrl) : ""),
        receiptUrl: receiptUrl || "",
        status: "Pending",
        bookedVia: "Dr. Ayazullah AI Assistant",
        timestamp: new Date().toISOString()
      };

      const docResult = await addDocument("appointments", appointmentData);

      console.log(`[AI Quick Book] Successfully reserved appointment for ${appointmentData.patientName} (Ref: ${txId})`);
      res.status(201).json({
        success: true,
        id: docResult.id,
        transactionId: txId,
        appointment: { ...appointmentData, id: docResult.id }
      });
    } catch (err: any) {
      console.error("[AI Quick Book Error]:", err);
      res.status(500).json({ error: err.message });
    }
  });

async function startLocalServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development (dynamic import — vite is a devDependency)
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    // Use opaque module name to prevent Vercel's bundler from tracing vite as a dependency
    const viteModuleName = "vi" + "te";
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    const httpServer = http.createServer(app);

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      initNeonDatabase().catch((err) => {
        console.error("Neon DB startup error:", err.message);
      });
    });
  }
}

if (!process.env.VERCEL) {
  startLocalServer();
}

export default app;

