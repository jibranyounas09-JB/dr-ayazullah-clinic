export default function handler(req: any, res: any) {
  res.status(200).json({ 
    ok: true, 
    message: "Vercel serverless is working",
    timestamp: new Date().toISOString()
  });
}
