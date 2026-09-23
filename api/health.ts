import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonPool } from '../src/server/neonDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const dbCheck = await neonPool.query("SELECT NOW() as now");
    res.json({ 
      status: "ok", 
      database: "Neon PostgreSQL Connected",
      neonTime: dbCheck.rows[0].now,
      timestamp: new Date().toISOString() 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
