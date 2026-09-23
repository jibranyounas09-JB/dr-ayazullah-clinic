import express from "express";
import {
  initNeonDatabase,
  getDocuments,
  getDocument,
  setDocument,
  addDocument,
  deleteDocument,
  verifyAdmin,
  updateAdminPassword,
} from "../src/server/neonDb.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Admin Authentication against Neon
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

// Admin Password Reset against Neon
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

export default app;
