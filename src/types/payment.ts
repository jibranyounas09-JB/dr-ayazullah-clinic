export interface PaymentMethodConfig {
  id: string;
  name: string;           // e.g. "Easypaisa", "JazzCash", "Meezan Bank", "Raast", "SadaPay"
  type: "wallet" | "bank" | "raast" | "qr" | "other"; 
  accountTitle: string;    // e.g. "Dr Ayazullah"
  accountNumber: string;   // Mobile No, Account No, or Raast ID
  bankName?: string;       // e.g. "Meezan Bank" (optional for wallets/raast)
  iban?: string;           // e.g. "PK12 MEZN 0000 1234 5678 90" (optional)
  instructions?: string;   // e.g. "Please attach receipt after transfer"
  qrImageUrl?: string;     // Base64 image data or URL for QR Code
  isActive: boolean;
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: "pay-easypaisa",
    name: "Easypaisa",
    type: "wallet",
    accountTitle: "Dr Ayazullah",
    accountNumber: "0300 1234567",
    instructions: "Transfer to Easypaisa mobile account and attach payment receipt screenshot.",
    isActive: true
  },
  {
    id: "pay-jazzcash",
    name: "JazzCash",
    type: "wallet",
    accountTitle: "AYAZ ULLAH",
    accountNumber: "03175309414",
    iban: "PK78JCMA0307923175309414",
    instructions: "Transfer to JazzCash account and enter reference ID.",
    isActive: true
  },
  {
    id: "pay-meezan",
    name: "Meezan Bank",
    type: "bank",
    bankName: "Meezan Bank",
    accountTitle: "Ayazullah Physiotherapy",
    accountNumber: "00300112565418",
    iban: "PK21MEZN0000300112565418",
    instructions: "Transfer via online banking or ATM deposit.",
    isActive: true
  },
  {
    id: "pay-raast",
    name: "Raast",
    type: "raast",
    accountTitle: "AYAZ ULLAH",
    accountNumber: "03329895770",
    qrImageUrl: "/image.png",
    instructions: "Zero-fee instant transfer via Raast ID or scan QR code.",
    isActive: true
  }
];
