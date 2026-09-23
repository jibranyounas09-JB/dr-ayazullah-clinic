import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import Groq, { toFile } from "groq-sdk";
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { CLINIC_SYSTEM_PROMPT } from "./src/lib/chatbotKnowledge";
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
} from "./src/server/neonDb";

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "cv");
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const SLIP_DIR = path.join(process.cwd(), "public", "uploads", "slips");
  if (!fs.existsSync(SLIP_DIR)) {
    fs.mkdirSync(SLIP_DIR, { recursive: true });
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

  // 6. Admin Authentication against Neon
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

  // 7. Admin Password Reset against Neon
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
  let groqClient: Groq | null = null;
  function getGroqClient(): Groq {
    if (!groqClient) {
      groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY || GROQ_API_KEY });
    }
    return groqClient;
  }

  // 1. Whisper Speech-To-Text Endpoint via Groq (Supports Urdu, Pashto, English)
  app.post("/api/ai/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType, language } = req.body;
      if (!audioData) {
        return res.status(400).json({ error: "Missing audioData payload" });
      }

      const base64Content = typeof audioData === "string" && audioData.includes(";base64,")
        ? audioData.split(";base64,")[1]
        : audioData;

      const buffer = Buffer.from(base64Content, "base64");
      if (buffer.length < 400) {
        return res.status(400).json({ error: "Audio snippet is too short. Please speak clearly into your microphone." });
      }

      const groq = getGroqClient();
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

      console.log(`[Groq Whisper STT] Transcribed: "${transcription.text}"`);
      res.json({
        success: true,
        text: (transcription.text || "").trim()
      });
    } catch (err: any) {
      console.error("[Groq Whisper Transcription Error]:", err);
      res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // 2. Chatbot Logic Engine via Google Gemini (gemini-3.8-flash) with specialized Multilingual & Clinical Intelligence
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages, userLanguage, consultationFee: clientFee, servicesList } = req.body;
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

      // Language instruction guidance tailored for Google Gemini
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
  * د پیسو لېږلو حسابونه: جاز کیش (03175309414 - نوم: AYAZ ULLAH) او میزان بینک (00300112565418 - نوم: AYAZULLAH)
- Inform the patient that they can pick their therapy and slot using the interactive menu right below in the chat, or check their appointment at /manage-booking.
`;
      } else if (effectiveLang === "en") {
        langInstruction = `
ENGLISH LANGUAGE DIRECTIVE:
- The user has selected English. Respond clearly, warmly, and professionally in English.
- Highlight Dr. Ayazullah's credentials (3.5+ years, 14,000+ recoveries), ${formattedFee} consultation fee, Wednesday clinical day, G-8 Markaz Islamabad location, and the interactive in-chat booking menu below.
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
  4. Explain payment options: JazzCash (03175309414), Meezan Bank (00300112565418), or EasyPaisa (03329895770).
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

      // 1. PRIMARY: Groq AI Models (llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768)
      const groqCandidateModels = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"
      ];

      for (const modelName of groqCandidateModels) {
        try {
          console.log(`[Groq Chat] Querying ${modelName}...`);
          const groq = getGroqClient();
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
            temperature: 0.35,
            max_tokens: 900,
          });

          const reply = completion.choices[0]?.message?.content;
          if (reply && reply.trim()) {
            aiResponseText = reply.trim();
            usedModel = `groq:${modelName}`;
            console.log(`[Groq Chat SUCCESS] ${modelName} responded.`);
            break;
          }
        } catch (groqErr: any) {
          console.warn(`[Groq ${modelName} Notice]:`, groqErr.message || groqErr);
        }
      }

      // 2. SECONDARY: Google Gemini Models (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash)
      if (!aiResponseText) {
        const geminiCandidateModels = [
          "gemini-2.5-flash",
          "gemini-2.0-flash",
          "gemini-1.5-flash"
        ];

        for (const candidateModel of geminiCandidateModels) {
          try {
            console.log(`[Gemini Chat] Querying ${candidateModel}...`);
            const ai = getGeminiClient();
            const geminiResp = await ai.models.generateContent({
              model: candidateModel,
              contents: geminiContents,
              config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.2,
              }
            });

            if (geminiResp && geminiResp.text && geminiResp.text.trim()) {
              aiResponseText = geminiResp.text.trim();
              usedModel = `gemini:${candidateModel}`;
              console.log(`[Gemini Fallback SUCCESS] Used model ${candidateModel}`);
              break;
            }
          } catch (geminiErr: any) {
            console.warn(`[Gemini ${candidateModel} Notice]:`, geminiErr.message || geminiErr);
          }
        }
      }

      // 3. TERTIARY: Intelligent Clinical Local Knowledge Fallback (ensures 100% uptime without connection errors)
      if (!aiResponseText) {
        console.log(`[AI Engine Notice] Using intelligent local clinical response engine for language: ${effectiveLang}`);
        usedModel = "clinic-intelligent-fallback";

        if (effectiveLang === "ur") {
          if (isBookingRequest) {
            aiResponseText = `**السلام علیکم! ڈاکٹر ایاز اللہ فزیوتھراپی اینڈ اسپورٹس ری ہیبلیٹیشن کلینک اسلام آباد۔** 🩺

جی محترم! آپ کا اپائنٹمنٹ محفوظ کرنے کے لیے ہماری ٹیم مکمل تیار ہے۔

• **ابتدائی معائنہ فیس:** ${formattedFeeUrdu} (جس میں 45 منٹ تفصیلی تشخیصی ٹریاج اور فزیوتھراپی سیشن شامل ہے)
• **کلینک پتہ:** آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، G-8 مرکز، اسلام آباد
• **کلینیکل اوقات:** پیر تا ہفتہ، صبح 10:00 بجے تا رات 08:00 بجے (بدھ ڈاکٹر ایاز اللہ کا خاص کلینیکل دن ہے)
• **ادائیگی اکاؤنٹ:** جاز کیش (03175309414 - عنوان: AYAZ ULLAH) اور میزان بینک (00300112565418)

💡 **آسان بکنگ:** آپ اسی چیٹ ونڈو کے نیچے دیے گئے **انٹرایکٹو فارم** سے اپنی پسندی کی تھراپی، دن اور وقت چن کر سلپ اپ لوڈ کر سکتے ہیں۔`;
          } else {
            aiResponseText = `**السلام علیکم! ڈاکٹر ایاز اللہ فزیوتھراپی اینڈ اسپورٹس ری ہیبلیٹیشن کلینک اسلام آباد میں خوش آمدید۔** 🩺

ہم بغیر آپریشن جدید ڈی کمپریشن تھراپی سے کمر درد، مہروں کے مسئلہ، سلپ ڈسک، سیاٹیکا، اور جوڑوں کی بحالی کا بہترین علاج فراہم کرتے ہیں۔

• **ابتدائی معائنہ فیس:** ${formattedFeeUrdu}
• **پتہ:** آفس نمبر 12، پہلی منزل، پاک لینڈ پلازہ، G-8 مرکز، اسلام آباد
• **اوقات:** پیر تا ہفتہ (صبح 10:00 - رات 08:00)

آپ نیچے چیٹ بٹن سے اپائنٹمنٹ بک کر سکتے ہیں یا ہمیں +92 332 9895770 پر کال کر سکتے ہیں۔`;
          }
        } else if (effectiveLang === "ps") {
          if (isBookingRequest) {
            aiResponseText = `**سلامونه او نېکې هیلې! د ډاکټر ایازالله فزیوتراپي او سپورټس ریهیبیلیټیشن کلینیک اسلام آباد ته ښه راغلاست.** 🩺

• **لومړنۍ معاینه او درملنه فیس:** ${consultationFee.toLocaleString()} روپۍ
• **پته:** دفتر نمبر ۱۲، لومړی پوړ، پاک لینډ پلازه، G-8 مرکز، اسلام آباد
• **وختونه:** د ګل نه تر خالي، د سهار ۱۰:۰۰ نه د ماښام تر ۰۸:۰۰ (د شورو ورځ ځانګړې ده)
• **اکاونټونه:** جاز کیش (03175309414) او میزان بینک (00300112565418)

تاسو کولی شئ لاندې د چټ مینو له لارې خپل وخت انتخاب او ثبت کړئ.`;
          } else {
            aiResponseText = `**سلامونه! د ډاکټر ایازالله فزیوتراپي او سپورټس ریهیبیلیټیشن کلینیک.** 🩺

موږ د ملا درد، سیټیکا، زنګون درد او فالج درملنه بې له عملیاتو کوو.

• **فیس:** ${consultationFee.toLocaleString()} روپۍ
• **پته:** دفتر نمبر ۱۲، پاک لینډ پلازه، G-8 مرکز، اسلام آباد
• **وختونه:** سهار ۱۰:۰۰ تر ماښام ۰۸:۰۰ بجي

تاسو کولی شئ په اسانۍ د لاندې مینو له لارې خپل ملاقات وټاکئ.`;
          }
        } else {
          if (isBookingRequest) {
            aiResponseText = `**Assalam-o-Alaikum! Welcome to Dr. Ayazullah Physiotherapy Clinic Islamabad.** 🩺

We are ready to schedule your consultation and rehabilitation session.

• **Initial Consultation & Diagnostic Assessment:** ${formattedFee} (Includes 45-min diagnostic triage + physical therapy session)
• **Clinic Address:** Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad
• **Clinical Hours:** Mon – Sat, 10:00 AM – 08:00 PM (Wednesday is Dr. Ayazullah's featured clinical day)
• **Payment Options:** JazzCash (03175309414 - Title: AYAZ ULLAH) or Meezan Bank (00300112565418 - Title: AYAZULLAH)

💡 **Quick Booking:** You can use the **Interactive Booking Form** right below this chat to pick your therapy, date, slot, and submit your payment slip.`;
          } else {
            aiResponseText = `**Assalam-o-Alaikum! Welcome to Dr. Ayazullah Physiotherapy & Sports Rehabilitation Clinic.** 🩺

We specialize in non-surgical spine decompression, herniated disc rehabilitation, sciatica relief, joint rehab, and post-stroke recovery.

• **Initial Assessment Fee:** ${formattedFee}
• **Location:** Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad
• **Timings:** Monday to Saturday, 10:00 AM – 08:00 PM

Feel free to pick a therapy option below or book directly at /book-appointment.`;
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    initNeonDatabase().catch((err) => {
      console.error("Neon DB startup error:", err.message);
    });
  });
}

startServer();

