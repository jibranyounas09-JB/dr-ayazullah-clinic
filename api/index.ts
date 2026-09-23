// Vercel Serverless Entry Point for Dr. Ayazullah Clinic API
// Wraps the Express app import to catch and report errors

let app: any = null;
let importError: string | null = null;

try {
  // Dynamic import to catch module-level errors
  const serverModule = require("../server");
  app = serverModule.default || serverModule.app || serverModule;
} catch (err: any) {
  importError = err?.message || String(err);
  console.error("FATAL: Failed to import server.ts:", importError);
  console.error("Stack:", err?.stack);
}

export default function handler(req: any, res: any) {
  if (importError || !app) {
    return res.status(500).json({
      error: "Server module failed to load",
      details: importError,
      hint: "Check server.ts imports and module-level code"
    });
  }
  return app(req, res);
}
