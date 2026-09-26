export default async function handler(req: any, res: any) {
  try {
    const { neonPool } = await import('../src/server/neonDb.js');
    const dbCheck = await neonPool.query("SELECT NOW() as now");
    res.status(200).json({ 
      status: "ok", 
      database: "Neon PostgreSQL Connected",
      neonTime: dbCheck.rows[0].now,
      timestamp: new Date().toISOString() 
    });
  } catch (err: any) {
    res.status(200).json({ 
      error: "Failed to initialize health check", 
      details: err.message, 
      stack: err.stack 
    });
  }
}
