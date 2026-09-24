import React, { useState, useEffect, useRef } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { calculateExperience, DEFAULT_PRACTICE_START_DATE } from "../lib/experienceUtils";
import { PaymentMethodConfig, DEFAULT_PAYMENT_METHODS } from "../types/payment";

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    clinicName: "Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic",
    contactEmail: "drayazullahofficial1@gmail.com",
    emergencyPhone: "+92 332 9895770",
    whatsappDesk: "+92 332 9895770",
    clinicAddress: "Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad",
    consultationFee: "PKR 3,000",
    easypaisaTitle: "Dr Ayazullah",
    easypaisaNumber: "0300 1234567",
    bankName: "Meezan Bank",
    bankTitle: "Ayazullah Physiotherapy",
    bankIban: "PK12 MEZN 0000 1234 5678 90",
    doctorPhotoUrl: "",
    // Clinical experience & public stats
    practiceStartDate: DEFAULT_PRACTICE_START_DATE,
    experienceMode: "auto" as "auto" | "manual",
    manualExperience: "3.5+",
    recoveriesCount: "14k+",
    clinicRating: "4.9",
    paymentMethods: DEFAULT_PAYMENT_METHODS as PaymentMethodConfig[]
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing state for payment methods
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodForm, setMethodForm] = useState<Partial<PaymentMethodConfig>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setSettings((prev) => ({ ...prev, doctorPhotoUrl: base64 }));
        localStorage.setItem("doctor_photo_custom", base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setMethodForm((prev) => ({ ...prev, qrImageUrl: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "general"));
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          if (!data.clinicAddress || data.clinicAddress.includes("MediCare")) {
            data.clinicAddress = "Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad";
          }
          if (!data.clinicName || data.clinicName === "Dr. Ayazullah Physiotherapy") {
            data.clinicName = "Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic";
          }
          
          let methods: PaymentMethodConfig[] = data.paymentMethods;
          if (!methods || !Array.isArray(methods) || methods.length === 0) {
            methods = DEFAULT_PAYMENT_METHODS;
          }
          // Ensure "Cash at Clinic" method is always available even if DB has older data
          const hasCash = methods.some(m => m.type === 'cash');
          if (!hasCash) {
            const defaultCash = DEFAULT_PAYMENT_METHODS.find(m => m.type === 'cash');
            if (defaultCash) methods = [...methods, defaultCash];
          }

          setSettings(prev => ({ 
            ...prev, 
            ...data,
            consultationFee: data.consultationFee || "PKR 3,000",
            practiceStartDate: data.practiceStartDate || DEFAULT_PRACTICE_START_DATE,
            experienceMode: data.experienceMode || "auto",
            manualExperience: data.manualExperience || "3.5+",
            recoveriesCount: data.recoveriesCount || "14k+",
            clinicRating: data.clinicRating || "4.9",
            paymentMethods: methods
          }));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings');
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const handleToggleMethodActive = (id: string) => {
    setSettings(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m)
    }));
  };

  const handleDeleteMethod = (id: string) => {
    if (settings.paymentMethods.length <= 1) {
      alert("At least one payment method must remain active.");
      return;
    }
    setSettings(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.filter(m => m.id !== id)
    }));
    if (editingMethodId === id) {
      setEditingMethodId(null);
      setMethodForm({});
    }
  };

  const handleStartEditMethod = (method: PaymentMethodConfig) => {
    setIsAddingNew(false);
    setEditingMethodId(method.id);
    setMethodForm({ ...method });
  };

  const handleStartAddNew = () => {
    setIsAddingNew(true);
    setEditingMethodId("new");
    setMethodForm({
      id: `pay-${Date.now()}`,
      name: "",
      type: "bank",
      accountTitle: "Dr Ayazullah",
      accountNumber: "",
      bankName: "",
      iban: "",
      instructions: "Please transfer fee and upload screenshot receipt.",
      isActive: true
    });
  };

  const handleSaveMethodForm = () => {
    if (!methodForm.name?.trim()) {
      alert("Please provide a name for the payment method (e.g. JazzCash, Bank Transfer, etc.).");
      return;
    }
    if (!methodForm.accountTitle?.trim()) {
      alert("Please provide the Account Title.");
      return;
    }

    const updatedMethod: PaymentMethodConfig = {
      id: methodForm.id || `pay-${Date.now()}`,
      name: methodForm.name.trim(),
      type: methodForm.type || "wallet",
      accountTitle: methodForm.accountTitle.trim(),
      accountNumber: methodForm.accountNumber?.trim() || "",
      bankName: methodForm.bankName?.trim() || "",
      iban: methodForm.iban?.trim() || "",
      instructions: methodForm.instructions?.trim() || "",
      qrImageUrl: methodForm.qrImageUrl || "",
      isActive: methodForm.isActive ?? true
    };

    setSettings(prev => {
      const exists = prev.paymentMethods.some(m => m.id === updatedMethod.id);
      const newMethods = exists
        ? prev.paymentMethods.map(m => m.id === updatedMethod.id ? updatedMethod : m)
        : [...prev.paymentMethods, updatedMethod];

      // Keep legacy fields in sync for backward compatibility
      const easypaisa = newMethods.find(m => m.name.toLowerCase().includes("easypaisa"));
      const bank = newMethods.find(m => m.type === "bank" || m.name.toLowerCase().includes("bank"));

      return {
        ...prev,
        paymentMethods: newMethods,
        easypaisaTitle: easypaisa ? easypaisa.accountTitle : prev.easypaisaTitle,
        easypaisaNumber: easypaisa ? easypaisa.accountNumber : prev.easypaisaNumber,
        bankName: bank ? (bank.bankName || bank.name) : prev.bankName,
        bankTitle: bank ? bank.accountTitle : prev.bankTitle,
        bankIban: bank ? (bank.iban || bank.accountNumber) : prev.bankIban
      };
    });

    setEditingMethodId(null);
    setIsAddingNew(false);
    setMethodForm({});
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("");
    try {
      await setDoc(doc(db, "settings", "general"), settings);
      setSaveStatus("Settings saved successfully!");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
      setSaveStatus("Error saving settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const getMethodIcon = (type: string) => {
    switch (type) {
      case "bank": return "account_balance";
      case "wallet": return "account_balance_wallet";
      case "raast": return "qr_code_2";
      case "qr": return "qr_code_scanner";
      case "cash": return "payments";
      default: return "payments";
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Clinic Settings</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Manage contact information, public clinical parameters, and payment gateways.</p>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden">
        <div className="p-4 bg-surface-container-lowest border-b border-surface-container">
          <h2 className="font-label-lg font-bold">General Information</h2>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Clinic Name</label>
              <input type="text" name="clinicName" value={settings.clinicName} onChange={handleChange} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold text-primary">Initial Consultation &amp; Assessment Fee *</label>
              <input type="text" name="consultationFee" value={settings.consultationFee} onChange={handleChange} placeholder="e.g., PKR 3,000 or 5000" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-primary/40 focus:outline-none focus:border-primary transition-colors font-semibold" />
              <p className="text-[11px] text-on-surface-variant">Standalone fee charged when patient books initial doctor assessment without therapy package.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Contact Email</label>
              <input type="email" name="contactEmail" value={settings.contactEmail} onChange={handleChange} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Emergency Phone</label>
              <input type="text" name="emergencyPhone" value={settings.emergencyPhone} onChange={handleChange} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-label-sm font-semibold">WhatsApp Desk</label>
              <input type="text" name="whatsappDesk" value={settings.whatsappDesk} onChange={handleChange} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-label-sm font-semibold">Clinic Address</label>
            <textarea name="clinicAddress" value={settings.clinicAddress} onChange={handleChange} rows={2} className="w-full p-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors resize-none"></textarea>
          </div>
        </div>
      </div>

      {/* Doctor Profile Portrait Card */}
      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden">
        <div className="p-4 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between">
          <div>
            <h2 className="font-label-lg font-bold">Doctor Profile Portrait (Dr. Ayazullah)</h2>
            <p className="text-xs text-on-surface-variant">Featured on Homepage "Meet The Expert" profile card</p>
          </div>
          {settings.doctorPhotoUrl && (
            <span className="text-xs text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              Custom Photo Active
            </span>
          )}
        </div>
        <div className="p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="w-32 h-40 rounded-2xl overflow-hidden bg-surface-container-low border-2 border-surface-container shrink-0 flex items-center justify-center relative shadow-sm">
            {settings.doctorPhotoUrl ? (
              <img src={settings.doctorPhotoUrl} alt="Dr. Ayazullah" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-on-surface-variant text-center p-2">
                <span className="material-symbols-outlined text-[36px] text-primary">person</span>
                <span className="text-[10px] mt-1">No Custom Photo</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 flex-1">
            <p className="text-sm text-on-surface-variant">
              Upload the portrait of Dr. Ayazullah (PNG, JPG, or WebP). The image is automatically saved and displayed on the public website.
            </p>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-sm text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">upload_file</span>
                <span>Select &amp; Upload Photo</span>
              </button>
              {settings.doctorPhotoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, doctorPhotoUrl: "" }));
                    localStorage.removeItem("doctor_photo_custom");
                  }}
                  className="px-3 py-2 rounded-lg bg-surface-container-high hover:bg-error/10 hover:text-error text-on-surface-variant font-label-sm text-xs transition-colors"
                >
                  Reset Photo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clinical Experience & Public Performance Stats */}
      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden">
        <div className="p-4 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">trending_up</span>
            <h2 className="font-label-lg font-bold">Clinical Experience &amp; Public Stats</h2>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold">
            Live on Website
          </span>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Live Preview Strip */}
          <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-on-surface-variant">Live Website Header / Dashboard Preview</span>
              <span className="text-xs font-mono text-primary flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Auto-updating
              </span>
            </div>
            <div className="flex items-center gap-6 pt-2">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-on-surface">
                  {calculateExperience(settings.practiceStartDate, settings.experienceMode, settings.manualExperience).formatted}
                </span>
                <span className="text-[11px] text-on-surface-variant uppercase font-semibold tracking-wider">Years Exp.</span>
              </div>
              <div className="h-8 w-px bg-surface-container"></div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-on-surface">{settings.recoveriesCount || "14k+"}</span>
                <span className="text-[11px] text-on-surface-variant uppercase font-semibold tracking-wider">Recoveries</span>
              </div>
              <div className="h-8 w-px bg-surface-container"></div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-on-surface">{settings.clinicRating || "4.9"}</span>
                <span className="text-[11px] text-on-surface-variant uppercase font-semibold tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-amber-500 text-[13px] filled">star</span>
                  Rating
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Calculation Mode */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Experience Update Mode</label>
              <select
                name="experienceMode"
                value={settings.experienceMode}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-sm"
              >
                <option value="auto">Automatic (Dynamic calculation based on start date)</option>
                <option value="manual">Manual Override (Static text value)</option>
              </select>
            </div>

            {settings.experienceMode === 'auto' ? (
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold">Clinical Practice Inception Date</label>
                <input
                  type="date"
                  name="practiceStartDate"
                  value={settings.practiceStartDate}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-sm font-mono"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold">Manual Experience Text</label>
                <input
                  type="text"
                  name="manualExperience"
                  value={settings.manualExperience}
                  onChange={handleChange}
                  placeholder="e.g. 3.5+"
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Successful Recoveries Count</label>
              <input
                type="text"
                name="recoveriesCount"
                value={settings.recoveriesCount}
                onChange={handleChange}
                placeholder="14k+"
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Clinic Star Rating</label>
              <input
                type="text"
                name="clinicRating"
                value={settings.clinicRating}
                onChange={handleChange}
                placeholder="4.9"
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* DYNAMIC PAYMENT METHODS CONFIGURATION MANAGER */}
      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden">
        <div className="p-4 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between">
          <div>
            <h2 className="font-label-lg font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">payments</span>
              Payment Methods &amp; Account Details
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Add, edit, enable or disable payment accounts (Easypaisa, JazzCash, Meezan Bank, Raast, SadaPay, QR Codes) displayed to patients during checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartAddNew}
            className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-sm text-xs font-bold transition-all shadow-sm flex items-center gap-1 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Add Payment Method</span>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Method Edit / Add Modal or Card Form */}
          {editingMethodId && (
            <div className="p-5 rounded-xl bg-surface-container-low border-2 border-primary/40 flex flex-col gap-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-surface-container pb-3">
                <h3 className="font-label-lg font-bold text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined">{getMethodIcon(methodForm.type || "wallet")}</span>
                  {isAddingNew ? "Add New Payment Method" : `Edit Payment Method: ${methodForm.name}`}
                </h3>
                <button
                  type="button"
                  onClick={() => { setEditingMethodId(null); setIsAddingNew(false); setMethodForm({}); }}
                  className="text-on-surface-variant hover:text-error text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold">Method Name / Brand *</label>
                  <input
                    type="text"
                    value={methodForm.name || ""}
                    onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })}
                    placeholder="e.g., JazzCash, Meezan Bank, SadaPay"
                    className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm font-semibold"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold">Category / Type</label>
                  <select
                    value={methodForm.type || "wallet"}
                    onChange={(e) => setMethodForm({ ...methodForm, type: e.target.value as any })}
                    className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm"
                  >
                    <option value="wallet">Mobile Wallet (Easypaisa, JazzCash, SadaPay, etc.)</option>
                    <option value="bank">Bank Transfer (Meezan, HBL, Allied, etc.)</option>
                    <option value="raast">Raast Instant Transfer</option>
                    <option value="qr">QR Code Scan &amp; Pay</option>
                    <option value="cash">Cash at Clinic</option>
                    <option value="other">Other Payment Gateway</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold">Account Title *</label>
                  <input
                    type="text"
                    value={methodForm.accountTitle || ""}
                    onChange={(e) => setMethodForm({ ...methodForm, accountTitle: e.target.value })}
                    placeholder="e.g. Dr Ayazullah or Ayazullah Physiotherapy"
                    className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold">Account / Mobile Number / Raast ID {methodForm.type !== "cash" ? "*" : "(Optional)"}</label>
                  <input
                    type="text"
                    value={methodForm.accountNumber || ""}
                    onChange={(e) => setMethodForm({ ...methodForm, accountNumber: e.target.value })}
                    placeholder="e.g. 0300 1234567 or 00300112565418"
                    className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm font-mono"
                  />
                </div>

                {methodForm.type === "bank" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="font-label-sm font-semibold">Bank Name</label>
                    <input
                      type="text"
                      value={methodForm.bankName || ""}
                      onChange={(e) => setMethodForm({ ...methodForm, bankName: e.target.value })}
                      placeholder="e.g. Meezan Bank, Habib Bank Limited"
                      className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-sm font-semibold">IBAN Number (Optional)</label>
                  <input
                    type="text"
                    value={methodForm.iban || ""}
                    onChange={(e) => setMethodForm({ ...methodForm, iban: e.target.value })}
                    placeholder="e.g. PK12 MEZN 0000 1234 5678 90"
                    className="w-full h-10 px-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-label-sm font-semibold">Special Instructions for Patients</label>
                  <textarea
                    rows={2}
                    value={methodForm.instructions || ""}
                    onChange={(e) => setMethodForm({ ...methodForm, instructions: e.target.value })}
                    placeholder="e.g., Transfer exact session fee and upload screenshot of payment confirmation."
                    className="w-full p-3 rounded-lg bg-surface border border-surface-container focus:outline-none focus:border-primary text-sm resize-none"
                  />
                </div>

                {/* QR Code Upload */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="font-label-sm font-semibold">QR Code Image (Optional for Scan-to-Pay)</label>
                  <div className="flex items-center gap-4">
                    {methodForm.qrImageUrl && (
                      <div className="w-20 h-20 bg-white p-1 rounded-lg border border-surface-container shadow-sm shrink-0 flex items-center justify-center">
                        <img src={methodForm.qrImageUrl} alt="QR Preview" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 flex-1">
                      <input
                        type="file"
                        ref={qrInputRef}
                        onChange={handleQrUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => qrInputRef.current?.click()}
                          className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                          <span>{methodForm.qrImageUrl ? "Change QR Image" : "Upload QR Code Image"}</span>
                        </button>
                        {methodForm.qrImageUrl && (
                          <button
                            type="button"
                            onClick={() => setMethodForm({ ...methodForm, qrImageUrl: "" })}
                            className="text-xs text-error hover:underline"
                          >
                            Remove QR
                          </button>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant">PNG or JPG scan barcode (e.g. Raast/Easypaisa QR)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={methodForm.isActive ?? true}
                    onChange={(e) => setMethodForm({ ...methodForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <span className="font-label-sm text-xs font-bold text-on-surface">Active on Patient Website</span>
                </label>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingMethodId(null); setIsAddingNew(false); setMethodForm({}); }}
                    className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMethodForm}
                    className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold shadow-sm"
                  >
                    Apply Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Configured Payment Methods Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`flex flex-col gap-3 p-4 rounded-xl border transition-all ${
                  method.isActive 
                    ? "border-surface-container bg-surface-container-lowest shadow-sm" 
                    : "border-error/20 bg-surface-container-low/50 opacity-75"
                }`}
              >
                <div className="flex items-center justify-between border-b border-surface-container pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">{getMethodIcon(method.type)}</span>
                    </div>
                    <div>
                      <h3 className="font-label-md font-bold text-on-surface flex items-center gap-1.5">
                        {method.name}
                        {method.bankName && <span className="text-[11px] text-on-surface-variant font-normal">({method.bankName})</span>}
                      </h3>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">
                        {method.type}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMethodActive(method.id)}
                      title={method.isActive ? "Click to deactivate" : "Click to activate"}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors ${
                        method.isActive 
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" 
                          : "bg-error/10 text-error border border-error/20"
                      }`}
                    >
                      {method.isActive ? "Active" : "Disabled"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartEditMethod(method)}
                      className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container"
                      title="Edit Account Details"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteMethod(method.id)}
                      className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10"
                      title="Delete Method"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-on-surface">
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant font-medium">Account Title:</span>
                    <span className="font-semibold">{method.accountTitle}</span>
                  </div>

                  {method.accountNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant font-medium">Account / Mobile / ID:</span>
                      <span className="font-mono font-semibold text-primary">{method.accountNumber}</span>
                    </div>
                  )}

                  {method.iban && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-on-surface-variant font-medium shrink-0">IBAN:</span>
                      <span className="font-mono font-semibold text-primary text-right text-[11px] break-all">{method.iban}</span>
                    </div>
                  )}

                  {method.instructions && (
                    <p className="text-[11px] text-on-surface-variant italic mt-1 bg-surface-container-low p-2 rounded border border-surface-container">
                      "{method.instructions}"
                    </p>
                  )}

                  {method.qrImageUrl && (
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-surface-container">
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">qr_code_scanner</span>
                        QR Code Attached
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4">
         {saveStatus && <span className="font-label-sm font-semibold text-primary">{saveStatus}</span>}
         <button onClick={handleSave} disabled={isSaving} className="h-11 rounded-lg bg-primary hover:bg-primary-container active:scale-[0.98] text-on-primary font-label-md font-bold px-8 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
           {isSaving ? "Saving..." : "Save Configuration"}
         </button>
      </div>
    </div>
  );
}

