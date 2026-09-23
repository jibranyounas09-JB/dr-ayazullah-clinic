// Minimal test endpoint to verify Vercel serverless wiring
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ 
    ok: true, 
    message: "Vercel serverless is working",
    timestamp: new Date().toISOString()
  });
}
