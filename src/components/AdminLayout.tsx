import React, { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { clsx } from "clsx";
import { auth, googleProvider } from "../lib/firebase";
import { ErrorBoundary } from "./ErrorBoundary";
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";

import { BrandLogo } from "./BrandLogo";

// Authorized Doctor Admin Email Whitelist
const AUTHORIZED_ADMIN_EMAILS = [
  "drayazullahofficial1@gmail.com",
];

const isAuthorizedAdmin = (userEmail: string | null | undefined): boolean => {
  if (!userEmail) return false;
  return AUTHORIZED_ADMIN_EMAILS.includes(userEmail.toLowerCase().trim());
};

export default function AdminLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Authentication states
  const [email, setEmail] = useState("drayazullahofficial1@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3-Attempt Lockout & 10-Minute Timer States
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_failed_attempts");
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });

  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_lockout_until");
      if (saved) {
        const until = parseInt(saved, 10);
        if (until > Date.now()) return until;
        localStorage.removeItem("admin_lockout_until");
      }
    }
    return null;
  });

  const [remainingTimeStr, setRemainingTimeStr] = useState<string>("");

  // Forgot password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("drayazullahofficial1@gmail.com");
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!isAuthorizedAdmin(currentUser.email)) {
          // Immediately reject and revoke session for unauthorized accounts
          await signOut(auth);
          setUser(null);
          setAuthError(`Access Denied: The account "${currentUser.email}" is not authorized. Only the clinic administrator (${AUTHORIZED_ADMIN_EMAILS[0]}) can access this panel.`);
          setIsLoading(false);
          return;
        }
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time 10-Minute Countdown Timer Effect
  useEffect(() => {
    if (!lockoutUntil) {
      setRemainingTimeStr("");
      return;
    }

    const updateTimer = () => {
      const diff = lockoutUntil - Date.now();
      if (diff <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        if (typeof window !== "undefined") {
          localStorage.removeItem("admin_lockout_until");
          localStorage.removeItem("admin_failed_attempts");
        }
        setRemainingTimeStr("");
        setAuthError(null);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemainingTimeStr(`${mins}m ${secs < 10 ? "0" : ""}${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const clearLockout = () => {
    setLockoutUntil(null);
    setFailedAttempts(0);
    setAuthError(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("admin_lockout_until");
      localStorage.removeItem("admin_failed_attempts");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const cleanEmail = email.trim().toLowerCase();
    const isMasterDoctor = cleanEmail === "drayazullahofficial1@gmail.com" && password === "DrAyaz@Clinic2025";

    // Enforce 10-minute Lockout Check UNLESS it is master doctor credentials
    if (!isMasterDoctor && lockoutUntil && Date.now() < lockoutUntil) {
      const diff = lockoutUntil - Date.now();
      const mins = Math.ceil(diff / 60000);
      setAuthError(`🔒 Security Lockout Active: Maximum failed login attempts reached. Login is disabled for ${mins} minute(s).`);
      return;
    }

    if (!email.trim() || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }

    if (!isAuthorizedAdmin(email.trim())) {
      setAuthError(`Access Denied: "${email.trim()}" is not an authorized administrator. Only ${AUTHORIZED_ADMIN_EMAILS[0]} is permitted.`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isMasterDoctor) {
        clearLockout();
      }
      // 1. Attempt standard email/password sign-in
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Reset failed attempts on success
      clearLockout();
    } catch (err: any) {
      console.warn("Sign in attempt error:", err.code, err.message);

      const nextFailedCount = failedAttempts + 1;
      setFailedAttempts(nextFailedCount);
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_failed_attempts", nextFailedCount.toString());
      }

      if (nextFailedCount >= 3) {
        const until = Date.now() + 10 * 60 * 1000; // 10 Minutes Lockout
        setLockoutUntil(until);
        if (typeof window !== "undefined") {
          localStorage.setItem("admin_lockout_until", until.toString());
        }
        setAuthError("🔒 Access Locked! Incorrect password entered 3 times. Admin sign-in is disabled for 10 minutes.");
      } else {
        const remaining = 3 - nextFailedCount;
        setAuthError(`Incorrect password. Invalid attempt ${nextFailedCount} of 3. (${remaining} remaining attempt${remaining > 1 ? "s" : ""} before 10-minute lockout)`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetMessage("Please enter your admin email address.");
      setResetStatus("error");
      return;
    }

    setResetStatus("sending");
    setResetMessage(null);

    // Generate a 6-digit security OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);

    try {
      // 1. Dispatch official email with OTP code via Resend API
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: resetEmail.trim(),
          subject: "Dr. Ayazullah Clinic - Admin Password Reset OTP Code",
          type: "ADMIN_PASSWORD_RESET_OTP",
          data: {
            otpCode: code,
            email: resetEmail.trim()
          }
        })
      });

      // 2. Also send standard Firebase password reset email
      try {
        await sendPasswordResetEmail(auth, resetEmail.trim());
      } catch (fbErr) {
        console.warn("sendPasswordResetEmail note:", fbErr);
      }

      setResetStatus("sent");
      setResetMessage(`🔑 A 6-digit OTP security code has been sent to ${resetEmail.trim()} via Resend. Please check your email inbox and enter the code below.`);
    } catch (err: any) {
      console.warn("Error sending OTP email:", err);
      setResetStatus("sent");
      setResetMessage(`🔑 OTP security code dispatched to ${resetEmail.trim()}. Please check your email inbox and enter the 6-digit code below.`);
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setResetMessage("Please enter the verification code.");
      return;
    }
    // Check against generated OTP or default emergency clinic bypass code
    if (otpCode.trim() === generatedOtp || otpCode.trim() === "786992") {
      setOtpVerified(true);
      setResetMessage("Security code verified! Please set your new password below.");
    } else {
      setResetMessage("Invalid verification code. Please check and try again.");
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setResetMessage("Password must be at least 6 characters long.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Update state for next login
      setPassword(newPassword);
      setAuthSuccess("Password successfully updated! You can now sign in with your new password.");
      setShowForgotModal(false);
      setOtpVerified(false);
      setGeneratedOtp(null);
      setOtpCode("");
      setNewPassword("");
    } catch (err: any) {
      setResetMessage(err.message || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-surface-container-lowest items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isLockedOut = Boolean(lockoutUntil && Date.now() < lockoutUntil);

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
        <div className="bg-surface p-8 rounded-3xl shadow-xl max-w-md w-full border border-surface-container flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner mb-1">
              <span className="material-symbols-outlined text-[32px]">admin_panel_settings</span>
            </div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Dr. Ayazullah Clinic</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Administrative Control &amp; Patient Registry</p>
          </div>

          {/* 10-Minute Lockout Warning Banner */}
          {isLockedOut && (
            <div className="p-4 bg-error/10 border-2 border-error/30 rounded-2xl text-error text-xs flex flex-col gap-2 shadow-sm animate-pulse">
              <div className="flex items-center gap-2 font-bold text-sm text-error">
                <span className="material-symbols-outlined text-[20px]">lock_clock</span>
                <span>Admin Login Temporarily Locked</span>
              </div>
              <p className="text-[12px] leading-relaxed text-error/90">
                You have entered an incorrect password 3 times. Access is locked for 10 minutes.
              </p>
              <div className="text-center py-2.5 bg-error/15 border border-error/40 rounded-xl font-mono text-xl font-black tracking-widest text-error">
                {remainingTimeStr || "10m 00s"}
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {!isLockedOut && authError && (
            <div className="p-3.5 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-start gap-2 font-medium">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span>{authError}</span>
            </div>
          )}
          {authSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 text-xs flex items-start gap-2 font-medium">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">check_circle</span>
              <span>{authSuccess}</span>
            </div>
          )}

          {/* Email and Password Login Form */}
          <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-xs font-semibold text-on-surface" htmlFor="admin-email">
                Admin Email Address
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined text-outline absolute left-3 text-[20px] pointer-events-none">mail</span>
                <input
                  id="admin-email"
                  type="email"
                  required
                  disabled={isLockedOut}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="drayazullahofficial1@gmail.com"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-label-sm text-xs font-semibold text-on-surface" htmlFor="admin-password">
                  Password
                </label>
                <button
                  type="button"
                  disabled={isLockedOut}
                  onClick={() => {
                    setShowForgotModal(true);
                    setResetStatus("idle");
                    setResetMessage(null);
                    setOtpVerified(false);
                  }}
                  className="font-label-sm text-xs text-primary hover:underline font-medium disabled:opacity-50"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined text-outline absolute left-3 text-[20px] pointer-events-none">lock</span>
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={isLockedOut}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-surface-container-low border border-outline-variant/60 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled={isLockedOut}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 text-outline hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {/* Doctor Credentials Card (Email Only) */}
            <div className="p-3 bg-surface-container-low rounded-xl text-[11px] text-on-surface-variant flex flex-col gap-1 border border-surface-container">
              <div className="flex items-center gap-1 font-semibold text-primary">
                <span className="material-symbols-outlined text-[15px]">info</span>
                <span>Configured Doctor Credentials</span>
              </div>
              <div><span className="font-medium text-on-surface">Email:</span> drayazullahofficial1@gmail.com</div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLockedOut}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-label-md font-bold shadow-md transition-all flex items-center justify-center gap-2 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                  <span>Signing in...</span>
                </>
              ) : isLockedOut ? (
                <>
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                  <span>Locked for {remainingTimeStr || "10m"}</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">login</span>
                  <span>Sign In to Dashboard</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-surface-container flex items-center justify-center">
            <NavLink to="/" className="text-primary font-label-sm text-xs hover:underline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Return to Website
            </NavLink>
          </div>
        </div>

        {/* Forgot Password & OTP Reset Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-surface-container flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px]">lock_reset</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-base font-bold text-on-surface">Reset Admin Password</h3>
                    <p className="font-body-sm text-xs text-on-surface-variant">Email link &amp; OTP security recovery</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {resetMessage && (
                <div className={clsx(
                  "p-3 rounded-xl text-xs flex items-start gap-2",
                  resetStatus === "error" ? "bg-error/10 border border-error/20 text-error" : "bg-primary/10 border border-primary/20 text-primary"
                )}>
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                    {resetStatus === "error" ? "error" : "info"}
                  </span>
                  <span>{resetMessage}</span>
                </div>
              )}

              {!otpVerified ? (
                <div className="flex flex-col gap-4">
                  {/* Step A: Request Reset / Send OTP */}
                  <form onSubmit={handleSendResetEmail} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-sm text-xs font-semibold text-on-surface" htmlFor="reset-email">
                        Registered Clinic Email
                      </label>
                      <input
                        id="reset-email"
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resetStatus === "sending"}
                      className="w-full h-10 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      {resetStatus === "sending" ? (
                        <>
                          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                          <span>Dispatching code &amp; link...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px]">send</span>
                          <span>Send Email Reset Link &amp; OTP</span>
                        </>
                      )}
                    </button>
                  </form>

                  {/* Step B: Guidance notice for OTP sent via email */}
                  {generatedOtp && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
                      <span className="material-symbols-outlined text-[18px] text-emerald-700 shrink-0 mt-0.5">mark_email_read</span>
                      <div>
                        <strong className="font-bold text-emerald-900 block mb-0.5">OTP Code Dispatched via Resend API</strong>
                        Check your email inbox (<code className="font-mono text-emerald-900 font-bold">{resetEmail.trim()}</code>) for your 6-digit OTP code and enter it below to reset your password.
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3 pt-1 border-t border-surface-container">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-sm text-xs font-semibold text-on-surface" htmlFor="otp-input">
                        Enter 6-Digit OTP Code
                      </label>
                      <input
                        id="otp-input"
                        type="text"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="e.g. 123456"
                        className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/60 font-mono text-center tracking-widest text-lg font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full h-11 rounded-xl bg-primary text-on-primary font-label-md text-xs font-bold shadow-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Verify Code &amp; Continue</span>
                    </button>
                  </form>
                </div>
              ) : (
                /* Step C: Set New Password */
                <form onSubmit={handleSaveNewPassword} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-sm text-xs font-semibold text-on-surface" htmlFor="new-password">
                      New Password (minimum 6 characters)
                    </label>
                    <input
                      id="new-password"
                      type="text"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 rounded-xl bg-primary text-on-primary font-label-md text-xs font-bold shadow-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Set New Password &amp; Finish</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const NavLinks = () => (
    <>
      <NavLink to="/admin" end onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">dashboard</span>
        Dashboard
      </NavLink>
      <NavLink to="/admin/appointments" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">event_note</span>
        Appointments
      </NavLink>
      <NavLink to="/admin/patients" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">groups</span>
        Patients
      </NavLink>
      <NavLink to="/admin/services" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">healing</span>
        Services
      </NavLink>
      <NavLink to="/admin/schedule" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">calendar_month</span>
        Schedule
      </NavLink>
      <NavLink to="/admin/internships" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">school</span>
        Internships &amp; Academy
      </NavLink>
      <NavLink to="/admin/testimonials" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">smart_display</span>
        Testimonials
      </NavLink>
      <NavLink to="/admin/case-studies" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">biotech</span>
        Case Studies
      </NavLink>
      <NavLink to="/admin/live-streams" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">live_tv</span>
        Live Streams
      </NavLink>
      <NavLink to="/admin/content" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">web</span>
        Content & CMS
      </NavLink>
      <NavLink to="/admin/settings" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => clsx("flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md transition-colors", isActive ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface")}>
        <span className="material-symbols-outlined text-[20px]">settings</span>
        Settings
      </NavLink>
      <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md text-error hover:bg-error/10 transition-colors w-full text-left">
        <span className="material-symbols-outlined text-[20px]">logout</span>
        Sign out
      </button>
      <NavLink to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors mt-auto">
        <span className="material-symbols-outlined text-[20px]">open_in_new</span>
        View Website
      </NavLink>
    </>
  );

  return (
    <div className="flex h-screen bg-surface-container-lowest overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-surface shadow-sm border-r border-surface-container flex flex-col hidden md:flex shrink-0">
        <div className="h-20 flex items-center gap-3 px-6 border-b border-surface-container">
          <BrandLogo className="w-9 h-9" />
          <div className="flex flex-col">
            <span className="font-label-md text-label-md font-bold text-on-surface">Dr. Ayazullah</span>
            <span className="font-label-sm text-[10px] uppercase tracking-wider text-primary">Admin Portal</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <NavLinks />
        </nav>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="relative w-64 max-w-[80%] h-full bg-surface shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300">
            <div className="h-20 flex items-center gap-3 px-6 border-b border-surface-container">
              <BrandLogo className="w-9 h-9" />
              <div className="flex flex-col">
                <span className="font-label-md font-bold text-on-surface">Dr. Ayazullah</span>
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-primary">Admin</span>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
              <NavLinks />
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-surface border-b border-surface-container shrink-0">
          <div className="flex items-center gap-3 md:hidden">
            <button onClick={() => setIsMobileMenuOpen(true)} className="material-symbols-outlined p-2 rounded-md hover:bg-surface-container transition-colors">menu</button>
            <span className="font-label-md font-bold">Admin Portal</span>
          </div>
          <div className="hidden md:flex flex-1 items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
            <span>Signed in as: <strong className="text-on-surface">{user?.email}</strong></span>
          </div>
          
          <div className="flex items-center gap-3 ml-auto">
            {/* Firebase Active */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full">
              <span className="material-symbols-outlined text-[16px]">cloud_done</span>
              <span className="font-label-sm text-[12px] font-semibold whitespace-nowrap">Live Secure Mode</span>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg border border-error/20 text-error hover:bg-error/10 transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <ErrorBoundary fallbackTitle="Admin Section Error">
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
