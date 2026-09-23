export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import("../server");
    const app = serverModule.default || serverModule.app || serverModule;
    if (!app) {
      throw new Error("No app exported from server.ts");
    }
    return app(req, res);
  } catch (err: any) {
    console.error("FATAL: Failed to import server.ts:", err);
    return res.status(200).json({
      error: "Server module failed to load",
      details: err?.message || String(err),
      stack: err?.stack,
    });
  }
}
